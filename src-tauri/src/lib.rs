use std::path::Path;

use tauri::Manager;
use sy_note_books_core::models::workspace::WorkspaceInfo;
use sy_note_books_core::services::{asset as asset_service, export as export_service, file as file_service, settings as settings_service, workspace as ws_service};

#[tauri::command]
fn greet() -> String {
    "Hello from sy-note-books!".into()
}

#[tauri::command]
fn parse_summary(content: String) -> Vec<sy_note_books_core::models::workspace::SummaryEntry> {
    ws_service::parse_summary(&content)
}

#[tauri::command]
fn parse_workspace_json(content: String) -> Result<sy_note_books_core::models::workspace::WorkspaceMeta, String> {
    ws_service::parse_workspace_json(&content)
}

#[tauri::command]
fn open_workspace(path: String) -> Result<WorkspaceInfo, String> {
    ws_service::open_workspace(Path::new(&path))
}

#[tauri::command]
fn create_workspace(
    path: String,
    title: String,
    author: String,
    language: Option<String>,
) -> Result<WorkspaceInfo, String> {
    ws_service::create_workspace(Path::new(&path), &title, &author, language.as_deref())
}

#[tauri::command]
fn read_file(path: String) -> Result<String, String> {
    file_service::read_file(Path::new(&path))
}

#[tauri::command]
fn save_file(path: String, content: String) -> Result<(), String> {
    file_service::save_file(Path::new(&path), &content)
}

#[tauri::command]
fn read_all_md_files(workspace_path: String) -> Result<Vec<sy_note_books_core::models::workspace::MdFileContent>, String> {
    file_service::read_all_md_files(Path::new(&workspace_path))
}

#[tauri::command]
fn create_chapter(workspace_path: String, title: String) -> Result<sy_note_books_core::models::workspace::ChapterInfo, String> {
    ws_service::create_chapter(Path::new(&workspace_path), &title)
}

#[tauri::command]
fn create_page(workspace_path: String, chapter_path: String, title: String) -> Result<sy_note_books_core::models::workspace::PageInfo, String> {
    ws_service::create_page(Path::new(&workspace_path), &chapter_path, &title)
}

#[tauri::command]
fn rename_node(workspace_path: String, path: String, new_title: String) -> Result<(), String> {
    ws_service::rename_node(Path::new(&workspace_path), &path, &new_title)
}

#[tauri::command]
fn delete_node(workspace_path: String, path: String) -> Result<(), String> {
    ws_service::delete_node(Path::new(&workspace_path), &path)
}

#[tauri::command]
fn get_settings(app: tauri::AppHandle) -> Result<sy_note_books_core::models::settings::Settings, String> {
    let config_dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    let config_path = config_dir.join("settings.json");
    settings_service::load_settings(&config_path)
}

#[tauri::command]
fn save_settings(app: tauri::AppHandle, settings: sy_note_books_core::models::settings::Settings) -> Result<(), String> {
    let config_dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    let config_path = config_dir.join("settings.json");
    settings_service::save_settings_to_file(&config_path, &settings)
}

#[tauri::command]
fn get_recent_workspaces(app: tauri::AppHandle) -> Result<Vec<sy_note_books_core::models::settings::RecentWorkspace>, String> {
    let config_dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    let config_path = config_dir.join("settings.json");
    let settings = settings_service::load_settings(&config_path)?;
    Ok(settings.recent_workspaces)
}

#[tauri::command]
fn export_chm(workspace_path: String, output_path: String, chapter: Option<String>) -> Result<String, String> {
    export_service::export_chm(Path::new(&workspace_path), &output_path, chapter.as_deref())
}

#[tauri::command]
fn export_nginx(workspace_path: String, output_path: String, chapter: Option<String>) -> Result<String, String> {
    export_service::export_nginx(Path::new(&workspace_path), &output_path, chapter.as_deref())
}

#[tauri::command]
fn get_next_image_index(assets_dir: String, doc_name: String) -> Result<u32, String> {
    asset_service::get_next_image_index_for_dir(Path::new(&assets_dir), &doc_name)
}

#[tauri::command]
fn list_assets(path: String) -> Result<Vec<sy_note_books_core::models::workspace::AssetInfo>, String> {
    asset_service::list_assets(Path::new(&path))
}

#[tauri::command]
fn save_drawnix(path: String, data: String, svg_content: String) -> Result<(), String> {
    asset_service::save_drawnix(Path::new(&path), &data, &svg_content)
}

#[tauri::command]
fn export_pdf(file_path: String) -> Result<(), String> {
    export_service::export_pdf(Path::new(&file_path))
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            parse_summary,
            parse_workspace_json,
            open_workspace,
            create_workspace,
            read_file,
            save_file,
            read_all_md_files,
            create_chapter,
            create_page,
            rename_node,
            delete_node,
            get_settings,
            save_settings,
            get_recent_workspaces,
            get_next_image_index,
            list_assets,
            save_drawnix,
            export_chm,
            export_nginx,
            export_pdf,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
