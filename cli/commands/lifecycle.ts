import { error, log, ok, warn, run, runLive, loadProfile, getDockerCommand, shellEscape, ensurePortReleased } from '../utils';

export async function runLifecycle(action: string, _args: string[]): Promise<void> {
  const profile = loadProfile();
  if (!profile) {
    error('No Jarvis profile found. Run `jarv install` first.');
    process.exit(1);
  }

  const { mode, containerName = 'jarvis-daemon', port = 3142 } = profile;

  if (mode === 'docker') {
    const dockerCommand = await getDockerCommand();

    switch (action) {
      case 'start': {
        log(`Starting Docker container ${containerName}...`);
        const result = await run(`${dockerCommand} start ${shellEscape(containerName)}`);
        if (result.ok) { ok('Started.'); } else { error(result.output); process.exit(1); }
        break;
      }
      case 'stop': {
        log(`Stopping Docker container ${containerName}...`);
        const result = await run(`${dockerCommand} stop ${shellEscape(containerName)}`);
        if (result.ok) { ok('Stopped.'); } else { error(result.output); process.exit(1); }
        break;
      }
      case 'restart': {
        log(`Restarting Docker container ${containerName}...`);
        const result = await run(`${dockerCommand} restart ${shellEscape(containerName)}`);
        if (result.ok) { ok('Restarted.'); } else { error(result.output); process.exit(1); }
        break;
      }
      case 'status': {
        log('Container status:');
        const result = await run(
          `${dockerCommand} ps -f ${shellEscape(`name=${containerName}`)} --format "table {{.Names}}\\t{{.Status}}\\t{{.Ports}}"`
        );
        console.log(result.output);
        break;
      }
      case 'logs': {
        log(`Streaming logs for ${containerName}...`);
        await runLive(`${dockerCommand} logs -f ${shellEscape(containerName)}`);
        break;
      }
    }
  } else {
    // native mode
    switch (action) {
      case 'start': {
        log('Starting Jarvis daemon...');
        const result = await run('jarvis start -d');
        if (result.ok) { ok('Started.'); } else { error(result.output); process.exit(1); }
        break;
      }
      case 'stop': {
        log('Stopping Jarvis daemon...');
        const result = await run('jarvis stop');
        const cleanup = await ensurePortReleased(port);

        const cleanupSuffix =
          cleanup.forced.length > 0
            ? ` Force-killed lingering Jarvis listener(s) on port ${port}: ${cleanup.forced.join(', ')}.`
            : cleanup.terminated.length > 0
              ? ` Cleaned up lingering Jarvis listener(s) on port ${port}: ${cleanup.terminated.join(', ')}.`
              : '';

        if (cleanup.skippedNonJarvis.length > 0) {
          warn(`Non-Jarvis process(es) occupying port ${port} were left untouched: PIDs ${cleanup.skippedNonJarvis.join(', ')}.`);
        }

        if (result.ok && cleanup.released) {
          ok(`Stopped.${cleanupSuffix}`);
        } else {
          const failureDetail = !result.ok
            ? `${result.output || 'Failed to stop Jarvis daemon.'}${cleanupSuffix}${cleanup.released ? ' Port was released during cleanup.' : ''}`
            : `Port ${port} is still occupied after attempting to stop Jarvis.${cleanupSuffix}`;
          error(failureDetail);
          process.exit(1);
        }
        break;
      }
      case 'restart': {
        log('Restarting Jarvis daemon...');
        const result = await run('jarvis restart');
        if (result.ok) { ok('Restarted.'); } else { error(result.output); process.exit(1); }
        break;
      }
      case 'status': {
        log('Jarvis daemon status:');
        const result = await run('jarvis status');
        console.log(result.output);
        break;
      }
      case 'logs': {
        log('Streaming Jarvis daemon logs...');
        await runLive('jarvis logs');
        break;
      }
    }
  }
}
