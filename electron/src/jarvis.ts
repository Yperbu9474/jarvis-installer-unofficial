import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { app } from 'electron';
import type {
  InstallProfile,
  InstallProgress,
  InstallResult,
  InstallState,
  LifecycleAction,
  LifecycleResult,
  SystemSummary,
  UpdateResult,
} from '../../src/lib/types';
import {
  detectInstallState,
  dockerPowerShellPreamble,
  dockerShellPreamble,
  execCommand,
  lifecycle,
  loadSystemSummary,
  runProfileCommand,
} from './runtime';

const PROFILE_PATH = () => path.join(app.getPath('userData'), 'profile.json');

export async function getSavedProfile(): Promise<InstallProfile | null> {
  try {
    const raw = await fs.readFile(PROFILE_PATH(), 'utf8');
    return JSON.parse(raw) as InstallProfile;
  } catch {
    return null;
  }
}

export async function saveProfile(profile: InstallProfile): Promise<InstallProfile> {
  await fs.mkdir(path.dirname(PROFILE_PATH()), { recursive: true });
  await fs.writeFile(PROFILE_PATH(), JSON.stringify(profile, null, 2));
  return profile;
}

function bashInstallPackages(packages: string[]) {
  const joined = packages.join(' ');
  return `
set -e
if command -v apt-get >/dev/null 2>&1; then
  run_as_root apt-get update
  run_as_root apt-get install -y ${joined}
elif command -v dnf >/dev/null 2>&1; then
  run_as_root dnf install -y ${joined}
elif command -v yum >/dev/null 2>&1; then
  run_as_root yum install -y ${joined}
elif command -v pacman >/dev/null 2>&1; then
  run_as_root pacman -Sy --noconfirm ${joined}
elif command -v zypper >/dev/null 2>&1; then
  run_as_root zypper --non-interactive install ${joined}
elif command -v apk >/dev/null 2>&1; then
  run_as_root apk add ${joined}
elif command -v brew >/dev/null 2>&1; then
  brew install ${joined}
else
  echo "No supported package manager found" >&2
  exit 1
fi
`;
}

function bashQuote(value: string): string {
  return `'${value.replace(/'/g, `'\"'\"'`)}'`;
}

function pwshQuote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
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

function jarvisConfigContent(port: number): string {
  return [
    '# Jarvis configuration - edit this file then run: jarvis onboard',
    'daemon:',
    `  port: ${port}`,
    '  data_dir: "~/.jarvis"',
    '',
    'llm:',
    '  primary: "anthropic"',
    '  fallback: []',
    '  anthropic:',
    '    api_key: ""',
    '',
    'personality:',
    '  core_traits:',
    '    - "loyal"',
    '    - "efficient"',
    '',
    'authority:',
    '  default_level: 3',
  ].join('\n');
}

function bunBootstrapScript() {
  return `
set -euo pipefail
run_as_root() {
  if [ "$(id -u)" -eq 0 ]; then
    "$@"
    return
  fi

  if ! command -v sudo >/dev/null 2>&1; then
    echo "Administrative privileges are required for this step, but sudo is not installed." >&2
    exit 1
  fi

  if ! sudo -n true >/dev/null 2>&1; then
    echo "Administrative privileges are required for this step, but sudo needs a password. Re-run from an elevated shell or configure passwordless sudo." >&2
    exit 1
  fi

  sudo -n "$@"
}

echo "JARVIS_PROGRESS:12:Checking required packages"
if ! command -v curl >/dev/null 2>&1; then
  ${bashInstallPackages(['curl'])}
fi
if ! command -v git >/dev/null 2>&1; then
  ${bashInstallPackages(['git'])}
fi
if ! command -v unzip >/dev/null 2>&1; then
  ${bashInstallPackages(['unzip'])}
fi
echo "JARVIS_PROGRESS:22:Installing Bun runtime"
if ! command -v bun >/dev/null 2>&1; then
  curl -fsSL https://bun.sh/install | bash
fi
export BUN_INSTALL="$HOME/.bun"
export PATH="$HOME/.bun/bin:$PATH"
if ! grep -q '.bun/bin' "$HOME/.bashrc" 2>/dev/null; then
  printf '\\nexport PATH="$HOME/.bun/bin:$PATH"\\n' >> "$HOME/.bashrc"
fi
`;
}

function dockerBootstrapScript() {
  return `
set -euo pipefail
run_as_root() {
  if [ "$(id -u)" -eq 0 ]; then
    "$@"
    return
  fi

  if ! command -v sudo >/dev/null 2>&1; then
    echo "Administrative privileges are required for Docker setup, but sudo is not installed." >&2
    exit 1
  fi

  if ! sudo -n true >/dev/null 2>&1; then
    echo "Administrative privileges are required for Docker setup, but sudo needs a password. Re-run from an elevated shell or configure passwordless sudo." >&2
    exit 1
  fi

  sudo -n "$@"
}

echo "JARVIS_PROGRESS:15:Checking Docker runtime"
if ! command -v docker >/dev/null 2>&1 && [ ! -x /usr/local/bin/docker ] && [ ! -x /opt/homebrew/bin/docker ] && [ ! -x /usr/bin/docker ]; then
  curl -fsSL https://get.docker.com | run_as_root sh
fi
if command -v systemctl >/dev/null 2>&1; then
  echo "JARVIS_PROGRESS:28:Starting Docker service"
  run_as_root systemctl enable docker || true
  run_as_root systemctl start docker || true
fi
${dockerShellPreamble()}
`;
}

function dockerBootstrapScriptWindows() {
  return `
$ErrorActionPreference = 'Stop'
function Invoke-AdminExpression {
  param([string]$Command)
  $bytes = [System.Text.Encoding]::Unicode.GetBytes($Command)
  $encoded = [Convert]::ToBase64String($bytes)
  $process = Start-Process powershell.exe -Verb RunAs -Wait -PassThru -ArgumentList @(
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-EncodedCommand',
    $encoded
  )
  if ($process.ExitCode -ne 0) {
    throw "Elevated command failed with exit code $($process.ExitCode): $Command"
  }
}

function Get-WslCommand {
  $existing = Get-Command wsl.exe -ErrorAction SilentlyContinue
  if ($existing) {
    return $existing.Source
  }

  $fallback = Join-Path $env:SystemRoot 'System32\\wsl.exe'
  if (Test-Path $fallback) {
    return $fallback
  }

  throw 'wsl.exe is not available on this Windows installation.'
}

function Ensure-WslRuntime {
  Write-Host 'JARVIS_PROGRESS:10:Checking WSL prerequisites'
  $wslCommand = Get-WslCommand
  & $wslCommand --status *> $null
  if ($LASTEXITCODE -eq 0) {
    return $wslCommand
  }

  Invoke-AdminExpression ('"' + $wslCommand + '" --install --no-distribution')
  $statusOutput = & $wslCommand --status 2>&1 | Out-String
  if ($LASTEXITCODE -ne 0) {
    if ($statusOutput -match 'restart|reboot') {
      throw ('WSL was enabled, but Windows must reboot before Docker can finish installing.' + [Environment]::NewLine + $statusOutput)
    }
    throw ('WSL could not be initialized automatically.' + [Environment]::NewLine + $statusOutput)
  }

  return $wslCommand
}

function Find-DockerDesktopCommand([switch]$AllowMissing) {
  $candidates = @(
    "$Env:ProgramFiles\\Docker\\Docker\\Docker Desktop.exe",
    "$Env:LocalAppData\\Programs\\Docker\\Docker\\Docker Desktop.exe"
  )

  foreach ($candidate in $candidates | Select-Object -Unique) {
    if ($candidate -and (Test-Path $candidate)) {
      return $candidate
    }
  }

  if ($AllowMissing) {
    return $null
  }

  throw 'Docker Desktop was not found after installation.'
}

function Find-DockerCliCommand([switch]$AllowMissing) {
  $existing = Get-Command docker -ErrorAction SilentlyContinue
  if ($existing) {
    return $existing.Source
  }

  $candidates = @(
    "$Env:ProgramFiles\\Docker\\Docker\\resources\\bin\\docker.exe",
    "$Env:ProgramFiles\\Docker\\cli-plugins\\docker.exe",
    "$Env:LocalAppData\\Programs\\Docker\\Docker\\resources\\bin\\docker.exe"
  )

  foreach ($candidate in $candidates | Select-Object -Unique) {
    if ($candidate -and (Test-Path $candidate)) {
      return $candidate
    }
  }

  if ($AllowMissing) {
    return $null
  }

  throw 'docker.exe was not found after Docker Desktop installation.'
}

function Install-DockerDesktop {
  Write-Host 'JARVIS_PROGRESS:28:Installing Docker Desktop'
  $winget = Get-Command winget.exe -ErrorAction SilentlyContinue
  if ($winget) {
    Invoke-AdminExpression 'winget.exe install --id Docker.DockerDesktop --exact --accept-package-agreements --accept-source-agreements --silent'
    return
  }

  $installerPath = Join-Path $env:TEMP 'DockerDesktopInstaller.exe'
  Invoke-WebRequest -UseBasicParsing -Uri 'https://desktop.docker.com/win/main/amd64/Docker%20Desktop%20Installer.exe' -OutFile $installerPath
  $process = Start-Process $installerPath -Verb RunAs -Wait -PassThru -ArgumentList @(
    'install',
    '--quiet',
    '--accept-license',
    '--backend=wsl-2'
  )
  if ($process.ExitCode -ne 0) {
    throw "Docker Desktop installer exited with code $($process.ExitCode)."
  }
}

function Wait-DockerReady([int]$TimeoutSeconds = 360) {
  Write-Host 'JARVIS_PROGRESS:55:Waiting for Docker engine'
  $dockerDesktop = Find-DockerDesktopCommand
  Start-Process $dockerDesktop | Out-Null
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    $dockerCli = Find-DockerCliCommand -AllowMissing
    if ($dockerCli) {
      & $dockerCli info *> $null
      if ($LASTEXITCODE -eq 0) {
        return
      }
    }
    Start-Sleep -Seconds 5
  }

  throw 'Docker Desktop was installed, but the Docker engine did not become ready in time.'
}

$null = Ensure-WslRuntime
if (-not (Find-DockerCliCommand -AllowMissing)) {
  Install-DockerDesktop
}
Wait-DockerReady
Write-Host 'JARVIS_PROGRESS:68:Docker is ready'
${dockerPowerShellPreamble()}
`;
}

function wslJarvisInstallScript(profile: InstallProfile, port: number, repo: string) {
  const configContent = jarvisConfigContent(port);
  return `
${bunBootstrapScript()}
echo "JARVIS_PROGRESS:72:Installing Jarvis packages"
bun install -g @usejarvis/brain
${profile.installSidecar ? 'bun install -g @usejarvis/sidecar' : ''}
echo "JARVIS_PROGRESS:86:Writing Jarvis configuration"
mkdir -p "$HOME/.jarvis"
if [ ! -f "$HOME/.jarvis/config.yaml" ]; then
  printf '%s\n' ${bashQuote(configContent)} > "$HOME/.jarvis/config.yaml"
fi
echo "JARVIS_PROGRESS:96:Finalizing WSL install"
echo "Installed Jarvis from ${repo}"
`;
}

function wslBootstrapScriptWindows(profile: InstallProfile, port: number, repo: string) {
  return `
$ErrorActionPreference = 'Stop'
function Invoke-AdminExpression {
  param([string]$Command)
  $bytes = [System.Text.Encoding]::Unicode.GetBytes($Command)
  $encoded = [Convert]::ToBase64String($bytes)
  $process = Start-Process powershell.exe -Verb RunAs -Wait -PassThru -ArgumentList @(
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-EncodedCommand',
    $encoded
  )
  if ($process.ExitCode -ne 0) {
    throw "Elevated command failed with exit code $($process.ExitCode): $Command"
  }
}

function Get-WslCommand {
  $existing = Get-Command wsl.exe -ErrorAction SilentlyContinue
  if ($existing) {
    return $existing.Source
  }

  $fallback = Join-Path $env:SystemRoot 'System32\\wsl.exe'
  if (Test-Path $fallback) {
    return $fallback
  }

  throw 'wsl.exe is not available on this Windows installation.'
}

function Supports-WslWebDownload([string]$WslCommand) {
  $helpOutput = & $WslCommand --help 2>&1 | Out-String
  return $helpOutput -match '--web-download'
}

function Get-WslDistros([string]$WslCommand) {
  $raw = & $WslCommand -l -q 2>&1 | Out-String
  if ($LASTEXITCODE -ne 0) {
    return @()
  }

  return @(
    $raw -split "\\r?\\n" |
      ForEach-Object { $_.Trim() } |
      Where-Object { $_ }
  )
}

function Ensure-WslRuntime {
  Write-Host 'JARVIS_PROGRESS:10:Checking WSL prerequisites'
  $wslCommand = Get-WslCommand
  & $wslCommand --status *> $null
  if ($LASTEXITCODE -eq 0) {
    return $wslCommand
  }

  Invoke-AdminExpression ('"' + $wslCommand + '" --install --no-distribution')
  $statusOutput = & $wslCommand --status 2>&1 | Out-String
  if ($LASTEXITCODE -ne 0) {
    if ($statusOutput -match 'restart|reboot') {
      throw ('WSL was enabled, but Windows must reboot before setup can continue.' + [Environment]::NewLine + $statusOutput)
    }
    throw ('WSL could not be initialized automatically.' + [Environment]::NewLine + $statusOutput)
  }

  return $wslCommand
}

function Ensure-WslDistro([string]$WslCommand, [string]$PreferredName) {
  Write-Host 'JARVIS_PROGRESS:28:Checking WSL distro'
  $distros = Get-WslDistros $WslCommand
  if ($PreferredName -and ($distros -contains $PreferredName)) {
    return $PreferredName
  }

  if ($distros.Count -eq 0) {
    $target = if ($PreferredName) { $PreferredName } else { 'Ubuntu' }
    Write-Host "JARVIS_PROGRESS:40:Installing WSL distro $target"
    $args = New-Object System.Collections.Generic.List[string]
    $args.Add('--install')
    if (Supports-WslWebDownload $WslCommand) {
      $args.Add('--web-download')
    }
    $args.Add('-d')
    $args.Add($target)
    & $WslCommand @args
    if ($LASTEXITCODE -ne 0) {
      throw "Failed to install the WSL distro '$target'."
    }
    Start-Sleep -Seconds 2
    $distros = Get-WslDistros $WslCommand
  }

  if ($PreferredName -and ($distros -contains $PreferredName)) {
    return $PreferredName
  }

  if ($distros.Count -eq 0) {
    throw 'WSL was enabled, but no Linux distro is available yet.'
  }

  return $distros[0]
}

function Ensure-WslJarvisUser([string]$WslCommand, [string]$DistroName) {
  $existingUser = (& $WslCommand -d $DistroName -- bash -lc "id -un" 2>$null | Out-String).Trim()
  if (-not $existingUser -or $existingUser -eq 'root') {
    $existingUser = (& $WslCommand -d $DistroName -u root -- bash -lc "getent passwd 1000 | cut -d: -f1" 2>$null | Out-String).Trim()
  }

  if (-not $existingUser) {
    $existingUser = 'jarvis'
  }

  if ($existingUser -notmatch '^[a-z_][a-z0-9_-]*[$]?$') {
    throw "WSL username '$existingUser' contains unsupported characters for non-interactive setup."
  }

  Write-Host "JARVIS_PROGRESS:55:Preparing Linux user $existingUser"

$bootstrap = @'
set -euo pipefail
TARGET_USER="\${TARGET_USER:-jarvis}"
if ! id -u "$TARGET_USER" >/dev/null 2>&1; then
  useradd -m -s /bin/bash "$TARGET_USER"
fi
if ! command -v sudo >/dev/null 2>&1; then
  if command -v apt-get >/dev/null 2>&1; then
    apt-get update
    apt-get install -y sudo
  else
    echo "sudo is required for Jarvis bootstrap, but it is not installed on this distro." >&2
    exit 1
  fi
fi
mkdir -p /etc/sudoers.d
printf '%s ALL=(ALL) NOPASSWD:ALL\n' "$TARGET_USER" >"/etc/sudoers.d/90-$TARGET_USER"
chmod 0440 "/etc/sudoers.d/90-$TARGET_USER"
printf '[user]\ndefault=%s\n' "$TARGET_USER" >/etc/wsl.conf
'@

  $bootstrapCommand = 'export TARGET_USER=' + $existingUser + '; ' + $bootstrap
  & $WslCommand -d $DistroName -u root -- bash -lc $bootstrapCommand
  if ($LASTEXITCODE -ne 0) {
    throw 'Failed to prepare a Linux user for Jarvis inside WSL.'
  }

  return $existingUser
}

$desiredDistro = ${pwshQuote(profile.wslDistro || '')}
$wslCommand = Ensure-WslRuntime
$selectedDistro = Ensure-WslDistro $wslCommand $desiredDistro
$selectedUser = Ensure-WslJarvisUser $wslCommand $selectedDistro
$installScript = @'
${wslJarvisInstallScript(profile, port, repo)}
'@

Write-Host "JARVIS_WSL_DISTRO=$selectedDistro"
Write-Host "JARVIS_PROGRESS:65:Running Jarvis install inside WSL"
& $wslCommand -d $selectedDistro -u $selectedUser -- bash -lc $installScript
`;
}

function buildInstallScript(profile: InstallProfile): string {
  const effectiveMode = os.platform() === 'win32' && profile.mode === 'native' ? 'wsl2' : profile.mode;
  const port = normalizePort(profile.port);
  const repo = profile.jarvisRepo || 'https://github.com/vierisid/jarvis.git';
  const containerName = profile.containerName || 'jarvis-daemon';
  const dataDir = profile.dataDir || (effectiveMode === 'docker' ? '~/.jarvis-docker' : '~/.jarvis');
  const configContent = jarvisConfigContent(port);

  if (effectiveMode === 'docker') {
    if (os.platform() === 'win32') {
      return `
${dockerBootstrapScriptWindows()}
$dataDir = ${pwshQuote(dataDir)}
$containerName = ${pwshQuote(containerName)}
$port = ${port}
Write-Host 'JARVIS_PROGRESS:76:Preparing Docker data directory'
New-Item -ItemType Directory -Force -Path $dataDir | Out-Null
Write-Host 'JARVIS_PROGRESS:86:Pulling Jarvis container image'
docker_cmd pull ghcr.io/vierisid/jarvis:latest
try { docker_cmd rm -f $containerName 2>$null | Out-Null } catch { }
Write-Host 'JARVIS_PROGRESS:96:Starting Jarvis container'
docker_cmd run -d --name $containerName --restart unless-stopped -p "$port:3142" -v "${dataDir}:/data" ghcr.io/vierisid/jarvis:latest
`;
    }

    return `
${dockerBootstrapScript()}
echo "JARVIS_PROGRESS:72:Preparing Docker data directory"
mkdir -p ${bashQuote(dataDir)}
echo "JARVIS_PROGRESS:86:Pulling Jarvis container image"
docker_cmd pull ghcr.io/vierisid/jarvis:latest
docker_cmd rm -f ${bashQuote(containerName)} >/dev/null 2>&1 || true
echo "JARVIS_PROGRESS:96:Starting Jarvis container"
docker_cmd run -d --name ${bashQuote(containerName)} --restart unless-stopped -p ${port}:3142 -v ${bashQuote(dataDir)}:/data ghcr.io/vierisid/jarvis:latest
`;
  }

  if (effectiveMode === 'wsl2') {
    if (os.platform() === 'win32') {
      return wslBootstrapScriptWindows(profile, port, repo);
    }
    return wslJarvisInstallScript(profile, port, repo);
  }

  return `
${bunBootstrapScript()}
echo "JARVIS_PROGRESS:72:Installing Jarvis packages"
bun install -g @usejarvis/brain
${profile.installSidecar ? 'bun install -g @usejarvis/sidecar' : ''}
echo "JARVIS_PROGRESS:86:Writing Jarvis configuration"
mkdir -p "$HOME/.jarvis"
if [ ! -f "$HOME/.jarvis/config.yaml" ]; then
  printf '%s\n' ${bashQuote(configContent)} > "$HOME/.jarvis/config.yaml"
fi
echo "JARVIS_PROGRESS:96:Finalizing install"
`;
}

function buildDockerRunCommand(profile: InstallProfile): string {
  const port = normalizePort(profile.port);
  const containerName = profile.containerName || 'jarvis-daemon';
  const dataDir = profile.dataDir || '~/.jarvis-docker';

  if (os.platform() === 'win32') {
    return `docker_cmd run -d --name $containerName --restart unless-stopped -p "$port:3142" -v "${dataDir}:/data" ghcr.io/vierisid/jarvis:latest`;
  }

  return `docker_cmd run -d --name ${bashQuote(containerName)} --restart unless-stopped -p ${port}:3142 -v ${bashQuote(dataDir)}:/data ghcr.io/vierisid/jarvis:latest`;
}

function createInstallProgressParser(
  notify?: (progress: InstallProgress) => void,
): { onChunk: (chunk: string) => void; flush: () => void; finish: (ok: boolean) => void } {
  let buffered = '';
  let percent = 2;
  let message = 'Preparing install';

  notify?.({ percent, message });

  const emitChunk = (chunk: string) => {
    if (!chunk) return;
    notify?.({ percent, message, chunk });
  };

  const processLine = (line: string) => {
    const trimmed = line.replace(/\r?\n$/, '');
    const marker = trimmed.match(/^JARVIS_PROGRESS:(\d{1,3}):(.*)$/);
    if (marker) {
      percent = Math.max(0, Math.min(100, Number.parseInt(marker[1], 10)));
      message = marker[2].trim() || message;
      notify?.({ percent, message });
      return;
    }
    emitChunk(line);
  };

  return {
    onChunk: (chunk: string) => {
      buffered += chunk;
      const lines = buffered.split(/\r?\n/);
      buffered = lines.pop() ?? '';
      for (const line of lines) {
        processLine(`${line}\n`);
      }
    },
    flush: () => {
      if (!buffered) return;
      processLine(buffered);
      buffered = '';
    },
    finish: (ok: boolean) => {
      notify?.({
        percent: ok ? 100 : percent,
        message: ok ? 'Install finished' : message || 'Install failed',
      });
    },
  };
}

function stripProgressMarkers(output: string): string {
  return output
    .split(/\r?\n/)
    .filter((line) => !/^JARVIS_PROGRESS:\d{1,3}:/.test(line))
    .join('\n')
    .trim();
}

export async function installJarvis(
  profile: InstallProfile,
  notifyProgress?: (progress: InstallProgress) => void,
): Promise<InstallResult> {
  const effectiveProfile =
    os.platform() === 'win32' && profile.mode === 'native'
      ? { ...profile, mode: 'wsl2' as const }
      : profile;
  const progress = createInstallProgressParser(notifyProgress);
  const result =
    os.platform() === 'win32' && effectiveProfile.mode === 'wsl2'
      ? await execCommand(
        'powershell.exe',
        ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', buildInstallScript(effectiveProfile)],
        { onStdout: progress.onChunk, onStderr: progress.onChunk },
      )
      : await runProfileCommand(effectiveProfile, buildInstallScript(effectiveProfile), {
        onStdout: progress.onChunk,
        onStderr: progress.onChunk,
      });

  progress.flush();
  progress.finish(result.ok);

  if (result.ok) {
    let profileToSave = effectiveProfile;
    if (os.platform() === 'win32' && effectiveProfile.mode === 'wsl2') {
      const combinedOutput = `${result.stdout}\n${result.stderr}`;
      const matchedDistro = combinedOutput.match(/JARVIS_WSL_DISTRO=([^\r\n]+)/);
      if (matchedDistro?.[1]?.trim()) {
        profileToSave = { ...effectiveProfile, wslDistro: matchedDistro[1].trim() };
      } else if (!effectiveProfile.wslDistro) {
        const summary = await loadSystemSummary();
        if (summary.wslDistros[0]) {
          profileToSave = { ...effectiveProfile, wslDistro: summary.wslDistros[0] };
        }
      }
    }
    await saveProfile(profileToSave);
  }
  return {
    ok: result.ok,
    output: stripProgressMarkers(`${result.stdout}${result.stderr}`),
    dashboardUrl: `http://localhost:${normalizePort(profile.port)}`,
  };
}

export async function runLifecycleAction(profile: InstallProfile, action: LifecycleAction): Promise<LifecycleResult> {
  return lifecycle(profile, action);
}

export async function detectJarvisState(profile: InstallProfile): Promise<InstallState> {
  return detectInstallState(profile);
}

function buildUpdateScript(profile: InstallProfile): string {
  const containerName = profile.containerName || 'jarvis-daemon';

  if (profile.mode === 'docker') {
    if (os.platform() === 'win32') {
      return `
${dockerPowerShellPreamble()}
$dataDir = ${pwshQuote(profile.dataDir || '~/.jarvis-docker')}
$containerName = ${pwshQuote(containerName)}
$port = ${normalizePort(profile.port)}
docker_cmd pull ghcr.io/vierisid/jarvis:latest
try { docker_cmd rm -f $containerName 2>$null | Out-Null } catch { }
${buildDockerRunCommand(profile)}
`;
    }
    return `
${dockerShellPreamble()}
docker_cmd pull ghcr.io/vierisid/jarvis:latest
docker_cmd rm -f ${bashQuote(containerName)} >/dev/null 2>&1 || true
${buildDockerRunCommand(profile)}
`;
  }

  // native and wsl2
  return `
set -euo pipefail
export BUN_INSTALL="$HOME/.bun"
export PATH="$HOME/.bun/bin:$PATH"
if command -v jarvis >/dev/null 2>&1; then
  jarvis update || bun install -g @usejarvis/brain@latest
else
  bun install -g @usejarvis/brain@latest
fi
bun install -g @usejarvis/sidecar@latest 2>/dev/null || true
`;
}

export async function updateJarvis(profile: InstallProfile): Promise<UpdateResult> {
  const result = await runProfileCommand(profile, buildUpdateScript(profile));
  return {
    ok: result.ok,
    output: `${result.stdout}${result.stderr}`.trim(),
  };
}

export async function loadSystemSummaryWrapped(): Promise<SystemSummary> {
  return loadSystemSummary();
}

export { loadSystemSummaryWrapped as loadSystemSummary };
