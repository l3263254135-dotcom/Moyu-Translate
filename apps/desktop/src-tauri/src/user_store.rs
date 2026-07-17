use std::path::Path;

use anyhow::Result;
use rusqlite::{params, Connection, OptionalExtension};

use crate::models::{AppPreferences, SavedTranslation, TranslationResult};

pub struct UserStore {
    connection: Connection,
}

impl UserStore {
    pub fn open(path: &Path) -> Result<Self> {
        let connection = Connection::open(path)?;
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
             CREATE INDEX IF NOT EXISTS history_created_at ON history(created_at DESC);",
        )?;
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

    pub fn toggle_favorite(&self, result: &TranslationResult, favorite: bool) -> Result<()> {
        if favorite {
            self.connection.execute(
                "INSERT INTO favorites(source_text, result_json) VALUES(?1, ?2) ON CONFLICT(source_text) DO UPDATE SET result_json = excluded.result_json",
                params![result.source_text, serde_json::to_string(result)?],
            )?;
        } else {
            self.connection.execute(
                "DELETE FROM favorites WHERE source_text = ?1",
                params![result.source_text],
            )?;
        }
        Ok(())
    }

    pub fn is_favorite(&self, source_text: &str) -> Result<bool> {
        let exists: Option<i64> = self
            .connection
            .query_row(
                "SELECT 1 FROM favorites WHERE source_text = ?1 LIMIT 1",
                params![source_text],
                |row| row.get(0),
            )
            .optional()?;
        Ok(exists.is_some())
    }

    pub fn list_saved(
        &self,
        kind: &str,
        query: &str,
        limit: usize,
    ) -> Result<Vec<SavedTranslation>> {
        let limit = limit.clamp(1, 100) as i64;
        let sql = match kind {
            "favorite" => {
                "SELECT source_text, result_json, created_at FROM favorites
                 WHERE instr(lower(source_text), lower(?1)) > 0
                 ORDER BY created_at DESC LIMIT ?2"
            }
            "history" => {
                "SELECT CAST(id AS TEXT), result_json, created_at FROM history
                 WHERE instr(lower(source_text), lower(?1)) > 0
                 ORDER BY id DESC LIMIT ?2"
            }
            _ => anyhow::bail!("不支持的本地记录类型"),
        };
        let mut statement = self.connection.prepare(sql)?;
        let rows = statement.query_map(params![query, limit], |row| {
            let id: String = row.get(0)?;
            let json: String = row.get(1)?;
            let stored_at: String = row.get(2)?;
            let result = serde_json::from_str(&json).map_err(|error| {
                rusqlite::Error::FromSqlConversionFailure(
                    1,
                    rusqlite::types::Type::Text,
                    Box::new(error),
                )
            })?;
            Ok(SavedTranslation {
                id,
                kind: kind.to_string(),
                stored_at,
                result,
            })
        })?;
        Ok(rows.filter_map(Result::ok).collect())
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
}

#[cfg(test)]
mod tests {
    use std::time::{SystemTime, UNIX_EPOCH};

    use super::UserStore;
    use crate::models::{AppPreferences, DictionaryOptions, TranslationResult};

    fn result(text: &str) -> TranslationResult {
        TranslationResult {
            source_text: text.into(),
            primary_text: "测试".into(),
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

    fn store() -> (UserStore, std::path::PathBuf) {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock")
            .as_nanos();
        let path = std::env::temp_dir().join(format!("moyu-user-store-{nonce}.sqlite"));
        (UserStore::open(&path).expect("open user store"), path)
    }

    #[test]
    fn history_is_opt_in_and_clearable() {
        let (store, path) = store();
        store
            .record_history(&result("ability"))
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
            .record_history(&result("ability"))
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
    fn favorites_can_be_searched_and_removed() {
        let (store, path) = store();
        let entry = result("capacity");
        store.toggle_favorite(&entry, true).expect("favorite");
        assert!(store.is_favorite("capacity").expect("favorite state"));
        assert_eq!(
            store.list_saved("favorite", "pac", 10).expect("list").len(),
            1
        );
        store
            .toggle_favorite(&entry, false)
            .expect("remove favorite");
        assert!(!store.is_favorite("capacity").expect("favorite state"));
        drop(store);
        let _ = std::fs::remove_file(path);
    }
}
