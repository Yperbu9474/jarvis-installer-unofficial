"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.c = exports.PROFILE_PATH = exports.CONFIG_PATH = exports.CONFIG_DIR = void 0;
exports.log = log;
exports.warn = warn;
exports.error = error;
exports.ok = ok;
exports.step = step;
exports.run = run;
exports.runLive = runLive;
exports.shellEscape = shellEscape;
exports.hasCommand = hasCommand;
exports.getDockerCommand = getDockerCommand;
exports.ask = ask;
exports.askSecret = askSecret;
exports.loadProfile = loadProfile;
exports.saveProfile = saveProfile;
const child_process_1 = require("child_process");
const util_1 = require("util");
const readline = __importStar(require("readline"));
const os = __importStar(require("os"));
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const execAsync = (0, util_1.promisify)(child_process_1.exec);
// Paths
exports.CONFIG_DIR = path.join(os.homedir(), '.jarvis');
exports.CONFIG_PATH = path.join(exports.CONFIG_DIR, 'config.yaml');
exports.PROFILE_PATH = path.join(os.homedir(), '.config', 'jarvis-installer', 'profile.json');
// Color helpers
exports.c = {
    green: (s) => `\x1b[32m${s}\x1b[0m`,
    yellow: (s) => `\x1b[33m${s}\x1b[0m`,
    red: (s) => `\x1b[31m${s}\x1b[0m`,
    cyan: (s) => `\x1b[36m${s}\x1b[0m`,
    bold: (s) => `\x1b[1m${s}\x1b[0m`,
    dim: (s) => `\x1b[2m${s}\x1b[0m`,
};
function log(msg) {
    console.log(`${exports.c.green('[jarv]')} ${msg}`);
}
function warn(msg) {
    console.log(`${exports.c.yellow('[warn]')} ${msg}`);
}
function error(msg) {
    console.error(`${exports.c.red('[error]')} ${msg}`);
}
function ok(msg) {
    console.log(`${exports.c.green('✓')} ${msg}`);
}
function step(n, total, msg) {
    console.log(`${exports.c.cyan(`[${n}/${total}]`)} ${msg}`);
}
async function run(cmd) {
    try {
        const { stdout, stderr } = await execAsync(cmd);
        return { ok: true, output: stdout + stderr, code: 0 };
    }
    catch (e) {
        const err = e;
        return {
            ok: false,
            output: (err.stdout || '') + (err.stderr || ''),
            code: err.code ?? 1,
        };
    }
}
async function runLive(cmd) {
    return new Promise((resolve) => {
        const child = (0, child_process_1.spawn)('sh', ['-c', cmd], { stdio: 'inherit' });
        child.on('close', (code) => resolve(code === 0));
    });
}
function shellEscape(value) {
    return `'${value.replace(/'/g, `'\\''`)}'`;
}
async function hasCommand(command) {
    const result = await run(`command -v ${command} >/dev/null 2>&1`);
    return result.ok;
}
function shellPrefix(host) {
    return host ? `DOCKER_HOST=${shellEscape(host)} ` : '';
}
function buildDockerCommand(binary, host, useSudo = false) {
    const escapedBinary = shellEscape(binary);
    if (useSudo) {
        return host
            ? `sudo env DOCKER_HOST=${shellEscape(host)} ${escapedBinary}`
            : `sudo ${escapedBinary}`;
    }
    return `${shellPrefix(host)}${escapedBinary}`;
}
function dockerHostCandidates() {
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
async function findDockerBinary() {
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
async function ensureDockerInstalled() {
    if (await findDockerBinary()) {
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
    }
    else if (process.platform === 'darwin') {
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
    }
    else {
        error('Docker is required on this platform, but automatic installation is not supported here.');
        process.exit(1);
    }
    if (!(await findDockerBinary())) {
        error('Docker installation finished, but the `docker` command is still unavailable.');
        process.exit(1);
    }
}
async function waitForDockerReady(command) {
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
async function getDockerCommand() {
    await ensureDockerInstalled();
    const dockerBinary = await findDockerBinary();
    if (!dockerBinary) {
        error('Docker was expected to be installed, but the Docker CLI could not be found.');
        process.exit(1);
    }
    const hosts = ['', ...dockerHostCandidates()];
    const triedCommands = new Set();
    const permissionDeniedCommands = [];
    const tryCommand = async (host, useSudo = false) => {
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
        await runLive('sudo systemctl enable --now docker');
        for (const host of hosts) {
            const command = buildDockerCommand(dockerBinary, host || undefined);
            if (await waitForDockerReady(command)) {
                return command;
            }
        }
    }
    if (permissionDeniedCommands.length) {
        warn('Docker requires elevated privileges in this shell. Using sudo for Docker commands.');
        const sudoReady = await runLive('sudo -v');
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
    }
    else {
        error('Docker is installed, but no reachable Docker daemon was found. Checked common Docker, Colima, Rancher Desktop, and local socket locations.');
    }
    process.exit(1);
}
async function ask(question, defaultVal) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const prompt = defaultVal ? `${question} [${defaultVal}]: ` : `${question}: `;
    return new Promise((resolve) => {
        rl.question(prompt, (answer) => {
            rl.close();
            resolve(answer.trim() || defaultVal || '');
        });
    });
}
async function askSecret(question) {
    return new Promise((resolve) => {
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        process.stdout.write(`${question}: `);
        process.stdin.setRawMode?.(true);
        let secret = '';
        process.stdin.once('data', function handler(data) {
            process.stdin.setRawMode?.(false);
            rl.close();
            // For simplicity, read as normal when raw mode not available
            secret = data.toString().trim();
            resolve(secret);
        });
    });
}
function loadProfile() {
    try {
        if (fs.existsSync(exports.PROFILE_PATH)) {
            const raw = fs.readFileSync(exports.PROFILE_PATH, 'utf-8');
            return JSON.parse(raw);
        }
    }
    catch {
        // ignore
    }
    return null;
}
function saveProfile(profile) {
    const dir = path.dirname(exports.PROFILE_PATH);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(exports.PROFILE_PATH, JSON.stringify(profile, null, 2));
}
