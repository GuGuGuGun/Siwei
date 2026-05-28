use crate::{
    models::OutlineDocument,
    services::{file_service, markdown_export, markdown_parser},
    utils::error::CommandResult,
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

#[cfg(test)]
mod tests {
    use std::fs;

    use tempfile::tempdir;

    use crate::models::{OutlineDocument, OutlineNode};

    use super::export_markdown;

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
}
