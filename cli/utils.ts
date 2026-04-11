import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import * as readline from 'readline';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';

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

export function shellEscape(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

export async function hasCommand(command: string): Promise<boolean> {
  const result = await run(`command -v ${command} >/dev/null 2>&1`);
  return result.ok;
}

async function ensureDockerInstalled(): Promise<void> {
  if (await hasCommand('docker')) {
    return;
  }

  log('Docker not found. Attempting automatic installation...');

  if (process.platform === 'linux') {
    if (!(await hasCommand('apt-get'))) {
      error('Docker is required but this Linux distro is not supported for automatic installation. Please install Docker manually and rerun `jarv install`.');
      process.exit(1);
    }

    const installed = await runLive('sudo apt-get update -y && sudo apt-get install -y docker.io');
    if (!installed) {
      error('Failed to install Docker with apt-get.');
      process.exit(1);
    }

    if (await hasCommand('systemctl')) {
      const started = await runLive('sudo systemctl enable --now docker');
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

  if (!(await hasCommand('docker'))) {
    error('Docker installation finished, but the `docker` command is still unavailable.');
    process.exit(1);
  }
}

async function ensureDockerDaemonReady(dockerCommand: string): Promise<void> {
  const ready = await run(`${dockerCommand} info >/dev/null 2>&1`);
  if (ready.ok) {
    return;
  }

  if (process.platform === 'linux' && await hasCommand('systemctl')) {
    log('Starting Docker service...');
    const started = await runLive('sudo systemctl enable --now docker');
    if (started) {
      const retry = await run(`${dockerCommand} info >/dev/null 2>&1`);
      if (retry.ok) {
        return;
      }
    }
  }

  if (process.platform === 'darwin') {
    error('Docker is installed, but the daemon is not running. Open Docker Desktop and rerun the command.');
  } else {
    error('Docker is installed, but it is not ready yet. Make sure the Docker service is running and rerun the command.');
  }
  process.exit(1);
}

export async function getDockerCommand(): Promise<string> {
  await ensureDockerInstalled();

  const direct = await run('docker info 2>&1');
  if (direct.ok) {
    return 'docker';
  }

  const permissionDenied = /permission denied/i.test(direct.output);
  const dockerCommand = permissionDenied ? 'sudo docker' : 'docker';

  if (permissionDenied) {
    warn('Docker requires elevated privileges in this shell. Using sudo for Docker commands.');
    const sudoReady = await runLive('sudo -v');
    if (!sudoReady) {
      error('Unable to acquire sudo privileges for Docker commands.');
      process.exit(1);
    }
  }

  await ensureDockerDaemonReady(dockerCommand);
  return dockerCommand;
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
