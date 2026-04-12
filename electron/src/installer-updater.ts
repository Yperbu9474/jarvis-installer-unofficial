import { app } from 'electron';
import log from 'electron-log/main';
import { autoUpdater } from 'electron-updater';
import type { InstallerUpdateState } from '../../src/lib/types';

const UPDATE_CHECK_INTERVAL_MS = 30 * 60 * 1000;

let initialized = false;
let notifyRenderer: ((state: InstallerUpdateState) => void) | null = null;
let updateCheckTimer: NodeJS.Timeout | null = null;

let installerUpdateState: InstallerUpdateState = {
  status: 'idle',
  currentVersion: app.getVersion(),
  message: 'Preparing installer update checks...',
};

function setInstallerUpdateState(next: Partial<InstallerUpdateState>): void {
  installerUpdateState = {
    ...installerUpdateState,
    ...next,
    currentVersion: app.getVersion(),
  };
  notifyRenderer?.(installerUpdateState);
}

function supportsAutoUpdate(): boolean {
  if (!app.isPackaged) {
    return false;
  }

  if (process.platform === 'linux' && !process.env.APPIMAGE) {
    return false;
  }

  return true;
}

function unsupportedMessage(): string {
  if (!app.isPackaged) {
    return 'Installer auto-updates are disabled while running from source.';
  }

  if (process.platform === 'linux' && !process.env.APPIMAGE) {
    return 'Installer auto-updates are available in the AppImage build. Debian-style package installs should be updated by reinstalling the latest release.';
  }

  return 'Installer auto-updates are not supported on this build.';
}

function startPeriodicChecks(): void {
  const checkForUpdates = async () => {
    if (installerUpdateState.status === 'downloading' || installerUpdateState.status === 'ready') {
      return;
    }

    try {
      await autoUpdater.checkForUpdates();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setInstallerUpdateState({
        status: 'error',
        progress: undefined,
        message: `Installer update check failed: ${message}`,
      });
    }
  };

  void checkForUpdates();
  updateCheckTimer = setInterval(() => {
    void checkForUpdates();
  }, UPDATE_CHECK_INTERVAL_MS);
}

export function initInstallerUpdater(onState: (state: InstallerUpdateState) => void): void {
  if (initialized) {
    notifyRenderer = onState;
    notifyRenderer(installerUpdateState);
    return;
  }

  initialized = true;
  notifyRenderer = onState;

  if (!supportsAutoUpdate()) {
    setInstallerUpdateState({
      status: 'unsupported',
      progress: undefined,
      message: unsupportedMessage(),
    });
    return;
  }

  autoUpdater.logger = log;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => {
    setInstallerUpdateState({
      status: 'checking',
      progress: undefined,
      message: 'Checking for installer updates...',
    });
  });

  autoUpdater.on('update-available', (info) => {
    setInstallerUpdateState({
      status: 'downloading',
      latestVersion: info.version,
      progress: 0,
      message: `Installer ${info.version} is available. Downloading it now...`,
    });
  });

  autoUpdater.on('download-progress', (progress) => {
    const percent = Math.max(0, Math.min(100, Math.round(progress.percent)));
    const versionLabel = installerUpdateState.latestVersion ? ` ${installerUpdateState.latestVersion}` : '';
    setInstallerUpdateState({
      status: 'downloading',
      progress: percent,
      message: `Downloading installer${versionLabel}... ${percent}%`,
    });
  });

  autoUpdater.on('update-not-available', () => {
    setInstallerUpdateState({
      status: 'up-to-date',
      latestVersion: app.getVersion(),
      progress: undefined,
      message: `Installer is up to date (${app.getVersion()}).`,
    });
  });

  autoUpdater.on('update-downloaded', (info) => {
    setInstallerUpdateState({
      status: 'ready',
      latestVersion: info.version,
      progress: 100,
      message: `Installer ${info.version} is ready. Restart the app to replace the old build with the new one.`,
    });
  });

  autoUpdater.on('error', (error) => {
    const message = error == null ? 'Unknown error.' : error.message;
    setInstallerUpdateState({
      status: 'error',
      progress: undefined,
      message: `Installer update check failed: ${message}`,
    });
  });

  startPeriodicChecks();
}

export function getInstallerUpdateState(): InstallerUpdateState {
  return installerUpdateState;
}

export async function applyInstallerUpdate(): Promise<{ ok: true }> {
  if (installerUpdateState.status === 'ready') {
    setImmediate(() => {
      autoUpdater.quitAndInstall();
    });
  }

  return { ok: true };
}

export function stopInstallerUpdater(): void {
  if (updateCheckTimer) {
    clearInterval(updateCheckTimer);
    updateCheckTimer = null;
  }
}
