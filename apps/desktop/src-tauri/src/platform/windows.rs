use std::{
    path::PathBuf,
    process::Command,
    sync::{
        atomic::{AtomicBool, AtomicU64, Ordering},
        OnceLock,
    },
    thread,
    time::Duration,
};

use serde::Deserialize;
use tauri::{AppHandle, Emitter, Manager, PhysicalPosition};
use windows::Win32::{
    Foundation::{HINSTANCE, LPARAM, LRESULT, POINT, WPARAM},
    System::LibraryLoader::GetModuleHandleW,
    UI::{
        Input::KeyboardAndMouse::{GetAsyncKeyState, VK_CONTROL, VK_LMENU, VK_MENU, VK_RMENU},
        WindowsAndMessaging::{
            CallNextHookEx, GetCursorPos, GetMessageW, SetWindowsHookExW, UnhookWindowsHookEx,
            HC_ACTION, KBDLLHOOKSTRUCT, MSG, WH_KEYBOARD_LL, WM_KEYDOWN, WM_KEYUP, WM_SYSKEYDOWN,
            WM_SYSKEYUP,
        },
    },
};

use crate::{
    models::{CursorAnchor, PlatformCapabilities},
    state::AppState,
};

static APP: OnceLock<AppHandle> = OnceLock::new();
static ALT_DOWN: AtomicBool = AtomicBool::new(false);
static ALT_CANCELLED: AtomicBool = AtomicBool::new(false);
static ALT_FIRED: AtomicBool = AtomicBool::new(false);
static HOLD_GENERATION: AtomicU64 = AtomicU64::new(0);

pub fn capabilities() -> PlatformCapabilities {
    PlatformCapabilities {
        platform: "windows".into(),
        trigger_key_label: "Alt".into(),
        accessibility: "granted".into(),
        screen_capture: "granted".into(),
        text_to_speech: true,
        platform_dictionary: false,
        launch_at_login: true,
    }
}

pub fn start_hold_monitor(app: AppHandle) {
    let _ = APP.set(app);
    thread::spawn(move || unsafe {
        let module = GetModuleHandleW(None).ok();
        let instance = module.map(|handle| HINSTANCE(handle.0));
        let Ok(hook) = SetWindowsHookExW(WH_KEYBOARD_LL, Some(keyboard_hook), instance, 0) else {
            return;
        };
        let mut message = MSG::default();
        while GetMessageW(&mut message, None, 0, 0).as_bool() {}
        let _ = UnhookWindowsHookEx(hook);
    });
}

unsafe extern "system" fn keyboard_hook(code: i32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
    if code < HC_ACTION as i32 {
        return unsafe { CallNextHookEx(None, code, wparam, lparam) };
    }
    let keyboard = unsafe { &*(lparam.0 as *const KBDLLHOOKSTRUCT) };
    let message = wparam.0 as u32;
    let is_down = message == WM_KEYDOWN || message == WM_SYSKEYDOWN;
    let is_up = message == WM_KEYUP || message == WM_SYSKEYUP;
    let is_alt = keyboard.vkCode == VK_MENU.0 as u32
        || keyboard.vkCode == VK_LMENU.0 as u32
        || keyboard.vkCode == VK_RMENU.0 as u32;

    if is_alt && is_down {
        let control_down = unsafe { GetAsyncKeyState(VK_CONTROL.0 as i32) } < 0;
        if control_down || keyboard.vkCode == VK_RMENU.0 as u32 {
            ALT_CANCELLED.store(true, Ordering::SeqCst);
        } else if !ALT_DOWN.swap(true, Ordering::SeqCst) {
            ALT_CANCELLED.store(false, Ordering::SeqCst);
            ALT_FIRED.store(false, Ordering::SeqCst);
            schedule_hold_trigger();
        }
        if ALT_FIRED.load(Ordering::SeqCst) {
            return LRESULT(1);
        }
    } else if is_alt && is_up {
        ALT_DOWN.store(false, Ordering::SeqCst);
        ALT_CANCELLED.store(false, Ordering::SeqCst);
        HOLD_GENERATION.fetch_add(1, Ordering::SeqCst);
        if ALT_FIRED.swap(false, Ordering::SeqCst) {
            return LRESULT(1);
        }
    } else if is_down && ALT_DOWN.load(Ordering::SeqCst) {
        ALT_CANCELLED.store(true, Ordering::SeqCst);
        HOLD_GENERATION.fetch_add(1, Ordering::SeqCst);
    }

    unsafe { CallNextHookEx(None, code, wparam, lparam) }
}

fn schedule_hold_trigger() {
    let generation = HOLD_GENERATION.fetch_add(1, Ordering::SeqCst) + 1;
    let Some(app) = APP.get().cloned() else {
        return;
    };
    let preferences = app
        .state::<AppState>()
        .user_store
        .lock()
        .preferences()
        .unwrap_or_default();
    if !preferences.enabled {
        ALT_CANCELLED.store(true, Ordering::SeqCst);
        return;
    }
    thread::spawn(move || {
        thread::sleep(Duration::from_millis(
            preferences.hold_duration_milliseconds,
        ));
        if generation == HOLD_GENERATION.load(Ordering::SeqCst)
            && ALT_DOWN.load(Ordering::SeqCst)
            && !ALT_CANCELLED.load(Ordering::SeqCst)
            && !ALT_FIRED.swap(true, Ordering::SeqCst)
        {
            show_panel_near_cursor(&app);
        }
    });
}

fn show_panel_near_cursor(app: &AppHandle) {
    let mut point = POINT::default();
    if unsafe { GetCursorPos(&mut point) }.is_err() {
        return;
    }
    *app.state::<AppState>().last_anchor.lock() = Some(CursorAnchor {
        x: point.x as f64,
        y: point.y as f64,
        display_id: None,
    });
    let app_handle = app.clone();
    let _ = app.run_on_main_thread(move || {
        if let Some(window) = app_handle.get_webview_window("panel") {
            let (x, y) = clamped_panel_position(&window, point.x, point.y);
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

pub fn speak(text: &str, _locale: &str) -> Result<(), String> {
    let escaped = text.replace('\'', "''");
    let script = format!(
        "Add-Type -AssemblyName System.Speech; $s = New-Object System.Speech.Synthesis.SpeechSynthesizer; $s.Speak('{}')",
        escaped
    );
    Command::new("powershell")
        .args(["-NoProfile", "-Command", &script])
        .spawn()
        .map(|_| ())
        .map_err(|error| error.to_string())
}

pub fn system_dictionary_definition(_term: &str) -> Option<String> {
    None
}

#[derive(Deserialize)]
struct CaptureOutput {
    text: String,
}

pub async fn capture_text_at_cursor(
    app: &AppHandle,
    anchor: &CursorAnchor,
) -> Result<String, String> {
    let helper = capture_helper_path(app)?;
    let x = anchor.x.to_string();
    let y = anchor.y.to_string();
    tokio::task::spawn_blocking(move || {
        let output = Command::new("powershell")
            .args([
                "-NoProfile",
                "-ExecutionPolicy",
                "Bypass",
                "-File",
                helper.to_string_lossy().as_ref(),
                "-X",
                &x,
                "-Y",
                &y,
            ])
            .output()
            .map_err(|error| error.to_string())?;
        if !output.status.success() {
            let message = String::from_utf8_lossy(&output.stderr).trim().to_string();
            return Err(if message.is_empty() {
                "Windows UI Automation 与 OCR 未识别到光标附近文字。".into()
            } else {
                message
            });
        }
        let captured: CaptureOutput = serde_json::from_slice(&output.stdout)
            .map_err(|error| format!("无法读取 Windows 取词结果：{error}"))?;
        Ok(captured.text)
    })
    .await
    .map_err(|error| error.to_string())?
}

fn capture_helper_path(app: &AppHandle) -> Result<PathBuf, String> {
    let bundled = app
        .path()
        .resource_dir()
        .ok()
        .map(|path| path.join("native/windows/MoyuCapture.ps1"));
    let development =
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("native/windows/MoyuCapture.ps1");
    bundled
        .filter(|path| path.exists())
        .or_else(|| development.exists().then_some(development))
        .ok_or_else(|| "找不到 Windows 取词组件，请重新安装 Moyu Translate。".into())
}
