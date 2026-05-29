use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    pub auto_save_enabled: bool,
    pub auto_save_interval_ms: u64,
    pub default_view_mode: DefaultViewMode,
    pub sidebar_collapsed: bool,
    #[serde(default = "default_theme_mode")]
    pub theme: ThemeMode,
    #[serde(default)]
    pub focus_mode: bool,
    pub agent: AgentSettings,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum DefaultViewMode {
    Outline,
    Mindmap,
    Split,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ThemeMode {
    Light,
    Dark,
    System,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentSettings {
    pub enabled: bool,
    pub provider: String,
    pub model: String,
    pub base_url: String,
    pub thinking_level: AgentThinkingLevel,
    pub context_scope: AgentContextScope,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum AgentThinkingLevel {
    Off,
    Minimal,
    Low,
    Medium,
    High,
    Xhigh,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum AgentContextScope {
    CurrentDocument,
}

pub const MIN_AUTO_SAVE_INTERVAL_MS: u64 = 500;
pub const MAX_AUTO_SAVE_INTERVAL_MS: u64 = 10_000;
pub const DEFAULT_AUTO_SAVE_INTERVAL_MS: u64 = 1_500;

fn default_theme_mode() -> ThemeMode {
    ThemeMode::System
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            auto_save_enabled: true,
            auto_save_interval_ms: DEFAULT_AUTO_SAVE_INTERVAL_MS,
            default_view_mode: DefaultViewMode::Outline,
            sidebar_collapsed: false,
            theme: ThemeMode::System,
            focus_mode: false,
            agent: AgentSettings::default(),
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

        self.agent.validate()?;

        Ok(())
    }
}

impl Default for AgentSettings {
    fn default() -> Self {
        Self {
            enabled: false,
            provider: "openai-compatible".to_string(),
            model: "gpt-4.1".to_string(),
            base_url: "https://api.openai.com/v1".to_string(),
            thinking_level: AgentThinkingLevel::Medium,
            context_scope: AgentContextScope::CurrentDocument,
        }
    }
}

impl AgentSettings {
    fn validate(&self) -> Result<(), String> {
        if self.provider.trim().is_empty() {
            return Err("第三方模型 Provider 不能为空".to_string());
        }
        if self.model.trim().is_empty() {
            return Err("第三方模型 ID 不能为空".to_string());
        }
        if self.base_url.trim().is_empty() {
            return Err("第三方模型接口地址不能为空".to_string());
        }

        Ok(())
    }
}
