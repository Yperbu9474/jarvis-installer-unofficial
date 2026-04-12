import os from 'node:os';
import crypto from 'node:crypto';
import * as pty from 'node-pty';
import type { InstallProfile } from '../../src/lib/types';
import { buildTerminalLaunch } from './runtime';

type OnData = (data: string) => void;

export const terminalSessions = new Map<string, pty.IPty>();

export async function createTerminal(
  payload: { profile: InstallProfile; purpose: 'onboard' | 'shell'; cols?: number; rows?: number },
  onData: OnData,
): Promise<string> {
  const id = crypto.randomUUID();
  const launch = await buildTerminalLaunch(payload.profile, payload.purpose);
  const cols = Number.isFinite(payload.cols) && Number(payload.cols) > 0 ? Math.floor(Number(payload.cols)) : 120;
  const rows = Number.isFinite(payload.rows) && Number(payload.rows) > 0 ? Math.floor(Number(payload.rows)) : 32;
  const shell = launch.shell ?? (os.platform() === 'win32' ? 'powershell.exe' : process.env.SHELL || '/bin/bash');
  const term = pty.spawn(shell, launch.args, {
    name: 'xterm-color',
    cols,
    rows,
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
