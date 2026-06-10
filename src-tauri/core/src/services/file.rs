use std::fs;
use std::path::Path;

use crate::models::workspace::MdFileContent;

/// Read file text content.
pub fn read_file(path: &Path) -> Result<String, String> {
    if !path.exists() {
        return Err(format!("文件不存在: {}", path.display()));
    }
    fs::read_to_string(path).map_err(|e| format!("读取文件失败: {}", e))
}

/// Save text content to file. Creates parent directories if needed.
pub fn save_file(path: &Path, content: &str) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("创建目录失败: {}", e))?;
    }
    fs::write(path, content).map_err(|e| format!("写入文件失败: {}", e))
}

/// Read all .md files in a workspace directory recursively.
/// Returns paths relative to the workspace root.
/// Skips `assets/` directories and hidden directories (starting with `.`).
pub fn read_all_md_files(workspace_path: &Path) -> Result<Vec<MdFileContent>, String> {
    if !workspace_path.exists() {
        return Err(format!("路径不存在: {}", workspace_path.display()));
    }
    if !workspace_path.is_dir() {
        return Err(format!("路径不是目录: {}", workspace_path.display()));
    }

    let mut results: Vec<MdFileContent> = Vec::new();
    collect_md_files(workspace_path, workspace_path, &mut results)?;
    Ok(results)
}

fn collect_md_files(
    base_path: &Path,
    current_dir: &Path,
    results: &mut Vec<MdFileContent>,
) -> Result<(), String> {
    let entries = fs::read_dir(current_dir).map_err(|e| format!("读取目录失败: {}", e))?;

    for entry in entries {
        let entry = entry.map_err(|e| format!("读取目录条目失败: {}", e))?;
        let name = entry.file_name().to_string_lossy().to_string();

        // Skip hidden files/dirs and assets directories
        if name.starts_with('.') || name == "assets" {
            continue;
        }

        let path = entry.path();
        if path.is_dir() {
            collect_md_files(base_path, &path, results)?;
        } else if name.ends_with(".md") {
            let relative = path
                .strip_prefix(base_path)
                .map_err(|e| format!("路径计算失败: {}", e))?
                .to_string_lossy()
                .replace('\\', "/");

            let content =
                fs::read_to_string(&path).map_err(|e| format!("读取文件失败 {}: {}", relative, e))?;

            results.push(MdFileContent {
                path: relative,
                content,
            });
        }
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_read_file_existing() {
        let tmp = tempfile::tempdir().unwrap();
        let file_path = tmp.path().join("test.md");
        fs::write(&file_path, "hello").unwrap();

        assert_eq!(read_file(&file_path).unwrap(), "hello");
    }

    #[test]
    fn test_read_file_missing() {
        let tmp = tempfile::tempdir().unwrap();
        let file_path = tmp.path().join("missing.md");

        assert!(read_file(&file_path).is_err());
    }

    #[test]
    fn test_save_file_creates_file() {
        let tmp = tempfile::tempdir().unwrap();
        let file_path = tmp.path().join("new.md");

        save_file(&file_path, "content").unwrap();
        assert_eq!(fs::read_to_string(&file_path).unwrap(), "content");
    }

    #[test]
    fn test_save_file_creates_parent_dirs() {
        let tmp = tempfile::tempdir().unwrap();
        let file_path = tmp.path().join("sub").join("dir").join("file.md");

        save_file(&file_path, "content").unwrap();
        assert_eq!(fs::read_to_string(&file_path).unwrap(), "content");
    }

    #[test]
    fn test_save_file_overwrites() {
        let tmp = tempfile::tempdir().unwrap();
        let file_path = tmp.path().join("test.md");
        fs::write(&file_path, "old").unwrap();

        save_file(&file_path, "new").unwrap();
        assert_eq!(fs::read_to_string(&file_path).unwrap(), "new");
    }

    #[test]
    fn test_read_all_md_files_basic() {
        let tmp = tempfile::tempdir().unwrap();
        let ws = tmp.path();

        // Create workspace structure
        fs::create_dir_all(ws.join("01-intro")).unwrap();
        fs::write(ws.join("01-intro/index.md"), "# 入门").unwrap();
        fs::write(ws.join("01-intro/guide.md"), "# 指南").unwrap();

        let result = read_all_md_files(ws).unwrap();
        assert_eq!(result.len(), 2);

        let paths: Vec<&str> = result.iter().map(|f| f.path.as_str()).collect();
        assert!(paths.contains(&"01-intro/index.md"));
        assert!(paths.contains(&"01-intro/guide.md"));
    }

    #[test]
    fn test_read_all_md_files_skips_assets() {
        let tmp = tempfile::tempdir().unwrap();
        let ws = tmp.path();

        fs::create_dir_all(ws.join("01-intro/assets")).unwrap();
        fs::write(ws.join("01-intro/index.md"), "# 入门").unwrap();
        fs::write(ws.join("01-intro/assets/image.svg"), "<svg/>").unwrap();

        let result = read_all_md_files(ws).unwrap();
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].path, "01-intro/index.md");
    }

    #[test]
    fn test_read_all_md_files_skips_hidden() {
        let tmp = tempfile::tempdir().unwrap();
        let ws = tmp.path();

        fs::create_dir_all(ws.join(".hidden")).unwrap();
        fs::write(ws.join(".hidden/secret.md"), "# secret").unwrap();
        fs::write(ws.join("visible.md"), "# visible").unwrap();

        let result = read_all_md_files(ws).unwrap();
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].path, "visible.md");
    }

    #[test]
    fn test_read_all_md_files_skips_non_md() {
        let tmp = tempfile::tempdir().unwrap();
        let ws = tmp.path();

        fs::write(ws.join("doc.md"), "# doc").unwrap();
        fs::write(ws.join("image.png"), "binary").unwrap();
        fs::write(ws.join("data.drawnix"), "{}").unwrap();

        let result = read_all_md_files(ws).unwrap();
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].path, "doc.md");
    }

    #[test]
    fn test_read_all_md_files_empty_workspace() {
        let tmp = tempfile::tempdir().unwrap();
        let ws = tmp.path();
        fs::create_dir_all(ws).unwrap();

        let result = read_all_md_files(ws).unwrap();
        assert!(result.is_empty());
    }

    #[test]
    fn test_read_all_md_files_nonexistent() {
        let result = read_all_md_files(Path::new("/nonexistent/path"));
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("路径不存在"));
    }

    // ─── 补充测试：对齐 E2E 测试断言 ──────────────────────

    #[test]
    fn test_read_file_error_contains_message() {
        let tmp = tempfile::tempdir().unwrap();
        let file_path = tmp.path().join("no-such-file.md");

        let result = read_file(&file_path);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("文件不存在"));
    }

    #[test]
    fn test_save_file_empty_content() {
        let tmp = tempfile::tempdir().unwrap();
        let file_path = tmp.path().join("empty.md");

        save_file(&file_path, "").unwrap();
        assert_eq!(fs::read_to_string(&file_path).unwrap(), "");
    }

    #[test]
    fn test_save_file_deep_nested_dirs() {
        let tmp = tempfile::tempdir().unwrap();
        let file_path = tmp.path().join("a").join("b").join("c").join("d").join("file.md");

        save_file(&file_path, "deeply nested").unwrap();
        assert_eq!(fs::read_to_string(&file_path).unwrap(), "deeply nested");
    }

    #[test]
    fn test_save_file_discoverable_via_read_all_md_files() {
        let tmp = tempfile::tempdir().unwrap();
        let ws = tmp.path();
        fs::create_dir_all(ws.join("01-intro")).unwrap();

        let content = "# Searchable Content";
        save_file(&ws.join("01-intro/test-search.md"), content).unwrap();

        let all_files = read_all_md_files(ws).unwrap();
        let found = all_files.iter().find(|f| f.path.contains("test-search"));
        assert!(found.is_some());
        assert_eq!(found.unwrap().content, content);
    }

    #[test]
    fn test_read_all_md_files_error_contains_path_not_exist() {
        let result = read_all_md_files(Path::new("/tmp/no-such-workspace-99999"));
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("路径不存在"));
    }

    #[test]
    fn test_read_all_md_files_error_not_directory() {
        let tmp = tempfile::tempdir().unwrap();
        let file_path = tmp.path().join("not-a-dir.md");
        fs::write(&file_path, "# hi").unwrap();

        let result = read_all_md_files(&file_path);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("路径不是目录"));
    }
}
