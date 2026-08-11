use std::path::Path;

use anyhow::{bail, Result};
use rusqlite::{params, Connection, OptionalExtension, Row};

use crate::dictionary::DictionaryStore;
use crate::models::{
    AppPreferences, SavedTranslation, TranslationResult, VocabularyCandidate, VocabularyEntry,
    VocabularyStats,
};

const MASTERED_REVIEW_STAGE: i64 = 5;
const FAVORITES_MIGRATION_KEY: &str = "vocabulary_entries_migrated_v1";

pub struct UserStore {
    connection: Connection,
}

impl UserStore {
    #[cfg(test)]
    pub fn open(path: &Path) -> Result<Self> {
        Self::open_with_validator(path, &is_basic_vocabulary_term)
    }

    pub fn open_with_dictionary(path: &Path, dictionary: &DictionaryStore) -> Result<Self> {
        Self::open_with_validator(path, &|term| {
            dictionary.is_reviewable_term(term).unwrap_or(false)
        })
    }

    fn open_with_validator(path: &Path, is_reviewable: &dyn Fn(&str) -> bool) -> Result<Self> {
        let mut connection = Connection::open(path)?;
        connection.execute_batch(
            "PRAGMA journal_mode=WAL;
             CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
             CREATE TABLE IF NOT EXISTS favorites (
               source_text TEXT PRIMARY KEY,
               result_json TEXT NOT NULL,
               created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
             );
             CREATE TABLE IF NOT EXISTS history (
               id INTEGER PRIMARY KEY AUTOINCREMENT,
               source_text TEXT NOT NULL,
               result_json TEXT NOT NULL,
               created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
             );
             CREATE TABLE IF NOT EXISTS vocabulary_entries (
               id INTEGER PRIMARY KEY AUTOINCREMENT,
               term_key TEXT NOT NULL UNIQUE,
               term TEXT NOT NULL,
               definition TEXT NOT NULL,
               original_source_text TEXT NOT NULL,
               result_json TEXT NOT NULL,
               review_eligible INTEGER NOT NULL DEFAULT 1,
               review_stage INTEGER NOT NULL DEFAULT 0,
               review_count INTEGER NOT NULL DEFAULT 0,
               lapse_count INTEGER NOT NULL DEFAULT 0,
               created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
               last_reviewed_at TEXT,
               next_review_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
             );
             CREATE INDEX IF NOT EXISTS history_created_at ON history(created_at DESC);
             CREATE INDEX IF NOT EXISTS vocabulary_due ON vocabulary_entries(review_eligible, next_review_at);
             CREATE INDEX IF NOT EXISTS vocabulary_stage ON vocabulary_entries(review_stage);",
        )?;
        migrate_favorites(&mut connection, is_reviewable)?;
        Ok(Self { connection })
    }

    pub fn preferences(&self) -> Result<AppPreferences> {
        let stored: Option<String> = self
            .connection
            .query_row(
                "SELECT value FROM settings WHERE key = 'preferences'",
                [],
                |row| row.get(0),
            )
            .optional()?;
        Ok(stored
            .and_then(|value| serde_json::from_str(&value).ok())
            .unwrap_or_default())
    }

    pub fn save_preferences(&self, preferences: &AppPreferences) -> Result<()> {
        self.connection.execute(
            "INSERT INTO settings(key, value) VALUES('preferences', ?1) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![serde_json::to_string(preferences)?],
        )?;
        Ok(())
    }

    pub fn save_vocabulary(&self, candidate: &VocabularyCandidate) -> Result<VocabularyEntry> {
        let term = normalize_term(&candidate.term);
        if !is_basic_vocabulary_term(&term) {
            bail!("生词本仅支持 1–8 个英文词组成、80 个字符以内的单词或短语");
        }
        let definition = candidate.definition.trim();
        if definition.is_empty() {
            bail!("生词释义不能为空");
        }
        let key = term_key(&term);
        self.connection.execute(
            "INSERT INTO vocabulary_entries(
               term_key, term, definition, original_source_text, result_json, review_eligible
             ) VALUES(?1, ?2, ?3, ?4, ?5, 1)
             ON CONFLICT(term_key) DO UPDATE SET
               term = excluded.term,
               definition = excluded.definition,
               original_source_text = excluded.original_source_text,
               result_json = excluded.result_json,
               review_eligible = 1",
            params![
                key,
                term,
                definition,
                candidate.original_source_text.trim(),
                serde_json::to_string(&candidate.result)?,
            ],
        )?;
        self.vocabulary_by_key(&key)?
            .ok_or_else(|| anyhow::anyhow!("生词保存后无法读取"))
    }

    pub fn remove_vocabulary(&self, term: &str, entry_id: Option<&str>) -> Result<()> {
        if let Some(entry_id) = entry_id {
            self.connection.execute(
                "DELETE FROM vocabulary_entries WHERE id = ?1",
                params![entry_id.parse::<i64>()?],
            )?;
        } else {
            self.connection.execute(
                "DELETE FROM vocabulary_entries WHERE term_key = ?1 AND review_eligible = 1",
                params![term_key(term)],
            )?;
        }
        Ok(())
    }

    pub fn is_in_vocabulary(&self, term: &str) -> Result<bool> {
        let exists: Option<i64> = self
            .connection
            .query_row(
                "SELECT 1 FROM vocabulary_entries WHERE term_key = ?1 LIMIT 1",
                params![term_key(term)],
                |row| row.get(0),
            )
            .optional()?;
        Ok(exists.is_some())
    }

    pub fn list_vocabulary(
        &self,
        query: &str,
        filter: &str,
        limit: usize,
    ) -> Result<Vec<VocabularyEntry>> {
        let limit = limit.clamp(1, 500) as i64;
        let sql = match filter {
            "all" => {
                "SELECT id, term, definition, created_at, review_stage, review_count, lapse_count,
                        last_reviewed_at, next_review_at, review_eligible, result_json
                 FROM vocabulary_entries
                 WHERE (instr(lower(term), lower(?1)) > 0 OR instr(lower(definition), lower(?1)) > 0)
                 ORDER BY created_at DESC LIMIT ?2"
            }
            "due" => {
                "SELECT id, term, definition, created_at, review_stage, review_count, lapse_count,
                        last_reviewed_at, next_review_at, review_eligible, result_json
                 FROM vocabulary_entries
                 WHERE review_eligible = 1
                   AND next_review_at <= strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
                   AND (instr(lower(term), lower(?1)) > 0 OR instr(lower(definition), lower(?1)) > 0)
                 ORDER BY next_review_at ASC, created_at ASC LIMIT ?2"
            }
            "mastered" => {
                "SELECT id, term, definition, created_at, review_stage, review_count, lapse_count,
                        last_reviewed_at, next_review_at, review_eligible, result_json
                 FROM vocabulary_entries
                 WHERE review_eligible = 1 AND review_stage >= 5
                   AND (instr(lower(term), lower(?1)) > 0 OR instr(lower(definition), lower(?1)) > 0)
                 ORDER BY last_reviewed_at DESC, created_at DESC LIMIT ?2"
            }
            _ => bail!("不支持的生词筛选类型"),
        };
        let mut statement = self.connection.prepare(sql)?;
        let rows = statement.query_map(params![query.trim(), limit], vocabulary_entry_from_row)?;
        Ok(rows.filter_map(std::result::Result::ok).collect())
    }

    pub fn due_vocabulary(&self, limit: usize) -> Result<Vec<VocabularyEntry>> {
        self.list_vocabulary("", "due", limit.clamp(1, 100))
    }

    pub fn vocabulary_stats(&self) -> Result<VocabularyStats> {
        self.connection.query_row(
            "SELECT
               COUNT(*),
               COALESCE(SUM(CASE WHEN review_eligible = 1 AND next_review_at <= strftime('%Y-%m-%dT%H:%M:%SZ', 'now') THEN 1 ELSE 0 END), 0),
               COALESCE(SUM(CASE WHEN review_eligible = 1 AND review_stage >= ?1 THEN 1 ELSE 0 END), 0),
               COALESCE(SUM(CASE WHEN review_eligible = 0 THEN 1 ELSE 0 END), 0)
             FROM vocabulary_entries",
            params![MASTERED_REVIEW_STAGE],
            |row| {
                Ok(VocabularyStats {
                    total: row.get(0)?,
                    due_today: row.get(1)?,
                    mastered: row.get(2)?,
                    legacy: row.get(3)?,
                })
            },
        ).map_err(Into::into)
    }

    pub fn review_vocabulary(
        &self,
        term: &str,
        rating: &str,
        reviewed_at: &str,
    ) -> Result<VocabularyEntry> {
        let key = term_key(term);
        let current_stage: i64 = self
            .connection
            .query_row(
                "SELECT review_stage FROM vocabulary_entries WHERE term_key = ?1 AND review_eligible = 1",
                params![key],
                |row| row.get(0),
            )
            .optional()?
            .ok_or_else(|| anyhow::anyhow!("找不到可复习的生词"))?;
        let (next_stage, modifier, lapse_increment) = match rating {
            "known" => {
                let stage = (current_stage + 1).min(6);
                let days = [1, 3, 7, 14, 30, 60][(stage - 1) as usize];
                (stage, format!("+{days} days"), 0)
            }
            "again" => (0, "+10 minutes".to_string(), 1),
            _ => bail!("不支持的复习评分"),
        };
        self.connection.execute(
            "UPDATE vocabulary_entries SET
               review_stage = ?2,
               review_count = review_count + 1,
               lapse_count = lapse_count + ?3,
               last_reviewed_at = strftime('%Y-%m-%dT%H:%M:%SZ', ?4),
               next_review_at = strftime('%Y-%m-%dT%H:%M:%SZ', ?4, ?5)
             WHERE term_key = ?1",
            params![key, next_stage, lapse_increment, reviewed_at, modifier],
        )?;
        self.vocabulary_by_key(&key)?
            .ok_or_else(|| anyhow::anyhow!("复习后无法读取生词"))
    }

    pub fn is_favorite(&self, source_text: &str) -> Result<bool> {
        self.is_in_vocabulary(source_text)
    }

    pub fn list_saved(
        &self,
        kind: &str,
        query: &str,
        limit: usize,
    ) -> Result<Vec<SavedTranslation>> {
        if kind == "favorite" {
            return Ok(self
                .list_vocabulary(query, "all", limit)?
                .into_iter()
                .map(|entry| SavedTranslation {
                    id: entry.id,
                    kind: "favorite".into(),
                    stored_at: entry.added_at,
                    result: entry.result,
                })
                .collect());
        }
        if kind != "history" {
            bail!("不支持的本地记录类型");
        }
        let limit = limit.clamp(1, 100) as i64;
        let mut statement = self.connection.prepare(
            "SELECT CAST(id AS TEXT), result_json, created_at FROM history
             WHERE instr(lower(source_text), lower(?1)) > 0
             ORDER BY id DESC LIMIT ?2",
        )?;
        let rows = statement.query_map(params![query, limit], |row| {
            let id: String = row.get(0)?;
            let json: String = row.get(1)?;
            let stored_at: String = row.get(2)?;
            let result = deserialize_result(&json)?;
            Ok(SavedTranslation {
                id,
                kind: "history".into(),
                stored_at,
                result,
            })
        })?;
        Ok(rows.filter_map(std::result::Result::ok).collect())
    }

    pub fn clear_history(&self) -> Result<()> {
        self.connection.execute("DELETE FROM history", [])?;
        Ok(())
    }

    pub fn record_history(&self, result: &TranslationResult) -> Result<()> {
        if !self.preferences()?.history_enabled {
            return Ok(());
        }
        self.connection.execute(
            "INSERT INTO history(source_text, result_json) VALUES(?1, ?2)",
            params![result.source_text, serde_json::to_string(result)?],
        )?;
        self.connection.execute(
            "DELETE FROM history WHERE id NOT IN (SELECT id FROM history ORDER BY id DESC LIMIT 500)",
            [],
        )?;
        Ok(())
    }

    fn vocabulary_by_key(&self, key: &str) -> Result<Option<VocabularyEntry>> {
        self.connection
            .query_row(
                "SELECT id, term, definition, created_at, review_stage, review_count, lapse_count,
                        last_reviewed_at, next_review_at, review_eligible, result_json
                 FROM vocabulary_entries WHERE term_key = ?1",
                params![key],
                vocabulary_entry_from_row,
            )
            .optional()
            .map_err(Into::into)
    }
}

struct LegacyCandidate {
    term: String,
    definition: String,
    review_eligible: bool,
}

fn migrate_favorites(
    connection: &mut Connection,
    is_reviewable: &dyn Fn(&str) -> bool,
) -> Result<()> {
    let migrated: Option<String> = connection
        .query_row(
            "SELECT value FROM settings WHERE key = ?1",
            params![FAVORITES_MIGRATION_KEY],
            |row| row.get(0),
        )
        .optional()?;
    if migrated.is_some() {
        return Ok(());
    }

    let favorites = {
        let mut statement = connection
            .prepare("SELECT result_json, created_at FROM favorites ORDER BY created_at ASC")?;
        let rows = statement
            .query_map([], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
            })?
            .filter_map(std::result::Result::ok)
            .collect::<Vec<_>>();
        rows
    };

    let transaction = connection.transaction()?;
    for (index, (json, created_at)) in favorites.into_iter().enumerate() {
        let Ok(result) = serde_json::from_str::<TranslationResult>(&json) else {
            continue;
        };
        let mut candidate = candidate_from_result(&result, is_reviewable);
        let base_key = term_key(&candidate.term);
        let key_exists: bool = transaction.query_row(
            "SELECT EXISTS(SELECT 1 FROM vocabulary_entries WHERE term_key = ?1)",
            params![base_key],
            |row| row.get(0),
        )?;
        let key = if key_exists {
            candidate.review_eligible = false;
            let original = normalize_term(&result.source_text);
            if !original.is_empty() {
                candidate.term = original;
            }
            format!("legacy:{index}:{base_key}")
        } else {
            base_key
        };
        transaction.execute(
            "INSERT INTO vocabulary_entries(
               term_key, term, definition, original_source_text, result_json, review_eligible,
               created_at, next_review_at
             ) VALUES(
               ?1, ?2, ?3, ?4, ?5, ?6,
               strftime('%Y-%m-%dT%H:%M:%SZ', ?7),
               strftime('%Y-%m-%dT%H:%M:%SZ', ?7)
             )",
            params![
                key,
                candidate.term,
                candidate.definition,
                result.source_text,
                json,
                candidate.review_eligible as i64,
                created_at,
            ],
        )?;
    }
    transaction.execute(
        "INSERT INTO settings(key, value) VALUES(?1, 'true')",
        params![FAVORITES_MIGRATION_KEY],
    )?;
    transaction.commit()?;
    Ok(())
}

fn candidate_from_result(
    result: &TranslationResult,
    is_reviewable: &dyn Fn(&str) -> bool,
) -> LegacyCandidate {
    let source = result.source_text.trim();
    let source_is_chinese = source
        .chars()
        .any(|character| ('\u{3400}'..='\u{9fff}').contains(&character));
    let preferred = if source_is_chinese {
        result.primary_text.as_str()
    } else if result
        .headword
        .as_deref()
        .is_some_and(is_basic_vocabulary_term)
    {
        result.headword.as_deref().unwrap_or(source)
    } else {
        source
    };
    let normalized = normalize_term(preferred);
    let eligible = is_reviewable(&normalized);
    LegacyCandidate {
        term: if normalized.is_empty() {
            "未命名收藏".into()
        } else {
            normalized
        },
        definition: if source_is_chinese {
            source.to_string()
        } else {
            result.primary_text.trim().to_string()
        },
        review_eligible: eligible,
    }
}

fn normalize_term(value: &str) -> String {
    value.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn term_key(value: &str) -> String {
    normalize_term(value).to_lowercase()
}

fn is_basic_vocabulary_term(value: &str) -> bool {
    let normalized = normalize_term(value);
    if normalized.is_empty() || normalized.len() > 80 {
        return false;
    }
    let words = normalized.split(' ').collect::<Vec<_>>();
    if words.is_empty() || words.len() > 8 {
        return false;
    }
    words.into_iter().all(valid_english_word)
}

fn valid_english_word(word: &str) -> bool {
    let bytes = word.as_bytes();
    if bytes.is_empty()
        || !bytes.first().is_some_and(u8::is_ascii_alphabetic)
        || !bytes.last().is_some_and(u8::is_ascii_alphabetic)
    {
        return false;
    }
    let mut separator = false;
    for byte in bytes {
        if byte.is_ascii_alphabetic() {
            separator = false;
        } else if (*byte == b'\'' || *byte == b'-') && !separator {
            separator = true;
        } else {
            return false;
        }
    }
    true
}

fn vocabulary_entry_from_row(row: &Row<'_>) -> rusqlite::Result<VocabularyEntry> {
    let json: String = row.get(10)?;
    Ok(VocabularyEntry {
        id: row.get::<_, i64>(0)?.to_string(),
        term: row.get(1)?,
        definition: row.get(2)?,
        added_at: row.get(3)?,
        review_stage: row.get(4)?,
        review_count: row.get(5)?,
        lapse_count: row.get(6)?,
        last_reviewed_at: row.get(7)?,
        next_review_at: row.get(8)?,
        review_eligible: row.get::<_, i64>(9)? != 0,
        result: deserialize_result(&json)?,
    })
}

fn deserialize_result(json: &str) -> rusqlite::Result<TranslationResult> {
    serde_json::from_str(json).map_err(|error| {
        rusqlite::Error::FromSqlConversionFailure(1, rusqlite::types::Type::Text, Box::new(error))
    })
}

#[cfg(test)]
mod tests {
    use std::{
        sync::atomic::{AtomicU64, Ordering},
        time::{SystemTime, UNIX_EPOCH},
    };

    use rusqlite::{params, Connection};

    use super::UserStore;
    use crate::models::{
        AppPreferences, DictionaryOptions, TranslationResult, VocabularyCandidate,
    };

    static PATH_COUNTER: AtomicU64 = AtomicU64::new(0);

    fn result(text: &str, primary: &str) -> TranslationResult {
        TranslationResult {
            source_text: text.into(),
            primary_text: primary.into(),
            headword: Some(text.into()),
            pronunciations: vec![],
            senses: vec![],
            forms: vec![],
            examples: vec![],
            relations: vec![],
            vocabulary_tags: vec![],
            sources: vec![],
            provider: "test".into(),
            latency_milliseconds: 1,
        }
    }

    fn candidate(term: &str, definition: &str) -> VocabularyCandidate {
        VocabularyCandidate {
            term: term.into(),
            definition: definition.into(),
            original_source_text: term.into(),
            result: result(term, definition),
        }
    }

    fn path() -> std::path::PathBuf {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock")
            .as_nanos();
        let counter = PATH_COUNTER.fetch_add(1, Ordering::Relaxed);
        std::env::temp_dir().join(format!(
            "moyu-user-store-{}-{nonce}-{counter}.sqlite",
            std::process::id()
        ))
    }

    fn store() -> (UserStore, std::path::PathBuf) {
        let path = path();
        (UserStore::open(&path).expect("open user store"), path)
    }

    #[test]
    fn legacy_preferences_enable_auto_pronunciation() {
        let (store, path) = store();
        store
            .connection
            .execute(
                "INSERT INTO settings(key, value) VALUES('preferences', ?1)",
                params![r#"{"enabled":true,"theme":"system","pinned":false,"launchAtLogin":false,"holdDurationMilliseconds":350,"historyEnabled":false,"dictionaryOptions":{"useOfflineDictionary":true,"usePlatformDictionary":true,"showVocabularyTags":true,"includeExamples":true,"includeRelations":true}}"#],
            )
            .expect("insert legacy preferences");
        let preferences = store.preferences().expect("load legacy preferences");
        assert!(preferences.auto_pronounce);
        drop(store);
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn history_is_opt_in_and_clearable() {
        let (store, path) = store();
        assert_eq!(
            store.vocabulary_stats().expect("empty stats"),
            crate::models::VocabularyStats {
                total: 0,
                due_today: 0,
                mastered: 0,
                legacy: 0,
            }
        );
        store
            .record_history(&result("ability", "能力"))
            .expect("record disabled");
        assert!(store
            .list_saved("history", "", 10)
            .expect("list")
            .is_empty());

        let preferences = AppPreferences {
            history_enabled: true,
            dictionary_options: DictionaryOptions {
                use_offline_dictionary: true,
                use_platform_dictionary: true,
                show_vocabulary_tags: true,
                include_examples: true,
                include_relations: true,
            },
            ..AppPreferences::default()
        };
        store
            .save_preferences(&preferences)
            .expect("save preferences");
        store
            .record_history(&result("ability", "能力"))
            .expect("record enabled");
        assert_eq!(
            store.list_saved("history", "abil", 10).expect("list").len(),
            1
        );
        store.clear_history().expect("clear");
        assert!(store
            .list_saved("history", "", 10)
            .expect("list")
            .is_empty());
        drop(store);
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn vocabulary_review_and_duplicate_save_preserve_progress() {
        let (store, path) = store();
        assert!(store
            .save_vocabulary(&candidate("This is a complete sentence.", "完整句子"))
            .is_err());
        store
            .save_vocabulary(&candidate("take a break", "休息一下"))
            .expect("save");
        assert!(store.is_in_vocabulary("  TAKE A BREAK ").expect("state"));
        assert_eq!(store.vocabulary_stats().expect("stats").due_today, 1);

        let reviewed = store
            .review_vocabulary("take a break", "known", "2026-07-17T00:00:00Z")
            .expect("known");
        assert_eq!(reviewed.review_stage, 1);
        assert_eq!(reviewed.next_review_at, "2026-07-18T00:00:00Z");

        store
            .save_vocabulary(&candidate("Take a Break", "稍作休息"))
            .expect("refresh definition");
        let entry = store
            .list_vocabulary("take", "all", 10)
            .expect("list")
            .remove(0);
        assert_eq!(entry.review_stage, 1);
        assert_eq!(entry.review_count, 1);
        assert_eq!(entry.definition, "稍作休息");

        let reviewed = store
            .review_vocabulary("take a break", "again", "2026-07-17T01:00:00Z")
            .expect("again");
        assert_eq!(reviewed.review_stage, 0);
        assert_eq!(reviewed.lapse_count, 1);
        assert_eq!(reviewed.next_review_at, "2026-07-17T01:10:00Z");

        drop(store);
        let reopened = UserStore::open(&path).expect("reopen");
        assert!(reopened
            .is_in_vocabulary("take a break")
            .expect("persisted"));
        reopened
            .remove_vocabulary("take a break", None)
            .expect("remove persisted entry");
        assert!(!reopened.is_in_vocabulary("take a break").expect("removed"));
        drop(reopened);
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn legacy_favorites_migrate_without_deleting_the_source_table() {
        let path = path();
        let connection = Connection::open(&path).expect("legacy database");
        connection
            .execute_batch(
                "CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
                 CREATE TABLE favorites (
                   source_text TEXT PRIMARY KEY,
                   result_json TEXT NOT NULL,
                   created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
                 );",
            )
            .expect("legacy schema");
        for item in [
            result("ability", "能力"),
            result("Ability", "本领"),
            result("This is a complete sentence.", "这是一个完整句子。"),
        ] {
            connection
                .execute(
                    "INSERT INTO favorites(source_text, result_json) VALUES(?1, ?2)",
                    params![
                        item.source_text,
                        serde_json::to_string(&item).expect("json")
                    ],
                )
                .expect("legacy favorite");
        }
        drop(connection);

        let store = UserStore::open(&path).expect("migrate");
        let entries = store.list_vocabulary("", "all", 10).expect("entries");
        assert_eq!(entries.len(), 3);
        let stats = store.vocabulary_stats().expect("stats");
        assert_eq!(stats.total, 3);
        assert_eq!(stats.due_today, 1);
        assert_eq!(stats.legacy, 2);
        let legacy_duplicate = entries
            .iter()
            .find(|entry| entry.term == "Ability" && !entry.review_eligible)
            .expect("legacy duplicate");
        store
            .remove_vocabulary(&legacy_duplicate.term, Some(&legacy_duplicate.id))
            .expect("remove exact legacy duplicate");
        assert!(store.is_in_vocabulary("ability").expect("eligible remains"));
        assert_eq!(
            store.vocabulary_stats().expect("after exact remove").total,
            2
        );
        let old_count: i64 = store
            .connection
            .query_row("SELECT COUNT(*) FROM favorites", [], |row| row.get(0))
            .expect("legacy table retained");
        assert_eq!(old_count, 3);
        drop(store);
        let _ = std::fs::remove_file(path);
    }
}
