use std::{
    fs::{self, File},
    io::Write,
    path::{Path, PathBuf},
};

use crate::{
    models::OutlineDocument,
    utils::error::{AppError, AppResult},
};

pub const MAX_DOCUMENT_SIZE_BYTES: u64 = 10 * 1024 * 1024;

pub fn save_document(path: impl AsRef<Path>, doc: &OutlineDocument) -> AppResult<()> {
    doc.validate()?;
    let content = serde_json::to_string_pretty(doc)
        .map_err(|error| AppError::JsonParse(error.to_string()))?;
    atomic_write_with_backup(path.as_ref(), &content)
}

pub fn load_document(path: impl AsRef<Path>) -> AppResult<OutlineDocument> {
    let path = path.as_ref();
    match load_document_without_fallback(path) {
        Ok(doc) => Ok(doc),
        Err(primary_error) => {
            let backup_path = backup_path(path);
            if backup_path.exists() {
                load_document_without_fallback(&backup_path).map_err(|backup_error| {
                    AppError::JsonParse(format!(
                        "主文件读取失败（{}），备份读取失败（{}）",
                        primary_error, backup_error
                    ))
                })
            } else {
                Err(primary_error)
            }
        }
    }
}

pub fn export_json(path: impl AsRef<Path>, doc: &OutlineDocument) -> AppResult<()> {
    save_document(path, doc)
}

pub fn import_json(path: impl AsRef<Path>) -> AppResult<OutlineDocument> {
    load_document(path)
}

pub fn write_text(path: impl AsRef<Path>, content: &str) -> AppResult<()> {
    atomic_write_with_backup(path.as_ref(), content)
}

pub fn read_text(path: impl AsRef<Path>) -> AppResult<String> {
    let path = path.as_ref();
    ensure_file_can_be_read(path)?;
    fs::read_to_string(path).map_err(|source| AppError::Io {
        operation: "读取文件",
        source,
    })
}

fn load_document_without_fallback(path: &Path) -> AppResult<OutlineDocument> {
    ensure_file_can_be_read(path)?;
    let content = fs::read_to_string(path).map_err(|source| AppError::Io {
        operation: "读取文档",
        source,
    })?;
    let doc = serde_json::from_str::<OutlineDocument>(&content)
        .map_err(|error| AppError::JsonParse(error.to_string()))?;
    doc.validate()?;
    Ok(doc)
}

fn ensure_file_can_be_read(path: &Path) -> AppResult<()> {
    if !path.exists() {
        return Err(AppError::FileNotFound {
            path: path.to_path_buf(),
        });
    }

    let metadata = fs::metadata(path).map_err(|source| AppError::Io {
        operation: "读取文件信息",
        source,
    })?;

    if metadata.len() > MAX_DOCUMENT_SIZE_BYTES {
        return Err(AppError::FileTooLarge {
            actual: metadata.len(),
            max: MAX_DOCUMENT_SIZE_BYTES,
        });
    }

    Ok(())
}

fn atomic_write_with_backup(path: &Path, content: &str) -> AppResult<()> {
    ensure_content_can_be_written(content)?;

    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|source| AppError::Io {
            operation: "创建目录",
            source,
        })?;
    }

    let tmp_path = tmp_path(path);
    write_and_sync(&tmp_path, content)?;

    if path.exists() {
        let backup_path = backup_path(path);
        fs::copy(path, &backup_path).map_err(|source| AppError::Io {
            operation: "创建备份文件",
            source,
        })?;
    }

    fs::rename(&tmp_path, path).map_err(|source| AppError::Io {
        operation: "替换文件",
        source,
    })?;

    Ok(())
}

fn ensure_content_can_be_written(content: &str) -> AppResult<()> {
    let actual = content.len() as u64;
    if actual > MAX_DOCUMENT_SIZE_BYTES {
        return Err(AppError::FileTooLarge {
            actual,
            max: MAX_DOCUMENT_SIZE_BYTES,
        });
    }

    Ok(())
}

fn write_and_sync(path: &Path, content: &str) -> AppResult<()> {
    let mut file = File::create(path).map_err(|source| AppError::Io {
        operation: "创建临时文件",
        source,
    })?;
    file.write_all(content.as_bytes())
        .map_err(|source| AppError::Io {
            operation: "写入临时文件",
            source,
        })?;
    file.sync_all().map_err(|source| AppError::Io {
        operation: "同步临时文件",
        source,
    })?;
    Ok(())
}

fn tmp_path(path: &Path) -> PathBuf {
    PathBuf::from(format!("{}.tmp", path.display()))
}

fn backup_path(path: &Path) -> PathBuf {
    PathBuf::from(format!("{}.bak", path.display()))
}

#[cfg(test)]
mod tests {
    use std::fs;

    use tempfile::tempdir;

    use crate::models::{OutlineDocument, OutlineNode};

    use super::{backup_path, load_document, save_document, write_text, MAX_DOCUMENT_SIZE_BYTES};

    fn sample_doc(title: &str, child_id: &str) -> OutlineDocument {
        OutlineDocument {
            id: format!("doc_{child_id}"),
            title: title.to_string(),
            version: 1,
            created_at: 1,
            updated_at: 1,
            root: OutlineNode {
                id: format!("root_{child_id}"),
                text: title.to_string(),
                note: None,
                collapsed: None,
                checked: None,
                tags: None,
                created_at: 1,
                updated_at: 1,
                children: vec![OutlineNode {
                    id: child_id.to_string(),
                    text: "child".to_string(),
                    note: None,
                    collapsed: None,
                    checked: None,
                    tags: None,
                    created_at: 1,
                    updated_at: 1,
                    children: Vec::new(),
                }],
            },
        }
    }

    #[test]
    fn saves_pretty_json_and_creates_backup_on_second_save() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("doc.siwei.json");

        save_document(&path, &sample_doc("First", "child_a")).unwrap();
        let first_content = fs::read_to_string(&path).unwrap();
        assert!(first_content.contains("\n  \"title\": \"First\""));

        save_document(&path, &sample_doc("Second", "child_b")).unwrap();
        let current = fs::read_to_string(&path).unwrap();
        let backup = fs::read_to_string(backup_path(&path)).unwrap();

        assert!(current.contains("\"title\": \"Second\""));
        assert!(backup.contains("\"title\": \"First\""));
        assert!(!path.with_extension("json.tmp").exists());
    }

    #[test]
    fn loads_backup_when_primary_json_is_corrupted() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("doc.siwei.json");

        save_document(&path, &sample_doc("Recoverable", "child_a")).unwrap();
        save_document(&path, &sample_doc("Current", "child_b")).unwrap();
        fs::write(&path, "{ broken json").unwrap();

        let loaded = load_document(&path).unwrap();
        assert_eq!(loaded.title, "Recoverable");
    }

    #[test]
    fn rejects_writes_larger_than_document_size_limit() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("oversized.md");
        let oversized = "x".repeat(MAX_DOCUMENT_SIZE_BYTES as usize + 1);

        let error = write_text(&path, &oversized).unwrap_err().to_string();

        assert!(error.contains("文件过大"));
        assert!(!path.exists());
    }
}
