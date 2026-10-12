; PDF Editor per-user Windows setup (Inno Setup 6), plan 119.
; Build with packaging\build-installer.ps1: it checks the payload and the
; version, then writes output\payload-files.iss and passes the defines below.
; Contract (paths, registry keys, MSI detection): docs\install-contract.md.

#ifndef ExeSha256
  #error Build with packaging\build-installer.ps1: missing checked EXE identity
#endif
#if GetSHA256OfFile('..\src-tauri\target\release\pdf-editor.exe') != ExeSha256
  #error pdf-editor.exe changed after the payload check
#endif

#ifndef AppVersion
  #error Build with packaging\build-installer.ps1: missing AppVersion
#endif

; Developer-only test build: /DWebView2Check=skip skips the registry check
; and the download, and keeps the launch offer off.
#ifndef WebView2Check
  #define WebView2Check "run"
#endif

; Fixed AppId. src-tauri\src\util\install_detect.rs INNO_APP_ID holds the
; same value; tests\install_contract_test.rs fails when they differ.
; /DAppIdGuid=<guid> swaps in a throwaway id for acceptance tests only.
#ifndef AppIdGuid
  #define AppIdGuid "77A403B7-BE43-4976-BB7B-4C0CE4E8D7CA"
#endif

[Setup]
AppId={{{#AppIdGuid}}
AppName=PDF Editor
AppVersion={#AppVersion}
AppPublisher=SouthCarpet
AppPublisherURL=https://github.com/SouthCarpet/pdf-editor
PrivilegesRequired=lowest
DefaultDirName={localappdata}\Programs\PDF Editor
DisableDirPage=yes
DefaultGroupName=PDF Editor
DisableProgramGroupPage=yes
OutputBaseFilename=pdf-editor-setup-{#AppVersion}
OutputDir=output
SetupIconFile=..\src-tauri\icons\icon.ico
UninstallDisplayIcon={app}\pdf-editor.exe
UninstallDisplayName=PDF Editor
CloseApplications=yes
ChangesAssociations=yes
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
ShowLanguageDialog=auto
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0
SetupLogging=yes

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"
Name: "slovak"; MessagesFile: "compiler:Languages\Slovak.isl"

[CustomMessages]
english.OldMsiFound=PDF Editor is already installed with the old MSI installer:%n%1%nUninstall it first: Settings > Apps > Installed apps > PDF Editor > Uninstall. Windows asks for administrator rights.%n%nYour settings, projects, presets, logs and signatures stay: the MSI uninstall does not remove them. Then run this setup again.
slovak.OldMsiFound=PDF Editor je už nainštalovaný starým inštalátorom MSI:%n%1%nNajprv ho odinštalujte: Nastavenia > Aplikácie > Nainštalované aplikácie > PDF Editor > Odinštalovať. Windows si vypýta práva správcu.%n%nVaše nastavenia, projekty, predvoľby, záznamy a podpisy zostanú: odinštalovanie MSI ich neodstraňuje. Potom spustite tento inštalátor znova.
english.UpdateInstall=PDF Editor %1 is already installed in %2. Setup updates it to %3. Your data stay.
slovak.UpdateInstall=PDF Editor %1 je už nainštalovaný v %2. Inštalátor ho aktualizuje na %3. Vaše údaje zostanú.
english.SameInstall=PDF Editor %1 is already installed in %2. Do you want to reinstall it?
slovak.SameInstall=PDF Editor %1 je už nainštalovaný v %2. Chcete ho preinštalovať?
english.DowngradeInstall=The installed version %1 is newer than %2. Do you want to replace it with the older version?
slovak.DowngradeInstall=Nainštalovaná verzia %1 je novšia ako %2. Chcete ju nahradiť staršou verziou?
english.WebView2Ask=PDF Editor needs the Microsoft Edge WebView2 Runtime. Download and install it now? This needs an internet connection.
slovak.WebView2Ask=PDF Editor potrebuje Microsoft Edge WebView2 Runtime. Stiahnuť a nainštalovať ho teraz? Vyžaduje to internet.
english.WebView2Deferred=The WebView2 Runtime installation was deferred.
slovak.WebView2Deferred=Inštalácia WebView2 Runtime bola odložená.
english.WebView2DownloadFailed=The WebView2 Runtime download failed: %1
slovak.WebView2DownloadFailed=Stiahnutie WebView2 Runtime zlyhalo: %1
english.WebView2StartFailed=The WebView2 Runtime installer did not start.
slovak.WebView2StartFailed=Inštalátor WebView2 Runtime sa nespustil.
english.WebView2ExitCode=The WebView2 Runtime installer reported an error. Code: %1
slovak.WebView2ExitCode=Inštalátor WebView2 Runtime ohlásil chybu. Kód: %1
english.WebView2StillMissing=The WebView2 Runtime has no valid registry entry after the installation.
slovak.WebView2StillMissing=WebView2 Runtime nemá platný záznam ani po inštalácii.
english.LaunchDisabled=Setup will not offer to start PDF Editor. Fix the problem above and run this setup again.
slovak.LaunchDisabled=Inštalátor neponúkne spustenie PDF Editora. Odstráňte uvedený problém a spustite inštalátor znova.
english.LaunchApp=Start PDF Editor
slovak.LaunchApp=Spustiť PDF Editor
english.DesktopIcon=Add a desktop shortcut
slovak.DesktopIcon=Pridať odkaz na plochu
english.Shortcuts=Shortcuts:
slovak.Shortcuts=Odkazy:
english.PdfDescription=PDF document
slovak.PdfDescription=Dokument PDF
english.LibreOfficeAsk=PDF Editor converts Office files with LibreOffice. It is not installed. Install it now? About 350 MB, needs internet and administrator rights.
slovak.LibreOfficeAsk=PDF Editor konvertuje súbory Office pomocou LibreOffice. LibreOffice nie je nainštalovaný. Nainštalovať ho teraz? Približne 350 MB, vyžaduje internet a práva správcu.
english.LibreOfficeWingetFailed=The LibreOffice installation did not finish (winget exit code %1). PDF Editor is installed. Office conversion works after you install LibreOffice from %2
slovak.LibreOfficeWingetFailed=Inštalácia LibreOffice sa nedokončila (kód winget %1). PDF Editor je nainštalovaný. Konverzia súborov Office bude fungovať po inštalácii LibreOffice z %2
english.LibreOfficeBrowserFailed=Setup could not open the LibreOffice download page. PDF Editor is installed. Open this page yourself: %1
slovak.LibreOfficeBrowserFailed=Inštalátor nemohol otvoriť stránku na stiahnutie LibreOffice. PDF Editor je nainštalovaný. Otvorte túto stránku sami: %1
english.RemoveAppData=Remove your PDF Editor data too?%n%nThis removes the settings, the database (recent files, projects, pipeline presets, autosaved work, last session), your OCR languages, thumbnails, logs and the app's WebView data.%n%nPDF files and files that PDF Editor did not create stay. Choose No to keep the data for a later install.
slovak.RemoveAppData=Odstrániť aj údaje PDF Editora?%n%nOdstránia sa nastavenia, databáza (nedávne súbory, projekty, predvoľby postupov, automaticky uložená práca, posledná relácia), vaše jazyky OCR, náhľady, záznamy a údaje WebView aplikácie.%n%nSúbory PDF a súbory, ktoré PDF Editor nevytvoril, zostanú. Ak chcete údaje zachovať pre ďalšiu inštaláciu, vyberte Nie.
english.RemoveSignatures=Remove your saved signatures too?%n%nThis removes the signature images in%n%1%n%nChoose No to keep them.
slovak.RemoveSignatures=Odstrániť aj uložené podpisy?%n%nOdstránia sa obrázky podpisov v priečinku%n%1%n%nAk ich chcete zachovať, vyberte Nie.
english.RemoveDataFailed=Some PDF Editor data could not be removed (exit code %1). Remove what is left yourself: %2
slovak.RemoveDataFailed=Niektoré údaje PDF Editora sa nepodarilo odstrániť (kód %1). Zvyšok odstráňte sami: %2

[Tasks]
Name: "desktopicon"; Description: "{cm:DesktopIcon}"; GroupDescription: "{cm:Shortcuts}"; Flags: unchecked

#include "output\payload-files.iss"

[Icons]
Name: "{autoprograms}\PDF Editor"; Filename: "{app}\pdf-editor.exe"; AppUserModelID: "com.pdfeditor.app"
Name: "{autodesktop}\PDF Editor"; Filename: "{app}\pdf-editor.exe"; Tasks: desktopicon

; Per-user file associations, the same keys the MSI wrote (main.wxs DELTA 3):
; .pdf only in "Open with", .pdf-pipeline and .pdf-project owned.
[Registry]
Root: HKCU; Subkey: "Software\Classes\.pdf\OpenWithProgids"; ValueType: string; ValueName: "PdfEditor.pdf.1"; ValueData: ""; Flags: uninsdeletevalue
Root: HKCU; Subkey: "Software\Classes\PdfEditor.pdf.1"; ValueType: string; ValueName: ""; ValueData: "{cm:PdfDescription}"; Flags: uninsdeletekey
Root: HKCU; Subkey: "Software\Classes\PdfEditor.pdf.1\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\pdf-editor.exe"" ""%1"""
Root: HKCU; Subkey: "Software\Classes\.pdf-pipeline"; ValueType: string; ValueName: ""; ValueData: "PdfEditor.pipeline.1"; Flags: uninsdeletevalue
Root: HKCU; Subkey: "Software\Classes\PdfEditor.pipeline.1\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\pdf-editor.exe"" ""%1"""; Flags: uninsdeletekey
Root: HKCU; Subkey: "Software\Classes\.pdf-project"; ValueType: string; ValueName: ""; ValueData: "PdfEditor.project.1"; Flags: uninsdeletevalue
Root: HKCU; Subkey: "Software\Classes\PdfEditor.project.1\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\pdf-editor.exe"" ""%1"""; Flags: uninsdeletekey

[Run]
Filename: "{app}\pdf-editor.exe"; Description: "{cm:LaunchApp}"; Flags: postinstall nowait skipifsilent; Check: CanLaunch

[Code]
const
  // MSI_UPGRADE_CODE {7C8D4E2A-9B1F-4D3A-8A6B-1E2F3C4D5E6F} in packed form
  // (install_detect.rs packed_guid). The test checks this line.
  MsiUpgradeCodePacked = 'A2E4D8C7F1B9A3D4A8B6E1F2C3D4E5F6';
  UninstallRoot = 'Software\Microsoft\Windows\CurrentVersion\Uninstall';
  InnoUninstallKey = 'Software\Microsoft\Windows\CurrentVersion\Uninstall\{{#AppIdGuid}}_is1';
  WebView2SubKey = 'SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}';
  WebView2BootstrapperUrl = 'https://go.microsoft.com/fwlink/p/?LinkId=2124703';
  // LibreOffice detection and install (install_detect.rs LIBREOFFICE_KEYS,
  // SOFFICE_EXE, LIBREOFFICE_DOWNLOAD_URL, LIBREOFFICE_WINGET_ID). The test
  // install_contract_test.rs checks these lines.
  SofficeExe = 'soffice.exe';
  LibreOfficeDownloadUrl = 'https://www.libreoffice.org/download/download-libreoffice/';
  LibreOfficeWingetArgs = 'install --id TheDocumentFoundation.LibreOffice -e --accept-package-agreements --accept-source-agreements';
  // Uninstall: uninstall_data.rs FLAG, PART_APP_DATA, PART_SIGNATURES.
  RemoveDataFlag = '--remove-user-data';
  RemoveAppDataPart = ' app-data';
  RemoveSignaturesPart = ' signatures';

var
  DependenciesReady: Boolean;
  ExistingInstallFound: Boolean;

// ---- Old MSI detection (same lookup as install_detect.rs) ----

function ReverseText(const S: String): String;
var
  I: Integer;
begin
  Result := '';
  for I := Length(S) downto 1 do
    Result := Result + S[I];
end;

function SwapPairs(const S: String): String;
var
  I: Integer;
begin
  Result := '';
  I := 1;
  while I < Length(S) do
  begin
    Result := Result + S[I + 1] + S[I];
    I := I + 2;
  end;
end;

function UnpackGuid(const Packed: String): String;
begin
  Result := '{' + ReverseText(Copy(Packed, 1, 8)) + '-' + ReverseText(Copy(Packed, 9, 4)) + '-' +
    ReverseText(Copy(Packed, 13, 4)) + '-' + SwapPairs(Copy(Packed, 17, 4)) + '-' +
    SwapPairs(Copy(Packed, 21, 12)) + '}';
end;

function DescribeMsi(const RootKey: Integer; const ProductCode: String): String;
var
  Version, Location: String;
begin
  if not RegQueryStringValue(RootKey, UninstallRoot + '\' + ProductCode, 'DisplayVersion', Version) then
    Version := '?';
  if not RegQueryStringValue(RootKey, UninstallRoot + '\' + ProductCode, 'InstallLocation', Location) then
    Location := '?';
  Result := '  ' + Version + ', ' + Location + ', ' + ProductCode + #13#10;
end;

function FindMsiUnder(const RootKey: Integer; const UpgradeRoot: String; var Detail: String): Boolean;
var
  Names: TArrayOfString;
  I: Integer;
begin
  Result := False;
  if not RegGetValueNames(RootKey, UpgradeRoot + '\' + MsiUpgradeCodePacked, Names) then Exit;
  for I := 0 to GetArrayLength(Names) - 1 do
  begin
    if Length(Names[I]) <> 32 then Continue;
    Detail := Detail + DescribeMsi(RootKey, UnpackGuid(Names[I]));
    Result := True;
  end;
end;

function FindOldMsi(var Detail: String): Boolean;
var
  MachineWide, PerUser: Boolean;
begin
  Detail := '';
  MachineWide := FindMsiUnder(HKLM64, 'SOFTWARE\Classes\Installer\UpgradeCodes', Detail);
  PerUser := FindMsiUnder(HKCU, 'Software\Microsoft\Installer\UpgradeCodes', Detail);
  Result := MachineWide or PerUser;
  if Result then
    Log('Old MSI check: found' + #13#10 + Detail)
  else
    Log('Old MSI check: none found for packed UpgradeCode ' + MsiUpgradeCodePacked);
end;

function RefuseOldMsi(): Boolean;
var
  Detail: String;
begin
  Result := FindOldMsi(Detail);
  if Result and (not WizardSilent) then
    SuppressibleMsgBox(FmtMessage(CustomMessage('OldMsiFound'), [Detail]), mbCriticalError, MB_OK, IDOK);
end;

// ---- Update, reinstall and downgrade ----

function InstallChoice(const Text: String; Kind: TMsgBoxType; Buttons, Default: Integer): Integer;
begin
  if WizardSilent then Result := Default
  else Result := SuppressibleMsgBox(Text, Kind, Buttons, Default);
end;

function CompareWithInstalled(const OldVersion: String; var Cmp: Integer): Boolean;
var
  OldPacked, NewPacked: Int64;
begin
  Result := StrToVersion(OldVersion, OldPacked) and StrToVersion('{#AppVersion}', NewPacked);
  if Result then
    Cmp := ComparePackedVersion(OldPacked, NewPacked)
  else
    Log('Existing install check: cannot compare "' + OldVersion + '" with {#AppVersion}');
end;

function ConfirmExistingInstall(): Boolean;
var
  OldVersion, OldDir: String;
  Cmp: Integer;
begin
  Result := True;
  ExistingInstallFound := RegQueryStringValue(HKCU, InnoUninstallKey, 'DisplayVersion', OldVersion);
  if not ExistingInstallFound then Exit;
  if not RegQueryStringValue(HKCU, InnoUninstallKey, 'InstallLocation', OldDir) then OldDir := '?';
  Log('Existing install check: ' + OldVersion + ' at ' + OldDir);
  if not CompareWithInstalled(OldVersion, Cmp) then Exit;
  if Cmp < 0 then
    Result := InstallChoice(FmtMessage(CustomMessage('UpdateInstall'), [OldVersion, OldDir, '{#AppVersion}']),
      mbInformation, MB_OKCANCEL, IDOK) = IDOK
  else if Cmp = 0 then
    Result := InstallChoice(FmtMessage(CustomMessage('SameInstall'), [OldVersion, OldDir]),
      mbConfirmation, MB_YESNO, IDYES) = IDYES
  else
    Result := InstallChoice(FmtMessage(CustomMessage('DowngradeInstall'), [OldVersion, '{#AppVersion}']),
      mbConfirmation, MB_YESNO or MB_DEFBUTTON2, IDNO) = IDYES;
  if not Result then
    Log('Existing install check: user kept the installed version');
end;

// ---- WebView2 ----

function RegisteredWebView2(const RootKey: Integer): Boolean;
var
  Version: String;
  Packed: Int64;
begin
  Result := RegQueryStringValue(RootKey, WebView2SubKey, 'pv', Version) and
    StrToVersion(Version, Packed) and (ComparePackedVersion(Packed, 0) > 0);
  if Result then
    Log('WebView2: registered version ' + Version);
end;

function WebView2Installed(): Boolean;
begin
  Result := RegisteredWebView2(HKLM32) or RegisteredWebView2(HKLM64) or
    RegisteredWebView2(HKCU32) or RegisteredWebView2(HKCU64);
end;

function DependencyWarning(const Detail: String): Boolean;
begin
  Log('Dependencies: ' + Detail);
  if not WizardSilent then
    SuppressibleMsgBox(Detail + #13#10 + CustomMessage('LaunchDisabled'), mbError, MB_OK, IDOK);
  Result := False;
end;

function RunWebView2Bootstrapper(): Boolean;
var
  ResultCode: Integer;
begin
  try
    DownloadTemporaryFile(WebView2BootstrapperUrl, 'MicrosoftEdgeWebview2Setup.exe', '', nil);
  except
    Result := DependencyWarning(FmtMessage(CustomMessage('WebView2DownloadFailed'), [GetExceptionMessage]));
    Exit;
  end;
  if not Exec(ExpandConstant('{tmp}\MicrosoftEdgeWebview2Setup.exe'), '/silent /install', '', SW_HIDE,
    ewWaitUntilTerminated, ResultCode) then
    Result := DependencyWarning(CustomMessage('WebView2StartFailed'))
  else if ResultCode <> 0 then
    Result := DependencyWarning(FmtMessage(CustomMessage('WebView2ExitCode'), [IntToStr(ResultCode)]))
  else if not WebView2Installed() then
    Result := DependencyWarning(CustomMessage('WebView2StillMissing'))
  else
    Result := True;
end;

function CheckWebView2(): Boolean;
begin
  Result := False;
  if '{#WebView2Check}' = 'skip' then
  begin
    Log('WebView2: check skipped in test build; launch disabled');
    Exit;
  end;
  Result := WebView2Installed();
  if Result or WizardSilent then Exit;
  if SuppressibleMsgBox(CustomMessage('WebView2Ask'), mbConfirmation, MB_YESNO or MB_DEFBUTTON2, IDNO) <> IDYES then
    Result := DependencyWarning(CustomMessage('WebView2Deferred'))
  else
    Result := RunWebView2Bootstrapper();
end;

// ---- LibreOffice (not bundled; same rule as install_detect.rs) ----

function LibreOfficeUnder(const RootKey: Integer; const SubKey: String): Boolean;
var
  ProgramDir: String;
begin
  Result := RegQueryStringValue(RootKey, SubKey, '', ProgramDir) and
    FileExists(AddBackslash(Trim(ProgramDir)) + SofficeExe);
  if Result then
    Log('LibreOffice: found in ' + ProgramDir);
end;

function LibreOfficeInstalled(): Boolean;
begin
  Result := LibreOfficeUnder(HKLM64, 'SOFTWARE\LibreOffice\UNO\InstallPath') or
    LibreOfficeUnder(HKLM64, 'SOFTWARE\WOW6432Node\LibreOffice\UNO\InstallPath') or
    LibreOfficeUnder(HKCU, 'SOFTWARE\LibreOffice\UNO\InstallPath');
end;

procedure LibreOfficeWarning(const Text: String);
begin
  Log('LibreOffice: ' + Text);
  SuppressibleMsgBox(Text, mbInformation, MB_OK, IDOK);
end;

procedure InstallLibreOfficeWithWinget(const Winget: String);
var
  ResultCode: Integer;
begin
  if not Exec(Winget, LibreOfficeWingetArgs, '', SW_SHOW, ewWaitUntilTerminated, ResultCode) then
    ResultCode := -1;
  Log('LibreOffice: winget exit code ' + IntToStr(ResultCode));
  if ResultCode <> 0 then
    LibreOfficeWarning(FmtMessage(CustomMessage('LibreOfficeWingetFailed'), [IntToStr(ResultCode),
      LibreOfficeDownloadUrl]));
end;

procedure OpenLibreOfficeDownloadPage();
var
  ErrorCode: Integer;
begin
  // ShellExec hands the URL to the default browser; no command shell.
  if ShellExec('open', LibreOfficeDownloadUrl, '', '', SW_SHOWNORMAL, ewNoWait, ErrorCode) then
    Log('LibreOffice: download page opened')
  else
    LibreOfficeWarning(FmtMessage(CustomMessage('LibreOfficeBrowserFailed'), [LibreOfficeDownloadUrl]));
end;

// After the files are installed: a failure here never stops the install.
procedure OfferLibreOffice();
var
  Winget: String;
begin
  if LibreOfficeInstalled() then Exit;
  if WizardSilent then
  begin
    Log('LibreOffice: missing; a silent setup does not install it');
    Exit;
  end;
  if SuppressibleMsgBox(CustomMessage('LibreOfficeAsk'), mbConfirmation, MB_YESNO or MB_DEFBUTTON2, IDNO) <> IDYES then
  begin
    Log('LibreOffice: missing; the user chose No');
    Exit;
  end;
  Winget := ExpandConstant('{localappdata}\Microsoft\WindowsApps\winget.exe');
  if FileExists(Winget) then
    InstallLibreOfficeWithWinget(Winget)
  else
    OpenLibreOfficeDownloadPage();
end;

// ---- Uninstall: user data (uninstall_data.rs does the removal) ----

function UninstallDataParts(): String;
begin
  Result := '';
  if MsgBox(CustomMessage('RemoveAppData'), mbConfirmation, MB_YESNO or MB_DEFBUTTON2) = IDYES then
    Result := Result + RemoveAppDataPart;
  if MsgBox(FmtMessage(CustomMessage('RemoveSignatures'), [ExpandConstant('{userappdata}\com.pdfeditor.app\signatures')]),
    mbConfirmation, MB_YESNO or MB_DEFBUTTON2) = IDYES then
    Result := Result + RemoveSignaturesPart;
end;

procedure RemoveUserData(const Parts: String);
var
  ResultCode: Integer;
begin
  if not Exec(ExpandConstant('{app}\pdf-editor.exe'), RemoveDataFlag + Parts, '', SW_HIDE,
    ewWaitUntilTerminated, ResultCode) then
    ResultCode := -1;
  Log('Uninstall: removed user data' + Parts + ', exit code ' + IntToStr(ResultCode));
  if ResultCode <> 0 then
    MsgBox(FmtMessage(CustomMessage('RemoveDataFailed'), [IntToStr(ResultCode),
      ExpandConstant('{userappdata}\PdfEditor')]), mbError, MB_OK);
end;

procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
var
  Parts: String;
begin
  if CurUninstallStep <> usUninstall then Exit;
  // A silent uninstall asks nothing and keeps all user data.
  if UninstallSilent then
  begin
    Log('Uninstall: silent; user data kept');
    Exit;
  end;
  Parts := UninstallDataParts();
  if Parts = '' then
    Log('Uninstall: user data kept')
  else
    RemoveUserData(Parts);
end;

// ---- Setup flow ----

function InitializeSetup(): Boolean;
begin
  Result := False;
  if RefuseOldMsi() then Exit;
  if not ConfirmExistingInstall() then Exit;
  DependenciesReady := CheckWebView2();
  // A silent run without WebView2 stops before any file copy.
  Result := DependenciesReady or (not WizardSilent) or ('{#WebView2Check}' = 'skip');
end;

function CanLaunch(): Boolean;
begin
  Result := DependenciesReady;
end;

procedure CurStepChanged(CurStep: TSetupStep);
begin
  if CurStep = ssPostInstall then
    OfferLibreOffice();
end;

// An update or reinstall keeps the earlier task choice; do not ask again.
function ShouldSkipPage(PageID: Integer): Boolean;
begin
  Result := ExistingInstallFound and (PageID = wpSelectTasks);
end;
