# Install Modes

This page explains the choices you see in the app.

If you are not sure what to choose, use:

- Windows: `Docker`
- Mac: `Native`
- Linux desktop: `Native`
- Linux server or VPS: `Docker`

## Native

`Native` means Jarvis is installed directly on your Mac or Linux machine.

Choose this when:

- you want the normal setup
- you are on a Mac
- you are on Linux and not using Docker
- you want the most direct setup

What the app does:

- checks for the tools it needs
- installs Bun if it is missing
- installs Jarvis
- lets you start and stop Jarvis from the control panel

## Docker

`Docker` means Jarvis runs in a container.

Choose this when:

- you are on Windows and want the easiest default choice
- you already use Docker
- you are setting this up on a VPS
- you want Jarvis separated from the rest of your system

What the app does:

- checks for Docker
- installs Docker Desktop automatically on Windows when it is missing
- enables the WSL backend first when Docker Desktop needs it
- tries to install Docker Engine automatically on Linux when it is missing
- downloads the Jarvis container
- creates and starts the container
- lets you control it from the app

Limitations:

- your computer may still ask for admin permission
- Docker can take longer on first install
- some Jarvis features still depend on the upstream project, not just this installer

## WSL2

`WSL2` is for Windows only.

It runs Jarvis inside the Linux environment built into Windows.

Choose this when:

- you want the upstream Linux runtime behavior on Windows
- you already use WSL
- you specifically want Jarvis inside a Linux distro

What the app does:

- enables WSL automatically when Windows has not set it up yet
- installs an Ubuntu distro automatically when none exists yet
- creates a ready-to-use Linux user for the Jarvis install when the distro is brand new
- runs setup through `wsl.exe`
- installs Jarvis inside your WSL distro
- controls Jarvis from inside that WSL environment

Limitations and warnings:

- some systems will require administrator intervention and a reboot
- this is not the best default choice for most people
