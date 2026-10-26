# Getting Started

PDF Editor is a self-contained Windows desktop app. It runs entirely on your machine. No accounts, no cloud, and no network calls unless you turn on the update check.

## Install

1. Download `pdf-editor-setup-X.Y.Z.exe` and `SHA256SUMS.txt` from the GitHub release. The setup is not signed: compare `Get-FileHash -Algorithm SHA256 .\pdf-editor-setup-X.Y.Z.exe` with the line in `SHA256SUMS.txt`.
2. Run the setup. It installs for your Windows user only, into `%LOCALAPPDATA%\Programs\PDF Editor`, without administrator rights.
3. If the old MSI version is installed, the setup stops and asks you to uninstall it first (Settings > Apps > Installed apps > PDF Editor). Your settings, projects and signatures stay.
4. LibreOffice is not bundled. If it is missing, the setup asks whether to install it (default No). You need it only to convert Office files; without it, Office conversion shows the download link.
5. Launch from the Start Menu or by opening a `.pdf` file with "Open with" (file associations are set during install). The setup never makes PDF Editor your default PDF app.

Details: [packaging/INSTALL.md](../../packaging/INSTALL.md).

## Update

With **Check GitHub for new versions** on (Settings > Updates), Settings > Updates shows **Update to X.Y.Z** when a newer release exists. The header also shows a quiet **Update available** line. Click it: the app asks about unsaved work, downloads and checks the setup, starts it and closes. The setup keeps your data.

## Uninstall

Settings > Apps > Installed apps > PDF Editor > Uninstall. The uninstaller asks whether to remove your app data and, separately, your saved signatures. Both answers default to No. PDF files are never removed.

## First run

The app walks you through a short onboarding tour highlighting the dashboard, file picker, and tool tiles. You can replay it at any time: press **F1** (or choose **Help** in the footer) and choose **Show tour again**.

The header has four tabs: Tools, Projects, Pipeline and Settings (last). The sun and moon switch changes between Light and Dark; Settings > Appearance also has System. **Ctrl+comma** opens Settings. The help panel (**F1**) has a search field, short topics and the list of all keyboard shortcuts.

## Projects and Pipeline

- **Projects** lists your projects in a table with the name, the description and the date of the last change. Open a project to rename it, add or remove PDF files, attach pipeline presets, export it or import another one. **Delete** asks first and shows how many files and presets the project holds. The PDF files on disk are never deleted.
- **Pipeline** is the step graph. Add steps from the list on the left, connect them from top to bottom and select a step to change its settings. **Run** opens a window where you choose files or a folder. Each file shows a mark and a word (Queued, Running, Done, Failed). A warning in the window names the steps that can remove parts of the PDF, such as the text layer or form fields. **Copy output path** copies the path of the first output file.

## Where files go

- Output files default to the same folder as the input (or to your chosen "Save As" location).
- Recent files are remembered across sessions and shown on the dashboard.
- Session restore prompts you to re-open the last document on launch (toggleable in Settings).

## Privacy

PDF Editor makes no outbound network request unless you turn on **Check GitHub for new versions** in Settings > Updates (off by default). This is the only network setting. With it on, the app sends one request to the GitHub releases API at start, when you open Settings and when you click **Check now** (in About), and downloads a setup only after you click **Update**. It sends no documents and no personal data. The CSP is locked to `'self' ipc: http://ipc.localhost` and there is no telemetry, LLM, or analytics shipped in the binary. `scripts/test-privacy.ps1` checks that the HTTP client is used only by the update check module.
