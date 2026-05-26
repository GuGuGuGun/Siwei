use crate::models::{OutlineDocument, OutlineNode};

pub fn export_markdown(doc: &OutlineDocument) -> String {
    let mut lines = vec![
        format!("# {}", escape_heading_text(&doc.title)),
        String::new(),
    ];

    for child in &doc.root.children {
        append_node(&mut lines, child, 0);
    }

    lines.join("\n")
}

fn append_node(lines: &mut Vec<String>, node: &OutlineNode, depth: usize) {
    let indent = "  ".repeat(depth);
    lines.push(format!("{indent}- {}", escape_list_text(&node.text)));

    for child in &node.children {
        append_node(lines, child, depth + 1);
    }
}

fn escape_heading_text(text: &str) -> String {
    text.replace(['\r', '\n'], " ").trim().to_string()
}

fn escape_list_text(text: &str) -> String {
    text.replace('\\', "\\\\")
        .replace('\r', " ")
        .replace('\n', "\\n")
}

#[cfg(test)]
mod tests {
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
    fn exports_stable_markdown_tree() {
        let doc = OutlineDocument {
            id: "doc".to_string(),
            title: "Project".to_string(),
            version: 1,
            created_at: 1,
            updated_at: 1,
            root: node(
                "root",
                "Project",
                vec![
                    node("a", "Plan", vec![node("b", "API", Vec::new())]),
                    node("c", "Ship", Vec::new()),
                ],
            ),
        };

        assert_eq!(
            export_markdown(&doc),
            "# Project\n\n- Plan\n  - API\n- Ship"
        );
    }

    #[test]
    fn escapes_multiline_node_text_for_round_trip_import() {
        let doc = OutlineDocument {
            id: "doc".to_string(),
            title: "Project\nDraft".to_string(),
            version: 1,
            created_at: 1,
            updated_at: 1,
            root: node(
                "root",
                "Project",
                vec![node("a", "Line 1\n- not a child", Vec::new())],
            ),
        };

        assert_eq!(
            export_markdown(&doc),
            "# Project Draft\n\n- Line 1\\n- not a child"
        );
    }
}
