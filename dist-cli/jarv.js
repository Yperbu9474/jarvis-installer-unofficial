#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const utils_1 = require("./utils");
const VERSION = '1.2.1';
function printHelp() {
    console.log(`
${utils_1.c.bold('jarv')} -- Jarvis Unofficial Installer CLI v${VERSION}

  ${utils_1.c.bold('USAGE')}
    jarv <command> [options]

  ${utils_1.c.bold('COMMANDS')}
    ${utils_1.c.cyan('install')}          Install Jarvis (interactive wizard)
    ${utils_1.c.cyan('start')}            Start the Jarvis daemon
    ${utils_1.c.cyan('stop')}             Stop the Jarvis daemon
    ${utils_1.c.cyan('restart')}          Restart the Jarvis daemon
    ${utils_1.c.cyan('status')}           Show daemon status
    ${utils_1.c.cyan('logs')}             Tail daemon logs
    ${utils_1.c.cyan('update')}           Update Jarvis to latest
    ${utils_1.c.cyan('proxy')}            Setup reverse proxy (Cloudflare + nginx + SSL)
    ${utils_1.c.cyan('help')}             Show this help
    ${utils_1.c.cyan('version')}          Show version

  ${utils_1.c.bold('EXAMPLES')}
    jarv install --mode docker --port 3000
    jarv proxy --domain jarvis.example.com --cf-token TOKEN --cf-zone ZONE --email me@example.com
    jarv start
    jarv status
`);
}
async function main() {
    const [, , command, ...args] = process.argv;
    switch (command) {
        case 'install': {
            const { runInstall } = require('./commands/install');
            await runInstall(args);
            break;
        }
        case 'start':
        case 'stop':
        case 'restart':
        case 'status':
        case 'logs': {
            const { runLifecycle } = require('./commands/lifecycle');
            await runLifecycle(command, args);
            break;
        }
        case 'update': {
            const { runUpdate } = require('./commands/update');
            await runUpdate(args);
            break;
        }
        case 'proxy': {
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const { runProxy } = require('./commands/proxy');
            await runProxy(args);
            break;
        }
        case 'version':
            console.log(`jarv v${VERSION}`);
            break;
        case 'help':
        case undefined:
            printHelp();
            break;
        default:
            (0, utils_1.error)(`Unknown command: ${command}`);
            printHelp();
            process.exit(1);
    }
}
main().catch((err) => {
    (0, utils_1.error)(String(err));
    process.exit(1);
});
