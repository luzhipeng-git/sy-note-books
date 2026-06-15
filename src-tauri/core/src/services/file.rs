use std::fs;
use std::path::{Component, Path};

use crate::models::workspace::MdFileContent;

/// Reject paths containing parent-directory (`..`) traversal components.
/// This prevents `../` sequences in a relative path from escaping the intended
/// directory when the caller joins it with a workspace root. Absolute paths
/// that legitimately resolve outside are fine; this only catches the explicit
/// `..` escape vector.
///
/// Returns Ok(()) if the path is safe, Err otherwise.
fn reject_path_traversal(path: &Path) -> Result<(), String> {
    if path.components().any(|c| matches!(c, Component::ParentDir)) {
        return Err(format!("路径包含非法的 .. 跳转: {}", path.display()));
    }
    Ok(())
}

/// Read file text content.
pub fn read_file(path: &Path) -> Result<String, String> {
    reject_path_traversal(path)?;
    if !path.exists() {
        return Err(format!("文件不存在: {}", path.display()));
    }
    fs::read_to_string(path).map_err(|e| format!("读取文件失败: {}", e))
}

/// Save text content to file. Creates parent directories if needed.
pub fn save_file(path: &Path, content: &str) -> Result<(), String> {
    reject_path_traversal(path)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("创建目录失败: {}", e))?;
    }
    fs::write(path, content).map_err(|e| format!("写入文件失败: {}", e))
}

/// File metadata for verification (exists, size, is_file, is_dir).
/// Used by E2E tests to verify export artifacts without reading binary content.
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileStat {
    pub exists: bool,
    pub size: u64,
    pub is_file: bool,
    pub is_dir: bool,
}

/// Get file metadata (exists, size, type) without reading content.
/// Returns { exists: false, ... } if the path doesn't exist (no error).
pub fn stat_file(path: &Path) -> Result<FileStat, String> {
    reject_path_traversal(path)?;
    if !path.exists() {
        return Ok(FileStat { exists: false, size: 0, is_file: false, is_dir: false });
    }
    let metadata = fs::metadata(path).map_err(|e| format!("读取文件信息失败: {}", e))?;
    Ok(FileStat {
        exists: true,
        size: metadata.len(),
        is_file: metadata.is_file(),
        is_dir: metadata.is_dir(),
    })
}

/// Read the first N bytes of a file as a hex string.
/// Used for magic-byte verification (e.g. ITSF for CHM, %PDF- for PDF).
/// Returns empty string if the file doesn't exist or is smaller than `bytes`.
pub fn read_file_head(path: &Path, bytes: usize) -> Result<String, String> {
    reject_path_traversal(path)?;
    use std::io::Read;
    let mut file = fs::File::open(path).map_err(|e| format!("打开文件失败: {}", e))?;
    let mut buf = vec![0u8; bytes];
    let n = file.read(&mut buf).map_err(|e| format!("读取文件失败: {}", e))?;
    buf.truncate(n);
    Ok(buf.iter().map(|b| format!("{:02x}", b)).collect())
}

/// Read the last N bytes of a file as a UTF-8 string (lossy).
/// Used for trailer verification (e.g. %%EOF at the end of PDF files).
/// Returns empty string if the file doesn't exist or is empty.
pub fn read_file_tail(path: &Path, bytes: usize) -> Result<String, String> {
    reject_path_traversal(path)?;
    use std::io::{Read, Seek, SeekFrom};
    let mut file = fs::File::open(path).map_err(|e| format!("打开文件失败: {}", e))?;
    let metadata = file.metadata().map_err(|e| format!("读取文件信息失败: {}", e))?;
    let file_size = metadata.len() as usize;
    if file_size == 0 {
        return Ok(String::new());
    }
    let start = file_size.saturating_sub(bytes);
    file.seek(SeekFrom::Start(start as u64)).map_err(|e| format!("定位文件失败: {}", e))?;
    let read_size = file_size - start;
    let mut buf = vec![0u8; read_size];
    file.read_exact(&mut buf).map_err(|e| format!("读取文件失败: {}", e))?;
    Ok(String::from_utf8_lossy(&buf).to_string())
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

    // ─── path traversal rejection ──────────────────────────────

    #[test]
    fn test_read_file_rejects_parent_dir_traversal() {
        // Even if the target exists, an explicit .. component is rejected.
        let tmp = tempfile::tempdir().unwrap();
        let target = tmp.path().join("..").join("passwd");
        let result = read_file(&target);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains(".."));
    }

    #[test]
    fn test_save_file_rejects_parent_dir_traversal() {
        let tmp = tempfile::tempdir().unwrap();
        let target = tmp.path().join("../../etc/evil.md");
        let result = save_file(&target, "malicious");
        assert!(result.is_err());
        assert!(result.unwrap_err().contains(".."));
    }

    #[test]
    fn test_save_file_allows_normal_nested_path() {
        let tmp = tempfile::tempdir().unwrap();
        let normal = tmp.path().join("chapter").join("note.md");
        save_file(&normal, "ok").unwrap();
        assert_eq!(fs::read_to_string(&normal).unwrap(), "ok");
    }

    // ─── stat_file ─────────────────────────────────────────────

    #[test]
    fn test_stat_file_existing() {
        let tmp = tempfile::tempdir().unwrap();
        let file = tmp.path().join("test.bin");
        fs::write(&file, b"hello world").unwrap();

        let stat = stat_file(&file).unwrap();
        assert!(stat.exists);
        assert!(stat.is_file);
        assert!(!stat.is_dir);
        assert_eq!(stat.size, 11);
    }

    #[test]
    fn test_stat_file_nonexistent() {
        let stat = stat_file(Path::new("/tmp/no-such-file-12345")).unwrap();
        assert!(!stat.exists);
        assert_eq!(stat.size, 0);
    }

    #[test]
    fn test_stat_file_directory() {
        let tmp = tempfile::tempdir().unwrap();
        let stat = stat_file(tmp.path()).unwrap();
        assert!(stat.exists);
        assert!(!stat.is_file);
        assert!(stat.is_dir);
    }

    // ─── read_file_head ────────────────────────────────────────

    #[test]
    fn test_read_file_head_pdf_magic() {
        let tmp = tempfile::tempdir().unwrap();
        let file = tmp.path().join("test.pdf");
        fs::write(&file, b"%PDF-1.4\nrest of content").unwrap();

        let head = read_file_head(&file, 8).unwrap();
        // %PDF-1.4 → hex: 25 50 44 46 2d 31 2e 34
        assert_eq!(head, "255044462d312e34");
    }

    #[test]
    fn test_read_file_head_itsf_magic() {
        let tmp = tempfile::tempdir().unwrap();
        let file = tmp.path().join("test.chm");
        // ITSF signature: 49 54 53 46
        fs::write(&file, b"ITSF\x03\x00\x00\x00rest").unwrap();

        let head = read_file_head(&file, 4).unwrap();
        assert_eq!(head, "49545346"); // "ITSF" in hex
    }

    #[test]
    fn test_read_file_head_smaller_than_requested() {
        let tmp = tempfile::tempdir().unwrap();
        let file = tmp.path().join("small.txt");
        fs::write(&file, b"hi").unwrap();

        let head = read_file_head(&file, 16).unwrap();
        assert_eq!(head, "6869"); // "hi" — only 2 bytes returned
    }

    #[test]
    fn test_read_file_head_nonexistent() {
        let result = read_file_head(Path::new("/tmp/no-such-12345"), 8);
        assert!(result.is_err());
    }

    // ─── read_file_tail ────────────────────────────────────────

    #[test]
    fn test_read_file_tail_pdf_eof() {
        let tmp = tempfile::tempdir().unwrap();
        let file = tmp.path().join("test.pdf");
        fs::write(&file, b"%PDF-1.4\n...content...\n%%EOF").unwrap();

        let tail = read_file_tail(&file, 32).unwrap();
        assert!(tail.contains("%%EOF"), "tail should contain %%EOF, got: {tail}");
    }

    #[test]
    fn test_read_file_tail_smaller_than_requested() {
        let tmp = tempfile::tempdir().unwrap();
        let file = tmp.path().join("small.txt");
        fs::write(&file, b"hello").unwrap();

        let tail = read_file_tail(&file, 32).unwrap();
        assert_eq!(tail, "hello"); // entire file returned
    }

    #[test]
    fn test_read_file_tail_empty_file() {
        let tmp = tempfile::tempdir().unwrap();
        let file = tmp.path().join("empty.txt");
        fs::write(&file, "").unwrap();

        let tail = read_file_tail(&file, 32).unwrap();
        assert_eq!(tail, "");
    }
}
