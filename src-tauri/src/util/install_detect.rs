//! Finds the installed copies of PDF Editor: the old per-machine MSI
//! (plan 047) and the per-user Inno setup (plan 119).
//!
//! The Inno setup (`packaging/pdf-editor.iss`, `FindOldMsi`) does the same
//! registry lookup in Pascal Script, with the same constants. The contract
//! is in `docs/install-contract.md`; `tests/install_contract_test.rs` fails
//! when the constants here and in the `.iss` file drift apart.
//!
//! Lookup:
//! 1. MSI: the packed UpgradeCode key under each `UPGRADE_CODE_ROOTS` entry
//!    lists the packed product code of every installed MSI of this product.
//!    Each product code is unpacked and its `Uninstall\{code}` key gives the
//!    version and install location.
//! 2. Inno: `HKCU\...\Uninstall\{INNO_APP_ID}_is1`.
//!
//! Only reads. Nothing here writes the registry or starts an installer.

/// `bundle.windows.wix.upgradeCode` in `tauri.conf.json`. Every MSI built
/// since plan 047 (2026-08-17) carries it.
pub const MSI_UPGRADE_CODE: &str = "{7C8D4E2A-9B1F-4D3A-8A6B-1E2F3C4D5E6F}";

/// The fixed `AppId` of `packaging/pdf-editor.iss`. Never change it: Inno
/// finds an earlier install of the setup through this id.
pub const INNO_APP_ID: &str = "{77A403B7-BE43-4976-BB7B-4C0CE4E8D7CA}";

pub const UNINSTALL_KEY: &str = r"Software\Microsoft\Windows\CurrentVersion\Uninstall";

/// Where Windows Installer records UpgradeCodes: per-machine first, then the
/// per-user (unmanaged) location.
pub const UPGRADE_CODE_ROOTS: [(Hive, &str); 2] = [
    (
        Hive::LocalMachine,
        r"SOFTWARE\Classes\Installer\UpgradeCodes",
    ),
    (
        Hive::CurrentUser,
        r"Software\Microsoft\Installer\UpgradeCodes",
    ),
];

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Hive {
    LocalMachine,
    CurrentUser,
}

/// The registry reads detection needs. The real reader is `WindowsRegistry`;
/// tests use an in-memory map.
pub trait RegistryRead {
    /// Value names of `key`, or an empty list when the key does not exist.
    fn value_names(&self, hive: Hive, key: &str) -> Vec<String>;
    /// A string value, or `None` when the key or the value does not exist.
    fn string_value(&self, hive: Hive, key: &str, name: &str) -> Option<String>;
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct InstalledCopy {
    /// MSI product code (`{GUID}`), or the Inno uninstall key name.
    pub key: String,
    pub version: Option<String>,
    pub location: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct InstallDetection {
    pub msi: Vec<InstalledCopy>,
    pub setup: Option<InstalledCopy>,
}

/// Windows Installer "packed" GUID: the first three groups reversed, every
/// byte of the last two groups with its two hex digits swapped, no braces or
/// dashes, upper case. `None` when `guid` is not a GUID.
pub fn packed_guid(guid: &str) -> Option<String> {
    let groups: Vec<&str> = guid
        .trim_matches(|c| c == '{' || c == '}')
        .split('-')
        .collect();
    let hex = groups.concat();
    let shape_ok = groups.iter().map(|g| g.len()).eq([8, 4, 4, 4, 12])
        && hex.chars().all(|c| c.is_ascii_hexdigit());
    if !shape_ok {
        return None;
    }
    let mut packed: String = groups[..3].iter().flat_map(|g| g.chars().rev()).collect();
    let tail: Vec<char> = hex[16..].chars().collect();
    for pair in tail.chunks(2) {
        packed.push(pair[1]);
        packed.push(pair[0]);
    }
    Some(packed.to_ascii_uppercase())
}

/// Inverse of `packed_guid`: `{XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX}`.
pub fn unpack_guid(packed: &str) -> Option<String> {
    if packed.len() != 32 || !packed.chars().all(|c| c.is_ascii_hexdigit()) {
        return None;
    }
    let rev = |s: &str| s.chars().rev().collect::<String>();
    let swap = |s: &str| {
        s.as_bytes()
            .chunks(2)
            .flat_map(|p| [p[1] as char, p[0] as char])
            .collect::<String>()
    };
    let guid = format!(
        "{{{}-{}-{}-{}-{}}}",
        rev(&packed[0..8]),
        rev(&packed[8..12]),
        rev(&packed[12..16]),
        swap(&packed[16..20]),
        swap(&packed[20..32]),
    );
    Some(guid.to_ascii_uppercase())
}

fn read_copy(reg: &impl RegistryRead, hive: Hive, key_name: &str) -> InstalledCopy {
    let key = format!(r"{UNINSTALL_KEY}\{key_name}");
    InstalledCopy {
        key: key_name.to_owned(),
        version: reg.string_value(hive, &key, "DisplayVersion"),
        location: reg.string_value(hive, &key, "InstallLocation"),
    }
}

fn find_msi(reg: &impl RegistryRead) -> Vec<InstalledCopy> {
    let Some(packed_upgrade) = packed_guid(MSI_UPGRADE_CODE) else {
        return Vec::new();
    };
    UPGRADE_CODE_ROOTS
        .iter()
        .flat_map(|(hive, root)| {
            reg.value_names(*hive, &format!(r"{root}\{packed_upgrade}"))
                .into_iter()
                .filter_map(|packed| unpack_guid(&packed))
                .map(move |code| read_copy(reg, *hive, &code))
                .collect::<Vec<_>>()
        })
        .collect()
}

fn find_setup(reg: &impl RegistryRead) -> Option<InstalledCopy> {
    let key_name = format!("{INNO_APP_ID}_is1");
    let copy = read_copy(reg, Hive::CurrentUser, &key_name);
    copy.version.is_some().then_some(copy)
}

/// Every installed copy that the registry shows.
pub fn detect(reg: &impl RegistryRead) -> InstallDetection {
    InstallDetection {
        msi: find_msi(reg),
        setup: find_setup(reg),
    }
}

/// Reads the live registry (64-bit view). Only on Windows.
#[cfg(windows)]
pub struct WindowsRegistry;

#[cfg(windows)]
mod windows_registry {
    use super::{Hive, RegistryRead, WindowsRegistry};
    use windows::core::{HSTRING, PWSTR};
    use windows::Win32::Foundation::ERROR_SUCCESS;
    use windows::Win32::System::Registry::{
        RegCloseKey, RegEnumValueW, RegGetValueW, RegOpenKeyExW, HKEY, HKEY_CURRENT_USER,
        HKEY_LOCAL_MACHINE, KEY_READ, KEY_WOW64_64KEY, RRF_RT_REG_SZ,
    };

    fn root(hive: Hive) -> HKEY {
        match hive {
            Hive::LocalMachine => HKEY_LOCAL_MACHINE,
            Hive::CurrentUser => HKEY_CURRENT_USER,
        }
    }

    fn enum_value_name(key: HKEY, index: u32) -> Option<String> {
        let mut buf = [0u16; 512];
        let mut len = buf.len() as u32;
        // SAFETY: `buf` outlives the call and `len` holds its capacity.
        let status = unsafe {
            RegEnumValueW(
                key,
                index,
                Some(PWSTR(buf.as_mut_ptr())),
                &mut len,
                None,
                None,
                None,
                None,
            )
        };
        (status == ERROR_SUCCESS).then(|| String::from_utf16_lossy(&buf[..len as usize]))
    }

    impl RegistryRead for WindowsRegistry {
        fn value_names(&self, hive: Hive, key: &str) -> Vec<String> {
            let mut handle = HKEY::default();
            // SAFETY: `handle` receives the opened key and is closed below.
            let opened = unsafe {
                RegOpenKeyExW(
                    root(hive),
                    &HSTRING::from(key),
                    None,
                    KEY_READ | KEY_WOW64_64KEY,
                    &mut handle,
                )
            };
            if opened != ERROR_SUCCESS {
                return Vec::new();
            }
            let names = (0..).map_while(|i| enum_value_name(handle, i)).collect();
            // SAFETY: `handle` was opened successfully above.
            unsafe {
                let _ = RegCloseKey(handle);
            }
            names
        }

        fn string_value(&self, hive: Hive, key: &str, name: &str) -> Option<String> {
            let mut buf = [0u16; 1024];
            let mut size = std::mem::size_of_val(&buf) as u32;
            // SAFETY: `buf` outlives the call and `size` holds its byte size.
            let status = unsafe {
                RegGetValueW(
                    root(hive),
                    &HSTRING::from(key),
                    &HSTRING::from(name),
                    RRF_RT_REG_SZ | windows::Win32::System::Registry::RRF_SUBKEY_WOW6464KEY,
                    None,
                    Some(buf.as_mut_ptr().cast()),
                    Some(&mut size),
                )
            };
            if status != ERROR_SUCCESS {
                return None;
            }
            let chars = (size as usize / 2).saturating_sub(1);
            Some(String::from_utf16_lossy(&buf[..chars]))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    #[derive(Default)]
    struct FakeRegistry {
        values: HashMap<(String, String), String>,
        names: HashMap<String, Vec<String>>,
    }

    fn hive_key(hive: Hive, key: &str) -> String {
        format!("{hive:?}|{key}")
    }

    impl FakeRegistry {
        fn with_msi(mut self, hive: Hive, product_code: &str, version: &str) -> Self {
            let root = UPGRADE_CODE_ROOTS
                .iter()
                .find(|(h, _)| *h == hive)
                .unwrap()
                .1;
            let upgrade_key = format!(r"{root}\{}", packed_guid(MSI_UPGRADE_CODE).unwrap());
            self.names
                .entry(hive_key(hive, &upgrade_key))
                .or_default()
                .push(packed_guid(product_code).unwrap());
            self.with_uninstall(hive, product_code, version, r"C:\Program Files\PDF Editor\")
        }

        fn with_setup(self, version: &str) -> Self {
            let key = format!("{INNO_APP_ID}_is1");
            self.with_uninstall(
                Hive::CurrentUser,
                &key,
                version,
                r"C:\Users\u\AppData\Local\Programs\PDF Editor\",
            )
        }

        fn with_uninstall(mut self, hive: Hive, name: &str, version: &str, location: &str) -> Self {
            let key = hive_key(hive, &format!(r"{UNINSTALL_KEY}\{name}"));
            self.values
                .insert((key.clone(), "DisplayVersion".into()), version.into());
            self.values
                .insert((key, "InstallLocation".into()), location.into());
            self
        }
    }

    impl RegistryRead for FakeRegistry {
        fn value_names(&self, hive: Hive, key: &str) -> Vec<String> {
            self.names
                .get(&hive_key(hive, key))
                .cloned()
                .unwrap_or_default()
        }

        fn string_value(&self, hive: Hive, key: &str, name: &str) -> Option<String> {
            self.values
                .get(&(hive_key(hive, key), name.to_owned()))
                .cloned()
        }
    }

    const PRODUCT: &str = "{11111111-2222-3333-4455-66778899AABB}";

    #[test]
    fn packs_the_upgrade_code_like_windows_installer() {
        assert_eq!(
            packed_guid(MSI_UPGRADE_CODE).as_deref(),
            Some("A2E4D8C7F1B9A3D4A8B6E1F2C3D4E5F6")
        );
    }

    #[test]
    fn unpack_reverses_pack() {
        let packed = packed_guid(PRODUCT).unwrap();

        assert_eq!(unpack_guid(&packed).as_deref(), Some(PRODUCT));
    }

    #[test]
    fn rejects_text_that_is_not_a_guid() {
        assert_eq!(packed_guid("{not-a-guid}"), None);
        assert_eq!(unpack_guid("A2E4"), None);
    }

    #[test]
    fn no_install_finds_nothing() {
        let detection = detect(&FakeRegistry::default());

        assert_eq!(detection, InstallDetection::default());
    }

    #[test]
    fn finds_the_per_machine_msi_with_version_and_location() {
        let reg = FakeRegistry::default().with_msi(Hive::LocalMachine, PRODUCT, "0.1.0");

        let detection = detect(&reg);

        assert_eq!(
            detection.msi,
            vec![InstalledCopy {
                key: PRODUCT.into(),
                version: Some("0.1.0".into()),
                location: Some(r"C:\Program Files\PDF Editor\".into()),
            }]
        );
        assert_eq!(detection.setup, None);
    }

    #[test]
    fn finds_a_per_user_msi_too() {
        let reg = FakeRegistry::default().with_msi(Hive::CurrentUser, PRODUCT, "0.1.0");

        assert_eq!(detect(&reg).msi.len(), 1);
    }

    #[test]
    fn finds_the_inno_setup_install() {
        let reg = FakeRegistry::default().with_setup("1.1.0");

        let detection = detect(&reg);

        assert!(detection.msi.is_empty());
        assert_eq!(
            detection.setup.and_then(|s| s.version).as_deref(),
            Some("1.1.0")
        );
    }

    #[test]
    fn finds_both_when_msi_and_setup_are_installed() {
        let reg = FakeRegistry::default()
            .with_msi(Hive::LocalMachine, PRODUCT, "0.1.0")
            .with_setup("1.1.0");

        let detection = detect(&reg);

        assert_eq!(detection.msi.len(), 1);
        assert!(detection.setup.is_some());
    }

    #[test]
    fn ignores_an_upgrade_code_entry_that_is_not_a_packed_guid() {
        let mut reg = FakeRegistry::default();
        let key = format!(
            r"{}\{}",
            UPGRADE_CODE_ROOTS[0].1,
            packed_guid(MSI_UPGRADE_CODE).unwrap()
        );
        reg.names
            .insert(hive_key(Hive::LocalMachine, &key), vec!["garbage".into()]);

        assert!(detect(&reg).msi.is_empty());
    }

    #[cfg(windows)]
    #[test]
    fn windows_reader_reads_a_value_every_windows_has() {
        let product = WindowsRegistry.string_value(
            Hive::LocalMachine,
            r"SOFTWARE\Microsoft\Windows NT\CurrentVersion",
            "ProductName",
        );

        assert!(product.is_some_and(|name| name.contains("Windows")));
    }
}
