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
exports.runUpdate = runUpdate;
const fs = __importStar(require("fs"));
const utils_1 = require("../utils");
async function runUpdate(_args) {
    const profile = (0, utils_1.loadProfile)();
    if (!profile) {
        (0, utils_1.error)('No Jarvis profile found. Run `jarv install` first.');
        process.exit(1);
    }
    const { mode, containerName = 'jarvis-daemon', port = 3142, dataDir = '~/.jarvis-docker' } = profile;
    if (mode === 'docker') {
        const dockerCommand = await (0, utils_1.getDockerCommand)();
        const prepareDataDirCommand = `${dockerCommand} run --rm --user 0:0 -v ${(0, utils_1.shellEscape)(dataDir)}:/data ` +
            `--entrypoint sh ghcr.io/vierisid/jarvis:latest -lc ${(0, utils_1.shellEscape)('mkdir -p /data && chown -R 999:999 /data')}`;
        fs.mkdirSync(dataDir, { recursive: true });
        (0, utils_1.log)('Pulling latest Jarvis Docker image...');
        const pull = await (0, utils_1.runLive)(`${dockerCommand} pull ghcr.io/vierisid/jarvis:latest`);
        if (!pull) {
            (0, utils_1.error)('Failed to pull latest image.');
            process.exit(1);
        }
        (0, utils_1.log)(`Preparing Docker data directory ${dataDir}...`);
        const prepared = await (0, utils_1.runLive)(prepareDataDirCommand);
        if (!prepared) {
            (0, utils_1.error)('Failed to prepare Docker data directory permissions.');
            process.exit(1);
        }
        (0, utils_1.log)(`Recreating container ${containerName} with the latest image...`);
        const restart = await (0, utils_1.runLive)(`${dockerCommand} rm -f ${(0, utils_1.shellEscape)(containerName)} >/dev/null 2>&1 || true && ` +
            `${dockerCommand} run -d --name ${(0, utils_1.shellEscape)(containerName)} -p ${port}:3142 -v ${(0, utils_1.shellEscape)(dataDir)}:/data ghcr.io/vierisid/jarvis:latest`);
        if (!restart) {
            (0, utils_1.error)('Failed to recreate container with the latest image.');
            process.exit(1);
        }
        (0, utils_1.ok)('Jarvis updated and restarted successfully!');
    }
    else {
        // native mode: try jarvis update first, fall back to bun
        (0, utils_1.log)('Attempting native update via `jarvis update`...');
        const result = await (0, utils_1.run)('jarvis update');
        if (result.ok) {
            (0, utils_1.ok)('Updated via `jarvis update`.');
        }
        else {
            (0, utils_1.warn)('`jarvis update` failed, falling back to bun install...');
            const bunUpdate = await (0, utils_1.runLive)('bun add -g @usejarvis/brain@latest @usejarvis/sidecar@latest');
            if (!bunUpdate) {
                (0, utils_1.error)('Failed to update Jarvis packages.');
                process.exit(1);
            }
            (0, utils_1.ok)('Updated via bun.');
        }
    }
}
