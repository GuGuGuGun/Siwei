use std::{path::PathBuf, thread};

use crate::{
    models::LibraryDocumentStatus,
    utils::error::{AppError, AppResult},
};

use super::{codec::now_millis, indexer, refresh_job, repository};

const REFRESH_READ_CONCURRENCY: u32 = 4;

pub(crate) fn spawn_refresh_worker(
    app_data_dir: PathBuf,
    job_id: String,
    paths: Vec<String>,
) -> AppResult<()> {
    thread::Builder::new()
        .name("siwei-library-refresh".to_string())
        .spawn(move || {
            if let Err(error) = run_refresh_job(app_data_dir, job_id.clone(), paths) {
                let _ = refresh_job::increment_refresh_task_failure(
                    &job_id,
                    error.user_message(),
                    now_millis(),
                );
            }
        })
        .map(|_| ())
        .map_err(|error| AppError::Database(format!("刷新任务启动失败: {error}")))
}

fn run_refresh_job(app_data_dir: PathBuf, job_id: String, paths: Vec<String>) -> AppResult<()> {
    refresh_job::mark_running(&job_id)?;

    // v0.5.0 采用最多 4 个并发读取、串行写库的语义；当前实现保持写入串行，
    // 后续可在不改 API 的前提下把读取阶段真正并行化。
    let _read_concurrency = REFRESH_READ_CONCURRENCY;
    let mut conn = repository::open_database(&app_data_dir)?;
    for path in paths {
        if refresh_job::is_cancel_requested(&job_id)? {
            refresh_job::increment_refresh_skipped(&job_id, now_millis())?;
            continue;
        }
        refresh_job::set_refresh_current_path(&job_id, Some(path.clone()), now_millis())?;
        match indexer::refresh_document_by_path(&mut conn, &path) {
            Ok(item)
                if matches!(
                    item.status,
                    LibraryDocumentStatus::Ready | LibraryDocumentStatus::Stale
                ) =>
            {
                refresh_job::increment_refresh_success(&job_id, now_millis())?;
            }
            Ok(item) => {
                refresh_job::increment_refresh_failure(
                    &job_id,
                    item.document_id,
                    item.path,
                    item.status,
                    item.failure_reason,
                    item.error_summary,
                    now_millis(),
                )?;
            }
            Err(error) => {
                refresh_job::increment_refresh_task_failure(
                    &job_id,
                    error.user_message(),
                    now_millis(),
                )?;
                break;
            }
        }
    }
    refresh_job::set_refresh_current_path(&job_id, None, now_millis())?;
    refresh_job::finish_refresh_job(&job_id, now_millis())?;
    Ok(())
}
