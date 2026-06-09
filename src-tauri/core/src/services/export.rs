use std::path::Path;

/// Export workspace as CHM electronic book.
/// Currently a stub — actual export logic not yet implemented.
pub fn export_chm(
    workspace_path: &Path,
    output_path: &str,
    _chapter: Option<&str>,
) -> Result<String, String> {
    if !workspace_path.exists() {
        return Err(format!("Workspace 路径不存在：{}", workspace_path.display()));
    }
    // Stub: return mock output path
    Ok(output_path.to_string())
}

/// Export workspace as nginx-deployable static site.
/// Currently a stub — actual export logic not yet implemented.
pub fn export_nginx(
    workspace_path: &Path,
    output_path: &str,
    _chapter: Option<&str>,
) -> Result<String, String> {
    if !workspace_path.exists() {
        return Err(format!("Workspace 路径不存在：{}", workspace_path.display()));
    }
    // Stub: return mock output path
    Ok(output_path.to_string())
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

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn export_chm_returns_output_path() {
        let dir = TempDir::new().unwrap();
        let result = export_chm(dir.path(), "/tmp/dist/chm-v1", None);
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), "/tmp/dist/chm-v1");
    }

    #[test]
    fn export_chm_rejects_missing_workspace() {
        let result = export_chm(Path::new("/nonexistent/path"), "/tmp/out", None);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("不存在"));
    }

    #[test]
    fn export_chm_with_chapter_scope() {
        let dir = TempDir::new().unwrap();
        let result = export_chm(dir.path(), "/tmp/dist/chm-v1", Some("01-intro"));
        assert!(result.is_ok());
    }

    #[test]
    fn export_nginx_returns_output_path() {
        let dir = TempDir::new().unwrap();
        let result = export_nginx(dir.path(), "/tmp/dist/nginx-v1", None);
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), "/tmp/dist/nginx-v1");
    }

    #[test]
    fn export_nginx_rejects_missing_workspace() {
        let result = export_nginx(Path::new("/nonexistent/path"), "/tmp/out", None);
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
        let dir = TempDir::new().unwrap();
        let file_path = dir.path().join("test.md");
        std::fs::write(&file_path, "# Test").unwrap();
        let result = export_pdf(&file_path);
        assert!(result.is_ok());
    }
}
