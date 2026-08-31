use tauri::AppHandle;

use crate::models::{CursorAnchor, PlatformCapabilities};

pub fn capabilities() -> PlatformCapabilities {
    PlatformCapabilities {
        platform: "web".into(),
        trigger_key_label: "Alt".into(),
        accessibility: "unavailable".into(),
        screen_capture: "unavailable".into(),
        hotkey_status: "disabled".into(),
        text_to_speech: false,
        platform_dictionary: false,
        launch_at_login: false,
    }
}

pub fn start_hold_monitor(_app: AppHandle) {}
pub fn open_accessibility_settings() -> Result<(), String> {
    Err("当前平台不支持辅助功能设置".into())
}
pub fn speak(_text: &str, _locale: &str) -> Result<(), String> {
    Err("当前平台不支持系统朗读".into())
}
pub fn system_dictionary_definition(_term: &str) -> Option<String> {
    None
}
pub async fn capture_text_at_cursor(
    _app: &AppHandle,
    _anchor: &CursorAnchor,
) -> Result<String, String> {
    Err("当前平台不支持光标取词".into())
}
