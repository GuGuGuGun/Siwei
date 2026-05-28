use std::{
    fs,
    path::{Path, PathBuf},
};

use crate::{
    models::AppSettings,
    utils::error::{AppError, AppResult},
};

const SETTINGS_FILE: &str = "settings.json";

pub fn get_settings(app_data_dir: impl AsRef<Path>) -> AppResult<AppSettings> {
    let path = settings_path(app_data_dir.as_ref());
    if !path.exists() {
        return Ok(AppSettings::default());
    }

    let content = fs::read_to_string(&path).map_err(|source| AppError::Io {
        operation: "读取应用设置",
        source,
    })?;

    let settings = match serde_json::from_str::<AppSettings>(&content) {
        Ok(settings) => settings,
        Err(_) => return Ok(AppSettings::default()),
    };

    if settings.validate().is_err() {
        return Ok(AppSettings::default());
    }

    Ok(settings)
}

pub fn update_settings(
    app_data_dir: impl AsRef<Path>,
    settings: AppSettings,
) -> AppResult<AppSettings> {
    settings.validate().map_err(AppError::Validation)?;

    fs::create_dir_all(app_data_dir.as_ref()).map_err(|source| AppError::Io {
        operation: "创建应用数据目录",
        source,
    })?;

    let content = serde_json::to_string_pretty(&settings)
        .map_err(|error| AppError::JsonParse(error.to_string()))?;
    fs::write(settings_path(app_data_dir.as_ref()), content).map_err(|source| AppError::Io {
        operation: "写入应用设置",
        source,
    })?;

    Ok(settings)
}

fn settings_path(app_data_dir: &Path) -> PathBuf {
    app_data_dir.join(SETTINGS_FILE)
}

#[cfg(test)]
mod tests {
    use tempfile::tempdir;

    use crate::models::{settings::DefaultViewMode, AppSettings};

    use super::{get_settings, update_settings};

    #[test]
    fn returns_defaults_when_settings_file_is_missing() {
        let dir = tempdir().unwrap();

        let settings = get_settings(dir.path()).unwrap();

        assert_eq!(settings, AppSettings::default());
    }

    #[test]
    fn persists_and_reads_settings() {
        let dir = tempdir().unwrap();
        let settings = AppSettings {
            auto_save_enabled: false,
            auto_save_interval_ms: 2_500,
            default_view_mode: DefaultViewMode::Split,
            sidebar_collapsed: true,
        };

        update_settings(dir.path(), settings.clone()).unwrap();

        assert_eq!(get_settings(dir.path()).unwrap(), settings);
    }

    #[test]
    fn corrupted_settings_file_falls_back_to_defaults() {
        let dir = tempdir().unwrap();
        std::fs::write(dir.path().join("settings.json"), "{ broken json").unwrap();

        let settings = get_settings(dir.path()).unwrap();

        assert_eq!(settings, AppSettings::default());
    }

    #[test]
    fn rejects_auto_save_interval_outside_allowed_range() {
        let dir = tempdir().unwrap();
        let settings = AppSettings {
            auto_save_interval_ms: 100,
            ..AppSettings::default()
        };

        let error = update_settings(dir.path(), settings)
            .unwrap_err()
            .to_string();

        assert!(error.contains("自动保存延迟必须在 500-10000 毫秒之间"));
    }
}
