# Jarvis Installer

Unofficial community installer and control panel for [Jarvis](https://usejarvis.dev).

This repository is intentionally separate from the upstream [`vierisid/jarvis`](https://github.com/vierisid/jarvis) project. It wraps the official Jarvis daemon CLI and Docker image in a desktop installer and control panel. It is not an official release channel.

## Status

This repository currently provides:

- a desktop control app built with Electron + React
- install and repair flows for:
  - native Bun installs on macOS and Linux
  - Docker installs on macOS, Linux, and Windows
  - WSL2-based installs on Windows
- a control panel for:
  - `install`
  - `start`
  - `stop`
  - `restart`
  - `status`
  - `logs`
  - opening the Jarvis dashboard
  - launching `jarvis onboard` in an embedded terminal
- packaging for:
  - Windows `.exe` through NSIS
  - macOS `.dmg`
  - Linux `AppImage`
  - Linux `.deb`
- bootstrap scripts for shell-based setup on desktop or server systems

## Repo Links

- Upstream Jarvis site: <https://usejarvis.dev>
- Upstream source repo: <https://github.com/vierisid/jarvis>
- Unofficial installer repo: <https://github.com/Yperbu9474/jarvis-installer-unofficial>

## Scope

This repo does not replace the upstream Jarvis daemon. It automates installation and management of the upstream project.

The desktop app is a launcher, installer, and runtime control surface. The actual Jarvis daemon still comes from:

- `bun install -g @usejarvis/brain`
- `ghcr.io/vierisid/jarvis:latest`
- the upstream CLI behavior in `vierisid/jarvis`

## Quick Start

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

## Install Modes

### Native Bun mode

Best for:

- macOS laptops and desktops
- Linux desktops
- Linux servers where you want direct CLI control

What it does:

- installs Bun if missing
- installs the upstream Jarvis package globally
- optionally installs the sidecar package
- lets the control panel run standard `jarvis` lifecycle commands

### Docker mode

Best for:

- VPS deployments
- users who want easier isolation
- Windows users who prefer Docker Desktop over WSL-first runtime use

What it does:

- installs Docker if the host allows it
- pulls `ghcr.io/vierisid/jarvis:latest`
- creates a persistent container and exposes the configured port
- uses `docker start`, `docker stop`, and `docker logs` from the control panel

### Windows WSL2 mode

Best for:

- Windows users who want the upstream Linux-style runtime
- Windows setups where Bun + CLI workflows should live inside a Linux distro

What it does:

- executes the install flow inside WSL
- uses the selected distro, or the default distro if none is chosen
- installs Jarvis via Bun inside that WSL environment

## Control Panel

The desktop app currently includes:

- environment summary
- install mode selection
- port configuration
- Docker container naming
- WSL distro selection on Windows
- install-sidecar toggle
- install or repair action
- daemon lifecycle actions
- output pane for command results
- embedded terminal for `jarvis onboard`

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
