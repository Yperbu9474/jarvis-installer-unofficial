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
exports.runInstall = runInstall;
const child_process_1 = require("child_process");
const fs = __importStar(require("fs"));
const utils_1 = require("../utils");
function parseArgs(args) {
    const result = {};
    for (let i = 0; i < args.length; i++) {
        if (args[i].startsWith('--')) {
            const key = args[i].slice(2);
            if (i + 1 < args.length && !args[i + 1].startsWith('--')) {
                result[key] = args[i + 1];
                i++;
            }
            else {
                result[key] = true;
            }
        }
    }
    return result;
}
async function runInstall(args) {
    const flags = parseArgs(args);
    (0, utils_1.log)('Welcome to the Jarvis installer!');
    console.log('');
    // Step 1: mode
    let mode = flags['mode'] || '';
    if (!mode) {
        mode = await (0, utils_1.ask)('Installation mode (native/docker)', 'docker');
    }
    if (mode !== 'native' && mode !== 'docker') {
        (0, utils_1.error)(`Invalid mode: ${mode}. Must be native or docker.`);
        process.exit(1);
    }
    // Step 2: port
    let portStr = flags['port'] || '';
    if (!portStr) {
        portStr = await (0, utils_1.ask)('Port for Jarvis daemon', '3000');
    }
    const port = parseInt(portStr, 10);
    if (isNaN(port)) {
        (0, utils_1.error)('Invalid port number.');
        process.exit(1);
    }
    // Step 3: data dir
    let dataDir = flags['data-dir'] || '';
    if (!dataDir) {
        dataDir = await (0, utils_1.ask)('Data directory', utils_1.CONFIG_DIR);
    }
    const containerName = 'jarvis-daemon';
    // Summary
    console.log('');
    console.log(utils_1.c.bold('Summary:'));
    console.log(`  Mode:      ${utils_1.c.cyan(mode)}`);
    console.log(`  Port:      ${utils_1.c.cyan(String(port))}`);
    console.log(`  Data dir:  ${utils_1.c.cyan(dataDir)}`);
    console.log('');
    const confirm = await (0, utils_1.ask)('Proceed? [Y/n]', 'Y');
    if (confirm.toLowerCase() === 'n') {
        (0, utils_1.warn)('Installation cancelled.');
        return;
    }
    const TOTAL = mode === 'docker' ? 3 : 5;
    if (mode === 'docker') {
        (0, utils_1.step)(1, TOTAL, 'Pulling Jarvis Docker image...');
        const pull = await (0, utils_1.runLive)('docker pull ghcr.io/vierisid/jarvis:latest');
        if (!pull) {
            (0, utils_1.error)('Failed to pull Docker image.');
            process.exit(1);
        }
        (0, utils_1.step)(2, TOTAL, 'Removing existing container (if any)...');
        await (0, utils_1.run)(`docker rm -f ${containerName} 2>/dev/null || true`);
        (0, utils_1.step)(3, TOTAL, `Starting container on port ${port}...`);
        const started = await (0, utils_1.runLive)(`docker run -d --name ${containerName} -p ${port}:3142 -v ${dataDir}:/app/data ghcr.io/vierisid/jarvis:latest`);
        if (!started) {
            (0, utils_1.error)('Failed to start container.');
            process.exit(1);
        }
    }
    else {
        // native mode
        (0, utils_1.step)(1, TOTAL, 'Installing Bun...');
        const bunInstall = await (0, utils_1.runLive)('curl -fsSL https://bun.sh/install | bash');
        if (!bunInstall) {
            (0, utils_1.warn)('Bun install may have failed. Continuing...');
        }
        (0, utils_1.step)(2, TOTAL, 'Installing Jarvis packages globally...');
        const pkgInstall = await (0, utils_1.runLive)('source ~/.bashrc 2>/dev/null; bun add -g @usejarvis/brain @usejarvis/sidecar');
        if (!pkgInstall) {
            (0, utils_1.error)('Failed to install Jarvis packages.');
            process.exit(1);
        }
        (0, utils_1.step)(3, TOTAL, `Creating data directory ${dataDir}...`);
        fs.mkdirSync(dataDir, { recursive: true });
        (0, utils_1.step)(4, TOTAL, 'Writing config.yaml...');
        const configContent = `port: ${port}\ndata_dir: ${dataDir}\n`;
        fs.writeFileSync(utils_1.CONFIG_PATH, configContent);
        (0, utils_1.step)(5, TOTAL, 'Running Jarvis onboarding wizard...');
        await new Promise((resolve) => {
            const child = (0, child_process_1.spawn)('jarvis', ['onboard'], { stdio: 'inherit', shell: true });
            child.on('close', () => resolve());
        });
    }
    // Save profile
    (0, utils_1.saveProfile)({ mode, port, containerName, dataDir });
    console.log('');
    (0, utils_1.ok)(`Jarvis installed successfully!`);
    (0, utils_1.log)(`Dashboard: ${utils_1.c.cyan(`http://localhost:${port}`)}`);
}
