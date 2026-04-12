import { error, log, ok, run, runLive, loadProfile, getDockerCommand, shellEscape } from '../utils';

export async function runLifecycle(action: string, _args: string[]): Promise<void> {
  const profile = loadProfile();
  if (!profile) {
    error('No Jarvis profile found. Run `jarv install` first.');
    process.exit(1);
  }

  const { mode, containerName = 'jarvis-daemon' } = profile;

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
        if (result.ok) { ok('Stopped.'); } else { error(result.output); process.exit(1); }
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
