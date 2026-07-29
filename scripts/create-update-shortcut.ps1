$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$updateScript = Join-Path $PSScriptRoot "update-pdf-editor.bat"
$desktop = [Environment]::GetFolderPath("Desktop")
$shortcutPath = Join-Path $desktop "Update PDF Editor.lnk"
$releaseExe = Join-Path $repoRoot "src-tauri\target\release\pdf-editor.exe"

if (-not (Test-Path -LiteralPath $updateScript -PathType Leaf)) {
    throw "Update script does not exist: $updateScript"
}

$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $updateScript
$shortcut.WorkingDirectory = $repoRoot
$shortcut.Description = "Rebuild PDF Editor from the local repository"
if (Test-Path -LiteralPath $releaseExe -PathType Leaf) {
    $shortcut.IconLocation = "$releaseExe,0"
}
$shortcut.Save()

Write-Output $shortcutPath
