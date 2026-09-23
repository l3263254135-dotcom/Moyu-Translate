#!/usr/bin/env python3
"""Publish local Git commits through GitHub's Git database API when Git HTTPS is unavailable."""

import base64
import json
import subprocess
import sys


def run(*args, data=None):
    result = subprocess.run(args, input=data, capture_output=True, check=True)
    return result.stdout.decode().strip()


def git(*args):
    return run("git", *args)


def api(method, endpoint, payload=None):
    command = ["gh", "api", "-X", method, endpoint]
    if payload is not None:
        command += ["--input", "-"]
    return json.loads(run(*command, data=json.dumps(payload).encode() if payload is not None else None))


def person(commit, role):
    return {
        "name": git("show", "-s", f"--format=%{role}n", commit),
        "email": git("show", "-s", f"--format=%{role}e", commit),
        "date": git("show", "-s", f"--format=%{role}I", commit),
    }


def main():
    owner, repo = sys.argv[1:3]
    base = f"repos/{owner}/{repo}/git"
    head = git("rev-parse", "HEAD")
    bootstrapped = False
    try:
        remote = api("GET", f"{base}/ref/heads/main")["object"]["sha"]
    except subprocess.CalledProcessError as error:
        if b"HTTP 404" not in error.stderr and b"HTTP 409" not in error.stderr:
            raise
        if api("GET", f"repos/{owner}/{repo}")["size"] != 0:
            raise SystemExit("Remote main is missing from a nonempty repository.")
        readme = subprocess.check_output(["git", "show", "HEAD:README.md"])
        api("PUT", f"repos/{owner}/{repo}/contents/README.md", {
            "message": "chore: initialize repository for API publishing",
            "content": base64.b64encode(readme).decode(), "branch": "main",
        })
        remote = api("GET", f"{base}/ref/heads/main")["object"]["sha"]
        bootstrapped = True

    previous_local = git("config", "--get", "publish.last-local") if git_config_exists() else None
    previous_remote = git("config", "--get", "publish.last-remote") if previous_local else None
    anchor = previous_local if previous_remote == remote else remote
    if remote and previous_remote and previous_remote != remote:
        raise SystemExit("Remote main changed since the last API publish; reconcile before publishing.")
    if remote and not anchor:
        raise SystemExit("Remote main must be reconciled before publishing.")
    if bootstrapped:
        commits = git("rev-list", "--reverse", head).splitlines()
    elif anchor:
        run("git", "merge-base", "--is-ancestor", anchor, head)
        commits = git("rev-list", "--reverse", f"{anchor}..{head}").splitlines()
    else:
        commits = git("rev-list", "--reverse", head).splitlines()
    if not commits:
        print("Remote main is already current.")
        return

    for commit in commits:
        entries = []
        for line in subprocess.check_output(["git", "ls-tree", "-rz", commit]).split(b"\0"):
            if not line:
                continue
            metadata, path = line.split(b"\t", 1)
            mode, kind, sha = metadata.decode().split()
            if kind != "blob":
                raise SystemExit(f"Unsupported Git entry {kind}: {path!r}")
            contents = subprocess.check_output(["git", "cat-file", "blob", sha])
            blob = api("POST", f"{base}/blobs", {
                "content": base64.b64encode(contents).decode(), "encoding": "base64"
            })["sha"]
            if blob != sha:
                raise SystemExit(f"Blob mismatch: {path!r}")
            entries.append({"path": path.decode(), "mode": mode, "type": "blob", "sha": blob})
        tree = api("POST", f"{base}/trees", {"tree": entries})["sha"]
        expected_tree = git("rev-parse", f"{commit}^{{tree}}")
        if tree != expected_tree:
            raise SystemExit(f"Tree mismatch: {commit} ({tree} != {expected_tree})")
        parents = [remote] if remote else []
        created = api("POST", f"{base}/commits", {
            "message": git("show", "-s", "--format=%B", commit),
            "tree": tree, "parents": parents,
            "author": person(commit, "a"), "committer": person(commit, "c"),
        })["sha"]
        if remote:
            api("PATCH", f"{base}/refs/heads/main", {"sha": created, "force": False})
        else:
            api("POST", f"{base}/refs", {"ref": "refs/heads/main", "sha": created})
        remote = created
        git("config", "publish.last-local", commit)
        git("config", "publish.last-remote", remote)
        if created == commit:
            git("update-ref", "refs/remotes/origin/main", commit)
        print(f"Published {commit[:12]} as {created[:12]}")

    actual = api("GET", f"{base}/ref/heads/main")["object"]["sha"]
    if actual != remote or api("GET", f"{base}/commits/{remote}")["tree"]["sha"] != git("rev-parse", "HEAD^{tree}"):
        raise SystemExit("Remote main verification failed.")


def git_config_exists():
    return subprocess.run(["git", "config", "--get", "publish.last-local"], capture_output=True).returncode == 0


if __name__ == "__main__":
    try:
        main()
    except subprocess.CalledProcessError as error:
        sys.stderr.buffer.write(error.stderr or b"Git or GitHub API command failed.\n")
        sys.exit(error.returncode)
