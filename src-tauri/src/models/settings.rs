use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    pub auto_save_enabled: bool,
    pub auto_save_interval_ms: u64,
    pub default_view_mode: DefaultViewMode,
    pub sidebar_collapsed: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum DefaultViewMode {
    Outline,
    Mindmap,
    Split,
}

pub const MIN_AUTO_SAVE_INTERVAL_MS: u64 = 500;
pub const MAX_AUTO_SAVE_INTERVAL_MS: u64 = 10_000;
pub const DEFAULT_AUTO_SAVE_INTERVAL_MS: u64 = 1_500;

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            auto_save_enabled: true,
            auto_save_interval_ms: DEFAULT_AUTO_SAVE_INTERVAL_MS,
            default_view_mode: DefaultViewMode::Outline,
            sidebar_collapsed: false,
        }
    }
}

impl AppSettings {
    pub fn validate(&self) -> Result<(), String> {
        if !(MIN_AUTO_SAVE_INTERVAL_MS..=MAX_AUTO_SAVE_INTERVAL_MS)
            .contains(&self.auto_save_interval_ms)
        {
            return Err(format!(
                "自动保存延迟必须在 {MIN_AUTO_SAVE_INTERVAL_MS}-{MAX_AUTO_SAVE_INTERVAL_MS} 毫秒之间"
            ));
        }

        Ok(())
    }
}
