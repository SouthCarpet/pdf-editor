use pdf_editor_lib::pipeline::dag::{
    NodeCompressPreset, NodeKind, Pipeline, PipelineEdge, PipelineNode,
};

#[test]
fn topo_orders_linear_pipeline() {
    let p = Pipeline {
        nodes: vec![
            PipelineNode {
                id: "a".into(),
                kind: NodeKind::Unlock { password: None },
            },
            PipelineNode {
                id: "b".into(),
                kind: NodeKind::Compress {
                    preset: NodeCompressPreset::Recommended,
                    custom_quality: None,
                    custom_dpi: None,
                },
            },
            PipelineNode {
                id: "c".into(),
                kind: NodeKind::Save {
                    dir: "/tmp".into(),
                    name_template: "{stem}.pdf".into(),
                },
            },
        ],
        edges: vec![
            PipelineEdge {
                from: "a".into(),
                to: "b".into(),
            },
            PipelineEdge {
                from: "b".into(),
                to: "c".into(),
            },
        ],
    };
    let order = p.topo_order().unwrap();
    assert_eq!(order, vec!["a", "b", "c"]);
}

#[test]
fn topo_detects_cycle() {
    let p = Pipeline {
        nodes: vec![
            PipelineNode {
                id: "a".into(),
                kind: NodeKind::Merge {},
            },
            PipelineNode {
                id: "b".into(),
                kind: NodeKind::Merge {},
            },
        ],
        edges: vec![
            PipelineEdge {
                from: "a".into(),
                to: "b".into(),
            },
            PipelineEdge {
                from: "b".into(),
                to: "a".into(),
            },
        ],
    };
    assert!(p.topo_order().is_err());
}
