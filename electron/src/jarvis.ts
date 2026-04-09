import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { app } from 'electron';
import type { InstallProfile, InstallResult, InstallState, LifecycleAction, LifecycleResult, SystemSummary } from '../../src/lib/types';
import { detectInstallState, lifecycle, loadSystemSummary, runProfileCommand } from './runtime';

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
  sudo apt-get update && sudo apt-get install -y ${joined}
elif command -v dnf >/dev/null 2>&1; then
  sudo dnf install -y ${joined}
elif command -v yum >/dev/null 2>&1; then
  sudo yum install -y ${joined}
elif command -v pacman >/dev/null 2>&1; then
  sudo pacman -Sy --noconfirm ${joined}
elif command -v zypper >/dev/null 2>&1; then
  sudo zypper --non-interactive install ${joined}
elif command -v apk >/dev/null 2>&1; then
  sudo apk add ${joined}
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

function bunBootstrapScript() {
  return `
set -euo pipefail
if ! command -v curl >/dev/null 2>&1; then
  ${bashInstallPackages(['curl'])}
fi
if ! command -v git >/dev/null 2>&1; then
  ${bashInstallPackages(['git'])}
fi
if ! command -v unzip >/dev/null 2>&1; then
  ${bashInstallPackages(['unzip'])}
fi
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
if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sh
fi
if command -v systemctl >/dev/null 2>&1; then
  sudo systemctl enable docker || true
  sudo systemctl start docker || true
fi
`;
}

function dockerBootstrapScriptWindows() {
  return `
$ErrorActionPreference = 'Stop'
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  throw 'Docker is not installed. Install Docker Desktop or Docker Engine first, then rerun the installer.'
}
`;
}

function buildInstallScript(profile: InstallProfile): string {
  const port = profile.port || 3142;
  const repo = profile.jarvisRepo || 'https://github.com/vierisid/jarvis.git';
  const containerName = profile.containerName || 'jarvis-daemon';
  const dataDir = profile.dataDir || (profile.mode === 'docker' ? '~/.jarvis-docker' : '~/.jarvis');

  if (profile.mode === 'docker') {
    if (os.platform() === 'win32') {
      return `
${dockerBootstrapScriptWindows()}
$dataDir = ${pwshQuote(dataDir)}
$containerName = ${pwshQuote(containerName)}
$port = ${port}
New-Item -ItemType Directory -Force -Path $dataDir | Out-Null
docker pull ghcr.io/vierisid/jarvis:latest
docker rm -f $containerName 2>$null | Out-Null
docker run -d --name $containerName --restart unless-stopped -p "$port:3142" -v "${dataDir}:/data" ghcr.io/vierisid/jarvis:latest
`;
    }

    return `
${dockerBootstrapScript()}
mkdir -p ${bashQuote(dataDir)}
docker pull ghcr.io/vierisid/jarvis:latest
docker rm -f ${bashQuote(containerName)} >/dev/null 2>&1 || true
docker run -d --name ${bashQuote(containerName)} --restart unless-stopped -p ${port}:3142 -v ${bashQuote(dataDir)}:/data ghcr.io/vierisid/jarvis:latest
`;
  }

  if (profile.mode === 'wsl2') {
    return `
${bunBootstrapScript()}
bun install -g @usejarvis/brain
${profile.installSidecar ? 'bun install -g @usejarvis/sidecar' : ''}
echo "Installed Jarvis from ${repo}"
`;
  }

  return `
${bunBootstrapScript()}
bun install -g @usejarvis/brain
${profile.installSidecar ? 'bun install -g @usejarvis/sidecar' : ''}
`;
}

export async function installJarvis(profile: InstallProfile): Promise<InstallResult> {
  const result = await runProfileCommand(profile, buildInstallScript(profile));
  if (result.ok) {
    await saveProfile(profile);
  }
  return {
    ok: result.ok,
    output: `${result.stdout}${result.stderr}`.trim(),
    dashboardUrl: `http://localhost:${profile.port || 3142}`,
  };
}

export async function runLifecycleAction(profile: InstallProfile, action: LifecycleAction): Promise<LifecycleResult> {
  return lifecycle(profile, action);
}

export async function detectJarvisState(profile: InstallProfile): Promise<InstallState> {
  return detectInstallState(profile);
}

export async function loadSystemSummaryWrapped(): Promise<SystemSummary> {
  return loadSystemSummary();
}

export { loadSystemSummaryWrapped as loadSystemSummary };
