use serde::Serialize;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::Emitter;

#[derive(Debug, Clone, Serialize)]
pub struct OpenLabResult {
    pub file_path: String,
    pub file_name: String,
    pub content: String,
}

#[tauri::command]
fn open_lab_dialog() -> Result<Option<OpenLabResult>, String> {
    let file = rfd::FileDialog::new()
        .add_filter("RouteCraft Lab (*.onlab, *.json)", &["onlab", "json"])
        .pick_file();

    if let Some(path) = file {
        let file_name = path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("lab.onlab")
            .to_string();
        let content = std::fs::read_to_string(&path)
            .map_err(|e| format!("Chyba při čtení souboru: {}", e))?;
        Ok(Some(OpenLabResult {
            file_path: path.to_string_lossy().to_string(),
            file_name,
            content,
        }))
    } else {
        Ok(None)
    }
}

#[tauri::command]
fn save_lab_dialog(content: String, default_name: Option<String>) -> Result<Option<String>, String> {
    let name = default_name.unwrap_or_else(|| "routecraft_lab.onlab".to_string());
    let file = rfd::FileDialog::new()
        .set_file_name(&name)
        .add_filter("RouteCraft Lab (*.onlab)", &["onlab"])
        .save_file();

    if let Some(path) = file {
        std::fs::write(&path, content).map_err(|e| format!("Chyba při zápisu souboru: {}", e))?;
        Ok(Some(path.to_string_lossy().to_string()))
    } else {
        Ok(None)
    }
}

#[tauri::command]
fn save_lab_file(path: String, content: String) -> Result<(), String> {
    std::fs::write(&path, content).map_err(|e| format!("Chyba při ukládání do souboru: {}", e))?;
    Ok(())
}

#[tauri::command]
fn get_cli_startup_file() -> Result<Option<OpenLabResult>, String> {
    let args: Vec<String> = std::env::args().collect();
    if args.len() > 1 {
        for arg in &args[1..] {
            if !arg.starts_with("--") {
                let path = std::path::Path::new(arg);
                if path.exists() && path.is_file() {
                    let file_name = path
                        .file_name()
                        .and_then(|n| n.to_str())
                        .unwrap_or("lab.onlab")
                        .to_string();
                    if let Ok(content) = std::fs::read_to_string(path) {
                        return Ok(Some(OpenLabResult {
                            file_path: path.to_string_lossy().to_string(),
                            file_name,
                            content,
                        }));
                    }
                }
            }
        }
    }
    Ok(None)
}

#[tauri::command]
fn toggle_fullscreen(window: tauri::Window) -> Result<bool, String> {
    let is_fullscreen = window.is_fullscreen().map_err(|e| e.to_string())?;
    let new_state = !is_fullscreen;
    window.set_fullscreen(new_state).map_err(|e| e.to_string())?;
    Ok(new_state)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let handle = app.handle();

            if cfg!(debug_assertions) {
                handle.plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            // Build native application menu
            let file_menu = Submenu::with_items(
                handle,
                "Soubor",
                true,
                &[
                    &MenuItem::with_id(handle, "new_lab", "Nová laboratoř", true, Some("CmdOrCtrl+N"))?,
                    &MenuItem::with_id(handle, "open_lab", "Otevřít laboratoř...", true, Some("CmdOrCtrl+O"))?,
                    &MenuItem::with_id(handle, "save_lab", "Uložit laboratoř", true, Some("CmdOrCtrl+S"))?,
                    &MenuItem::with_id(handle, "save_lab_as", "Uložit jako...", true, Some("CmdOrCtrl+Shift+S"))?,
                    &PredefinedMenuItem::separator(handle)?,
                    &PredefinedMenuItem::quit(handle, Some("Ukončit"))?,
                ],
            )?;

            let view_menu = Submenu::with_items(
                handle,
                "Zobrazení",
                true,
                &[
                    &MenuItem::with_id(handle, "toggle_fullscreen", "Celá obrazovka", true, Some("F11"))?,
                    &PredefinedMenuItem::separator(handle)?,
                    &MenuItem::with_id(handle, "challenges", "Výzvy a auto-grader (Challenges)", true, None::<&str>)?,
                ],
            )?;

            let help_menu = Submenu::with_items(
                handle,
                "Nápověda",
                true,
                &[
                    &MenuItem::with_id(handle, "about_routecraft", "O aplikaci RouteCraft", true, None::<&str>)?,
                ],
            )?;

            let menu = Menu::with_items(handle, &[&file_menu, &view_menu, &help_menu])?;
            app.set_menu(menu)?;

            Ok(())
        })
        .on_menu_event(|window, event| {
            let _ = window.emit("desktop-menu-event", event.id().as_ref());
        })
        .invoke_handler(tauri::generate_handler![
            open_lab_dialog,
            save_lab_dialog,
            save_lab_file,
            get_cli_startup_file,
            toggle_fullscreen,
        ])
        .run(tauri::generate_context!())
        .expect("error while building tauri application");
}
