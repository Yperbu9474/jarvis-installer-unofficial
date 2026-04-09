import os from 'node:os';
import { spawn } from 'node:child_process';
import type { InstallMode, InstallProfile, InstallState, LifecycleAction, LifecycleResult, SystemSummary } from '../../src/lib/types';

type CommandResult = {
  ok: boolean;
  code: number | null;
  stdout: string;
  stderr: string;
};

function stripControlNulls(value: string): string {
  return value.replace(/\u0000/g, '').replace(/\ufeff/g, '').trim();
}

function sanitizeWslDistro(value?: string): string | undefined {
  if (!value) return undefined;
  const sanitized = stripControlNulls(value);
  return sanitized || undefined;
}

function parseWslDistros(raw: string): string[] {
  return stripControlNulls(raw)
    .split(/\r?\n/)
    .map((item) => stripControlNulls(item))
    .filter(Boolean);
}

export async function execCommand(
  command: string,
  args: string[],
  options: { env?: NodeJS.ProcessEnv } = {},
): Promise<CommandResult> {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      env: { ...process.env, ...(options.env || {}) },
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('close', (code) => {
      resolve({ ok: code === 0, code, stdout, stderr });
    });
    child.on('error', (error) => {
      resolve({ ok: false, code: 1, stdout, stderr: error.message });
    });
  });
}

export async function commandExists(command: string): Promise<boolean> {
  const platform = os.platform();
  if (platform === 'win32') {
    const result = await execCommand('powershell.exe', [
      '-NoProfile',
      '-Command',
      `if (Get-Command "${command}" -ErrorAction SilentlyContinue) { exit 0 } else { exit 1 }`,
    ]);
    return result.ok;
  }
  const result = await execCommand('bash', ['-lc', `command -v ${command}`]);
  return result.ok;
}

export async function runProfileCommand(profile: InstallProfile, script: string): Promise<CommandResult> {
  if (profile.mode === 'wsl2') {
    const distro = sanitizeWslDistro(profile.wslDistro);
    const distroArgs = distro ? ['-d', distro] : [];
    return execCommand('wsl.exe', [...distroArgs, '--', 'bash', '-lc', script]);
  }

  if (os.platform() === 'win32') {
    return execCommand('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script]);
  }

  return execCommand('bash', ['-lc', script]);
}

export function buildTerminalLaunch(
  profile: InstallProfile,
  purpose: 'onboard' | 'shell',
): { shell: string; args: string[]; env?: NodeJS.ProcessEnv } {
  const jarvisCommand = purpose === 'onboard' ? 'jarvis onboard' : 'jarvis help';

  if (profile.mode === 'wsl2') {
    const distro = sanitizeWslDistro(profile.wslDistro);
    const distroArgs = distro ? ['-d', distro] : [];
    return {
      shell: 'wsl.exe',
      args: [...distroArgs, '--', 'bash', '-lc', jarvisCommand],
    };
  }

  if (os.platform() === 'win32') {
    return {
      shell: 'powershell.exe',
      args: ['-NoExit', '-Command', jarvisCommand],
    };
  }

  return {
    shell: process.env.SHELL || '/bin/bash',
    args: ['-lc', jarvisCommand],
  };
}

export async function loadSystemSummary(): Promise<SystemSummary> {
  const platform = os.platform();
  const wsl = platform === 'win32' ? await execCommand('wsl.exe', ['-l', '-q']) : { ok: false, stdout: '' };
  const docker = await commandExists('docker');
  const bun = platform === 'win32'
    ? await execCommand('powershell.exe', ['-NoProfile', '-Command', 'if (Get-Command bun -ErrorAction SilentlyContinue) { bun --version }'])
    : await execCommand('bash', ['-lc', 'command -v bun >/dev/null 2>&1 && bun --version']);

  const supportedModes: InstallMode[] =
    platform === 'win32' ? ['wsl2', 'docker'] : ['native', 'docker'];

  return {
    hostname: os.hostname(),
    platform,
    arch: os.arch(),
    supportedModes,
    hasDocker: docker,
    hasBun: bun.ok,
    bunVersion: bun.ok ? bun.stdout.trim() : undefined,
    wslDistros: platform === 'win32' ? parseWslDistros(wsl.stdout) : [],
  };
}

export async function lifecycle(profile: InstallProfile, action: LifecycleAction): Promise<LifecycleResult> {
  const port = profile.port || 3142;
  const dashboardUrl = `http://localhost:${port}`;

  if (profile.mode === 'docker') {
    const containerName = profile.containerName || 'jarvis-daemon';
    const quotedName = os.platform() === 'win32' ? `"${containerName}"` : `'${containerName.replace(/'/g, `'\\''`)}'`;
    const dockerCommand =
      action === 'status'
        ? `docker ps -a --filter "name=${containerName}" --format "{{.Status}}" || docker inspect ${quotedName} --format "{{.State.Status}}"`
        : action === 'logs'
          ? `docker logs --tail 200 ${quotedName}`
          : `docker ${action} ${quotedName}`;
    const result = await runProfileCommand(profile, dockerCommand);
    return {
      ok: result.ok,
      action,
      output: `${result.stdout}${result.stderr}`.trim(),
      dashboardUrl,
    };
  }

  const result = await runProfileCommand(
    profile,
    action === 'logs' ? 'jarvis logs -n 200' : `jarvis ${action}`,
  );
  return {
    ok: result.ok,
    action,
    output: `${result.stdout}${result.stderr}`.trim(),
    dashboardUrl,
  };
}

export async function detectInstallState(profile: InstallProfile): Promise<InstallState> {
  const dashboardUrl = `http://localhost:${profile.port || 3142}`;

  if (profile.mode === 'docker') {
    const containerName = profile.containerName || 'jarvis-daemon';
    const result = await runProfileCommand(
      profile,
      os.platform() === 'win32'
        ? `$name="${containerName}"; docker inspect $name --format "{{.State.Status}}" 2>$null`
        : `docker inspect '${containerName.replace(/'/g, `'\\''`)}' --format "{{.State.Status}}" 2>/dev/null`,
    );
    const status = `${result.stdout}${result.stderr}`.trim().toLowerCase();
    return {
      installed: result.ok || status.includes('running') || status.includes('exited'),
      running: status.includes('running'),
      mode: profile.mode,
      details: status || 'No Docker container detected.',
      dashboardUrl,
    };
  }

  const versionResult = await runProfileCommand(profile, 'jarvis version');
  const statusResult = versionResult.ok ? await runProfileCommand(profile, 'jarvis status') : null;
  const statusOutput = `${statusResult?.stdout || ''}${statusResult?.stderr || ''}`.trim();
  const normalized = statusOutput.toLowerCase();

  return {
    installed: versionResult.ok,
    running: normalized.includes('running'),
    mode: profile.mode,
    details: versionResult.ok ? statusOutput || versionResult.stdout.trim() || 'Jarvis CLI detected.' : 'Jarvis CLI not detected.',
    dashboardUrl,
  };
}
