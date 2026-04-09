# Getting Started

This guide is for people who just want Jarvis working.

You do not need to know what Bun, Docker, or WSL2 mean before you start. The app will guide you, and this page tells you which button to press.

## Before You Start

You need:

- an internet connection
- permission to install apps on your computer

You might also see your computer ask for permission to install helper tools. That is normal.

## Step 1: Download The Installer

Go here:

<https://github.com/Yperbu9474/jarvis-installer-unofficial/releases/latest>

Then download the file for your system:

- Windows: `Jarvis-Installer-Windows-<version>.exe`
- Mac: `Jarvis-Installer-macOS-<version>-arm64.dmg`
- Linux: `Jarvis-Installer-Linux-<version>.AppImage`
- Linux for Ubuntu or Debian: `Jarvis-Installer-Linux-<version>.deb`

## Step 2: Open The Installer

### Windows

1. Double-click the `.exe`.
2. If Windows warns you, click `More info`.
3. Click `Run anyway` if you trust this unofficial installer.
4. Finish the installer.
5. Open `Jarvis Installer`.

### macOS

1. Open the `.dmg`.
2. Drag `Jarvis Installer` into `Applications`.
3. Open `Applications` and launch `Jarvis Installer`.
4. If macOS blocks it the first time, allow it in `System Settings > Privacy & Security`.

### Linux

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

## Step 3: Choose A Setup Type

If you are not sure what to pick, use this:

- Windows: `Docker`
- Mac: `Native Bun`
- Linux desktop: `Native Bun`
- Linux server or VPS: `Docker`

Use `Windows WSL2` only if you already know you want Jarvis inside WSL.

## Step 4: Click `Install or repair`

The app will try to:

- check what is already installed
- install missing helper tools
- install Jarvis
- save your settings

If Jarvis is already installed, the app should detect that and reuse it.

## Step 5: Finish Setup

1. Click `Run onboarding`.
2. Answer the questions in the built-in terminal.
3. When it is done, use the main buttons to start Jarvis and view logs.

If Jarvis is already running, the app should take you straight to the main view with logs.

## Recommended Choices

- macOS or Linux desktop: `native`
- VPS or container-first setups: `docker`
- Windows with Linux-style runtime preference: `wsl2`
- Windows with container preference: `docker`

## What The Buttons Mean

- `Install or repair`: installs Jarvis or fixes a broken install
- `Start`: starts Jarvis
- `Stop`: stops Jarvis
- `Restart`: restarts Jarvis
- `Logs`: shows live output so you can see what Jarvis is doing
- `Run onboarding`: opens the first-time setup questions

## If Something Goes Wrong

Try these in order:

1. Close the app and open it again.
2. Click `Install or repair` one more time.
3. Switch to a simpler mode:
   - Windows: try `Docker`
   - Mac: try `Native Bun`
   - Linux: try `Native Bun`
4. Read the logs in the app.

## Server Usage

If you do not want the desktop app, use the bootstrap scripts as a thin entrypoint and then deploy upstream Jarvis through Bun or Docker.

Linux or macOS:

```bash
curl -fsSL https://raw.githubusercontent.com/Yperbu9474/jarvis-installer-unofficial/main/scripts/install.sh | bash
```

Windows:

```powershell
irm https://raw.githubusercontent.com/Yperbu9474/jarvis-installer-unofficial/main/scripts/install.ps1 | iex
```

## For Developers

If you want to run the app from source instead of downloading a release:

```bash
npm install
npm run dev
```
