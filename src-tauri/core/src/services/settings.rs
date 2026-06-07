use std::fs;
use std::path::Path;

use crate::models::settings::{RecentWorkspace, Settings};

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

/// Add a workspace to the recent list. Deduplicates by path, keeps max 10 entries.
/// Returns the updated settings (does NOT write to disk).
pub fn add_recent_workspace(settings: &mut Settings, path: &str, title: &str) {
    // Remove existing entry for this path
    settings
        .recent_workspaces
        .retain(|w| w.path != path);

    // Add to front
    settings.recent_workspaces.insert(
        0,
        RecentWorkspace {
            path: path.to_string(),
            title: title.to_string(),
            last_opened: "2026-05-24".to_string(),
        },
    );

    // Keep max 10
    settings.recent_workspaces.truncate(10);
}

/// Remove a workspace from the recent list.
/// Returns the updated settings (does NOT write to disk).
pub fn remove_recent_workspace(settings: &mut Settings, path: &str) {
    settings.recent_workspaces.retain(|w| w.path != path);
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

        let mut settings = Settings::default();
        add_recent_workspace(&mut settings, "/path/to/ws", "测试");

        save_settings_to_file(&path, &settings).unwrap();
        let loaded = load_settings(&path).unwrap();

        assert_eq!(loaded.recent_workspaces.len(), 1);
        assert_eq!(loaded.recent_workspaces[0].title, "测试");
    }

    #[test]
    fn test_add_recent_workspace_dedup() {
        let mut settings = Settings::default();
        add_recent_workspace(&mut settings, "/path/a", "A");
        add_recent_workspace(&mut settings, "/path/b", "B");
        add_recent_workspace(&mut settings, "/path/a", "A Updated");

        assert_eq!(settings.recent_workspaces.len(), 2);
        assert_eq!(settings.recent_workspaces[0].title, "A Updated");
        assert_eq!(settings.recent_workspaces[1].title, "B");
    }

    #[test]
    fn test_add_recent_workspace_max_10() {
        let mut settings = Settings::default();
        for i in 0..15 {
            add_recent_workspace(&mut settings, &format!("/path/{}", i), &format!("WS {}", i));
        }
        assert_eq!(settings.recent_workspaces.len(), 10);
        // Most recent should be first
        assert_eq!(settings.recent_workspaces[0].title, "WS 14");
    }

    #[test]
    fn test_remove_recent_workspace() {
        let mut settings = Settings::default();
        add_recent_workspace(&mut settings, "/path/a", "A");
        add_recent_workspace(&mut settings, "/path/b", "B");

        remove_recent_workspace(&mut settings, "/path/a");
        assert_eq!(settings.recent_workspaces.len(), 1);
        assert_eq!(settings.recent_workspaces[0].title, "B");
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
        add_recent_workspace(&mut settings, "/tmp/test-ws", "测试");

        save_settings_to_file(&path, &settings).unwrap();
        let loaded = load_settings(&path).unwrap();

        assert_eq!(loaded.theme, "dark");
        assert_eq!(loaded.sidebar_width, 300);
        assert_eq!(loaded.recent_workspaces.len(), 1);
        assert_eq!(loaded.recent_workspaces[0].path, "/tmp/test-ws");
        assert_eq!(loaded.recent_workspaces[0].title, "测试");
    }
}
