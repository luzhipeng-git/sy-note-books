use std::fs;
use std::path::Path;

use crate::models::workspace::{
    RepairAction, SummaryEntry, WorkspaceInfo, WorkspaceMeta,
};

use super::path_util::ensure_relative_within_workspace;

/// Parse SUMMARY.md content into a structured summary tree.
pub fn parse_summary(content: &str) -> Vec<SummaryEntry> {
    let mut entries: Vec<SummaryEntry> = Vec::new();
    let mut current_chapter_idx: Option<usize> = None;

    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with("<!--") || trimmed.starts_with('#') {
            continue;
        }

        let is_indented = line.starts_with(' ') || line.starts_with('\t');
        let parsed = parse_summary_line(trimmed);

        if let Some((title, path)) = parsed {
            if is_indented {
                if let Some(idx) = current_chapter_idx {
                    entries[idx].children.push(SummaryEntry {
                        title,
                        path,
                        level: 2,
                        is_missing: false,
                        children: Vec::new(),
                    });
                }
            } else {
                current_chapter_idx = Some(entries.len());
                entries.push(SummaryEntry {
                    title,
                    path,
                    level: 1,
                    is_missing: false,
                    children: Vec::new(),
                });
            }
        }
    }

    entries
}

/// Parse a single SUMMARY.md line like `- [Title](path/to/file.md)`
fn parse_summary_line(line: &str) -> Option<(String, String)> {
    let line = line.trim_start_matches('-').trim();
    if !line.starts_with('[') {
        return None;
    }

    let close_bracket = line.find(']')?;
    let title = line[1..close_bracket].to_string();

    let rest = &line[close_bracket + 1..];
    if !rest.starts_with('(') {
        return None;
    }

    let close_paren = rest.find(')')?;
    let path = rest[1..close_paren].to_string();

    Some((title, path))
}

/// Read and validate workspace.json, returning parsed metadata.
pub fn parse_workspace_json(content: &str) -> Result<WorkspaceMeta, String> {
    let value: serde_json::Value =
        serde_json::from_str(content).map_err(|e| format!("Invalid JSON: {}", e))?;

    let obj = value
        .as_object()
        .ok_or_else(|| "workspace.json is not an object".to_string())?;

    let title = obj
        .get("title")
        .and_then(|v| v.as_str())
        .unwrap_or("Untitled")
        .to_string();
    let author = obj
        .get("author")
        .and_then(|v| v.as_str())
        .unwrap_or("Unknown")
        .to_string();
    let language = obj
        .get("language")
        .and_then(|v| v.as_str())
        .unwrap_or("zh-CN")
        .to_string();
    let version = obj
        .get("version")
        .and_then(|v| v.as_str())
        .unwrap_or("1.0.0")
        .to_string();
    let created = obj
        .get("created")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    Ok(WorkspaceMeta {
        title,
        author,
        language,
        version,
        created,
    })
}

/// Validate workspace directory: check workspace.json + SUMMARY.md exist.
pub fn validate_workspace(files: &[&str]) -> Result<(), String> {
    if !files.contains(&"workspace.json") {
        return Err("workspace.json not found".to_string());
    }

    if !files.contains(&"SUMMARY.md") {
        return Err("SUMMARY.md not found".to_string());
    }

    Ok(())
}

/// Generate the next image index for a document based on existing assets.
pub fn next_image_index(existing_files: &[&str], doc_name: &str) -> u32 {
    let prefix = format!("{}-img-", doc_name);
    let mut max_index: u32 = 0;

    for file in existing_files {
        if let Some(name) = file.strip_prefix(&prefix) {
            if let Some(num_part) = name.split('.').next() {
                if let Ok(n) = num_part.parse::<u32>() {
                    max_index = max_index.max(n);
                }
            }
        }
    }

    max_index + 1
}

// === Workspace open/create ===

/// On Windows, std::fs::canonicalize() returns UNC extended-length paths
/// with a `\\?\` prefix (e.g., `\\?\E:\test-notes`). This prefix breaks
/// file URL construction in the frontend and causes duplicate entries in
/// recent workspaces. Strip it so the path is a clean absolute path.
fn strip_unc_prefix(path: &Path) -> String {
    let s = path.to_string_lossy().to_string();
    // Windows UNC prefix: \\?\C:\... or \\?\UNC\server\share\...
    if s.starts_with(r"\\?\") {
        s[4..].to_string()
    } else {
        s
    }
}

/// Open an existing workspace: validate, parse, check consistency, auto-repair.
pub fn open_workspace(path: &Path) -> Result<WorkspaceInfo, String> {
    if !path.exists() {
        return Err(format!("路径不存在: {}", path.display()));
    }
    if !path.is_dir() {
        return Err(format!("路径不是目录: {}", path.display()));
    }

    // Canonicalize path to resolve symlinks, remove trailing slashes,
    // and ensure consistent format regardless of input source
    // (directory picker vs recent records).
    let canonical = path.canonicalize().map_err(|e| format!("路径规范化失败: {e}"))?;

    let json_path = canonical.join("workspace.json");
    if !json_path.exists() {
        return Err("workspace.json 不存在".to_string());
    }
    let json_content =
        fs::read_to_string(&json_path).map_err(|e| format!("读取 workspace.json 失败: {}", e))?;
    let meta = parse_workspace_json(&json_content)
        .map_err(|e| format!("workspace.json 损坏: {}。请修复后重试。", e))?;

    let summary_path = canonical.join("SUMMARY.md");
    if !summary_path.exists() {
        return Err("SUMMARY.md 不存在".to_string());
    }
    let summary_content =
        fs::read_to_string(&summary_path).map_err(|e| format!("读取 SUMMARY.md 失败: {}", e))?;
    let mut summary = parse_summary(&summary_content);

    let mut repairs = Vec::new();
    let disk_dirs = scan_chapter_dirs(&canonical);

    // Mark missing files
    for entry in &mut summary {
        let full_path = canonical.join(&entry.path);
        if !full_path.exists() {
            entry.is_missing = true;
            repairs.push(RepairAction {
                kind: "missing_file".to_string(),
                detail: format!("文件缺失: {}", entry.path),
            });
        }
        for child in &mut entry.children {
            let child_full = canonical.join(&child.path);
            if !child_full.exists() {
                child.is_missing = true;
                repairs.push(RepairAction {
                    kind: "missing_file".to_string(),
                    detail: format!("文件缺失: {}", child.path),
                });
            }
        }
    }

    // Auto-append disk dirs not in SUMMARY
    let summary_dir_names: Vec<String> = summary
        .iter()
        .filter_map(|e| {
            Path::new(&e.path)
                .parent()
                .and_then(|p| p.file_name())
                .map(|n| n.to_string_lossy().to_string())
        })
        .collect();

    for dir_name in &disk_dirs {
        if !summary_dir_names.contains(dir_name) {
            let dir_path = canonical.join(dir_name);
            let index_path = dir_path.join("index.md");
            let title = if index_path.exists() {
                extract_first_heading(
                    fs::read_to_string(&index_path).unwrap_or_default(),
                )
                .unwrap_or_else(|| dir_name.clone())
            } else {
                dir_name.clone()
            };
            let relative_path = format!("{}/index.md", dir_name);

            summary.push(SummaryEntry {
                title: title.clone(),
                path: relative_path,
                level: 1,
                is_missing: !index_path.exists(),
                children: Vec::new(),
            });

            repairs.push(RepairAction {
                kind: "added_missing_chapter".to_string(),
                detail: format!("自动添加缺失章节: {}", title),
            });
        }
    }

    if repairs
        .iter()
        .any(|r| r.kind == "added_missing_chapter")
    {
        let _ = write_summary(&canonical, &summary, &meta.title);
    }

    Ok(WorkspaceInfo {
        root_path: strip_unc_prefix(&canonical),
        workspace_meta: meta,
        summary,
        repairs,
    })
}

/// Create a new workspace directory structure.
pub fn create_workspace(
    path: &Path,
    title: &str,
    author: &str,
    language: Option<&str>,
) -> Result<WorkspaceInfo, String> {
    fs::create_dir_all(path).map_err(|e| format!("创建目录失败: {}", e))?;

    let lang = language.unwrap_or("zh-CN");

    let json_content = serde_json::json!({
        "_comment": "此文件由书昀笔记自动维护，请勿手动编辑",
        "title": title,
        "author": author,
        "language": lang,
        "version": "1.0.0",
        "created": chrono_now(),
    });
    let json_str =
        serde_json::to_string_pretty(&json_content).map_err(|e| format!("序列化失败: {}", e))?;
    fs::write(path.join("workspace.json"), json_str)
        .map_err(|e| format!("写入 workspace.json 失败: {}", e))?;

    let summary_content = format!(
        "<!-- 此文件由书昀笔记自动维护，请勿手动编辑 -->\n\
         <!-- 如需调整目录结构，请在应用中操作 -->\n\
         <!-- 手动修改可能导致目录显示异常 -->\n\n\
         # {}\n",
        title
    );
    fs::write(path.join("SUMMARY.md"), summary_content)
        .map_err(|e| format!("写入 SUMMARY.md 失败: {}", e))?;

    fs::create_dir_all(path.join("assets"))
        .map_err(|e| format!("创建 assets 目录失败: {}", e))?;

    Ok(WorkspaceInfo {
        root_path: path.to_string_lossy().to_string(),
        workspace_meta: WorkspaceMeta {
            title: title.to_string(),
            author: author.to_string(),
            language: lang.to_string(),
            version: "1.0.0".to_string(),
            created: chrono_now(),
        },
        summary: Vec::new(),
        repairs: Vec::new(),
    })
}

// === SUMMARY.md read/write ===

/// Write SUMMARY.md from structured entries.
pub fn write_summary(path: &Path, entries: &[SummaryEntry], title: &str) -> Result<(), String> {
    let mut content = String::from(
        "<!-- 此文件由书昀笔记自动维护，请勿手动编辑 -->\n\
         <!-- 如需调整目录结构，请在应用中操作 -->\n\
         <!-- 手动修改可能导致目录显示异常 -->\n\n",
    );
    content.push_str(&format!("# {}\n", title));

    for entry in entries {
        content.push_str(&format!("- [{}]({})\n", entry.title, entry.path));
        for child in &entry.children {
            content.push_str(&format!("  - [{}]({})\n", child.title, child.path));
        }
    }

    fs::write(path.join("SUMMARY.md"), content)
        .map_err(|e| format!("写入 SUMMARY.md 失败: {}", e))?;

    Ok(())
}

// === Chapter CRUD ===

/// Create a new chapter directory with index.md and assets/.
/// If SUMMARY.md update fails after creating files, rolls back the created directory.
pub fn create_chapter(
    workspace_path: &Path,
    title: &str,
) -> Result<crate::models::workspace::ChapterInfo, String> {
    let existing_dirs = scan_chapter_dirs(workspace_path);
    let dir_name = generate_chapter_dir_name(title, &existing_dirs);
    ensure_relative_within_workspace(workspace_path, &dir_name)?;
    let chapter_dir = workspace_path.join(&dir_name);

    fs::create_dir_all(chapter_dir.join("assets"))
        .map_err(|e| format!("创建章节目录失败: {}", e))?;

    let index_content = format!("# {}\n", title);
    let index_path_rel = format!("{}/index.md", dir_name);
    fs::write(chapter_dir.join("index.md"), index_content)
        .map_err(|e| format!("创建 index.md 失败: {}", e))?;

    // Update SUMMARY.md — rollback created directory on failure
    let summary_result = (|| -> Result<(), String> {
        let (summary, ws_title) = read_summary(workspace_path)?;
        let mut summary = summary;
        summary.push(SummaryEntry {
            title: title.to_string(),
            path: index_path_rel.clone(),
            level: 1,
            is_missing: false,
            children: vec![SummaryEntry {
                title: title.to_string(),
                path: index_path_rel.clone(),
                level: 2,
                is_missing: false,
                children: Vec::new(),
            }],
        });
        write_summary(workspace_path, &summary, &ws_title)
    })();

    if let Err(e) = summary_result {
        // Rollback: remove the created directory
        let _ = fs::remove_dir_all(&chapter_dir);
        return Err(e);
    }

    Ok(crate::models::workspace::ChapterInfo {
        name: dir_name.clone(),
        path: format!("{}/", dir_name),
        index_path: index_path_rel,
    })
}

/// Create a new page within a chapter directory.
/// If SUMMARY.md update fails after creating the file, rolls back the created file.
pub fn create_page(
    workspace_path: &Path,
    chapter_path: &str,
    title: &str,
) -> Result<crate::models::workspace::PageInfo, String> {
    let slug = slugify(title);
    let file_name = format!("{}.md", slug);
    ensure_relative_within_workspace(workspace_path, chapter_path)?;
    let chapter_dir = workspace_path.join(chapter_path);

    if !chapter_dir.exists() {
        return Err(format!("章节目录不存在: {}", chapter_path));
    }

    let file_content = format!("# {}\n", title);
    let file_path = chapter_dir.join(&file_name);
    fs::write(&file_path, file_content)
        .map_err(|e| format!("创建页面文件失败: {}", e))?;

    let relative_path = format!("{}/{}", chapter_path, file_name);

    // Update SUMMARY.md — rollback created file on failure
    let summary_result = (|| -> Result<(), String> {
        let (summary, ws_title) = read_summary(workspace_path)?;
        let mut summary = summary;
        let chapter_index_path = format!("{}/index.md", chapter_path.trim_end_matches('/'));
        for entry in &mut summary {
            if entry.path == chapter_index_path {
                entry.children.push(SummaryEntry {
                    title: title.to_string(),
                    path: relative_path.clone(),
                    level: 2,
                    is_missing: false,
                    children: Vec::new(),
                });
                break;
            }
        }
        write_summary(workspace_path, &summary, &ws_title)
    })();

    if let Err(e) = summary_result {
        // Rollback: remove the created file
        let _ = fs::remove_file(&file_path);
        return Err(e);
    }

    Ok(crate::models::workspace::PageInfo {
        name: file_name,
        path: relative_path,
    })
}

/// Rename a chapter folder or a page file. Updates SUMMARY.md first, then md heading.
/// If SUMMARY.md update fails, the file heading is NOT modified (safer rollback).
pub fn rename_node(
    workspace_path: &Path,
    node_path: &str,
    new_title: &str,
) -> Result<(), String> {
    ensure_relative_within_workspace(workspace_path, node_path)?;
    let full_path = workspace_path.join(node_path);
    if !full_path.exists() {
        return Err(format!("路径不存在: {}", node_path));
    }

    // Update SUMMARY.md FIRST — if this fails, file content is untouched
    let (summary, ws_title) = read_summary(workspace_path)?;
    let mut summary = summary;
    update_summary_title(&mut summary, node_path, new_title);
    write_summary(workspace_path, &summary, &ws_title)?;

    // Now update the file heading
    if full_path.is_dir() {
        let index_path = full_path.join("index.md");
        if index_path.exists() {
            let content = fs::read_to_string(&index_path)
                .map_err(|e| format!("读取 index.md 失败: {}", e))?;
            fs::write(&index_path, update_first_heading(&content, new_title))
                .map_err(|e| format!("更新 index.md 失败: {}", e))?;
        }
    } else {
        let content = fs::read_to_string(&full_path)
            .map_err(|e| format!("读取文件失败: {}", e))?;
        fs::write(&full_path, update_first_heading(&content, new_title))
            .map_err(|e| format!("更新文件失败: {}", e))?;
    }

    Ok(())
}

/// Delete a chapter folder or a page file. Updates SUMMARY.md first, then deletes.
/// If SUMMARY.md update fails, the file/directory is NOT deleted (safer rollback).
pub fn delete_node(workspace_path: &Path, node_path: &str) -> Result<(), String> {
    ensure_relative_within_workspace(workspace_path, node_path)?;
    let full_path = workspace_path.join(node_path);
    if !full_path.exists() {
        return Err(format!("路径不存在: {}", node_path));
    }

    // Update SUMMARY.md FIRST — if this fails, nothing is deleted
    let (summary, ws_title) = read_summary(workspace_path)?;
    let mut summary = summary;
    remove_summary_entry(&mut summary, node_path);
    write_summary(workspace_path, &summary, &ws_title)?;

    // Now safe to delete the file/directory
    if full_path.is_dir() {
        fs::remove_dir_all(&full_path).map_err(|e| format!("删除目录失败: {}", e))?;
    } else {
        fs::remove_file(&full_path).map_err(|e| format!("删除文件失败: {}", e))?;
    }

    Ok(())
}

/// Reorder chapters by renaming their `NN-` number prefixes to match the new
/// order, and updating SUMMARY.md accordingly.
///
/// `chapter_orders` is a list of `{ path, new_order }` where:
/// - `path` is the chapter directory name (e.g. "01-intro"), relative to the workspace root
/// - `new_order` is the new 1-based sequence number (1, 2, 3, ...)
///
/// The slug portion of the directory name is preserved; only the `NN-` prefix changes.
/// Two-phase rename (temp names first, then final names) avoids collisions when
/// swapping numbers (e.g. 01↔02).
///
/// Updates SUMMARY.md LAST — if SUMMARY update fails, the filesystem is NOT rolled back
/// (chapter renames are already committed), but the error surfaces so the caller can retry
/// the SUMMARY refresh by reopening the workspace.
pub fn reorder_chapters(
    workspace_path: &Path,
    chapter_orders: &[crate::models::workspace::ChapterOrder],
) -> Result<(), String> {
    // Validate all paths are within the workspace before touching anything.
    for order in chapter_orders {
        ensure_relative_within_workspace(workspace_path, &order.path)?;
    }

    // Resolve the new directory name for each chapter: keep the slug, replace the NN- prefix.
    // `path` may be the chapter dir name ("01-intro") or point at index.md ("01-intro/index.md").
    let renames: Vec<(String, String)> = chapter_orders
        .iter()
        .filter_map(|order| {
            let dir_name = order
                .path
                .split('/')
                .next()
                .filter(|s| !s.is_empty())?;
            let slug = dir_name
                .splitn(2, '-')
                .nth(1)
                .unwrap_or("");
            let new_dir_name = format!("{:02}-{}", order.new_order, slug);
            if new_dir_name == dir_name {
                None // No change needed
            } else {
                Some((dir_name.to_string(), new_dir_name))
            }
        })
        .collect();

    if renames.is_empty() {
        return Ok(()); // Nothing to rename
    }

    // Phase 1: rename to unique temp names to avoid collisions.
    let temp_names: Vec<(std::path::PathBuf, std::path::PathBuf)> = renames
        .iter()
        .map(|(old, _new)| {
            let temp_name = format!("__reorder_tmp_{}__", old);
            (
                workspace_path.join(old),
                workspace_path.join(&temp_name),
            )
        })
        .collect();

    for (old_full, temp_full) in &temp_names {
        if old_full.exists() {
            fs::rename(old_full, temp_full)
                .map_err(|e| format!("临时重命名 {} 失败: {}", old_full.display(), e))?;
        }
    }

    // Phase 2: rename from temp to final names.
    for ((_old, new), (_, temp_full)) in renames.iter().zip(temp_names.iter()) {
        let final_full = workspace_path.join(new);
        if temp_full.exists() {
            fs::rename(temp_full, &final_full)
                .map_err(|e| format!("重命名为 {} 失败: {}", new, e))?;
        }
    }

    // Update SUMMARY.md to reflect new directory names.
    let summary_result = (|| -> Result<(), String> {
        let (summary, ws_title) = read_summary(workspace_path)?;
        let mut summary = summary;

        // Build a lookup of old dir name → new dir name
        let rename_map: std::collections::HashMap<&str, &str> =
            renames.iter().map(|(o, n)| (o.as_str(), n.as_str())).collect();

        for entry in &mut summary {
            // entry.path looks like "01-intro/index.md" — replace the dir prefix
            for (old_dir, new_dir) in &rename_map {
                let old_prefix = format!("{}/", old_dir);
                if entry.path.starts_with(&old_prefix) || entry.path == *old_dir {
                    entry.path = entry.path.replacen(old_dir, new_dir, 1);
                }
            }
            for child in &mut entry.children {
                for (old_dir, new_dir) in &rename_map {
                    let old_prefix = format!("{}/", old_dir);
                    if child.path.starts_with(&old_prefix) || child.path == *old_dir {
                        child.path = child.path.replacen(old_dir, new_dir, 1);
                    }
                }
            }
        }

        // Reorder the summary entries to match the new sequence.
        // Build the desired order from chapter_orders: a chapter's sort key is new_order.
        // Entries not in chapter_orders keep their relative position at the end.
        let order_map: std::collections::HashMap<String, u32> = chapter_orders
            .iter()
            .map(|o| {
                let dir = o.path.split('/').next().unwrap_or("").to_string();
                // Normalize: the path given may already be old-style, map to new dir
                let key = renames
                    .iter()
                    .find(|(old, _)| old == &dir)
                    .map(|(_, new)| new.clone())
                    .unwrap_or(dir);
                (key, o.new_order)
            })
            .collect();

        summary.sort_by_key(|entry| {
            let entry_dir = entry.path.split('/').next().unwrap_or("").to_string();
            order_map.get(&entry_dir).copied().unwrap_or(u32::MAX)
        });

        write_summary(workspace_path, &summary, &ws_title)
    })();

    summary_result?; // Surface SUMMARY errors, but renames are already committed.
    Ok(())
}

// === Internal helpers ===

fn read_summary(workspace_path: &Path) -> Result<(Vec<SummaryEntry>, String), String> {
    let summary_path = workspace_path.join("SUMMARY.md");
    let content = fs::read_to_string(&summary_path)
        .map_err(|e| format!("读取 SUMMARY.md 失败: {}", e))?;
    let ws_title = content
        .lines()
        .find_map(|line| line.trim().strip_prefix("# "))
        .unwrap_or("Untitled")
        .to_string();
    Ok((parse_summary(&content), ws_title))
}

fn update_summary_title(entries: &mut [SummaryEntry], path: &str, new_title: &str) {
    for entry in entries.iter_mut() {
        if entry.path == path || entry.path == format!("{}/index.md", path) {
            entry.title = new_title.to_string();
        }
        for child in entry.children.iter_mut() {
            if child.path == path {
                child.title = new_title.to_string();
            }
        }
    }
}

fn remove_summary_entry(entries: &mut Vec<SummaryEntry>, path: &str) {
    // Check if path matches a top-level chapter entry directly
    let chapter_match = entries.iter().position(|e| {
        path == e.path || path == e.path.replace("/index.md", "")
    });

    if let Some(idx) = chapter_match {
        // If the path matches the chapter itself, remove the entire chapter
        entries.remove(idx);
        return;
    }

    // Otherwise, look for the path as a child of some chapter
    let _dir_prefix = path.split('/').next().unwrap_or("");
    for chapter in entries.iter_mut() {
        let child_idx = chapter.children.iter().position(|c| c.path == path);
        if let Some(cidx) = child_idx {
            chapter.children.remove(cidx);
            return;
        }
        // Also check if path starts with this chapter's directory
        let chapter_dir = chapter.path.replace("/index.md", "");
        if !chapter_dir.is_empty() && path.starts_with(&format!("{}/", chapter_dir)) {
            let child_idx = chapter.children.iter().position(|c| c.path == path);
            if let Some(cidx) = child_idx {
                chapter.children.remove(cidx);
                return;
            }
        }
    }
}

fn update_first_heading(content: &str, new_title: &str) -> String {
    let mut found = false;
    content
        .lines()
        .map(|line| {
            if !found && line.trim().starts_with("# ") {
                found = true;
                let hash_end = line.find('#').unwrap_or(0) + 2;
                format!("{}{}", &line[..hash_end], new_title)
            } else {
                line.to_string()
            }
        })
        .collect::<Vec<_>>()
        .join("\n")
}

fn scan_chapter_dirs(path: &Path) -> Vec<String> {
    let Ok(entries) = fs::read_dir(path) else {
        return Vec::new();
    };
    entries
        .filter_map(|e| e.ok())
        .filter(|e| e.path().is_dir())
        .filter_map(|e| {
            let name = e.file_name().to_string_lossy().to_string();
            // Exclude system directories: assets (shared resources), dist (export
            // output, §2.7), and hidden directories. These are not user chapters.
            if name == "assets" || name == "dist" || name.starts_with('.') {
                return None;
            }
            Some(name)
        })
        .collect()
}

fn extract_first_heading(content: String) -> Option<String> {
    for line in content.lines() {
        if let Some(heading) = line.trim().strip_prefix("# ") {
            return Some(heading.to_string());
        }
    }
    None
}

fn chrono_now() -> String {
    chrono::Local::now().format("%Y-%m-%d").to_string()
}

pub fn generate_chapter_dir_name(title: &str, existing_dirs: &[String]) -> String {
    let slug = slugify(title);
    let next_num = find_next_chapter_number(existing_dirs);
    format!("{:02}-{}", next_num, slug)
}

fn find_next_chapter_number(existing_dirs: &[String]) -> u32 {
    let mut max_num: u32 = 0;
    for dir_name in existing_dirs {
        if let Some(num_str) = dir_name.split('-').next() {
            if let Ok(n) = num_str.parse::<u32>() {
                max_num = max_num.max(n);
            }
        }
    }
    max_num + 1
}

pub fn slugify(title: &str) -> String {
    let lower = title.to_lowercase();
    let ascii: String = lower
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() {
                c
            } else if c == ' ' || c == '_' || c == '-' {
                '-'
            } else {
                '\0'
            }
        })
        .filter(|c| *c != '\0')
        .collect();

    // Trim leading/trailing hyphens and collapse consecutive hyphens
    let cleaned = ascii
        .split('-')
        .filter(|s| !s.is_empty())
        .collect::<Vec<_>>()
        .join("-");

    if !cleaned.is_empty() && cleaned.chars().any(|c| c.is_ascii_alphanumeric()) {
        cleaned
    } else {
        "chapter".to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_summary() {
        let content = r#"# Summary

- [入门指南](01-getting-started/index.md)
  - [快速开始](01-getting-started/quick-start.md)
- [系统架构](02-architecture/index.md)
  - [API 总览](02-architecture/api-overview.md)
"#;
        let entries = parse_summary(content);
        assert_eq!(entries.len(), 2);
        assert_eq!(entries[0].title, "入门指南");
        assert_eq!(entries[0].path, "01-getting-started/index.md");
        assert_eq!(entries[0].children.len(), 1);
        assert_eq!(entries[0].children[0].title, "快速开始");
    }

    #[test]
    fn test_parse_workspace_json_valid() {
        let content = r#"{"title":"Test","author":"dev","language":"zh-CN","version":"1.0.0","created":"2026-01-01"}"#;
        let meta = parse_workspace_json(content).unwrap();
        assert_eq!(meta.title, "Test");
        assert_eq!(meta.author, "dev");
    }

    #[test]
    fn test_parse_workspace_json_invalid() {
        let content = "not json";
        let result = parse_workspace_json(content);
        assert!(result.is_err());
    }

    #[test]
    fn test_validate_workspace_ok() {
        let files = vec!["workspace.json", "SUMMARY.md", "01-intro/index.md"];
        assert!(validate_workspace(&files).is_ok());
    }

    #[test]
    fn test_validate_workspace_missing_json() {
        let files = vec!["SUMMARY.md"];
        assert!(validate_workspace(&files).is_err());
    }

    #[test]
    fn test_next_image_index() {
        let files = vec!["index-img-001.svg", "index-img-002.png", "index-img-003.drawnix"];
        assert_eq!(next_image_index(&files, "index"), 4);
    }

    #[test]
    fn test_next_image_index_empty() {
        let files: Vec<&str> = vec![];
        assert_eq!(next_image_index(&files, "index"), 1);
    }

    #[test]
    fn test_next_image_index_different_doc() {
        let files = vec!["index-img-001.svg", "api-overview-img-001.svg"];
        assert_eq!(next_image_index(&files, "api-overview"), 2);
    }

    #[test]
    fn test_create_workspace() {
        let tmp = tempfile::tempdir().unwrap();
        let path = tmp.path().join("my-workspace");
        let result = create_workspace(&path, "测试文档", "作者", Some("zh-CN")).unwrap();
        assert_eq!(result.workspace_meta.title, "测试文档");
        assert!(path.join("workspace.json").exists());
        assert!(path.join("SUMMARY.md").exists());
        assert!(path.join("assets").exists());
    }

    #[test]
    fn test_open_workspace_valid() {
        let tmp = tempfile::tempdir().unwrap();
        let path = tmp.path();
        create_workspace(path, "测试", "dev", None).unwrap();

        let chapter = path.join("01-intro");
        fs::create_dir_all(chapter.join("assets")).unwrap();
        fs::write(chapter.join("index.md"), "# 入门").unwrap();
        let summary = "# 测试\n- [入门](01-intro/index.md)\n";
        fs::write(path.join("SUMMARY.md"), summary).unwrap();

        let result = open_workspace(path).unwrap();
        assert_eq!(result.workspace_meta.title, "测试");
        assert_eq!(result.summary.len(), 1);
        assert!(result.repairs.is_empty());
    }

    #[test]
    fn test_open_workspace_missing_chapter_on_disk() {
        let tmp = tempfile::tempdir().unwrap();
        let path = tmp.path();
        create_workspace(path, "测试", "dev", None).unwrap();

        let summary = "# 测试\n- [不存在](99-missing/index.md)\n";
        fs::write(path.join("SUMMARY.md"), summary).unwrap();

        let result = open_workspace(path).unwrap();
        assert!(result.summary[0].is_missing);
        assert!(result.repairs.iter().any(|r| r.kind == "missing_file"));
    }

    #[test]
    fn test_open_workspace_disk_chapter_not_in_summary() {
        let tmp = tempfile::tempdir().unwrap();
        let path = tmp.path();
        create_workspace(path, "测试", "dev", None).unwrap();

        let chapter = path.join("01-intro");
        fs::create_dir_all(chapter.join("assets")).unwrap();
        fs::write(chapter.join("index.md"), "# 入门").unwrap();

        let result = open_workspace(path).unwrap();
        assert_eq!(result.summary.len(), 1);
        assert!(result.repairs.iter().any(|r| r.kind == "added_missing_chapter"));
    }

    #[test]
    fn test_open_workspace_ignores_dist_directory() {
        // dist/ is an export-output system directory (§2.7), not a chapter.
        // It must not be auto-appended to SUMMARY as a missing chapter.
        let tmp = tempfile::tempdir().unwrap();
        let path = tmp.path();
        create_workspace(path, "测试", "dev", None).unwrap();

        let chapter = path.join("01-intro");
        fs::create_dir_all(chapter.join("assets")).unwrap();
        fs::write(chapter.join("index.md"), "# 入门").unwrap();
        let summary = "# 测试\n- [入门](01-intro/index.md)\n";
        fs::write(path.join("SUMMARY.md"), summary).unwrap();

        // Simulate export output in dist/
        fs::create_dir_all(path.join("dist").join("chm-v1")).unwrap();
        fs::write(path.join("dist").join("chm-v1").join("index.html"), "<html/>").unwrap();

        let result = open_workspace(path).unwrap();
        // dist/ should NOT appear as a chapter or repair
        assert_eq!(result.summary.len(), 1, "dist should not be added as a chapter");
        assert!(
            !result.repairs.iter().any(|r| r.detail.contains("dist")),
            "dist should not trigger a repair: {:?}", result.repairs
        );
    }

    #[test]
    fn test_write_summary_roundtrip() {
        let tmp = tempfile::tempdir().unwrap();
        let path = tmp.path();
        let entries = vec![
            SummaryEntry {
                title: "入门".to_string(),
                path: "01-intro/index.md".to_string(),
                level: 1,
                is_missing: false,
                children: vec![SummaryEntry {
                    title: "快速开始".to_string(),
                    path: "01-intro/quick-start.md".to_string(),
                    level: 2,
                    is_missing: false,
                    children: Vec::new(),
                }],
            },
            SummaryEntry {
                title: "架构".to_string(),
                path: "02-arch/index.md".to_string(),
                level: 1,
                is_missing: false,
                children: Vec::new(),
            },
        ];
        write_summary(path, &entries, "测试").unwrap();

        let content = fs::read_to_string(path.join("SUMMARY.md")).unwrap();
        let parsed = parse_summary(&content);
        assert_eq!(parsed.len(), 2);
        assert_eq!(parsed[0].title, "入门");
        assert_eq!(parsed[0].children.len(), 1);
        assert_eq!(parsed[1].title, "架构");
    }

    #[test]
    fn test_slugify() {
        assert_eq!(slugify("Getting Started"), "getting-started");
        assert_eq!(slugify("API Overview"), "api-overview");
        assert_eq!(slugify("hello_world"), "hello-world");
        assert_eq!(slugify("入门指南"), "chapter"); // Chinese fallback
    }

    #[test]
    fn test_strip_unc_prefix() {
        // Normal Unix path — unchanged
        assert_eq!(
            strip_unc_prefix(Path::new("/home/user/workspace")),
            "/home/user/workspace"
        );
        // Windows drive letter without UNC prefix — unchanged
        assert_eq!(
            strip_unc_prefix(Path::new("E:\\test-notes")),
            "E:\\test-notes"
        );
        // Windows UNC extended-length path — prefix stripped
        assert_eq!(
            strip_unc_prefix(Path::new(r"\\?\E:\test-notes")),
            "E:\\test-notes"
        );
    }

    #[test]
    fn test_generate_chapter_dir_name() {
        let existing = vec!["01-intro".to_string(), "02-arch".to_string()];
        let name = generate_chapter_dir_name("API Reference", &existing);
        assert_eq!(name, "03-api-reference");
    }

    #[test]
    fn test_generate_chapter_dir_name_empty() {
        let existing: Vec<String> = vec![];
        let name = generate_chapter_dir_name("Getting Started", &existing);
        assert_eq!(name, "01-getting-started");
    }

    #[test]
    fn test_create_chapter() {
        let tmp = tempfile::tempdir().unwrap();
        let ws_path = tmp.path();
        create_workspace(ws_path, "测试", "dev", None).unwrap();

        let info = create_chapter(ws_path, "入门指南").unwrap();
        assert_eq!(info.name, "01-chapter"); // Chinese title falls back to "chapter"
        assert!(ws_path.join("01-chapter").exists());
        assert!(ws_path.join("01-chapter/index.md").exists());
        assert!(ws_path.join("01-chapter/assets").exists());

        let summary = fs::read_to_string(ws_path.join("SUMMARY.md")).unwrap();
        let parsed = parse_summary(&summary);
        assert_eq!(parsed.len(), 1);
        assert_eq!(parsed[0].title, "入门指南");
    }

    #[test]
    fn test_create_chapter_sequential_numbering() {
        let tmp = tempfile::tempdir().unwrap();
        let ws_path = tmp.path();
        create_workspace(ws_path, "测试", "dev", None).unwrap();

        create_chapter(ws_path, "First").unwrap();
        create_chapter(ws_path, "Second").unwrap();

        assert!(ws_path.join("01-first").exists());
        assert!(ws_path.join("02-second").exists());
    }

    #[test]
    fn test_create_page() {
        let tmp = tempfile::tempdir().unwrap();
        let ws_path = tmp.path();
        create_workspace(ws_path, "测试", "dev", None).unwrap();
        create_chapter(ws_path, "架构").unwrap();

        // The chapter dir is "01-chapter" since Chinese title
        let info = create_page(ws_path, "01-chapter", "API 概览").unwrap();
        assert_eq!(info.name, "api.md");
        assert!(ws_path.join("01-chapter/api.md").exists());

        let summary = fs::read_to_string(ws_path.join("SUMMARY.md")).unwrap();
        let parsed = parse_summary(&summary);
        assert_eq!(parsed[0].children.len(), 2); // index + new page
    }

    #[test]
    fn test_rename_node_page() {
        let tmp = tempfile::tempdir().unwrap();
        let ws_path = tmp.path();
        create_workspace(ws_path, "测试", "dev", None).unwrap();
        create_chapter(ws_path, "架构").unwrap();
        create_page(ws_path, "01-chapter", "API").unwrap();

        rename_node(ws_path, "01-chapter/api.md", "REST API").unwrap();

        let summary = fs::read_to_string(ws_path.join("SUMMARY.md")).unwrap();
        assert!(summary.contains("REST API"));

        let content = fs::read_to_string(ws_path.join("01-chapter/api.md")).unwrap();
        assert!(content.contains("# REST API"));
    }

    #[test]
    fn test_delete_node_page() {
        let tmp = tempfile::tempdir().unwrap();
        let ws_path = tmp.path();
        create_workspace(ws_path, "测试", "dev", None).unwrap();
        create_chapter(ws_path, "架构").unwrap();
        create_page(ws_path, "01-chapter", "API").unwrap();

        delete_node(ws_path, "01-chapter/api.md").unwrap();
        assert!(!ws_path.join("01-chapter/api.md").exists());

        let summary = fs::read_to_string(ws_path.join("SUMMARY.md")).unwrap();
        let parsed = parse_summary(&summary);
        assert_eq!(parsed[0].children.len(), 1); // only index left
    }

    #[test]
    fn test_delete_node_chapter() {
        let tmp = tempfile::tempdir().unwrap();
        let ws_path = tmp.path();
        create_workspace(ws_path, "测试", "dev", None).unwrap();
        create_chapter(ws_path, "架构").unwrap();

        delete_node(ws_path, "01-chapter").unwrap();
        assert!(!ws_path.join("01-chapter").exists());

        let summary = fs::read_to_string(ws_path.join("SUMMARY.md")).unwrap();
        let parsed = parse_summary(&summary);
        assert!(parsed.is_empty());
    }

    // ═══════════════════════════════════════════════════════════
    // 补充测试：对齐 E2E 07-ipc-backend.spec.ts 断言
    // ═══════════════════════════════════════════════════════════

    // ─── parse_summary 边界场景 ──────────────────────────────

    #[test]
    fn test_parse_summary_empty_string() {
        let entries = parse_summary("");
        assert!(entries.is_empty());
    }

    #[test]
    fn test_parse_summary_comments_and_heading_only() {
        let content = "# Summary\n\n<!-- This is a comment -->\n";
        let entries = parse_summary(content);
        assert!(entries.is_empty());
    }

    #[test]
    fn test_parse_summary_malformed_links_skipped() {
        let content = "\
# Summary
- [Valid Entry](valid/index.md)
- broken link without brackets
- [Missing paren](path
  text line
- [Another](another/index.md)";
        let entries = parse_summary(content);
        assert_eq!(entries.len(), 2);
        assert_eq!(entries[0].title, "Valid Entry");
        assert_eq!(entries[1].title, "Another");
    }

    #[test]
    fn test_parse_summary_nested_children_count() {
        let content = "\
# Summary
- [Chapter A](a/index.md)
  - [Child 1](a/child1.md)
  - [Child 2](a/child2.md)";
        let entries = parse_summary(content);
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].children.len(), 2);
        assert_eq!(entries[0].children[0].title, "Child 1");
        assert_eq!(entries[0].children[1].title, "Child 2");
    }

    // ─── parse_workspace_json 边界场景 ──────────────────────

    #[test]
    fn test_parse_workspace_json_empty_object() {
        let meta = parse_workspace_json("{}").unwrap();
        assert_eq!(meta.title, "Untitled");
        assert_eq!(meta.author, "Unknown");
        assert_eq!(meta.language, "zh-CN");
        assert_eq!(meta.version, "1.0.0");
    }

    #[test]
    fn test_parse_workspace_json_array_error() {
        let result = parse_workspace_json("[1,2,3]");
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("not an object"));
    }

    #[test]
    fn test_parse_workspace_json_partial_fields() {
        let content = r#"{"title":"只有标题"}"#;
        let meta = parse_workspace_json(content).unwrap();
        assert_eq!(meta.title, "只有标题");
        assert_eq!(meta.author, "Unknown");
        assert_eq!(meta.language, "zh-CN");
    }

    #[test]
    fn test_parse_workspace_json_extra_fields_ignored() {
        let content = r#"{"title":"T","author":"A","language":"en","extraField":"ignored","nested":{"foo":1}}"#;
        let meta = parse_workspace_json(content).unwrap();
        assert_eq!(meta.title, "T");
        assert_eq!(meta.author, "A");
        assert_eq!(meta.language, "en");
    }

    #[test]
    fn test_parse_workspace_json_invalid_string_error() {
        let result = parse_workspace_json("not json at all");
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Invalid JSON"));
    }

    // ─── open_workspace 错误路径 ──────────────────────────────

    #[test]
    fn test_open_workspace_nonexistent_path_error() {
        let result = open_workspace(Path::new("/tmp/no-such-dir-12345"));
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("路径不存在"));
    }

    #[test]
    fn test_open_workspace_path_is_file_error() {
        let tmp = tempfile::tempdir().unwrap();
        let file_path = tmp.path().join("a-file.txt");
        fs::write(&file_path, "not a dir").unwrap();

        let result = open_workspace(&file_path);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("路径不是目录"));
    }

    #[test]
    fn test_open_workspace_missing_workspace_json() {
        let tmp = tempfile::tempdir().unwrap();
        let path = tmp.path();
        // 只有 SUMMARY.md，没有 workspace.json
        fs::write(path.join("SUMMARY.md"), "# Test\n").unwrap();

        let result = open_workspace(path);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("workspace.json"));
    }

    #[test]
    fn test_open_workspace_missing_summary_md() {
        let tmp = tempfile::tempdir().unwrap();
        let path = tmp.path();
        fs::write(
            path.join("workspace.json"),
            r#"{"title":"T","author":"A"}"#,
        )
        .unwrap();

        let result = open_workspace(path);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("SUMMARY.md"));
    }

    #[test]
    fn test_open_workspace_is_missing_field_true() {
        let tmp = tempfile::tempdir().unwrap();
        let path = tmp.path();
        create_workspace(path, "测试", "dev", None).unwrap();

        // SUMMARY 指向不存在的文件
        let summary = "# 测试\n- [不存在](99-missing/index.md)\n";
        fs::write(path.join("SUMMARY.md"), summary).unwrap();

        let result = open_workspace(path).unwrap();
        assert!(result.summary[0].is_missing);
    }

    #[test]
    fn test_open_workspace_is_missing_field_false() {
        let tmp = tempfile::tempdir().unwrap();
        let path = tmp.path();
        create_workspace(path, "测试", "dev", None).unwrap();

        let chapter = path.join("01-intro");
        fs::create_dir_all(&chapter).unwrap();
        fs::write(chapter.join("index.md"), "# 入门").unwrap();
        let summary = "# 测试\n- [入门](01-intro/index.md)\n";
        fs::write(path.join("SUMMARY.md"), summary).unwrap();

        let result = open_workspace(path).unwrap();
        assert!(!result.summary[0].is_missing);
    }

    // ─── create_workspace 补充验证 ────────────────────────────

    #[test]
    fn test_create_workspace_default_language() {
        let tmp = tempfile::tempdir().unwrap();
        let path = tmp.path().join("ws-default-lang");
        let result = create_workspace(&path, "测试", "dev", None).unwrap();
        assert_eq!(result.workspace_meta.language, "zh-CN");
    }

    #[test]
    fn test_create_workspace_custom_language() {
        let tmp = tempfile::tempdir().unwrap();
        let path = tmp.path().join("ws-custom-lang");
        let result = create_workspace(&path, "Test", "dev", Some("en")).unwrap();
        assert_eq!(result.workspace_meta.language, "en");
    }

    #[test]
    fn test_create_workspace_overwrite_existing() {
        let tmp = tempfile::tempdir().unwrap();
        let path = tmp.path().join("ws-overwrite");

        let first = create_workspace(&path, "First", "A", None).unwrap();
        assert_eq!(first.workspace_meta.title, "First");

        let second = create_workspace(&path, "Overwritten", "B", None).unwrap();
        assert_eq!(second.workspace_meta.title, "Overwritten");
        assert_eq!(second.workspace_meta.author, "B");
    }

    #[test]
    fn test_create_workspace_disk_file_verification() {
        let tmp = tempfile::tempdir().unwrap();
        let path = tmp.path().join("ws-disk");
        create_workspace(&path, "磁盘验证", "测试者", Some("zh-CN")).unwrap();

        // 验证 workspace.json 内容
        let json_str = fs::read_to_string(path.join("workspace.json")).unwrap();
        let json_val: serde_json::Value = serde_json::from_str(&json_str).unwrap();
        assert_eq!(json_val["title"], "磁盘验证");
        assert_eq!(json_val["author"], "测试者");
        assert_eq!(json_val["language"], "zh-CN");

        // 验证 SUMMARY.md 包含标题
        let summary = fs::read_to_string(path.join("SUMMARY.md")).unwrap();
        assert!(summary.contains("磁盘验证"));

        // 验证 assets 目录存在
        assert!(path.join("assets").is_dir());
    }

    // ─── create_chapter 补充验证 ──────────────────────────────

    #[test]
    fn test_create_chapter_summary_entry_verification() {
        let tmp = tempfile::tempdir().unwrap();
        let ws_path = tmp.path();
        create_workspace(ws_path, "测试", "dev", None).unwrap();

        let info = create_chapter(ws_path, "新章节").unwrap();

        let summary = fs::read_to_string(ws_path.join("SUMMARY.md")).unwrap();
        let parsed = parse_summary(&summary);
        let found = parsed.iter().find(|e| e.title == "新章节");
        assert!(found.is_some());
        assert_eq!(found.unwrap().path, info.index_path);
        assert_eq!(found.unwrap().level, 1);
    }

    #[test]
    fn test_create_chapter_english_title_slug() {
        let tmp = tempfile::tempdir().unwrap();
        let ws_path = tmp.path();
        create_workspace(ws_path, "测试", "dev", None).unwrap();

        let info = create_chapter(ws_path, "API Reference").unwrap();
        // 英文标题应生成 slug
        assert!(info.name.contains("api-reference"));
    }

    #[test]
    fn test_create_chapter_assets_directory_exists() {
        let tmp = tempfile::tempdir().unwrap();
        let ws_path = tmp.path();
        create_workspace(ws_path, "测试", "dev", None).unwrap();

        let info = create_chapter(ws_path, "有资产").unwrap();
        let assets_dir = ws_path.join(&info.name).join("assets");
        assert!(assets_dir.is_dir());
    }

    // ─── create_page 补充验证 ──────────────────────────────

    #[test]
    fn test_create_page_file_contains_heading() {
        let tmp = tempfile::tempdir().unwrap();
        let ws_path = tmp.path();
        create_workspace(ws_path, "测试", "dev", None).unwrap();
        create_chapter(ws_path, "架构").unwrap();

        let title = "API 概览";
        let info = create_page(ws_path, "01-chapter", title).unwrap();

        let content = fs::read_to_string(ws_path.join(&info.path)).unwrap();
        assert!(content.contains(&format!("# {}", title)));
    }

    #[test]
    fn test_create_page_nonexistent_chapter_error() {
        let tmp = tempfile::tempdir().unwrap();
        let ws_path = tmp.path();
        create_workspace(ws_path, "测试", "dev", None).unwrap();

        let result = create_page(ws_path, "99-nonexistent", "错误页面");
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("章节目录不存在"));
    }

    #[test]
    fn test_create_page_summary_child_entry() {
        let tmp = tempfile::tempdir().unwrap();
        let ws_path = tmp.path();
        create_workspace(ws_path, "测试", "dev", None).unwrap();
        create_chapter(ws_path, "架构").unwrap();

        let title = "子页面验证";
        create_page(ws_path, "01-chapter", title).unwrap();

        let summary = fs::read_to_string(ws_path.join("SUMMARY.md")).unwrap();
        let parsed = parse_summary(&summary);
        let chap = parsed.iter().find(|e| e.path.starts_with("01-chapter"));
        assert!(chap.is_some());
        let child_titles: Vec<&str> = chap.unwrap().children.iter().map(|c| c.title.as_str()).collect();
        assert!(child_titles.contains(&title));
    }

    // ─── rename_node 补充验证 ──────────────────────────────

    #[test]
    fn test_rename_node_chapter_heading_and_summary() {
        let tmp = tempfile::tempdir().unwrap();
        let ws_path = tmp.path();
        create_workspace(ws_path, "测试", "dev", None).unwrap();
        create_chapter(ws_path, "旧名称").unwrap();

        rename_node(ws_path, "01-chapter/index.md", "新名称").unwrap();

        // index.md 标题更新
        let content = fs::read_to_string(ws_path.join("01-chapter/index.md")).unwrap();
        assert!(content.contains("# 新名称"));
        assert!(!content.contains("# 旧名称"));

        // SUMMARY 标题更新
        let summary = fs::read_to_string(ws_path.join("SUMMARY.md")).unwrap();
        let parsed = parse_summary(&summary);
        let titles: Vec<&str> = parsed.iter().map(|e| e.title.as_str()).collect();
        assert!(titles.contains(&"新名称"));
        assert!(!titles.contains(&"旧名称"));
    }

    #[test]
    fn test_rename_node_nonexistent_path_error() {
        let tmp = tempfile::tempdir().unwrap();
        let ws_path = tmp.path();
        create_workspace(ws_path, "测试", "dev", None).unwrap();

        let result = rename_node(ws_path, "99-nonexistent/index.md", "不存在");
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("路径不存在"));
    }

    // ─── delete_node 补充验证 ──────────────────────────────

    #[test]
    fn test_delete_node_chapter_full_verification() {
        let tmp = tempfile::tempdir().unwrap();
        let ws_path = tmp.path();
        create_workspace(ws_path, "测试", "dev", None).unwrap();
        create_chapter(ws_path, "待删除").unwrap();
        create_page(ws_path, "01-chapter", "子页面").unwrap();

        // 确认目录存在
        assert!(ws_path.join("01-chapter").is_dir());

        delete_node(ws_path, "01-chapter").unwrap();

        // 目录已递归删除
        assert!(!ws_path.join("01-chapter").exists());

        // SUMMARY 条目已移除
        let summary = fs::read_to_string(ws_path.join("SUMMARY.md")).unwrap();
        let parsed = parse_summary(&summary);
        let titles: Vec<&str> = parsed.iter().map(|e| e.title.as_str()).collect();
        assert!(!titles.contains(&"待删除"));
    }

    #[test]
    fn test_delete_node_nonexistent_path_error() {
        let tmp = tempfile::tempdir().unwrap();
        let ws_path = tmp.path();
        create_workspace(ws_path, "测试", "dev", None).unwrap();

        let result = delete_node(ws_path, "99-nonexistent/index.md");
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("路径不存在"));
    }

    // ─── CRUD 完整生命周期 ─────────────────────────────────

    #[test]
    fn test_crud_lifecycle() {
        let tmp = tempfile::tempdir().unwrap();
        let ws_path = tmp.path();
        create_workspace(ws_path, "CRUD 测试", "dev", None).unwrap();

        // 1. create_chapter
        let chapter = create_chapter(ws_path, "CRUD章节").unwrap();
        assert!(!chapter.name.is_empty());

        // 验证 SUMMARY 有新章节
        let ws = open_workspace(ws_path).unwrap();
        let found = ws.summary.iter().find(|e| e.title == "CRUD章节");
        assert!(found.is_some());

        // 2. create_page
        let page_title = "CRUD页面";
        let page = create_page(ws_path, &chapter.name, page_title).unwrap();
        assert!(page.path.ends_with(".md"));

        // 验证 SUMMARY 子条目
        let ws = open_workspace(ws_path).unwrap();
        let chap = ws.summary.iter().find(|e| e.path.starts_with(&chapter.name));
        assert!(chap.is_some());
        let child_titles: Vec<&str> = chap.unwrap().children.iter().map(|c| c.title.as_str()).collect();
        assert!(child_titles.contains(&page_title));

        // 3. rename_page
        let new_title = "CRUD已重命名";
        rename_node(ws_path, &page.path, new_title).unwrap();

        // 验证标题更新
        let content = fs::read_to_string(ws_path.join(&page.path)).unwrap();
        assert!(content.contains(&format!("# {}", new_title)));
        assert!(!content.contains(&format!("# {}", page_title)));

        let ws = open_workspace(ws_path).unwrap();
        let chap = ws.summary.iter().find(|e| e.path.starts_with(&chapter.name));
        assert!(chap.is_some());
        let child_titles: Vec<&str> = chap.unwrap().children.iter().map(|c| c.title.as_str()).collect();
        assert!(child_titles.contains(&new_title));
        assert!(!child_titles.contains(&page_title));

        // 4. delete_page
        delete_node(ws_path, &page.path).unwrap();
        assert!(!ws_path.join(&page.path).exists());

        let ws = open_workspace(ws_path).unwrap();
        let chap = ws.summary.iter().find(|e| e.path.starts_with(&chapter.name));
        assert!(chap.is_some());
        let child_titles: Vec<&str> = chap.unwrap().children.iter().map(|c| c.title.as_str()).collect();
        assert!(!child_titles.contains(&new_title));

        // 5. delete_chapter
        let chap_entry = ws.summary.iter().find(|e| e.title == "CRUD章节");
        assert!(chap_entry.is_some());
        delete_node(ws_path, &chapter.name).unwrap();
        assert!(!ws_path.join(&chapter.name).exists());

        let ws = open_workspace(ws_path).unwrap();
        let titles: Vec<&str> = ws.summary.iter().map(|e| e.title.as_str()).collect();
        assert!(!titles.contains(&"CRUD章节"));
    }

    // ═══════════════════════════════════════════════════════════
    // 原子性 / 回滚测试
    // ═══════════════════════════════════════════════════════════

    /// Helper: make SUMMARY.md unwritable by turning it into a directory.
    /// This simulates a failure during write_summary.
    fn make_summary_unwritable(workspace_path: &Path) {
        let summary_path = workspace_path.join("SUMMARY.md");
        fs::remove_file(&summary_path).unwrap();
        fs::create_dir(&summary_path).unwrap(); // Same path, but now a directory → write fails
    }

    #[test]
    fn test_create_chapter_rollback_on_summary_failure() {
        let tmp = tempfile::tempdir().unwrap();
        let ws_path = tmp.path();
        create_workspace(ws_path, "测试", "dev", None).unwrap();

        // Make SUMMARY.md unwritable so write_summary will fail
        make_summary_unwritable(ws_path);

        let result = create_chapter(ws_path, "回滚测试");
        assert!(result.is_err());

        // The chapter directory should NOT exist (rolled back)
        assert!(!ws_path.join("01-chapter").exists());
        assert!(!ws_path.join("01-chapter/index.md").exists());
    }

    #[test]
    fn test_create_page_rollback_on_summary_failure() {
        let tmp = tempfile::tempdir().unwrap();
        let ws_path = tmp.path();
        create_workspace(ws_path, "测试", "dev", None).unwrap();
        create_chapter(ws_path, "架构").unwrap();

        // Make SUMMARY.md unwritable
        make_summary_unwritable(ws_path);

        let result = create_page(ws_path, "01-chapter", "回滚页面");
        assert!(result.is_err());

        // The page file should NOT exist (rolled back)
        assert!(!ws_path.join("01-chapter/api.md").exists());
        assert!(!ws_path.join("01-chapter/rollback-page.md").exists());
    }

    #[test]
    fn test_delete_node_preserves_files_on_summary_failure() {
        let tmp = tempfile::tempdir().unwrap();
        let ws_path = tmp.path();
        create_workspace(ws_path, "测试", "dev", None).unwrap();
        create_chapter(ws_path, "保留测试").unwrap();

        // Verify chapter exists
        assert!(ws_path.join("01-chapter").exists());
        assert!(ws_path.join("01-chapter/index.md").exists());

        // Make SUMMARY.md unwritable
        make_summary_unwritable(ws_path);

        let result = delete_node(ws_path, "01-chapter");
        assert!(result.is_err());

        // The chapter should STILL exist (not deleted because SUMMARY update failed first)
        assert!(ws_path.join("01-chapter").exists());
        assert!(ws_path.join("01-chapter/index.md").exists());
    }

    #[test]
    fn test_rename_node_preserves_file_on_summary_failure() {
        let tmp = tempfile::tempdir().unwrap();
        let ws_path = tmp.path();
        create_workspace(ws_path, "测试", "dev", None).unwrap();
        create_chapter(ws_path, "原始名称").unwrap();

        // Verify original heading
        let original_content = fs::read_to_string(ws_path.join("01-chapter/index.md")).unwrap();
        assert!(original_content.contains("# 原始名称"));

        // Make SUMMARY.md unwritable
        make_summary_unwritable(ws_path);

        let result = rename_node(ws_path, "01-chapter/index.md", "新名称");
        assert!(result.is_err());

        // The file heading should NOT have changed (SUMMARY failed first, file not touched)
        let content_after = fs::read_to_string(ws_path.join("01-chapter/index.md")).unwrap();
        assert!(content_after.contains("# 原始名称"));
        assert!(!content_after.contains("# 新名称"));
    }

    #[test]
    fn test_delete_node_order_summary_before_filesystem() {
        // Verify the new order: SUMMARY updated first, then file deleted
        let tmp = tempfile::tempdir().unwrap();
        let ws_path = tmp.path();
        create_workspace(ws_path, "测试", "dev", None).unwrap();
        create_chapter(ws_path, "删除顺序").unwrap();
        // "Sub Page" → slug = "sub-page"
        create_page(ws_path, "01-chapter", "Sub Page").unwrap();

        // Verify the file exists
        assert!(ws_path.join("01-chapter/sub-page.md").exists());

        // Successful delete: both SUMMARY and filesystem should be updated
        delete_node(ws_path, "01-chapter/sub-page.md").unwrap();
        assert!(!ws_path.join("01-chapter/sub-page.md").exists());

        let summary = fs::read_to_string(ws_path.join("SUMMARY.md")).unwrap();
        let parsed = parse_summary(&summary);
        // Child should be removed from SUMMARY
        let child_titles: Vec<&str> = parsed[0].children.iter().map(|c| c.title.as_str()).collect();
        assert!(!child_titles.contains(&"Sub Page"));
    }

    // ─── reorder_chapters ───────────────────────────────────────

    use crate::models::workspace::ChapterOrder;

    #[test]
    fn test_reorder_chapters_basic() {
        let tmp = tempfile::tempdir().unwrap();
        let ws_path = tmp.path();
        create_workspace(ws_path, "测试", "dev", None).unwrap();
        create_chapter(ws_path, "Alpha").unwrap();
        create_chapter(ws_path, "Beta").unwrap();

        // Before: 01-alpha, 02-beta
        assert!(ws_path.join("01-alpha").exists());
        assert!(ws_path.join("02-beta").exists());

        // Swap: Alpha → 2, Beta → 1
        let orders = vec![
            ChapterOrder { path: "01-alpha".to_string(), new_order: 2 },
            ChapterOrder { path: "02-beta".to_string(), new_order: 1 },
        ];
        reorder_chapters(ws_path, &orders).unwrap();

        // After: 02-alpha, 01-beta
        assert!(ws_path.join("02-alpha").exists(), "01-alpha should become 02-alpha");
        assert!(ws_path.join("01-beta").exists(), "02-beta should become 01-beta");
        // Old dirs should not exist
        assert!(!ws_path.join("01-alpha").exists());
        assert!(!ws_path.join("02-beta").exists());
    }

    #[test]
    fn test_reorder_chapters_updates_summary_paths() {
        let tmp = tempfile::tempdir().unwrap();
        let ws_path = tmp.path();
        create_workspace(ws_path, "测试", "dev", None).unwrap();
        create_chapter(ws_path, "Alpha").unwrap();
        create_chapter(ws_path, "Beta").unwrap();

        // Swap order
        let orders = vec![
            ChapterOrder { path: "01-alpha".to_string(), new_order: 2 },
            ChapterOrder { path: "02-beta".to_string(), new_order: 1 },
        ];
        reorder_chapters(ws_path, &orders).unwrap();

        let summary = fs::read_to_string(ws_path.join("SUMMARY.md")).unwrap();
        let parsed = parse_summary(&summary);
        // SUMMARY should now reference the renamed dirs, in new order
        assert_eq!(parsed.len(), 2);
        assert_eq!(parsed[0].path, "01-beta/index.md", "first entry should be Beta");
        assert_eq!(parsed[1].path, "02-alpha/index.md", "second entry should be Alpha");
    }

    #[test]
    fn test_reorder_chapters_preserves_internal_files() {
        let tmp = tempfile::tempdir().unwrap();
        let ws_path = tmp.path();
        create_workspace(ws_path, "测试", "dev", None).unwrap();
        create_chapter(ws_path, "Alpha").unwrap();
        create_page(ws_path, "01-alpha", "Sub Page").unwrap();

        // Verify internal file exists
        assert!(ws_path.join("01-alpha/sub-page.md").exists());

        // Move Alpha to position 2 (no other chapter, but tests rename correctness)
        let orders = vec![
            ChapterOrder { path: "01-alpha".to_string(), new_order: 5 },
        ];
        reorder_chapters(ws_path, &orders).unwrap();

        // Internal files should be preserved
        assert!(ws_path.join("05-alpha").exists());
        assert!(ws_path.join("05-alpha/index.md").exists());
        assert!(ws_path.join("05-alpha/sub-page.md").exists());
    }

    #[test]
    fn test_reorder_chapters_no_change_when_same() {
        let tmp = tempfile::tempdir().unwrap();
        let ws_path = tmp.path();
        create_workspace(ws_path, "测试", "dev", None).unwrap();
        create_chapter(ws_path, "Alpha").unwrap();

        // Same order — should be a no-op
        let orders = vec![ChapterOrder { path: "01-alpha".to_string(), new_order: 1 }];
        reorder_chapters(ws_path, &orders).unwrap();

        assert!(ws_path.join("01-alpha").exists());
    }

    #[test]
    fn test_reorder_chapters_rejects_path_traversal() {
        let tmp = tempfile::tempdir().unwrap();
        let ws_path = tmp.path();
        create_workspace(ws_path, "测试", "dev", None).unwrap();

        let orders = vec![ChapterOrder {
            path: "../../etc".to_string(),
            new_order: 1,
        }];
        let result = reorder_chapters(ws_path, &orders);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("超出工作区范围"));
    }
}
