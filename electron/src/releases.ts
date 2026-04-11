import fs from 'node:fs/promises';
import path from 'node:path';
import { app } from 'electron';
import type { JarvisReleaseNotice } from '../../src/lib/types';

const RELEASE_API_URL = 'https://api.github.com/repos/vierisid/jarvis/releases/latest';

type ReleaseState = {
  acknowledgedTag?: string;
};

function RELEASE_STATE_PATH(): string {
  return path.join(app.getPath('userData'), 'release-state.json');
}

async function readReleaseState(): Promise<ReleaseState> {
  try {
    const raw = await fs.readFile(RELEASE_STATE_PATH(), 'utf8');
    return JSON.parse(raw) as ReleaseState;
  } catch {
    return {};
  }
}

async function writeReleaseState(state: ReleaseState): Promise<void> {
  await fs.mkdir(path.dirname(RELEASE_STATE_PATH()), { recursive: true });
  await fs.writeFile(RELEASE_STATE_PATH(), JSON.stringify(state, null, 2));
}

function normalizeReleaseNotes(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  const lines = trimmed.split(/\r?\n/).slice(0, 12);
  const clipped = lines.join('\n').trim();
  return clipped.length > 1200 ? `${clipped.slice(0, 1200).trimEnd()}…` : clipped;
}

export async function getJarvisReleaseNotice(): Promise<JarvisReleaseNotice> {
  const response = await fetch(RELEASE_API_URL, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'Jarvis-Installer',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to check upstream release: GitHub returned ${response.status}.`);
  }

  const payload = await response.json() as {
    tag_name?: unknown;
    name?: unknown;
    html_url?: unknown;
    published_at?: unknown;
    body?: unknown;
  };

  const releaseTag = typeof payload.tag_name === 'string' ? payload.tag_name.trim() : '';
  if (!releaseTag) {
    throw new Error('Failed to check upstream release: release tag was missing.');
  }

  const releaseName = typeof payload.name === 'string' && payload.name.trim() ? payload.name.trim() : releaseTag;
  const releaseUrl =
    typeof payload.html_url === 'string' && payload.html_url.trim()
      ? payload.html_url.trim()
      : 'https://github.com/vierisid/jarvis/releases/latest';
  const publishedAt = typeof payload.published_at === 'string' ? payload.published_at : undefined;
  const releaseNotes = normalizeReleaseNotes(payload.body);
  const state = await readReleaseState();

  if (!state.acknowledgedTag) {
    await writeReleaseState({ acknowledgedTag: releaseTag });
    return {
      hasUpdate: false,
      releaseTag,
      releaseName,
      releaseUrl,
      publishedAt,
      releaseNotes,
    };
  }

  return {
    hasUpdate: state.acknowledgedTag !== releaseTag,
    releaseTag,
    releaseName,
    releaseUrl,
    publishedAt,
    releaseNotes,
  };
}

export async function acknowledgeJarvisRelease(releaseTag: string): Promise<{ ok: true }> {
  await writeReleaseState({ acknowledgedTag: releaseTag });
  return { ok: true };
}
