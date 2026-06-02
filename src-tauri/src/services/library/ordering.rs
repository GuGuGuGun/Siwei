use crate::models::{
    LibraryDocumentItem, LibraryPage, LibrarySortBy,
};
use crate::utils::error::AppResult;

use super::codec::status_to_db;

pub(crate) fn page_items<T>(
    items: Vec<T>,
    limit: Option<u32>,
    offset: Option<u32>,
) -> AppResult<LibraryPage<T>> {
    let total = items.len();
    let offset = offset.unwrap_or(0) as usize;
    let limit = limit.unwrap_or(50).clamp(1, 200) as usize;
    let has_more = offset.saturating_add(limit) < total;
    let page = items.into_iter().skip(offset).take(limit).collect();
    Ok(LibraryPage {
        items: page,
        has_more,
        total: Some(total as u32),
    })
}

pub(crate) fn compare_documents(
    left: &LibraryDocumentItem,
    right: &LibraryDocumentItem,
    sort_by: &LibrarySortBy,
) -> std::cmp::Ordering {
    match sort_by {
        LibrarySortBy::UpdatedAt => left.updated_at.cmp(&right.updated_at),
        LibrarySortBy::Title => left.title.to_lowercase().cmp(&right.title.to_lowercase()),
        LibrarySortBy::TaskCount => left.task_count.cmp(&right.task_count),
        LibrarySortBy::TagCount => left.tags.len().cmp(&right.tags.len()),
        LibrarySortBy::Status => status_to_db(&left.status).cmp(status_to_db(&right.status)),
    }
    .then_with(|| left.title.to_lowercase().cmp(&right.title.to_lowercase()))
    .then_with(|| left.path.cmp(&right.path))
}
