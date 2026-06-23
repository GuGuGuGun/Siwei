use crate::models::{OutlineDocument, OutlineNode};

pub fn export_plain_text(doc: &OutlineDocument) -> String {
    let mut lines = vec![format!("# {}", sanitize_line(&doc.title)), String::new()];
    for node in &doc.root.children {
        append_node(&mut lines, node, 0);
    }
    lines.join("\n")
}

fn append_node(lines: &mut Vec<String>, node: &OutlineNode, depth: usize) {
    let indent = "  ".repeat(depth);
    let task_marker = match node.checked {
        Some(true) => "[x] ",
        Some(false) => "[ ] ",
        None => "",
    };
    let tags = node
        .tags
        .as_ref()
        .map(|tags| {
            tags.iter()
                .filter(|tag| !tag.trim().is_empty())
                .map(|tag| format!("#{tag}"))
                .collect::<Vec<_>>()
                .join(" ")
        })
        .filter(|tags| !tags.is_empty())
        .map(|tags| format!(" {tags}"))
        .unwrap_or_default();

    lines.push(format!(
        "{indent}- {task_marker}{}{}",
        sanitize_line(&node.text),
        tags
    ));

    if let Some(note) = &node.note {
        let note_indent = "  ".repeat(depth + 1);
        for line in note.lines() {
            lines.push(format!("{note_indent}> {}", sanitize_line(line)));
        }
    }

    for child in &node.children {
        append_node(lines, child, depth + 1);
    }
}

fn sanitize_line(value: &str) -> String {
    value.replace(['\r', '\n'], " ").trim().to_string()
}
