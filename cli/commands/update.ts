import { error, log, ok, run, runLive, loadProfile, warn } from '../utils';

export async function runUpdate(_args: string[]): Promise<void> {
  const profile = loadProfile();
  if (!profile) {
    error('No Jarvis profile found. Run `jarv install` first.');
    process.exit(1);
  }

  const { mode, containerName = 'jarvis-daemon' } = profile;

  if (mode === 'docker') {
    log('Pulling latest Jarvis Docker image...');
    const pull = await runLive('docker pull ghcr.io/vierisid/jarvis:latest');
    if (!pull) { error('Failed to pull latest image.'); process.exit(1); }

    log(`Restarting container ${containerName}...`);
    const restart = await runLive(`docker restart ${containerName}`);
    if (!restart) { error('Failed to restart container.'); process.exit(1); }

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
