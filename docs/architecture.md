# Architecture

## Overview

This project is split into three main layers:

1. renderer UI
2. Electron main process
3. runtime command adapters

The renderer provides the control panel and installer forms. The main process owns privileged OS interactions. Runtime adapters translate the selected install mode into actual host commands.

## Renderer

The renderer lives under `src/`.

Key file:

- [src/App.tsx](/home/ubuntu/jarvis-installer/src/App.tsx)

Responsibilities:

- environment display
- install profile editing
- user actions for install and lifecycle control
- output display
- embedded terminal surface

## Electron Main Process

The Electron shell lives under `electron/`.

Key files:

- [electron/main.ts](/home/ubuntu/jarvis-installer/electron/main.ts)
- [electron/preload.ts](/home/ubuntu/jarvis-installer/electron/preload.ts)

Responsibilities:

- create the desktop window
- expose IPC handlers to the renderer
- mediate access to command execution and terminal sessions

## Runtime Layer

Runtime behavior is implemented in:

- [electron/src/runtime.ts](/home/ubuntu/jarvis-installer/electron/src/runtime.ts)
- [electron/src/jarvis.ts](/home/ubuntu/jarvis-installer/electron/src/jarvis.ts)
- [electron/src/pty.ts](/home/ubuntu/jarvis-installer/electron/src/pty.ts)

Responsibilities:

- host environment inspection
- command execution
- mode-specific install scripts
- lifecycle command routing
- profile persistence
- embedded PTY terminal management

## Data Flow

1. Renderer requests system summary.
2. Electron main process calls runtime detection.
3. Renderer shows the available modes.
4. User chooses a profile and launches install or lifecycle actions.
5. Main process runs the selected host commands.
6. Output is returned to the renderer for display.

## Why Electron

Electron is used here because the installer needs:

- a packaged desktop application
- a local embedded terminal
- shell and process access
- cross-platform packaging in one codebase

This is a practical operations app, not a web-only UI.
