use tauri::AppHandle;

use crate::models::{CursorAnchor, PlatformCapabilities};

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
mod fallback;
#[cfg(target_os = "macos")]
mod macos;
#[cfg(target_os = "windows")]
mod windows;

pub fn capabilities() -> PlatformCapabilities {
    #[cfg(target_os = "macos")]
    return macos::capabilities();
    #[cfg(target_os = "windows")]
    return windows::capabilities();
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    return fallback::capabilities();
}

pub fn start_hold_monitor(app: AppHandle) {
    #[cfg(target_os = "macos")]
    macos::start_hold_monitor(app);
    #[cfg(target_os = "windows")]
    windows::start_hold_monitor(app);
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    fallback::start_hold_monitor(app);
}

pub fn open_accessibility_settings() -> Result<(), String> {
    #[cfg(target_os = "macos")]
    return macos::open_accessibility_settings();
    #[cfg(target_os = "windows")]
    return windows::open_accessibility_settings();
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    return fallback::open_accessibility_settings();
}

pub fn speak(text: &str, locale: &str) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    return macos::speak(text, locale);
    #[cfg(target_os = "windows")]
    return windows::speak(text, locale);
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    return fallback::speak(text, locale);
}

pub fn system_dictionary_definition(term: &str) -> Option<String> {
    #[cfg(target_os = "macos")]
    return macos::system_dictionary_definition(term);
    #[cfg(target_os = "windows")]
    return windows::system_dictionary_definition(term);
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    return fallback::system_dictionary_definition(term);
}

pub async fn capture_text_at_cursor(
    app: &AppHandle,
    anchor: &CursorAnchor,
) -> Result<String, String> {
    #[cfg(target_os = "macos")]
    return macos::capture_text_at_cursor(app, anchor).await;
    #[cfg(target_os = "windows")]
    return windows::capture_text_at_cursor(app, anchor).await;
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    return fallback::capture_text_at_cursor(app, anchor).await;
}
