use std::collections::HashSet;

use crate::models::{
    ImportPreview, ImportReport, ImportReportSeverity, ImportSummary, OutlineDocument, OutlineNode,
};

pub fn build_preview(document: OutlineDocument, report: ImportReport) -> ImportPreview {
    let summary = summarize_document(&document, &report);
    ImportPreview {
        document,
        summary,
        report,
    }
}

pub fn summarize_document(document: &OutlineDocument, report: &ImportReport) -> ImportSummary {
    let mut stats = ImportStats::default();
    collect_stats(&document.root.children, 1, &mut stats);
    ImportSummary {
        title: document.title.clone(),
        node_count: stats.node_count,
        max_depth: stats.max_depth,
        task_count: stats.task_count,
        tag_count: stats.tags.len(),
        note_count: stats.note_count,
        warning_count: report
            .items
            .iter()
            .filter(|item| item.severity == ImportReportSeverity::Warning)
            .count(),
    }
}

#[derive(Default)]
struct ImportStats {
    node_count: usize,
    max_depth: usize,
    task_count: usize,
    note_count: usize,
    tags: HashSet<String>,
}

fn collect_stats(nodes: &[OutlineNode], depth: usize, stats: &mut ImportStats) {
    for node in nodes {
        stats.node_count += 1;
        stats.max_depth = stats.max_depth.max(depth);
        if node.checked.is_some() {
            stats.task_count += 1;
        }
        if node
            .note
            .as_deref()
            .is_some_and(|note| !note.trim().is_empty())
        {
            stats.note_count += 1;
        }
        if let Some(tags) = &node.tags {
            for tag in tags {
                stats.tags.insert(tag.clone());
            }
        }
        collect_stats(&node.children, depth + 1, stats);
    }
}
