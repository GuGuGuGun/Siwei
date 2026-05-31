use std::{
    borrow::Cow,
    collections::{BTreeMap, HashSet},
};

use serde::{Deserialize, Serialize};

use crate::utils::{error::AppError, id::new_id, time::now_millis};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct OutlineDocument {
    pub id: String,
    pub title: String,
    pub version: u32,
    pub created_at: u64,
    pub updated_at: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mind_map_layout: Option<MindMapLayoutState>,
    pub root: OutlineNode,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", untagged)]
pub enum MindMapLayoutState {
    #[serde(rename_all = "camelCase")]
    V1 {
        engine_version: u32,
        strategy: MindMapLayoutStrategy,
        nodes: BTreeMap<String, MindMapLayoutNodeState>,
    },
    Legacy(BTreeMap<String, MindMapLayoutPosition>),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum MindMapLayoutStrategy {
    Known(MindMapLayoutStrategyKind),
    Unknown(String),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MindMapLayoutStrategyKind {
    ClassicDagre,
    BalancedMindmap,
    RadialMindmap,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct MindMapLayoutNodeState {
    pub position: MindMapLayoutPosition,
    pub source: MindMapLayoutNodeSource,
    pub locked: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub updated_at: Option<u64>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum MindMapLayoutNodeSource {
    Auto,
    Manual,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct MindMapLayoutPosition {
    pub x: f64,
    pub y: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
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
            mind_map_layout: None,
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
        if let Some(layout) = &self.mind_map_layout {
            layout.validate()?;
        }
        Ok(())
    }
}

impl MindMapLayoutState {
    pub fn normalize(self) -> Self {
        match self {
            MindMapLayoutState::V1 {
                engine_version,
                strategy,
                nodes,
            } => MindMapLayoutState::V1 {
                engine_version,
                strategy,
                nodes,
            },
            MindMapLayoutState::Legacy(positions) => MindMapLayoutState::V1 {
                engine_version: 2,
                strategy: MindMapLayoutStrategy::classic_dagre(),
                nodes: positions
                    .into_iter()
                    .map(|(node_id, position)| {
                        (
                            node_id,
                            MindMapLayoutNodeState {
                                position,
                                source: MindMapLayoutNodeSource::Manual,
                                locked: true,
                                updated_at: None,
                            },
                        )
                    })
                    .collect(),
            },
        }
    }

    fn validate(&self) -> Result<(), AppError> {
        let normalized = self.clone().normalize();
        let MindMapLayoutState::V1 {
            engine_version,
            nodes,
            ..
        } = normalized
        else {
            unreachable!("layout normalization always returns v1")
        };

        if engine_version == 0 {
            return Err(AppError::Validation(
                "mindMapLayout.engineVersion 必须为受支持的正整数".to_string(),
            ));
        }

        for (node_id, node_state) in nodes {
            if node_id.trim().is_empty() {
                return Err(AppError::Validation(
                    "mindMapLayout.nodes 节点 ID 不能为空".to_string(),
                ));
            }
            node_state.validate(&format!("mindMapLayout.nodes.{node_id}"))?;
        }

        Ok(())
    }
}

impl MindMapLayoutStrategy {
    pub fn classic_dagre() -> Self {
        MindMapLayoutStrategy::Known(MindMapLayoutStrategyKind::ClassicDagre)
    }

    pub fn balanced_mindmap() -> Self {
        MindMapLayoutStrategy::Known(MindMapLayoutStrategyKind::BalancedMindmap)
    }

    pub fn as_str(&self) -> Cow<'_, str> {
        match self {
            MindMapLayoutStrategy::Known(MindMapLayoutStrategyKind::ClassicDagre) => {
                Cow::Borrowed("classic-dagre")
            }
            MindMapLayoutStrategy::Known(MindMapLayoutStrategyKind::BalancedMindmap) => {
                Cow::Borrowed("balanced-mindmap")
            }
            MindMapLayoutStrategy::Known(MindMapLayoutStrategyKind::RadialMindmap) => {
                Cow::Borrowed("radial-mindmap")
            }
            MindMapLayoutStrategy::Unknown(value) => Cow::Borrowed(value.as_str()),
        }
    }
}

impl Serialize for MindMapLayoutStrategy {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(self.as_str().as_ref())
    }
}

impl<'de> Deserialize<'de> for MindMapLayoutStrategy {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        let value = String::deserialize(deserializer)?;
        Ok(match value.as_str() {
            "classic-dagre" => MindMapLayoutStrategy::classic_dagre(),
            "balanced-mindmap" => MindMapLayoutStrategy::balanced_mindmap(),
            "radial-mindmap" => {
                MindMapLayoutStrategy::Known(MindMapLayoutStrategyKind::RadialMindmap)
            }
            _ => MindMapLayoutStrategy::Unknown(value),
        })
    }
}

impl MindMapLayoutNodeState {
    fn validate(&self, location: &str) -> Result<(), AppError> {
        if !self.position.x.is_finite() || !self.position.y.is_finite() {
            return Err(AppError::Validation(format!(
                "{location}.position 坐标必须为有限数字"
            )));
        }

        if self.updated_at == Some(0) {
            return Err(AppError::Validation(format!(
                "{location}.updatedAt 必须为合法时间戳"
            )));
        }

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
    use std::collections::BTreeMap;

    use pretty_assertions::assert_eq;
    use serde_json::json;

    use super::{
        MindMapLayoutNodeSource, MindMapLayoutNodeState, MindMapLayoutPosition, MindMapLayoutState,
        MindMapLayoutStrategy, OutlineDocument, OutlineNode,
    };

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
            mind_map_layout: None,
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
    fn serializes_mind_map_layout_as_camel_case() {
        let mut doc = sample_doc();
        doc.version = 2;
        doc.mind_map_layout = Some(MindMapLayoutState::V1 {
            engine_version: 2,
            strategy: MindMapLayoutStrategy::balanced_mindmap(),
            nodes: BTreeMap::from([(
                "child_123".to_string(),
                MindMapLayoutNodeState {
                    position: MindMapLayoutPosition { x: 120.0, y: 80.0 },
                    source: MindMapLayoutNodeSource::Manual,
                    locked: true,
                    updated_at: Some(2),
                },
            )]),
        });

        let value = serde_json::to_value(doc).unwrap();

        assert_eq!(
            value["mindMapLayout"],
            json!({
                "engineVersion": 2,
                "strategy": "balanced-mindmap",
                "nodes": {
                    "child_123": {
                        "position": {
                            "x": 120.0,
                            "y": 80.0
                        },
                        "source": "manual",
                        "locked": true,
                        "updatedAt": 2
                    }
                }
            })
        );
    }

    #[test]
    fn deserializes_legacy_document_without_mind_map_layout() {
        let doc: OutlineDocument = serde_json::from_value(json!({
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
                "children": []
            }
        }))
        .unwrap();

        assert_eq!(doc.version, 1);
        assert!(doc.mind_map_layout.is_none());
        assert!(doc.validate().is_ok());
    }

    #[test]
    fn validates_version_two_documents_with_layout() {
        let mut doc = sample_doc();
        doc.version = 2;
        doc.mind_map_layout = Some(MindMapLayoutState::V1 {
            engine_version: 2,
            strategy: MindMapLayoutStrategy::classic_dagre(),
            nodes: BTreeMap::from([(
                "child_123".to_string(),
                MindMapLayoutNodeState {
                    position: MindMapLayoutPosition { x: 120.0, y: 80.0 },
                    source: MindMapLayoutNodeSource::Auto,
                    locked: false,
                    updated_at: None,
                },
            )]),
        });

        assert!(doc.validate().is_ok());
    }

    #[test]
    fn deserializes_radial_and_unknown_mind_map_layout_strategies() {
        let radial_doc: OutlineDocument = serde_json::from_value(json!({
            "id": "doc_123",
            "title": "Title",
            "version": 2,
            "createdAt": 1,
            "updatedAt": 1,
            "mindMapLayout": {
                "engineVersion": 2,
                "strategy": "radial-mindmap",
                "nodes": {}
            },
            "root": {
                "id": "root_123",
                "text": "Title",
                "createdAt": 1,
                "updatedAt": 1,
                "children": []
            }
        }))
        .unwrap();
        let unknown_doc: OutlineDocument = serde_json::from_value(json!({
            "id": "doc_123",
            "title": "Title",
            "version": 2,
            "createdAt": 1,
            "updatedAt": 1,
            "mindMapLayout": {
                "engineVersion": 2,
                "strategy": "future-layout",
                "nodes": {}
            },
            "root": {
                "id": "root_123",
                "text": "Title",
                "createdAt": 1,
                "updatedAt": 1,
                "children": []
            }
        }))
        .unwrap();

        assert!(radial_doc.validate().is_ok());
        assert!(unknown_doc.validate().is_ok());
        assert_eq!(
            serde_json::to_value(radial_doc).unwrap()["mindMapLayout"]["strategy"],
            json!("radial-mindmap")
        );
        assert_eq!(
            serde_json::to_value(unknown_doc).unwrap()["mindMapLayout"]["strategy"],
            json!("future-layout")
        );
    }

    #[test]
    fn deserializes_legacy_coordinate_layout_as_supported_layout_state() {
        let doc: OutlineDocument = serde_json::from_value(json!({
            "id": "doc_123",
            "title": "Title",
            "version": 2,
            "createdAt": 1,
            "updatedAt": 1,
            "mindMapLayout": {
                "child_123": { "x": 120, "y": 80 }
            },
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
        }))
        .unwrap();

        let layout = doc.mind_map_layout.unwrap().normalize();
        let MindMapLayoutState::V1 {
            nodes, strategy, ..
        } = layout
        else {
            panic!("legacy layout should normalize to v1");
        };

        assert_eq!(strategy, MindMapLayoutStrategy::classic_dagre());
        assert_eq!(
            nodes["child_123"].position,
            MindMapLayoutPosition { x: 120.0, y: 80.0 }
        );
        assert_eq!(nodes["child_123"].source, MindMapLayoutNodeSource::Manual);
        assert!(nodes["child_123"].locked);
    }

    #[test]
    fn rejects_invalid_mind_map_layout_values() {
        let mut doc = sample_doc();
        doc.mind_map_layout = Some(MindMapLayoutState::V1 {
            engine_version: 0,
            strategy: MindMapLayoutStrategy::classic_dagre(),
            nodes: BTreeMap::new(),
        });
        assert!(doc
            .validate()
            .unwrap_err()
            .to_string()
            .contains("mindMapLayout.engineVersion"));

        let mut doc = sample_doc();
        doc.mind_map_layout = Some(MindMapLayoutState::V1 {
            engine_version: 1,
            strategy: MindMapLayoutStrategy::classic_dagre(),
            nodes: BTreeMap::from([(
                "child_123".to_string(),
                MindMapLayoutNodeState {
                    position: MindMapLayoutPosition {
                        x: f64::NAN,
                        y: 80.0,
                    },
                    source: MindMapLayoutNodeSource::Auto,
                    locked: false,
                    updated_at: None,
                },
            )]),
        });
        assert!(doc
            .validate()
            .unwrap_err()
            .to_string()
            .contains("position 坐标"));
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
