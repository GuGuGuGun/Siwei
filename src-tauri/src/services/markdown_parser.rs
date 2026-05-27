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
    let mut last_list_entry_index: Option<usize> = None;
    let mut fenced_code_marker: Option<String> = None;

    for (line_index, line) in content.lines().enumerate() {
        if let Some(marker) = fenced_code_marker.as_ref() {
            if is_fenced_code_boundary(line, marker) {
                fenced_code_marker = None;
            }
            continue;
        }

        if let Some(marker) = fenced_code_open_marker(line) {
            fenced_code_marker = Some(marker);
            continue;
        }

        if let Some(entry) = parse_list_line(line, line_index + 1)? {
            entries.push(entry);
            last_list_entry_index = Some(entries.len() - 1);
            continue;
        }

        if let Some(note_line) = parse_note_line(line, line_index + 1)? {
            if let Some(entry_index) = last_list_entry_index {
                let entry = &mut entries[entry_index];
                if note_line.depth == entry.depth + 1 {
                    match &mut entry.note {
                        Some(note) => {
                            note.push('\n');
                            note.push_str(&note_line.text);
                        }
                        None => entry.note = Some(note_line.text),
                    }
                }
            }
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
    checked: Option<bool>,
    tags: Option<Vec<String>>,
    note: Option<String>,
}

#[derive(Debug, Clone)]
struct NoteLine {
    depth: usize,
    text: String,
}

fn parse_list_line(line: &str, line_number: usize) -> Result<Option<ListEntry>, AppError> {
    let Some((marker_index, marker_length)) = find_list_marker(line) else {
        return Ok(None);
    };

    if !line[..marker_index]
        .chars()
        .all(|character| character == ' ' || character == '\t')
    {
        return Ok(None);
    }

    let depth = indentation_depth(&line[..marker_index], line_number)?;
    let (checked, text_without_marker) =
        parse_task_marker(line[marker_index + marker_length..].trim());
    let (text, tags) = parse_trailing_tags(text_without_marker);

    Ok(Some(ListEntry {
        line: line_number,
        depth,
        text,
        checked,
        tags,
        note: None,
    }))
}

fn find_list_marker(line: &str) -> Option<(usize, usize)> {
    if let Some(marker_index) = line.find("- ") {
        return Some((marker_index, 2));
    }

    let trimmed_start = line.trim_start_matches([' ', '\t']);
    let marker_index = line.len() - trimmed_start.len();
    let mut digit_count = 0;

    for character in trimmed_start.chars() {
        if character.is_ascii_digit() {
            digit_count += 1;
            continue;
        }
        break;
    }

    if digit_count == 0 {
        return None;
    }

    let rest = &trimmed_start[digit_count..];
    if rest.starts_with(". ") {
        Some((marker_index, digit_count + 2))
    } else {
        None
    }
}

fn fenced_code_open_marker(line: &str) -> Option<String> {
    let trimmed = line.trim_start();
    if trimmed.starts_with("```") {
        Some("```".to_string())
    } else if trimmed.starts_with("~~~") {
        Some("~~~".to_string())
    } else {
        None
    }
}

fn is_fenced_code_boundary(line: &str, marker: &str) -> bool {
    line.trim_start().starts_with(marker)
}

fn parse_note_line(line: &str, line_number: usize) -> Result<Option<NoteLine>, AppError> {
    let Some(marker_index) = line.find('>') else {
        return Ok(None);
    };

    if !line[..marker_index]
        .chars()
        .all(|character| character == ' ' || character == '\t')
    {
        return Ok(None);
    }

    let depth = indentation_depth(&line[..marker_index], line_number)?;
    let text = line[marker_index + 1..]
        .strip_prefix(' ')
        .unwrap_or(&line[marker_index + 1..])
        .to_string();

    Ok(Some(NoteLine { depth, text }))
}

fn parse_task_marker(text: &str) -> (Option<bool>, &str) {
    if let Some(rest) = text.strip_prefix("[ ] ") {
        return (Some(false), rest);
    }

    if let Some(rest) = text
        .strip_prefix("[x] ")
        .or_else(|| text.strip_prefix("[X] "))
    {
        return (Some(true), rest);
    }

    (None, text)
}

fn parse_trailing_tags(text: &str) -> (String, Option<Vec<String>>) {
    let mut parts: Vec<&str> = text.split_whitespace().collect();
    let mut reversed_tags = Vec::new();

    while let Some(part) = parts.last() {
        let Some(tag) = part.strip_prefix('#') else {
            break;
        };

        if tag.is_empty() || tag.contains('#') {
            break;
        }

        reversed_tags.push(tag.to_string());
        parts.pop();
    }

    if reversed_tags.is_empty() {
        return (text.trim().to_string(), None);
    }

    reversed_tags.reverse();
    let mut seen = std::collections::HashSet::new();
    let tags = reversed_tags
        .into_iter()
        .filter(|tag| seen.insert(tag.clone()))
        .collect::<Vec<_>>();
    let normalized_text = parts.join(" ").trim().to_string();

    (normalized_text, (!tags.is_empty()).then_some(tags))
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
            note: entry.note.clone().filter(|note| !note.trim().is_empty()),
            collapsed: None,
            checked: entry.checked,
            tags: entry.tags.clone(),
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

    #[test]
    fn imports_task_markers_trailing_tags_and_notes() {
        let doc = import_markdown(
            "# Roadmap\n\n- [ ] 发布计划 #工作 #重要\n  > 备注第一行\n  > 备注第二行\n  - [x] 子任务 #done\n- 普通节点",
        )
        .unwrap();

        let task = &doc.root.children[0];
        assert_eq!(task.text, "发布计划");
        assert_eq!(task.checked, Some(false));
        assert_eq!(
            task.tags.as_deref(),
            Some(&["工作".to_string(), "重要".to_string()][..])
        );
        assert_eq!(task.note.as_deref(), Some("备注第一行\n备注第二行"));
        assert_eq!(task.children[0].checked, Some(true));
        assert_eq!(
            task.children[0].tags.as_deref(),
            Some(&["done".to_string()][..])
        );
        assert_eq!(doc.root.children[1].checked, None);
    }

    #[test]
    fn ignores_list_tags_and_notes_inside_fenced_code_blocks() {
        let doc = import_markdown(
            "# Roadmap\n\n```md\n- not a node #tag\n  > not a note\n```\n- Real #tag\n~~~\n1. also ignored\n~~~",
        )
        .unwrap();

        assert_eq!(doc.root.children.len(), 1);
        assert_eq!(doc.root.children[0].text, "Real");
        assert_eq!(
            doc.root.children[0].tags.as_deref(),
            Some(&["tag".to_string()][..])
        );
        assert!(doc.root.children[0].note.is_none());
    }

    #[test]
    fn imports_ordered_lists_as_regular_nodes() {
        let doc = import_markdown("1. First\n  1. Child\n2. Second").unwrap();

        assert_eq!(doc.root.children.len(), 2);
        assert_eq!(doc.root.children[0].text, "First");
        assert_eq!(doc.root.children[0].children[0].text, "Child");
        assert_eq!(doc.root.children[1].text, "Second");
    }

    #[test]
    fn ignores_orphan_or_wrong_depth_note_blocks() {
        let doc = import_markdown("> orphan\n- Parent\n> wrong depth\n  > note").unwrap();

        assert_eq!(doc.root.children.len(), 1);
        assert_eq!(doc.root.children[0].text, "Parent");
        assert_eq!(doc.root.children[0].note.as_deref(), Some("note"));
    }

    #[test]
    fn only_extracts_contiguous_trailing_tags() {
        let doc = import_markdown("- 讨论 #工作 计划\n- 修复 #bug #bug").unwrap();

        assert_eq!(doc.root.children[0].text, "讨论 #工作 计划");
        assert!(doc.root.children[0].tags.is_none());
        assert_eq!(doc.root.children[1].text, "修复");
        assert_eq!(
            doc.root.children[1].tags.as_deref(),
            Some(&["bug".to_string()][..])
        );
    }
}
