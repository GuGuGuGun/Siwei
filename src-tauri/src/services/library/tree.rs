use std::collections::BTreeSet;

use crate::models::{OutlineDocument, OutlineNode};

use super::models::IndexedNode;

pub(crate) fn extract_nodes(doc: &OutlineDocument) -> Vec<IndexedNode> {
    let mut nodes = Vec::new();
    extract_node_recursive(&doc.root, Vec::new(), true, &mut nodes);
    nodes
}

pub(crate) fn collect_tags(nodes: &[IndexedNode]) -> Vec<String> {
    let mut tags = BTreeSet::new();
    for node in nodes {
        for tag in &node.tags {
            tags.insert(tag.clone());
        }
    }
    tags.into_iter().collect()
}

pub(crate) fn set_node_checked(
    node: &mut OutlineNode,
    node_id: &str,
    checked: bool,
    now: u64,
) -> bool {
    if node.id == node_id {
        node.checked = Some(checked);
        node.updated_at = now;
        return true;
    }

    for child in &mut node.children {
        if set_node_checked(child, node_id, checked, now) {
            return true;
        }
    }
    false
}

fn extract_node_recursive(
    node: &OutlineNode,
    parent_path: Vec<String>,
    is_root: bool,
    nodes: &mut Vec<IndexedNode>,
) {
    nodes.push(IndexedNode {
        node_id: node.id.clone(),
        text: node.text.clone(),
        note: node.note.clone(),
        tags: node.tags.clone().unwrap_or_default(),
        checked: node.checked,
        path: parent_path.clone(),
    });

    let mut child_path = parent_path;
    if !is_root {
        child_path.push(node.text.clone());
    }

    for child in &node.children {
        extract_node_recursive(child, child_path.clone(), false, nodes);
    }
}
