import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import * as readline from 'readline';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import * as net from 'net';

const execAsync = promisify(exec);

// Paths
export const CONFIG_DIR = path.join(os.homedir(), '.jarvis');
export const CONFIG_PATH = path.join(CONFIG_DIR, 'config.yaml');
export const PROFILE_PATH = path.join(os.homedir(), '.config', 'jarvis-installer', 'profile.json');

// Color helpers
export const c = {
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
};

export function log(msg: string): void {
  console.log(`${c.green('[jarv]')} ${msg}`);
}

export function warn(msg: string): void {
  console.log(`${c.yellow('[warn]')} ${msg}`);
}

export function error(msg: string): void {
  console.error(`${c.red('[error]')} ${msg}`);
}

export function ok(msg: string): void {
  console.log(`${c.green('✓')} ${msg}`);
}

export function step(n: number, total: number, msg: string): void {
  console.log(`${c.cyan(`[${n}/${total}]`)} ${msg}`);
}

export async function run(cmd: string): Promise<{ ok: boolean; output: string; code: number }> {
  try {
    const { stdout, stderr } = await execAsync(cmd);
    return { ok: true, output: stdout + stderr, code: 0 };
  } catch (e: unknown) {
    const err = e as { stdout?: string; stderr?: string; code?: number };
    return {
      ok: false,
      output: (err.stdout || '') + (err.stderr || ''),
      code: err.code ?? 1,
    };
  }
}

export async function runLive(cmd: string): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn('sh', ['-c', cmd], { stdio: 'inherit' });
    child.on('close', (code) => resolve(code === 0));
  });
}

function parsePidList(output: string): number[] {
  return [...new Set(
    output
      .split(/\r?\n/)
      .flatMap((line) => line.match(/\d+/g) ?? [])
      .map((value) => Number.parseInt(value, 10))
      .filter((value) => Number.isInteger(value) && value > 0 && value !== process.pid)
  )];
}

function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function waitForExit(pid: number, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!isPidAlive(pid)) return true;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  return !isPidAlive(pid);
}

/**
 * Check whether a PID belongs to a Jarvis-related process by inspecting its
 * command line.  Returns false when the process cannot be inspected (already
 * exited, permission denied, etc.) so the caller defaults to *not* killing.
 */
async function isJarvisProcess(pid: number): Promise<boolean> {
  if (process.platform === 'win32') {
    const result = await run(
      `powershell -NoProfile -Command "(Get-Process -Id ${pid} -ErrorAction SilentlyContinue).Path"`,
    );
    return result.ok && /jarvis|bun/i.test(result.output);
  }
  const result = await run(`ps -p ${pid} -o args= 2>/dev/null`);
  return result.ok && /jarvis/i.test(result.output);
}

/**
 * Attempt to bind to `port` on 127.0.0.1 as a reliable check that nothing is
 * listening.  Works even when lsof/ss are unavailable.
 */
function isPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close(() => resolve(true));
    });
    server.listen(port, '127.0.0.1');
  });
}

async function findListeningPids(port: number): Promise<{ pids: number[]; toolAvailable: boolean }> {
  if (process.platform === 'win32') {
    const result = await run(`powershell -NoProfile -Command "(Get-NetTCPConnection -State Listen -LocalPort ${port} -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess) -join '\n'"`);
    // PowerShell is always available on Windows.
    return { pids: parsePidList(result.output), toolAvailable: true };
  }

  // Try lsof first — don't swallow tool-absence with `|| true`.
  const hasLsof = await run('command -v lsof >/dev/null 2>&1');
  if (hasLsof.ok) {
    const lsofResult = await run(`lsof -ti tcp:${port} -sTCP:LISTEN 2>/dev/null`);
    const lsofPids = parsePidList(lsofResult.output);
    if (lsofPids.length > 0) return { pids: lsofPids, toolAvailable: true };
    // lsof ran but found nothing → port is genuinely free.
    return { pids: [], toolAvailable: true };
  }

  // Fall back to ss.
  const hasSs = await run('command -v ss >/dev/null 2>&1');
  if (hasSs.ok) {
    const ssResult = await run(`ss -ltnp '( sport = :${port} )' 2>/dev/null`);
    const ssPids = [...new Set(
      Array.from(ssResult.output.matchAll(/pid=(\d+)/g))
        .map((match) => Number.parseInt(match[1]!, 10))
        .filter((value) => Number.isInteger(value) && value > 0 && value !== process.pid)
    )];
    return { pids: ssPids, toolAvailable: true };
  }

  // Neither tool available — caller must use a fallback verification.
  return { pids: [], toolAvailable: false };
}

export async function ensurePortReleased(port: number): Promise<{ released: boolean; terminated: number[]; forced: number[]; skippedNonJarvis: number[] }> {
  const initial = await findListeningPids(port);

  if (initial.pids.length === 0) {
    // No PIDs found — always confirm with a bind check because lsof/ss can
    // miss listeners (permissions, race conditions, missing tools).
    return { released: await isPortFree(port), terminated: [], forced: [], skippedNonJarvis: [] };
  }

  const terminated: number[] = [];
  const forced: number[] = [];
  const skippedNonJarvis: number[] = [];

  for (const pid of initial.pids) {
    if (!isPidAlive(pid)) continue;

    // Only kill processes that look like Jarvis; skip unrelated listeners.
    if (!(await isJarvisProcess(pid))) {
      skippedNonJarvis.push(pid);
      continue;
    }

    try {
      process.kill(pid, 'SIGTERM');
      if (await waitForExit(pid, 2000)) {
        terminated.push(pid);
        continue;
      }
    } catch {
      // Fall through to final verification.
    }

    if (!isPidAlive(pid)) {
      terminated.push(pid);
      continue;
    }

    try {
      process.kill(pid, 'SIGKILL');
      if (await waitForExit(pid, 1000)) {
        forced.push(pid);
      }
    } catch {
      // Ignore individual kill failures and verify the port at the end.
    }
  }

  // Use bind check as the authoritative final verification.
  return {
    released: await isPortFree(port),
    terminated,
    forced,
    skippedNonJarvis,
  };
}

export function shellEscape(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

export async function hasCommand(command: string): Promise<boolean> {
  const result = await run(`command -v ${command} >/dev/null 2>&1`);
  return result.ok;
}

function shellPrefix(host?: string): string {
  return host ? `DOCKER_HOST=${shellEscape(host)} ` : '';
}

function sudoPrefix(): string {
  return 'sudo -n';
}

async function ensureSudoReady(): Promise<boolean> {
  const nonInteractive = await run(`${sudoPrefix()} true 2>/dev/null`);
  if (nonInteractive.ok) {
    return true;
  }

  return runLive('sudo -v');
}

function buildDockerCommand(binary: string, host?: string, useSudo = false): string {
  const escapedBinary = shellEscape(binary);
  if (useSudo) {
    return host
      ? `${sudoPrefix()} env DOCKER_HOST=${shellEscape(host)} ${escapedBinary}`
      : `${sudoPrefix()} ${escapedBinary}`;
  }

  return `${shellPrefix(host)}${escapedBinary}`;
}

function dockerHostCandidates(): string[] {
  const home = os.homedir();
  const candidates = [
    process.env.DOCKER_HOST || '',
    `unix://${home}/.docker/run/docker.sock`,
    `unix://${home}/.docker/desktop/docker.sock`,
    process.env.XDG_RUNTIME_DIR ? `unix://${process.env.XDG_RUNTIME_DIR}/docker.sock` : '',
    `unix://${home}/.colima/default/docker.sock`,
    `unix://${home}/.rd/docker.sock`,
    'unix:///var/run/docker.sock',
  ];

  return [...new Set(candidates.filter(Boolean))];
}

async function findDockerBinary(): Promise<string | null> {
  const pathResult = await run('command -v docker 2>/dev/null');
  if (pathResult.ok) {
    return pathResult.output.trim() || 'docker';
  }

  for (const candidate of ['/usr/local/bin/docker', '/opt/homebrew/bin/docker', '/usr/bin/docker']) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

async function ensureDockerInstalled(): Promise<void> {
  if (await findDockerBinary()) {
    return;
  }

  log('Docker not found. Attempting automatic installation...');

  if (process.platform === 'linux') {
    if (!(await hasCommand('apt-get'))) {
      error('Docker is required but this Linux distro is not supported for automatic installation. Please install Docker manually and rerun `jarv install`.');
      process.exit(1);
    }

    if (!(await ensureSudoReady())) {
      error('Docker is required, but sudo privileges could not be acquired for automatic installation.');
      process.exit(1);
    }

    const installed = await runLive(`${sudoPrefix()} apt-get update -y && ${sudoPrefix()} apt-get install -y docker.io`);
    if (!installed) {
      error('Failed to install Docker with apt-get.');
      process.exit(1);
    }

    if (await hasCommand('systemctl')) {
      const started = await runLive(`${sudoPrefix()} systemctl enable --now docker`);
      if (!started) {
        warn('Docker was installed, but the Docker service could not be started automatically.');
      }
    }
  } else if (process.platform === 'darwin') {
    if (!(await hasCommand('brew'))) {
      error('Docker is required but Homebrew is not installed. Install Docker Desktop manually, open it once, and rerun `jarv install`.');
      process.exit(1);
    }

    const installed = await runLive('brew install --cask docker');
    if (!installed) {
      error('Failed to install Docker Desktop with Homebrew.');
      process.exit(1);
    }

    warn('Docker Desktop may need to be opened once before the Docker daemon becomes available.');
  } else {
    error('Docker is required on this platform, but automatic installation is not supported here.');
    process.exit(1);
  }

  if (!(await findDockerBinary())) {
    error('Docker installation finished, but the `docker` command is still unavailable.');
    process.exit(1);
  }
}

async function waitForDockerReady(command: string): Promise<boolean> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const result = await run(`${command} info 2>&1`);
    if (result.ok) {
      return true;
    }

    if (attempt < 4) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }

  return false;
}

export async function getDockerCommand(): Promise<string> {
  await ensureDockerInstalled();
  const dockerBinary = await findDockerBinary();
  if (!dockerBinary) {
    error('Docker was expected to be installed, but the Docker CLI could not be found.');
    process.exit(1);
  }

  const hosts = ['' as string, ...dockerHostCandidates()];
  const triedCommands = new Set<string>();
  const permissionDeniedCommands: string[] = [];

  const tryCommand = async (host?: string, useSudo = false): Promise<string | null> => {
    const command = buildDockerCommand(dockerBinary, host || undefined, useSudo);
    if (triedCommands.has(command)) {
      return null;
    }
    triedCommands.add(command);

    const result = await run(`${command} info 2>&1`);
    if (result.ok) {
      return command;
    }

    if (/permission denied/i.test(result.output)) {
      permissionDeniedCommands.push(command);
    }

    return null;
  };

  for (const host of hosts) {
    const working = await tryCommand(host);
    if (working) {
      return working;
    }
  }

  if (process.platform === 'linux' && await hasCommand('systemctl')) {
    log('Starting Docker service...');
    if (await ensureSudoReady()) {
      await runLive(`${sudoPrefix()} systemctl enable --now docker`);
    }

    for (const host of hosts) {
      const command = buildDockerCommand(dockerBinary, host || undefined);
      if (await waitForDockerReady(command)) {
        return command;
      }
    }
  }

  if (permissionDeniedCommands.length) {
    warn('Docker requires elevated privileges in this shell. Using sudo for Docker commands.');
    const sudoReady = await ensureSudoReady();
    if (!sudoReady) {
      error('Unable to acquire sudo privileges for Docker commands.');
      process.exit(1);
    }

    for (const host of hosts) {
      const command = buildDockerCommand(dockerBinary, host || undefined, true);
      if (await waitForDockerReady(command)) {
        return command;
      }
    }
  }

  if (process.platform === 'darwin') {
    error('Docker is installed, but no reachable Docker daemon was found. Open Docker Desktop or start your container runtime and rerun the command.');
  } else {
    error('Docker is installed, but no reachable Docker daemon was found. Checked common Docker, Colima, Rancher Desktop, and local socket locations.');
  }
  process.exit(1);
}

export async function ask(question: string, defaultVal?: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const prompt = defaultVal ? `${question} [${defaultVal}]: ` : `${question}: `;
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer.trim() || defaultVal || '');
    });
  });
}

export async function askSecret(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    process.stdout.write(`${question}: `);
    process.stdin.setRawMode?.(true);
    let secret = '';
    process.stdin.once('data', function handler(data: Buffer) {
      process.stdin.setRawMode?.(false);
      rl.close();
      // For simplicity, read as normal when raw mode not available
      secret = data.toString().trim();
      resolve(secret);
    });
  });
}

export interface Profile {
  mode: string;
  port: number;
  containerName?: string;
  dataDir?: string;
}

export function loadProfile(): Profile | null {
  try {
    if (fs.existsSync(PROFILE_PATH)) {
      const raw = fs.readFileSync(PROFILE_PATH, 'utf-8');
      return JSON.parse(raw) as Profile;
    }
  } catch {
    // ignore
  }
  return null;
}

export function saveProfile(profile: Record<string, unknown>): void {
  const dir = path.dirname(PROFILE_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(PROFILE_PATH, JSON.stringify(profile, null, 2));
}
