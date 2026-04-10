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
