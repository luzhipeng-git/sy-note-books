use std::fs;
use std::path::Path;

use percent_encoding::percent_decode_str;
use pulldown_cmark::{html, Options, Parser};

use crate::models::workspace::SummaryEntry;
use crate::services::workspace::{parse_summary, parse_workspace_json};

// ═══════════════════════════════════════════════════════════════
// Public API
// ═══════════════════════════════════════════════════════════════

/// Export workspace as nginx-deployable static site.
/// Reads all markdown files, converts to HTML with sidebar navigation,
/// copies assets, and generates a complete static site.
pub fn export_nginx(
    workspace_path: &Path,
    output_path: &str,
    chapter: Option<&str>,
    title_override: Option<&str>,
    author_override: Option<&str>,
) -> Result<String, String> {
    let (meta, entries) = read_workspace(workspace_path, title_override, author_override)?;
    let output_dir = Path::new(output_path);

    let filtered = filter_entries(&entries, chapter);
    if filtered.is_empty() {
        return Err("没有可导出的内容".to_string());
    }

    fs::create_dir_all(output_dir).map_err(|e| format!("创建输出目录失败：{e}"))?;

    // Collect all page paths for HTML generation
    let pages = collect_pages(&filtered);

    // Generate HTML for each page
    for (title, md_rel_path) in &pages {
        let md_abs = workspace_path.join(md_rel_path);
        if !md_abs.exists() {
            continue;
        }
        let md_content = fs::read_to_string(&md_abs)
            .map_err(|e| format!("读取 {} 失败：{e}", md_rel_path))?;
        let html_content = md_to_html(&md_content);
        let html_content = rewrite_asset_urls(&html_content, workspace_path, md_rel_path);
        let html_rel = md_to_html_path(md_rel_path);
        let html_abs = output_dir.join(&html_rel);

        let root_prefix = compute_root_prefix(&html_rel);
        let nav_html = generate_nav_html(&filtered, &root_prefix, md_rel_path);

        let page_html = nginx_page_html(title, &html_content, &nav_html, &meta.title);
        write_file_with_dirs(&html_abs, &page_html)?;
    }

    // Generate index.html
    let index_html = nginx_index_html(&meta, &filtered);
    fs::write(output_dir.join("index.html"), index_html)
        .map_err(|e| format!("写入 index.html 失败：{e}"))?;

    // Copy assets
    copy_all_assets(workspace_path, output_dir, &pages)?;

    Ok(output_path.to_string())
}

/// Export workspace as CHM electronic book project.
/// Generates HTML files + .hhp/.hhc project files for CHM compilation.
pub fn export_chm(
    workspace_path: &Path,
    output_path: &str,
    chapter: Option<&str>,
    title_override: Option<&str>,
    author_override: Option<&str>,
    chmcmd_path: Option<&Path>,
) -> Result<String, String> {
    let (meta, entries) = read_workspace(workspace_path, title_override, author_override)?;
    let output_dir = Path::new(output_path);

    let filtered = filter_entries(&entries, chapter);
    if filtered.is_empty() {
        return Err("没有可导出的内容".to_string());
    }

    fs::create_dir_all(output_dir).map_err(|e| format!("创建输出目录失败：{e}"))?;

    let pages = collect_pages(&filtered);
    let mut file_list: Vec<String> = Vec::new();

    // Generate HTML for each page (no sidebar — CHM has its own navigation)
    for (title, md_rel_path) in &pages {
        let md_abs = workspace_path.join(md_rel_path);
        if !md_abs.exists() {
            continue;
        }
        let md_content = fs::read_to_string(&md_abs)
            .map_err(|e| format!("读取 {} 失败：{e}", md_rel_path))?;
        let html_content = md_to_html(&md_content);
        let html_content = rewrite_asset_urls(&html_content, workspace_path, md_rel_path);
        let html_content = replace_svg_with_png(&html_content);
        let html_rel = md_to_html_path(md_rel_path);
        let html_abs = output_dir.join(&html_rel);

        let page_html = chm_page_html(title, &html_content);
        write_file_with_dirs(&html_abs, &page_html)?;
        file_list.push(html_rel.replace('\\', "/"));
    }

    // Determine default topic (first page)
    let default_topic = pages
        .first()
        .map(|(_, p)| md_to_html_path(p))
        .unwrap_or_else(|| "index.html".to_string());

    // Generate .hhp project file
    // Prepend UTF-8 BOM so chmcmd reads it as UTF-8 instead of system ANSI (GBK on Chinese Windows)
    let hhp = generate_hhp(&meta.title, &default_topic, &file_list);
    let mut hhp_bytes = b"\xEF\xBB\xBF".to_vec(); // UTF-8 BOM
    hhp_bytes.extend_from_slice(hhp.as_bytes());
    fs::write(output_dir.join("project.hhp"), hhp_bytes)
        .map_err(|e| format!("写入 project.hhp 失败：{e}"))?;

    // Generate .hhc table of contents
    // Prepend UTF-8 BOM so chmcmd parses Chinese characters correctly
    let hhc = generate_hhc(&filtered);
    let mut hhc_bytes = b"\xEF\xBB\xBF".to_vec(); // UTF-8 BOM
    hhc_bytes.extend_from_slice(hhc.as_bytes());
    fs::write(output_dir.join("contents.hhc"), hhc_bytes)
        .map_err(|e| format!("写入 contents.hhc 失败：{e}"))?;

    // Copy assets
    copy_all_assets(workspace_path, output_dir, &pages)?;

    // Convert SVG assets to PNG (CHM's IE engine doesn't support SVG)
    let svg_count = convert_svg_assets_to_png(output_dir).unwrap_or(0);
    if svg_count > 0 {
        eprintln!("[export] Converted {svg_count} SVG files to PNG for CHM compatibility");
    }

    // Try to compile .chm using chmcmd (Free Pascal CHM compiler)
    let chm_result = compile_chm(output_dir, chmcmd_path);
    match chm_result {
        Ok(chm_path) => Ok(chm_path),
        Err(CompileChmError::CompilerNotFound) => {
            // chmcmd not available — return project directory
            Ok(output_path.to_string())
        }
        Err(CompileChmError::CompilationFailed(msg)) => {
            Err(format!("CHM 编译失败：{msg}"))
        }
    }
}

/// Export a single Markdown file as PDF.
/// The actual PDF generation is handled by the frontend (WebView print).
/// This function validates the file exists.
pub fn export_pdf(file_path: &Path) -> Result<(), String> {
    if !file_path.exists() {
        return Err(format!("文件不存在：{}", file_path.display()));
    }
    Ok(())
}

/// Copy an export output to a user-selected destination.
/// If `src` is a file (e.g., .chm), copies it into `dst/`.
/// If `src` is a directory, copies the directory into `dst/` as a subdirectory.
/// Used by the "另存为" (Save As) button in the export dialog.
pub fn copy_export_output(src: &Path, dst: &Path) -> Result<(), String> {
    if !src.exists() {
        return Err(format!("源路径不存在：{}", src.display()));
    }

    if src.is_file() {
        // Single file (e.g., .chm) — copy directly into dst/
        let file_name = src.file_name().ok_or("无法获取文件名")?;
        let dst_file = dst.join(file_name);
        fs::create_dir_all(dst).map_err(|e| format!("创建目标目录失败：{e}"))?;
        fs::copy(src, &dst_file).map_err(|e| format!("复制文件失败：{e}"))?;
    } else {
        // Directory — copy as subdirectory of dst
        let dir_name = src.file_name().ok_or("无法获取目录名")?;
        let dst_dir = dst.join(dir_name);
        copy_dir_recursive(src, &dst_dir)?;
    }
    Ok(())
}

// ═══════════════════════════════════════════════════════════════
// CHM compilation via hhc.exe (Windows only)
// ═══════════════════════════════════════════════════════════════

enum CompileChmError {
    CompilerNotFound,
    CompilationFailed(String),
}

/// Try to run chmcmd (Free Pascal CHM compiler) to compile the .chm file.
/// `chmcmd_path`: explicit path to the chmcmd binary (bundled with the app).
/// If None, falls back to searching PATH, then gives up.
///
/// On Windows, the bundled binary may be blocked by SmartScreen / Zone.Identifier.
/// As a fallback, the binary is copied to a temp directory and executed from there.
fn compile_chm(output_dir: &Path, chmcmd_path: Option<&Path>) -> Result<String, CompileChmError> {
    let hhp_path = output_dir.join("project.hhp");
    if !hhp_path.exists() {
        return Err(CompileChmError::CompilerNotFound);
    }

    // Resolve chmcmd binary path
    let chmcmd: std::path::PathBuf = match chmcmd_path {
        Some(p) => p.to_path_buf(),
        None => {
            // Fallback: try to find chmcmd in PATH
            which_chmcmd().ok_or(CompileChmError::CompilerNotFound)?
        }
    };

    if !chmcmd.exists() {
        return Err(CompileChmError::CompilerNotFound);
    }

    // Try executing chmcmd directly
    match execute_chmcmd(&chmcmd, &hhp_path, output_dir) {
        Ok(chm_path) => Ok(chm_path),
        Err(direct_err) => {
            // If direct execution failed, try copying to a temp directory.
            // This works around Windows SmartScreen / Zone.Identifier (MOTW) blocking.
            if let Ok(temp_dir) = std::env::temp_dir().canonicalize() {
                let temp_chmcmd = temp_dir.join("chmcmd-tmp");
                let temp_chmcmd = if cfg!(windows) {
                    temp_chmcmd.with_extension("exe")
                } else {
                    temp_chmcmd
                };

                if fs::copy(&chmcmd, &temp_chmcmd).is_ok() {
                    match execute_chmcmd(&temp_chmcmd, &hhp_path, output_dir) {
                        Ok(chm_path) => {
                            let _ = fs::remove_file(&temp_chmcmd);
                            return Ok(chm_path);
                        }
                        Err(_) => {
                            let _ = fs::remove_file(&temp_chmcmd);
                        }
                    }
                }
            }

            // Both attempts failed — return original error
            Err(direct_err)
        }
    }
}

/// Execute chmcmd with the given project file.
fn execute_chmcmd(
    chmcmd: &Path,
    hhp_path: &Path,
    output_dir: &Path,
) -> Result<String, CompileChmError> {
    let result = std::process::Command::new(chmcmd)
        .arg(hhp_path)
        .current_dir(output_dir)
        .output()
        .map_err(|e| CompileChmError::CompilationFailed(format!(
            "执行 chmcmd 失败（{}）：{e}",
            chmcmd.display()
        )))?;

    // Check if output.chm was created
    let chm_path = output_dir.join("output.chm");
    if chm_path.exists() {
        Ok(chm_path.to_string_lossy().to_string())
    } else {
        let stdout = String::from_utf8_lossy(&result.stdout);
        let stderr = String::from_utf8_lossy(&result.stderr);
        Err(CompileChmError::CompilationFailed(format!(
            "chmcmd 未生成 .chm 文件。{}",
            if stderr.is_empty() && stdout.is_empty() {
                String::new()
            } else {
                format!("\n{stdout}\n{stderr}")
            }
        )))
    }
}

/// Simple which-like search for chmcmd in PATH.
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

// ═══════════════════════════════════════════════════════════════
// Markdown → HTML
// ═══════════════════════════════════════════════════════════════

fn md_to_html(md: &str) -> String {
    let mut options = Options::empty();
    options.insert(Options::ENABLE_TABLES);
    options.insert(Options::ENABLE_FOOTNOTES);
    options.insert(Options::ENABLE_STRIKETHROUGH);
    options.insert(Options::ENABLE_TASKLISTS);

    let parser = Parser::new_ext(md, options);
    let mut html_output = String::with_capacity(md.len() * 2);
    html::push_html(&mut html_output, parser);
    html_output
}

/// Rewrite image/audio/video src attributes in HTML from Tauri asset protocol
/// to relative file paths. Handles:
/// - `asset://localhost/path` → relative path from md_rel_path to workspace
/// - `http://asset.localhost/path` → same
/// - `https://asset.localhost/path` → same
fn rewrite_asset_urls(html: &str, workspace_path: &Path, _md_rel_path: &str) -> String {
    // Collect all replacements first, then apply them (avoids index-shifting bugs)
    let mut replacements: Vec<(String, String)> = Vec::new();

    let patterns = [
        "asset://localhost/",
        "http://asset.localhost/",
        "https://asset.localhost/",
    ];

    for pattern in &patterns {
        let mut search_from = 0;
        while let Some(pos) = html[search_from..].find(pattern) {
            let abs_pos = search_from + pos;
            let url_start = abs_pos + pattern.len();

            // Find end of URL (next quote, space, or tag close)
            let rest = &html[url_start..];
            let url_end = rest
                .find(&['"', ' ', '\'', '>'][..])
                .unwrap_or(rest.len());
            let asset_path = &rest[..url_end];

            // Try to convert absolute path to relative
            // 1. URL-decode: HTML src may contain %20 for spaces, etc.
            // 2. Tauri asset protocol strips the leading "/" from absolute paths
            //    (e.g., "/home/user/ws" → "asset://localhost/home/user/ws"),
            //    so we prepend "/" for strip_prefix to match workspace_path.
            //    Windows paths (containing ":") already have a drive letter, no fixup needed.
            let decoded = percent_decode_str(asset_path)
                .decode_utf8_lossy()
                .to_string();
            let owned;
            let fs_path = if !decoded.starts_with('/') && !decoded.contains(':') {
                owned = format!("/{decoded}");
                Path::new(&owned)
            } else {
                Path::new(&decoded)
            };
            if let Ok(rel) = fs_path.strip_prefix(workspace_path) {
                let rel_str = rel.to_string_lossy().replace('\\', "/");
                let full_url = format!("{pattern}{asset_path}");
                // Avoid duplicate replacements
                if !replacements.iter().any(|(old, _)| old == &full_url) {
                    replacements.push((full_url, rel_str));
                }
            }

            search_from = url_start + 1;
        }
    }

    // Apply replacements to a new string (longest first to avoid partial matches)
    replacements.sort_by(|a, b| b.0.len().cmp(&a.0.len()));
    let mut result = html.to_string();
    for (old, new) in &replacements {
        result = result.replace(old, new);
    }
    result
}

// ═══════════════════════════════════════════════════════════════
// Workspace reading helpers
// ═══════════════════════════════════════════════════════════════

struct WorkspaceExportMeta {
    title: String,
    author: String,
}

fn read_workspace(
    workspace_path: &Path,
    title_override: Option<&str>,
    author_override: Option<&str>,
) -> Result<(WorkspaceExportMeta, Vec<SummaryEntry>), String> {
    if !workspace_path.exists() {
        return Err(format!("Workspace 路径不存在：{}", workspace_path.display()));
    }

    // Read workspace.json
    let json_path = workspace_path.join("workspace.json");
    let json_content = fs::read_to_string(&json_path)
        .map_err(|e| format!("读取 workspace.json 失败：{e}"))?;
    let ws_meta = parse_workspace_json(&json_content)
        .map_err(|e| format!("解析 workspace.json 失败：{e}"))?;

    let title = title_override
        .map(|t| t.to_string())
        .unwrap_or(ws_meta.title);
    let author = author_override
        .map(|a| a.to_string())
        .unwrap_or(ws_meta.author);

    // Read SUMMARY.md
    let summary_path = workspace_path.join("SUMMARY.md");
    let summary_content = fs::read_to_string(&summary_path)
        .map_err(|e| format!("读取 SUMMARY.md 失败：{e}"))?;
    let entries = parse_summary(&summary_content);

    Ok((
        WorkspaceExportMeta { title, author },
        entries,
    ))
}

// ═══════════════════════════════════════════════════════════════
// Entry filtering and page collection
// ═══════════════════════════════════════════════════════════════

fn filter_entries<'a>(entries: &'a [SummaryEntry], chapter: Option<&str>) -> Vec<&'a SummaryEntry> {
    let filtered: Vec<&'a SummaryEntry> = match chapter {
        None => entries.iter().collect(),
        Some(ch) => {
            // Match chapter by: path starts with chapter dir, or chapter dir is parent of entry path
            entries
                .iter()
                .filter(|e| {
                    let entry_dir = Path::new(&e.path)
                        .parent()
                        .map(|p| p.to_string_lossy().to_string())
                        .unwrap_or_default();
                    entry_dir == ch || e.path.starts_with(&format!("{}/", ch))
                })
                .collect()
        }
    };

    // Always exclude dist/ entries from export output
    filter_out_dist(&filtered)
}

/// Recursively remove entries whose path starts with dist/.
fn filter_out_dist<'a>(entries: &[&'a SummaryEntry]) -> Vec<&'a SummaryEntry> {
    entries
        .iter()
        .filter(|e| {
            !e.path.starts_with("dist/") && !e.path.starts_with("dist\\") && e.path != "dist"
        })
        .copied()
        .collect()
}

/// Flatten SummaryEntry tree into (title, md_relative_path) pairs.
fn collect_pages(entries: &[&SummaryEntry]) -> Vec<(String, String)> {
    let mut pages = Vec::new();
    for entry in entries {
        collect_pages_recursive(entry, &mut pages);
    }
    pages
}

fn collect_pages_recursive(entry: &SummaryEntry, pages: &mut Vec<(String, String)>) {
    // Skip export output directories to avoid recursive export
    if entry.path.starts_with("dist/") || entry.path.starts_with("dist\\") {
        return;
    }
    if !entry.path.is_empty() && !entry.is_missing {
        pages.push((entry.title.clone(), entry.path.clone()));
    }
    for child in &entry.children {
        collect_pages_recursive(child, pages);
    }
}

// ═══════════════════════════════════════════════════════════════
// Path helpers
// ═══════════════════════════════════════════════════════════════

fn md_to_html_path(md_path: &str) -> String {
    if md_path.ends_with(".md") {
        format!("{}.html", &md_path[..md_path.len() - 3])
    } else {
        format!("{}.html", md_path)
    }
}

/// Compute prefix like `../` to get from a page back to site root.
fn compute_root_prefix(html_rel_path: &str) -> String {
    let depth = Path::new(html_rel_path)
        .parent()
        .map(|p| p.components().count())
        .unwrap_or(0);
    if depth == 0 {
        "./".to_string()
    } else {
        (0..depth).map(|_| "../").collect()
    }
}

// ═══════════════════════════════════════════════════════════════
// Nginx static site generation
// ═══════════════════════════════════════════════════════════════

fn nginx_page_html(title: &str, content: &str, nav_html: &str, site_title: &str) -> String {
    format!(
        r##"<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{title} - {site_title}</title>
<style>
{css}
</style>
</head>
<body>
<nav class="sidebar">
<div class="sidebar-header"><h1>{site_title}</h1></div>
<div class="nav-list">{nav}</div>
</nav>
<main class="content"><article>{content}</article></main>
</body>
</html>"##,
        css = NGINX_CSS,
        title = html_escape(title),
        content = content,
        nav = nav_html,
        site_title = html_escape(site_title),
    )
}

fn generate_nav_html(
    entries: &[&SummaryEntry],
    root_prefix: &str,
    current_md_path: &str,
) -> String {
    let mut html = String::new();
    for entry in entries {
        html.push_str("<div class=\"nav-group\">");

        // Chapter entry
        if !entry.path.is_empty() {
            let html_path = md_to_html_path(&entry.path);
            let current_html = md_to_html_path(current_md_path);
            let active = if html_path == current_html {
                " active"
            } else {
                ""
            };
            html.push_str(&format!(
                "<a href=\"{prefix}{path}\" class=\"nav-link{active}\">{title}</a>",
                prefix = root_prefix,
                path = html_path,
                active = active,
                title = html_escape(&entry.title),
            ));
        } else {
            html.push_str(&format!(
                "<span class=\"nav-label\">{title}</span>",
                title = html_escape(&entry.title)
            ));
        }

        // Children
        if !entry.children.is_empty() {
            html.push_str("<div class=\"nav-children\">");
            for child in &entry.children {
                if child.path.is_empty() || child.is_missing {
                    continue;
                }
                let html_path = md_to_html_path(&child.path);
                let current_html = md_to_html_path(current_md_path);
                let active = if html_path == current_html {
                    " active"
                } else {
                    ""
                };
                html.push_str(&format!(
                    "<a href=\"{prefix}{path}\" class=\"nav-link nav-child{active}\">{title}</a>",
                    prefix = root_prefix,
                    path = html_path,
                    active = active,
                    title = html_escape(&child.title),
                ));
            }
            html.push_str("</div>");
        }

        html.push_str("</div>");
    }
    html
}

fn nginx_index_html(meta: &WorkspaceExportMeta, entries: &[&SummaryEntry]) -> String {
    let mut chapter_list = String::new();
    for entry in entries {
        if entry.path.is_empty() {
            continue;
        }
        let html_path = md_to_html_path(&entry.path);
        chapter_list.push_str(&format!(
            "<li><a href=\"{path}\">{title}</a></li>\n",
            path = html_path,
            title = html_escape(&entry.title),
        ));
    }

    format!(
        r##"<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{title}</title>
<style>
{css}
</style>
</head>
<body class="index-page">
<div class="index-container">
<h1>{title}</h1>
<p class="index-author">作者：{author}</p>
<ul class="index-chapters">
{chapters}
</ul>
</div>
</body>
</html>"##,
        css = NGINX_CSS,
        title = html_escape(&meta.title),
        author = html_escape(&meta.author),
        chapters = chapter_list,
    )
}

// ═══════════════════════════════════════════════════════════════
// CHM project generation
// ═══════════════════════════════════════════════════════════════

fn chm_page_html(title: &str, content: &str) -> String {
    format!(
        r##"<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<title>{title}</title>
<style>
{css}
</style>
</head>
<body>
<article class="content">{content}</article>
</body>
</html>"##,
        css = CHM_CSS,
        title = html_escape(title),
        content = content,
    )
}

fn generate_hhp(title: &str, default_topic: &str, file_list: &[String]) -> String {
    // Sanitize title: remove newlines to prevent INI injection
    // Use unicode escape for non-ASCII to survive encoding misinterpretation
    let raw_title = title.lines().next().unwrap_or("Untitled");
    let safe_title = html_escape_unicode(raw_title);

    let mut files_section = String::new();
    for f in file_list {
        files_section.push_str(f);
        files_section.push('\n');
    }

    format!(
        "[OPTIONS]\n\
         Compatibility=1.1 or later\n\
         Compiled file=output.chm\n\
         Contents file=contents.hhc\n\
         Default topic={default_topic}\n\
         Display compile progress=No\n\
         Full-text search=Yes\n\
         Language=0x0804\n\
         Title={safe_title}\n\n\
         [FILES]\n\
         {files}",
        safe_title = safe_title,
        default_topic = default_topic,
        files = files_section,
    )
}

fn generate_hhc(entries: &[&SummaryEntry]) -> String {
    let mut items = String::new();
    for entry in entries {
        items.push_str(&generate_hhc_item(entry, 0));
    }

    format!(
        "<!DOCTYPE HTML PUBLIC \"-//IETF//DTD HTML//EN\">\n\
         <HTML><HEAD>\n\
         <meta http-equiv=\"Content-Type\" content=\"text/html; charset=UTF-8\">\n\
         </head><BODY>\n\
         <UL>\n\
         {items}\
         </UL>\n\
         </BODY></HTML>",
        items = items,
    )
}

fn generate_hhc_item(entry: &SummaryEntry, _depth: usize) -> String {
    let mut html = String::new();

    if !entry.path.is_empty() {
        // Leaf page — link to HTML file
        let html_path = md_to_html_path(&entry.path);
        html.push_str(&format!(
            "<LI><OBJECT type=\"text/sitemap\">\n\
             <param name=\"Name\" value=\"{title}\">\n\
             <param name=\"Local\" value=\"{path}\">\n\
             </OBJECT>\n",
            title = html_escape_unicode(&entry.title),
            path = html_path,
        ));
    } else if !entry.children.is_empty() {
        // Folder-only node (no page, just grouping) — still need an LI entry
        html.push_str(&format!(
            "<LI><OBJECT type=\"text/sitemap\">\n\
             <param name=\"Name\" value=\"{title}\">\n\
             </OBJECT>\n",
            title = html_escape_unicode(&entry.title),
        ));
    }

    if !entry.children.is_empty() {
        html.push_str("<UL>\n");
        for child in &entry.children {
            html.push_str(&generate_hhc_item(child, _depth + 1));
        }
        html.push_str("</UL>\n");
    }

    html
}

// ═══════════════════════════════════════════════════════════════
// SVG → PNG conversion for CHM export
// ═══════════════════════════════════════════════════════════════

/// Convert all .svg files in the output directory to .png for CHM compatibility.
/// CHM uses IE's Trident engine which doesn't support SVG.
/// Returns the number of files converted.
fn convert_svg_assets_to_png(output_dir: &Path) -> Result<u32, String> {
    let mut count = 0u32;
    convert_svg_recursive(output_dir, &mut count)?;
    Ok(count)
}

fn convert_svg_recursive(dir: &Path, count: &mut u32) -> Result<(), String> {
    let entries = fs::read_dir(dir).map_err(|e| format!("读取目录失败：{e}"))?;
    for entry in entries {
        let entry = entry.map_err(|e| format!("读取目录项失败：{e}"))?;
        let path = entry.path();
        if path.is_dir() {
            convert_svg_recursive(&path, count)?;
        } else if path.extension().map_or(false, |ext| ext == "svg") {
            let png_path = path.with_extension("png");
            if svg_to_png(&path, &png_path).is_ok() {
                // Remove original .svg (now replaced by .png)
                let _ = fs::remove_file(&path);
                *count += 1;
            }
        }
    }
    Ok(())
}

/// Render an SVG file to PNG using resvg.
fn svg_to_png(svg_path: &Path, png_path: &Path) -> Result<(), String> {
    let svg_data = fs::read(svg_path)
        .map_err(|e| format!("读取 SVG 失败：{e}"))?;

    let mut opt = resvg::usvg::Options::default();
    opt.fontdb_mut().load_system_fonts();

    let tree = resvg::usvg::Tree::from_data(&svg_data, &opt)
        .map_err(|e| format!("解析 SVG 失败：{e}"))?;

    let pixmap_size = tree.size().to_int_size();
    let width = pixmap_size.width();
    let height = pixmap_size.height();
    if width == 0 || height == 0 {
        return Err("SVG 尺寸为 0".to_string());
    }

    let mut pixmap = resvg::tiny_skia::Pixmap::new(width, height)
        .ok_or("创建 Pixmap 失败")?;

    resvg::render(&tree, resvg::tiny_skia::Transform::default(), &mut pixmap.as_mut());

    let png_data = pixmap.encode_png()
        .map_err(|e| format!("编码 PNG 失败：{e}"))?;

    fs::write(png_path, png_data)
        .map_err(|e| format!("写入 PNG 失败：{e}"))?;

    Ok(())
}

/// In HTML content, replace .svg image references with .png.
fn replace_svg_with_png(html: &str) -> String {
    html.replace(".svg", ".png")
}

// ═══════════════════════════════════════════════════════════════
// Asset copying
// ═══════════════════════════════════════════════════════════════

fn copy_all_assets(
    workspace_path: &Path,
    output_dir: &Path,
    pages: &[(String, String)],
) -> Result<(), String> {
    // Collect unique directories that may contain assets
    let mut dirs_to_check: Vec<String> = vec!["assets".to_string()];
    for (_, md_path) in pages {
        if let Some(parent) = Path::new(md_path).parent() {
            let asset_dir = parent.join("assets").to_string_lossy().to_string();
            if !dirs_to_check.contains(&asset_dir) {
                dirs_to_check.push(asset_dir);
            }
        }
    }

    for rel_dir in &dirs_to_check {
        // Skip dist/ directories (export output, not source content)
        if rel_dir.starts_with("dist/") || rel_dir.starts_with("dist\\") || rel_dir == "dist" {
            continue;
        }
        let src = workspace_path.join(rel_dir);
        if src.is_dir() {
            let dst = output_dir.join(rel_dir);
            copy_dir_recursive(&src, &dst)?;
        }
    }
    Ok(())
}

fn copy_dir_recursive(src: &Path, dst: &Path) -> Result<(), String> {
    fs::create_dir_all(dst).map_err(|e| format!("创建目录失败：{e}"))?;

    for entry in fs::read_dir(src).map_err(|e| format!("读取目录失败：{e}"))? {
        let entry = entry.map_err(|e| format!("读取目录项失败：{e}"))?;
        let src_path = entry.path();
        let dst_path = dst.join(entry.file_name());

        if src_path.is_dir() {
            copy_dir_recursive(&src_path, &dst_path)?;
        } else {
            fs::copy(&src_path, &dst_path)
                .map_err(|e| format!("复制文件失败：{e}"))?;
        }
    }
    Ok(())
}

// ═══════════════════════════════════════════════════════════════
// File utilities
// ═══════════════════════════════════════════════════════════════

fn write_file_with_dirs(path: &Path, content: &str) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("创建目录失败：{e}"))?;
    }
    fs::write(path, content).map_err(|e| format!("写入文件失败：{e}"))?;
    Ok(())
}

/// Escape HTML special chars AND encode non-ASCII as numeric HTML entities.
/// This ensures CHM TOC entries display correctly regardless of file encoding,
/// since ASCII-only content survives any ANSI/UTF-8 misinterpretation.
fn html_escape_unicode(s: &str) -> String {
    let mut result = String::with_capacity(s.len() * 2);
    for ch in s.chars() {
        match ch {
            '&' => result.push_str("&amp;"),
            '<' => result.push_str("&lt;"),
            '>' => result.push_str("&gt;"),
            '"' => result.push_str("&quot;"),
            c if c.is_ascii() => result.push(c),
            c => result.push_str(&format!("&#{};", c as u32)),
        }
    }
    result
}

fn html_escape(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

// ═══════════════════════════════════════════════════════════════
// CSS templates
// ═══════════════════════════════════════════════════════════════

const NGINX_CSS: &str = r#"
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;
    line-height:1.7;color:#333;background:#fff}
.sidebar{position:fixed;left:0;top:0;bottom:0;width:280px;background:#f8f9fa;
    border-right:1px solid #e0e0e0;overflow-y:auto;padding:20px 0}
.sidebar-header{padding:0 20px 16px;border-bottom:1px solid #e0e0e0;margin-bottom:12px}
.sidebar-header h1{font-size:18px;color:#1a1a1a}
.nav-group{margin-bottom:4px}
.nav-link,.nav-label{display:block;padding:6px 20px;color:#555;text-decoration:none;font-size:14px;
    transition:background .15s}
.nav-link:hover{background:#e8e8e8;color:#1a1a1a}
.nav-link.active{color:#0066cc;font-weight:600;background:#e0ecff}
.nav-children .nav-child{padding-left:36px;font-size:13px}
.content{margin-left:280px;padding:40px 48px;max-width:860px;min-height:100vh}
.content h1{font-size:28px;margin:0 0 24px;color:#1a1a1a;border-bottom:2px solid #e0e0e0;padding-bottom:12px}
.content h2{font-size:22px;margin:32px 0 16px;color:#1a1a1a}
.content h3{font-size:18px;margin:24px 0 12px;color:#333}
.content p{margin:0 0 16px}
.content ul,.content ol{margin:0 0 16px 24px}
.content li{margin-bottom:4px}
.content code{background:#f0f0f0;padding:2px 6px;border-radius:3px;font-size:90%}
.content pre{background:#f5f5f5;padding:16px;border-radius:6px;overflow-x:auto;margin:0 0 16px}
.content pre code{background:none;padding:0;font-size:13px}
.content blockquote{border-left:4px solid #ddd;padding:8px 16px;margin:0 0 16px;background:#f9f9f9;color:#666}
.content table{border-collapse:collapse;width:100%;margin:0 0 16px}
.content th,.content td{border:1px solid #ddd;padding:8px 12px;text-align:left}
.content th{background:#f0f0f0;font-weight:600}
.content img{max-width:100%;height:auto}
.index-page{display:flex;justify-content:center;align-items:center;min-height:100vh;background:#f8f9fa}
.index-container{background:#fff;padding:48px 64px;border-radius:8px;box-shadow:0 2px 12px rgba(0,0,0,.08)}
.index-container h1{font-size:32px;margin-bottom:12px;color:#1a1a1a}
.index-author{color:#888;margin-bottom:24px}
.index-chapters{list-style:none}
.index-chapters li{margin-bottom:8px}
.index-chapters a{color:#0066cc;text-decoration:none;font-size:16px}
.index-chapters a:hover{text-decoration:underline}
"#;

const CHM_CSS: &str = r#"
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,"Segoe UI",Roboto,sans-serif;line-height:1.7;color:#333;padding:20px 24px}
.content h1{font-size:24px;margin:0 0 20px;color:#1a1a1a;border-bottom:1px solid #ddd;padding-bottom:8px}
.content h2{font-size:20px;margin:28px 0 14px;color:#1a1a1a}
.content h3{font-size:16px;margin:20px 0 10px;color:#333}
.content p{margin:0 0 14px}
.content ul,.content ol{margin:0 0 14px 24px}
.content code{background:#f0f0f0;padding:2px 5px;border-radius:3px;font-size:90%}
.content pre{background:#f5f5f5;padding:14px;border-radius:4px;margin:0 0 14px}
.content pre code{background:none;padding:0}
.content blockquote{border-left:3px solid #ddd;padding:6px 14px;margin:0 0 14px;color:#666}
.content table{border-collapse:collapse;width:100%;margin:0 0 14px}
.content th,.content td{border:1px solid #ddd;padding:6px 10px}
.content th{background:#f0f0f0}
.content img{max-width:100%;height:auto}
"#;

// ═══════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════

#[cfg(test)]
mod tests {
    use super::*;
    use crate::services::workspace;
    use tempfile::TempDir;

    /// Create a minimal workspace with two chapters for export testing.
    fn setup_test_workspace(dir: &Path) {
        workspace::create_workspace(dir, "测试文档", "测试作者", Some("zh-CN")).unwrap();

        // Chapter 1
        let ch1 = dir.join("01-intro");
        fs::create_dir_all(ch1.join("assets")).unwrap();
        fs::write(
            ch1.join("index.md"),
            "# 入门指南\n\n欢迎使用本书。\n",
        )
        .unwrap();
        fs::write(
            ch1.join("quick-start.md"),
            "# 快速开始\n\n## 安装\n\n运行 `npm install`。\n\n> 注意：需要 Node.js 18+\n",
        )
        .unwrap();

        // Chapter 2
        let ch2 = dir.join("02-arch");
        fs::create_dir_all(ch2.join("assets")).unwrap();
        fs::write(ch2.join("index.md"), "# 系统架构\n\n架构概述。\n").unwrap();

        // Write SUMMARY
        let summary = "# 测试文档\n\
                        - [入门指南](01-intro/index.md)\n\
                          - [快速开始](01-intro/quick-start.md)\n\
                        - [系统架构](02-arch/index.md)\n";
        fs::write(dir.join("SUMMARY.md"), summary).unwrap();
    }

    #[test]
    fn export_nginx_creates_html_files() {
        let tmp = TempDir::new().unwrap();
        let ws = tmp.path().join("ws");
        setup_test_workspace(&ws);

        let out = tmp.path().join("dist").join("nginx-v1");
        let out_str = out.to_str().unwrap();

        let result = export_nginx(&ws, out_str, None, None, None);
        assert!(result.is_ok(), "export_nginx failed: {:?}", result);

        // Verify output directory exists
        assert!(out.is_dir());

        // Verify index.html exists
        assert!(out.join("index.html").exists());

        // Verify chapter HTML files exist
        assert!(out.join("01-intro").join("index.html").exists());
        assert!(out.join("01-intro").join("quick-start.html").exists());
        assert!(out.join("02-arch").join("index.html").exists());

        // Verify HTML content contains converted markdown
        let intro_html =
            fs::read_to_string(out.join("01-intro").join("index.html")).unwrap();
        assert!(intro_html.contains("欢迎使用本书"));
        assert!(intro_html.contains("sidebar")); // Has navigation
        assert!(intro_html.contains("快速开始")); // Nav link

        let quick_html =
            fs::read_to_string(out.join("01-intro").join("quick-start.html")).unwrap();
        assert!(quick_html.contains("npm install"));
        assert!(quick_html.contains("注意"));

        // Verify index.html contains chapter links
        let index_html = fs::read_to_string(out.join("index.html")).unwrap();
        assert!(index_html.contains("测试文档"));
        assert!(index_html.contains("入门指南"));
    }

    #[test]
    fn export_nginx_with_title_override() {
        let tmp = TempDir::new().unwrap();
        let ws = tmp.path().join("ws");
        setup_test_workspace(&ws);

        let out = tmp.path().join("dist").join("nginx-v1");
        let result = export_nginx(
            &ws,
            out.to_str().unwrap(),
            None,
            Some("自定义书名"),
            Some("自定义作者"),
        );
        assert!(result.is_ok());

        let index_html = fs::read_to_string(out.join("index.html")).unwrap();
        assert!(index_html.contains("自定义书名"));
        assert!(index_html.contains("自定义作者"));
    }

    #[test]
    fn export_nginx_with_chapter_filter() {
        let tmp = TempDir::new().unwrap();
        let ws = tmp.path().join("ws");
        setup_test_workspace(&ws);

        let out = tmp.path().join("dist").join("nginx-v1");
        let result = export_nginx(
            &ws,
            out.to_str().unwrap(),
            Some("01-intro"),
            None,
            None,
        );
        assert!(result.is_ok());

        // Should only have 01-intro files
        assert!(out.join("01-intro").join("index.html").exists());
        assert!(out.join("01-intro").join("quick-start.html").exists());
        // Should NOT have 02-arch
        assert!(!out.join("02-arch").exists());
    }

    #[test]
    fn export_chm_creates_project_files() {
        let tmp = TempDir::new().unwrap();
        let ws = tmp.path().join("ws");
        setup_test_workspace(&ws);

        let out = tmp.path().join("dist").join("chm-v1");
        let out_str = out.to_str().unwrap();

        let result = export_chm(&ws, out_str, None, None, None, None);
        assert!(result.is_ok(), "export_chm failed: {:?}", result);

        // Verify .hhp and .hhc exist
        assert!(out.join("project.hhp").exists());
        assert!(out.join("contents.hhc").exists());

        // Verify HTML files exist (no sidebar)
        assert!(out.join("01-intro").join("index.html").exists());
        assert!(out.join("01-intro").join("quick-start.html").exists());

        // Verify HHP content
        let hhp = fs::read_to_string(out.join("project.hhp")).unwrap();
        assert!(hhp.contains("output.chm"));
        assert!(hhp.contains("01-intro/index.html"));
        // Title uses html_escape_unicode — Chinese chars encoded as &#NNNN; entities
        assert!(!hhp.contains("测试文档"), "raw Chinese should be entity-encoded in HHP");
        assert!(hhp.contains("&#27979;&#35797;&#25991;&#26723;"), "title should use numeric HTML entities");

        // Verify HHC content
        let hhc = fs::read_to_string(out.join("contents.hhc")).unwrap();
        // TOC entries also use html_escape_unicode
        assert!(!hhc.contains("入门指南"), "raw Chinese should be entity-encoded in HHC");
        assert!(hhc.contains("&#20837;&#38376;&#25351;&#21335;"), "chapter title as entities");
        assert!(hhc.contains("&#24555;&#36895;&#24320;&#22987;"), "page title as entities");

        // Verify HTML has no sidebar
        let html = fs::read_to_string(out.join("01-intro").join("index.html")).unwrap();
        assert!(!html.contains("sidebar"));
        assert!(html.contains("欢迎使用本书"));
    }

    #[test]
    fn export_copies_assets() {
        let tmp = TempDir::new().unwrap();
        let ws = tmp.path().join("ws");
        setup_test_workspace(&ws);

        // Create an asset file
        fs::write(ws.join("assets").join("logo.png"), "fake-png-data").unwrap();
        fs::write(
            ws.join("01-intro").join("assets").join("diagram.svg"),
            "<svg></svg>",
        )
        .unwrap();

        let out = tmp.path().join("dist").join("nginx-v1");
        export_nginx(&ws, out.to_str().unwrap(), None, None, None).unwrap();

        // Assets should be copied
        assert!(out.join("assets").join("logo.png").exists());
        assert!(out.join("01-intro").join("assets").join("diagram.svg").exists());
    }

    #[test]
    fn export_rejects_missing_workspace() {
        let result = export_nginx(
            Path::new("/nonexistent/path"),
            "/tmp/out",
            None,
            None,
            None,
        );
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("不存在"));
    }

    #[test]
    fn export_pdf_rejects_missing_file() {
        let result = export_pdf(Path::new("/nonexistent/file.md"));
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("不存在"));
    }

    #[test]
    fn export_pdf_accepts_existing_file() {
        let tmp = TempDir::new().unwrap();
        let file = tmp.path().join("test.md");
        fs::write(&file, "# Test").unwrap();
        assert!(export_pdf(&file).is_ok());
    }

    #[test]
    fn md_to_html_handles_tables() {
        let md = "| A | B |\n|---|---|\n| 1 | 2 |\n";
        let html = md_to_html(md);
        assert!(html.contains("<table>"));
        assert!(html.contains("<th>"));
    }

    #[test]
    fn md_to_html_handles_code_blocks() {
        let md = "```js\nconsole.log('hi');\n```\n";
        let html = md_to_html(md);
        // pulldown-cmark renders fenced code blocks as <pre><code class="language-js">...</code></pre>
        assert!(html.contains("console.log"));
        assert!(html.contains("pre>"));
    }

    #[test]
    fn compute_root_prefix_works() {
        assert_eq!(compute_root_prefix("index.html"), "./");
        assert_eq!(compute_root_prefix("01-intro/index.html"), "../");
        assert_eq!(
            compute_root_prefix("01-intro/sub/index.html"),
            "../../"
        );
    }

    #[test]
    fn md_to_html_path_conversion() {
        assert_eq!(
            md_to_html_path("01-intro/quick-start.md"),
            "01-intro/quick-start.html"
        );
        assert_eq!(md_to_html_path("index.md"), "index.html");
    }

    // ── rewrite_asset_urls ─────────────────────────────────────

    #[test]
    fn rewrite_asset_urls_converts_tauri_protocol() {
        // Tauri convertFileSrc("/tmp/ws/assets/img1.png") → "asset://localhost/tmp/ws/assets/img1.png"
        // Note: no double-slash after "localhost/" — Tauri strips leading "/" from absolute path
        let html = r#"<img src="asset://localhost/tmp/ws/assets/img1.png">"#;
        let ws = Path::new("/tmp/ws");
        let result = rewrite_asset_urls(html, ws, "chapter1/page1.md");
        assert!(
            !result.contains("asset://localhost"),
            "asset protocol should be removed, got: {result}"
        );
        assert!(
            result.contains("assets/img1.png"),
            "should contain relative path, got: {result}"
        );
    }

    #[test]
    fn rewrite_asset_urls_handles_empty_input() {
        let result = rewrite_asset_urls("", Path::new("/ws"), "test.md");
        assert_eq!(result, "");
    }

    #[test]
    fn rewrite_asset_urls_skips_unrelated_urls() {
        // URL outside workspace should remain untouched
        let html = r#"<img src="asset://localhost/other/path/img.png">"#;
        let ws = Path::new("/tmp/ws");
        let result = rewrite_asset_urls(html, ws, "test.md");
        assert!(
            result.contains("asset://localhost/other/path/img.png"),
            "unrelated URL should not be modified, got: {result}"
        );
    }

    #[test]
    fn rewrite_asset_urls_handles_multiple_protocols() {
        let html = r#"<img src="http://asset.localhost/tmp/ws/a.png">
<p><img src="https://asset.localhost/tmp/ws/b.png"></p>"#;
        let ws = Path::new("/tmp/ws");
        let result = rewrite_asset_urls(html, ws, "test.md");
        assert!(!result.contains("asset.localhost"), "all protocols removed, got: {result}");
        assert!(result.contains("a.png"), "first image converted");
        assert!(result.contains("b.png"), "second image converted");
    }

    #[test]
    fn rewrite_asset_urls_longest_match_first() {
        // Ensure longer URLs are replaced first to avoid partial-match corruption
        let html = r#"<img src="asset://localhost/tmp/ws/assets/img.png">
<img src="asset://localhost/tmp/ws/assets/img.png.bak">"#;
        let ws = Path::new("/tmp/ws");
        let result = rewrite_asset_urls(html, ws, "test.md");
        assert!(!result.contains("asset://localhost"), "all protocols removed, got: {result}");
        assert!(result.contains("assets/img.png.bak"), "longer URL preserved correctly");
    }

    #[test]
    fn rewrite_asset_urls_handles_windows_path() {
        // Windows: convertFileSrc("C:/Users/test/ws/assets/img.png") → "asset://localhost/C:/Users/test/ws/assets/img.png"
        // The path contains ":" so it should NOT get a "/" prepended
        let html = r#"<img src="asset://localhost/C:/Users/test/ws/assets/img1.png">"#;
        let ws = Path::new("C:/Users/test/ws");
        let result = rewrite_asset_urls(html, ws, "chapter1/page1.md");
        assert!(
            !result.contains("asset://localhost"),
            "asset protocol should be removed, got: {result}"
        );
        assert!(
            result.contains("assets/img1.png"),
            "should contain relative path, got: {result}"
        );
    }

    #[test]
    fn rewrite_asset_urls_handles_percent_encoded_paths() {
        // Image filename with space: "my image.png" → "my%20image.png" in HTML src
        let html = r#"<img src="asset://localhost/tmp/ws/assets/my%20image.png">"#;
        let ws = Path::new("/tmp/ws");
        let result = rewrite_asset_urls(html, ws, "test.md");
        assert!(
            !result.contains("asset://localhost"),
            "asset protocol should be removed, got: {result}"
        );
        // The function decodes percent-encoding in the replacement path
        assert!(
            result.contains("assets/my image.png"),
            "relative path should be decoded, got: {result}"
        );
    }

    // ── copy_export_output ──────────────────────────────────────

    #[test]
    fn copy_export_output_handles_single_file() {
        let tmp = TempDir::new().unwrap();
        let src = tmp.path().join("output.chm");
        fs::write(&src, "chm-content").unwrap();

        let dst = tmp.path().join("desktop");
        copy_export_output(&src, &dst).unwrap();

        assert!(dst.join("output.chm").exists(), "file should be copied into dst/");
        assert_eq!(
            fs::read_to_string(dst.join("output.chm")).unwrap(),
            "chm-content"
        );
    }

    #[test]
    fn copy_export_output_handles_directory() {
        let tmp = TempDir::new().unwrap();
        let src = tmp.path().join("site");
        fs::create_dir_all(src.join("sub")).unwrap();
        fs::write(src.join("index.html"), "<html/>").unwrap();
        fs::write(src.join("sub").join("page.html"), "<p>hi</p>").unwrap();

        let dst = tmp.path().join("output");
        copy_export_output(&src, &dst).unwrap();

        // src is a directory → copied as dst/site/
        assert!(
            dst.join("site/index.html").exists(),
            "directory should be copied as subdirectory"
        );
        assert!(dst.join("site/sub/page.html").exists());
    }

    #[test]
    fn copy_export_output_rejects_missing_source() {
        let tmp = TempDir::new().unwrap();
        let result = copy_export_output(
            Path::new("/nonexistent/path/output.chm"),
            tmp.path(),
        );
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("不存在"));
    }

    // ── generate_hhp sanitization ───────────────────────────────

    #[test]
    fn generate_hhp_sanitizes_multiline_title() {
        let hhp = generate_hhp("Good Title\nEVIL=INJECTED", "index.html", &[]);
        assert!(hhp.contains("Good Title"), "first line should appear");
        assert!(
            !hhp.contains("EVIL=INJECTED"),
            "injected line should be stripped, got: {hhp}"
        );
    }

    // ── generate_hhc folder-only nodes ──────────────────────────

    #[test]
    fn generate_hhc_includes_folder_only_nodes() {
        use crate::models::workspace::SummaryEntry;

        let entry = SummaryEntry {
            title: "分组标题".into(),
            path: String::new(),
            level: 0,
            is_missing: false,
            children: vec![SummaryEntry {
                title: "子页面".into(),
                path: "ch/page.md".into(),
                level: 1,
                is_missing: false,
                children: vec![],
            }],
        };
        let hhc = generate_hhc(&[&entry]);
        // Titles are now entity-encoded via html_escape_unicode
        assert!(
            hhc.contains("&#20998;&#32452;&#26631;&#39064;"),
            "folder node title should be entity-encoded, got: {hhc}"
        );
        assert!(hhc.contains("&#23376;&#39029;&#38754;"), "child page title as entities");
        assert!(hhc.contains("ch/page.html"), "child path should be converted to .html");
    }
}
