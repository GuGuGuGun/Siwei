use std::{
    fs::{self, File},
    io::Write,
    path::{Path, PathBuf},
};

use crate::{
    models::{MindMapLayoutState, OutlineDocument, OutlineNode},
    utils::error::{AppError, AppResult},
};

pub const MAX_DOCUMENT_SIZE_BYTES: u64 = 10 * 1024 * 1024;

pub fn save_document(path: impl AsRef<Path>, doc: &OutlineDocument) -> AppResult<()> {
    let normalized_doc = document_with_pruned_layout(doc);
    normalized_doc.validate()?;
    let content = serde_json::to_string_pretty(&normalized_doc)
        .map_err(|error| AppError::JsonParse(error.to_string()))?;
    atomic_write_with_backup(path.as_ref(), &content)
}

fn document_with_pruned_layout(doc: &OutlineDocument) -> OutlineDocument {
    let Some(layout) = doc.mind_map_layout.clone() else {
        return doc.clone();
    };
    let MindMapLayoutState::V1 {
        engine_version,
        strategy,
        nodes,
    } = layout.normalize()
    else {
        unreachable!("layout normalization always returns v1")
    };

    let mut valid_node_ids = std::collections::HashSet::new();
    collect_node_ids(&doc.root, &mut valid_node_ids);
    let pruned_nodes = nodes
        .into_iter()
        .filter(|(node_id, _)| valid_node_ids.contains(node_id))
        .collect();

    OutlineDocument {
        mind_map_layout: Some(MindMapLayoutState::V1 {
            engine_version,
            strategy,
            nodes: pruned_nodes,
        }),
        ..doc.clone()
    }
}

fn collect_node_ids(node: &OutlineNode, ids: &mut std::collections::HashSet<String>) {
    ids.insert(node.id.clone());
    for child in &node.children {
        collect_node_ids(child, ids);
    }
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
    deserialize_document_tolerating_broken_layout(&content)
}

fn deserialize_document_tolerating_broken_layout(content: &str) -> AppResult<OutlineDocument> {
    match serde_json::from_str::<OutlineDocument>(content) {
        Ok(doc) => match doc.validate() {
            Ok(()) => Ok(doc),
            Err(primary_error) => {
                // 布局字段属于可恢复视图状态，损坏时优先保留文档正文，避免用户无法打开笔记。
                deserialize_document_without_layout(content, primary_error.to_string())
            }
        },
        Err(primary_error) => {
            // 反序列化失败也尝试剥离 mindMapLayout，兼容旧版本或实验布局写出的异常坐标。
            deserialize_document_without_layout(content, primary_error.to_string())
        }
    }
}

fn deserialize_document_without_layout(
    content: &str,
    primary_error_message: String,
) -> AppResult<OutlineDocument> {
    let mut value = serde_json::from_str::<serde_json::Value>(content)
        .map_err(|_| AppError::JsonParse(primary_error_message.clone()))?;
    let Some(object) = value.as_object_mut() else {
        return Err(AppError::JsonParse(primary_error_message));
    };
    if object.remove("mindMapLayout").is_none() {
        return Err(AppError::JsonParse(primary_error_message));
    }

    let doc = serde_json::from_value::<OutlineDocument>(value)
        .map_err(|_| AppError::JsonParse(primary_error_message.clone()))?;
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
        // 先备份旧文件再替换，保证主文件写坏时仍可从 .bak 恢复用户数据。
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

    use crate::models::{MindMapLayoutState, OutlineDocument, OutlineNode};

    use super::{backup_path, load_document, save_document, write_text, MAX_DOCUMENT_SIZE_BYTES};

    fn sample_doc(title: &str, child_id: &str) -> OutlineDocument {
        OutlineDocument {
            id: format!("doc_{child_id}"),
            title: title.to_string(),
            version: 1,
            created_at: 1,
            updated_at: 1,
            mind_map_layout: None,
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

    fn sample_doc_with_properties(title: &str, child_id: &str) -> OutlineDocument {
        let mut doc = sample_doc(title, child_id);
        doc.root.children[0].note = Some("节点备注".to_string());
        doc.root.children[0].checked = Some(false);
        doc.root.children[0].tags = Some(vec!["工作".to_string(), "重要".to_string()]);
        doc
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

        save_document(&path, &sample_doc_with_properties("Recoverable", "child_a")).unwrap();
        save_document(&path, &sample_doc("Current", "child_b")).unwrap();
        fs::write(&path, "{ broken json").unwrap();

        let loaded = load_document(&path).unwrap();
        assert_eq!(loaded.title, "Recoverable");
        assert_eq!(loaded.root.children[0].note.as_deref(), Some("节点备注"));
        assert_eq!(loaded.root.children[0].checked, Some(false));
        assert_eq!(
            loaded.root.children[0].tags.as_deref(),
            Some(&["工作".to_string(), "重要".to_string()][..])
        );
    }

    #[test]
    fn preserves_node_properties_when_saving_and_loading_json() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("doc.siwei.json");

        save_document(&path, &sample_doc_with_properties("Properties", "child_a")).unwrap();

        let loaded = load_document(&path).unwrap();
        assert_eq!(loaded.root.children[0].note.as_deref(), Some("节点备注"));
        assert_eq!(loaded.root.children[0].checked, Some(false));
        assert_eq!(
            loaded.root.children[0].tags.as_deref(),
            Some(&["工作".to_string(), "重要".to_string()][..])
        );
    }

    #[test]
    fn broken_mind_map_layout_does_not_block_document_content_loading() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("doc.siwei.json");
        fs::write(
            &path,
            r#"{
              "id": "doc_1",
              "title": "Readable",
              "version": 2,
              "createdAt": 1,
              "updatedAt": 1,
              "mindMapLayout": {
                "engineVersion": 1,
                "strategy": "balanced-mindmap",
                "nodes": {
                  "child_a": {
                    "position": { "x": "bad", "y": 80 },
                    "source": "manual",
                    "locked": true
                  }
                }
              },
              "root": {
                "id": "root_1",
                "text": "Readable",
                "createdAt": 1,
                "updatedAt": 1,
                "children": [
                  {
                    "id": "child_a",
                    "text": "child",
                    "createdAt": 1,
                    "updatedAt": 1,
                    "children": []
                  }
                ]
              }
            }"#,
        )
        .unwrap();

        let loaded = load_document(&path).unwrap();

        assert_eq!(loaded.title, "Readable");
        assert!(loaded.mind_map_layout.is_none());
        assert_eq!(loaded.root.children[0].text, "child");
    }

    #[test]
    fn unknown_mind_map_layout_strategy_survives_load_and_save_round_trip() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("doc.siwei.json");
        fs::write(
            &path,
            r#"{
              "id": "doc_1",
              "title": "Readable",
              "version": 2,
              "createdAt": 1,
              "updatedAt": 1,
              "mindMapLayout": {
                "engineVersion": 2,
                "strategy": "future-layout",
                "nodes": {
                  "child_a": {
                    "position": { "x": 120, "y": 80 },
                    "source": "manual",
                    "locked": true
                  }
                }
              },
              "root": {
                "id": "root_1",
                "text": "Readable",
                "createdAt": 1,
                "updatedAt": 1,
                "children": [
                  {
                    "id": "child_a",
                    "text": "child",
                    "createdAt": 1,
                    "updatedAt": 1,
                    "children": []
                  }
                ]
              }
            }"#,
        )
        .unwrap();

        let loaded = load_document(&path).unwrap();
        let Some(MindMapLayoutState::V1 {
            engine_version,
            strategy,
            ..
        }) = loaded.mind_map_layout.as_ref()
        else {
            panic!("unknown strategy layout should survive loading");
        };

        assert_eq!(*engine_version, 2);
        assert_eq!(strategy.as_str(), "future-layout");

        save_document(&path, &loaded).unwrap();
        let saved = fs::read_to_string(&path).unwrap();
        assert!(saved.contains(r#""strategy": "future-layout""#));
    }

    #[test]
    fn save_document_removes_orphan_layout_records() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("doc.siwei.json");
        let mut doc = sample_doc("Orphans", "child_a");
        doc.mind_map_layout = Some(serde_json::from_value(serde_json::json!({
            "engineVersion": 3,
            "strategy": "free-canvas",
            "nodes": {
                "root_child_a": {
                    "position": { "x": 0, "y": 0 },
                    "source": "manual",
                    "locked": true
                },
                "child_a": {
                    "position": { "x": 120, "y": 80 },
                    "source": "incremental",
                    "locked": false
                },
                "orphan": {
                    "position": { "x": 999, "y": 999 },
                    "source": "manual",
                    "locked": true
                }
            }
        }))
        .unwrap());

        save_document(&path, &doc).unwrap();
        let saved = fs::read_to_string(&path).unwrap();

        assert!(saved.contains(r#""child_a""#));
        assert!(!saved.contains(r#""orphan""#));
    }

    #[test]
    fn invalid_but_deserializable_mind_map_layout_does_not_block_document_content_loading() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("doc.siwei.json");
        fs::write(
            &path,
            r#"{
              "id": "doc_1",
              "title": "Readable",
              "version": 2,
              "createdAt": 1,
              "updatedAt": 1,
              "mindMapLayout": {
                "engineVersion": 0,
                "strategy": "balanced-mindmap",
                "nodes": {
                  "child_a": {
                    "position": { "x": 120, "y": 80 },
                    "source": "manual",
                    "locked": true
                  }
                }
              },
              "root": {
                "id": "root_1",
                "text": "Readable",
                "createdAt": 1,
                "updatedAt": 1,
                "children": [
                  {
                    "id": "child_a",
                    "text": "child",
                    "createdAt": 1,
                    "updatedAt": 1,
                    "children": []
                  }
                ]
              }
            }"#,
        )
        .unwrap();

        let loaded = load_document(&path).unwrap();

        assert_eq!(loaded.title, "Readable");
        assert!(loaded.mind_map_layout.is_none());
        assert_eq!(loaded.root.children[0].text, "child");
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
