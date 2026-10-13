//! Download, verify and start an update setup (plan 119, survey task 4).
//!
//! Runs only after the user clicks **Update** in Settings -> About, and only
//! with the stored consent `update_check_enabled` on. Steps:
//!
//! 1. Ask GitHub for the latest release again; its tag must still be the tag
//!    the check showed.
//! 2. Find the assets `pdf-editor-setup-X.Y.Z.exe` (exact name) and
//!    `SHA256SUMS.txt`. The setup's `size` must be at most `MAX_SETUP_BYTES`.
//! 3. Download `SHA256SUMS.txt` and take the line for that exact file name.
//! 4. Create a new folder `%TEMP%\pdf-editor-update-<random>\` for this
//!    download (never an existing one; it must be a real folder, not a link)
//!    and stream the setup to a new `.part` file in it, hashing as it goes.
//!    The `.part` file must not exist yet and a link is never followed. More
//!    bytes than `size`, fewer bytes, a transport error, a write error or a
//!    hash mismatch delete the file and the folder. The rename to the final
//!    name refuses when anything (also a link) already has that name.
//! 5. Before the start, hash the file again: a changed file never runs.
//!
//! Every URL, also every redirect target, must be `https://` on a host in
//! `ALLOWED_HOSTS`. The HTTP client lives in `release_check.rs` (the only
//! module allowed to use it); this module sees only the `Download` trait.
use crate::services::release_check::{self, ReleaseAsset, StableRelease};
use crate::util::reparse;
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::future::Future;
use std::io::{self, Write};
use std::path::{Path, PathBuf};

pub const SUMS_ASSET: &str = "SHA256SUMS.txt";
pub const ALLOWED_HOSTS: [&str; 4] = [
    "api.github.com",
    "github.com",
    "objects.githubusercontent.com",
    "release-assets.githubusercontent.com",
];
/// Hard cap for the setup, whatever the release metadata says. The 0.1.0
/// setup is about 141 MiB.
pub const MAX_SETUP_BYTES: u64 = 512 * 1024 * 1024;
const MAX_SUMS_BYTES: u64 = 64 * 1024;
/// A GitHub asset redirects once (github.com -> release-assets host).
const MAX_REDIRECTS: usize = 5;
/// Each download gets `<base>\pdf-editor-update-<32 random hex digits>`.
pub const DOWNLOAD_DIR_PREFIX: &str = "pdf-editor-update-";
/// `FILE_FLAG_OPEN_REPARSE_POINT` from the Windows SDK.
#[cfg(windows)]
const FILE_FLAG_OPEN_REPARSE_POINT: u32 = 0x0020_0000;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, specta::Type)]
#[serde(rename_all = "snake_case")]
pub enum UpdateInstallStatus {
    /// The setup is downloaded and verified; `install_update` can start it.
    Ready,
    /// The setup started; the app exits now.
    Started,
    /// The stored consent is off. No request was made.
    Disabled,
    /// The latest release is no longer the one the check showed.
    ReleaseChanged,
    /// The release has no `pdf-editor-setup-X.Y.Z.exe` or no
    /// `SHA256SUMS.txt`, or nothing was downloaded yet.
    NoSetup,
    /// The setup is larger than its metadata or than `MAX_SETUP_BYTES`.
    TooLarge,
    /// A URL or redirect leaves `https://` on `ALLOWED_HOSTS`.
    BlockedHost,
    /// Connection error, HTTP error or an incomplete download.
    DownloadFailed,
    /// `SHA256SUMS.txt` has no line for the setup's file name.
    ChecksumMissing,
    /// The downloaded setup does not match its SHA-256 line.
    ChecksumMismatch,
    /// The setup could not be written (for example, the disk is full).
    DiskError,
    /// The setup file changed after the download check.
    FileChanged,
    /// Windows could not start the setup.
    StartFailed,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, specta::Type)]
pub struct UpdateInstall {
    pub status: UpdateInstallStatus,
    /// The release version (`X.Y.Z`), when known.
    pub version: Option<String>,
    /// Error text for the failure statuses.
    pub detail: Option<String>,
}

/// A setup file that passed the SHA-256 check.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct VerifiedSetup {
    pub path: PathBuf,
    pub sha256: String,
    pub version: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Failure {
    pub status: UpdateInstallStatus,
    pub detail: String,
}

fn fail(status: UpdateInstallStatus, detail: impl Into<String>) -> Failure {
    Failure {
        status,
        detail: detail.into(),
    }
}

impl UpdateInstall {
    pub fn ready(setup: &VerifiedSetup) -> Self {
        Self {
            status: UpdateInstallStatus::Ready,
            version: Some(setup.version.clone()),
            detail: None,
        }
    }

    pub fn started(setup: &VerifiedSetup) -> Self {
        Self {
            status: UpdateInstallStatus::Started,
            ..Self::ready(setup)
        }
    }

    pub fn failed(failure: Failure) -> Self {
        Self {
            status: failure.status,
            version: None,
            detail: Some(failure.detail),
        }
    }
}

/// One HTTP response: status, `Location` header and a body read in chunks.
pub struct Hop<B> {
    pub status: u16,
    pub location: Option<String>,
    pub body: B,
}

pub trait BodyStream: Send {
    /// The next chunk, `None` at the end, `Err` when the transfer broke.
    fn next_chunk(&mut self) -> impl Future<Output = Result<Option<Vec<u8>>, String>> + Send;
}

/// One GET without following redirects. The real one is
/// `release_check::HttpDownload`; tests use a fake.
pub trait Download: Sync {
    type Body: BodyStream;
    fn get(&self, url: &str) -> impl Future<Output = Result<Hop<Self::Body>, String>> + Send;
}

/// `pdf-editor-setup-X.Y.Z.exe`, the only setup name the updater accepts.
pub fn setup_asset_name(release: &StableRelease) -> String {
    let (major, minor, patch) = release.version;
    format!("pdf-editor-setup-{major}.{minor}.{patch}.exe")
}

/// `https://` and a host from `ALLOWED_HOSTS`, no user info, no port.
pub fn is_allowed_url(url: &str) -> bool {
    let Some(rest) = url.strip_prefix("https://") else {
        return false;
    };
    let host = rest.split(['/', '?', '#']).next().unwrap_or_default();
    ALLOWED_HOSTS
        .iter()
        .any(|allowed| host.eq_ignore_ascii_case(allowed))
}

/// The lower-case SHA-256 that `sums` lists for exactly `file_name`
/// (`<hash>  <name>`, optional `*` before the name).
pub fn checksum_for(sums: &str, file_name: &str) -> Option<String> {
    sums.lines().find_map(|line| {
        let mut parts = line.split_whitespace();
        let hash = parts.next()?;
        let name = parts.next()?.trim_start_matches('*');
        let valid = hash.len() == 64 && hash.chars().all(|c| c.is_ascii_hexdigit());
        (valid && name == file_name && parts.next().is_none()).then(|| hash.to_ascii_lowercase())
    })
}

fn sha256_hex(hasher: Sha256) -> String {
    format!("{:x}", hasher.finalize())
}

/// Follows redirects inside the allowed hosts and returns the final body.
async fn open<D: Download>(transport: &D, url: &str) -> Result<D::Body, Failure> {
    let mut current = url.to_owned();
    for _ in 0..=MAX_REDIRECTS {
        if !is_allowed_url(&current) {
            return Err(fail(
                UpdateInstallStatus::BlockedHost,
                format!("not an allowed download address: {current}"),
            ));
        }
        let hop = transport
            .get(&current)
            .await
            .map_err(|e| fail(UpdateInstallStatus::DownloadFailed, e))?;
        match hop.status {
            200..=299 => return Ok(hop.body),
            300..=399 => {
                current = hop.location.ok_or_else(|| {
                    fail(
                        UpdateInstallStatus::DownloadFailed,
                        "redirect without a Location",
                    )
                })?;
            }
            status => {
                return Err(fail(
                    UpdateInstallStatus::DownloadFailed,
                    format!("HTTP {status} for {current}"),
                ))
            }
        }
    }
    Err(fail(
        UpdateInstallStatus::DownloadFailed,
        format!("more than {MAX_REDIRECTS} redirects"),
    ))
}

/// Reads a small body into memory, at most `limit` bytes.
async fn read_small<B: BodyStream>(body: &mut B, limit: u64) -> Result<Vec<u8>, Failure> {
    let mut bytes = Vec::new();
    while let Some(chunk) = next_chunk(body).await? {
        bytes.extend_from_slice(&chunk);
        if bytes.len() as u64 > limit {
            return Err(fail(
                UpdateInstallStatus::TooLarge,
                format!("{SUMS_ASSET} is larger than {limit} bytes"),
            ));
        }
    }
    Ok(bytes)
}

async fn next_chunk<B: BodyStream>(body: &mut B) -> Result<Option<Vec<u8>>, Failure> {
    body.next_chunk().await.map_err(|e| {
        fail(
            UpdateInstallStatus::DownloadFailed,
            format!("download interrupted: {e}"),
        )
    })
}

/// Streams `body` into `sink`, hashing it. Fails with `TooLarge` past
/// `size` bytes and with `DownloadFailed` when fewer bytes arrive.
async fn stream_to<B: BodyStream, W: Write>(
    body: &mut B,
    sink: &mut W,
    size: u64,
) -> Result<String, Failure> {
    let disk = |e: std::io::Error| fail(UpdateInstallStatus::DiskError, e.to_string());
    let mut hasher = Sha256::new();
    let mut received = 0u64;
    while let Some(chunk) = next_chunk(body).await? {
        received += chunk.len() as u64;
        if received > size {
            return Err(fail(
                UpdateInstallStatus::TooLarge,
                format!("the setup sent more than the {size} bytes the release lists"),
            ));
        }
        hasher.update(&chunk);
        sink.write_all(&chunk).map_err(disk)?;
    }
    sink.flush().map_err(disk)?;
    if received != size {
        return Err(fail(
            UpdateInstallStatus::DownloadFailed,
            format!("download incomplete: {received} of {size} bytes"),
        ));
    }
    Ok(sha256_hex(hasher))
}

fn find_asset<'a>(release: &'a StableRelease, name: &str) -> Result<&'a ReleaseAsset, Failure> {
    release
        .assets
        .iter()
        .find(|asset| asset.name == name)
        .ok_or_else(|| {
            fail(
                UpdateInstallStatus::NoSetup,
                format!("release {} has no {name}", release.tag),
            )
        })
}

/// Step 1: the latest release, which must still carry `expected_tag`.
async fn fetch_release<F, Fut>(expected_tag: &str, fetch_json: F) -> Result<StableRelease, Failure>
where
    F: FnOnce(String) -> Fut,
    Fut: Future<Output = Result<(u16, Vec<u8>), String>>,
{
    let (status, body) = fetch_json(release_check::RELEASES_URL.to_owned())
        .await
        .map_err(|e| fail(UpdateInstallStatus::DownloadFailed, e))?;
    let release = release_check::parse_stable_release(status, &body)
        .map_err(|e| fail(UpdateInstallStatus::DownloadFailed, e))?;
    if release.tag != expected_tag {
        return Err(fail(
            UpdateInstallStatus::ReleaseChanged,
            format!(
                "the latest release is now {}, not {expected_tag}",
                release.tag
            ),
        ));
    }
    Ok(release)
}

/// Steps 2 and 3: the setup asset and its SHA-256 line.
async fn expected_setup<'a, D: Download>(
    release: &'a StableRelease,
    transport: &D,
) -> Result<(&'a ReleaseAsset, String), Failure> {
    let setup = find_asset(release, &setup_asset_name(release))?;
    let sums = find_asset(release, SUMS_ASSET)?;
    if setup.size > MAX_SETUP_BYTES {
        return Err(fail(
            UpdateInstallStatus::TooLarge,
            format!(
                "the setup has {} bytes, the limit is {MAX_SETUP_BYTES}",
                setup.size
            ),
        ));
    }
    let mut body = open(transport, &sums.browser_download_url).await?;
    let text = read_small(&mut body, MAX_SUMS_BYTES).await?;
    let hash = checksum_for(&String::from_utf8_lossy(&text), &setup.name).ok_or_else(|| {
        fail(
            UpdateInstallStatus::ChecksumMissing,
            format!("{SUMS_ASSET} has no line for {}", setup.name),
        )
    })?;
    Ok((setup, hash))
}

/// 128 bits from the standard library's per-process random keys (taken
/// from the operating system), so other programs cannot guess the name.
fn random_name() -> String {
    use std::hash::BuildHasher;
    let first = std::collections::hash_map::RandomState::new().hash_one(1u8);
    let second = std::collections::hash_map::RandomState::new().hash_one(2u8);
    format!("{first:016x}{second:016x}")
}

/// Creates a new folder `<base>\pdf-editor-update-<random>` and checks that
/// it is a real folder. A name that already exists (also a link) is never
/// used; the next random name is tried.
pub fn fresh_download_dir(base: &Path) -> io::Result<PathBuf> {
    for _ in 0..8 {
        let dir = base.join(format!("{DOWNLOAD_DIR_PREFIX}{}", random_name()));
        match std::fs::create_dir(&dir) {
            Ok(()) => return reparse::require_real_dir(&dir).map(|()| dir),
            Err(e) if e.kind() == io::ErrorKind::AlreadyExists => {}
            Err(e) => return Err(e),
        }
    }
    Err(io::Error::new(
        io::ErrorKind::AlreadyExists,
        "no free name for the download folder",
    ))
}

/// Opens a new `.part` file. Fails when anything already has the name; a
/// link at the name is never followed.
pub fn create_part(path: &Path) -> io::Result<std::fs::File> {
    let mut options = std::fs::OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(windows)]
    {
        use std::os::windows::fs::OpenOptionsExt;
        options.custom_flags(FILE_FLAG_OPEN_REPARSE_POINT);
    }
    options.open(path)
}

/// Renames `part` to `final_path`. Refuses when anything, also a link,
/// already has the final name.
fn move_into_place(part: &Path, final_path: &Path) -> io::Result<()> {
    if std::fs::symlink_metadata(final_path).is_ok() {
        return Err(io::Error::new(
            io::ErrorKind::AlreadyExists,
            format!("{} already exists", final_path.display()),
        ));
    }
    std::fs::rename(part, final_path)
}

fn disk_error(e: io::Error) -> Failure {
    fail(UpdateInstallStatus::DiskError, e.to_string())
}

fn check_hash(actual: String, expected: &str) -> Result<(), Failure> {
    if actual == expected {
        return Ok(());
    }
    Err(fail(
        UpdateInstallStatus::ChecksumMismatch,
        format!("SHA-256 {actual}, {SUMS_ASSET} lists {expected}"),
    ))
}

/// Streams the setup into a new `part`, checks its hash and renames it to
/// `final_path`. After `create` succeeded, any failure removes `part`.
async fn save_verified<D, W, C>(
    transport: &D,
    setup: &ReleaseAsset,
    expected_hash: &str,
    (part, final_path): (&Path, &Path),
    create: C,
) -> Result<(), Failure>
where
    D: Download,
    W: Write,
    C: Fn(&Path) -> io::Result<W>,
{
    let mut body = open(transport, &setup.browser_download_url).await?;
    let mut sink = create(part).map_err(disk_error)?;
    let streamed = stream_to(&mut body, &mut sink, setup.size).await;
    drop(sink);
    let moved = streamed
        .and_then(|actual| check_hash(actual, expected_hash))
        .and_then(|()| move_into_place(part, final_path).map_err(disk_error));
    if moved.is_err() {
        let _ = std::fs::remove_file(part);
    }
    moved
}

/// Step 4: a new folder under `dest_base`, the setup in it under its
/// release name. A failure removes the folder again.
async fn download_setup<D, W, C>(
    transport: &D,
    setup: &ReleaseAsset,
    expected_hash: &str,
    dest_base: &Path,
    create: C,
) -> Result<PathBuf, Failure>
where
    D: Download,
    W: Write,
    C: Fn(&Path) -> io::Result<W>,
{
    let dir = fresh_download_dir(dest_base).map_err(disk_error)?;
    let final_path = dir.join(&setup.name);
    let part = dir.join(format!("{}.part", setup.name));
    let saved = save_verified(
        transport,
        setup,
        expected_hash,
        (&part, &final_path),
        create,
    )
    .await;
    if saved.is_err() {
        let _ = std::fs::remove_dir(&dir);
    }
    saved.map(|()| final_path)
}

/// The whole download: steps 1 to 4. `fetch_json` is the release-API
/// transport (`release_check::send_request`), `transport` downloads the
/// assets, `dest_base` holds the new download folder, `create` opens the
/// `.part` file (`create_part` in the app).
pub async fn download_update_with<F, Fut, D, W, C>(
    consent: bool,
    expected_tag: &str,
    dest_base: &Path,
    fetch_json: F,
    transport: &D,
    create: C,
) -> Result<VerifiedSetup, Failure>
where
    F: FnOnce(String) -> Fut,
    Fut: Future<Output = Result<(u16, Vec<u8>), String>>,
    D: Download,
    W: Write,
    C: Fn(&Path) -> io::Result<W>,
{
    if !consent {
        return Err(fail(
            UpdateInstallStatus::Disabled,
            "update checks are off in Settings -> About",
        ));
    }
    let release = fetch_release(expected_tag, fetch_json).await?;
    let (setup, hash) = expected_setup(&release, transport).await?;
    let path = download_setup(transport, setup, &hash, dest_base, create).await?;
    let (major, minor, patch) = release.version;
    Ok(VerifiedSetup {
        path,
        sha256: hash,
        version: format!("{major}.{minor}.{patch}"),
    })
}

fn file_sha256(path: &Path) -> std::io::Result<String> {
    let mut file = std::fs::File::open(path)?;
    let mut hasher = Sha256::new();
    std::io::copy(&mut file, &mut hasher)?;
    Ok(sha256_hex(hasher))
}

/// Step 5: hashes the file again and only then calls `run`. `run` starts
/// the setup without silent switches, so its wizard asks the user.
pub fn start_verified(
    setup: &VerifiedSetup,
    run: &dyn Fn(&Path) -> std::io::Result<()>,
) -> Result<(), Failure> {
    let actual = file_sha256(&setup.path)
        .map_err(|e| fail(UpdateInstallStatus::FileChanged, e.to_string()))?;
    if actual != setup.sha256 {
        return Err(fail(
            UpdateInstallStatus::FileChanged,
            format!("the setup changed after the check (SHA-256 {actual})"),
        ));
    }
    run(&setup.path).map_err(|e| fail(UpdateInstallStatus::StartFailed, e.to_string()))
}

/// The real runner: starts the setup and does not wait for it.
pub fn run_setup(path: &Path) -> std::io::Result<()> {
    std::process::Command::new(path).spawn().map(|_child| ())
}

#[cfg(test)]
#[path = "update_install_tests.rs"]
mod tests;
