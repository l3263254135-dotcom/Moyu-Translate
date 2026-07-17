use tauri::{AppHandle, Manager, State};

use crate::{
    models::{
        AppPreferences, DictionaryOptions, DictionarySense, DictionarySourceInfo,
        PlatformCapabilities, SavedTranslation, TranslationRequest, TranslationResult,
    },
    platform,
    state::AppState,
};

#[tauri::command]
pub fn platform_capabilities() -> PlatformCapabilities {
    platform::capabilities()
}

#[tauri::command]
pub fn translate(
    request: TranslationRequest,
    state: State<'_, AppState>,
) -> Result<TranslationResult, String> {
    let text = request.text.trim();
    if text.is_empty() {
        return Err("请输入要查询的文字".into());
    }
    if text.chars().count() > 1_000 {
        return Err("单次查询最多支持 1,000 个字符".into());
    }
    if request.source_language == "en"
        && is_single_word(text)
        && request.dictionary_options.use_offline_dictionary
    {
        if let Some(mut result) = state
            .dictionary
            .lock()
            .lookup(text)
            .map_err(|error| error.to_string())?
        {
            if request.dictionary_options.use_platform_dictionary {
                append_platform_dictionary(text, &mut result);
            }
            apply_dictionary_options(&mut result, &request.dictionary_options);
            state
                .user_store
                .lock()
                .record_history(&result)
                .map_err(|error| error.to_string())?;
            return Ok(result);
        }
    }
    Err("MODEL_REQUIRED: 请先在设置中下载 Moyu 英中离线语言包。".into())
}

#[tauri::command]
pub fn dictionary_suggestions(
    query: String,
    limit: usize,
    state: State<'_, AppState>,
) -> Result<Vec<String>, String> {
    let query = query.trim();
    if query.is_empty() {
        return Ok(Vec::new());
    }
    state
        .dictionary
        .lock()
        .search(query, limit.clamp(1, 12))
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn capture_text_at_cursor(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let anchor = state
        .last_anchor
        .lock()
        .clone()
        .ok_or("请先把光标停在目标文字上并长按 Option/Alt，再点击准星取词。")?;
    let window = app.get_webview_window("panel").ok_or("找不到悬浮窗")?;
    window.hide().map_err(|error| error.to_string())?;
    tokio::time::sleep(std::time::Duration::from_millis(90)).await;
    let result = platform::capture_text_at_cursor(&app, &anchor).await;
    let _ = window.show();
    let _ = window.set_focus();
    result
}

#[tauri::command]
pub fn speak(text: String, locale: String) -> Result<(), String> {
    platform::speak(&text, &locale)
}

#[tauri::command]
pub fn set_panel_pinned(app: AppHandle, pinned: bool) -> Result<(), String> {
    let window = app.get_webview_window("panel").ok_or("找不到悬浮窗")?;
    window
        .set_always_on_top(true)
        .map_err(|error| error.to_string())?;
    window
        .set_skip_taskbar(true)
        .map_err(|error| error.to_string())?;
    window
        .set_resizable(false)
        .map_err(|error| error.to_string())?;
    if pinned {
        window.show().map_err(|error| error.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn save_preferences(
    preferences: AppPreferences,
    state: State<'_, AppState>,
) -> Result<(), String> {
    state
        .user_store
        .lock()
        .save_preferences(&preferences)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn load_preferences(state: State<'_, AppState>) -> Result<AppPreferences, String> {
    state
        .user_store
        .lock()
        .preferences()
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn toggle_favorite(
    result: TranslationResult,
    favorite: bool,
    state: State<'_, AppState>,
) -> Result<(), String> {
    state
        .user_store
        .lock()
        .toggle_favorite(&result, favorite)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn is_favorite(source_text: String, state: State<'_, AppState>) -> Result<bool, String> {
    state
        .user_store
        .lock()
        .is_favorite(&source_text)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn record_translation_result(
    result: TranslationResult,
    state: State<'_, AppState>,
) -> Result<(), String> {
    state
        .user_store
        .lock()
        .record_history(&result)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn list_saved_translations(
    kind: String,
    query: String,
    limit: usize,
    state: State<'_, AppState>,
) -> Result<Vec<SavedTranslation>, String> {
    state
        .user_store
        .lock()
        .list_saved(&kind, &query, limit)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn clear_history(state: State<'_, AppState>) -> Result<(), String> {
    state
        .user_store
        .lock()
        .clear_history()
        .map_err(|error| error.to_string())
}

fn is_single_word(text: &str) -> bool {
    text.chars()
        .all(|character| character.is_ascii_alphabetic() || character == '\'' || character == '-')
}

fn append_platform_dictionary(text: &str, result: &mut TranslationResult) {
    let Some(definition) = platform::system_dictionary_definition(text) else {
        return;
    };
    result.senses.push(DictionarySense {
        id: "macos-system-dictionary".into(),
        part_of_speech: "系统词典".into(),
        meanings: vec![definition],
        frequency_rank: None,
        domain: None,
        register: None,
        source: "macOS 系统词典".into(),
    });
    result.sources.push(DictionarySourceInfo {
        id: "macos-system-dictionary".into(),
        title: "macOS 系统词典".into(),
        detail: Some("来自“词典”App 中当前启用的本地词典".into()),
        platform_only: Some(true),
    });
}

fn apply_dictionary_options(result: &mut TranslationResult, options: &DictionaryOptions) {
    if !options.show_vocabulary_tags {
        result.vocabulary_tags.clear();
    }
    if !options.include_examples {
        result.examples.clear();
    }
    if !options.include_relations {
        result.relations.clear();
    }
}

#[cfg(test)]
mod tests {
    use super::apply_dictionary_options;
    use crate::models::{DictionaryExample, DictionaryOptions, TranslationResult, WordRelation};

    #[test]
    fn dictionary_display_options_remove_optional_sections() {
        let mut result = TranslationResult {
            source_text: "ability".into(),
            primary_text: "能力".into(),
            headword: Some("ability".into()),
            pronunciations: vec![],
            senses: vec![],
            forms: vec![],
            examples: vec![DictionaryExample {
                id: "1".into(),
                english: "Ability matters.".into(),
                chinese: None,
                chinese_provider: None,
                source: "WordNet".into(),
            }],
            relations: vec![WordRelation {
                relation_type: "synonym".into(),
                words: vec!["capacity".into()],
                source: "WordNet".into(),
            }],
            vocabulary_tags: vec!["IELTS".into()],
            sources: vec![],
            provider: "test".into(),
            latency_milliseconds: 1,
        };
        apply_dictionary_options(
            &mut result,
            &DictionaryOptions {
                use_offline_dictionary: true,
                use_platform_dictionary: false,
                show_vocabulary_tags: false,
                include_examples: false,
                include_relations: false,
            },
        );
        assert!(result.vocabulary_tags.is_empty());
        assert!(result.examples.is_empty());
        assert!(result.relations.is_empty());
    }
}
