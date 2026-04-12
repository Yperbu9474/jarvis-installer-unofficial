<div align="center">

# Jarvis Installer

**Unofficial community installer and control panel for Jarvis**

[![Release](https://img.shields.io/github/v/release/Yperbu9474/jarvis-installer-unofficial?label=release)](https://github.com/Yperbu9474/jarvis-installer-unofficial/releases)
[![Stars](https://img.shields.io/github/stars/Yperbu9474/jarvis-installer-unofficial?style=social)](https://github.com/Yperbu9474/jarvis-installer-unofficial/stargazers)
[![License](https://img.shields.io/badge/license-MIT-blue)](#license)
[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-black)](https://github.com/Yperbu9474/jarvis-installer-unofficial/releases/latest)
[![Discord](https://img.shields.io/badge/Discord-cnc__dev-5865F2?logo=discord&logoColor=white)](https://discord.com)
[![Discord ID](https://img.shields.io/badge/Discord%20ID-817847301003411518-5865F2)](https://discord.com)

</div>

Unofficial community installer and control panel for [Jarvis](https://usejarvis.dev).

This repository is intentionally separate from the upstream [`vierisid/jarvis`](https://github.com/vierisid/jarvis) project. It wraps the official Jarvis daemon CLI and Docker image in a desktop installer and control panel. It is not an official release channel.

## What This Is

This app helps you install and run Jarvis without doing a bunch of terminal setup by hand.

It gives you:

- a normal desktop installer
- a setup screen that asks you what kind of install you want
- automatic checks for missing tools like Bun or Docker, with Docker auto-install during CLI Docker setup on supported Linux and macOS systems
- a release popup when the official `vierisid/jarvis` repo publishes a new GitHub release
- sidebar-based installer self-updates that auto-download newer packaged releases and apply them on restart where the platform build supports it
- buttons to start, stop, and restart Jarvis
- a logs screen so you can see what Jarvis is doing
- a quick link to the Jarvis dashboard

If Jarvis is already installed, the app tries to use the existing install instead of reinstalling everything.

## Who This Is For

Use this if:

- you want the easiest possible Jarvis setup
- you do not want to memorize terminal commands
- you want one app to install, start, stop, and check Jarvis
- you want a simple control panel after setup

## Repo Links

- Upstream Jarvis site: <https://usejarvis.dev>
- Upstream source repo: <https://github.com/vierisid/jarvis>
- Unofficial installer repo: <https://github.com/Yperbu9474/jarvis-installer-unofficial>

## Quick Start

### 1. Download the installer

Download the latest packaged installers from:

<https://github.com/Yperbu9474/jarvis-installer-unofficial/releases/latest>

Pick the file that matches your computer:

- Windows: `Jarvis-Installer-Windows-<version>.exe`
- Mac: `Jarvis-Installer-macOS-<version>-arm64.dmg`
- Linux desktop: `Jarvis-Installer-Linux-<version>.AppImage`
- Linux package: `Jarvis-Installer-Linux-<version>.deb`

### 2. Install it

#### Windows

1. Open the latest releases page.
2. Download `Jarvis-Installer-Windows-<version>.exe`.
3. Double-click the `.exe`.
4. If Windows SmartScreen appears, click `More info` and then `Run anyway` if you trust the unofficial installer.
5. Complete the installer wizard.

#### macOS

1. Open the latest releases page.
2. Download `Jarvis-Installer-macOS-<version>-arm64.dmg`.
3. Open the `.dmg`.
4. Drag `Jarvis Installer` into `Applications`.
5. Launch it from `Applications`.
6. If Gatekeeper blocks the first launch, open `System Settings > Privacy & Security` and allow it.

#### Linux

If you downloaded the `AppImage`:

```bash
chmod +x Jarvis-Installer-Linux-<version>.AppImage
./Jarvis-Installer-Linux-<version>.AppImage
```

If you downloaded the `.deb`:

```bash
sudo apt install ./Jarvis-Installer-Linux-<version>.deb
```

Then open `Jarvis Installer` from your app menu.

### 3. Open Jarvis Installer

When the app opens, it checks your computer and shows setup options.

You usually only need to choose one install mode:

- Windows:
  - choose `Docker` if you already use Docker Desktop or want the simpler Windows option
  - choose `Windows WSL2` if you want Jarvis to run in a Linux environment inside Windows
- macOS:
  - choose `Native Bun` for the normal setup
  - choose `Docker` if you prefer containers
- Linux:
  - choose `Native Bun` for the normal setup
  - choose `Docker` for servers, VPS machines, or container-based setups

### 4. Click `Install or repair`

The app will:

- check what is already installed
- try to install missing tools
- install Jarvis
- save your settings

If Jarvis is already installed, the app should reuse it.

### 5. Finish the Jarvis setup

After install finishes:

1. Click `Run onboarding`.
2. Answer the questions in the built-in terminal.
3. When onboarding is done, use the buttons in the app to:
   - start Jarvis
   - stop Jarvis
   - restart Jarvis
   - view logs
   - open the dashboard

If Jarvis is already running when you open the app, it should go straight to the home/logs view.

## Which Option Should I Pick?

If you do not know which mode to choose, use this:

- Windows: `Docker`
- Mac: `Native Bun`
- Linux desktop: `Native Bun`
- Linux server or VPS: `Docker`

Use `Windows WSL2` only if you know you specifically want Jarvis inside WSL.

## Very Short Version

1. Download the installer from the latest release.
2. Open it.
3. Choose the recommended mode for your system.
4. Click `Install or repair`.
5. Click `Run onboarding`.
6. Use the control panel to start Jarvis and watch the logs.

### Run the desktop installer locally

```bash
npm install
npm run dev
```

### Build production desktop packages

```bash
npm run dist
```

Platform-specific:

```bash
npm run dist:win
npm run dist:mac
npm run dist:linux
```

### CLI bootstrap

Linux or macOS:

```bash
curl -fsSL https://raw.githubusercontent.com/Yperbu9474/jarvis-installer-unofficial/main/scripts/install.sh | bash
```

Windows PowerShell:

```powershell
irm https://raw.githubusercontent.com/Yperbu9474/jarvis-installer-unofficial/main/scripts/install.ps1 | iex
```

## What The Modes Mean

### `Native Bun`

This means Jarvis is installed directly on your Mac or Linux machine.

Choose this if you want the normal setup and do not care about Docker.

### `Docker`

This means Jarvis runs in a container.

Choose this if:

- you already use Docker
- you are on a VPS
- you want a more separated setup
- you are on Windows and want the easiest default choice

### `Windows WSL2`

This means Jarvis runs inside the Linux system built into Windows.

Choose this only if you want that on purpose.

## Control Panel

After setup, the app becomes your Jarvis control panel.

It includes:

- start button
- stop button
- restart button
- logs view
- status view
- dashboard link

You should be able to open this app later and use it as your main Jarvis launcher.

The primary UI entrypoint is [src/App.tsx](/home/ubuntu/jarvis-installer/src/App.tsx).

## Project Structure

- [package.json](/home/ubuntu/jarvis-installer/package.json)
  Release metadata, scripts, and Electron Builder packaging.
- [electron/main.ts](/home/ubuntu/jarvis-installer/electron/main.ts)
  Electron window lifecycle and IPC wiring.
- [electron/src/runtime.ts](/home/ubuntu/jarvis-installer/electron/src/runtime.ts)
  Host command execution, environment detection, and runtime command routing.
- [electron/src/jarvis.ts](/home/ubuntu/jarvis-installer/electron/src/jarvis.ts)
  Install script generation, profile persistence, and lifecycle wrappers.
- [electron/src/pty.ts](/home/ubuntu/jarvis-installer/electron/src/pty.ts)
  Embedded terminal session management using `node-pty`.
- [scripts/install.sh](/home/ubuntu/jarvis-installer/scripts/install.sh)
  Shell bootstrap for Unix-like systems.
- [scripts/install.ps1](/home/ubuntu/jarvis-installer/scripts/install.ps1)
  PowerShell bootstrap for Windows.

## Packaging Notes

The build is configured to produce:

- `.exe` on Windows with NSIS
- `.dmg` on macOS
- `AppImage` and `.deb` on Linux

Artifacts are written to `release/`.

On this host I verified:

- `npm run typecheck`
- `npm run build`
- `npm run dist:linux`

The Linux output directory currently contains:

- `Jarvis Installer-0.1.0-linux-x86_64.AppImage`
- `Jarvis Installer-0.1.0-linux-amd64.deb`

## CI Releases

GitHub Actions is configured to build native packages on native runners:

- Ubuntu runner builds `AppImage` and `.deb`
- Windows runner builds the NSIS `.exe`
- macOS runner builds the `.dmg`

Workflow file:

- [.github/workflows/build-release.yml](/home/ubuntu/jarvis-installer/.github/workflows/build-release.yml)

How it works:

- `workflow_dispatch` uploads build artifacts for manual runs
- pushing a tag like `v0.1.1` builds all three platforms and publishes a GitHub release with the generated artifacts
## Constraints

This project can automate a lot, but there are hard limits:

- it cannot guarantee fully unattended installation when admin elevation or OS feature enablement is required
- WSL2 enablement may still require Windows optional feature changes and reboots
- Docker Desktop installation on Windows may still require manual confirmation
- desktop automation support still depends on the upstream Jarvis sidecar behavior
- upstream CLI or Docker image changes can require updates here

So this repo should be described as a strong automation layer, not a mathematically guaranteed universal installer.

## More Help

See:

- [docs/getting-started.md](/home/ubuntu/jarvis-installer/docs/getting-started.md)
- [docs/install-modes.md](/home/ubuntu/jarvis-installer/docs/install-modes.md)
- [docs/architecture.md](/home/ubuntu/jarvis-installer/docs/architecture.md)
- [docs/packaging.md](/home/ubuntu/jarvis-installer/docs/packaging.md)

## Documentation

- [Getting Started](./docs/getting-started.md)
- [Install Modes](./docs/install-modes.md)
- [Architecture](./docs/architecture.md)
- [Packaging](./docs/packaging.md)

## Development Notes

Install dependencies:

```bash
npm install
```

Run the app in development mode:

```bash
npm run dev
```

Typecheck:

```bash
npm run typecheck
```

Build:

```bash
npm run build
```

## License

This repository is MIT-licensed for the installer code in this repo only. Review the upstream Jarvis repository for upstream licensing and release terms.
