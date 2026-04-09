# Packaging

## Build Commands

All package outputs are driven by `electron-builder`.

General build:

```bash
npm run dist
```

Per platform:

```bash
npm run dist:win
npm run dist:mac
npm run dist:linux
```

## Current Targets

Configured targets in [package.json](/home/ubuntu/jarvis-installer/package.json):

- Windows: NSIS `.exe`
- macOS: `.dmg`
- Linux: `AppImage` and `.deb`

## Output Directory

Artifacts are emitted to:

```text
release/
```

## Metadata Requirements

For Linux packaging, Electron Builder requires:

- homepage
- author email
- maintainer metadata for `.deb`

Those values are already set in the repo manifest.

## Native Module Note

This project uses `node-pty`, which means packaging rebuilds native dependencies for the target platform during Electron packaging.

That is why:

- Linux artifacts should be built on Linux
- Windows artifacts should be built on Windows
- macOS artifacts should be built on macOS

Cross-platform packaging from a single host is possible in some setups, but it is not the clean default for a repo like this.

## Verified On This Host

Validated locally on this Linux machine:

- `npm run typecheck`
- `npm run build`
- `npm run dist:linux`

Generated artifacts observed:

- `Jarvis Installer-0.1.0-linux-x86_64.AppImage`
- `Jarvis Installer-0.1.0-linux-amd64.deb`
