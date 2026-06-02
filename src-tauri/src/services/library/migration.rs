use rusqlite::{Connection, Transaction};

use crate::utils::error::AppResult;

use super::codec::db_error;

const SCHEMA_VERSION: u32 = 1;

pub(crate) fn migrate_database(conn: &mut Connection) -> AppResult<()> {
    conn.pragma_update(None, "foreign_keys", "ON")
        .map_err(db_error)?;
    let tx = conn.transaction().map_err(db_error)?;
    tx.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS library_documents (
          document_id TEXT PRIMARY KEY,
          path TEXT NOT NULL UNIQUE,
          title TEXT NOT NULL,
          updated_at INTEGER NOT NULL,
          indexed_at INTEGER NOT NULL,
          file_mtime INTEGER,
          node_count INTEGER NOT NULL DEFAULT 0,
          task_count INTEGER NOT NULL DEFAULT 0,
          unchecked_task_count INTEGER NOT NULL DEFAULT 0,
          status TEXT NOT NULL,
          error_summary TEXT,
          last_refresh_at INTEGER,
          last_refresh_duration_ms INTEGER,
          last_refresh_status TEXT,
          failure_reason TEXT
        );

        CREATE TABLE IF NOT EXISTS library_nodes (
          document_id TEXT NOT NULL,
          node_id TEXT NOT NULL,
          parent_path TEXT NOT NULL,
          text TEXT NOT NULL,
          note TEXT,
          checked INTEGER,
          PRIMARY KEY (document_id, node_id),
          FOREIGN KEY (document_id) REFERENCES library_documents(document_id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS library_node_tags (
          document_id TEXT NOT NULL,
          node_id TEXT NOT NULL,
          tag TEXT NOT NULL,
          PRIMARY KEY (document_id, node_id, tag),
          FOREIGN KEY (document_id, node_id) REFERENCES library_nodes(document_id, node_id) ON DELETE CASCADE
        );

        CREATE VIRTUAL TABLE IF NOT EXISTS library_search_fts USING fts5(
          document_id UNINDEXED,
          node_id UNINDEXED,
          source UNINDEXED,
          text
        );
        ",
    )
    .map_err(db_error)?;
    ensure_library_document_diagnostic_columns(&tx)?;
    tx.pragma_update(None, "user_version", SCHEMA_VERSION)
        .map_err(db_error)?;
    tx.commit().map_err(db_error)?;
    Ok(())
}

fn ensure_library_document_diagnostic_columns(tx: &Transaction<'_>) -> AppResult<()> {
    for (name, definition) in [
        ("last_refresh_at", "INTEGER"),
        ("last_refresh_duration_ms", "INTEGER"),
        ("last_refresh_status", "TEXT"),
        ("failure_reason", "TEXT"),
    ] {
        if !table_has_column(tx, "library_documents", name)? {
            tx.execute(
                &format!("ALTER TABLE library_documents ADD COLUMN {name} {definition}"),
                [],
            )
            .map_err(db_error)?;
        }
    }
    Ok(())
}

fn table_has_column(conn: &Connection, table: &str, column: &str) -> AppResult<bool> {
    let mut stmt = conn
        .prepare(&format!("PRAGMA table_info({table})"))
        .map_err(db_error)?;
    let rows = stmt
        .query_map([], |row| row.get::<_, String>(1))
        .map_err(db_error)?;
    for row in rows {
        if row.map_err(db_error)? == column {
            return Ok(true);
        }
    }
    Ok(false)
}
