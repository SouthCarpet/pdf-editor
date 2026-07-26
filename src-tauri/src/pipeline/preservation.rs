// Phase 14 Task 73 — Delta Y preservation contracts.
//
// Each `NodeKind` declares a `PreservationContract` describing which
// artifacts of the upstream document the node preserves on output and
// which artifacts it MAY strip (depending on its options). The
// pipeline executor runs a preflight pass over the topo-ordered graph
// and emits a warning for every edge `(from, to)` where:
//
//     bits = from.preservation.preserves & to.preservation.may_strip
//
// is non-empty. Those bits are artifacts the upstream might produce
// that the downstream will silently drop. The frontend pipeline editor
// reads the warnings off `PipelineRunReport` and draws caution icons
// on the matching edges.
//
// The matrix is sourced from the Delta Y preservation table in the
// implementation plan (see `## VAULT DELTAS / Y. Cross-tool coherence`).

use bitflags::bitflags;

bitflags! {
    /// Document-level artifacts tracked by Delta Y. Each NodeKind both
    /// `preserves` and (potentially) `may_strip` a subset of these.
    #[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
    pub struct Artifact: u32 {
        const TEXT_LAYER       = 1 << 0;
        const ANNOTATIONS      = 1 << 1;
        const FORM_FIELDS      = 1 << 2;
        const BOOKMARKS        = 1 << 3;
        const EMBEDDED_FONTS   = 1 << 4;
        const PDFA_COMPLIANCE  = 1 << 5;
        const LINEARIZATION    = 1 << 6;
    }
}

/// One preservation contract per `NodeKind`. `preserves` = artifacts the
/// node is GUARANTEED to keep when present on input. `may_strip` =
/// artifacts the node is permitted to remove depending on its options.
#[derive(Debug, Clone, Copy)]
pub struct PreservationContract {
    pub preserves: Artifact,
    pub may_strip: Artifact,
}

impl PreservationContract {
    pub const fn new(preserves: Artifact, may_strip: Artifact) -> Self {
        Self {
            preserves,
            may_strip,
        }
    }
}

impl crate::pipeline::dag::NodeKind {
    /// Delta Y preservation contract for this node variant. Per the matrix
    /// rules: pure structural ops preserve everything except linearization
    /// (which always needs a rebuild); compress/optimize have option-driven
    /// strip behavior; convert export and OCR are documented strippers.
    pub fn preservation(&self) -> PreservationContract {
        use crate::pipeline::dag::{NodeExportFormat, NodeKind};

        // Linearization is destroyed by ANY non-Optimize page-content
        // re-write, so it is included in `may_strip` for every modify
        // node unless that node is the dedicated Linearize step. We bake
        // this into the per-variant table below.
        match self {
            // ----- Modify nodes -----
            NodeKind::Compress { .. } => PreservationContract::new(
                Artifact::TEXT_LAYER
                    | Artifact::ANNOTATIONS
                    | Artifact::FORM_FIELDS
                    | Artifact::BOOKMARKS
                    | Artifact::EMBEDDED_FONTS,
                // GS Maximum may strip tagged content; Custom paths may
                // break PDF/A; linearization is rebuilt by GS internally
                // but the safe assumption is "no". Embedded fonts may be
                // re-subset.
                Artifact::PDFA_COMPLIANCE | Artifact::LINEARIZATION | Artifact::EMBEDDED_FONTS,
            ),
            NodeKind::Optimize {
                flatten_annotations,
                remove_form_data,
                strip_metadata,
                linearize,
                convert_pdfa,
                ..
            } => {
                let mut preserves = Artifact::TEXT_LAYER | Artifact::EMBEDDED_FONTS;
                let mut may_strip = Artifact::empty();

                if *flatten_annotations {
                    may_strip |= Artifact::ANNOTATIONS;
                } else {
                    preserves |= Artifact::ANNOTATIONS;
                }
                if *remove_form_data {
                    may_strip |= Artifact::FORM_FIELDS;
                } else {
                    preserves |= Artifact::FORM_FIELDS;
                }
                if *strip_metadata {
                    may_strip |= Artifact::BOOKMARKS;
                } else {
                    preserves |= Artifact::BOOKMARKS;
                }
                if *linearize {
                    preserves |= Artifact::LINEARIZATION;
                } else {
                    may_strip |= Artifact::LINEARIZATION;
                }
                if convert_pdfa.is_some() {
                    preserves |= Artifact::PDFA_COMPLIANCE;
                } else {
                    may_strip |= Artifact::PDFA_COMPLIANCE;
                }
                PreservationContract::new(preserves, may_strip)
            }
            NodeKind::Unlock { .. } => PreservationContract::new(
                // qpdf decrypt rebuilds the file but preserves every
                // logical artifact; encryption itself is gone by design.
                Artifact::TEXT_LAYER
                    | Artifact::ANNOTATIONS
                    | Artifact::FORM_FIELDS
                    | Artifact::BOOKMARKS
                    | Artifact::EMBEDDED_FONTS
                    | Artifact::PDFA_COMPLIANCE,
                Artifact::LINEARIZATION,
            ),
            NodeKind::Convert { format, .. } => match format {
                NodeExportFormat::Pdfa => PreservationContract::new(
                    Artifact::TEXT_LAYER
                        | Artifact::ANNOTATIONS
                        | Artifact::FORM_FIELDS
                        | Artifact::BOOKMARKS
                        | Artifact::EMBEDDED_FONTS
                        | Artifact::PDFA_COMPLIANCE,
                    Artifact::LINEARIZATION,
                ),
                // Raster + plain-text + office formats produce a non-PDF
                // file; all PDF artifacts are gone by definition.
                _ => PreservationContract::new(
                    Artifact::empty(),
                    Artifact::TEXT_LAYER
                        | Artifact::ANNOTATIONS
                        | Artifact::FORM_FIELDS
                        | Artifact::BOOKMARKS
                        | Artifact::EMBEDDED_FONTS
                        | Artifact::PDFA_COMPLIANCE
                        | Artifact::LINEARIZATION,
                ),
            },
            NodeKind::ConvertImport { .. } => PreservationContract::new(
                // Image / office -> PDF cannot preserve text/annot/form
                // artifacts from the input because the input is not a PDF.
                Artifact::empty(),
                Artifact::empty(),
            ),
            NodeKind::Merge {} => PreservationContract::new(
                Artifact::TEXT_LAYER
                    | Artifact::ANNOTATIONS
                    | Artifact::FORM_FIELDS
                    | Artifact::EMBEDDED_FONTS,
                // Merge concatenates outlines with prefix collisions and
                // breaks linearization; PDF/A only survives if every input
                // is PDF/A.
                Artifact::BOOKMARKS | Artifact::LINEARIZATION | Artifact::PDFA_COMPLIANCE,
            ),
            NodeKind::Split { .. } => PreservationContract::new(
                Artifact::TEXT_LAYER
                    | Artifact::ANNOTATIONS
                    | Artifact::FORM_FIELDS
                    | Artifact::EMBEDDED_FONTS
                    | Artifact::BOOKMARKS,
                Artifact::LINEARIZATION | Artifact::PDFA_COMPLIANCE,
            ),
            NodeKind::Extract { .. } => PreservationContract::new(
                Artifact::TEXT_LAYER
                    | Artifact::ANNOTATIONS
                    | Artifact::FORM_FIELDS
                    | Artifact::EMBEDDED_FONTS,
                Artifact::BOOKMARKS | Artifact::LINEARIZATION | Artifact::PDFA_COMPLIANCE,
            ),
            NodeKind::OrganizeRotate { .. }
            | NodeKind::OrganizeDelete { .. }
            | NodeKind::OrganizeReorder { .. }
            | NodeKind::OrganizeInsertBlank { .. } => PreservationContract::new(
                Artifact::TEXT_LAYER
                    | Artifact::ANNOTATIONS
                    | Artifact::FORM_FIELDS
                    | Artifact::BOOKMARKS
                    | Artifact::EMBEDDED_FONTS,
                Artifact::LINEARIZATION | Artifact::PDFA_COMPLIANCE,
            ),
            NodeKind::Crop { .. } => PreservationContract::new(
                Artifact::TEXT_LAYER
                    | Artifact::ANNOTATIONS
                    | Artifact::FORM_FIELDS
                    | Artifact::BOOKMARKS
                    | Artifact::EMBEDDED_FONTS,
                // Crop just rewrites /CropBox; PDF/A may break in the
                // MediaBox vs CropBox edge case.
                Artifact::LINEARIZATION | Artifact::PDFA_COMPLIANCE,
            ),
            NodeKind::Ocr { .. } => PreservationContract::new(
                // OCR adds an invisible text layer + Type0 font. It
                // preserves everything else but typically makes the doc
                // non-PDF/A conformant.
                Artifact::TEXT_LAYER
                    | Artifact::ANNOTATIONS
                    | Artifact::FORM_FIELDS
                    | Artifact::BOOKMARKS
                    | Artifact::EMBEDDED_FONTS,
                Artifact::PDFA_COMPLIANCE | Artifact::LINEARIZATION,
            ),
            NodeKind::Watermark { .. } => PreservationContract::new(
                Artifact::TEXT_LAYER
                    | Artifact::ANNOTATIONS
                    | Artifact::FORM_FIELDS
                    | Artifact::BOOKMARKS,
                Artifact::EMBEDDED_FONTS | Artifact::PDFA_COMPLIANCE | Artifact::LINEARIZATION,
            ),
            NodeKind::Save { .. } => PreservationContract::new(
                // A file copy preserves everything bit-for-bit.
                Artifact::TEXT_LAYER
                    | Artifact::ANNOTATIONS
                    | Artifact::FORM_FIELDS
                    | Artifact::BOOKMARKS
                    | Artifact::EMBEDDED_FONTS
                    | Artifact::PDFA_COMPLIANCE
                    | Artifact::LINEARIZATION,
                Artifact::empty(),
            ),
            NodeKind::OpenFile { .. } => PreservationContract::new(
                // Opening a file from disk is a pure read; nothing is
                // rewritten, so nothing is stripped.
                Artifact::TEXT_LAYER
                    | Artifact::ANNOTATIONS
                    | Artifact::FORM_FIELDS
                    | Artifact::BOOKMARKS
                    | Artifact::EMBEDDED_FONTS
                    | Artifact::PDFA_COMPLIANCE
                    | Artifact::LINEARIZATION,
                Artifact::empty(),
            ),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::pipeline::dag::{NodeCompressPreset, NodeExportFormat, NodeKind, NodeOcrOutputMode};

    fn optimize(
        flatten: bool,
        remove_form: bool,
        strip: bool,
        lin: bool,
        pdfa: Option<u8>,
    ) -> NodeKind {
        NodeKind::Optimize {
            linearize: lin,
            remove_unused: false,
            subset_fonts: false,
            subset_min_percent: 95,
            object_streams: false,
            object_streams_level: 9,
            strip_metadata: strip,
            strip_metadata_fields: Default::default(),
            flatten_annotations: flatten,
            flatten_include_forms: false,
            remove_form_data: remove_form,
            make_searchable_ocr: None,
            ocr_dpi: 300,
            convert_pdfa: pdfa,
            pdfa_engine: Default::default(),
        }
    }

    #[test]
    fn optimize_flatten_strips_annotations() {
        let n = optimize(true, false, false, false, None);
        assert!(n.preservation().may_strip.contains(Artifact::ANNOTATIONS));
        assert!(!n.preservation().preserves.contains(Artifact::ANNOTATIONS));
    }

    #[test]
    fn optimize_remove_form_strips_form_fields() {
        let n = optimize(false, true, false, false, None);
        assert!(n.preservation().may_strip.contains(Artifact::FORM_FIELDS));
        assert!(!n.preservation().preserves.contains(Artifact::FORM_FIELDS));
    }

    #[test]
    fn optimize_linearize_preserves_linearization() {
        let n = optimize(false, false, false, true, None);
        assert!(n.preservation().preserves.contains(Artifact::LINEARIZATION));
        assert!(!n.preservation().may_strip.contains(Artifact::LINEARIZATION));
    }

    #[test]
    fn optimize_pdfa_preserves_pdfa_compliance() {
        let n = optimize(false, false, false, false, Some(2));
        assert!(n
            .preservation()
            .preserves
            .contains(Artifact::PDFA_COMPLIANCE));
    }

    #[test]
    fn merge_strips_linearization() {
        let n = NodeKind::Merge {};
        assert!(n.preservation().may_strip.contains(Artifact::LINEARIZATION));
        // Annotations / forms / text layer survive Merge.
        assert!(n.preservation().preserves.contains(Artifact::ANNOTATIONS));
        assert!(n.preservation().preserves.contains(Artifact::FORM_FIELDS));
        assert!(n.preservation().preserves.contains(Artifact::TEXT_LAYER));
    }

    fn convert(format: NodeExportFormat) -> NodeKind {
        NodeKind::Convert {
            format,
            out_dir: None,
            raster_dpi: 150,
            raster_color_mode: Default::default(),
            jpeg_quality: 85,
            tiff_compression: Default::default(),
            page_range: "all".into(),
            txt_encoding: Default::default(),
            txt_layout: Default::default(),
            txt_page_separator: "\n".into(),
            html_single_file: true,
            html_embed_images_base64: false,
            office_preserve_formatting: true,
            office_embed_images: true,
            office_page_break: Default::default(),
            pdfa_version: 2,
            pdfa_engine: Default::default(),
            pdfa_embed_all_fonts: true,
        }
    }

    #[test]
    fn convert_raster_strips_everything_pdf() {
        let n = convert(NodeExportFormat::Png);
        let p = n.preservation();
        assert_eq!(p.preserves, Artifact::empty());
        assert!(p.may_strip.contains(Artifact::TEXT_LAYER));
        assert!(p.may_strip.contains(Artifact::ANNOTATIONS));
    }

    #[test]
    fn convert_pdfa_preserves_text_and_pdfa() {
        let n = convert(NodeExportFormat::Pdfa);
        let p = n.preservation();
        assert!(p.preserves.contains(Artifact::TEXT_LAYER));
        assert!(p.preserves.contains(Artifact::PDFA_COMPLIANCE));
    }

    #[test]
    fn save_preserves_everything() {
        let n = NodeKind::Save {
            dir: "/tmp".into(),
            name_template: "{stem}.pdf".into(),
        };
        let p = n.preservation();
        assert_eq!(p.may_strip, Artifact::empty());
        assert!(p.preserves.contains(Artifact::PDFA_COMPLIANCE));
    }

    #[test]
    fn ocr_strips_pdfa_compliance() {
        let n = NodeKind::Ocr {
            language: "eng".into(),
            dpi: 300,
            output: NodeOcrOutputMode::SearchablePdf,
            deskew: false,
            despeckle: false,
        };
        assert!(n
            .preservation()
            .may_strip
            .contains(Artifact::PDFA_COMPLIANCE));
        assert!(n.preservation().preserves.contains(Artifact::TEXT_LAYER));
    }

    #[test]
    fn open_file_preserves_everything() {
        let n = NodeKind::OpenFile {
            paths: vec!["C:\\docs\\a.pdf".into()],
        };
        let p = n.preservation();
        assert_eq!(p.may_strip, Artifact::empty());
        assert!(p.preserves.contains(Artifact::PDFA_COMPLIANCE));
        assert!(p.preserves.contains(Artifact::LINEARIZATION));
    }

    #[test]
    fn compress_preserves_text_and_annotations() {
        let n = NodeKind::Compress {
            preset: NodeCompressPreset::Recommended,
            custom_quality: None,
            custom_dpi: None,
            color_dpi: None,
            gray_dpi: None,
            mono_dpi: None,
            color_mode: Default::default(),
            filter: Default::default(),
            downsample: Default::default(),
            remove_exif: false,
        };
        let p = n.preservation();
        assert!(p.preserves.contains(Artifact::TEXT_LAYER));
        assert!(p.preserves.contains(Artifact::ANNOTATIONS));
    }
}
