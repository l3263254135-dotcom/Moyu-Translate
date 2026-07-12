#!/usr/bin/env python3
"""Build a compact English-Chinese SQLite dictionary from a pinned ECDICT CSV."""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import re
import sqlite3
import subprocess
import sys
from pathlib import Path

COMMIT = "bc015ed2e24a7abef49fc6dbbb7fe32c1dadaf8b"
SOURCE_URL = "https://github.com/skywind3000/ECDICT.git"
WORD_PATTERN = re.compile(r"^[A-Za-z][A-Za-z' -]*$")
POS_PATTERN = re.compile(r"^([a-z]+\.)\s*(.*)$", re.IGNORECASE)
TAG_LABELS = {
    "ielts": "IELTS",
    "toefl": "TOEFL",
    "gre": "GRE",
    "cet4": "CET-4",
    "cet6": "CET-6",
    "ky": "考研",
    "gk": "高考",
    "zk": "中考",
}


def parse_rank(value: str | None) -> int | None:
    try:
        rank = int(value or "0")
    except ValueError:
        return None
    return rank if rank > 0 else None


def is_common(row: dict[str, str]) -> bool:
    ranks = [rank for rank in (parse_rank(row.get("bnc")), parse_rank(row.get("frq"))) if rank]
    tagged = row.get("oxford") == "1" or parse_rank(row.get("collins")) is not None
    return tagged or (bool(ranks) and min(ranks) <= 80_000)


def parse_meanings(translation: str) -> tuple[str | None, list[str]]:
    part_of_speech: str | None = None
    meanings: list[str] = []
    for raw_line in translation.replace("\\n", "\n").splitlines():
        line = raw_line.strip()
        if not line:
            continue
        match = POS_PATTERN.match(line)
        if match:
            part_of_speech = part_of_speech or match.group(1).lower()
            line = match.group(2).strip()
        for segment in re.split(r"[；;]", line):
            segment = segment.strip(" ，,。.")
            if segment and any("\u3400" <= char <= "\u9fff" for char in segment):
                if segment not in meanings:
                    meanings.append(segment)
            if len(meanings) >= 3:
                return part_of_speech, meanings
    return part_of_speech, meanings


def parse_tags(row: dict[str, str]) -> list[str]:
    tags: list[str] = []
    if row.get("oxford") == "1":
        tags.append("Oxford 3000")
    source_tags = set((row.get("tag") or "").lower().split())
    for key, label in TAG_LABELS.items():
        if key in source_tags:
            tags.append(label)
    return tags


def download(source: Path) -> str:
    source.parent.mkdir(parents=True, exist_ok=True)
    if source.name == "ecdict.mini.csv" and source.exists():
        digest = hashlib.sha256(source.read_bytes()).hexdigest()
        print(f"ECDICT mini source SHA-256: {digest}")
        return digest
    if not source.exists() or source.stat().st_size < 1_000_000:
        source.unlink(missing_ok=True)
        repository = source.parent / "ecdict-repo"
        if not repository.exists():
            subprocess.run(["git", "init", "-q", str(repository)], check=True)
            subprocess.run(["git", "-C", str(repository), "remote", "add", "origin", SOURCE_URL], check=True)
        print(f"Downloading pinned ECDICT source from commit {COMMIT}")
        subprocess.run(
            [
                "git", "-C", str(repository), "-c", "protocol.version=2", "-c", "http.version=HTTP/1.1",
                "fetch", "--depth=1", "--filter=blob:none", "origin", COMMIT,
            ],
            check=True,
        )
        partial = source.with_suffix(".csv.part")
        with partial.open("wb") as output:
            subprocess.run(
                ["git", "-C", str(repository), "-c", "http.version=HTTP/1.1", "show", f"FETCH_HEAD:ecdict.csv"],
                stdout=output,
                check=True,
            )
        partial.replace(source)
    digest = hashlib.sha256(source.read_bytes()).hexdigest()
    print(f"ECDICT source SHA-256: {digest}")
    return digest


def build(source: Path, output: Path, digest_file: Path, fallback_file: Path) -> int:
    digest = download(source)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.unlink(missing_ok=True)
    connection = sqlite3.connect(output)
    connection.execute("PRAGMA journal_mode=OFF")
    connection.execute("PRAGMA synchronous=OFF")
    connection.execute("PRAGMA temp_store=MEMORY")
    connection.execute(
        "CREATE TABLE entries (word TEXT PRIMARY KEY, part_of_speech TEXT, meanings TEXT NOT NULL, tags TEXT NOT NULL) WITHOUT ROWID"
    )

    inserted = 0
    batch: list[tuple[str, str | None, str, str]] = []
    csv.field_size_limit(sys.maxsize)
    with source.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            word = (row.get("word") or "").strip().lower()
            if not WORD_PATTERN.fullmatch(word) or (not is_common(row) and source.name != "ecdict.mini.csv"):
                continue
            part_of_speech, meanings = parse_meanings(row.get("translation") or "")
            if not meanings:
                continue
            batch.append(
                (
                    word,
                    part_of_speech,
                    json.dumps(meanings, ensure_ascii=False, separators=(",", ":")),
                    json.dumps(parse_tags(row), ensure_ascii=False, separators=(",", ":")),
                )
            )
            if len(batch) >= 2_000:
                connection.executemany("INSERT OR REPLACE INTO entries VALUES (?, ?, ?, ?)", batch)
                inserted += len(batch)
                batch.clear()

    if batch:
        connection.executemany("INSERT OR REPLACE INTO entries VALUES (?, ?, ?, ?)", batch)
        inserted += len(batch)

    if fallback_file.exists():
        fallback_entries = json.loads(fallback_file.read_text(encoding="utf-8"))
        fallback_rows = [
            (
                entry["word"].strip().lower(),
                entry.get("partOfSpeech"),
                json.dumps(entry["meanings"][:3], ensure_ascii=False, separators=(",", ":")),
                json.dumps(entry.get("tags", []), ensure_ascii=False, separators=(",", ":")),
            )
            for entry in fallback_entries
            if entry.get("word") and entry.get("meanings")
        ]
        connection.executemany(
            """
            INSERT INTO entries VALUES (?, ?, ?, ?)
            ON CONFLICT(word) DO UPDATE SET
                part_of_speech = excluded.part_of_speech,
                meanings = excluded.meanings
            """,
            fallback_rows,
        )
        inserted += len(fallback_rows)
    connection.commit()
    unique_entries = connection.execute("SELECT count(*) FROM entries").fetchone()[0]
    connection.execute("VACUUM")
    connection.close()

    digest_file.write_text(
        f"ECDICT commit: {COMMIT}\nSource SHA-256: {digest}\nEntries: {unique_entries}\n",
        encoding="utf-8",
    )
    print(f"Wrote {unique_entries} unique entries to {output}")
    return unique_entries


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, default=Path("tmp/ecdict.csv"))
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("Sources/MoyuTranslate/Resources/dictionary.sqlite"),
    )
    parser.add_argument(
        "--digest-file",
        type=Path,
        default=Path("Sources/MoyuTranslate/Resources/ECDICT_SOURCE.txt"),
    )
    parser.add_argument(
        "--fallback-file",
        type=Path,
        default=Path("Sources/MoyuTranslate/Resources/fallback_dictionary.json"),
    )
    args = parser.parse_args()
    build(args.source, args.output, args.digest_file, args.fallback_file)


if __name__ == "__main__":
    main()
