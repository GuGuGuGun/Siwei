use std::sync::{Mutex, OnceLock};

use crate::{
    models::{
        LibraryDocumentStatus, LibraryRefreshErrorItem, LibraryRefreshFailureReason,
        LibraryRefreshJobStatus, LibraryRefreshStatus,
    },
    utils::error::{AppError, AppResult},
};

static REFRESH_JOB: OnceLock<Mutex<Option<LibraryRefreshStatus>>> = OnceLock::new();

pub fn create_refresh_job(job_id: String, total: u32, started_at: u64) -> AppResult<()> {
    *lock_refresh_job("刷新任务状态不可写")? = Some(LibraryRefreshStatus {
        job_id,
        status: LibraryRefreshJobStatus::Queued,
        total,
        processed: 0,
        succeeded: 0,
        failed: 0,
        skipped: 0,
        current_path: None,
        updated_at: Some(started_at),
        cancelled: false,
        errors: Vec::new(),
        started_at,
        finished_at: None,
    });
    Ok(())
}

pub fn active_job_id() -> AppResult<Option<String>> {
    Ok(lock_refresh_job("刷新任务状态不可读")?
        .as_ref()
        .filter(|job| {
            matches!(
                job.status,
                LibraryRefreshJobStatus::Queued
                    | LibraryRefreshJobStatus::Running
                    | LibraryRefreshJobStatus::CancelRequested
            )
        })
        .map(|job| job.job_id.clone()))
}

pub fn get_refresh_status(job_id: &str) -> AppResult<LibraryRefreshStatus> {
    lock_refresh_job("刷新任务状态不可读")?
        .clone()
        .filter(|job| job.job_id == job_id)
        .ok_or_else(|| AppError::Validation(format!("刷新任务不存在: {job_id}")))
}

pub fn cancel_refresh(job_id: &str, now: u64) -> AppResult<LibraryRefreshStatus> {
    let mut guard = lock_refresh_job("刷新任务状态不可写")?;
    let job = guard
        .as_mut()
        .filter(|job| job.job_id == job_id)
        .ok_or_else(|| AppError::Validation(format!("刷新任务不存在: {job_id}")))?;
    if matches!(
        job.status,
        LibraryRefreshJobStatus::Queued | LibraryRefreshJobStatus::Running
    ) {
        job.status = LibraryRefreshJobStatus::CancelRequested;
        job.cancelled = true;
        job.updated_at = Some(now);
    }
    Ok(job.clone())
}

pub fn is_cancel_requested(job_id: &str) -> AppResult<bool> {
    Ok(lock_refresh_job("刷新任务状态不可读")?
        .as_ref()
        .filter(|job| job.job_id == job_id)
        .map(|job| matches!(job.status, LibraryRefreshJobStatus::CancelRequested))
        .unwrap_or(false))
}

pub fn mark_running(job_id: &str) -> AppResult<()> {
    update_refresh_job(job_id, |job| {
        if matches!(job.status, LibraryRefreshJobStatus::Queued) {
            job.status = LibraryRefreshJobStatus::Running;
        }
    })
}

pub fn increment_refresh_success(job_id: &str, now: u64) -> AppResult<()> {
    update_refresh_job(job_id, |job| {
        job.processed += 1;
        job.succeeded += 1;
        job.updated_at = Some(now);
    })
}

pub fn increment_refresh_skipped(job_id: &str, now: u64) -> AppResult<()> {
    update_refresh_job(job_id, |job| {
        job.processed += 1;
        job.skipped += 1;
        job.cancelled = true;
        job.updated_at = Some(now);
    })
}

pub fn set_refresh_current_path(job_id: &str, current_path: Option<String>, now: u64) -> AppResult<()> {
    update_refresh_job(job_id, |job| {
        job.current_path = current_path;
        job.updated_at = Some(now);
    })
}

pub fn increment_refresh_failure(
    job_id: &str,
    document_id: String,
    path: String,
    status: LibraryDocumentStatus,
    reason: Option<LibraryRefreshFailureReason>,
    message: Option<String>,
    now: u64,
) -> AppResult<()> {
    update_refresh_job(job_id, |job| {
        job.processed += 1;
        job.failed += 1;
        job.updated_at = Some(now);
        job.errors.push(LibraryRefreshErrorItem {
            document_id,
            path,
            status,
            reason: reason.unwrap_or(LibraryRefreshFailureReason::Unknown),
            message: message.unwrap_or_else(|| "刷新失败".to_string()),
            technical_message: None,
        });
    })
}

pub fn increment_refresh_task_failure(job_id: &str, message: String, now: u64) -> AppResult<()> {
    update_refresh_job(job_id, |job| {
        job.status = LibraryRefreshJobStatus::Failed;
        job.finished_at = Some(now);
        job.updated_at = job.finished_at;
        job.errors.push(LibraryRefreshErrorItem {
            document_id: String::new(),
            path: String::new(),
            status: LibraryDocumentStatus::Error,
            reason: LibraryRefreshFailureReason::Unknown,
            message,
            technical_message: None,
        });
    })
}

pub fn finish_refresh_job(job_id: &str, now: u64) -> AppResult<()> {
    update_refresh_job(job_id, |job| {
        if matches!(job.status, LibraryRefreshJobStatus::Failed) {
            return;
        }
        job.status = if job.skipped > 0 {
            LibraryRefreshJobStatus::Cancelled
        } else if job.failed > 0 {
            LibraryRefreshJobStatus::CompletedWithErrors
        } else {
            LibraryRefreshJobStatus::Completed
        };
        job.finished_at = Some(now);
        job.updated_at = job.finished_at;
    })
}

fn update_refresh_job(
    job_id: &str,
    update: impl FnOnce(&mut LibraryRefreshStatus),
) -> AppResult<()> {
    let mut guard = lock_refresh_job("刷新任务状态不可写")?;
    let job = guard
        .as_mut()
        .filter(|job| job.job_id == job_id)
        .ok_or_else(|| AppError::Validation(format!("刷新任务不存在: {job_id}")))?;
    update(job);
    Ok(())
}

fn lock_refresh_job(
    error_message: &'static str,
) -> AppResult<std::sync::MutexGuard<'static, Option<LibraryRefreshStatus>>> {
    REFRESH_JOB
        .get_or_init(|| Mutex::new(None))
        .lock()
        .map_err(|_| AppError::Database(error_message.to_string()))
}
