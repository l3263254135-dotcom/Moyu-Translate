use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CursorAnchor {
    pub x: f64,
    pub y: f64,
    pub display_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DictionaryOptions {
    pub use_offline_dictionary: bool,
    pub use_platform_dictionary: bool,
    pub show_vocabulary_tags: bool,
    pub include_examples: bool,
    pub include_relations: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TranslationRequest {
    pub text: String,
    pub origin: String,
    pub source_language: String,
    pub target_language: String,
    pub anchor: Option<CursorAnchor>,
    pub dictionary_options: DictionaryOptions,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Pronunciation {
    pub locale: String,
    pub ipa: String,
    pub source: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DictionarySense {
    pub id: String,
    pub part_of_speech: String,
    pub meanings: Vec<String>,
    pub frequency_rank: Option<i64>,
    pub domain: Option<String>,
    pub register: Option<String>,
    pub source: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WordForm {
    pub label: String,
    pub value: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DictionaryExample {
    pub id: String,
    pub english: String,
    pub chinese: Option<String>,
    pub chinese_provider: Option<String>,
    pub source: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WordRelation {
    #[serde(rename = "type")]
    pub relation_type: String,
    pub words: Vec<String>,
    pub source: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DictionarySourceInfo {
    pub id: String,
    pub title: String,
    pub detail: Option<String>,
    pub platform_only: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TranslationResult {
    pub source_text: String,
    pub primary_text: String,
    pub headword: Option<String>,
    pub pronunciations: Vec<Pronunciation>,
    pub senses: Vec<DictionarySense>,
    pub forms: Vec<WordForm>,
    pub examples: Vec<DictionaryExample>,
    pub relations: Vec<WordRelation>,
    pub vocabulary_tags: Vec<String>,
    pub sources: Vec<DictionarySourceInfo>,
    pub provider: String,
    pub latency_milliseconds: u128,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SavedTranslation {
    pub id: String,
    pub kind: String,
    pub stored_at: String,
    pub result: TranslationResult,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VocabularyCandidate {
    pub term: String,
    pub definition: String,
    pub original_source_text: String,
    pub result: TranslationResult,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VocabularyEntry {
    pub id: String,
    pub term: String,
    pub definition: String,
    pub added_at: String,
    pub review_stage: i64,
    pub review_count: i64,
    pub lapse_count: i64,
    pub last_reviewed_at: Option<String>,
    pub next_review_at: String,
    pub review_eligible: bool,
    pub result: TranslationResult,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct VocabularyStats {
    pub total: i64,
    pub due_today: i64,
    pub mastered: i64,
    pub legacy: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppPreferences {
    pub enabled: bool,
    #[serde(default = "default_true")]
    pub auto_pronounce: bool,
    pub theme: String,
    pub pinned: bool,
    pub launch_at_login: bool,
    pub hold_duration_milliseconds: u64,
    pub history_enabled: bool,
    pub dictionary_options: DictionaryOptions,
}

impl Default for AppPreferences {
    fn default() -> Self {
        Self {
            enabled: true,
            auto_pronounce: true,
            theme: "system".into(),
            pinned: false,
            launch_at_login: false,
            hold_duration_milliseconds: 350,
            history_enabled: false,
            dictionary_options: DictionaryOptions {
                use_offline_dictionary: true,
                use_platform_dictionary: true,
                show_vocabulary_tags: true,
                include_examples: true,
                include_relations: true,
            },
        }
    }
}

fn default_true() -> bool {
    true
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlatformCapabilities {
    pub platform: String,
    pub trigger_key_label: String,
    pub accessibility: String,
    pub screen_capture: String,
    pub text_to_speech: bool,
    pub platform_dictionary: bool,
    pub launch_at_login: bool,
}
