#!/usr/bin/env bash
set -euo pipefail

usage() {
  printf 'Usage: %s <research-knowledge-onramp|handoff|research-paper-workflow|Moyu-Translate> [--dry-run] [--message "commit message"]\n' "$0" >&2
  exit 2
}

[[ $# -ge 1 ]] || usage
project=$1
shift
dry_run=0
message=
while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) dry_run=1; shift ;;
    --message) [[ $# -ge 2 && -n "$2" ]] || usage; message=$2; shift 2 ;;
    *) usage ;;
  esac
done

case "$project" in
  research-knowledge-onramp|handoff|research-paper-workflow) kind=plugin ;;
  Moyu-Translate) kind=app ;;
  *) usage ;;
esac

script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
projects_dir=$(cd -- "$script_dir/../.." && pwd)
if [[ "$kind" == plugin ]]; then
  source_dir="$HOME/plugins/$project"
  repo_dir="$projects_dir/$project"
  plugin_dir="$repo_dir/plugins/$project"
  [[ -f "$source_dir/.codex-plugin/plugin.json" && -d "$plugin_dir" ]] || {
    printf 'Plugin source or repository target is missing: %s, %s\n' "$source_dir" "$plugin_dir" >&2
    exit 1
  }
  python3 "$HOME/.codex/skills/.system/plugin-creator/scripts/validate_plugin.py" "$source_dir"
else
  repo_dir="$projects_dir/Moyu Translate"
fi

[[ -d "$repo_dir/.git" ]] || { printf 'Not a Git checkout: %s\n' "$repo_dir" >&2; exit 1; }
branch=$(git -C "$repo_dir" branch --show-current)
[[ "$branch" == main ]] || { printf 'Publish from main only (current: %s)\n' "$branch" >&2; exit 1; }
expected="https://github.com/l3263254135-dotcom/$project.git"
actual=$(git -C "$repo_dir" remote get-url origin)
[[ "$actual" == "$expected" ]] || { printf 'Unexpected origin: %s\n' "$actual" >&2; exit 1; }
gh auth status >/dev/null 2>&1 || { printf 'GitHub CLI login required: gh auth login\n' >&2; exit 1; }

scan() {
  local target=$1
  local hits
  hits=$(rg --hidden -n -I \
    --glob '!.git/**' --glob '!node_modules/**' --glob '!dist/**' \
    --glob '!*.png' --glob '!*.jpg' --glob '!*.pdf' \
    --glob '!*.sqlite' --glob '!*.icns' --glob '!**/scripts/publish-project.sh' \
    '(/Users/[^/[:space:]]+/|/home/[^/[:space:]]+/|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|BEGIN (RSA |OPENSSH |EC )?PRIVATE KEY)' \
    "$target") || {
      local code=$?
      [[ "$code" == 1 ]] || return "$code"
      hits=
    }
  if [[ -n "$hits" ]]; then
    printf 'Potential private paths or credentials found in %s:\n%s\n' "$target" "$hits" >&2
    return 1
  fi
}

[[ "$kind" == plugin ]] && scan "$source_dir"
scan "$repo_dir"
git -C "$repo_dir" diff --check
git -C "$repo_dir" diff --cached --check
remote_head=$(gh api "repos/l3263254135-dotcom/$project/git/ref/heads/main" --jq '.object.sha' 2>/dev/null) || remote_head=
if [[ -z "$remote_head" ]]; then
  [[ "$(gh api "repos/l3263254135-dotcom/$project" --jq '.size')" == 0 ]] || {
    printf 'Remote main is unavailable in a nonempty repository.\n' >&2
    exit 1
  }
fi
if [[ -n "$remote_head" ]]; then
  published_local=$(git -C "$repo_dir" config --get publish.last-local || true)
  published_remote=$(git -C "$repo_dir" config --get publish.last-remote || true)
  if [[ -n "$published_remote" && "$published_remote" != "$remote_head" ]]; then
    printf 'Remote main changed since the last publish; reconcile it before publishing.\n' >&2
    exit 1
  fi
  anchor=$remote_head
  [[ -n "$published_local" ]] && anchor=$published_local
  git -C "$repo_dir" merge-base --is-ancestor "$anchor" HEAD || {
    printf 'Local main is behind or diverged from remote main; reconcile it before publishing.\n' >&2
    exit 1
  }
fi

if [[ "$kind" == plugin ]]; then
  changes=$(rsync -ain --delete --exclude='.DS_Store' --exclude='.git/' "$source_dir/" "$plugin_dir/")
  if [[ "$dry_run" == 1 ]]; then
    printf 'Source: %s\nRepository: %s\n' "$source_dir" "$repo_dir"
    [[ -z "$changes" ]] || printf 'Plugin differences:\n%s\n' "$changes"
    git -C "$repo_dir" status --short
    exit 0
  fi
  if [[ -n "$changes" ]]; then
    python3 "$HOME/.codex/skills/.system/plugin-creator/scripts/update_plugin_cachebuster.py" "$source_dir"
    rsync -a --delete --exclude='.DS_Store' --exclude='.git/' "$source_dir/" "$plugin_dir/"
    python3 "$HOME/.codex/skills/.system/plugin-creator/scripts/validate_plugin.py" "$plugin_dir"
  fi
else
  if [[ "$dry_run" == 1 ]]; then
    printf 'Repository: %s\n' "$repo_dir"
    git -C "$repo_dir" status --short
    exit 0
  fi
fi

scan "$repo_dir"
git -C "$repo_dir" add -A
git -C "$repo_dir" diff --cached --check
if ! git -C "$repo_dir" diff --cached --quiet; then
  [[ -n "$message" ]] || message="chore: publish $project update"
  git -C "$repo_dir" commit -m "$message"
fi
if [[ -n "$remote_head" && "$remote_head" == "$(git -C "$repo_dir" rev-parse HEAD)" ]]; then
  printf 'No changes to publish for %s.\n' "$project"
else
  (cd "$repo_dir" && python3 "$script_dir/push-via-api.py" l3263254135-dotcom "$project")
fi
if [[ "$kind" == plugin && -n "$changes" ]]; then
  codex plugin add "$project@personal"
  printf 'Open a new Codex task to use the updated plugin.\n'
fi
printf 'Published %s: %s\n' "$project" "$(git -C "$repo_dir" rev-parse --short HEAD)"
