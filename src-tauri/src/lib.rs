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
fn export_chm(app: tauri::AppHandle, workspace_path: String, output_path: String, chapter: Option<String>, title: Option<String>, author: Option<String>) -> Result<String, String> {
    let chmcmd_path = resolve_chmcmd(&app);
    export_service::export_chm(
        Path::new(&workspace_path),
        &output_path,
        chapter.as_deref(),
        title.as_deref(),
        author.as_deref(),
        chmcmd_path.as_deref(),
    )
}

#[tauri::command]
fn export_nginx(workspace_path: String, output_path: String, chapter: Option<String>, title: Option<String>, author: Option<String>) -> Result<String, String> {
    export_service::export_nginx(Path::new(&workspace_path), &output_path, chapter.as_deref(), title.as_deref(), author.as_deref())
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

#[tauri::command]
fn export_pdf_html(workspace_path: String, chapter: Option<String>, title: Option<String>, author: Option<String>) -> Result<String, String> {
    export_service::export_pdf_html(
        Path::new(&workspace_path),
        chapter.as_deref(),
        title.as_deref(),
        author.as_deref(),
    )
}

#[tauri::command]
fn copy_export_output(src: String, dst: String) -> Result<(), String> {
    export_service::copy_export_output(Path::new(&src), Path::new(&dst))
}

/// Resolve the CHM compiler binary path.
/// On Windows: prefers Microsoft hhc.exe (bundled in binaries/hhc/) for proper GBK/Chinese support.
/// On macOS/Linux: uses Free Pascal chmcmd.
fn resolve_chmcmd(app: &tauri::AppHandle) -> Option<std::path::PathBuf> {
    let resource_dir = app.path().resource_dir().ok();
    let exe_dir = std::env::current_exe().ok().and_then(|e| e.parent().map(|p| p.to_path_buf()));

    // On Windows, try Microsoft hhc.exe first (native GBK support for Chinese CHM)
    if cfg!(windows) {
        let hhc_candidates = build_hhc_candidates(&resource_dir, &exe_dir);
        for path in &hhc_candidates {
            if path.exists() {
                eprintln!("[chm] Found hhc.exe at: {}", path.display());
                return Some(path.clone());
            }
        }
        eprintln!("[chm] hhc.exe not found, checked: {:?}", hhc_candidates);
    }

    // Fall back to chmcmd (Free Pascal) on all platforms
    let ext = if cfg!(windows) { ".exe" } else { "" };
    let target_triples: &[&str] = if cfg!(windows) {
        &["x86_64-pc-windows-msvc"]
    } else if cfg!(target_os = "macos") {
        &["aarch64-apple-darwin", "x86_64-apple-darwin"]
    } else {
        &["x86_64-unknown-linux-gnu"]
    };

    let mut candidates: Vec<std::path::PathBuf> = Vec::new();

    for triple in target_triples {
        let bin_name = format!("binaries/chmcmd-{triple}{ext}");
        if let Some(ref rd) = resource_dir { candidates.push(rd.join(&bin_name)); }
        if let Some(ref ed) = exe_dir { candidates.push(ed.join(&bin_name)); }
        if let Some(ref rd) = resource_dir {
            if let Some(parent) = rd.parent() { candidates.push(parent.join(&bin_name)); }
        }
    }

    if let Some(ref ed) = exe_dir {
        for triple in target_triples { candidates.push(ed.join(format!("chmcmd-{triple}{ext}"))); }
        candidates.push(ed.join(format!("chmcmd{ext}")));
    }

    for path in &candidates {
        if path.exists() {
            eprintln!("[chmcmd] Found binary at: {}", path.display());
            return Some(path.clone());
        }
    }

    if let Some(found) = which_chmcmd() {
        eprintln!("[chmcmd] Found in PATH: {}", found.display());
        return Some(found);
    }

    eprintln!("[chmcmd] Binary not found. Checked: {:?}", candidates);
    None
}

/// Build candidate paths for Microsoft hhc.exe (Windows only).
fn build_hhc_candidates(
    resource_dir: &Option<std::path::PathBuf>,
    exe_dir: &Option<std::path::PathBuf>,
) -> Vec<std::path::PathBuf> {
    let mut candidates: Vec<std::path::PathBuf> = Vec::new();
    // hhc.exe lives in binaries/hhc/ directory (bundled as Tauri resource)
    let hhc_rel = std::path::PathBuf::from("binaries/hhc/hhc.exe");
    if let Some(ref rd) = resource_dir { candidates.push(rd.join(&hhc_rel)); }
    if let Some(ref ed) = exe_dir { candidates.push(ed.join(&hhc_rel)); }
    if let Some(ref rd) = resource_dir {
        if let Some(parent) = rd.parent() { candidates.push(parent.join(&hhc_rel)); }
    }
    candidates
}

/// Search for chmcmd in system PATH.
fn which_chmcmd() -> Option<std::path::PathBuf> {
    let path_var = std::env::var_os("PATH")?;
    let ext = if cfg!(windows) { ".exe" } else { "" };
    for dir in std::env::split_paths(&path_var) {
        let candidate = dir.join(format!("chmcmd{ext}"));
        if candidate.exists() {
            return Some(candidate);
        }
    }
    None
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
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
            export_pdf_html,
            copy_export_output,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
