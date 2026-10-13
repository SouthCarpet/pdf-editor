//! Reparse points (junctions, symbolic links, mount points and cloud
//! placeholders such as OneDrive files on demand) for the code that deletes
//! user data or writes the update download (plan 119).
//!
//! Both callers never follow a reparse point: `std::fs::symlink_metadata`
//! reads the entry itself, not its target.
use std::fs::Metadata;
use std::io;
use std::path::Path;

/// `FILE_ATTRIBUTE_REPARSE_POINT` from the Windows SDK.
#[cfg(windows)]
const FILE_ATTRIBUTE_REPARSE_POINT: u32 = 0x400;

/// The entry is a reparse point of any kind.
pub fn is_reparse_point(meta: &Metadata) -> bool {
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        meta.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT != 0
    }
    #[cfg(not(windows))]
    {
        meta.file_type().is_symlink()
    }
}

/// `Ok` when `path` is a real folder: it exists, it is a directory and it is
/// not a reparse point.
pub fn require_real_dir(path: &Path) -> io::Result<()> {
    let meta = std::fs::symlink_metadata(path)?;
    if is_reparse_point(&meta) {
        return Err(io::Error::other(format!(
            "{} is a link (reparse point)",
            path.display()
        )));
    }
    if !meta.is_dir() {
        return Err(io::Error::other(format!(
            "{} is not a folder",
            path.display()
        )));
    }
    Ok(())
}
