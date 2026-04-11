import { error, log, ok, run, runLive, loadProfile, warn, getDockerCommand, shellEscape } from '../utils';

export async function runUpdate(_args: string[]): Promise<void> {
  const profile = loadProfile();
  if (!profile) {
    error('No Jarvis profile found. Run `jarv install` first.');
    process.exit(1);
  }

  const { mode, containerName = 'jarvis-daemon', port = 3142, dataDir = '~/.jarvis-docker' } = profile;

  if (mode === 'docker') {
    const dockerCommand = await getDockerCommand();

    log('Pulling latest Jarvis Docker image...');
    const pull = await runLive(`${dockerCommand} pull ghcr.io/vierisid/jarvis:latest`);
    if (!pull) { error('Failed to pull latest image.'); process.exit(1); }

    log(`Recreating container ${containerName} with the latest image...`);
    const restart = await runLive(
      `${dockerCommand} rm -f ${shellEscape(containerName)} >/dev/null 2>&1 || true && ` +
      `${dockerCommand} run -d --name ${shellEscape(containerName)} -p ${port}:3142 -v ${shellEscape(dataDir)}:/data ghcr.io/vierisid/jarvis:latest`
    );
    if (!restart) { error('Failed to recreate container with the latest image.'); process.exit(1); }

    ok('Jarvis updated and restarted successfully!');
  } else {
    // native mode: try jarvis update first, fall back to bun
    log('Attempting native update via `jarvis update`...');
    const result = await run('jarvis update');
    if (result.ok) {
      ok('Updated via `jarvis update`.');
    } else {
      warn('`jarvis update` failed, falling back to bun install...');
      const bunUpdate = await runLive('bun add -g @usejarvis/brain@latest @usejarvis/sidecar@latest');
      if (!bunUpdate) { error('Failed to update Jarvis packages.'); process.exit(1); }
      ok('Updated via bun.');
    }
  }
}
