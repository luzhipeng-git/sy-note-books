use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecentWorkspace {
    pub path: String,
    pub title: String,
    pub last_opened: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    #[serde(default)]
    pub recent_workspaces: Vec<RecentWorkspace>,
    #[serde(default = "default_theme")]
    pub theme: String,
    #[serde(default = "default_sidebar_width")]
    pub sidebar_width: u32,
}

fn default_theme() -> String {
    "light".to_string()
}

fn default_sidebar_width() -> u32 {
    260
}

impl Default for Settings {
    fn default() -> Self {
        Settings {
            recent_workspaces: Vec::new(),
            theme: default_theme(),
            sidebar_width: default_sidebar_width(),
        }
    }
}
