use crate::models::{OutlineDocument, OutlineNode, SearchMatch, SearchMatchSource, SearchResult};

pub fn search_document(doc: &OutlineDocument, query: &str) -> Vec<SearchResult> {
    let normalized_query = query.trim().to_lowercase();
    if normalized_query.trim().is_empty() {
        return Vec::new();
    }

    let mut results = Vec::new();
    search_node(&doc.root, &normalized_query, Vec::new(), &mut results, true);
    results
}

fn search_node(
    node: &OutlineNode,
    normalized_query: &str,
    parent_path: Vec<String>,
    results: &mut Vec<SearchResult>,
    is_root: bool,
) {
    let text_matches = find_match_indices(&node.text, normalized_query);
    let note_matches = node
        .note
        .as_ref()
        .map(|note| find_match_indices(note, normalized_query))
        .unwrap_or_default();
    let tag_matches = node
        .tags
        .as_ref()
        .map(|tags| {
            tags.iter()
                .filter_map(|tag| {
                    let indices = find_match_indices(tag, normalized_query);
                    (!indices.is_empty()).then_some(SearchMatch {
                        source: SearchMatchSource::Tag,
                        value: tag.clone(),
                        match_indices: indices,
                    })
                })
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();

    if !text_matches.is_empty() || !note_matches.is_empty() || !tag_matches.is_empty() {
        let mut match_sources = Vec::new();
        let mut matches = Vec::new();

        if !text_matches.is_empty() {
            match_sources.push(SearchMatchSource::Text);
            matches.push(SearchMatch {
                source: SearchMatchSource::Text,
                value: node.text.clone(),
                match_indices: text_matches.clone(),
            });
        }

        if !note_matches.is_empty() {
            match_sources.push(SearchMatchSource::Note);
            matches.push(SearchMatch {
                source: SearchMatchSource::Note,
                value: node.note.clone().unwrap_or_default(),
                match_indices: note_matches,
            });
        }

        if !tag_matches.is_empty() {
            match_sources.push(SearchMatchSource::Tag);
            matches.extend(tag_matches);
        }

        results.push(SearchResult {
            node_id: node.id.clone(),
            text: node.text.clone(),
            path: parent_path.clone(),
            match_indices: text_matches,
            match_sources,
            matches,
        });
    }

    let mut child_path = parent_path;
    if !is_root {
        child_path.push(node.text.clone());
    }

    for child in &node.children {
        search_node(child, normalized_query, child_path.clone(), results, false);
    }
}

fn find_match_indices(text: &str, query: &str) -> Vec<(usize, usize)> {
    let normalized_text = text.to_lowercase();
    let utf16_positions = utf16_positions_by_byte(text);
    let mut indices = Vec::new();
    let mut offset = 0;

    while let Some(relative_start) = normalized_text[offset..].find(query) {
        let start = offset + relative_start;
        let end = start + query.len();
        if let (Some(start_utf16), Some(end_utf16)) = (
            byte_to_utf16_position(&utf16_positions, start),
            byte_to_utf16_position(&utf16_positions, end),
        ) {
            indices.push((start_utf16, end_utf16));
        }
        offset = end;
    }

    indices
}

fn utf16_positions_by_byte(text: &str) -> Vec<(usize, usize)> {
    let mut positions = Vec::new();
    let mut utf16_offset = 0;
    for (byte_offset, character) in text.char_indices() {
        positions.push((byte_offset, utf16_offset));
        utf16_offset += character.len_utf16();
    }
    positions.push((text.len(), utf16_offset));
    positions
}

fn byte_to_utf16_position(positions: &[(usize, usize)], byte_offset: usize) -> Option<usize> {
    positions
        .iter()
        .find_map(|(byte, utf16)| (*byte == byte_offset).then_some(*utf16))
}

#[cfg(test)]
mod tests {
    use crate::models::{OutlineDocument, OutlineNode, SearchMatchSource};

    use super::search_document;

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
    fn searches_case_insensitively_with_parent_path_and_match_ranges() {
        let doc = OutlineDocument {
            id: "doc".to_string(),
            title: "Doc".to_string(),
            version: 1,
            created_at: 1,
            updated_at: 1,
            root: node(
                "root",
                "Root",
                vec![node(
                    "a",
                    "Planning",
                    vec![node("b", "API plan and plan B", Vec::new())],
                )],
            ),
        };

        let results = search_document(&doc, "PLAN");

        assert_eq!(results.len(), 2);
        assert_eq!(results[0].node_id, "a");
        assert_eq!(results[0].path, Vec::<String>::new());
        assert_eq!(results[0].match_indices, vec![(0, 4)]);
        assert_eq!(results[0].match_sources, vec![SearchMatchSource::Text]);
        assert_eq!(results[1].node_id, "b");
        assert_eq!(results[1].path, vec!["Planning".to_string()]);
        assert_eq!(results[1].match_indices, vec![(4, 8), (13, 17)]);
    }

    #[test]
    fn empty_query_returns_no_results() {
        let doc = OutlineDocument {
            id: "doc".to_string(),
            title: "Doc".to_string(),
            version: 1,
            created_at: 1,
            updated_at: 1,
            root: node("root", "Root", Vec::new()),
        };

        assert!(search_document(&doc, "").is_empty());
        assert!(search_document(&doc, "   ").is_empty());
    }

    #[test]
    fn match_ranges_are_utf16_offsets_for_frontend_slicing() {
        let doc = OutlineDocument {
            id: "doc".to_string(),
            title: "Doc".to_string(),
            version: 1,
            created_at: 1,
            updated_at: 1,
            root: node("root", "文档😀测试", Vec::new()),
        };

        let document_matches = search_document(&doc, "文档");
        let emoji_matches = search_document(&doc, "😀");
        let suffix_matches = search_document(&doc, "测试");

        assert_eq!(document_matches[0].match_indices, vec![(0, 2)]);
        assert_eq!(emoji_matches[0].match_indices, vec![(2, 4)]);
        assert_eq!(suffix_matches[0].match_indices, vec![(4, 6)]);
    }

    #[test]
    fn searches_note_and_tags_with_source_details() {
        let mut child = node("a", "发布计划", Vec::new());
        child.note = Some("测试通过后发布".to_string());
        child.tags = Some(vec!["发布".to_string(), "版本".to_string()]);
        let doc = OutlineDocument {
            id: "doc".to_string(),
            title: "Doc".to_string(),
            version: 1,
            created_at: 1,
            updated_at: 1,
            root: node("root", "Root", vec![child]),
        };

        let results = search_document(&doc, "发布");

        assert_eq!(results.len(), 1);
        assert_eq!(results[0].node_id, "a");
        assert_eq!(
            results[0].match_sources,
            vec![
                SearchMatchSource::Text,
                SearchMatchSource::Note,
                SearchMatchSource::Tag
            ]
        );
        assert_eq!(results[0].matches.len(), 3);
        assert_eq!(results[0].matches[2].value, "发布");
    }

    #[test]
    fn note_or_tag_only_match_keeps_text_match_indices_empty() {
        let mut child = node("a", "任务节点", Vec::new());
        child.note = Some("包含备注关键词".to_string());
        child.tags = Some(vec!["上下文".to_string()]);
        let doc = OutlineDocument {
            id: "doc".to_string(),
            title: "Doc".to_string(),
            version: 1,
            created_at: 1,
            updated_at: 1,
            root: node("root", "Root", vec![child]),
        };

        let results = search_document(&doc, "备注");

        assert_eq!(results.len(), 1);
        assert_eq!(results[0].match_indices, Vec::<(usize, usize)>::new());
        assert_eq!(results[0].match_sources, vec![SearchMatchSource::Note]);
        assert_eq!(results[0].matches[0].value, "包含备注关键词");
    }
}
