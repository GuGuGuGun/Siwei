use std::collections::{HashMap, HashSet};

use quick_xml::{events::BytesStart, Reader};

use crate::{
    models::{ImportReport, ImportReportItem, ImportReportSeverity},
    utils::error::AppError,
};

pub(super) fn collect_attributes(
    reader: &Reader<&[u8]>,
    event: &BytesStart<'_>,
) -> Result<HashMap<String, String>, AppError> {
    let mut attrs = HashMap::new();
    for attr in event.attributes().with_checks(false) {
        let attr =
            attr.map_err(|error| AppError::Validation(format!("OPML 属性解析失败: {error}")))?;
        let key = String::from_utf8_lossy(attr.key.as_ref()).to_string();
        let value = attr
            .decode_and_unescape_value(reader.decoder())
            .map_err(|error| AppError::Validation(format!("OPML 属性解析失败: {error}")))?
            .to_string();
        attrs.insert(key, value);
    }
    Ok(attrs)
}

pub(super) fn pick_node_text(attrs: &HashMap<String, String>) -> (String, Option<&'static str>) {
    for key in ["text", "title", "_note"] {
        if let Some(value) = attrs.get(key).filter(|value| !value.trim().is_empty()) {
            if key == "_note" {
                return (
                    value.lines().next().unwrap_or("").trim().to_string(),
                    Some("_note"),
                );
            }
            return (value.trim().to_string(), Some(key));
        }
    }
    (String::new(), None)
}

pub(super) fn pick_checked(
    attrs: &HashMap<String, String>,
    node_path: &[String],
    report: &mut ImportReport,
) -> Option<bool> {
    for key in TASK_STATUS_KEYS {
        let Some(value) = attrs.get(key) else {
            continue;
        };
        let checked = parse_task_status_value(value);
        if checked.is_none() && !value.trim().is_empty() {
            report.items.push(ImportReportItem {
                severity: ImportReportSeverity::Warning,
                node_path: node_path.to_vec(),
                field: key.to_string(),
                value: value.clone(),
                action: "无法识别任务状态，已保留原始字段".to_string(),
            });
        }
        if checked.is_some() {
            return checked;
        }
    }
    None
}

pub(super) fn parse_task_text_marker(text: &str) -> Option<(bool, String)> {
    let trimmed = text.trim_start();
    if let Some(rest) = trimmed.strip_prefix("[ ] ") {
        return Some((false, rest.trim().to_string()));
    }
    if let Some(rest) = trimmed
        .strip_prefix("[x] ")
        .or_else(|| trimmed.strip_prefix("[X] "))
    {
        return Some((true, rest.trim().to_string()));
    }
    None
}

pub(super) fn build_note(
    attrs: &HashMap<String, String>,
    node_path: &[String],
    report: &mut ImportReport,
) -> Option<String> {
    let mut sections = Vec::new();
    for key in ["_note", "description"] {
        if let Some(value) = attrs.get(key).filter(|value| !value.trim().is_empty()) {
            sections.push(value.trim().to_string());
        }
    }

    // 私有属性不与正文混排，统一追加到备注末尾，便于用户审阅和回溯迁移损耗。
    let preserved = collect_unmapped_attributes(attrs);
    if !preserved.is_empty() {
        let mut lines = vec!["导入保留信息".to_string()];
        for (key, value) in preserved {
            let value_summary = summarize_value(&value);
            lines.push(format!("- {key}: {value_summary}"));
            report.items.push(ImportReportItem {
                severity: ImportReportSeverity::Info,
                node_path: node_path.to_vec(),
                field: key,
                value: value_summary,
                action: "已写入节点备注的导入保留信息".to_string(),
            });
        }
        sections.push(lines.join("\n"));
    }

    (!sections.is_empty()).then_some(sections.join("\n\n"))
}

pub(super) fn pick_tags(attrs: &HashMap<String, String>) -> Option<Vec<String>> {
    let raw = attrs
        .get("_tags")
        .or_else(|| attrs.get("tags"))
        .map(|value| value.as_str())?;
    let mut seen = HashSet::new();
    let tags = raw
        .split([',', ';', ' '])
        .map(str::trim)
        .filter(|tag| !tag.is_empty())
        .filter(|tag| seen.insert((*tag).to_string()))
        .map(ToString::to_string)
        .collect::<Vec<_>>();
    (!tags.is_empty()).then_some(tags)
}

pub(super) fn escape_xml_text(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
}

pub(super) fn escape_xml_attr(value: &str) -> String {
    escape_xml_text(value)
        .replace('"', "&quot;")
        .replace('\'', "&apos;")
        .replace('\r', " ")
}

fn collect_unmapped_attributes(attrs: &HashMap<String, String>) -> Vec<(String, String)> {
    let known = known_attribute_keys();
    let mut preserved = attrs
        .iter()
        .filter(|(key, value)| should_preserve_attribute(key, value, &known))
        .map(|(key, value)| (key.clone(), value.clone()))
        .collect::<Vec<_>>();
    preserved.sort_by(|left, right| left.0.cmp(&right.0));
    preserved
}

const TASK_STATUS_KEYS: [&str; 4] = ["_status", "checked", "done", "complete"];

fn parse_task_status_value(value: &str) -> Option<bool> {
    let normalized = value.trim().to_ascii_lowercase();
    match normalized.as_str() {
        "done" | "complete" | "completed" | "checked" | "true" | "yes" | "1" | "finished" => {
            Some(true)
        }
        "todo" | "open" | "unchecked" | "false" | "no" | "0" | "pending" => Some(false),
        _ => None,
    }
}

fn should_preserve_attribute(
    key: &str,
    value: &str,
    known: &HashSet<&'static str>,
) -> bool {
    if value.trim().is_empty() {
        return false;
    }

    if TASK_STATUS_KEYS.contains(&key) {
        return parse_task_status_value(value).is_none();
    }

    !known.contains(key)
}

fn known_attribute_keys() -> HashSet<&'static str> {
    [
        "text",
        "title",
        "_note",
        "description",
        "_status",
        "checked",
        "done",
        "complete",
        "tags",
        "_tags",
        "created",
        "createdAt",
        "updated",
        "updatedAt",
        "type",
    ]
    .into_iter()
    .collect()
}

fn summarize_value(value: &str) -> String {
    let normalized = value.split_whitespace().collect::<Vec<_>>().join(" ");
    const MAX_LEN: usize = 120;
    if normalized.chars().count() <= MAX_LEN {
        return normalized;
    }
    let mut summary = normalized.chars().take(MAX_LEN).collect::<String>();
    summary.push('…');
    summary
}
