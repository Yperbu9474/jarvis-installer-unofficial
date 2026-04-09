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
