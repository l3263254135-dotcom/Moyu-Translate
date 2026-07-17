use std::path::PathBuf;

use parking_lot::Mutex;

use crate::{dictionary::DictionaryStore, models::CursorAnchor, user_store::UserStore};

pub struct AppState {
    pub dictionary: Mutex<DictionaryStore>,
    pub user_store: Mutex<UserStore>,
    pub last_anchor: Mutex<Option<CursorAnchor>>,
}

impl AppState {
    pub fn new(dictionary_path: PathBuf, user_data_path: PathBuf) -> anyhow::Result<Self> {
        let user_store = UserStore::open(&user_data_path)?;
        Ok(Self {
            dictionary: Mutex::new(if dictionary_path.exists() {
                DictionaryStore::open(&dictionary_path)
            } else {
                DictionaryStore::unavailable()
            }),
            user_store: Mutex::new(user_store),
            last_anchor: Mutex::new(None),
        })
    }
}
