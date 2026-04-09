# Jarvis Installer

Unofficial community installer and control panel for [Jarvis](https://usejarvis.dev).

This repository is intentionally separate from the upstream `vierisid/jarvis` project. It packages a desktop control app and automation wrappers around the official Jarvis daemon and Docker image. It is not an official release channel.

## What it does

- Builds desktop installer artifacts:
  - Windows `.exe` via NSIS
  - macOS `.dmg`
  - Linux `AppImage` and `deb`
- Supports multiple install modes:
  - Native Bun install on macOS and Linux
  - Docker install on macOS, Linux, and Windows
  - WSL2 install path on Windows
- Provides a control panel UI for:
  - install and repair
  - start, stop, restart
  - fetching logs
  - opening the dashboard
  - running `jarvis onboard` in an embedded terminal
- Includes shell bootstrap scripts for desktop/server CLI usage

## Important constraints

- This repo can automate package installation and common repairs, but it cannot guarantee fully unattended WSL2 feature enablement or admin-only OS changes on every machine.
- Windows desktop automation through Jarvis still depends on the upstream sidecar/runtime story. This installer can provision the daemon paths and optionally install the sidecar package where supported.
- The control panel wraps upstream Jarvis commands and images. Compatibility depends on the upstream CLI and Docker image staying stable.

## Development

```bash
npm install
npm run dev
```

Build desktop packages:

```bash
npm run dist
```

Platform-specific builds:

```bash
npm run dist:win
npm run dist:mac
npm run dist:linux
```

## CLI bootstrap

Linux or macOS:

```bash
curl -fsSL https://raw.githubusercontent.com/Yperbu9474/jarvis-installer-unofficial/main/scripts/install.sh | bash
```

Windows PowerShell:

```powershell
irm https://raw.githubusercontent.com/Yperbu9474/jarvis-installer-unofficial/main/scripts/install.ps1 | iex
```
