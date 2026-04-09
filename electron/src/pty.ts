import os from 'node:os';
import crypto from 'node:crypto';
import pty from 'node-pty';
import type { InstallProfile } from '../../src/lib/types';
import { buildTerminalLaunch } from './runtime';

type OnData = (data: string) => void;

export const terminalSessions = new Map<string, pty.IPty>();

export function createTerminal(
  payload: { profile: InstallProfile; purpose: 'onboard' | 'shell' },
  onData: OnData,
): string {
  const id = crypto.randomUUID();
  const launch = buildTerminalLaunch(payload.profile, payload.purpose);
  const shell = launch.shell ?? (os.platform() === 'win32' ? 'powershell.exe' : process.env.SHELL || '/bin/bash');
  const term = pty.spawn(shell, launch.args, {
    name: 'xterm-color',
    cols: 120,
    rows: 32,
    cwd: os.homedir(),
    env: { ...process.env, ...(launch.env || {}) },
  });
  term.onData(onData);
  term.onExit(() => terminalSessions.delete(id));
  terminalSessions.set(id, term);
  return id;
}

export function writeTerminal(id: string, data: string) {
  terminalSessions.get(id)?.write(data);
}

export function resizeTerminal(id: string, cols: number, rows: number) {
  terminalSessions.get(id)?.resize(cols, rows);
}

export function closeTerminal(id: string) {
  const term = terminalSessions.get(id);
  if (!term) return;
  term.kill();
  terminalSessions.delete(id);
}
