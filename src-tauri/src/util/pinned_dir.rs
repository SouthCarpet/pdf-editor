//! Pinned folders: open, check on the handle, act through the same handle
//! (plan 119, fix round p3d). Used by the uninstall cleanup
//! (`util/uninstall_data.rs`) and the update download
//! (`services/update_install.rs`); every Windows call of those two lives
//! here.
//!
//! A `PinnedDir` is an open folder handle (`CreateFileW` through
//! `std::fs::OpenOptions`, `FILE_FLAG_BACKUP_SEMANTICS |
//! FILE_FLAG_OPEN_REPARSE_POINT`, share mode read and write, never
//! `FILE_SHARE_DELETE`). While it is open, Windows refuses to rename that
//! folder, and NTFS also refuses to rename a folder above it (both
//! tested). Each check reads the handle, never the path again:
//! `GetFileInformationByHandleEx(FileAttributeTagInfo)` says folder or file
//! and reparse point or not, `GetFinalPathNameByHandleW` gives the real
//! path, which must equal the expected one. A reparse point (junction,
//! symbolic link, mount point, cloud placeholder) is never followed.
use std::ffi::{c_void, OsStr, OsString};
use std::fs::File;
use std::io;
use std::os::windows::ffi::{OsStrExt, OsStringExt};
use std::os::windows::fs::OpenOptionsExt;
use std::os::windows::io::AsRawHandle;
use std::path::{Path, PathBuf};
use windows::Win32::Foundation::{ERROR_NO_MORE_FILES, HANDLE};
use windows::Win32::Storage::FileSystem::{
    FileAttributeTagInfo, FileDispositionInfo, FileDispositionInfoEx, FileFullDirectoryInfo,
    FileFullDirectoryRestartInfo, FileRenameInfo, GetFileInformationByHandleEx,
    GetFinalPathNameByHandleW, SetFileInformationByHandle, DELETE, FILE_ATTRIBUTE_DIRECTORY,
    FILE_ATTRIBUTE_REPARSE_POINT, FILE_ATTRIBUTE_TAG_INFO, FILE_DISPOSITION_FLAG_DELETE,
    FILE_DISPOSITION_FLAG_IGNORE_READONLY_ATTRIBUTE, FILE_DISPOSITION_FLAG_POSIX_SEMANTICS,
    FILE_DISPOSITION_INFO, FILE_DISPOSITION_INFO_EX, FILE_DISPOSITION_INFO_EX_FLAGS,
    FILE_FLAG_BACKUP_SEMANTICS, FILE_FLAG_OPEN_REPARSE_POINT, FILE_FULL_DIR_INFO,
    FILE_GENERIC_WRITE, FILE_INFO_BY_HANDLE_CLASS, FILE_LIST_DIRECTORY, FILE_NAME_NORMALIZED,
    FILE_READ_ATTRIBUTES, FILE_RENAME_INFO, FILE_SHARE_DELETE, FILE_SHARE_READ, FILE_SHARE_WRITE,
    SYNCHRONIZE,
};

/// Why a handle was not used.
#[derive(Debug)]
pub enum Refused {
    /// The entry is a reparse point.
    Link,
    /// A file where a folder was expected, or the reverse.
    WrongKind,
    /// The real path of the handle is not the expected path.
    Moved(PathBuf),
    Io(io::Error),
}

impl Refused {
    pub fn is_missing(&self) -> bool {
        matches!(self, Refused::Io(e) if e.kind() == io::ErrorKind::NotFound)
    }
}

impl std::fmt::Display for Refused {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Refused::Link => f.write_str("is a link (reparse point)"),
            Refused::WrongKind => f.write_str("is not the expected kind (file or folder)"),
            Refused::Moved(real) => write!(f, "leads to {}", real.display()),
            Refused::Io(e) => e.fmt(f),
        }
    }
}

impl From<io::Error> for Refused {
    fn from(e: io::Error) -> Self {
        Refused::Io(e)
    }
}

impl From<Refused> for io::Error {
    fn from(refused: Refused) -> Self {
        match refused {
            Refused::Io(e) => e,
            other => io::Error::other(other.to_string()),
        }
    }
}

/// A Win32 error from the `windows` crate as an `io::Error` with its kind.
fn os_error(e: windows::core::Error) -> io::Error {
    let code = e.code().0 as u32;
    if code & 0xFFFF_0000 == 0x8007_0000 {
        io::Error::from_raw_os_error((code & 0xFFFF) as i32)
    } else {
        io::Error::other(e)
    }
}

fn handle(file: &File) -> HANDLE {
    HANDLE(file.as_raw_handle())
}

/// Folder access of a pin (`child` adds `DELETE`, so the owner can remove
/// the empty folder through the pin). The share mode of every pin leaves
/// out `FILE_SHARE_DELETE`, so no other opener can rename the folder.
const DIR_ACCESS: u32 = FILE_LIST_DIRECTORY.0 | FILE_READ_ATTRIBUTES.0 | SYNCHRONIZE.0;
const PIN_SHARE: u32 = FILE_SHARE_READ.0 | FILE_SHARE_WRITE.0;

fn open_dir(path: &Path, access: u32, flags: u32) -> io::Result<File> {
    std::fs::OpenOptions::new()
        .access_mode(access)
        .share_mode(PIN_SHARE)
        .custom_flags(FILE_FLAG_BACKUP_SEMANTICS.0 | flags)
        .open(path)
}

fn attributes(file: &File) -> io::Result<u32> {
    let mut info = FILE_ATTRIBUTE_TAG_INFO::default();
    // SAFETY: `info` is a writable FILE_ATTRIBUTE_TAG_INFO of the given size.
    unsafe {
        GetFileInformationByHandleEx(
            handle(file),
            FileAttributeTagInfo,
            (&mut info as *mut FILE_ATTRIBUTE_TAG_INFO).cast(),
            std::mem::size_of::<FILE_ATTRIBUTE_TAG_INFO>() as u32,
        )
    }
    .map_err(os_error)?;
    Ok(info.FileAttributes)
}

/// The real path of the handle, `\\?\C:\...`, long names.
fn final_path(file: &File) -> io::Result<PathBuf> {
    let mut buf = vec![0u16; 512];
    loop {
        // SAFETY: `buf` is a writable buffer; the call writes at most its length.
        let len = unsafe { GetFinalPathNameByHandleW(handle(file), &mut buf, FILE_NAME_NORMALIZED) }
            as usize;
        if len == 0 {
            return Err(io::Error::last_os_error());
        }
        if len < buf.len() {
            buf.truncate(len);
            return Ok(PathBuf::from(OsString::from_wide(&buf)));
        }
        buf.resize(len, 0);
    }
}

/// NTFS compares names without case.
fn same_path(a: &Path, b: &Path) -> bool {
    a.to_string_lossy().to_lowercase() == b.to_string_lossy().to_lowercase()
}

/// Checks the open handle: not a reparse point, a folder when `want_dir`
/// (a file otherwise), real path `expected`. Returns the real path.
fn check(file: &File, expected: &Path, want_dir: bool) -> Result<PathBuf, Refused> {
    let attrs = attributes(file)?;
    if attrs & FILE_ATTRIBUTE_REPARSE_POINT.0 != 0 {
        return Err(Refused::Link);
    }
    if (attrs & FILE_ATTRIBUTE_DIRECTORY.0 != 0) != want_dir {
        return Err(Refused::WrongKind);
    }
    let real = final_path(file)?;
    if !same_path(&real, expected) {
        return Err(Refused::Moved(real));
    }
    Ok(real)
}

/// Marks the handle's file or empty folder for deletion when the handle
/// closes. POSIX semantics take the name away at once; a read-only file
/// goes too. Older Windows and other file systems use the plain form, which
/// refuses a read-only file. A folder that is not empty is refused.
pub fn delete_on_close(file: &File) -> io::Result<()> {
    let flags = FILE_DISPOSITION_FLAG_DELETE.0
        | FILE_DISPOSITION_FLAG_POSIX_SEMANTICS.0
        | FILE_DISPOSITION_FLAG_IGNORE_READONLY_ATTRIBUTE.0;
    let ex = FILE_DISPOSITION_INFO_EX {
        Flags: FILE_DISPOSITION_INFO_EX_FLAGS(flags),
    };
    match set_info(file, FileDispositionInfoEx, &ex) {
        Err(e) if matches!(e.raw_os_error(), Some(1 | 50 | 87)) => set_info(
            file,
            FileDispositionInfo,
            &FILE_DISPOSITION_INFO { DeleteFile: true },
        ),
        other => other,
    }
}

fn set_info<T>(file: &File, class: FILE_INFO_BY_HANDLE_CLASS, info: &T) -> io::Result<()> {
    // SAFETY: `info` is a readable `T` of the given size, the type `class` names.
    unsafe {
        SetFileInformationByHandle(
            handle(file),
            class,
            (info as *const T).cast(),
            std::mem::size_of::<T>() as u32,
        )
    }
    .map_err(os_error)
}

/// One entry of a pinned folder as the folder handle lists it.
#[derive(Debug, Clone)]
pub struct Entry {
    pub name: OsString,
    pub is_dir: bool,
    pub is_link: bool,
}

/// Appends the entries of one `FILE_FULL_DIR_INFO` chain, without `.`
/// and `..`.
fn parse_entries(buf: &[u64], out: &mut Vec<Entry>) {
    let start = buf.as_ptr().cast::<u8>();
    let mut offset = 0usize;
    loop {
        // SAFETY: the system wrote a chain of FILE_FULL_DIR_INFO records into
        // `buf`; `offset` follows its `NextEntryOffset` links.
        let (next, attrs, name) = unsafe {
            let info = start.add(offset).cast::<FILE_FULL_DIR_INFO>();
            let len = (*info).FileNameLength as usize / 2;
            let name_ptr = std::ptr::addr_of!((*info).FileName).cast::<u16>();
            let name = std::slice::from_raw_parts(name_ptr, len);
            (
                (*info).NextEntryOffset,
                (*info).FileAttributes,
                OsString::from_wide(name),
            )
        };
        if name != "." && name != ".." {
            out.push(Entry {
                name,
                is_dir: attrs & FILE_ATTRIBUTE_DIRECTORY.0 != 0,
                is_link: attrs & FILE_ATTRIBUTE_REPARSE_POINT.0 != 0,
            });
        }
        if next == 0 {
            return;
        }
        offset += next as usize;
    }
}

/// An open, checked folder handle. Dropping it closes the handle.
#[derive(Debug)]
pub struct PinnedDir {
    file: File,
    /// Real path from the handle (`\\?\C:\...`).
    path: PathBuf,
}

impl PinnedDir {
    /// Pins a base folder as Windows gives it (`%APPDATA%`, `%TEMP%`). A
    /// link at the base itself is followed: the pin holds its target.
    pub fn base(path: &Path) -> io::Result<Self> {
        let file = open_dir(path, DIR_ACCESS, 0)?;
        if attributes(&file)? & FILE_ATTRIBUTE_DIRECTORY.0 == 0 {
            return Err(io::Error::other(format!(
                "{} is not a folder",
                path.display()
            )));
        }
        let path = final_path(&file)?;
        Ok(Self { file, path })
    }

    /// The real path from the handle.
    pub fn path(&self) -> &Path {
        &self.path
    }

    /// Pins the subfolder `name` with `DELETE` access, so `remove_if_empty`
    /// works. Refuses a reparse point, a file and a real path that is not
    /// `<this folder>\name`.
    pub fn child(&self, name: &OsStr) -> Result<PinnedDir, Refused> {
        self.open_child(name, DIR_ACCESS | DELETE.0)
    }

    fn open_child(&self, name: &OsStr, access: u32) -> Result<PinnedDir, Refused> {
        let expected = self.path.join(name);
        let file = open_dir(&expected, access, FILE_FLAG_OPEN_REPARSE_POINT.0)?;
        let path = check(&file, &expected, true)?;
        Ok(PinnedDir { file, path })
    }

    /// Creates the new subfolder `name` and pins it without `DELETE`
    /// access: Windows refuses a rename into a folder that another handle
    /// holds with `DELETE` access, so `rename_into` needs this form. Fails
    /// with `AlreadyExists` when anything has the name.
    pub fn create_dir(&self, name: &OsStr) -> io::Result<PinnedDir> {
        std::fs::create_dir(self.path.join(name))?;
        Ok(self.open_child(name, DIR_ACCESS)?)
    }

    /// Renames `file`, an open file, through its handle to `new_name` in
    /// this folder, without replacement: when anything has that name (file,
    /// link, folder), Windows refuses with `AlreadyExists`. `file` needs
    /// `DELETE` access. The new name is this folder's real path from its
    /// handle plus `new_name`; the pin keeps that path on this folder.
    /// (`SetFileInformationByHandle` reads a plain name relative to the
    /// current directory and refuses a root folder handle, both tested.)
    pub fn rename_into(&self, file: &File, new_name: &OsStr) -> io::Result<()> {
        let name: Vec<u16> = self.path.join(new_name).as_os_str().encode_wide().collect();
        let bytes = std::mem::size_of::<FILE_RENAME_INFO>() + name.len() * 2;
        // Zeroed: `ReplaceIfExists` is false and there is no root folder.
        let mut buf = vec![0u64; bytes.div_ceil(8)];
        let info = buf.as_mut_ptr().cast::<FILE_RENAME_INFO>();
        // SAFETY: `buf` holds `bytes` bytes, 8-aligned, enough for the
        // header and the name; the name is copied behind `FileName`.
        unsafe {
            (*info).FileNameLength = (name.len() * 2) as u32;
            let dst = std::ptr::addr_of_mut!((*info).FileName).cast::<u16>();
            std::ptr::copy_nonoverlapping(name.as_ptr(), dst, name.len());
            SetFileInformationByHandle(
                handle(file),
                FileRenameInfo,
                info.cast::<c_void>(),
                bytes as u32,
            )
        }
        .map_err(os_error)
    }

    /// The entries as the handle lists them
    /// (`GetFileInformationByHandleEx(FileFullDirectoryInfo)`).
    pub fn entries(&self) -> io::Result<Vec<Entry>> {
        let mut buf = vec![0u64; 8192];
        let mut class = FileFullDirectoryRestartInfo;
        let mut out = Vec::new();
        loop {
            // SAFETY: `buf` is writable and its size is given in bytes.
            let listed = unsafe {
                GetFileInformationByHandleEx(
                    handle(&self.file),
                    class,
                    buf.as_mut_ptr().cast(),
                    (buf.len() * 8) as u32,
                )
            };
            match listed.map_err(os_error) {
                Ok(()) => parse_entries(&buf, &mut out),
                Err(e) if e.raw_os_error() == Some(ERROR_NO_MORE_FILES.0 as i32) => return Ok(out),
                Err(e) => return Err(e),
            }
            class = FileFullDirectoryInfo;
        }
    }

    /// Deletes the file `name` through its own handle (`DELETE`,
    /// `FILE_FLAG_OPEN_REPARSE_POINT`). Refuses, and keeps, a reparse point
    /// and a folder; a link is never followed and never deleted.
    pub fn delete_file(&self, name: &OsStr) -> Result<(), Refused> {
        let expected = self.path.join(name);
        let file = std::fs::OpenOptions::new()
            .access_mode(DELETE.0 | FILE_READ_ATTRIBUTES.0 | SYNCHRONIZE.0)
            .share_mode(PIN_SHARE | FILE_SHARE_DELETE.0)
            .custom_flags(FILE_FLAG_BACKUP_SEMANTICS.0 | FILE_FLAG_OPEN_REPARSE_POINT.0)
            .open(&expected)?;
        check(&file, &expected, false)?;
        Ok(delete_on_close(&file)?)
    }

    /// Creates the new file `name` (create-new, never follows a link) and
    /// returns it open for writing, renaming and deleting.
    pub fn create_file(&self, name: &OsStr) -> io::Result<File> {
        let expected = self.path.join(name);
        let file = std::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .access_mode(FILE_GENERIC_WRITE.0 | DELETE.0 | FILE_READ_ATTRIBUTES.0)
            .share_mode(FILE_SHARE_READ.0)
            .custom_flags(FILE_FLAG_OPEN_REPARSE_POINT.0)
            .open(&expected)?;
        if let Err(refused) = check(&file, &expected, false) {
            let _ = delete_on_close(&file);
            return Err(refused.into());
        }
        Ok(file)
    }

    /// Removes the folder through the pin when it is empty. `Err` (and the
    /// pin stays) when it still holds anything.
    pub fn remove_if_empty(&self) -> io::Result<()> {
        delete_on_close(&self.file)
    }
}
