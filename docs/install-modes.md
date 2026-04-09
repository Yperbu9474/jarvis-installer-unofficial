# Install Modes

## Native

The native mode is intended for macOS and Linux hosts.

Behavior:

- checks for `curl`, `git`, `unzip`, and `bun`
- installs Bun if missing
- runs `bun install -g @usejarvis/brain`
- optionally installs `@usejarvis/sidecar`
- later manages the daemon through `jarvis start`, `jarvis stop`, `jarvis logs`, and related commands

Use native mode when:

- you want the simplest non-container local setup
- you want direct access to the `jarvis` CLI
- you are running on a developer workstation or Linux host

## Docker

Docker mode targets desktops, servers, and Windows systems with Docker support.

Behavior:

- checks for Docker
- attempts installation when possible
- pulls `ghcr.io/vierisid/jarvis:latest`
- recreates the target container
- binds `${port}:3142`
- stores persistent data in the configured data directory

Use Docker mode when:

- you want a cleaner runtime boundary
- you are deploying on a VPS
- you already standardize on containers

Limitations:

- host desktop access does not magically appear because the daemon runs in Docker
- sidecar and actuator capabilities still depend on the upstream architecture

## WSL2

WSL2 mode is intended for Windows systems.

Behavior:

- invokes commands through `wsl.exe`
- targets the selected distro if one is chosen
- runs the Bun-based Jarvis installation in that distro
- uses Linux-style Jarvis runtime commands inside WSL

Use WSL2 mode when:

- you want the upstream Linux runtime behavior on Windows
- you are more comfortable debugging inside a distro than through Docker Desktop

Limitations:

- WSL2 itself may not be installed or enabled
- some systems will require administrator intervention and a reboot
- GUI expectations differ across Windows and Linux environments
