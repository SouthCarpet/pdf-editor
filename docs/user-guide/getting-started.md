# Getting Started

PDF Editor is a self-contained Windows desktop app. It runs entirely on your machine. No accounts, no cloud, and no network calls unless you turn on the update check.

## Install

1. Download `pdf-editor-setup-X.Y.Z.exe` and `SHA256SUMS.txt` from the GitHub release. The setup is not signed: compare `Get-FileHash -Algorithm SHA256 .\pdf-editor-setup-X.Y.Z.exe` with the line in `SHA256SUMS.txt`.
2. Run the setup. It installs for your Windows user only, into `%LOCALAPPDATA%\Programs\PDF Editor`, without administrator rights.
3. If the old MSI version is installed, the setup stops and asks you to uninstall it first (Settings > Apps > Installed apps > PDF Editor). Your settings, projects and signatures stay.
4. Launch from the Start Menu or by opening a `.pdf` file with "Open with" (file associations are set during install).

Details: [packaging/INSTALL.md](../../packaging/INSTALL.md).

## First run

The app walks you through a short onboarding tour highlighting the dashboard, file picker, and tool tiles. You can replay it from Settings -> General at any time.

## Where files go

- Output files default to the same folder as the input (or to your chosen "Save As" location).
- Recent files are remembered across sessions and shown on the dashboard.
- Session restore prompts you to re-open the last document on launch (toggleable in Settings).

## Privacy

PDF Editor makes no outbound network request unless you turn on **Check GitHub for new versions** in Settings > About (off by default). With it on, the app sends one request to the GitHub releases API at start, when you open About and when you click **Check now**. It sends no documents and no personal data. The CSP is locked to `'self' ipc: http://ipc.localhost` and there is no telemetry, LLM, or analytics shipped in the binary. `scripts/test-privacy.ps1` checks that the HTTP client is used only by the update check module.
