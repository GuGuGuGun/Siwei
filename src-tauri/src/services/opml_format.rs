use quick_xml::{
    events::{BytesStart, Event},
    Reader,
};

use super::opml_format_helpers::{
    build_note, collect_attributes, escape_xml_attr, escape_xml_text, parse_task_text_marker,
    pick_checked, pick_node_text, pick_tags,
};
use crate::{
    models::{ImportReport, ImportReportItem, ImportReportSeverity, OutlineDocument, OutlineNode},
    utils::{error::AppError, id::new_id, time::now_millis},
};

pub fn import_opml(content: &str) -> Result<(OutlineDocument, ImportReport), AppError> {
    let mut reader = Reader::from_str(content);
    reader.config_mut().trim_text(true);

    let mut title = None;
    let mut is_in_head_title = false;
    let mut stack: Vec<OutlineNode> = Vec::new();
    let mut top_level_nodes = Vec::new();
    let mut report = ImportReport::default();

    loop {
        match reader
            .read_event()
            .map_err(|error| AppError::Validation(format!("OPML 解析失败: {error}")))?
        {
            Event::Start(event) if event.name().as_ref() == b"title" => {
                is_in_head_title = true;
            }
            Event::End(event) if event.name().as_ref() == b"title" => {
                is_in_head_title = false;
            }
            Event::Text(event) if is_in_head_title => {
                let text = event
                    .xml_content()
                    .map_err(|error| AppError::Validation(format!("OPML 标题解析失败: {error}")))?
                    .trim()
                    .to_string();
                if !text.is_empty() {
                    title = Some(text);
                }
            }
            Event::Start(event) if event.name().as_ref() == b"outline" => {
                let path = current_path(&stack);
                let node = outline_node_from_event(&reader, &event, &path, &mut report)?;
                stack.push(node);
            }
            Event::Empty(event) if event.name().as_ref() == b"outline" => {
                let path = current_path(&stack);
                let node = outline_node_from_event(&reader, &event, &path, &mut report)?;
                attach_node(node, &mut stack, &mut top_level_nodes);
            }
            Event::End(event) if event.name().as_ref() == b"outline" => {
                let Some(node) = stack.pop() else {
                    return Err(AppError::Validation("OPML outline 结构不完整".to_string()));
                };
                attach_node(node, &mut stack, &mut top_level_nodes);
            }
            Event::Eof => break,
            _ => {}
        }
    }

    if !stack.is_empty() {
        return Err(AppError::Validation("OPML outline 结构未闭合".to_string()));
    }

    let timestamp = now_millis();
    let title = title.unwrap_or_else(|| "未命名文档".to_string());
    let doc = OutlineDocument {
        id: new_id(),
        title: title.clone(),
        version: 1,
        created_at: timestamp,
        updated_at: timestamp,
        mind_map_layout: None,
        root: OutlineNode {
            id: new_id(),
            text: title,
            note: None,
            collapsed: None,
            checked: None,
            tags: None,
            created_at: timestamp,
            updated_at: timestamp,
            children: top_level_nodes,
        },
    };
    doc.validate()?;
    Ok((doc, report))
}

pub fn export_opml(doc: &OutlineDocument) -> String {
    let mut lines = vec![
        r#"<?xml version="1.0" encoding="UTF-8"?>"#.to_string(),
        r#"<opml version="2.0">"#.to_string(),
        "  <head>".to_string(),
        format!("    <title>{}</title>", escape_xml_text(&doc.title)),
        "  </head>".to_string(),
        "  <body>".to_string(),
    ];

    for child in &doc.root.children {
        append_opml_node(&mut lines, child, 2);
    }

    lines.push("  </body>".to_string());
    lines.push("</opml>".to_string());
    lines.join("\n")
}

fn outline_node_from_event(
    reader: &Reader<&[u8]>,
    event: &BytesStart<'_>,
    parent_path: &[String],
    report: &mut ImportReport,
) -> Result<OutlineNode, AppError> {
    let attrs = collect_attributes(reader, event)?;
    let (mut text, title_source) = pick_node_text(&attrs);
    let mut node_path = parent_path.to_vec();

    let marker_checked = if let Some((from_marker, stripped)) = parse_task_text_marker(&text) {
        text = stripped;
        Some(from_marker)
    } else {
        None
    };

    if text.trim().is_empty() {
        text = "未命名节点".to_string();
        node_path.push(text.clone());
        report.items.push(ImportReportItem {
            severity: ImportReportSeverity::Warning,
            node_path: node_path.clone(),
            field: title_source.unwrap_or("text").to_string(),
            value: String::new(),
            action: "使用兜底标题“未命名节点”".to_string(),
        });
    } else {
        text = text.trim().to_string();
        node_path.push(text.clone());
    }

    let mut checked = pick_checked(&attrs, &node_path, report);
    if let Some(from_marker) = marker_checked {
        if checked.is_none() {
            checked = Some(from_marker);
        }
    }

    let note = build_note(&attrs, &node_path, report);
    let tags = pick_tags(&attrs);
    let timestamp = now_millis();

    Ok(OutlineNode {
        id: new_id(),
        text,
        note,
        collapsed: None,
        checked,
        tags,
        created_at: timestamp,
        updated_at: timestamp,
        children: Vec::new(),
    })
}

fn attach_node(
    node: OutlineNode,
    stack: &mut [OutlineNode],
    top_level_nodes: &mut Vec<OutlineNode>,
) {
    if let Some(parent) = stack.last_mut() {
        parent.children.push(node);
    } else {
        top_level_nodes.push(node);
    }
}

fn current_path(stack: &[OutlineNode]) -> Vec<String> {
    stack.iter().map(|node| node.text.clone()).collect()
}

fn append_opml_node(lines: &mut Vec<String>, node: &OutlineNode, depth: usize) {
    let indent = "  ".repeat(depth);
    let mut attrs = vec![format!("text=\"{}\"", escape_xml_attr(&node.text))];
    if let Some(note) = &node.note {
        attrs.push(format!("_note=\"{}\"", escape_xml_attr(note)));
    }
    if let Some(checked) = node.checked {
        attrs.push(format!(
            "_status=\"{}\"",
            if checked { "done" } else { "todo" }
        ));
    }
    if let Some(tags) = &node.tags {
        if !tags.is_empty() {
            attrs.push(format!("_tags=\"{}\"", escape_xml_attr(&tags.join(","))));
        }
    }

    if node.children.is_empty() {
        lines.push(format!("{indent}<outline {} />", attrs.join(" ")));
        return;
    }

    lines.push(format!("{indent}<outline {}>", attrs.join(" ")));
    for child in &node.children {
        append_opml_node(lines, child, depth + 1);
    }
    lines.push(format!("{indent}</outline>"));
}
