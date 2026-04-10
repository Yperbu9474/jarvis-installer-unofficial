"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runLifecycle = runLifecycle;
const utils_1 = require("../utils");
async function runLifecycle(action, _args) {
    const profile = (0, utils_1.loadProfile)();
    if (!profile) {
        (0, utils_1.error)('No Jarvis profile found. Run `jarv install` first.');
        process.exit(1);
    }
    const { mode, containerName = 'jarvis-daemon' } = profile;
    if (mode === 'docker') {
        switch (action) {
            case 'start': {
                (0, utils_1.log)(`Starting Docker container ${containerName}...`);
                const result = await (0, utils_1.run)(`docker start ${containerName}`);
                if (result.ok) {
                    (0, utils_1.ok)('Started.');
                }
                else {
                    (0, utils_1.error)(result.output);
                    process.exit(1);
                }
                break;
            }
            case 'stop': {
                (0, utils_1.log)(`Stopping Docker container ${containerName}...`);
                const result = await (0, utils_1.run)(`docker stop ${containerName}`);
                if (result.ok) {
                    (0, utils_1.ok)('Stopped.');
                }
                else {
                    (0, utils_1.error)(result.output);
                    process.exit(1);
                }
                break;
            }
            case 'restart': {
                (0, utils_1.log)(`Restarting Docker container ${containerName}...`);
                const result = await (0, utils_1.run)(`docker restart ${containerName}`);
                if (result.ok) {
                    (0, utils_1.ok)('Restarted.');
                }
                else {
                    (0, utils_1.error)(result.output);
                    process.exit(1);
                }
                break;
            }
            case 'status': {
                (0, utils_1.log)('Container status:');
                const result = await (0, utils_1.run)(`docker ps -f name=${containerName} --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"`);
                console.log(result.output);
                break;
            }
            case 'logs': {
                (0, utils_1.log)(`Streaming logs for ${containerName}...`);
                await (0, utils_1.runLive)(`docker logs -f ${containerName}`);
                break;
            }
        }
    }
    else {
        // native mode
        switch (action) {
            case 'start': {
                (0, utils_1.log)('Starting Jarvis daemon...');
                const result = await (0, utils_1.run)('jarvis start -d');
                if (result.ok) {
                    (0, utils_1.ok)('Started.');
                }
                else {
                    (0, utils_1.error)(result.output);
                    process.exit(1);
                }
                break;
            }
            case 'stop': {
                (0, utils_1.log)('Stopping Jarvis daemon...');
                const result = await (0, utils_1.run)('jarvis stop');
                if (result.ok) {
                    (0, utils_1.ok)('Stopped.');
                }
                else {
                    (0, utils_1.error)(result.output);
                    process.exit(1);
                }
                break;
            }
            case 'restart': {
                (0, utils_1.log)('Restarting Jarvis daemon...');
                const result = await (0, utils_1.run)('jarvis restart');
                if (result.ok) {
                    (0, utils_1.ok)('Restarted.');
                }
                else {
                    (0, utils_1.error)(result.output);
                    process.exit(1);
                }
                break;
            }
            case 'status': {
                (0, utils_1.log)('Jarvis daemon status:');
                const result = await (0, utils_1.run)('jarvis status');
                console.log(result.output);
                break;
            }
            case 'logs': {
                (0, utils_1.log)('Streaming Jarvis daemon logs...');
                await (0, utils_1.runLive)('jarvis logs');
                break;
            }
        }
    }
}
