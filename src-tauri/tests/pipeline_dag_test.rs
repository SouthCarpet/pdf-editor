use pdf_editor_lib::pipeline::dag::{
    NodeCompressPreset, NodeKind, Pipeline, PipelineEdge, PipelineNode,
};
use pdf_editor_lib::pipeline::preservation::Artifact;

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

#[test]
fn optimize_flatten_strips_annotations() {
    // Delta Y: an Optimize node configured with flatten_annotations=true
    // must declare it `may_strip` ANNOTATIONS so the pipeline editor can
    // warn the user when this node sits downstream of an Annotate step.
    let n = NodeKind::Optimize {
        linearize: false,
        remove_unused: false,
        subset_fonts: false,
        object_streams: false,
        strip_metadata: false,
        flatten_annotations: true,
        remove_form_data: false,
        make_searchable_ocr: None,
        convert_pdfa: None,
    };
    assert!(n.preservation().may_strip.contains(Artifact::ANNOTATIONS));
}

#[test]
fn merge_does_not_strip_form_fields() {
    let n = NodeKind::Merge {};
    assert!(n.preservation().preserves.contains(Artifact::FORM_FIELDS));
    assert!(!n.preservation().may_strip.contains(Artifact::FORM_FIELDS));
}
