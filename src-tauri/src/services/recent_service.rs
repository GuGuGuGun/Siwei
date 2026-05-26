use std::{
    collections::HashMap,
    fs,
    path::{Path, PathBuf},
};

use crate::{
    models::RecentDocItem,
    utils::error::{AppError, AppResult},
};

const RECENT_DOCS_FILE: &str = "recent_docs.json";
const MAX_RECENT_DOCS: usize = 20;

pub fn get_recent_docs(app_data_dir: impl AsRef<Path>) -> AppResult<Vec<RecentDocItem>> {
    let path = recent_docs_path(app_data_dir.as_ref());
    if !path.exists() {
        return Ok(Vec::new());
    }

    let content = fs::read_to_string(&path).map_err(|source| AppError::Io {
        operation: "读取最近文档",
        source,
    })?;

    let mut items: Vec<RecentDocItem> = match serde_json::from_str(&content) {
        Ok(items) => items,
        Err(_) => return Ok(Vec::new()),
    };
    normalize_recent_docs(&mut items);
    Ok(items)
}

pub fn add_recent_doc(app_data_dir: impl AsRef<Path>, item: RecentDocItem) -> AppResult<()> {
    let mut items = get_recent_docs(app_data_dir.as_ref())?;
    items.push(item);
    normalize_recent_docs(&mut items);
    write_recent_docs(app_data_dir.as_ref(), &items)
}

pub fn remove_recent_doc(app_data_dir: impl AsRef<Path>, path: &str) -> AppResult<()> {
    let mut items = get_recent_docs(app_data_dir.as_ref())?;
    items.retain(|item| item.path != path);
    write_recent_docs(app_data_dir.as_ref(), &items)
}

fn normalize_recent_docs(items: &mut Vec<RecentDocItem>) {
    let mut by_path: HashMap<String, RecentDocItem> = HashMap::new();
    for item in items.drain(..) {
        by_path
            .entry(item.path.clone())
            .and_modify(|existing| {
                if item.last_opened_at >= existing.last_opened_at {
                    *existing = item.clone();
                }
            })
            .or_insert(item);
    }

    let mut normalized: Vec<RecentDocItem> = by_path.into_values().collect();
    normalized.sort_by(|a, b| b.last_opened_at.cmp(&a.last_opened_at));
    normalized.truncate(MAX_RECENT_DOCS);
    *items = normalized;
}

fn write_recent_docs(app_data_dir: &Path, items: &[RecentDocItem]) -> AppResult<()> {
    fs::create_dir_all(app_data_dir).map_err(|source| AppError::Io {
        operation: "创建应用数据目录",
        source,
    })?;
    let path = recent_docs_path(app_data_dir);
    let content = serde_json::to_string_pretty(items)
        .map_err(|error| AppError::JsonParse(error.to_string()))?;
    fs::write(path, content).map_err(|source| AppError::Io {
        operation: "写入最近文档",
        source,
    })
}

fn recent_docs_path(app_data_dir: &Path) -> PathBuf {
    app_data_dir.join(RECENT_DOCS_FILE)
}

#[cfg(test)]
mod tests {
    use tempfile::tempdir;

    use crate::models::RecentDocItem;

    use super::{add_recent_doc, get_recent_docs, remove_recent_doc};

    fn item(path: &str, opened_at: u64) -> RecentDocItem {
        RecentDocItem {
            path: path.to_string(),
            title: path.to_string(),
            last_opened_at: opened_at,
        }
    }

    #[test]
    fn deduplicates_sorts_and_limits_recent_docs() {
        let dir = tempdir().unwrap();

        for index in 0..25 {
            add_recent_doc(dir.path(), item(&format!("doc_{index}"), index)).unwrap();
        }
        add_recent_doc(dir.path(), item("doc_0", 100)).unwrap();

        let items = get_recent_docs(dir.path()).unwrap();
        assert_eq!(items.len(), 20);
        assert_eq!(items[0].path, "doc_0");
        assert_eq!(items[0].last_opened_at, 100);
        assert!(items[1].last_opened_at > items[19].last_opened_at);
    }

    #[test]
    fn removes_recent_doc_by_path() {
        let dir = tempdir().unwrap();
        add_recent_doc(dir.path(), item("keep", 1)).unwrap();
        add_recent_doc(dir.path(), item("remove", 2)).unwrap();

        remove_recent_doc(dir.path(), "remove").unwrap();

        let items = get_recent_docs(dir.path()).unwrap();
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].path, "keep");
    }

    #[test]
    fn corrupted_recent_docs_file_falls_back_to_empty_list() {
        let dir = tempdir().unwrap();
        std::fs::write(dir.path().join("recent_docs.json"), "{ broken json").unwrap();

        let items = get_recent_docs(dir.path()).unwrap();

        assert!(items.is_empty());
    }
}
