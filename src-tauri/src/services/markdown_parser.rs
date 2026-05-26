use crate::{
    models::{OutlineDocument, OutlineNode},
    utils::{error::AppError, id::new_id, time::now_millis},
};

pub fn import_markdown(content: &str) -> Result<OutlineDocument, AppError> {
    markdown::to_mdast(content, &markdown::ParseOptions::default())
        .map_err(|error| AppError::MarkdownParse(error.to_string()))?;

    let timestamp = now_millis();
    let title = extract_title(content).unwrap_or_else(|| "未命名文档".to_string());
    let mut entries = Vec::new();

    for (line_index, line) in content.lines().enumerate() {
        if let Some(entry) = parse_list_line(line, line_index + 1)? {
            entries.push(entry);
        }
    }

    let children = build_tree(&entries)?;
    let root = OutlineNode {
        id: new_id(),
        text: title.clone(),
        note: None,
        collapsed: None,
        checked: None,
        tags: None,
        created_at: timestamp,
        updated_at: timestamp,
        children,
    };

    let doc = OutlineDocument {
        id: new_id(),
        title,
        version: 1,
        created_at: timestamp,
        updated_at: timestamp,
        root,
    };
    doc.validate()?;
    Ok(doc)
}

fn extract_title(content: &str) -> Option<String> {
    content.lines().find_map(|line| {
        let trimmed = line.trim_start();
        if trimmed.starts_with("# ") {
            Some(trimmed.trim_start_matches("# ").trim().to_string())
        } else {
            None
        }
    })
}

#[derive(Debug, Clone)]
struct ListEntry {
    line: usize,
    depth: usize,
    text: String,
}

fn parse_list_line(line: &str, line_number: usize) -> Result<Option<ListEntry>, AppError> {
    let Some(marker_index) = line.find("- ") else {
        return Ok(None);
    };

    if !line[..marker_index]
        .chars()
        .all(|character| character == ' ' || character == '\t')
    {
        return Ok(None);
    }

    let depth = indentation_depth(&line[..marker_index], line_number)?;
    let text = line[marker_index + 2..].trim().to_string();

    Ok(Some(ListEntry {
        line: line_number,
        depth,
        text,
    }))
}

fn indentation_depth(indent: &str, line_number: usize) -> Result<usize, AppError> {
    let mut columns = 0;
    for character in indent.chars() {
        match character {
            ' ' => columns += 1,
            '\t' => columns += 2,
            _ => {}
        }
    }

    if columns % 2 != 0 {
        return Err(AppError::MarkdownParse(format!(
            "第 {line_number} 行缩进必须使用 2/4 空格或 Tab"
        )));
    }

    Ok(columns / 2)
}

fn build_tree(entries: &[ListEntry]) -> Result<Vec<OutlineNode>, AppError> {
    let mut index = 0;
    build_level(entries, &mut index, 0)
}

fn build_level(
    entries: &[ListEntry],
    index: &mut usize,
    depth: usize,
) -> Result<Vec<OutlineNode>, AppError> {
    let mut nodes = Vec::new();

    while *index < entries.len() {
        let entry = &entries[*index];

        if entry.depth < depth {
            break;
        }

        if entry.depth > depth {
            return Err(AppError::MarkdownParse(format!(
                "第 {} 行列表缩进跳级，缺少父级列表项",
                entry.line
            )));
        }

        *index += 1;
        let timestamp = now_millis();
        let mut node = OutlineNode {
            id: new_id(),
            text: entry.text.clone(),
            note: None,
            collapsed: None,
            checked: None,
            tags: None,
            created_at: timestamp,
            updated_at: timestamp,
            children: Vec::new(),
        };

        if *index < entries.len() && entries[*index].depth > depth {
            if entries[*index].depth != depth + 1 {
                return Err(AppError::MarkdownParse(format!(
                    "第 {} 行列表缩进跳级，缺少父级列表项",
                    entries[*index].line
                )));
            }
            node.children = build_level(entries, index, depth + 1)?;
        }

        nodes.push(node);
    }

    Ok(nodes)
}

#[cfg(test)]
mod tests {
    use super::import_markdown;

    #[test]
    fn imports_title_and_nested_lists_with_spaces_and_tabs() {
        let doc = import_markdown(
            "# Roadmap\n\nignored paragraph\n- Backend\n  - Commands\n\t- Services\n- Frontend",
        )
        .unwrap();

        assert_eq!(doc.title, "Roadmap");
        assert_eq!(doc.root.text, "Roadmap");
        assert_eq!(doc.root.children.len(), 2);
        assert_eq!(doc.root.children[0].text, "Backend");
        assert_eq!(doc.root.children[0].children[0].text, "Commands");
        assert_eq!(doc.root.children[0].children[1].text, "Services");
        assert_eq!(doc.root.children[1].text, "Frontend");
    }

    #[test]
    fn defaults_title_and_ignores_non_mvp_syntax() {
        let doc = import_markdown("> quote\n\n| a | b |\n| - | - |\n\n- Item").unwrap();

        assert_eq!(doc.title, "未命名文档");
        assert_eq!(doc.root.children.len(), 1);
        assert_eq!(doc.root.children[0].text, "Item");
    }

    #[test]
    fn reports_line_number_for_bad_indent() {
        let error = import_markdown("- Parent\n   - Bad")
            .unwrap_err()
            .to_string();

        assert!(error.contains("第 2 行"));
    }

    #[test]
    fn rejects_indent_level_jump() {
        let error = import_markdown("- Parent\n    - Too deep")
            .unwrap_err()
            .to_string();

        assert!(error.contains("第 2 行"));
        assert!(error.contains("跳级"));
    }
}
