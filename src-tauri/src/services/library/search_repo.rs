use std::collections::BTreeMap;

use rusqlite::{params, Connection};

use crate::{
    models::{
        LibraryDocumentStatus, LibraryHighlightRange, LibraryLocation, LibraryLocationSource,
        LibraryMatchedField, LibraryPage, LibrarySearchQuery, LibrarySearchResult,
    },
    utils::error::AppResult,
};

use super::{
    codec::{db_error, decode_path, source_from_db, status_from_db},
    models::SearchRow,
    ordering::page_items,
};

pub(crate) fn search_library_items(
    conn: &Connection,
    query: &str,
) -> AppResult<Vec<LibrarySearchResult>> {
    let normalized_query = query.trim();
    if normalized_query.is_empty() {
        return Ok(Vec::new());
    }

    let mut results = BTreeMap::<String, LibrarySearchResult>::new();
    search_library_fts(conn, normalized_query, None, None, &mut results)?;
    search_library_like(conn, normalized_query, None, None, &mut results)?;
    Ok(results.into_values().collect())
}

pub(crate) fn query_library_search_page(
    conn: &Connection,
    query: LibrarySearchQuery,
) -> AppResult<LibraryPage<LibrarySearchResult>> {
    let normalized_query = query.query.trim();
    if normalized_query.is_empty() {
        return Ok(LibraryPage {
            items: Vec::new(),
            has_more: false,
            total: Some(0),
        });
    }

    let status_filter = parse_search_status_filter(query.document_status.as_deref());
    let field_filter = parse_field_filter(query.matched_field.as_deref());
    let mut results = BTreeMap::<String, LibrarySearchResult>::new();
    search_library_fts(
        conn,
        normalized_query,
        status_filter.as_deref(),
        field_filter.as_ref(),
        &mut results,
    )?;
    search_library_like(
        conn,
        normalized_query,
        status_filter.as_deref(),
        field_filter.as_ref(),
        &mut results,
    )?;
    let mut items: Vec<_> = results.into_values().collect();
    items.sort_by(|left, right| {
        right
            .score
            .cmp(&left.score)
            .then_with(|| right.document_path.cmp(&left.document_path))
            .then_with(|| left.node_id.cmp(&right.node_id))
    });
    page_items(items, query.limit, query.offset)
}

fn search_library_fts(
    conn: &Connection,
    query: &str,
    status_filter: Option<&[LibraryDocumentStatus]>,
    field_filter: Option<&LibraryMatchedField>,
    results: &mut BTreeMap<String, LibrarySearchResult>,
) -> AppResult<()> {
    let escaped = query.replace('"', "\"\"");
    let fts_query = format!("\"{escaped}\"");
    let mut stmt = conn
        .prepare(
            "SELECT d.document_id, d.title, d.path, f.node_id, f.source,
                    COALESCE(n.text, d.title), COALESCE(n.parent_path, '[]'), d.status
             FROM library_search_fts f
             JOIN library_documents d ON d.document_id = f.document_id
             LEFT JOIN library_nodes n ON n.document_id = f.document_id AND n.node_id = f.node_id
             WHERE library_search_fts MATCH ?1",
        )
        .map_err(db_error)?;
    let rows = stmt
        .query_map(params![fts_query], read_search_row)
        .map_err(db_error)?;
    for row in rows {
        let row = row.map_err(db_error)?;
        if search_row_matches_filters(&row, status_filter, field_filter) {
            merge_search_row(results, row, query);
        }
    }
    Ok(())
}

fn search_library_like(
    conn: &Connection,
    query: &str,
    status_filter: Option<&[LibraryDocumentStatus]>,
    field_filter: Option<&LibraryMatchedField>,
    results: &mut BTreeMap<String, LibrarySearchResult>,
) -> AppResult<()> {
    let like_query = format!("%{}%", query.to_lowercase());
    let mut stmt = conn
        .prepare(
            "SELECT d.document_id, d.title, d.path, NULL AS node_id, 'title' AS source,
                    d.title AS text, '[]' AS parent_path, d.status
             FROM library_documents d
             WHERE lower(d.title) LIKE ?1
             UNION ALL
             SELECT d.document_id, d.title, d.path, n.node_id, 'text' AS source,
                    n.text, n.parent_path, d.status
             FROM library_nodes n
             JOIN library_documents d ON d.document_id = n.document_id
             WHERE lower(n.text) LIKE ?1
             UNION ALL
             SELECT d.document_id, d.title, d.path, n.node_id, 'note' AS source,
                    COALESCE(n.note, n.text), n.parent_path, d.status
             FROM library_nodes n
             JOIN library_documents d ON d.document_id = n.document_id
             WHERE n.note IS NOT NULL AND lower(n.note) LIKE ?1
             UNION ALL
             SELECT d.document_id, d.title, d.path, n.node_id, 'tag' AS source,
                    t.tag, n.parent_path, d.status
             FROM library_node_tags t
             JOIN library_nodes n ON n.document_id = t.document_id AND n.node_id = t.node_id
             JOIN library_documents d ON d.document_id = t.document_id
             WHERE lower(t.tag) LIKE ?1",
        )
        .map_err(db_error)?;
    let rows = stmt
        .query_map(params![like_query], read_search_row)
        .map_err(db_error)?;
    for row in rows {
        let row = row.map_err(db_error)?;
        if search_row_matches_filters(&row, status_filter, field_filter) {
            merge_search_row(results, row, query);
        }
    }
    Ok(())
}

fn read_search_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<SearchRow> {
    Ok(SearchRow {
        document_id: row.get(0)?,
        document_title: row.get(1)?,
        document_path: row.get(2)?,
        node_id: row.get(3)?,
        source: source_from_db(row.get::<_, String>(4)?.as_str()),
        text: row.get(5)?,
        path: decode_path(&row.get::<_, String>(6)?),
        status: if row.as_ref().column_count() > 7 {
            status_from_db(row.get::<_, String>(7)?.as_str())
        } else {
            LibraryDocumentStatus::Ready
        },
    })
}

fn merge_search_row(
    results: &mut BTreeMap<String, LibrarySearchResult>,
    row: SearchRow,
    query: &str,
) {
    let key = format!(
        "{}:{}",
        row.document_id,
        row.node_id
            .clone()
            .unwrap_or_else(|| "__title__".to_string())
    );
    let ranges = highlight_ranges(&row.text, query);
    let score = field_weight(&row.source) + ranges.len() as i32 * 10;
    results
        .entry(key)
        .and_modify(|result| {
            if !result.match_sources.contains(&row.source) {
                result.match_sources.push(row.source.clone());
            }
            if let Some(fields) = &mut result.matched_fields {
                if !fields.contains(&row.source) {
                    fields.push(row.source.clone());
                }
            }
            result.score = Some(result.score.unwrap_or_default().max(score));
        })
        .or_insert_with(|| LibrarySearchResult {
            document_id: row.document_id.clone(),
            document_title: row.document_title,
            document_path: row.document_path.clone(),
            document_status: Some(row.status),
            node_id: row.node_id.clone(),
            text: row.text.clone(),
            path: row.path.clone(),
            snippet: Some(row.text),
            highlight_ranges: Some(ranges),
            matched_fields: Some(vec![row.source.clone()]),
            match_sources: vec![row.source],
            score: Some(score),
            location: Some(LibraryLocation {
                document_id: row.document_id,
                document_path: row.document_path,
                node_id: row.node_id,
                path: row.path,
                source: LibraryLocationSource::Search,
            }),
        });
}

fn search_row_matches_filters(
    row: &SearchRow,
    status_filter: Option<&[LibraryDocumentStatus]>,
    field_filter: Option<&LibraryMatchedField>,
) -> bool {
    let status_matches = status_filter
        .map(|statuses| statuses.contains(&row.status))
        .unwrap_or_else(|| {
            matches!(
                row.status,
                LibraryDocumentStatus::Ready | LibraryDocumentStatus::Stale
            )
        });
    let field_matches = field_filter
        .map(|field| field == &row.source)
        .unwrap_or(true);
    status_matches && field_matches
}

fn parse_status_filter(status: &str) -> Option<LibraryDocumentStatus> {
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

fn parse_search_status_filter(status: Option<&str>) -> Option<Vec<LibraryDocumentStatus>> {
    match status {
        Some("all") => Some(vec![
            LibraryDocumentStatus::Ready,
            LibraryDocumentStatus::Stale,
            LibraryDocumentStatus::Missing,
            LibraryDocumentStatus::Invalid,
            LibraryDocumentStatus::Error,
        ]),
        Some(value) => parse_status_filter(value).map(|status| vec![status]),
        None => None,
    }
}

fn parse_field_filter(field: Option<&str>) -> Option<LibraryMatchedField> {
    match field {
        Some("title") => Some(LibraryMatchedField::Title),
        Some("content") => Some(LibraryMatchedField::Content),
        Some("note") => Some(LibraryMatchedField::Note),
        Some("tag") => Some(LibraryMatchedField::Tag),
        _ => None,
    }
}

fn field_weight(field: &LibraryMatchedField) -> i32 {
    match field {
        LibraryMatchedField::Title => 400,
        LibraryMatchedField::Content => 300,
        LibraryMatchedField::Note => 200,
        LibraryMatchedField::Tag => 100,
    }
}

fn highlight_ranges(value: &str, query: &str) -> Vec<LibraryHighlightRange> {
    let lower_value = value.to_lowercase();
    let lower_query = query.to_lowercase();
    if lower_query.is_empty() {
        return Vec::new();
    }

    let mut ranges = Vec::new();
    let mut byte_offset = 0;
    while let Some(relative_start) = lower_value[byte_offset..].find(&lower_query) {
        let start_byte = byte_offset + relative_start;
        let end_byte = start_byte + lower_query.len();
        ranges.push(LibraryHighlightRange {
            start: utf16_offset(value, start_byte),
            end: utf16_offset(value, end_byte),
        });
        byte_offset = end_byte;
    }
    ranges
}

fn utf16_offset(value: &str, byte_offset: usize) -> u32 {
    value[..byte_offset.min(value.len())].encode_utf16().count() as u32
}
