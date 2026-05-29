use crate::{
    models::OutlineDocument,
    services::{file_service, markdown_export, markdown_parser},
    utils::error::CommandResult,
};
use std::{
    fs::File,
    io::Write,
    path::Path,
};

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
pub fn export_json(path: String, doc: OutlineDocument) -> Result<(), String> {
    file_service::export_json(path, &doc).into_command_result()
}

#[tauri::command]
pub fn import_json(path: String) -> Result<OutlineDocument, String> {
    file_service::import_json(path).into_command_result()
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

    let mut file = File::create(target).map_err(|error| format!("failed to write export file: {error}"))?;
    file.write_all(&bytes)
        .and_then(|_| file.sync_all())
        .map_err(|error| format!("failed to write export file: {error}"))
}

#[cfg(test)]
mod tests {
    use std::fs;

    use tempfile::tempdir;

    use crate::models::{OutlineDocument, OutlineNode};

    use super::{export_markdown, export_mindmap_asset};

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
            export_mindmap_asset(path.display().to_string(), "svg".to_string(), vec![1]).unwrap_err(),
            "unsupported export format",
        );
        assert_eq!(
            export_mindmap_asset(path.display().to_string(), "png".to_string(), Vec::new()).unwrap_err(),
            "export content is empty",
        );
        assert_eq!(
            export_mindmap_asset(missing_parent.display().to_string(), "png".to_string(), vec![1]).unwrap_err(),
            "export parent directory does not exist",
        );
    }
}
