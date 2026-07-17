use std::{
    path::PathBuf,
    process::Command,
    sync::{
        atomic::{AtomicBool, AtomicU64, Ordering},
        Arc,
    },
    thread,
    time::Duration,
};

use core_foundation::runloop::{kCFRunLoopCommonModes, CFRunLoop};
use core_foundation::{
    base::{CFRange, TCFType},
    string::{CFString, CFStringRef},
};
use core_graphics::event::CGEvent;
use core_graphics::event::{
    CGEventTap, CGEventTapLocation, CGEventTapOptions, CGEventTapPlacement, CGEventType,
    EventField, KeyCode,
};
use serde::Deserialize;
use tauri::{AppHandle, Emitter, Manager, PhysicalPosition};

use crate::{
    models::{CursorAnchor, PlatformCapabilities},
    state::AppState,
};

#[link(name = "ApplicationServices", kind = "framework")]
extern "C" {
    fn AXIsProcessTrusted() -> bool;
}

#[link(name = "CoreGraphics", kind = "framework")]
extern "C" {
    fn CGPreflightScreenCaptureAccess() -> bool;
}

#[link(name = "CoreServices", kind = "framework")]
extern "C" {
    fn DCSCopyTextDefinition(
        dictionary: *const std::ffi::c_void,
        text: CFStringRef,
        range: CFRange,
    ) -> CFStringRef;
}

pub fn capabilities() -> PlatformCapabilities {
    let accessibility = unsafe { AXIsProcessTrusted() };
    let screen_capture = unsafe { CGPreflightScreenCaptureAccess() };
    PlatformCapabilities {
        platform: "macos".into(),
        trigger_key_label: "Option".into(),
        accessibility: if accessibility {
            "granted"
        } else {
            "not-determined"
        }
        .into(),
        screen_capture: if screen_capture {
            "granted"
        } else {
            "not-determined"
        }
        .into(),
        text_to_speech: true,
        platform_dictionary: true,
        launch_at_login: true,
    }
}

pub fn start_hold_monitor(app: AppHandle) {
    thread::spawn(move || {
        let held = Arc::new(AtomicBool::new(false));
        let cancelled = Arc::new(AtomicBool::new(false));
        let fired = Arc::new(AtomicBool::new(false));
        let generation = Arc::new(AtomicU64::new(0));
        let callback_held = Arc::clone(&held);
        let callback_cancelled = Arc::clone(&cancelled);
        let callback_fired = Arc::clone(&fired);
        let callback_generation = Arc::clone(&generation);
        let tap = CGEventTap::new(
            CGEventTapLocation::Session,
            CGEventTapPlacement::HeadInsertEventTap,
            CGEventTapOptions::ListenOnly,
            vec![CGEventType::FlagsChanged, CGEventType::KeyDown],
            move |_, event_type, event| {
                let key_code =
                    event.get_integer_value_field(EventField::KEYBOARD_EVENT_KEYCODE) as u16;
                let is_option = key_code == KeyCode::OPTION || key_code == KeyCode::RIGHT_OPTION;
                if matches!(event_type, CGEventType::FlagsChanged) && is_option {
                    let option_active = event
                        .get_flags()
                        .contains(core_graphics::event::CGEventFlags::CGEventFlagAlternate);
                    if option_active && !callback_held.swap(true, Ordering::SeqCst) {
                        callback_cancelled.store(false, Ordering::SeqCst);
                        callback_fired.store(false, Ordering::SeqCst);
                        let current_generation =
                            callback_generation.fetch_add(1, Ordering::SeqCst) + 1;
                        let preferences = app
                            .state::<AppState>()
                            .user_store
                            .lock()
                            .preferences()
                            .unwrap_or_default();
                        if !preferences.enabled {
                            callback_held.store(false, Ordering::SeqCst);
                            callback_cancelled.store(true, Ordering::SeqCst);
                            return None;
                        }
                        let timer_held = Arc::clone(&callback_held);
                        let timer_cancelled = Arc::clone(&callback_cancelled);
                        let timer_fired = Arc::clone(&callback_fired);
                        let timer_generation = Arc::clone(&callback_generation);
                        let timer_app = app.clone();
                        thread::spawn(move || {
                            thread::sleep(Duration::from_millis(
                                preferences.hold_duration_milliseconds,
                            ));
                            if current_generation == timer_generation.load(Ordering::SeqCst)
                                && timer_held.load(Ordering::SeqCst)
                                && !timer_cancelled.load(Ordering::SeqCst)
                                && !timer_fired.swap(true, Ordering::SeqCst)
                            {
                                show_panel_near_cursor(&timer_app);
                            }
                        });
                    } else if !option_active {
                        callback_held.store(false, Ordering::SeqCst);
                        callback_cancelled.store(false, Ordering::SeqCst);
                        callback_fired.store(false, Ordering::SeqCst);
                        callback_generation.fetch_add(1, Ordering::SeqCst);
                    }
                } else if matches!(event_type, CGEventType::KeyDown)
                    && callback_held.load(Ordering::SeqCst)
                {
                    callback_cancelled.store(true, Ordering::SeqCst);
                    callback_generation.fetch_add(1, Ordering::SeqCst);
                }
                None
            },
        );
        let Ok(tap) = tap else {
            return;
        };
        let current = CFRunLoop::get_current();
        unsafe {
            let Ok(loop_source) = tap.mach_port.create_runloop_source(0) else {
                return;
            };
            current.add_source(&loop_source, kCFRunLoopCommonModes);
            tap.enable();
            CFRunLoop::run_current();
        }
    });
}

fn show_panel_near_cursor(app: &AppHandle) {
    let Ok(source) = core_graphics::event_source::CGEventSource::new(
        core_graphics::event_source::CGEventSourceStateID::CombinedSessionState,
    ) else {
        return;
    };
    let Ok(event) = CGEvent::new(source) else {
        return;
    };
    let point = event.location();
    *app.state::<AppState>().last_anchor.lock() = Some(CursorAnchor {
        x: point.x,
        y: point.y,
        display_id: None,
    });
    let app_handle = app.clone();
    let _ = app.run_on_main_thread(move || {
        if let Some(window) = app_handle.get_webview_window("panel") {
            let (x, y) = clamped_panel_position(&window, point.x as i32, point.y as i32);
            let _ = window.set_position(PhysicalPosition::new(x, y));
            let _ = window.show();
            let _ = window.set_focus();
            let _ = app_handle.emit(
                "moyu://trigger",
                serde_json::json!({ "x": point.x, "y": point.y }),
            );
        }
    });
}

fn clamped_panel_position(
    window: &tauri::WebviewWindow,
    cursor_x: i32,
    cursor_y: i32,
) -> (i32, i32) {
    let size = window
        .outer_size()
        .unwrap_or(tauri::PhysicalSize::new(420, 480));
    let monitors = window.available_monitors().unwrap_or_default();
    let monitor = monitors.iter().find(|monitor| {
        let position = monitor.position();
        let monitor_size = monitor.size();
        cursor_x >= position.x
            && cursor_x < position.x + monitor_size.width as i32
            && cursor_y >= position.y
            && cursor_y < position.y + monitor_size.height as i32
    });
    let Some(monitor) = monitor.or_else(|| monitors.first()) else {
        return (cursor_x + 16, cursor_y + 16);
    };
    let position = monitor.position();
    let monitor_size = monitor.size();
    let right = position.x + monitor_size.width as i32;
    let bottom = position.y + monitor_size.height as i32;
    let width = size.width as i32;
    let height = size.height as i32;
    let mut x = cursor_x + 16;
    let mut y = cursor_y + 16;
    if x + width + 8 > right {
        x = cursor_x - width - 16;
    }
    if y + height + 8 > bottom {
        y = cursor_y - height - 16;
    }
    (
        x.clamp(position.x + 8, (right - width - 8).max(position.x + 8)),
        y.clamp(position.y + 8, (bottom - height - 8).max(position.y + 8)),
    )
}

pub fn speak(text: &str, locale: &str) -> Result<(), String> {
    let voice = if locale == "en-GB" {
        "Daniel"
    } else {
        "Samantha"
    };
    Command::new("say")
        .args(["-v", voice, text])
        .spawn()
        .map(|_| ())
        .map_err(|error| error.to_string())
}

pub fn system_dictionary_definition(term: &str) -> Option<String> {
    let trimmed = term.trim();
    if trimmed.is_empty() {
        return None;
    }
    let text = CFString::new(trimmed);
    let definition = unsafe {
        DCSCopyTextDefinition(
            std::ptr::null(),
            text.as_concrete_TypeRef(),
            CFRange {
                location: 0,
                length: text.char_len(),
            },
        )
    };
    if definition.is_null() {
        return None;
    }
    let definition = unsafe { CFString::wrap_under_create_rule(definition) }.to_string();
    sanitize_system_definition(&definition)
}

fn sanitize_system_definition(definition: &str) -> Option<String> {
    let compact = definition
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .collect::<Vec<_>>()
        .join("\n");
    if compact.is_empty() {
        return None;
    }
    if compact.chars().count() <= 1_200 {
        return Some(compact);
    }
    Some(format!(
        "{}...",
        compact.chars().take(1_200).collect::<String>()
    ))
}

#[derive(Deserialize)]
struct CaptureOutput {
    text: String,
}

pub async fn capture_text_at_cursor(
    _app: &AppHandle,
    anchor: &CursorAnchor,
) -> Result<String, String> {
    let helper = capture_helper_path()?;
    let x = anchor.x.to_string();
    let y = anchor.y.to_string();
    tokio::task::spawn_blocking(move || {
        let output = Command::new(helper)
            .args([x, y])
            .output()
            .map_err(|error| error.to_string())?;
        if !output.status.success() {
            let message = String::from_utf8_lossy(&output.stderr).trim().to_string();
            return Err(if message.is_empty() {
                "光标取词失败。".into()
            } else {
                message
            });
        }
        let captured: CaptureOutput = serde_json::from_slice(&output.stdout)
            .map_err(|error| format!("无法读取取词结果：{error}"))?;
        if captured.text.trim().is_empty() {
            Err("没有识别到光标附近的文字。".into())
        } else {
            Ok(captured.text)
        }
    })
    .await
    .map_err(|error| error.to_string())?
}

fn capture_helper_path() -> Result<PathBuf, String> {
    let bundled = std::env::current_exe()
        .ok()
        .and_then(|path| path.parent().map(|parent| parent.join("moyu-capture")));
    let target = if cfg!(target_arch = "x86_64") {
        "x86_64-apple-darwin"
    } else {
        "aarch64-apple-darwin"
    };
    let development = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("bin")
        .join(format!("moyu-capture-{target}"));
    bundled
        .filter(|path| path.exists())
        .or_else(|| development.exists().then_some(development))
        .ok_or_else(|| "找不到 macOS 取词组件，请重新安装 Moyu Translate。".into())
}

#[cfg(test)]
mod tests {
    use super::{sanitize_system_definition, system_dictionary_definition};

    #[test]
    fn compacts_and_limits_system_dictionary_text() {
        assert_eq!(
            sanitize_system_definition(" ability \n\n skill "),
            Some("ability\nskill".into())
        );
        let long = "a".repeat(1_300);
        assert_eq!(
            sanitize_system_definition(&long)
                .expect("definition")
                .chars()
                .count(),
            1_203
        );
    }

    #[test]
    fn system_dictionary_query_is_safe_when_no_definition_is_enabled() {
        let _ = system_dictionary_definition("ability");
    }
}
