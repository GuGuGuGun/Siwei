use crate::{
    models::{ImportPreview, ImportReport, OutlineDocument},
    services::{
        file_service, html_export, import_export_summary, markdown_export, markdown_parser,
        opml_format, plain_text_export,
    },
    utils::error::CommandResult,
};
use std::{fs::File, io::Write, path::Path};

#[tauri::command]
pub fn export_markdown(path: String, doc: OutlineDocument) -> Result<(), String> {
    let content = markdown_export::export_markdown(&doc);
    file_service::write_text(path, &content).into_command_result()
}

#[tauri::command]
pub fn import_markdown(path: String) -> Result<OutlineDocument, String> {
    let content = file_service::read_text(path).into_command_result()?;
    markdown_parser::import_markdown(&content).into_command_result()
}

#[tauri::command]
pub fn preview_import_document(path: String, format: String) -> Result<ImportPreview, String> {
    let content = file_service::read_text(path).into_command_result()?;
    match format.as_str() {
        "json" => {
            let doc = serde_json::from_str::<OutlineDocument>(&content)
                .map_err(|error| format!("JSON 解析失败: {error}"))?;
            doc.validate().map_err(|error| error.user_message())?;
            Ok(import_export_summary::build_preview(
                doc,
                ImportReport::default(),
            ))
        }
        "markdown" => {
            let doc = markdown_parser::import_markdown(&content).into_command_result()?;
            Ok(import_export_summary::build_preview(
                doc,
                ImportReport::default(),
            ))
        }
        "opml" => {
            let (doc, report) = opml_format::import_opml(&content).into_command_result()?;
            Ok(import_export_summary::build_preview(doc, report))
        }
        _ => Err("unsupported import format".to_string()),
    }
}

#[tauri::command]
pub fn export_json(path: String, doc: OutlineDocument) -> Result<(), String> {
    file_service::export_json(path, &doc).into_command_result()
}

#[tauri::command]
pub fn import_json(path: String) -> Result<OutlineDocument, String> {
    file_service::import_json(path).into_command_result()
}

#[tauri::command]
pub fn export_opml(path: String, doc: OutlineDocument) -> Result<(), String> {
    doc.validate().into_command_result()?;
    let content = opml_format::export_opml(&doc);
    file_service::write_text(path, &content).into_command_result()
}

#[tauri::command]
pub fn export_html(path: String, doc: OutlineDocument) -> Result<(), String> {
    doc.validate().into_command_result()?;
    let content = html_export::export_html(&doc);
    file_service::write_text(path, &content).into_command_result()
}

#[tauri::command]
pub fn export_plain_text(path: String, doc: OutlineDocument) -> Result<(), String> {
    doc.validate().into_command_result()?;
    let content = plain_text_export::export_plain_text(&doc);
    file_service::write_text(path, &content).into_command_result()
}

#[tauri::command]
pub fn export_mindmap_asset(path: String, format: String, bytes: Vec<u8>) -> Result<(), String> {
    let trimmed_path = path.trim();
    if trimmed_path.is_empty() {
        return Err("invalid export path".to_string());
    }

    if !matches!(format.as_str(), "png" | "pdf") {
        return Err("unsupported export format".to_string());
    }

    if bytes.is_empty() {
        return Err("export content is empty".to_string());
    }

    let target = Path::new(trimmed_path);
    let parent = target
        .parent()
        .filter(|parent| !parent.as_os_str().is_empty())
        .ok_or_else(|| "export parent directory does not exist".to_string())?;
    if !parent.exists() {
        return Err("export parent directory does not exist".to_string());
    }

    let mut file =
        File::create(target).map_err(|error| format!("failed to write export file: {error}"))?;
    file.write_all(&bytes)
        .and_then(|_| file.sync_all())
        .map_err(|error| format!("failed to write export file: {error}"))
}

#[cfg(test)]
mod tests {
    use std::fs;

    use tempfile::tempdir;

    use crate::models::{OutlineDocument, OutlineNode};

    use super::{
        export_html, export_markdown, export_mindmap_asset, export_opml, export_plain_text,
        preview_import_document,
    };

    fn node(id: &str, text: &str, children: Vec<OutlineNode>) -> OutlineNode {
        OutlineNode {
            id: id.to_string(),
            text: text.to_string(),
            note: None,
            collapsed: None,
            checked: None,
            tags: None,
            created_at: 1,
            updated_at: 1,
            children,
        }
    }

    #[test]
    fn export_markdown_command_serializes_document_tree() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("export.md");
        let doc = OutlineDocument {
            id: "doc".to_string(),
            title: "Project".to_string(),
            version: 1,
            created_at: 1,
            updated_at: 1,
            mind_map_layout: None,
            root: node("root", "Project", vec![node("child", "Task", Vec::new())]),
        };

        export_markdown(path.display().to_string(), doc).unwrap();

        let content = fs::read_to_string(path).unwrap();
        assert_eq!(content, "# Project\n\n- Task");
    }

    #[test]
    fn export_mindmap_asset_writes_png_and_pdf_bytes() {
        let dir = tempdir().unwrap();
        let png_path = dir.path().join("map.png");
        let pdf_path = dir.path().join("map.pdf");

        export_mindmap_asset(
            png_path.display().to_string(),
            "png".to_string(),
            vec![137, 80, 78, 71],
        )
        .unwrap();
        export_mindmap_asset(
            pdf_path.display().to_string(),
            "pdf".to_string(),
            b"%PDF".to_vec(),
        )
        .unwrap();

        assert_eq!(fs::read(png_path).unwrap(), vec![137, 80, 78, 71]);
        assert_eq!(fs::read(pdf_path).unwrap(), b"%PDF".to_vec());
    }

    #[test]
    fn export_mindmap_asset_rejects_invalid_input() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("map.png");
        let missing_parent = dir.path().join("missing").join("map.png");

        assert_eq!(
            export_mindmap_asset("   ".to_string(), "png".to_string(), vec![1]).unwrap_err(),
            "invalid export path",
        );
        assert_eq!(
            export_mindmap_asset(path.display().to_string(), "svg".to_string(), vec![1])
                .unwrap_err(),
            "unsupported export format",
        );
        assert_eq!(
            export_mindmap_asset(path.display().to_string(), "png".to_string(), Vec::new())
                .unwrap_err(),
            "export content is empty",
        );
        assert_eq!(
            export_mindmap_asset(
                missing_parent.display().to_string(),
                "png".to_string(),
                vec![1]
            )
            .unwrap_err(),
            "export parent directory does not exist",
        );
    }

    #[test]
    fn preview_opml_import_preserves_mubu_outline_notes_tasks_and_report() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("mubu.opml");
        fs::write(
            &path,
            r#"<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head><title>迁移文档</title></head>
  <body>
    <outline text="计划" _note="备注正文" _status="done" custom="保留">
      <outline title="子项" checked="false" />
    </outline>
  </body>
</opml>"#,
        )
        .unwrap();

        let preview =
            preview_import_document(path.display().to_string(), "opml".to_string()).unwrap();

        assert_eq!(preview.document.title, "迁移文档");
        assert_eq!(preview.summary.node_count, 2);
        assert_eq!(preview.summary.task_count, 2);
        let imported = &preview.document.root.children[0];
        assert_eq!(imported.text, "计划");
        assert_eq!(imported.checked, Some(true));
        assert!(imported.note.as_deref().unwrap().contains("备注正文"));
        assert!(imported.note.as_deref().unwrap().contains("导入保留信息"));
        assert_eq!(imported.children[0].checked, Some(false));
        assert!(preview
            .report
            .items
            .iter()
            .any(|item| item.field == "custom"));
    }

    #[test]
    fn preview_opml_import_preserves_unknown_task_status_in_note_and_report() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("unknown-status.opml");
        fs::write(
            &path,
            r#"<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head><title>迁移文档</title></head>
  <body>
    <outline text="待确认任务" _status="maybe" />
  </body>
</opml>"#,
        )
        .unwrap();

        let preview =
            preview_import_document(path.display().to_string(), "opml".to_string()).unwrap();
        let imported = &preview.document.root.children[0];

        assert_eq!(imported.checked, None);
        assert!(imported
            .note
            .as_deref()
            .is_some_and(|note| note.contains("- _status: maybe")));
        assert!(preview.report.items.iter().any(|item| {
            item.severity == crate::models::ImportReportSeverity::Warning
                && item.node_path == ["待确认任务"]
                && item.field == "_status"
                && item.value == "maybe"
        }));
    }

    #[test]
    fn preview_opml_import_uses_later_recognized_status_after_unknown_status() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("mixed-status.opml");
        fs::write(
            &path,
            r#"<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head><title>迁移文档</title></head>
  <body>
    <outline text="混合状态任务" _status="maybe" checked="true" />
  </body>
</opml>"#,
        )
        .unwrap();

        let preview =
            preview_import_document(path.display().to_string(), "opml".to_string()).unwrap();
        let imported = &preview.document.root.children[0];

        assert_eq!(imported.checked, Some(true));
        assert!(imported
            .note
            .as_deref()
            .is_some_and(|note| note.contains("- _status: maybe")));
        assert!(preview.report.items.iter().any(|item| {
            item.severity == crate::models::ImportReportSeverity::Warning
                && item.node_path == ["混合状态任务"]
                && item.field == "_status"
        }));
    }

    #[test]
    fn exports_document_level_opml_html_and_plain_text() {
        let dir = tempdir().unwrap();
        let doc = sample_doc_with_metadata();
        let opml_path = dir.path().join("doc.opml");
        let html_path = dir.path().join("doc.html");
        let text_path = dir.path().join("doc.txt");

        export_opml(opml_path.display().to_string(), doc.clone()).unwrap();
        export_html(html_path.display().to_string(), doc.clone()).unwrap();
        export_plain_text(text_path.display().to_string(), doc).unwrap();

        let opml = fs::read_to_string(opml_path).unwrap();
        let html = fs::read_to_string(html_path).unwrap();
        let text = fs::read_to_string(text_path).unwrap();

        assert!(opml.contains(r#"<opml version="2.0">"#));
        assert!(opml.contains(r#"text="发布计划""#));
        assert!(opml.contains(r#"_note="节点备注""#));
        assert!(html.contains("<title>Project</title>"));
        assert!(html.contains("发布计划"));
        assert!(html.contains("节点备注"));
        assert!(html.contains(r#"id="siwei-share-data""#));
        assert!(html.contains(r#"data-renderer="siwei-offline-mindmap""#));
        assert!(html.contains("data-action=\"toggle-view\""));
        assert!(html.contains("data-action=\"toggle-collapse\""));
        assert!(!html.contains("https://"));
        assert!(!html.contains("http://"));
        assert!(text.contains("# Project"));
        assert!(text.contains("- [ ] 发布计划 #工作"));
        assert!(text.contains("> 节点备注"));
    }

    fn sample_doc_with_metadata() -> OutlineDocument {
        let mut task = node("task", "发布计划", Vec::new());
        task.note = Some("节点备注".to_string());
        task.checked = Some(false);
        task.tags = Some(vec!["工作".to_string()]);

        OutlineDocument {
            id: "doc".to_string(),
            title: "Project".to_string(),
            version: 1,
            created_at: 1,
            updated_at: 1,
            mind_map_layout: None,
            root: node("root", "Project", vec![task]),
        }
    }
}
