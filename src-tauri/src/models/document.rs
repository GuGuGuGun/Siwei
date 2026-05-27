use std::collections::HashSet;

use serde::{Deserialize, Serialize};

use crate::utils::{error::AppError, id::new_id, time::now_millis};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct OutlineDocument {
    pub id: String,
    pub title: String,
    pub version: u32,
    pub created_at: u64,
    pub updated_at: u64,
    pub root: OutlineNode,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct OutlineNode {
    pub id: String,
    pub text: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub note: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub collapsed: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub checked: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tags: Option<Vec<String>>,
    pub created_at: u64,
    pub updated_at: u64,
    pub children: Vec<OutlineNode>,
}

impl OutlineDocument {
    pub fn new_untitled() -> Self {
        let timestamp = now_millis();
        let title = "未命名文档".to_string();

        Self {
            id: new_id(),
            title: title.clone(),
            version: 1,
            created_at: timestamp,
            updated_at: timestamp,
            root: OutlineNode::new(title, timestamp),
        }
    }

    pub fn validate(&self) -> Result<(), AppError> {
        if self.id.trim().is_empty() {
            return Err(AppError::Validation("文档 ID 不能为空".to_string()));
        }

        if self.version == 0 {
            return Err(AppError::Validation("文档版本必须大于 0".to_string()));
        }

        if self.created_at == 0 || self.updated_at == 0 {
            return Err(AppError::Validation("文档时间戳必须大于 0".to_string()));
        }

        let mut node_ids = HashSet::new();
        self.root.validate_recursive("root", &mut node_ids)?;
        Ok(())
    }
}

impl OutlineNode {
    pub fn new(text: impl Into<String>, timestamp: u64) -> Self {
        Self {
            id: new_id(),
            text: text.into(),
            note: None,
            collapsed: None,
            checked: None,
            tags: None,
            created_at: timestamp,
            updated_at: timestamp,
            children: Vec::new(),
        }
    }

    fn validate_recursive(
        &self,
        location: &str,
        seen_ids: &mut HashSet<String>,
    ) -> Result<(), AppError> {
        if self.id.trim().is_empty() {
            return Err(AppError::Validation(format!("{location} 节点 ID 不能为空")));
        }

        if !seen_ids.insert(self.id.clone()) {
            return Err(AppError::Validation(format!("节点 ID 重复: {}", self.id)));
        }

        if self.created_at == 0 || self.updated_at == 0 {
            return Err(AppError::Validation(format!(
                "{location} 节点时间戳必须大于 0"
            )));
        }

        if let Some(tags) = &self.tags {
            let mut seen_tags = HashSet::new();
            for tag in tags {
                if tag.trim().is_empty() {
                    return Err(AppError::Validation(format!("{location} 节点标签不能为空")));
                }

                if tag.contains('\n') || tag.contains('\r') {
                    return Err(AppError::Validation(format!(
                        "{location} 节点标签不能包含换行"
                    )));
                }

                if !seen_tags.insert(tag) {
                    return Err(AppError::Validation(format!(
                        "{location} 节点标签重复: {tag}"
                    )));
                }
            }
        }

        for (index, child) in self.children.iter().enumerate() {
            child.validate_recursive(&format!("{location}.children[{index}]"), seen_ids)?;
        }

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use pretty_assertions::assert_eq;
    use serde_json::json;

    use super::{OutlineDocument, OutlineNode};

    fn sample_doc() -> OutlineDocument {
        let child = OutlineNode {
            id: "child_123".to_string(),
            text: "Child".to_string(),
            note: None,
            collapsed: None,
            checked: None,
            tags: None,
            created_at: 1,
            updated_at: 1,
            children: Vec::new(),
        };

        OutlineDocument {
            id: "doc_123".to_string(),
            title: "Title".to_string(),
            version: 1,
            created_at: 1,
            updated_at: 1,
            root: OutlineNode {
                id: "root_123".to_string(),
                text: "Title".to_string(),
                note: None,
                collapsed: None,
                checked: None,
                tags: None,
                created_at: 1,
                updated_at: 1,
                children: vec![child],
            },
        }
    }

    #[test]
    fn serializes_external_contract_as_camel_case_with_children() {
        let value = serde_json::to_value(sample_doc()).unwrap();

        assert_eq!(
            value,
            json!({
                "id": "doc_123",
                "title": "Title",
                "version": 1,
                "createdAt": 1,
                "updatedAt": 1,
                "root": {
                    "id": "root_123",
                    "text": "Title",
                    "createdAt": 1,
                    "updatedAt": 1,
                    "children": [
                        {
                            "id": "child_123",
                            "text": "Child",
                            "createdAt": 1,
                            "updatedAt": 1,
                            "children": []
                        }
                    ]
                }
            })
        );
    }

    #[test]
    fn validates_required_fields_and_unique_node_ids() {
        let mut doc = sample_doc();
        assert!(doc.validate().is_ok());

        doc.root.children[0].id = doc.root.id.clone();
        let error = doc.validate().unwrap_err().to_string();
        assert!(error.contains("节点 ID 重复"));
    }

    #[test]
    fn rejects_missing_document_id_and_zero_version() {
        let mut doc = sample_doc();
        doc.id.clear();
        assert!(doc.validate().unwrap_err().to_string().contains("文档 ID"));

        let mut doc = sample_doc();
        doc.version = 0;
        assert!(doc.validate().unwrap_err().to_string().contains("版本"));
    }

    #[test]
    fn rejects_invalid_node_tags() {
        let mut doc = sample_doc();
        doc.root.children[0].tags = Some(vec!["工作".to_string(), "工作".to_string()]);
        assert!(doc.validate().unwrap_err().to_string().contains("标签重复"));

        let mut doc = sample_doc();
        doc.root.children[0].tags = Some(vec![" ".to_string()]);
        assert!(doc
            .validate()
            .unwrap_err()
            .to_string()
            .contains("标签不能为空"));

        let mut doc = sample_doc();
        doc.root.children[0].tags = Some(vec!["bad\ntag".to_string()]);
        assert!(doc
            .validate()
            .unwrap_err()
            .to_string()
            .contains("标签不能包含换行"));
    }
}
