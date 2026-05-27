use std::path::PathBuf;

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("文件不存在: {path}")]
    FileNotFound { path: PathBuf },

    #[error("{operation}失败: {source}")]
    Io {
        operation: &'static str,
        #[source]
        source: std::io::Error,
    },

    #[error("{operation}失败: {source}")]
    Tauri {
        operation: &'static str,
        #[source]
        source: tauri::Error,
    },

    #[error("JSON 解析失败: {0}")]
    JsonParse(String),

    #[error("Markdown 解析失败: {0}")]
    MarkdownParse(String),

    #[error("数据库操作失败: {0}")]
    Database(String),

    #[error("数据校验失败: {0}")]
    Validation(String),

    #[error("文件过大: 当前 {actual} 字节，最大允许 {max} 字节")]
    FileTooLarge { actual: u64, max: u64 },
}

pub type AppResult<T> = Result<T, AppError>;

impl AppError {
    pub fn user_message(&self) -> String {
        self.to_string()
    }
}

pub trait CommandResult<T> {
    fn into_command_result(self) -> Result<T, String>;
}

impl<T> CommandResult<T> for AppResult<T> {
    fn into_command_result(self) -> Result<T, String> {
        self.map_err(|error| error.user_message())
    }
}
