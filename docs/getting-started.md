# Getting Started

## Purpose

`jarvis-installer-unofficial` is a wrapper project around the upstream Jarvis daemon. It gives you a desktop installer and control panel, plus shell bootstrap scripts.

Use it when you want:

- a packaged desktop installer
- one place to select install mode
- a control panel for lifecycle commands
- an embedded terminal for `jarvis onboard`

## Prerequisites

Development and packaging require:

- Node.js and npm
- network access to GitHub and npm

Runtime installation of Jarvis may additionally require:

- Bun
- Docker
- WSL2
- `sudo` or admin rights

The app will try to install missing runtime dependencies where it can.

## Local Development

```bash
npm install
npm run dev
```

This starts:

- Vite for the renderer
- `tsup` for Electron entry builds
- Electron itself against the local dev server

## First Run

1. Launch the app.
2. Let it inspect the host environment.
3. Pick an install mode.
4. Set the port and other mode-specific fields.
5. Click `Install or repair`.
6. Run `Run onboarding` to complete `jarvis onboard`.
7. Use the control buttons to start Jarvis and inspect logs.

## Download And Run The Packaged Installer

Latest release page:

<https://github.com/Yperbu9474/jarvis-installer-unofficial/releases/latest>

### Windows

1. Download `Jarvis-Installer-Windows-<version>.exe`.
2. Double-click the file.
3. If SmartScreen warns about the app, use `More info` and `Run anyway` only if you trust this unofficial build.
4. Finish the NSIS installer wizard.
5. Open `Jarvis Installer`.
6. Choose `Docker` or `Windows WSL2`.
7. Click `Install or repair`.
8. Run onboarding from the embedded terminal.

### macOS

1. Download `Jarvis-Installer-macOS-<version>-arm64.dmg`.
2. Open the disk image.
3. Drag the app into `Applications`.
4. Launch the app.
5. If macOS blocks first launch, allow it in `Privacy & Security`.
6. Choose `Native Bun` or `Docker`.
7. Click `Install or repair`.

### Linux

AppImage:

```bash
chmod +x Jarvis-Installer-Linux-<version>.AppImage
./Jarvis-Installer-Linux-<version>.AppImage
```

Deb package:

```bash
sudo apt install ./Jarvis-Installer-Linux-<version>.deb
```

After launch:

1. Choose `Native Bun` or `Docker`.
2. Click `Install or repair`.
3. Run onboarding.

## Recommended Choices

- macOS or Linux desktop: `native`
- VPS or container-first setups: `docker`
- Windows with Linux-style runtime preference: `wsl2`
- Windows with container preference: `docker`

## Server Usage

If you do not want the desktop app, use the bootstrap scripts as a thin entrypoint and then deploy upstream Jarvis through Bun or Docker.

Unix:

```bash
curl -fsSL https://raw.githubusercontent.com/Yperbu9474/jarvis-installer-unofficial/main/scripts/install.sh | bash
```

Windows:

```powershell
irm https://raw.githubusercontent.com/Yperbu9474/jarvis-installer-unofficial/main/scripts/install.ps1 | iex
```
