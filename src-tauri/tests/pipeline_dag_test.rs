use pdf_editor_lib::pipeline::dag::{
    NodeCompressColorMode, NodeCompressDownsample, NodeCompressFilter, NodeCompressPreset,
    NodeKind, NodePdfaEngine, Pipeline, PipelineEdge, PipelineNode, StripMetadataFieldsDto,
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
                    color_dpi: None,
                    gray_dpi: None,
                    mono_dpi: None,
                    color_mode: NodeCompressColorMode::default(),
                    filter: NodeCompressFilter::default(),
                    downsample: NodeCompressDownsample::default(),
                    remove_exif: false,
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
        subset_min_percent: 95,
        object_streams: false,
        object_streams_level: 9,
        strip_metadata: false,
        strip_metadata_fields: StripMetadataFieldsDto::default(),
        flatten_annotations: true,
        flatten_include_forms: false,
        remove_form_data: false,
        make_searchable_ocr: None,
        ocr_dpi: 300,
        convert_pdfa: None,
        pdfa_engine: NodePdfaEngine::default(),
    };
    assert!(n.preservation().may_strip.contains(Artifact::ANNOTATIONS));
}

#[test]
fn merge_does_not_strip_form_fields() {
    let n = NodeKind::Merge {};
    assert!(n.preservation().preserves.contains(Artifact::FORM_FIELDS));
    assert!(!n.preservation().may_strip.contains(Artifact::FORM_FIELDS));
}

#[test]
fn open_file_node_orders_before_downstream_steps() {
    // The "Open file" step (Slovak: "otvorit subor") is an input-category
    // node like Merge/ConvertImport: it can sit first in the chain and
    // still topo-sorts like any other node.
    let p = Pipeline {
        nodes: vec![
            PipelineNode {
                id: "open".into(),
                kind: NodeKind::OpenFile {
                    paths: vec!["C:\\docs\\a.pdf".into()],
                },
            },
            PipelineNode {
                id: "save".into(),
                kind: NodeKind::Save {
                    dir: "/tmp".into(),
                    name_template: "{stem}.pdf".into(),
                },
            },
        ],
        edges: vec![PipelineEdge {
            from: "open".into(),
            to: "save".into(),
        }],
    };
    let order = p.topo_order().unwrap();
    assert_eq!(order, vec!["open", "save"]);
}

#[test]
fn open_file_node_rejects_incoming_edges() {
    let p = Pipeline {
        nodes: vec![
            PipelineNode {
                id: "merge".into(),
                kind: NodeKind::Merge {},
            },
            PipelineNode {
                id: "open".into(),
                kind: NodeKind::OpenFile {
                    paths: vec!["C:\\docs\\a.pdf".into()],
                },
            },
        ],
        edges: vec![PipelineEdge {
            from: "merge".into(),
            to: "open".into(),
        }],
    };

    assert!(p.validate().is_err());
}

#[test]
fn topo_order_is_deterministic_across_multiple_roots() {
    // topo_order used to seed Kahn's queue from a std HashMap, whose iteration
    // order is randomised per process. With more than one root the execution
    // order changed between runs, and because OpenFile REPLACES the working
    // set, the same graph could save compressed output on one run and the
    // untouched originals on the next. Build a graph with three independent
    // roots and assert the order follows the node list every time.
    let p = Pipeline {
        nodes: vec![
            PipelineNode {
                id: "root_a".into(),
                kind: NodeKind::Merge {},
            },
            PipelineNode {
                id: "root_b".into(),
                kind: NodeKind::Merge {},
            },
            PipelineNode {
                id: "root_c".into(),
                kind: NodeKind::Merge {},
            },
        ],
        edges: vec![],
    };

    let first = p.topo_order().unwrap();
    assert_eq!(first, vec!["root_a", "root_b", "root_c"]);
    for _ in 0..50 {
        assert_eq!(p.topo_order().unwrap(), first);
    }
}

#[test]
fn unconnected_open_file_node_fails_loudly() {
    // An OpenFile node that feeds nothing leaves it to topological position
    // whether the run uses the picked files or the ambient inputs, which the
    // user never chose. It must fail rather than silently save the originals
    // and report success.
    let p = Pipeline {
        nodes: vec![
            PipelineNode {
                id: "open".into(),
                kind: NodeKind::OpenFile {
                    paths: vec!["C:\\docs\\a.pdf".into()],
                },
            },
            PipelineNode {
                id: "save".into(),
                kind: NodeKind::Save {
                    dir: "/tmp".into(),
                    name_template: "{stem}.pdf".into(),
                },
            },
        ],
        edges: vec![],
    };

    let err = p.validate().unwrap_err().to_string();
    assert!(
        err.contains("not connected"),
        "expected an unconnected-source error, got: {err}"
    );

    // Wiring it up makes the same graph valid.
    let wired = Pipeline {
        edges: vec![PipelineEdge {
            from: "open".into(),
            to: "save".into(),
        }],
        ..p
    };
    assert!(wired.validate().is_ok());
}

#[test]
fn open_file_preserves_everything() {
    let n = NodeKind::OpenFile {
        paths: vec!["C:\\docs\\a.pdf".into()],
    };
    assert!(n.preservation().preserves.contains(Artifact::FORM_FIELDS));
    assert!(n
        .preservation()
        .preserves
        .contains(Artifact::PDFA_COMPLIANCE));
    assert!(n.preservation().may_strip.is_empty());
}
