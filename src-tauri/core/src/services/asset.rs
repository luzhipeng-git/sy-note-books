use std::fs;
use std::path::Path;

use crate::models::workspace::AssetInfo;

/// List all files in an assets directory.
/// Returns empty vec if directory does not exist (no error).
/// Classifies files as "image" (svg/png/jpg/jpeg/gif/webp) or "other".
pub fn list_assets(dir: &Path) -> Result<Vec<AssetInfo>, String> {
    if !dir.exists() {
        return Ok(vec![]);
    }

    let mut assets = Vec::new();
    for entry in fs::read_dir(dir).map_err(|e| format!("读取目录失败: {}", e))? {
        let entry = entry.map_err(|e| format!("读取目录条目失败: {}", e))?;
        let metadata = entry.metadata().map_err(|e| format!("读取文件信息失败: {}", e))?;
        let name = entry.file_name().to_string_lossy().to_string();
        let ext = Path::new(&name)
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("")
            .to_string();
        let file_type = match ext.as_str() {
            "svg" | "png" | "jpg" | "jpeg" | "gif" | "webp" => "image",
            _ => "other",
        };
        let asset_path = entry.path().to_string_lossy().to_string();
        assets.push(AssetInfo {
            name,
            size: metadata.len(),
            file_type: file_type.to_string(),
            path: asset_path,
        });
    }
    Ok(assets)
}

/// Save a Drawnix whiteboard file pair (.drawnix data + .svg preview).
/// Uses temp files + atomic rename so that partial writes don't corrupt existing files.
/// Auto-creates parent directories if needed.
pub fn save_drawnix(path: &Path, data: &str, svg_content: &str) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("创建目录失败: {}", e))?;
    }

    let svg_path = path.with_extension("svg");

    // Write both files to temp locations first
    let tmp_data = path.with_extension("drawnix.tmp");
    let tmp_svg = path.with_extension("svg.tmp");

    fs::write(&tmp_data, data).map_err(|e| format!("写入 drawnix 文件失败: {}", e))?;
    if let Err(e) = fs::write(&tmp_svg, svg_content) {
        // SVG write failed — clean up the data temp file
        let _ = fs::remove_file(&tmp_data);
        return Err(format!("写入 SVG 文件失败: {}", e));
    }

    // Atomic renames — both temp files exist, now swap them into place
    if let Err(e) = fs::rename(&tmp_data, path) {
        let _ = fs::remove_file(&tmp_data);
        let _ = fs::remove_file(&tmp_svg);
        return Err(format!("重命名 drawnix 文件失败: {}", e));
    }
    if let Err(e) = fs::rename(&tmp_svg, &svg_path) {
        // data file already renamed successfully, only svg rename failed
        // Try to clean up the svg temp; the old svg (if any) is still intact
        let _ = fs::remove_file(&tmp_svg);
        return Err(format!("重命名 SVG 文件失败: {}", e));
    }

    Ok(())
}

/// Get the next image index for a document, scanning an assets directory.
/// Returns 1 if the directory does not exist (no error).
/// Delegates to `next_image_index` for the actual calculation.
pub fn get_next_image_index_for_dir(assets_dir: &Path, doc_name: &str) -> Result<u32, String> {
    if !assets_dir.exists() {
        return Ok(1);
    }
    let entries: Vec<String> = fs::read_dir(assets_dir)
        .map_err(|e| format!("读取目录失败: {}", e))?
        .filter_map(|e| e.ok())
        .filter_map(|e| e.file_name().to_str().map(|s| s.to_string()))
        .collect();
    let file_refs: Vec<&str> = entries.iter().map(|s| s.as_str()).collect();
    Ok(super::workspace::next_image_index(&file_refs, doc_name))
}

#[cfg(test)]
mod tests {
    use super::*;

    // ─── list_assets ──────────────────────────────────────────

    #[test]
    fn test_list_assets_empty_dir() {
        let tmp = tempfile::tempdir().unwrap();
        let assets = list_assets(tmp.path()).unwrap();
        assert!(assets.is_empty());
    }

    #[test]
    fn test_list_assets_image_types() {
        let tmp = tempfile::tempdir().unwrap();
        for ext in &["svg", "png", "jpg", "jpeg", "gif", "webp"] {
            fs::write(tmp.path().join(format!("test.{}", ext)), "data").unwrap();
        }

        let assets = list_assets(tmp.path()).unwrap();
        assert_eq!(assets.len(), 6);
        for asset in &assets {
            assert_eq!(asset.file_type, "image");
        }
    }

    #[test]
    fn test_list_assets_other_type() {
        let tmp = tempfile::tempdir().unwrap();
        fs::write(tmp.path().join("data.json"), "{}").unwrap();
        fs::write(tmp.path().join("notes.txt"), "hello").unwrap();
        fs::write(tmp.path().join("board.drawnix"), "{ }").unwrap();

        let assets = list_assets(tmp.path()).unwrap();
        assert_eq!(assets.len(), 3);
        for asset in &assets {
            assert_eq!(asset.file_type, "other");
        }
    }

    #[test]
    fn test_list_assets_nonexistent_dir() {
        let assets = list_assets(Path::new("/tmp/no-such-assets-dir-12345")).unwrap();
        assert_eq!(assets, vec![]);
    }

    #[test]
    fn test_list_assets_size_field() {
        let tmp = tempfile::tempdir().unwrap();
        let content = "hello world";
        fs::write(tmp.path().join("test.svg"), content).unwrap();

        let assets = list_assets(tmp.path()).unwrap();
        assert_eq!(assets[0].size, content.len() as u64);
    }

    #[test]
    fn test_list_assets_path_field() {
        let tmp = tempfile::tempdir().unwrap();
        fs::write(tmp.path().join("test.png"), "data").unwrap();

        let assets = list_assets(tmp.path()).unwrap();
        assert!(assets[0].path.ends_with("test.png"));
    }

    #[test]
    fn test_list_assets_mixed_types() {
        let tmp = tempfile::tempdir().unwrap();
        fs::write(tmp.path().join("photo.jpg"), "img").unwrap();
        fs::write(tmp.path().join("doc.json"), "{}").unwrap();
        fs::write(tmp.path().join("icon.svg"), "<svg/>").unwrap();

        let assets = list_assets(tmp.path()).unwrap();
        assert_eq!(assets.len(), 3);

        let images: Vec<_> = assets.iter().filter(|a| a.file_type == "image").collect();
        let others: Vec<_> = assets.iter().filter(|a| a.file_type == "other").collect();
        assert_eq!(images.len(), 2);
        assert_eq!(others.len(), 1);
    }

    // ─── save_drawnix ─────────────────────────────────────────

    #[test]
    fn test_save_drawnix_creates_pair() {
        let tmp = tempfile::tempdir().unwrap();
        let drawnix_path = tmp.path().join("board.drawnix");
        let svg_path = tmp.path().join("board.svg");
        let data = r#"{"type":"drawnix","elements":[]}"#;
        let svg_content = r#"<svg xmlns="http://www.w3.org/2000/svg"></svg>"#;

        save_drawnix(&drawnix_path, data, svg_content).unwrap();

        assert_eq!(fs::read_to_string(&drawnix_path).unwrap(), data);
        assert_eq!(fs::read_to_string(&svg_path).unwrap(), svg_content);
    }

    #[test]
    fn test_save_drawnix_deep_nested() {
        let tmp = tempfile::tempdir().unwrap();
        let drawnix_path = tmp.path().join("sub").join("deep").join("board.drawnix");
        let svg_path = tmp.path().join("sub").join("deep").join("board.svg");
        let data = r#"{"test":true}"#;
        let svg_content = "<svg></svg>";

        save_drawnix(&drawnix_path, data, svg_content).unwrap();

        assert_eq!(fs::read_to_string(&drawnix_path).unwrap(), data);
        assert_eq!(fs::read_to_string(&svg_path).unwrap(), svg_content);
    }

    #[test]
    fn test_save_drawnix_overwrites() {
        let tmp = tempfile::tempdir().unwrap();
        let drawnix_path = tmp.path().join("board.drawnix");

        save_drawnix(&drawnix_path, "old data", "old svg").unwrap();
        save_drawnix(&drawnix_path, "new data", "new svg").unwrap();

        assert_eq!(fs::read_to_string(&drawnix_path).unwrap(), "new data");
        assert_eq!(
            fs::read_to_string(tmp.path().join("board.svg")).unwrap(),
            "new svg"
        );
    }

    // ─── get_next_image_index_for_dir ─────────────────────────

    #[test]
    fn test_get_next_image_index_for_dir_nonexistent() {
        let index =
            get_next_image_index_for_dir(Path::new("/tmp/no-assets-dir-12345"), "index").unwrap();
        assert_eq!(index, 1);
    }

    #[test]
    fn test_get_next_image_index_for_dir_with_files() {
        let tmp = tempfile::tempdir().unwrap();
        fs::write(tmp.path().join("index-img-001.svg"), "<svg/>").unwrap();

        let index = get_next_image_index_for_dir(tmp.path(), "index").unwrap();
        assert_eq!(index, 2);
    }

    #[test]
    fn test_get_next_image_index_for_dir_different_doc() {
        let tmp = tempfile::tempdir().unwrap();
        fs::write(tmp.path().join("index-img-001.svg"), "<svg/>").unwrap();

        let index = get_next_image_index_for_dir(tmp.path(), "other-doc").unwrap();
        assert_eq!(index, 1);
    }

    // ─── save_drawnix 原子性 ─────────────────────────────────

    #[test]
    fn test_save_drawnix_no_temp_files_left_on_success() {
        let tmp = tempfile::tempdir().unwrap();
        let drawnix_path = tmp.path().join("board.drawnix");

        save_drawnix(&drawnix_path, "data", "<svg/>").unwrap();

        // Only the final files should exist, no .tmp remnants
        assert!(drawnix_path.exists());
        assert!(tmp.path().join("board.svg").exists());
        assert!(!tmp.path().join("board.drawnix.tmp").exists());
        assert!(!tmp.path().join("board.svg.tmp").exists());
    }

    #[test]
    fn test_save_drawnix_preserves_existing_on_failure() {
        // Root bypasses filesystem permissions; skip when running as root (e.g. Docker)
        #[cfg(unix)]
        {
            let uid = std::process::Command::new("id")
                .arg("-u")
                .output()
                .ok()
                .and_then(|o| String::from_utf8(o.stdout).ok())
                .and_then(|s| s.trim().parse::<u32>().ok());
            if uid == Some(0) {
                eprintln!("Skipping test: running as root, filesystem permissions not enforced");
                return;
            }
        }

        let tmp = tempfile::tempdir().unwrap();
        // Use a read-only directory to simulate write failure
        let readonly_dir = tmp.path().join("readonly");
        fs::create_dir_all(&readonly_dir).unwrap();

        let drawnix_path = readonly_dir.join("board.drawnix");
        let svg_path = readonly_dir.join("board.svg");

        // Write initial content
        save_drawnix(&drawnix_path, "original data", "original svg").unwrap();
        assert!(drawnix_path.exists());
        assert!(svg_path.exists());

        // Make the directory read-only so subsequent writes fail
        // On Linux, set permissions to read-only (0o444)
        let mut perms = fs::metadata(&readonly_dir).unwrap().permissions();
        perms.set_readonly(true);
        fs::set_permissions(&readonly_dir, perms).unwrap();

        // On Windows, the readonly flag on directories doesn't prevent file writes,
        // so this test can't reliably simulate write failure. Skip on Windows.
        #[cfg(windows)]
        {
            return;
        }

        // Attempt to overwrite should fail (can't create .tmp files)
        let result = save_drawnix(&drawnix_path, "new data", "new svg");
        assert!(result.is_err());

        // The original files should still have the original content
        assert_eq!(fs::read_to_string(&drawnix_path).unwrap(), "original data");
        assert_eq!(fs::read_to_string(&svg_path).unwrap(), "original svg");

        // Restore permissions so tempfile cleanup doesn't fail
        let mut perms = fs::metadata(&readonly_dir).unwrap().permissions();
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            perms.set_mode(0o755);
        }
        fs::set_permissions(&readonly_dir, perms).unwrap();
    }

    #[test]
    fn test_save_drawnix_overwrite_atomic() {
        let tmp = tempfile::tempdir().unwrap();
        let drawnix_path = tmp.path().join("board.drawnix");

        // Write initial content
        save_drawnix(&drawnix_path, "v1 data", "v1 svg").unwrap();

        // Overwrite with new content
        save_drawnix(&drawnix_path, "v2 data", "v2 svg").unwrap();

        // Verify both files have new content
        assert_eq!(fs::read_to_string(&drawnix_path).unwrap(), "v2 data");
        assert_eq!(fs::read_to_string(tmp.path().join("board.svg")).unwrap(), "v2 svg");

        // No temp files left
        assert!(!tmp.path().join("board.drawnix.tmp").exists());
        assert!(!tmp.path().join("board.svg.tmp").exists());
    }
}
