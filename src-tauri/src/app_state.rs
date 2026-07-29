use sqlx::SqlitePool;
use std::sync::Arc;
use tokio::sync::OnceCell;

use crate::services::fonts::SystemFont;
#[cfg(windows)]
use crate::services::rapidocr::RapidOcrState;
use crate::sidecars::{
    ghostscript::GhostscriptWrapper, manager::SidecarManager, mupdf::MupdfWrapper,
    pdfcrack::PdfcrackWrapper, qpdf::QpdfWrapper, soffice::SofficeWrapper,
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
    #[cfg(windows)]
    pub rapidocr: RapidOcrState,
    pub pdfcrack: Arc<PdfcrackWrapper>,
    pub cancellation: CancellationRegistry,
    /// Delta U: lazily-populated cache of system fonts. First call to
    /// `list_fonts_cmd` enumerates via font-kit; subsequent calls return
    /// the cached list.
    pub fonts: Arc<OnceCell<Vec<SystemFont>>>,
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
            #[cfg(windows)]
            rapidocr: RapidOcrState::initialize(),
            pdfcrack: Arc::new(PdfcrackWrapper::new(mgr.clone())),
            sidecar_mgr: mgr,
            cancellation: CancellationRegistry::new(),
            fonts: Arc::new(OnceCell::new()),
        }
    }
}
