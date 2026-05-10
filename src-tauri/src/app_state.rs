use sqlx::SqlitePool;
use std::sync::Arc;

use crate::sidecars::{
    ghostscript::GhostscriptWrapper,
    manager::SidecarManager,
    mupdf::MupdfWrapper,
    pdfcrack::PdfcrackWrapper,
    qpdf::QpdfWrapper,
    soffice::SofficeWrapper,
    tesseract::TesseractWrapper,
};
use crate::util::cancellation::CancellationRegistry;

#[derive(Clone)]
pub struct AppState {
    pub pool: SqlitePool,
    pub sidecar_mgr: SidecarManager,
    pub qpdf: Arc<QpdfWrapper>,
    pub gs: Arc<GhostscriptWrapper>,
    pub mupdf: Arc<MupdfWrapper>,
    pub soffice: Arc<SofficeWrapper>,
    pub tesseract: Arc<TesseractWrapper>,
    pub pdfcrack: Arc<PdfcrackWrapper>,
    pub cancellation: CancellationRegistry,
}

impl AppState {
    pub fn new(pool: SqlitePool) -> Self {
        let mgr = SidecarManager::new(num_cpus::get().min(4));
        Self {
            pool,
            qpdf: Arc::new(QpdfWrapper::new(mgr.clone())),
            gs: Arc::new(GhostscriptWrapper::new(mgr.clone())),
            mupdf: Arc::new(MupdfWrapper::new(mgr.clone())),
            soffice: Arc::new(SofficeWrapper::new(mgr.clone())),
            tesseract: Arc::new(TesseractWrapper::new(mgr.clone())),
            pdfcrack: Arc::new(PdfcrackWrapper::new(mgr.clone())),
            sidecar_mgr: mgr,
            cancellation: CancellationRegistry::new(),
        }
    }
}
