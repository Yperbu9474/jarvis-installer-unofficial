import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import {
  ask,
  log,
  warn,
  error,
  ok,
  step,
  run,
  runLive,
  CONFIG_DIR,
  CONFIG_PATH,
  saveProfile,
  c,
  getDockerCommand,
  shellEscape,
} from '../utils';

function parseArgs(args: string[]): Record<string, string | boolean> {
  const result: Record<string, string | boolean> = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key = args[i].slice(2);
      if (i + 1 < args.length && !args[i + 1].startsWith('--')) {
        result[key] = args[i + 1];
        i++;
      } else {
        result[key] = true;
      }
    }
  }
  return result;
}

export async function runInstall(args: string[]): Promise<void> {
  const flags = parseArgs(args);

  log('Welcome to the Jarvis installer!');
  console.log('');

  // Step 1: mode
  let mode = (flags['mode'] as string) || '';
  if (!mode) {
    mode = await ask('Installation mode (native/docker)', 'docker');
  }
  if (mode !== 'native' && mode !== 'docker') {
    error(`Invalid mode: ${mode}. Must be native or docker.`);
    process.exit(1);
  }

  // Step 2: port
  let portStr = (flags['port'] as string) || '';
  if (!portStr) {
    portStr = await ask('Port for Jarvis daemon', '3000');
  }
  const port = parseInt(portStr, 10);
  if (isNaN(port)) {
    error('Invalid port number.');
    process.exit(1);
  }

  // Step 3: data dir
  let dataDir = (flags['data-dir'] as string) || '';
  if (!dataDir) {
    dataDir = await ask('Data directory', CONFIG_DIR);
  }

  const containerName = 'jarvis-daemon';

  // Summary
  console.log('');
  console.log(c.bold('Summary:'));
  console.log(`  Mode:      ${c.cyan(mode)}`);
  console.log(`  Port:      ${c.cyan(String(port))}`);
  console.log(`  Data dir:  ${c.cyan(dataDir)}`);
  console.log('');

  const confirm = await ask('Proceed? [Y/n]', 'Y');
  if (confirm.toLowerCase() === 'n') {
    warn('Installation cancelled.');
    return;
  }

  const TOTAL = 5;

  if (mode === 'docker') {
    step(1, TOTAL, 'Checking Docker...');
    const dockerCommand = await getDockerCommand();
    const prepareDataDirCommand =
      `${dockerCommand} run --rm --user 0:0 -v ${shellEscape(dataDir)}:/data ` +
      `--entrypoint sh ghcr.io/vierisid/jarvis:latest -lc ${shellEscape('mkdir -p /data && chown -R 999:999 /data')}`;

    step(2, TOTAL, 'Pulling Jarvis Docker image...');
    const pull = await runLive(`${dockerCommand} pull ghcr.io/vierisid/jarvis:latest`);
    if (!pull) { error('Failed to pull Docker image.'); process.exit(1); }

    step(3, TOTAL, `Preparing data directory ${dataDir}...`);
    fs.mkdirSync(dataDir, { recursive: true });
    const prepared = await runLive(prepareDataDirCommand);
    if (!prepared) { error('Failed to prepare Docker data directory permissions.'); process.exit(1); }

    step(4, TOTAL, 'Removing existing container (if any)...');
    await run(`${dockerCommand} rm -f ${shellEscape(containerName)} 2>/dev/null || true`);

    step(5, TOTAL, `Starting container on port ${port}...`);
    const started = await runLive(
      `${dockerCommand} run -d --name ${shellEscape(containerName)} -p ${port}:3142 -v ${shellEscape(dataDir)}:/data ghcr.io/vierisid/jarvis:latest`
    );
    if (!started) { error('Failed to start container.'); process.exit(1); }
  } else {
    // native mode
    step(1, TOTAL, 'Installing Bun...');
    const bunInstall = await runLive('curl -fsSL https://bun.sh/install | bash');
    if (!bunInstall) { warn('Bun install may have failed. Continuing...'); }

    step(2, TOTAL, 'Installing Jarvis packages globally...');
    const pkgInstall = await runLive('source ~/.bashrc 2>/dev/null; bun add -g @usejarvis/brain @usejarvis/sidecar');
    if (!pkgInstall) { error('Failed to install Jarvis packages.'); process.exit(1); }

    step(3, TOTAL, `Creating data directory ${dataDir}...`);
    fs.mkdirSync(dataDir, { recursive: true });

    step(4, TOTAL, 'Writing config.yaml...');
    const configContent = `port: ${port}\ndata_dir: ${dataDir}\n`;
    fs.writeFileSync(CONFIG_PATH, configContent);

    step(5, TOTAL, 'Running Jarvis onboarding wizard...');
    await new Promise<void>((resolve) => {
      const child = spawn('jarvis', ['onboard'], { stdio: 'inherit', shell: true });
      child.on('close', () => resolve());
    });
  }

  // Save profile
  saveProfile({ mode, port, containerName, dataDir });

  console.log('');
  ok(`Jarvis installed successfully!`);
  log(`Dashboard: ${c.cyan(`http://localhost:${port}`)}`);
}
