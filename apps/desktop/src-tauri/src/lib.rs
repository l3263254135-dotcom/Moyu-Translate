mod commands;
mod dictionary;
mod models;
mod platform;
mod state;
mod user_store;

use std::fs;

use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    Manager,
};
use tauri_plugin_autostart::MacosLauncher;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            Some(vec!["--background"]),
        ))
        .setup(|app| {
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);
            let data_dir = app.path().app_data_dir()?;
            fs::create_dir_all(&data_dir)?;
            let resource_dir = app.path().resource_dir()?;
            let dictionary_path = resource_dir.join("resources/dictionary-v2.sqlite");
            let debug_dictionary = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                .join("resources/dictionary-v2.sqlite");
            let dictionary_path = if dictionary_path.exists() {
                dictionary_path
            } else {
                debug_dictionary
            };
            app.manage(state::AppState::new(
                dictionary_path,
                data_dir.join("moyu-user.sqlite"),
            )?);

            let show = MenuItem::with_id(app, "show", "打开翻译窗", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "退出 Moyu Translate", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show, &quit])?;
            let _tray = TrayIconBuilder::new()
                .menu(&menu)
                .tooltip("Moyu Translate Beta")
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => {
                        if let Some(window) = app.get_webview_window("panel") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .build(app)?;

            platform::start_hold_monitor(app.handle().clone());
            if std::env::args().any(|argument| argument == "--background") {
                if let Some(window) = app.get_webview_window("panel") {
                    let _ = window.hide();
                }
            } else if let Some(window) = app.get_webview_window("panel") {
                let _ = window.show();
                let _ = window.set_focus();
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::platform_capabilities,
            commands::translate,
            commands::dictionary_suggestions,
            commands::capture_text_at_cursor,
            commands::speak,
            commands::set_panel_pinned,
            commands::save_preferences,
            commands::load_preferences,
            commands::toggle_favorite,
            commands::is_favorite,
            commands::record_translation_result,
            commands::list_saved_translations,
            commands::clear_history,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Moyu Translate");
}
