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

function bunPathPreamble(): string {
  return 'export BUN_INSTALL="$HOME/.bun"; export PATH="$HOME/.bun/bin:$PATH"; ';
}

function bashQuote(value: string): string {
  return `'${value.replace(/'/g, `'\"'\"'`)}'`;
}

export function dockerShellPreamble(): string {
  return `
set -euo pipefail
find_docker_bin() {
  if command -v docker >/dev/null 2>&1; then
    command -v docker
    return 0
  fi

  for candidate in /usr/local/bin/docker /opt/homebrew/bin/docker /usr/bin/docker; do
    if [ -x "$candidate" ]; then
      printf '%s\\n' "$candidate"
      return 0
    fi
  done

  return 1
}

try_docker_host() {
  local host="$1"

  if [ -n "$host" ]; then
    local socket_path="$host"
    if [ "$host" != "\${host#unix://}" ]; then
      socket_path="\${host#unix://}"
      if [ ! -S "$socket_path" ]; then
        return 1
      fi
    fi
    DOCKER_HOST="$host" "$JARVIS_DOCKER_BIN" info >/dev/null 2>&1
    return $?
  fi

  "$JARVIS_DOCKER_BIN" info >/dev/null 2>&1
}

JARVIS_DOCKER_BIN="$(find_docker_bin || true)"
if [ -z "$JARVIS_DOCKER_BIN" ]; then
  echo "Docker CLI not found. Install Docker Desktop or Docker Engine first." >&2
  exit 1
fi
export JARVIS_DOCKER_BIN

if ! try_docker_host "\${DOCKER_HOST:-}"; then
  for host in \
    "unix://$HOME/.docker/run/docker.sock" \
    "unix://$HOME/.docker/desktop/docker.sock" \
    "\${XDG_RUNTIME_DIR:+unix://$XDG_RUNTIME_DIR/docker.sock}" \
    "unix:///var/run/docker.sock"
  do
    [ -n "$host" ] || continue
    if try_docker_host "$host"; then
      export DOCKER_HOST="$host"
      break
    fi
  done
fi

if ! try_docker_host "\${DOCKER_HOST:-}"; then
  echo "Failed to connect to the Docker API. Checked the Docker CLI and common socket locations." >&2
  exit 1
fi

docker_cmd() {
  "$JARVIS_DOCKER_BIN" "$@"
}
`;
}

export function dockerPowerShellPreamble(): string {
  return `
$ErrorActionPreference = 'Stop'
function Find-DockerCommand {
  $candidates = @()
  $existing = Get-Command docker -ErrorAction SilentlyContinue
  if ($existing) {
    $candidates += $existing.Source
  }
  $candidates += @(
    "$Env:ProgramFiles\\Docker\\Docker\\resources\\bin\\docker.exe",
    "$Env:ProgramFiles\\Docker\\cli-plugins\\docker.exe",
    "$Env:LocalAppData\\Programs\\Docker\\Docker\\resources\\bin\\docker.exe"
  )

  foreach ($candidate in $candidates | Where-Object { $_ } | Select-Object -Unique) {
    if (Test-Path $candidate) {
      return $candidate
    }
  }

  throw 'Docker CLI not found. Install Docker Desktop or Docker Engine first.'
}

function Test-DockerEndpoint([string]$HostValue) {
  $hadOriginal = Test-Path Env:DOCKER_HOST
  $original = $env:DOCKER_HOST

  try {
    if ($HostValue) {
      $env:DOCKER_HOST = $HostValue
    } elseif ($hadOriginal) {
      Remove-Item Env:DOCKER_HOST -ErrorAction SilentlyContinue
    }

    & $script:JarvisDockerCommand info *> $null
    return $LASTEXITCODE -eq 0
  } finally {
    if ($hadOriginal) {
      $env:DOCKER_HOST = $original
    } else {
      Remove-Item Env:DOCKER_HOST -ErrorAction SilentlyContinue
    }
  }
}

$script:JarvisDockerCommand = Find-DockerCommand
$resolved = $false
$candidates = @()
if ($env:DOCKER_HOST) {
  $candidates += $env:DOCKER_HOST
}
$candidates += 'npipe:////./pipe/docker_engine'

foreach ($candidate in $candidates | Where-Object { $_ } | Select-Object -Unique) {
  if (Test-DockerEndpoint $candidate) {
    if ($candidate) {
      $env:DOCKER_HOST = $candidate
    } else {
      Remove-Item Env:DOCKER_HOST -ErrorAction SilentlyContinue
    }
    $resolved = $true
    break
  }
}

if ((-not $resolved) -and (Test-DockerEndpoint '')) {
  Remove-Item Env:DOCKER_HOST -ErrorAction SilentlyContinue
  $resolved = $true
}

if (-not $resolved) {
  throw 'Failed to connect to the Docker API. Checked docker.exe and the default Docker Desktop pipe.'
}

function docker_cmd {
  param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Arguments)
  & $script:JarvisDockerCommand @Arguments
}
`;
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
      args: [...distroArgs, '--', 'bash', '-c', bunPathPreamble() + jarvisCommand + '; exec ${SHELL:-bash}'],
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
    args: ['-c', bunPathPreamble() + jarvisCommand + '; exec ${SHELL:-bash}'],
  };
}

export async function loadSystemSummary(): Promise<SystemSummary> {
  const platform = os.platform();
  const wsl = platform === 'win32' ? await execCommand('wsl.exe', ['-l', '-q']) : { ok: false, stdout: '' };
  const docker = await commandExists('docker');
  const bun = platform === 'win32'
    ? await execCommand('powershell.exe', ['-NoProfile', '-Command', 'if (Get-Command bun -ErrorAction SilentlyContinue) { bun --version }'])
    : await execCommand('bash', ['-lc', `${bunPathPreamble()}command -v bun >/dev/null 2>&1 && bun --version`]);

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
        ? `docker_cmd ps -a --filter "name=${containerName}" --format "{{.Status}}" || docker_cmd inspect ${quotedName} --format "{{.State.Status}}"`
        : action === 'logs'
          ? `docker_cmd logs --tail 200 ${quotedName}`
          : `docker_cmd ${action} ${quotedName}`;
    const dockerScript = `${os.platform() === 'win32' ? dockerPowerShellPreamble() : dockerShellPreamble()}\n${dockerCommand}`;
    const result = await runProfileCommand(profile, dockerScript);
    return {
      ok: result.ok,
      action,
      output: `${result.stdout}${result.stderr}`.trim(),
      dashboardUrl,
    };
  }

  const preamble = bunPathPreamble();
  const dataDir = profile.dataDir;
  const startCmd = `${preamble}jarvis start -d --port ${port}${dataDir ? ' --data-dir ' + bashQuote(dataDir) : ''}`;
  const result = await runProfileCommand(
    profile,
    action === 'logs' ? `${preamble}jarvis logs -n 200` : action === 'start' ? startCmd : `${preamble}jarvis ${action}`,
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
        ? `${dockerPowerShellPreamble()}\n$name="${containerName}"; docker_cmd inspect $name --format "{{.State.Status}}" 2>$null`
        : `${dockerShellPreamble()}\ndocker_cmd inspect '${containerName.replace(/'/g, `'\\''`)}' --format "{{.State.Status}}" 2>/dev/null`,
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

  const preamble = bunPathPreamble();
  const versionResult = await runProfileCommand(profile, `${preamble}jarvis version`);
  const statusResult = versionResult.ok ? await runProfileCommand(profile, `${preamble}jarvis status`) : null;
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
