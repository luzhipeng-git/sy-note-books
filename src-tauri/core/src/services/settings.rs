use std::fs;
use std::path::Path;

use crate::models::settings::Settings;

/// Load settings from a JSON file. Returns defaults if file doesn't exist.
pub fn load_settings(config_path: &Path) -> Result<Settings, String> {
    if !config_path.exists() {
        return Ok(Settings::default());
    }

    let content =
        fs::read_to_string(config_path).map_err(|e| format!("读取设置失败: {}", e))?;
    let settings: Settings =
        serde_json::from_str(&content).map_err(|e| format!("解析设置失败: {}", e))?;
    Ok(settings)
}

/// Save settings to a JSON file.
pub fn save_settings_to_file(config_path: &Path, settings: &Settings) -> Result<(), String> {
    if let Some(parent) = config_path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("创建目录失败: {}", e))?;
    }

    let content = serde_json::to_string_pretty(settings)
        .map_err(|e| format!("序列化设置失败: {}", e))?;
    fs::write(config_path, content).map_err(|e| format!("写入设置失败: {}", e))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_settings() {
        let settings = Settings::default();
        assert!(settings.recent_workspaces.is_empty());
        assert_eq!(settings.theme, "light");
        assert_eq!(settings.sidebar_width, 260);
    }

    #[test]
    fn test_load_settings_missing_file() {
        let tmp = tempfile::tempdir().unwrap();
        let path = tmp.path().join("settings.json");

        let settings = load_settings(&path).unwrap();
        assert_eq!(settings.theme, "light");
    }

    #[test]
    fn test_save_and_load_roundtrip() {
        let tmp = tempfile::tempdir().unwrap();
        let path = tmp.path().join("settings.json");

        let settings = Settings::default();

        save_settings_to_file(&path, &settings).unwrap();
        let loaded = load_settings(&path).unwrap();

        assert!(loaded.recent_workspaces.is_empty());
    }

    // ─── 补充测试：对齐 E2E 测试断言 ──────────────────────

    #[test]
    fn test_load_settings_invalid_json() {
        let tmp = tempfile::tempdir().unwrap();
        let path = tmp.path().join("settings.json");
        fs::write(&path, "not json at all").unwrap();

        let result = load_settings(&path);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("解析设置失败"));
    }

    #[test]
    fn test_save_custom_values_read_back_fields() {
        let tmp = tempfile::tempdir().unwrap();
        let path = tmp.path().join("settings.json");

        let mut settings = Settings::default();
        settings.theme = "dark".to_string();
        settings.sidebar_width = 300;
        settings.sidebar_collapsed = true;

        save_settings_to_file(&path, &settings).unwrap();
        let loaded = load_settings(&path).unwrap();

        assert_eq!(loaded.theme, "dark");
        assert_eq!(loaded.sidebar_width, 300);
        assert!(loaded.sidebar_collapsed);
    }

    #[test]
    fn test_load_settings_defaults_sidebar_collapsed_when_missing() {
        // Older settings.json without sidebarCollapsed should default to false
        let tmp = tempfile::tempdir().unwrap();
        let path = tmp.path().join("settings.json");
        fs::write(&path, r#"{"theme":"dark","sidebarWidth":280}"#).unwrap();

        let loaded = load_settings(&path).unwrap();
        assert_eq!(loaded.theme, "dark");
        assert_eq!(loaded.sidebar_width, 280);
        assert!(!loaded.sidebar_collapsed, "missing field should default to false");
    }
}
