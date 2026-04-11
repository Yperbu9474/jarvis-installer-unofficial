#!/usr/bin/env node
import { log, error, c } from './utils';

const VERSION = '1.2.4';

function printHelp(): void {
  console.log(`
${c.bold('jarv')} -- Jarvis Unofficial Installer CLI v${VERSION}

  ${c.bold('USAGE')}
    jarv <command> [options]

  ${c.bold('COMMANDS')}
    ${c.cyan('install')}          Install Jarvis (interactive wizard)
    ${c.cyan('start')}            Start the Jarvis daemon
    ${c.cyan('stop')}             Stop the Jarvis daemon
    ${c.cyan('restart')}          Restart the Jarvis daemon
    ${c.cyan('status')}           Show daemon status
    ${c.cyan('logs')}             Tail daemon logs
    ${c.cyan('update')}           Update Jarvis to latest
    ${c.cyan('proxy')}            Setup reverse proxy (Cloudflare + nginx + SSL)
    ${c.cyan('help')}             Show this help
    ${c.cyan('version')}          Show version

  ${c.bold('EXAMPLES')}
    jarv install --mode docker --port 3000
    jarv proxy --domain jarvis.example.com --cf-token TOKEN --cf-zone ZONE --email me@example.com
    jarv start
    jarv status
`);
}

async function main(): Promise<void> {
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
      error(`Unknown command: ${command}`);
      printHelp();
      process.exit(1);
  }
}

main().catch((err: unknown) => {
  error(String(err));
  process.exit(1);
});
