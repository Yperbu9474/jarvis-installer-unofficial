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

function normalizePort(value: unknown): number {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 65535) {
    return value;
  }

  if (typeof value === 'string' && /^\d+$/.test(value)) {
    const parsed = Number.parseInt(value, 10);
    if (parsed >= 1 && parsed <= 65535) {
      return parsed;
    }
  }

  return 3142;
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
  options: {
    cwd?: string;
    env?: NodeJS.ProcessEnv;
    onStdout?: (chunk: string) => void;
    onStderr?: (chunk: string) => void;
  } = {},
): Promise<CommandResult> {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: options.cwd || os.homedir(),
      env: { ...process.env, ...(options.env || {}) },
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      const text = chunk.toString();
      stdout += text;
      options.onStdout?.(text);
    });
    child.stderr.on('data', (chunk) => {
      const text = chunk.toString();
      stderr += text;
      options.onStderr?.(text);
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
    if (command === 'docker') {
      const result = await execCommand('powershell.exe', [
        '-NoProfile',
        '-Command',
        `
        $existing = Get-Command docker -ErrorAction SilentlyContinue
        if ($existing) { exit 0 }
        $candidates = @(
          "$Env:ProgramFiles\\Docker\\Docker\\resources\\bin\\docker.exe",
          "$Env:ProgramFiles\\Docker\\cli-plugins\\docker.exe",
          "$Env:LocalAppData\\Programs\\Docker\\Docker\\resources\\bin\\docker.exe"
        )
        foreach ($candidate in $candidates) {
          if (Test-Path $candidate) { exit 0 }
        }
        exit 1
        `,
      ]);
      return result.ok;
    }
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

export async function runProfileCommand(
  profile: InstallProfile,
  script: string,
  options: {
    cwd?: string;
    env?: NodeJS.ProcessEnv;
    onStdout?: (chunk: string) => void;
    onStderr?: (chunk: string) => void;
  } = {},
): Promise<CommandResult> {
  if (profile.mode === 'wsl2') {
    const distro = sanitizeWslDistro(profile.wslDistro);
    const distroArgs = distro ? ['-d', distro] : [];
    return execCommand('wsl.exe', [...distroArgs, '--', 'bash', '-lc', script], options);
  }

  if (os.platform() === 'win32') {
    return execCommand('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script], options);
  }

  return execCommand('bash', ['-lc', script], options);
}

function bunPathPreamble(): string {
  return 'export BUN_INSTALL="$HOME/.bun"; export PATH="$HOME/.bun/bin:$PATH"; ';
}

function bashQuote(value: string): string {
  return `'${value.replace(/'/g, `'\"'\"'`)}'`;
}

function dockerQuotedName(containerName: string): string {
  return os.platform() === 'win32' ? `"${containerName}"` : `'${containerName.replace(/'/g, `'\\''`)}'`;
}

function buildDockerInspectCommand(containerName: string): string {
  return `docker_cmd inspect ${dockerQuotedName(containerName)} --format "{{.State.Status}}"`;
}

function buildDockerRunCommand(profile: InstallProfile): string {
  const port = normalizePort(profile.port);
  const containerName = profile.containerName || 'jarvis-daemon';
  const dataDir = profile.dataDir || '~/.jarvis-docker';

  if (os.platform() === 'win32') {
    return `docker_cmd run --detach --name ${dockerQuotedName(containerName)} --restart unless-stopped --publish "${port}:3142" --volume "${dataDir}:/data" ghcr.io/vierisid/jarvis:latest`;
  }

  return `docker_cmd run -d --name ${bashQuote(containerName)} --restart unless-stopped -p ${port}:3142 -v ${bashQuote(dataDir)}:/data ghcr.io/vierisid/jarvis:latest`;
}

function isMissingDockerContainer(output: string): boolean {
  return /no such (container|object)|not found/i.test(output);
}

type DockerContainerCandidate = {
  name: string;
  status: string;
  ports: string;
};

function buildDockerListCommand(): string {
  return 'docker_cmd ps -a --filter "ancestor=ghcr.io/vierisid/jarvis:latest" --format "{{.Names}}\t{{.Status}}\t{{.Ports}}"';
}

function parseDockerCandidates(output: string): DockerContainerCandidate[] {
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [name = '', status = '', ports = ''] = line.split('\t');
      return {
        name: name.trim(),
        status: status.trim(),
        ports: ports.trim(),
      };
    })
    .filter((candidate) => candidate.name);
}

function pickDockerCandidate(
  candidates: DockerContainerCandidate[],
  expectedName: string,
  port: number,
): DockerContainerCandidate | null {
  const exact = candidates.find((candidate) => candidate.name === expectedName);
  if (exact) return exact;

  const portMatch = candidates.find((candidate) => candidate.ports.includes(`${port}->3142`) || candidate.ports.includes(`:${port}->3142`));
  if (portMatch) return portMatch;

  const running = candidates.find((candidate) => /up|running/i.test(candidate.status));
  if (running) return running;

  return candidates.length === 1 ? candidates[0] : candidates[0] || null;
}

async function resolveDockerContainer(
  profile: InstallProfile,
  dockerPreamble: string,
): Promise<{ requestedName: string; actualName: string | null; adopted: boolean }> {
  const requestedName = profile.containerName || 'jarvis-daemon';
  const port = normalizePort(profile.port);
  const inspectResult = await runProfileCommand(profile, `${dockerPreamble}\n${buildDockerInspectCommand(requestedName)}`);
  const inspectOutput = `${inspectResult.stdout}${inspectResult.stderr}`.trim();

  if (inspectResult.ok || !isMissingDockerContainer(inspectOutput)) {
    return { requestedName, actualName: requestedName, adopted: false };
  }

  const listResult = await runProfileCommand(profile, `${dockerPreamble}\n${buildDockerListCommand()}`);
  const candidate = pickDockerCandidate(parseDockerCandidates(`${listResult.stdout}${listResult.stderr}`), requestedName, port);
  return {
    requestedName,
    actualName: candidate?.name || null,
    adopted: Boolean(candidate && candidate.name !== requestedName),
  };
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
    "unix://$HOME/.colima/default/docker.sock" \
    "unix://$HOME/.rd/docker.sock" \
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

export async function buildTerminalLaunch(
  profile: InstallProfile,
  purpose: 'onboard' | 'shell',
): Promise<{ shell: string; args: string[]; env?: NodeJS.ProcessEnv }> {
  const jarvisCommand = purpose === 'onboard' ? 'jarvis onboard' : 'jarvis help';

  if (profile.mode === 'docker') {
    const dockerPreamble = os.platform() === 'win32' ? dockerPowerShellPreamble() : dockerShellPreamble();
    const resolved = await resolveDockerContainer(profile, dockerPreamble);
    const containerName = resolved.actualName;

    if (!containerName) {
      throw new Error('No Jarvis Docker container detected. Install or repair Jarvis first.');
    }

    const statusResult = await runProfileCommand(profile, `${dockerPreamble}\n${buildDockerInspectCommand(containerName)}`);
    const statusOutput = `${statusResult.stdout}${statusResult.stderr}`.trim().toLowerCase();
    if (!statusOutput.includes('running')) {
      const startResult = await runProfileCommand(profile, `${dockerPreamble}\ndocker_cmd start ${dockerQuotedName(containerName)}`);
      if (!startResult.ok) {
        throw new Error(`${startResult.stdout}${startResult.stderr}`.trim() || `Failed to start Docker container ${containerName}.`);
      }
    }

    const notice = resolved.adopted
      ? `printf '%s\\n' ${bashQuote(`Using detected Docker container ${containerName} instead of ${resolved.requestedName}.`)}; `
      : '';

    if (os.platform() === 'win32') {
      return {
        shell: 'powershell.exe',
        args: [
          '-NoExit',
          '-ExecutionPolicy',
          'Bypass',
          '-Command',
          `${dockerPreamble}\n` +
          (resolved.adopted ? `Write-Host ${dockerQuotedName(`Using detected Docker container ${containerName} instead of ${resolved.requestedName}.`)}\n` : '') +
          `docker_cmd exec -it ${dockerQuotedName(containerName)} sh -lc ${dockerQuotedName(jarvisCommand)}`,
        ],
      };
    }

    return {
      shell: process.env.SHELL || '/bin/bash',
      args: ['-lc', `${dockerPreamble}\n${notice}docker_cmd exec -it ${bashQuote(containerName)} sh -lc ${bashQuote(jarvisCommand)}; exec \${SHELL:-bash}`],
    };
  }

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
  const port = normalizePort(profile.port);
  const dashboardUrl = `http://localhost:${port}`;

  if (profile.mode === 'docker') {
    const dockerPreamble = os.platform() === 'win32' ? dockerPowerShellPreamble() : dockerShellPreamble();
    const resolved = await resolveDockerContainer(profile, dockerPreamble);
    const containerName = resolved.actualName || resolved.requestedName;
    const quotedName = dockerQuotedName(containerName);
    const missingContainer = !resolved.actualName;

    if (missingContainer) {
      if (action === 'start' || action === 'restart') {
        const created = await runProfileCommand(profile, `${dockerPreamble}\n${buildDockerRunCommand(profile)}`);
        const createdOutput = `${created.stdout}${created.stderr}`.trim();
        return {
          ok: created.ok,
          action,
          output: created.ok
            ? `Created and started Docker container ${containerName}.${createdOutput ? `\n${createdOutput}` : ''}`
            : createdOutput || `Failed to create Docker container ${containerName}.`,
          dashboardUrl,
        };
      }

      const output =
        action === 'stop'
          ? `Docker container ${containerName} does not exist yet. Nothing to stop.`
          : action === 'logs'
            ? `Docker container ${containerName} does not exist yet, so there are no logs to show.`
            : `Docker container ${containerName} does not exist yet. Use Start or Install / Repair to create it.`;
      return { ok: true, action, output, dashboardUrl };
    }

    const statusResult = await runProfileCommand(profile, `${dockerPreamble}\n${buildDockerInspectCommand(containerName)}`);
    const statusOutput = `${statusResult.stdout}${statusResult.stderr}`.trim().toLowerCase();
    const isRunning = statusOutput.includes('running');

    if (action === 'start' && isRunning) {
      return {
        ok: true,
        action,
        output: resolved.adopted
          ? `Using detected Docker container ${containerName} instead of ${resolved.requestedName}.\nDocker container ${containerName} is already running.`
          : `Docker container ${containerName} is already running.`,
        dashboardUrl,
      };
    }

    if (action === 'logs' && !isRunning) {
      const started = await runProfileCommand(profile, `${dockerPreamble}\ndocker_cmd start ${quotedName}`);
      const startedOutput = `${started.stdout}${started.stderr}`.trim();
      if (!started.ok) {
        return {
          ok: false,
          action,
          output: resolved.adopted
            ? `Using detected Docker container ${containerName} instead of ${resolved.requestedName}.\n${startedOutput || `Failed to start Docker container ${containerName}.`}`
            : startedOutput || `Failed to start Docker container ${containerName}.`,
          dashboardUrl,
        };
      }
    }

    const dockerCommand =
      action === 'status'
        ? buildDockerInspectCommand(containerName)
        : action === 'logs'
          ? `docker_cmd logs --tail 200 ${quotedName}`
          : `docker_cmd ${action} ${quotedName}`;
    const result = await runProfileCommand(profile, `${dockerPreamble}\n${dockerCommand}`);
    const output = `${result.stdout}${result.stderr}`.trim();
    const resolvedOutput = resolved.adopted
      ? `Using detected Docker container ${containerName} instead of ${resolved.requestedName}.${output ? `\n${output}` : ''}`
      : output;
    return {
      ok: result.ok,
      action,
      output: resolvedOutput,
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
  const dashboardUrl = `http://localhost:${normalizePort(profile.port)}`;

  if (profile.mode === 'docker') {
    const dockerPreamble = os.platform() === 'win32' ? dockerPowerShellPreamble() : dockerShellPreamble();
    const resolved = await resolveDockerContainer(profile, dockerPreamble);

    if (!resolved.actualName) {
      return {
        installed: false,
        running: false,
        mode: profile.mode,
        details: 'No Docker container detected.',
        dashboardUrl,
      };
    }

    const result = await runProfileCommand(
      profile,
      os.platform() === 'win32'
        ? `${dockerPreamble}\n${buildDockerInspectCommand(resolved.actualName)} 2>$null`
        : `${dockerPreamble}\n${buildDockerInspectCommand(resolved.actualName)} 2>/dev/null`,
    );
    const status = `${result.stdout}${result.stderr}`.trim().toLowerCase();
    return {
      installed: result.ok || status.includes('running') || status.includes('exited'),
      running: status.includes('running'),
      mode: profile.mode,
      details: resolved.adopted ? `Detected Docker container ${resolved.actualName} (${status || 'unknown'}).` : status || 'No Docker container detected.',
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
