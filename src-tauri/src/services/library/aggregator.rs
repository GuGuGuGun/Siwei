use rusqlite::{params, Connection};

use crate::{
    models::{
        LibraryLocation, LibraryLocationSource, LibraryNodeIndexItem, LibraryTagSummary,
        LibraryTaskSummary,
    },
    utils::error::AppResult,
};

use super::codec::{db_error, decode_path, i64_to_bool, status_from_db};

pub(crate) fn list_tags(conn: &Connection) -> AppResult<Vec<LibraryTagSummary>> {
    let mut stmt = conn
        .prepare(
            "SELECT tag, COUNT(DISTINCT document_id), COUNT(*)
             FROM library_node_tags
             GROUP BY tag
             ORDER BY lower(tag)",
        )
        .map_err(db_error)?;
    let rows = stmt
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, u32>(1)?,
                row.get::<_, u32>(2)?,
            ))
        })
        .map_err(db_error)?;

    let mut summaries = Vec::new();
    for row in rows {
        let (tag, document_count, node_count) = row.map_err(db_error)?;
        summaries.push(LibraryTagSummary {
            items: nodes_for_tag(conn, &tag)?,
            tag,
            document_count,
            node_count,
            location: None,
        });
    }
    Ok(summaries)
}

pub(crate) fn query_tasks(
    conn: &Connection,
    target: Option<(&str, &str)>,
    checked_filter: Option<bool>,
) -> AppResult<Vec<LibraryTaskSummary>> {
    let (mut where_clause, params_vec): (String, Vec<String>) = match target {
        Some((document_path, node_id)) => (
            "WHERE d.path = ?1 AND n.node_id = ?2 AND n.checked IS NOT NULL".to_string(),
            vec![document_path.to_string(), node_id.to_string()],
        ),
        None => ("WHERE n.checked IS NOT NULL".to_string(), Vec::new()),
    };
    if let Some(checked) = checked_filter {
        where_clause.push_str(if checked {
            " AND n.checked = 1"
        } else {
            " AND n.checked = 0"
        });
    }
    let sql = format!(
        "SELECT d.document_id, d.title, d.path, n.node_id, n.text, n.checked, n.parent_path, d.status
         FROM library_nodes n
         JOIN library_documents d ON d.document_id = n.document_id
         {where_clause}
         ORDER BY n.checked ASC, d.updated_at DESC, lower(d.title), lower(n.text)"
    );
    let mut stmt = conn.prepare(&sql).map_err(db_error)?;

    let rows = if params_vec.is_empty() {
        stmt.query_map([], read_task_row).map_err(db_error)?
    } else {
        stmt.query_map(params![params_vec[0], params_vec[1]], read_task_row)
            .map_err(db_error)?
    };

    let mut tasks = Vec::new();
    for row in rows {
        let mut task = row.map_err(db_error)?;
        task.tags = node_tags(conn, &task.document_id, &task.node_id)?;
        tasks.push(task);
    }
    Ok(tasks)
}

fn nodes_for_tag(conn: &Connection, tag: &str) -> AppResult<Vec<LibraryNodeIndexItem>> {
    let mut stmt = conn
        .prepare(
            "SELECT n.document_id, n.node_id, n.text, n.note, n.checked, n.parent_path
             FROM library_node_tags t
             JOIN library_nodes n ON n.document_id = t.document_id AND n.node_id = t.node_id
             WHERE t.tag = ?1
             ORDER BY lower(n.text)",
        )
        .map_err(db_error)?;
    let rows = stmt
        .query_map(params![tag], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, Option<String>>(3)?,
                row.get::<_, Option<i64>>(4)?,
                row.get::<_, String>(5)?,
            ))
        })
        .map_err(db_error)?;

    let mut items = Vec::new();
    for row in rows {
        let (document_id, node_id, text, note, checked, parent_path) = row.map_err(db_error)?;
        items.push(LibraryNodeIndexItem {
            tags: node_tags(conn, &document_id, &node_id)?,
            document_id,
            node_id,
            text,
            note,
            checked: checked.map(i64_to_bool),
            path: decode_path(&parent_path),
        });
    }
    Ok(items)
}

fn read_task_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<LibraryTaskSummary> {
    let document_id: String = row.get(0)?;
    let document_path: String = row.get(2)?;
    let node_id: String = row.get(3)?;
    let path = decode_path(&row.get::<_, String>(6)?);
    Ok(LibraryTaskSummary {
        document_id: document_id.clone(),
        document_title: row.get(1)?,
        document_path: document_path.clone(),
        node_id: node_id.clone(),
        text: row.get(4)?,
        checked: i64_to_bool(row.get::<_, i64>(5)?),
        path: path.clone(),
        tags: Vec::new(),
        document_status: Some(status_from_db(row.get::<_, String>(7)?.as_str())),
        location: Some(LibraryLocation {
            document_id,
            document_path,
            node_id: Some(node_id),
            path,
            source: LibraryLocationSource::Task,
        }),
    })
}

fn node_tags(conn: &Connection, document_id: &str, node_id: &str) -> AppResult<Vec<String>> {
    let mut stmt = conn
        .prepare(
            "SELECT tag FROM library_node_tags
             WHERE document_id = ?1 AND node_id = ?2
             ORDER BY lower(tag)",
        )
        .map_err(db_error)?;
    let rows = stmt
        .query_map(params![document_id, node_id], |row| row.get::<_, String>(0))
        .map_err(db_error)?;
    rows.collect::<Result<Vec<_>, _>>().map_err(db_error)
}
