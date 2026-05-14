# Getting Started

PDF Editor is a self-contained Windows desktop app. It runs entirely on your machine. No accounts, no network calls, no cloud.

## Install

1. Double-click the `.msi` installer (e.g. `PDF Editor_0.1.0_x64_en-US.msi`).
2. Choose per-user install (default) or per-machine.
3. Launch from Start Menu or by opening any `.pdf` file (file associations are wired during install).

## First run

The app walks you through a short onboarding tour highlighting the dashboard, file picker, and tool tiles. You can replay it from Settings -> General at any time.

## Where files go

- Output files default to the same folder as the input (or to your chosen "Save As" location).
- Recent files are remembered across sessions and shown on the dashboard.
- Session restore prompts you to re-open the last document on launch (toggleable in Settings).

## Privacy

PDF Editor makes zero outbound network requests. The CSP is locked to `'self' ipc: http://ipc.localhost` and there is no telemetry, LLM, or analytics shipped in the binary. Verify with `scripts/test-privacy.ps1` against the built `.exe`.
