mod commands;
mod dictionary;
mod models;
mod platform;
mod state;
mod user_store;

use std::fs;

use tauri::{
    image::Image,
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    Manager,
};
use tauri_plugin_autostart::MacosLauncher;

#[cfg(target_os = "macos")]
const TRAY_ICON_BYTES: &[u8] = include_bytes!("../icons/trayTemplate.png");
#[cfg(not(target_os = "macos"))]
const TRAY_ICON_BYTES: &[u8] = include_bytes!("../icons/32x32.png");

fn tray_icon() -> tauri::Result<Image<'static>> {
    Image::from_bytes(TRAY_ICON_BYTES)
}

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
            let mut tray = TrayIconBuilder::new()
                .icon(tray_icon()?)
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
                });
            #[cfg(target_os = "macos")]
            {
                tray = tray.icon_as_template(true);
            }
            let _tray = tray.build(app)?;

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
            commands::save_vocabulary,
            commands::vocabulary_candidate,
            commands::remove_vocabulary,
            commands::is_in_vocabulary,
            commands::list_vocabulary,
            commands::due_vocabulary,
            commands::vocabulary_stats,
            commands::review_vocabulary,
            commands::record_translation_result,
            commands::list_saved_translations,
            commands::clear_history,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Moyu Translate");
}

#[cfg(test)]
mod tests {
    use super::tray_icon;

    #[test]
    fn bundled_tray_icon_is_square_and_visible() {
        let icon = tray_icon().expect("tray icon should decode");
        assert_eq!(icon.width(), icon.height());
        assert!(icon.width() >= 32);
        assert!(icon.rgba().chunks_exact(4).any(|pixel| pixel[3] > 0));
        assert!(icon.rgba().chunks_exact(4).any(|pixel| pixel[3] == 0));
    }
}
