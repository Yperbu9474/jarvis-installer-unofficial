import os from 'node:os';
import { spawn } from 'node:child_process';
import type { InstallMode, InstallProfile, LifecycleAction, LifecycleResult, SystemSummary } from '../../src/lib/types';

type CommandResult = {
  ok: boolean;
  code: number | null;
  stdout: string;
  stderr: string;
};

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
    const distroArgs = profile.wslDistro ? ['-d', profile.wslDistro] : [];
    return execCommand('wsl.exe', [...distroArgs, '--', 'bash', '-lc', script]);
  }

  if (profile.mode === 'docker' && os.platform() === 'win32') {
    return execCommand('powershell.exe', ['-NoProfile', '-Command', script]);
  }

  const shell = os.platform() === 'win32' ? 'powershell.exe' : 'bash';
  const args = os.platform() === 'win32' ? ['-NoProfile', '-Command', script] : ['-lc', script];
  return execCommand(shell, args);
}

export function buildTerminalLaunch(
  profile: InstallProfile,
  purpose: 'onboard' | 'shell',
): { shell: string; args: string[]; env?: NodeJS.ProcessEnv } {
  const jarvisCommand = purpose === 'onboard' ? 'jarvis onboard' : 'jarvis help';

  if (profile.mode === 'wsl2') {
    const distroArgs = profile.wslDistro ? `-d ${profile.wslDistro} ` : '';
    return {
      shell: 'wsl.exe',
      args: distroArgs.trim() ? distroArgs.trim().split(' ').concat(['--', 'bash', '-lc', jarvisCommand]) : ['--', 'bash', '-lc', jarvisCommand],
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
    wslDistros:
      platform === 'win32'
        ? wsl.stdout
            .split(/\r?\n/)
            .map((item) => item.trim())
            .filter(Boolean)
        : [],
  };
}

export async function lifecycle(profile: InstallProfile, action: LifecycleAction): Promise<LifecycleResult> {
  const port = profile.port || 3142;
  const dashboardUrl = `http://localhost:${port}`;

  if (profile.mode === 'docker') {
    const containerName = profile.containerName || 'jarvis-daemon';
    const dockerCommand =
      action === 'status'
        ? `docker ps -a --filter "name=${containerName}" --format "{{.Status}}"`
        : action === 'logs'
          ? `docker logs --tail 200 ${containerName}`
          : `docker ${action} ${containerName}`;
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
