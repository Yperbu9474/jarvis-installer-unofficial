"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runUpdate = runUpdate;
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
        (0, utils_1.log)('Pulling latest Jarvis Docker image...');
        const pull = await (0, utils_1.runLive)(`${dockerCommand} pull ghcr.io/vierisid/jarvis:latest`);
        if (!pull) {
            (0, utils_1.error)('Failed to pull latest image.');
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
