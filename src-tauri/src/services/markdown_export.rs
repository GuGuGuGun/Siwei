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
    let marker = match node.checked {
        Some(false) => "- [ ] ",
        Some(true) => "- [x] ",
        None => "- ",
    };
    let tags = node
        .tags
        .as_ref()
        .map(|tags| {
            tags.iter()
                .filter(|tag| is_exportable_tag(tag))
                .map(|tag| format!("#{tag}"))
                .collect::<Vec<_>>()
                .join(" ")
        })
        .filter(|tags| !tags.is_empty())
        .map(|tags| format!(" {tags}"))
        .unwrap_or_default();

    lines.push(format!(
        "{indent}{marker}{}{}",
        escape_list_text(&node.text),
        tags
    ));

    if let Some(note) = &node.note {
        let note_indent = "  ".repeat(depth + 1);
        for line in note.lines() {
            lines.push(format!("{note_indent}> {}", escape_note_text(line)));
        }
    }

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

fn escape_note_text(text: &str) -> String {
    text.replace('\r', " ")
}

fn is_exportable_tag(tag: &str) -> bool {
    !tag.trim().is_empty()
        && !tag.contains(char::is_whitespace)
        && !tag.contains('#')
        && !tag.contains('\r')
        && !tag.contains('\n')
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
            mind_map_layout: None,
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
            mind_map_layout: None,
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

    #[test]
    fn exports_task_tags_notes_and_children_in_stable_order() {
        let mut task = node("a", "发布计划", vec![node("b", "子任务", Vec::new())]);
        task.checked = Some(false);
        task.tags = Some(vec!["工作".to_string(), "重要".to_string()]);
        task.note = Some("备注第一行\n备注第二行".to_string());
        task.children[0].checked = Some(true);

        let doc = OutlineDocument {
            id: "doc".to_string(),
            title: "Project".to_string(),
            version: 1,
            created_at: 1,
            updated_at: 1,
            mind_map_layout: None,
            root: node("root", "Project", vec![task]),
        };

        assert_eq!(
            export_markdown(&doc),
            "# Project\n\n- [ ] 发布计划 #工作 #重要\n  > 备注第一行\n  > 备注第二行\n  - [x] 子任务"
        );
    }
}
