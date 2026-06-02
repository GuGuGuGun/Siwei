use rusqlite::Connection;

use crate::{
    models::{
        LibraryDocumentItem, LibraryDocumentQuery, LibraryDocumentStatus, LibraryPage,
        LibrarySortBy, LibrarySortDirection, LibraryTagQuery, LibraryTagSummary, LibraryTaskQuery,
        LibraryTaskSummary,
    },
    utils::error::AppResult,
};

use super::{
    aggregator,
    ordering::{compare_documents, page_items},
    repository,
};

pub(crate) fn query_library_docs(
    conn: &Connection,
    query: LibraryDocumentQuery,
) -> AppResult<LibraryPage<LibraryDocumentItem>> {
    let mut items = repository::list_documents(conn)?;

    if let Some(status) = query.status.as_deref().and_then(parse_document_status_filter) {
        items.retain(|item| item.status == status);
    } else if matches!(query.status.as_deref(), Some("failed")) {
        items.retain(|item| {
            matches!(
                item.status,
                LibraryDocumentStatus::Missing
                    | LibraryDocumentStatus::Invalid
                    | LibraryDocumentStatus::Error
            ) || item.failure_reason.is_some()
        });
    }
    if let Some(keyword) = query
        .keyword
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        let keyword = keyword.to_lowercase();
        items.retain(|item| {
            item.title.to_lowercase().contains(&keyword)
                || item.path.to_lowercase().contains(&keyword)
        });
    }

    let sort_by = query.sort_by.unwrap_or(LibrarySortBy::UpdatedAt);
    let sort_direction = query.sort_direction.unwrap_or(LibrarySortDirection::Desc);
    items.sort_by(|left, right| compare_documents(left, right, &sort_by));
    if matches!(sort_direction, LibrarySortDirection::Desc) {
        items.reverse();
    }
    page_items(items, query.limit, query.offset)
}

pub(crate) fn query_library_tags(
    conn: &Connection,
    query: LibraryTagQuery,
) -> AppResult<LibraryPage<LibraryTagSummary>> {
    let mut tags = aggregator::list_tags(conn)?;
    match query.sort_by.as_deref() {
        Some("nodeCount") => tags.sort_by(|left, right| {
            left.node_count
                .cmp(&right.node_count)
                .then_with(|| left.tag.to_lowercase().cmp(&right.tag.to_lowercase()))
        }),
        _ => tags.sort_by(|left, right| left.tag.to_lowercase().cmp(&right.tag.to_lowercase())),
    }
    if matches!(query.sort_direction, Some(LibrarySortDirection::Desc)) {
        tags.reverse();
    }
    page_items(tags, query.limit, query.offset)
}

pub(crate) fn query_library_tasks(
    conn: &Connection,
    query: LibraryTaskQuery,
) -> AppResult<LibraryPage<LibraryTaskSummary>> {
    let checked = match query.checked.as_deref() {
        Some("checked") => Some(true),
        Some("unchecked") => Some(false),
        _ => None,
    };
    page_items(
        aggregator::query_tasks(conn, None, checked)?,
        query.limit,
        query.offset,
    )
}

fn parse_document_status_filter(status: &str) -> Option<LibraryDocumentStatus> {
    match status {
        "ready" => Some(LibraryDocumentStatus::Ready),
        "stale" => Some(LibraryDocumentStatus::Stale),
        "missing" => Some(LibraryDocumentStatus::Missing),
        "invalid" => Some(LibraryDocumentStatus::Invalid),
        "indexing" => Some(LibraryDocumentStatus::Indexing),
        "error" => Some(LibraryDocumentStatus::Error),
        _ => None,
    }
}
