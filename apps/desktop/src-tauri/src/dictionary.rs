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
    use super::{edit_distance, normalize_word};

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
}
