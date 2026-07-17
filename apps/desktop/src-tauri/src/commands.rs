use tauri::{AppHandle, Manager, State};

use crate::{
    models::{
        AppPreferences, DictionaryOptions, DictionarySense, DictionarySourceInfo,
        PlatformCapabilities, SavedTranslation, TranslationRequest, TranslationResult,
        VocabularyCandidate, VocabularyEntry, VocabularyStats,
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
        && is_dictionary_lookup_candidate(text)
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
    let candidate = vocabulary_candidate_for_result(&result, &state)?;
    if favorite {
        let candidate = candidate.ok_or("生词本仅支持英文单词或短语")?;
        state
            .user_store
            .lock()
            .save_vocabulary(&candidate)
            .map(|_| ())
            .map_err(|error| error.to_string())
    } else {
        let term = candidate
            .map(|candidate| candidate.term)
            .unwrap_or_else(|| result.headword.unwrap_or(result.source_text));
        state
            .user_store
            .lock()
            .remove_vocabulary(&term, None)
            .map_err(|error| error.to_string())
    }
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
pub fn vocabulary_candidate(
    result: TranslationResult,
    state: State<'_, AppState>,
) -> Result<Option<VocabularyCandidate>, String> {
    vocabulary_candidate_for_result(&result, &state)
}

#[tauri::command]
pub fn save_vocabulary(
    candidate: VocabularyCandidate,
    state: State<'_, AppState>,
) -> Result<VocabularyEntry, String> {
    if !state
        .dictionary
        .lock()
        .is_reviewable_term(&candidate.term)
        .map_err(|error| error.to_string())?
    {
        return Err("生词本仅支持英文单词或短语，完整句子不会加入".into());
    }
    state
        .user_store
        .lock()
        .save_vocabulary(&candidate)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn remove_vocabulary(
    term: String,
    entry_id: Option<String>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    state
        .user_store
        .lock()
        .remove_vocabulary(&term, entry_id.as_deref())
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn is_in_vocabulary(term: String, state: State<'_, AppState>) -> Result<bool, String> {
    state
        .user_store
        .lock()
        .is_in_vocabulary(&term)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn list_vocabulary(
    query: String,
    filter: String,
    limit: usize,
    state: State<'_, AppState>,
) -> Result<Vec<VocabularyEntry>, String> {
    state
        .user_store
        .lock()
        .list_vocabulary(&query, &filter, limit)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn due_vocabulary(
    limit: usize,
    state: State<'_, AppState>,
) -> Result<Vec<VocabularyEntry>, String> {
    state
        .user_store
        .lock()
        .due_vocabulary(limit)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn vocabulary_stats(state: State<'_, AppState>) -> Result<VocabularyStats, String> {
    state
        .user_store
        .lock()
        .vocabulary_stats()
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn review_vocabulary(
    term: String,
    rating: String,
    reviewed_at: String,
    state: State<'_, AppState>,
) -> Result<VocabularyEntry, String> {
    state
        .user_store
        .lock()
        .review_vocabulary(&term, &rating, &reviewed_at)
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

fn vocabulary_candidate_for_result(
    result: &TranslationResult,
    state: &State<'_, AppState>,
) -> Result<Option<VocabularyCandidate>, String> {
    let source = result.source_text.trim();
    let source_is_chinese = source
        .chars()
        .any(|character| ('\u{3400}'..='\u{9fff}').contains(&character));
    let dictionary = state.dictionary.lock();
    let preferred = if source_is_chinese {
        result.primary_text.as_str()
    } else if result
        .headword
        .as_deref()
        .is_some_and(|headword| dictionary.is_reviewable_term(headword).unwrap_or(false))
    {
        result.headword.as_deref().unwrap_or(source)
    } else {
        source
    };
    let term = preferred.split_whitespace().collect::<Vec<_>>().join(" ");
    if !dictionary
        .is_reviewable_term(&term)
        .map_err(|error| error.to_string())?
    {
        return Ok(None);
    }
    Ok(Some(VocabularyCandidate {
        term,
        definition: if source_is_chinese {
            source.to_string()
        } else {
            result.primary_text.trim().to_string()
        },
        original_source_text: source.to_string(),
        result: result.clone(),
    }))
}

fn is_dictionary_lookup_candidate(text: &str) -> bool {
    let normalized = text.split_whitespace().collect::<Vec<_>>().join(" ");
    let words = normalized.split(' ').collect::<Vec<_>>();
    !normalized.is_empty()
        && normalized.len() <= 80
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
