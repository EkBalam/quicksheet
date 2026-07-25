use serde::{Deserialize, Serialize};
use std::fs;
use std::sync::Mutex;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Manager, State};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

const DEFAULT_SHORTCUT: &str = "Ctrl+Alt+E";

const LETTER_CODES: [Code; 26] = [
    Code::KeyA,
    Code::KeyB,
    Code::KeyC,
    Code::KeyD,
    Code::KeyE,
    Code::KeyF,
    Code::KeyG,
    Code::KeyH,
    Code::KeyI,
    Code::KeyJ,
    Code::KeyK,
    Code::KeyL,
    Code::KeyM,
    Code::KeyN,
    Code::KeyO,
    Code::KeyP,
    Code::KeyQ,
    Code::KeyR,
    Code::KeyS,
    Code::KeyT,
    Code::KeyU,
    Code::KeyV,
    Code::KeyW,
    Code::KeyX,
    Code::KeyY,
    Code::KeyZ,
];

const DIGIT_CODES: [Code; 10] = [
    Code::Digit0,
    Code::Digit1,
    Code::Digit2,
    Code::Digit3,
    Code::Digit4,
    Code::Digit5,
    Code::Digit6,
    Code::Digit7,
    Code::Digit8,
    Code::Digit9,
];

struct AppState {
    current_shortcut: Mutex<Option<Shortcut>>,
}

#[derive(Serialize, Deserialize)]
struct Settings {
    shortcut: String,
}

impl Default for Settings {
    fn default() -> Self {
        Settings {
            shortcut: DEFAULT_SHORTCUT.to_string(),
        }
    }
}

fn settings_path(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("settings.json"))
}

fn load_settings(app: &AppHandle) -> Settings {
    settings_path(app)
        .ok()
        .and_then(|path| fs::read_to_string(path).ok())
        .and_then(|contents| serde_json::from_str(&contents).ok())
        .unwrap_or_default()
}

fn save_settings(app: &AppHandle, settings: &Settings) -> Result<(), String> {
    let path = settings_path(app)?;
    let contents = serde_json::to_string_pretty(settings).map_err(|e| e.to_string())?;
    fs::write(path, contents).map_err(|e| e.to_string())
}

fn parse_key_code(key: &str) -> Result<Code, String> {
    let upper = key.to_uppercase();
    let mut chars = upper.chars();
    let ch = chars.next().ok_or_else(|| "Falta la tecla".to_string())?;
    if chars.next().is_some() {
        return Err(format!("Tecla no soportada: {upper}"));
    }
    match ch {
        'A'..='Z' => Ok(LETTER_CODES[(ch as u8 - b'A') as usize]),
        '0'..='9' => Ok(DIGIT_CODES[(ch as u8 - b'0') as usize]),
        _ => Err(format!("Tecla no soportada: {upper}")),
    }
}

fn parse_shortcut(text: &str) -> Result<Shortcut, String> {
    let parts: Vec<&str> = text.split('+').map(|p| p.trim()).filter(|p| !p.is_empty()).collect();
    let (key_part, mod_parts) = parts
        .split_last()
        .ok_or_else(|| "Atajo vacío".to_string())?;

    let mut mods = Modifiers::empty();
    for m in mod_parts {
        match m.to_uppercase().as_str() {
            "CTRL" | "CONTROL" => mods |= Modifiers::CONTROL,
            "ALT" => mods |= Modifiers::ALT,
            "SHIFT" => mods |= Modifiers::SHIFT,
            "SUPER" | "WIN" | "WINDOWS" | "CMD" => mods |= Modifiers::SUPER,
            other => return Err(format!("Modificador desconocido: {other}")),
        }
    }

    let code = parse_key_code(key_part)?;
    let mods_opt = if mods.is_empty() { None } else { Some(mods) };
    Ok(Shortcut::new(mods_opt, code))
}

fn toggle_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let is_visible = window.is_visible().unwrap_or(false);
        if is_visible {
            let _ = window.hide();
        } else {
            let _ = window.show();
            let _ = window.set_focus();
        }
    }
}

fn apply_shortcut(app: &AppHandle, state: &AppState, text: &str) -> Result<(), String> {
    let parsed = parse_shortcut(text)?;

    let mut current = state.current_shortcut.lock().unwrap();
    if let Some(old) = current.take() {
        let _ = app.global_shortcut().unregister(old);
    }
    app.global_shortcut()
        .register(parsed)
        .map_err(|e| format!("No se pudo registrar el atajo (¿ya está en uso?): {e}"))?;
    *current = Some(parsed);
    Ok(())
}

#[tauri::command]
fn get_shortcut(app: AppHandle) -> String {
    load_settings(&app).shortcut
}

#[tauri::command]
fn set_shortcut(app: AppHandle, state: State<AppState>, shortcut: String) -> Result<(), String> {
    apply_shortcut(&app, &state, &shortcut)?;
    save_settings(&app, &Settings { shortcut })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(AppState {
            current_shortcut: Mutex::new(None),
        })
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _shortcut, event| {
                    if event.state() == ShortcutState::Pressed {
                        toggle_main_window(app);
                    }
                })
                .build(),
        )
        .invoke_handler(tauri::generate_handler![get_shortcut, set_shortcut])
        .setup(|app| {
            let handle = app.handle().clone();
            let settings = load_settings(&handle);
            let state = app.state::<AppState>();
            if let Err(e) = apply_shortcut(&handle, &state, &settings.shortcut) {
                eprintln!("Warning: {e}");
            }

            let show_hide = MenuItem::with_id(app, "show_hide", "Mostrar/Ocultar", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Salir", true, None::<&str>)?;
            let tray_menu = Menu::with_items(app, &[&show_hide, &quit])?;

            TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&tray_menu)
                .show_menu_on_left_click(true)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show_hide" => toggle_main_window(app),
                    "quit" => app.exit(0),
                    _ => {}
                })
                .build(app)?;

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                window.hide().unwrap();
                api.prevent_close();
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
