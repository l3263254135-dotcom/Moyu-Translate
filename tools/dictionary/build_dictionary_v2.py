#!/usr/bin/env python3
"""Build Moyu Dictionary v2 from pinned open dictionary sources."""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import re
import sqlite3
import tarfile
import urllib.request
from collections import defaultdict
from dataclasses import dataclass, field
from pathlib import Path
from typing import Iterable

ECDICT_COMMIT = "bc015ed2e24a7abef49fc6dbbb7fe32c1dadaf8b"
ECDICT_URL = f"https://raw.githubusercontent.com/skywind3000/ECDICT/{ECDICT_COMMIT}/ecdict.csv"
WORDNET_URL = "https://wordnetcode.princeton.edu/wn3.1.dict.tar.gz"
CMUDICT_COMMIT = "74790861f652b15e4ac49015a90074ad62a27690"
CMUDICT_URL = f"https://raw.githubusercontent.com/cmusphinx/cmudict/{CMUDICT_COMMIT}/cmudict.dict"

WORD_PATTERN = re.compile(r"^[A-Za-z][A-Za-z' -]{0,79}$")
POS_PATTERN = re.compile(r"^(n|v|vt|vi|a|adj|ad|adv|prep|pron|conj|num|art|int|aux)\.\s*(.*)$", re.IGNORECASE)
DOMAIN_PATTERN = re.compile(r"^\[([^\]]{1,8})\]\s*(.*)$")
ZH_PATTERN = re.compile(r"[\u3400-\u9fff]")
EXAMPLE_PATTERN = re.compile(r'"([^"]{8,240})"')

POS_LABELS = {
    "n": "n.", "v": "v.", "vt": "vt.", "vi": "vi.", "a": "adj.", "adj": "adj.",
    "ad": "adv.", "adv": "adv.", "prep": "prep.", "pron": "pron.", "conj": "conj.",
    "num": "num.", "art": "art.", "int": "int.", "aux": "aux.",
}
DOMAIN_LABELS = {
    "计": "计算机", "医": "医学", "经": "经济", "法": "法律", "化": "化学", "生": "生物",
    "物": "物理", "数": "数学", "地质": "地质", "网络": "网络释义",
}
TAG_LABELS = {
    "ielts": "IELTS", "toefl": "TOEFL", "gre": "GRE", "cet4": "CET-4", "cet6": "CET-6",
    "ky": "考研", "gk": "高考", "zk": "中考",
}
FORM_LABELS = {
    "s": "复数", "p": "过去式", "d": "过去分词", "i": "现在分词", "3": "第三人称单数",
    "r": "比较级", "t": "最高级",
}

ARPABET = {
    "AA": "ɑ", "AE": "æ", "AH": "ʌ", "AO": "ɔ", "AW": "aʊ", "AY": "aɪ", "EH": "ɛ",
    "ER": "ɝ", "EY": "eɪ", "IH": "ɪ", "IY": "i", "OW": "oʊ", "OY": "ɔɪ", "UH": "ʊ",
    "UW": "u", "B": "b", "CH": "tʃ", "D": "d", "DH": "ð", "F": "f", "G": "ɡ", "HH": "h",
    "JH": "dʒ", "K": "k", "L": "l", "M": "m", "N": "n", "NG": "ŋ", "P": "p", "R": "r",
    "S": "s", "SH": "ʃ", "T": "t", "TH": "θ", "V": "v", "W": "w", "Y": "j", "Z": "z", "ZH": "ʒ",
}


@dataclass
class Sense:
    pos: str
    meanings: list[str]
    domain: str | None = None
    source: str = "ECDICT"


@dataclass
class Candidate:
    word: str
    normalized: str
    phonetic: str | None
    senses: list[Sense]
    tags: list[str]
    forms: list[tuple[str, str]]
    score: int
    frequency_rank: int | None
    english_definition: str | None


@dataclass
class WordNetRecord:
    synonyms: set[str] = field(default_factory=set)
    antonyms: set[str] = field(default_factory=set)
    examples: list[str] = field(default_factory=list)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def download(url: str, destination: Path, minimum_bytes: int) -> None:
    if destination.exists() and destination.stat().st_size >= minimum_bytes:
        return
    destination.parent.mkdir(parents=True, exist_ok=True)
    partial = destination.with_suffix(destination.suffix + ".part")
    request = urllib.request.Request(url, headers={"User-Agent": "MoyuTranslateDictionaryBuilder/0.2"})
    with urllib.request.urlopen(request, timeout=120) as response, partial.open("wb") as output:
        while chunk := response.read(1024 * 1024):
            output.write(chunk)
    partial.replace(destination)


def parse_rank(value: str | None) -> int | None:
    try:
        rank = int(value or "0")
    except ValueError:
        return None
    return rank if rank > 0 else None


def normalize_word(value: str) -> str:
    return re.sub(r"\s+", " ", value.strip().lower().replace("’", "'"))


def clean_meaning(value: str) -> str:
    value = value.strip(" ，,。.;；")
    value = re.sub(r"\s+", " ", value)
    value = value.replace("...", "…")
    return value


def parse_senses(translation: str) -> list[Sense]:
    grouped: dict[tuple[str, str | None], list[str]] = {}
    order: list[tuple[str, str | None]] = []
    current_pos = "other"
    for raw_line in translation.replace("\\n", "\n").splitlines():
        line = raw_line.strip()
        if not line:
            continue
        pos_match = POS_PATTERN.match(line)
        if pos_match:
            current_pos = POS_LABELS.get(pos_match.group(1).lower(), f"{pos_match.group(1).lower()}.")
            line = pos_match.group(2).strip()
        domain = None
        domain_match = DOMAIN_PATTERN.match(line)
        if domain_match:
            domain = DOMAIN_LABELS.get(domain_match.group(1), domain_match.group(1))
            line = domain_match.group(2).strip()
            if domain == "网络释义":
                continue
        key = (current_pos, domain)
        if key not in grouped:
            grouped[key] = []
            order.append(key)
        for segment in re.split(r"[；;]", line):
            meaning = clean_meaning(segment)
            if meaning and ZH_PATTERN.search(meaning) and meaning not in grouped[key]:
                grouped[key].append(meaning)
            if len(grouped[key]) >= 6:
                break
    return [Sense(pos=pos, meanings=grouped[(pos, domain)], domain=domain) for pos, domain in order if grouped[(pos, domain)]][:6]


def parse_tags(row: dict[str, str]) -> list[str]:
    labels: list[str] = []
    if row.get("oxford") == "1":
        labels.append("Oxford 3000")
    source_tags = set((row.get("tag") or "").lower().split())
    for key, label in TAG_LABELS.items():
        if key in source_tags:
            labels.append(label)
    return labels


def parse_forms(exchange: str) -> list[tuple[str, str]]:
    forms: list[tuple[str, str]] = []
    for item in exchange.split("/"):
        if ":" not in item:
            continue
        code, value = item.split(":", 1)
        label = FORM_LABELS.get(code)
        value = normalize_word(value)
        if label and value and (label, value) not in forms:
            forms.append((label, value))
    return forms[:8]


def quality_score(row: dict[str, str], senses: list[Sense]) -> tuple[int, int | None]:
    bnc = parse_rank(row.get("bnc"))
    frq = parse_rank(row.get("frq"))
    frequency = min([rank for rank in (bnc, frq) if rank], default=None)
    score = 0
    if row.get("oxford") == "1": score += 180_000
    collins = parse_rank(row.get("collins"))
    if collins: score += max(10_000, 120_000 - collins * 8_000)
    score += len(parse_tags(row)) * 18_000
    if frequency: score += max(0, 150_000 - frequency)
    if row.get("definition"): score += 2_500
    score += min(sum(len(sense.meanings) for sense in senses), 12) * 750
    word = normalize_word(row.get("word") or "")
    score += max(0, 40 - len(word)) * 25
    if " " in word: score -= word.count(" ") * 1_500
    if any(char.isupper() for char in (row.get("word") or "")[1:]): score -= 8_000
    return score, frequency


def read_ecdict(path: Path, limit: int) -> list[Candidate]:
    candidates: list[Candidate] = []
    csv.field_size_limit(32 * 1024 * 1024)
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        for row in csv.DictReader(handle):
            word = (row.get("word") or "").strip()
            normalized = normalize_word(word)
            if not WORD_PATTERN.fullmatch(word) or len(normalized.split()) > 4:
                continue
            senses = parse_senses(row.get("translation") or "")
            if not senses:
                continue
            score, frequency = quality_score(row, senses)
            candidates.append(Candidate(
                word=word,
                normalized=normalized,
                phonetic=(row.get("phonetic") or "").strip() or None,
                senses=senses,
                tags=parse_tags(row),
                forms=parse_forms(row.get("exchange") or ""),
                score=score,
                frequency_rank=frequency,
                english_definition=(row.get("definition") or "").strip() or None,
            ))
    candidates.sort(key=lambda item: (-item.score, item.frequency_rank or 10**9, len(item.normalized), item.normalized))
    selected: dict[str, Candidate] = {}
    for candidate in candidates:
        selected.setdefault(candidate.normalized, candidate)
        if len(selected) >= limit:
            break
    return list(selected.values())


def apply_corrections(candidates: list[Candidate], correction_path: Path) -> None:
    if not correction_path.exists():
        return
    by_word = {candidate.normalized: candidate for candidate in candidates}
    for entry in json.loads(correction_path.read_text(encoding="utf-8")):
        candidate = by_word.get(normalize_word(entry.get("word", "")))
        if not candidate or not entry.get("meanings"):
            continue
        candidate.senses = [Sense(pos=entry.get("partOfSpeech") or "other", meanings=entry["meanings"][:6], source="Moyu corrections")]


def arpabet_to_ipa(phonemes: Iterable[str]) -> str:
    result: list[str] = []
    for phoneme in phonemes:
        match = re.fullmatch(r"([A-Z]+)([012]?)", phoneme)
        if not match:
            continue
        base, stress = match.groups()
        sound = ARPABET.get(base, "")
        if base == "AH" and stress == "0": sound = "ə"
        if base == "ER" and stress == "0": sound = "ɚ"
        if stress == "1": sound = "ˈ" + sound
        elif stress == "2": sound = "ˌ" + sound
        result.append(sound)
    return "".join(result)


def read_cmudict(path: Path) -> dict[str, str]:
    if not path.exists():
        return {}
    pronunciations: dict[str, str] = {}
    with path.open("r", encoding="utf-8", errors="ignore") as handle:
        for line in handle:
            if not line.strip() or line.startswith(";;; "):
                continue
            parts = line.strip().split()
            if len(parts) < 2:
                continue
            word = re.sub(r"\(\d+\)$", "", parts[0].lower())
            pronunciations.setdefault(word, arpabet_to_ipa(parts[1:]))
    return pronunciations


def ensure_wordnet(archive: Path, destination: Path) -> Path | None:
    dictionary = destination / "dict"
    if dictionary.exists():
        return dictionary
    try:
        download(WORDNET_URL, archive, 5_000_000)
        destination.mkdir(parents=True, exist_ok=True)
        with tarfile.open(archive) as tar:
            safe_members = [member for member in tar.getmembers() if ".." not in Path(member.name).parts]
            tar.extractall(destination, members=safe_members)
        candidates = list(destination.glob("**/dict/data.noun"))
        return candidates[0].parent if candidates else None
    except Exception as error:
        print(f"WordNet unavailable: {error}")
        return None


def read_wordnet(dictionary: Path | None, selected_words: set[str]) -> dict[str, WordNetRecord]:
    if dictionary is None:
        return {}
    records: dict[str, WordNetRecord] = defaultdict(WordNetRecord)
    synsets: dict[tuple[str, str], tuple[list[str], list[tuple[str, str]], list[str]]] = {}
    pos_map = {"noun": "n", "verb": "v", "adj": "a", "adv": "r"}
    for filename, pos in pos_map.items():
        path = dictionary / f"data.{filename}"
        if not path.exists():
            continue
        with path.open("r", encoding="utf-8", errors="ignore") as handle:
            for line in handle:
                if not line or line[0].isspace() or " | " not in line:
                    continue
                data, gloss = line.rstrip().split(" | ", 1)
                fields = data.split()
                try:
                    offset, synset_type = fields[0], fields[2]
                    word_count = int(fields[3], 16)
                    cursor = 4
                    words = [normalize_word(fields[cursor + index * 2].replace("_", " ")) for index in range(word_count)]
                    cursor += word_count * 2
                    pointer_count = int(fields[cursor]); cursor += 1
                    antonyms: list[tuple[str, str]] = []
                    for _ in range(pointer_count):
                        symbol, target_offset, target_pos = fields[cursor], fields[cursor + 1], fields[cursor + 2]
                        if symbol == "!": antonyms.append((target_offset, target_pos))
                        cursor += 4
                    examples = EXAMPLE_PATTERN.findall(gloss)
                    synsets[(offset, synset_type or pos)] = (words, antonyms, examples)
                except (IndexError, ValueError):
                    continue
    for (offset, pos), (words, antonyms, examples) in synsets.items():
        matching = [word for word in words if word in selected_words]
        if not matching:
            continue
        for word in matching:
            record = records[word]
            record.synonyms.update(other for other in words if other != word and len(other) <= 48)
            for target_offset, target_pos in antonyms:
                target = synsets.get((target_offset, target_pos))
                if target: record.antonyms.update(target[0])
            for example in examples:
                if example not in record.examples: record.examples.append(example)
    return records


SCHEMA = """
PRAGMA journal_mode=OFF;
PRAGMA synchronous=OFF;
PRAGMA temp_store=MEMORY;
CREATE TABLE metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL) WITHOUT ROWID;
CREATE TABLE entries (
  id INTEGER PRIMARY KEY,
  headword TEXT NOT NULL,
  normalized TEXT NOT NULL UNIQUE,
  primary_meaning TEXT NOT NULL,
  quality_score INTEGER NOT NULL,
  frequency_rank INTEGER
);
CREATE INDEX entries_frequency ON entries(frequency_rank) WHERE frequency_rank IS NOT NULL;
CREATE TABLE pronunciations (entry_id INTEGER NOT NULL, locale TEXT NOT NULL, ipa TEXT NOT NULL, source TEXT NOT NULL, priority INTEGER NOT NULL, UNIQUE(entry_id, locale, ipa));
CREATE TABLE senses (id INTEGER PRIMARY KEY, entry_id INTEGER NOT NULL, part_of_speech TEXT NOT NULL, meanings TEXT NOT NULL, frequency_rank INTEGER, domain TEXT, register TEXT, source TEXT NOT NULL, priority INTEGER NOT NULL);
CREATE INDEX senses_entry ON senses(entry_id, priority);
CREATE TABLE forms (entry_id INTEGER NOT NULL, label TEXT NOT NULL, value TEXT NOT NULL, priority INTEGER NOT NULL, UNIQUE(entry_id, label, value));
CREATE INDEX forms_value ON forms(value);
CREATE TABLE tags (entry_id INTEGER NOT NULL, tag TEXT NOT NULL, priority INTEGER NOT NULL, UNIQUE(entry_id, tag));
CREATE TABLE examples (id INTEGER PRIMARY KEY, entry_id INTEGER NOT NULL, english TEXT NOT NULL, chinese TEXT, chinese_provider TEXT, source TEXT NOT NULL, priority INTEGER NOT NULL);
CREATE TABLE relations (entry_id INTEGER NOT NULL, relation_type TEXT NOT NULL, words TEXT NOT NULL, source TEXT NOT NULL, UNIQUE(entry_id, relation_type));
CREATE VIRTUAL TABLE entries_fts USING fts5(headword, normalized, content='entries', content_rowid='id', tokenize='unicode61 remove_diacritics 2');
"""


def write_database(output: Path, candidates: list[Candidate], cmu: dict[str, str], wordnet: dict[str, WordNetRecord], source_digest: str) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    output.unlink(missing_ok=True)
    connection = sqlite3.connect(output)
    connection.executescript(SCHEMA)
    metadata = {
        "formatVersion": "2",
        "ecdictCommit": ECDICT_COMMIT,
        "ecdictSha256": source_digest,
        "entryCount": str(len(candidates)),
        "generatedBy": "tools/dictionary/build_dictionary_v2.py",
    }
    connection.executemany("INSERT INTO metadata VALUES(?, ?)", metadata.items())
    sense_id = 1
    example_id = 1
    for entry_id, candidate in enumerate(candidates, start=1):
        primary = candidate.senses[0].meanings[0]
        connection.execute("INSERT INTO entries VALUES(?, ?, ?, ?, ?, ?)", (entry_id, candidate.word, candidate.normalized, primary, candidate.score, candidate.frequency_rank))
        connection.execute("INSERT INTO entries_fts(rowid, headword, normalized) VALUES(?, ?, ?)", (entry_id, candidate.word, candidate.normalized))
        if candidate.phonetic:
            connection.execute("INSERT OR IGNORE INTO pronunciations VALUES(?, 'general', ?, 'ECDICT', 0)", (entry_id, candidate.phonetic))
        if us_ipa := cmu.get(candidate.normalized):
            connection.execute("INSERT OR IGNORE INTO pronunciations VALUES(?, 'en-US', ?, 'CMUdict', 1)", (entry_id, us_ipa))
        for priority, sense in enumerate(candidate.senses):
            connection.execute("INSERT INTO senses VALUES(?, ?, ?, ?, ?, ?, NULL, ?, ?)", (
                sense_id, entry_id, sense.pos, json.dumps(sense.meanings, ensure_ascii=False, separators=(",", ":")),
                candidate.frequency_rank, sense.domain, sense.source, priority,
            ))
            sense_id += 1
        for priority, (label, value) in enumerate(candidate.forms):
            connection.execute("INSERT OR IGNORE INTO forms VALUES(?, ?, ?, ?)", (entry_id, label, value, priority))
        for priority, tag in enumerate(candidate.tags):
            connection.execute("INSERT OR IGNORE INTO tags VALUES(?, ?, ?)", (entry_id, tag, priority))
        if record := wordnet.get(candidate.normalized):
            for priority, example in enumerate(record.examples[:3]):
                connection.execute("INSERT INTO examples VALUES(?, ?, ?, NULL, NULL, 'WordNet', ?)", (example_id, entry_id, example, priority))
                example_id += 1
            if record.synonyms:
                connection.execute("INSERT INTO relations VALUES(?, 'synonym', ?, 'WordNet')", (entry_id, json.dumps(sorted(record.synonyms)[:16], ensure_ascii=False)))
            if record.antonyms:
                connection.execute("INSERT INTO relations VALUES(?, 'antonym', ?, 'WordNet')", (entry_id, json.dumps(sorted(record.antonyms)[:12], ensure_ascii=False)))
    connection.commit()
    connection.execute("ANALYZE")
    connection.execute("VACUUM")
    integrity = connection.execute("PRAGMA integrity_check").fetchone()[0]
    if integrity != "ok":
        raise RuntimeError(f"SQLite integrity check failed: {integrity}")
    connection.close()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--ecdict", type=Path, default=Path("tmp/ecdict.full.csv"))
    parser.add_argument("--cmudict", type=Path, default=Path("tmp/cmudict.dict"))
    parser.add_argument("--wordnet-archive", type=Path, default=Path("tmp/wn3.1.dict.tar.gz"))
    parser.add_argument("--wordnet-dir", type=Path, default=Path("tmp/wordnet-3.1"))
    parser.add_argument("--corrections", type=Path, default=Path("Sources/MoyuTranslate/Resources/fallback_dictionary.json"))
    parser.add_argument("--output", type=Path, default=Path("apps/desktop/src-tauri/resources/dictionary-v2.sqlite"))
    parser.add_argument("--limit", type=int, default=250_000)
    parser.add_argument("--skip-downloads", action="store_true")
    args = parser.parse_args()

    if not args.ecdict.exists():
        download(ECDICT_URL, args.ecdict, 50_000_000)
    if not args.skip_downloads:
        try: download(CMUDICT_URL, args.cmudict, 2_000_000)
        except Exception as error: print(f"CMUdict unavailable: {error}")
    candidates = read_ecdict(args.ecdict, args.limit)
    apply_corrections(candidates, args.corrections)
    cmu = read_cmudict(args.cmudict)
    wordnet_dir = None if args.skip_downloads else ensure_wordnet(args.wordnet_archive, args.wordnet_dir)
    wordnet = read_wordnet(wordnet_dir, {candidate.normalized for candidate in candidates})
    digest = sha256(args.ecdict)
    write_database(args.output, candidates, cmu, wordnet, digest)
    print(json.dumps({
        "output": str(args.output),
        "entries": len(candidates),
        "cmuPronunciations": len(cmu),
        "wordNetMatches": len(wordnet),
        "bytes": args.output.stat().st_size,
        "sha256": sha256(args.output),
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
