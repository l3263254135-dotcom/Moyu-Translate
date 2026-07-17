use std::{path::Path, time::Instant};

use anyhow::{Context, Result};
use rusqlite::{params, Connection, OptionalExtension};

use crate::models::{
    DictionaryExample, DictionarySense, DictionarySourceInfo, Pronunciation, TranslationResult,
    WordForm, WordRelation,
};

pub struct DictionaryStore {
    connection: Option<Connection>,
}

impl DictionaryStore {
    pub fn open(path: &Path) -> Self {
        let connection =
            Connection::open_with_flags(path, rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY).ok();
        Self { connection }
    }

    pub fn unavailable() -> Self {
        Self { connection: None }
    }

    pub fn lookup(&self, input: &str) -> Result<Option<TranslationResult>> {
        let started = Instant::now();
        let Some(connection) = &self.connection else {
            return Ok(None);
        };
        let normalized = normalize_word(input);
        let entry = connection
            .query_row(
                "SELECT id, headword, primary_meaning FROM entries WHERE normalized = ?1 LIMIT 1",
                params![normalized],
                |row| {
                    Ok((
                        row.get::<_, i64>(0)?,
                        row.get::<_, String>(1)?,
                        row.get::<_, String>(2)?,
                    ))
                },
            )
            .optional()
            .context("query dictionary entry")?;
        let entry = match entry {
            Some(entry) => Some(entry),
            None => connection
                .query_row(
                    "SELECT e.id, e.headword, e.primary_meaning
                     FROM forms f JOIN entries e ON e.id = f.entry_id
                     WHERE lower(f.value) = ?1 LIMIT 1",
                    params![normalized],
                    |row| {
                        Ok((
                            row.get::<_, i64>(0)?,
                            row.get::<_, String>(1)?,
                            row.get::<_, String>(2)?,
                        ))
                    },
                )
                .optional()
                .context("query dictionary word form")?,
        };
        let Some((entry_id, headword, primary_text)) = entry else {
            return Ok(None);
        };

        let pronunciations = query_pronunciations(connection, entry_id)?;
        let senses = query_senses(connection, entry_id)?;
        let forms = query_forms(connection, entry_id)?;
        let examples = query_examples(connection, entry_id)?;
        let relations = query_relations(connection, entry_id)?;
        let vocabulary_tags = query_strings(
            connection,
            "SELECT tag FROM tags WHERE entry_id = ?1 ORDER BY priority, tag",
            entry_id,
        )?;
        let sources = vec![
            DictionarySourceInfo {
                id: "ecdict".into(),
                title: "ECDICT".into(),
                detail: Some("开放英汉词典".into()),
                platform_only: None,
            },
            DictionarySourceInfo {
                id: "wordnet".into(),
                title: "WordNet".into(),
                detail: Some("词义关系与例句".into()),
                platform_only: None,
            },
        ];

        Ok(Some(TranslationResult {
            source_text: input.to_string(),
            primary_text,
            headword: Some(headword),
            pronunciations,
            senses,
            forms,
            examples,
            relations,
            vocabulary_tags,
            sources,
            provider: "Moyu 离线词典".into(),
            latency_milliseconds: started.elapsed().as_millis(),
        }))
    }

    pub fn search(&self, query: &str, limit: usize) -> Result<Vec<String>> {
        let Some(connection) = &self.connection else {
            return Ok(Vec::new());
        };
        let escaped = query
            .chars()
            .filter(|character| character.is_ascii_alphanumeric() || *character == '\'')
            .collect::<String>()
            .to_lowercase();
        if escaped.is_empty() {
            return Ok(Vec::new());
        }
        let mut statement = connection.prepare(
            "SELECT e.headword FROM entries_fts f JOIN entries e ON e.id = f.rowid WHERE entries_fts MATCH ?1 ORDER BY rank LIMIT ?2",
        )?;
        let rows = statement
            .query_map(params![format!("\"{}\"*", escaped), limit as i64], |row| {
                row.get(0)
            })?;
        let prefix_matches: Vec<String> = rows.filter_map(Result::ok).collect();
        if !prefix_matches.is_empty() {
            return Ok(prefix_matches);
        }

        let first = escaped.chars().next().expect("checked non-empty");
        let query_length = escaped.chars().count() as i64;
        let mut statement = connection.prepare(
            "SELECT headword, normalized, COALESCE(frequency_rank, 999999)
             FROM entries
             WHERE normalized GLOB ?1 AND length(normalized) BETWEEN ?2 AND ?3
             ORDER BY frequency_rank IS NULL, frequency_rank
             LIMIT 2500",
        )?;
        let rows = statement.query_map(
            params![
                format!("{}*", first),
                (query_length - 2).max(1),
                query_length + 2
            ],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, i64>(2)?,
                ))
            },
        )?;
        let mut approximate = rows
            .filter_map(Result::ok)
            .filter_map(|(headword, normalized, rank)| {
                let distance = edit_distance(&escaped, &normalized);
                (distance <= 2).then_some((distance, rank, headword))
            })
            .collect::<Vec<_>>();
        approximate.sort_by(|left, right| left.cmp(right));
        approximate.truncate(limit);
        Ok(approximate.into_iter().map(|(_, _, word)| word).collect())
    }

    pub fn is_reviewable_term(&self, input: &str) -> Result<bool> {
        let Some(connection) = &self.connection else {
            return Ok(false);
        };
        let normalized = normalize_term(input);
        if !is_basic_vocabulary_term(&normalized) {
            return Ok(false);
        }
        let words = normalized.split(' ').collect::<Vec<_>>();
        if words.len() == 1 {
            return Ok(true);
        }
        if looks_like_personal_clause(&words) || contains_finite_auxiliary(&words) {
            return Ok(false);
        }
        let original_words = input.split_whitespace().collect::<Vec<_>>();
        for index in 1..words.len() {
            if words[index - 1] == "to" {
                continue;
            }
            let role = token_role(connection, words[index])?;
            if role.primary == TokenRole::Verb {
                return Ok(false);
            }
            let sentence_case = original_words[0]
                .chars()
                .next()
                .is_some_and(char::is_uppercase)
                && !original_words[1]
                    .chars()
                    .next()
                    .is_some_and(char::is_uppercase);
            let lowercase_clause_shape = words.len() >= 4
                && original_words.iter().all(|word| {
                    word.chars()
                        .next()
                        .is_some_and(|character| !character.is_uppercase())
                });
            let ambiguous_sentence = index == 1
                && (sentence_case || lowercase_clause_shape)
                && role.has_verb
                && !is_noun_compound_exception(&words);
            if ambiguous_sentence {
                return Ok(false);
            }
        }
        Ok(true)
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum TokenRole {
    Verb,
    Other,
    Unknown,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
struct TokenRoleInfo {
    primary: TokenRole,
    has_verb: bool,
}

fn token_role(connection: &Connection, word: &str) -> Result<TokenRoleInfo> {
    let direct = {
        let mut statement = connection.prepare(
            "SELECT COALESCE(s.part_of_speech, ''), e.primary_meaning
             FROM entries e
             LEFT JOIN senses s ON s.entry_id = e.id
             WHERE e.normalized = ?1
             ORDER BY s.priority, s.id",
        )?;
        let rows = statement.query_map(params![word], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })?;
        rows.filter_map(std::result::Result::ok).collect::<Vec<_>>()
    };
    let entries = if direct.is_empty() {
        let mut statement = connection.prepare(
            "SELECT COALESCE(s.part_of_speech, ''), e.primary_meaning
                 FROM forms f
                 JOIN entries e ON e.id = f.entry_id
                 LEFT JOIN senses s ON s.entry_id = e.id
                 WHERE lower(f.value) = ?1
                 ORDER BY f.priority, s.priority, s.id",
        )?;
        let rows = statement.query_map(params![word], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })?;
        rows.filter_map(std::result::Result::ok).collect::<Vec<_>>()
    } else {
        direct
    };
    if entries.is_empty() {
        return Ok(TokenRoleInfo {
            primary: TokenRole::Unknown,
            has_verb: false,
        });
    }
    let is_verb = |part_of_speech: &str, meaning: &str| {
        let part_of_speech = part_of_speech.to_ascii_lowercase();
        part_of_speech.starts_with('v')
            || part_of_speech.contains("vt.")
            || part_of_speech.contains("vi.")
            || part_of_speech.contains("aux.")
            || meaning.contains("过去式")
            || meaning.contains("过去分词")
    };
    Ok(TokenRoleInfo {
        primary: if is_verb(&entries[0].0, &entries[0].1) {
            TokenRole::Verb
        } else {
            TokenRole::Other
        },
        has_verb: entries
            .iter()
            .any(|(part_of_speech, meaning)| is_verb(part_of_speech, meaning)),
    })
}

fn is_noun_compound_exception(words: &[&str]) -> bool {
    if words.len() < 3 {
        return false;
    }
    let headword = words[words.len() - 1];
    [
        "analysis",
        "assessment",
        "management",
        "research",
        "method",
        "model",
        "system",
        "systems",
        "architecture",
        "design",
        "strategy",
        "planning",
        "process",
        "policy",
        "service",
        "services",
        "framework",
        "development",
        "operations",
        "requirements",
        "study",
        "review",
        "report",
        "guide",
        "tool",
        "tools",
    ]
    .iter()
    .any(|ending| headword.ends_with(ending))
}

fn looks_like_personal_clause(words: &[&str]) -> bool {
    if words.len() < 2 {
        return false;
    }
    let subject = matches!(
        words[0],
        "i" | "you" | "he" | "she" | "it" | "we" | "they" | "there"
    );
    let phrase_joiner = matches!(
        words[1],
        "and"
            | "or"
            | "with"
            | "without"
            | "of"
            | "for"
            | "to"
            | "from"
            | "in"
            | "on"
            | "at"
            | "by"
            | "the"
            | "a"
            | "an"
    );
    subject && !phrase_joiner
}

fn contains_finite_auxiliary(words: &[&str]) -> bool {
    words.iter().skip(1).any(|word| {
        matches!(
            *word,
            "am" | "is"
                | "are"
                | "was"
                | "were"
                | "has"
                | "have"
                | "had"
                | "do"
                | "does"
                | "did"
                | "can"
                | "could"
                | "will"
                | "would"
                | "shall"
                | "should"
                | "may"
                | "might"
                | "must"
        )
    })
}

fn normalize_term(value: &str) -> String {
    value
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .to_lowercase()
}

fn is_basic_vocabulary_term(value: &str) -> bool {
    if value.is_empty() || value.len() > 80 {
        return false;
    }
    let words = value.split(' ').collect::<Vec<_>>();
    !words.is_empty()
        && words.len() <= 8
        && words.into_iter().all(|word| {
            let bytes = word.as_bytes();
            !bytes.is_empty()
                && bytes.first().is_some_and(u8::is_ascii_alphabetic)
                && bytes.last().is_some_and(u8::is_ascii_alphabetic)
                && bytes
                    .iter()
                    .all(|byte| byte.is_ascii_alphabetic() || *byte == b'\'' || *byte == b'-')
        })
}

fn query_pronunciations(connection: &Connection, entry_id: i64) -> Result<Vec<Pronunciation>> {
    let mut statement = connection.prepare(
        "SELECT locale, ipa, source FROM pronunciations WHERE entry_id = ?1 ORDER BY priority",
    )?;
    let rows = statement.query_map(params![entry_id], |row| {
        Ok(Pronunciation {
            locale: row.get(0)?,
            ipa: row.get(1)?,
            source: row.get(2)?,
        })
    })?;
    Ok(rows.filter_map(Result::ok).collect())
}

fn query_senses(connection: &Connection, entry_id: i64) -> Result<Vec<DictionarySense>> {
    let mut statement = connection.prepare("SELECT id, part_of_speech, meanings, frequency_rank, domain, register, source FROM senses WHERE entry_id = ?1 ORDER BY priority, id")?;
    let rows = statement.query_map(params![entry_id], |row| {
        let meanings: String = row.get(2)?;
        Ok(DictionarySense {
            id: row.get::<_, i64>(0)?.to_string(),
            part_of_speech: row.get(1)?,
            meanings: serde_json::from_str(&meanings).unwrap_or_default(),
            frequency_rank: row.get(3)?,
            domain: row.get(4)?,
            register: row.get(5)?,
            source: row.get(6)?,
        })
    })?;
    Ok(rows.filter_map(Result::ok).collect())
}

fn query_forms(connection: &Connection, entry_id: i64) -> Result<Vec<WordForm>> {
    let mut statement = connection
        .prepare("SELECT label, value FROM forms WHERE entry_id = ?1 ORDER BY priority")?;
    let rows = statement.query_map(params![entry_id], |row| {
        Ok(WordForm {
            label: row.get(0)?,
            value: row.get(1)?,
        })
    })?;
    Ok(rows.filter_map(Result::ok).collect())
}

fn query_examples(connection: &Connection, entry_id: i64) -> Result<Vec<DictionaryExample>> {
    let mut statement = connection.prepare("SELECT id, english, chinese, chinese_provider, source FROM examples WHERE entry_id = ?1 ORDER BY priority LIMIT 4")?;
    let rows = statement.query_map(params![entry_id], |row| {
        Ok(DictionaryExample {
            id: row.get::<_, i64>(0)?.to_string(),
            english: row.get(1)?,
            chinese: row.get(2)?,
            chinese_provider: row.get(3)?,
            source: row.get(4)?,
        })
    })?;
    Ok(rows.filter_map(Result::ok).collect())
}

fn query_relations(connection: &Connection, entry_id: i64) -> Result<Vec<WordRelation>> {
    let mut statement = connection.prepare("SELECT relation_type, words, source FROM relations WHERE entry_id = ?1 ORDER BY relation_type")?;
    let rows = statement.query_map(params![entry_id], |row| {
        let words: String = row.get(1)?;
        Ok(WordRelation {
            relation_type: row.get(0)?,
            words: serde_json::from_str(&words).unwrap_or_default(),
            source: row.get(2)?,
        })
    })?;
    Ok(rows.filter_map(Result::ok).collect())
}

fn query_strings(connection: &Connection, sql: &str, entry_id: i64) -> Result<Vec<String>> {
    let mut statement = connection.prepare(sql)?;
    let rows = statement.query_map(params![entry_id], |row| row.get(0))?;
    Ok(rows.filter_map(Result::ok).collect())
}

fn normalize_word(value: &str) -> String {
    value.trim().to_lowercase().replace('’', "'")
}

fn edit_distance(left: &str, right: &str) -> usize {
    let right = right.chars().collect::<Vec<_>>();
    let mut previous = (0..=right.len()).collect::<Vec<_>>();
    for (left_index, left_character) in left.chars().enumerate() {
        let mut current = vec![left_index + 1];
        for (right_index, right_character) in right.iter().enumerate() {
            current.push(
                (current[right_index] + 1)
                    .min(previous[right_index + 1] + 1)
                    .min(previous[right_index] + usize::from(left_character != *right_character)),
            );
        }
        previous = current;
    }
    previous[right.len()]
}

#[cfg(test)]
mod tests {
    use std::path::PathBuf;

    use super::{edit_distance, normalize_word, DictionaryStore};

    #[test]
    fn normalizes_case_and_apostrophes() {
        assert_eq!(normalize_word("  Ability  "), "ability");
        assert_eq!(normalize_word("Writer’s"), "writer's");
    }

    #[test]
    fn ranks_small_spelling_errors() {
        assert_eq!(edit_distance("abilty", "ability"), 1);
        assert_eq!(edit_distance("translate", "translation"), 3);
    }

    #[test]
    fn distinguishes_phrases_from_common_clause_shapes_with_offline_parts_of_speech() {
        let dictionary = DictionaryStore::open(
            &PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("resources/dictionary-v2.sqlite"),
        );
        for phrase in [
            "take a break",
            "distributed systems architecture",
            "United States government",
            "customer needs analysis",
            "operations research method",
            "machine learning model",
            "natural language processing",
        ] {
            assert!(
                dictionary.is_reviewable_term(phrase).expect("phrase check"),
                "expected phrase: {phrase}"
            );
        }
        for sentence in [
            "I want to go home",
            "Birds eat small insects",
            "Children enjoy sunny days",
            "Moyu makes translation easy",
            "John went home early",
            "The child went home",
            "The young child went home",
            "A small bird flew away",
            "Dogs book flights online",
            "dogs book flights online",
            "people fish in rivers",
        ] {
            assert!(
                !dictionary
                    .is_reviewable_term(sentence)
                    .expect("sentence check"),
                "expected sentence: {sentence}"
            );
        }
    }
}
