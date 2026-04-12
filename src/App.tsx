import { useEffect, useMemo, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import type {
  InstallMode,
  InstallProfile,
  InstallProgress,
  InstallState,
  InstallerUpdateState,
  JarvisReleaseNotice,
  LifecycleAction,
  SystemSummary,
  ProxyConfig,
  ProxyResult,
} from './lib/types';

const defaultProfile: InstallProfile = {
  mode: 'native',
  port: 3142,
  jarvisRepo: 'https://github.com/vierisid/jarvis.git',
  installSidecar: true,
  containerName: 'jarvis-daemon',
  dataDir: '',
};

const modeContent: Record<InstallMode, { label: string; summary: string; caution: string }> = {
  native: {
    label: 'Native Bun',
    summary: 'Best for local macOS and Linux installs with direct CLI control.',
    caution: 'Requires Bun and local machine dependencies.',
  },
  docker: {
    label: 'Docker',
    summary: 'Best for servers, VPS targets, and isolated daemon deployments.',
    caution: 'Container access is not the same as host desktop access.',
  },
  wsl2: {
    label: 'Windows WSL2',
    summary: 'Best for Windows users who want the Linux runtime path.',
    caution: 'If WSL is missing, the installer will try to enable it and add Ubuntu automatically. Some PCs may still require a reboot.',
  },
};

function normalizeProfile(profile: InstallProfile, summary: SystemSummary | null): InstallProfile {
  const supportedModes = summary?.supportedModes ?? ['native', 'docker'];
  const nextMode = supportedModes.includes(profile.mode) ? profile.mode : supportedModes[0] ?? 'native';
  return {
    ...profile,
    mode: nextMode,
    port: Number.isFinite(profile.port) ? profile.port : 3142,
    containerName: profile.containerName || 'jarvis-daemon',
    dataDir: profile.dataDir || '',
    wslDistro: nextMode === 'wsl2' ? profile.wslDistro || summary?.wslDistros[0] || '' : undefined,
  };
}

function getValidationErrors(profile: InstallProfile, summary: SystemSummary | null): string[] {
  const errors: string[] = [];
  if (!summary) return errors;

  if (!summary.supportedModes.includes(profile.mode)) {
    errors.push(`Mode "${profile.mode}" is not supported on this host.`);
  }

  if (!Number.isInteger(profile.port) || profile.port < 1 || profile.port > 65535) {
    errors.push('Port must be a whole number between 1 and 65535.');
  }

  if (profile.mode === 'wsl2' && summary.platform !== 'win32') {
    errors.push('WSL2 mode is only available on Windows hosts.');
  }

  if (profile.mode === 'docker') {
    if (!profile.containerName || !/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(profile.containerName)) {
      errors.push('Container name must start with an alphanumeric character and only use letters, numbers, dot, dash, or underscore.');
    }
  }

  if (!profile.jarvisRepo.startsWith('https://github.com/')) {
    errors.push('Jarvis source repository should be a GitHub HTTPS URL.');
  }

  return errors;
}

function getRuntimeNotes(profile: InstallProfile, summary: SystemSummary | null): string[] {
  const notes: string[] = [];

  if (!summary) return notes;

  if (profile.mode === 'native' && !summary.hasBun) {
    notes.push('Bun is not currently installed. The installer will attempt to add it.');
  }

  if (profile.mode === 'docker' && !summary.hasDocker) {
    notes.push(summary.platform === 'win32'
      ? 'Docker is not detected. The installer will install Docker Desktop and enable the WSL backend if needed.'
      : 'Docker is not detected. The installer will try to install or start it where supported.');
  }

  if (profile.mode === 'wsl2' && summary.platform === 'win32') {
    notes.push(summary.wslDistros.length
      ? 'Jarvis commands will run inside WSL, not directly in Windows PowerShell.'
      : 'No WSL distro is installed yet. The installer will enable WSL and provision Ubuntu automatically.');
  }

  if (profile.installSidecar) {
    notes.push('Sidecar installation is enabled. This is useful for direct machine control when the upstream runtime supports it.');
  }

  return notes;
}

type StateDetection = {
  profile: InstallProfile;
  state: InstallState;
};

const RELEASE_CHECK_INTERVAL_MS = 30 * 60 * 1000;

function profileSignature(profile: InstallProfile): string {
  return [
    profile.mode,
    String(profile.port || 3142),
    profile.containerName || '',
    profile.wslDistro || '',
    profile.dataDir || '',
  ].join('|');
}

function buildDetectionCandidates(profile: InstallProfile, summary: SystemSummary | null): InstallProfile[] {
  const base = normalizeProfile(profile, summary);
  const supportedModes = summary?.supportedModes || [base.mode];
  const candidates: InstallProfile[] = [base];

  for (const mode of supportedModes) {
    if (mode === base.mode) continue;
    const candidate = normalizeProfile(
      {
        ...base,
        mode,
        wslDistro: mode === 'wsl2' ? base.wslDistro || summary?.wslDistros[0] || '' : undefined,
      },
      summary,
    );
    candidates.push(candidate);
  }

  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    const key = profileSignature(candidate);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function detectBestState(profile: InstallProfile, summary: SystemSummary | null): Promise<StateDetection> {
  const candidates = buildDetectionCandidates(profile, summary);
  const attempts = await Promise.all(
    candidates.map(async (candidate) => {
      try {
        const state = await window.jarvisApi.detectState(candidate);
        return { profile: candidate, state };
      } catch {
        return null;
      }
    }),
  );

  const results = attempts.filter((item): item is StateDetection => Boolean(item));
  const running = results.find((item) => item.state.running);
  if (running) return running;

  const installed = results.find((item) => item.state.installed);
  if (installed) return installed;

  if (results[0]) return results[0];

  const fallback = candidates[0] || normalizeProfile(profile, summary);
  return {
    profile: fallback,
    state: {
      installed: false,
      running: false,
      mode: fallback.mode,
      details: 'Jarvis install not detected.',
      dashboardUrl: `http://127.0.0.1:${fallback.port || 3142}`,
    },
  };
}

function formatReleaseDate(value?: string): string | null {
  if (!value) return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toLocaleString();
}

function installerUpdateTone(update: InstallerUpdateState | null): 'good' | 'warn' | 'off' | 'danger' {
  if (!update) return 'off';

  switch (update.status) {
    case 'up-to-date':
      return 'good';
    case 'checking':
    case 'downloading':
    case 'ready':
      return 'warn';
    case 'error':
      return 'danger';
    case 'unsupported':
    case 'idle':
    default:
      return 'off';
  }
}

function installerUpdateLabel(update: InstallerUpdateState | null): string {
  if (!update) return 'Checking...';

  switch (update.status) {
    case 'checking':
      return 'Checking for updates';
    case 'downloading':
      return update.progress != null ? `Downloading ${update.progress}%` : 'Downloading update';
    case 'ready':
      return 'Restart to apply';
    case 'up-to-date':
      return 'Up to date';
    case 'error':
      return 'Update check failed';
    case 'unsupported':
      return 'Auto-update unavailable';
    case 'idle':
    default:
      return 'Preparing updater';
  }
}

export default function App() {
  const [summary, setSummary] = useState<SystemSummary | null>(null);
  const [profile, setProfile] = useState<InstallProfile>(defaultProfile);
  const [activity, setActivity] = useState('Loading environment details...');
  const [logText, setLogText] = useState('');
  const [busy, setBusy] = useState(false);
  const [installProgress, setInstallProgress] = useState<InstallProgress | null>(null);
  const [installState, setInstallState] = useState<InstallState | null>(null);
  const [terminalId, setTerminalId] = useState<string | null>(null);
  const terminalMount = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  // Ref so stale closures inside xterm callbacks can always read the live terminalId
  const terminalIdRef = useRef<string | null>(null);
  const lastTerminalPasteAtRef = useRef(0);
  const lastTerminalPasteTextRef = useRef('');
  const [proxyConfig, setProxyConfig] = useState<ProxyConfig>({
    domain: '',
    cfApiToken: '',
    cfZoneId: '',
    email: '',
    vpsIp: '',
    port: profile?.port ?? 3000,
  });
  const [proxyRunning, setProxyRunning] = useState(false);
  const [proxyResult, setProxyResult] = useState<ProxyResult | null>(null);
  const [releaseNotice, setReleaseNotice] = useState<JarvisReleaseNotice | null>(null);
  const [installerUpdate, setInstallerUpdate] = useState<InstallerUpdateState | null>(null);

  useEffect(() => {
    terminalIdRef.current = terminalId;
  }, [terminalId]);

  useEffect(() => {
    void (async () => {
      try {
        const [systemSummary, saved] = await Promise.all([
          window.jarvisApi.systemSummary(),
          window.jarvisApi.getProfile(),
        ]);
        setSummary(systemSummary);
        const preferredProfile = normalizeProfile({ ...defaultProfile, ...saved }, systemSummary);
        const detected = await detectBestState(preferredProfile, systemSummary);

        setProfile(detected.profile);
        setInstallState(detected.state);

        if (profileSignature(preferredProfile) !== profileSignature(detected.profile)) {
          await window.jarvisApi.saveProfile(detected.profile);
        }

        if (detected.state.running) {
          const logs = await window.jarvisApi.lifecycle(detected.profile, 'logs');
          setLogText(logs.output || 'Jarvis is already running.');
          setActivity(
            `Jarvis is already running in ${modeContent[detected.profile.mode].label} mode. Dashboard: ${detected.state.dashboardUrl}`,
          );
        } else if (detected.state.installed) {
          setActivity(
            `Jarvis is installed in ${modeContent[detected.profile.mode].label} mode. The primary action will start it instead of reinstalling.`,
          );
        } else {
          setActivity('Ready to install or manage Jarvis.');
        }
      } catch (error) {
        setActivity(`Failed to inspect host environment: ${String(error)}`);
      }
    })();
  }, []);

  useEffect(() => {
    let disposed = false;

    const checkReleaseNotice = async () => {
      try {
        const notice = await window.jarvisApi.getReleaseNotice();
        if (!disposed && notice.hasUpdate) {
          setReleaseNotice((current) => (current?.releaseTag === notice.releaseTag ? current : notice));
        }
      } catch {
        // Release polling should stay quiet when GitHub is unreachable.
      }
    };

    void checkReleaseNotice();
    const intervalId = window.setInterval(() => {
      void checkReleaseNotice();
    }, RELEASE_CHECK_INTERVAL_MS);

    return () => {
      disposed = true;
      window.clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    void window.jarvisApi.getInstallerUpdateState().then(setInstallerUpdate).catch(() => {
      // Keep installer update status quiet if updater initialization is unavailable.
    });

    const remove = window.jarvisApi.onInstallerUpdate((payload) => {
      setInstallerUpdate(payload);
    });

    return remove;
  }, []);

  useEffect(() => {
    const remove = window.jarvisApi.onInstallProgress((payload) => {
      setInstallProgress(payload);
      setActivity(payload.message);
      if (payload.chunk) {
        setLogText((current) => `${current}${payload.chunk}`);
      }
    });

    return remove;
  }, []);

  useEffect(() => {
    const remove = window.jarvisApi.onTerminalData(({ id, data }) => {
      if (id === terminalIdRef.current) terminalRef.current?.write(data);
    });
    return remove;
  }, []);

  // Terminal is initialised once on mount; terminalIdRef gives closures live access to the session
  useEffect(() => {
    if (!terminalMount.current) return;
    const terminal = new Terminal({
      theme: {
        background: '#07111f',
        foreground: '#d7e3f5',
        cursor: '#f4b860',
      },
      fontFamily: '"JetBrains Mono", "SFMono-Regular", monospace',
      fontSize: 13,
      cursorBlink: true,
      scrollback: 2000,
    });
    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.open(terminalMount.current);
    fitAddon.fit();
    terminal.focus();
    terminal.attachCustomKeyEventHandler((event) => {
      const isPasteShortcut =
        ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 'v')
        || (event.shiftKey && event.key === 'Insert');
      if (event.type === 'keydown' && isPasteShortcut) {
        void pasteTerminalClipboard(undefined, 'shortcut');
        return false;
      }
      return true;
    });
    terminal.onData((data) => {
      const id = terminalIdRef.current;
      if (id) void window.jarvisApi.terminalWrite(id, data);
    });
    terminalRef.current = terminal;
    fitRef.current = fitAddon;
    const resizeObserver = new ResizeObserver(() => {
      fitAddon.fit();
      const id = terminalIdRef.current;
      if (id) void window.jarvisApi.terminalResize(id, terminal.cols, terminal.rows);
    });
    resizeObserver.observe(terminalMount.current);
    const onResize = () => {
      fitAddon.fit();
      const id = terminalIdRef.current;
      if (id) void window.jarvisApi.terminalResize(id, terminal.cols, terminal.rows);
    };
    window.addEventListener('resize', onResize);
    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', onResize);
      terminal.dispose();
      terminalRef.current = null;
    };
  }, []);

  const normalizedProfile = useMemo(() => normalizeProfile(profile, summary), [profile, summary]);
  const validationErrors = useMemo(() => getValidationErrors(normalizedProfile, summary), [normalizedProfile, summary]);
  const runtimeNotes = useMemo(() => getRuntimeNotes(normalizedProfile, summary), [normalizedProfile, summary]);
  const isProfileValid = validationErrors.length === 0;
  const dashboardUrl = installState?.dashboardUrl || `http://127.0.0.1:${normalizedProfile.port || 3142}`;

  const modeOptions = useMemo(
    () =>
      (summary?.supportedModes || []).map((mode) => ({
        value: mode,
        label: modeContent[mode].label,
      })),
    [summary],
  );

  async function pasteTerminalClipboard(text?: string, source: 'shortcut' | 'paste' = 'shortcut') {
    const id = terminalIdRef.current;
    if (!id) return;

    try {
      const clipboardText = text ?? await navigator.clipboard.readText();
      if (!clipboardText) return;
      const now = Date.now();
      const isDuplicatePaste =
        clipboardText === lastTerminalPasteTextRef.current
        && now - lastTerminalPasteAtRef.current < 750;
      if (isDuplicatePaste) {
        return;
      }
      lastTerminalPasteAtRef.current = now;
      lastTerminalPasteTextRef.current = clipboardText;
      await window.jarvisApi.terminalWrite(id, clipboardText);
      terminalRef.current?.focus();
    } catch {
      setActivity('Clipboard paste is unavailable in the embedded terminal right now.');
    }
  }

  async function persistProfile(nextProfile: InstallProfile) {
    const normalized = normalizeProfile(nextProfile, summary);
    setProfile(normalized);
    await window.jarvisApi.saveProfile(normalized);
    // Only re-detect state when the mode or port changes (not on every text field keystroke)
    if (
      normalized.mode !== profile.mode ||
      normalized.port !== profile.port ||
      normalized.containerName !== profile.containerName ||
      normalized.wslDistro !== profile.wslDistro
    ) {
      const state = await window.jarvisApi.detectState(normalized);
      setInstallState(state);
    }
  }

  async function handleInstall() {
    if (!isProfileValid) {
      setActivity('Installer settings need attention before execution.');
      return;
    }

    setBusy(true);
    setInstallProgress({ percent: 3, message: 'Checking existing Jarvis state...' });
    setLogText('');
    setActivity(`Checking existing Jarvis state in ${modeContent[normalizedProfile.mode].label} mode...`);
    try {
      const state = await window.jarvisApi.detectState(normalizedProfile);
      setInstallState(state);

      if (state.running) {
        const logs = await window.jarvisApi.lifecycle(normalizedProfile, 'logs');
        setLogText(logs.output || 'Jarvis is already running.');
        setInstallProgress(null);
        setActivity(`Jarvis is already running. Dashboard expected at ${state.dashboardUrl}`);
        return;
      }

      if (state.installed) {
        const startResult = await window.jarvisApi.lifecycle(normalizedProfile, 'start');
        const logs = await window.jarvisApi.lifecycle(normalizedProfile, 'logs');
        setLogText(logs.output || startResult.output || 'Jarvis started.');
        setInstallProgress(null);
        setActivity(startResult.ok ? `Jarvis was already installed and has been started.` : 'Jarvis is installed but failed to start. Review logs below.');
        const refreshed = await window.jarvisApi.detectState(normalizedProfile);
        setInstallState(refreshed);
        return;
      }

      setInstallProgress({ percent: 8, message: `Installing Jarvis in ${modeContent[normalizedProfile.mode].label} mode...` });
      setActivity(`Installing Jarvis in ${modeContent[normalizedProfile.mode].label} mode...`);
      const result = await window.jarvisApi.install(normalizedProfile);
      setLogText(result.output || 'Installer completed without additional output.');
      setInstallProgress({ percent: result.ok ? 100 : installProgress?.percent || 0, message: result.ok ? 'Install finished.' : 'Install failed.' });
      setActivity(result.ok ? `Install finished. Dashboard expected at ${result.dashboardUrl}` : 'Install failed. Review the output below.');
      const refreshed = await window.jarvisApi.detectState(normalizedProfile);
      setInstallState(refreshed);
    } catch (error) {
      setLogText(String(error));
      setInstallProgress((current) => current ? { ...current, message: 'Install failed.' } : null);
      setActivity('Install failed before completion.');
    } finally {
      setBusy(false);
    }
  }

  async function handleLifecycle(action: LifecycleAction) {
    if (!isProfileValid) {
      setActivity('Current profile is invalid. Fix installer settings before running lifecycle actions.');
      return;
    }

    setBusy(true);
    setActivity(`Running ${action}...`);
    try {
      const result = await window.jarvisApi.lifecycle(normalizedProfile, action);
      setLogText(result.output || `${action} completed.`);
      setActivity(result.ok ? `${action} completed.` : `${action} failed.`);
      // Refresh install state so the status badge reflects the new daemon state
      if (action !== 'logs') {
        const refreshed = await window.jarvisApi.detectState(normalizedProfile);
        setInstallState(refreshed);
      }
    } catch (error) {
      setLogText(String(error));
      setActivity(`${action} failed before completion.`);
    } finally {
      setBusy(false);
    }
  }

  async function handleUpdate() {
    if (!isProfileValid) {
      setActivity('Current profile is invalid. Fix installer settings before updating.');
      return;
    }

    setBusy(true);
    setActivity('Updating Jarvis...');
    try {
      const result = await window.jarvisApi.update(normalizedProfile);
      setLogText(result.output || 'Update completed.');
      setActivity(result.ok ? 'Update completed.' : 'Update failed. Review the output below.');
      if (result.ok && releaseNotice?.releaseTag) {
        await window.jarvisApi.acknowledgeRelease(releaseNotice.releaseTag);
        setReleaseNotice(null);
      }
      const refreshed = await window.jarvisApi.detectState(normalizedProfile);
      setInstallState(refreshed);
    } catch (error) {
      setLogText(String(error));
      setActivity('Update failed before completion.');
    } finally {
      setBusy(false);
    }
  }

  async function openOnboarding() {
    if (!isProfileValid) {
      setActivity('Current profile is invalid. Fix installer settings before onboarding.');
      return;
    }

    try {
      if (terminalId) {
        await window.jarvisApi.terminalClose(terminalId);
        setTerminalId(null);
        terminalRef.current?.clear();
      }
      fitRef.current?.fit();
      const cols = Math.max(terminalRef.current?.cols ?? 120, 80);
      const rows = Math.max(terminalRef.current?.rows ?? 32, 24);
      const session = await window.jarvisApi.terminalCreate({ profile: normalizedProfile, purpose: 'onboard', cols, rows });
      setTerminalId(session.id);
      setActivity('Jarvis onboarding is running in the embedded terminal below.');
      setTimeout(() => {
        fitRef.current?.fit();
        if (terminalRef.current) {
          void window.jarvisApi.terminalResize(session.id, terminalRef.current.cols, terminalRef.current.rows);
          terminalRef.current.focus();
        }
      }, 50);
    } catch (error) {
      setLogText(String(error));
      setActivity('Failed to start Jarvis onboarding.');
    }
  }

  const handleSetupProxy = async () => {
    setProxyRunning(true);
    setProxyResult(null);
    const result = await window.jarvisApi.setupProxy(proxyConfig);
    setProxyResult(result);
    setProxyRunning(false);
  };

  const autoDetectIp = async () => {
    const res = await fetch('https://api.ipify.org?format=json');
    const data = await res.json();
    setProxyConfig({ ...proxyConfig, vpsIp: data.ip });
  };

  const dismissReleaseNotice = async () => {
    if (!releaseNotice?.releaseTag) return;
    await window.jarvisApi.acknowledgeRelease(releaseNotice.releaseTag);
    setReleaseNotice(null);
  };

  const openReleaseNotice = async () => {
    if (!releaseNotice?.releaseTag) return;
    await window.jarvisApi.acknowledgeRelease(releaseNotice.releaseTag);
    await window.jarvisApi.openDashboard(releaseNotice.releaseUrl);
    setReleaseNotice(null);
  };

  const releasePublishedLabel = formatReleaseDate(releaseNotice?.publishedAt);

  return (
    <>
      {releaseNotice ? (
        <div className="modalBackdrop">
          <div className="modalCard">
            <p className="cardEyebrow">Upstream release</p>
            <h2>Jarvis got a new update</h2>
            <p className="modalLead">
              A new official Jarvis release is available from <code>vierisid/jarvis</code>.
            </p>
            <div className="releaseBadgeRow">
              <span className="badge warn">{releaseNotice.releaseTag}</span>
              {releasePublishedLabel ? <span className="badge neutral">{releasePublishedLabel}</span> : null}
            </div>
            <div className="callout">
              <strong>{releaseNotice.releaseName}</strong>
              <p>{releaseNotice.releaseNotes || 'Open the release page to read the upstream changelog and update when you are ready.'}</p>
            </div>
            <div className="buttonRow">
              <button onClick={() => void openReleaseNotice()}>View release</button>
              <button className="ghost" onClick={() => void handleUpdate()}>Update now</button>
              <button className="ghost" onClick={() => void dismissReleaseNotice()}>Dismiss</button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="shell">
        <aside className="sidebar">
        <div className="sidebarLogo">
          <p className="logoEyebrow">Unofficial community build</p>
          <h1>Jarvis Installer</h1>
          <p className="logoSub">Desktop installer and control panel for the upstream Jarvis daemon at usejarvis.dev</p>
        </div>

        <div className="sidebarCard">
          <p className="cardEyebrow">System</p>
          <p className="sysLine">{summary ? `${summary.platform} · ${summary.arch} · ${summary.hostname}` : 'Inspecting…'}</p>
          <div className="envPills">
            <span className={`envPill ${summary?.hasBun ? 'good' : 'warn'}`}>
              Bun {summary?.bunVersion ?? (summary?.hasBun ? '✓' : '—')} {summary?.hasBun ? '✓' : '✗'}
            </span>
            <span className={`envPill ${summary?.hasDocker ? 'good' : 'warn'}`}>
              Docker {summary?.hasDocker ? '✓' : '✗'}
            </span>
            <span className={`envPill ${summary?.wslDistros.length ? 'good' : 'neutral'}`}>
              WSL {summary?.wslDistros.length || '—'}
            </span>
          </div>
          {summary?.wslDistros.length ? <p className="wslNote">{summary.wslDistros.join(', ')}</p> : null}
        </div>

        <div className="sidebarCard accentCard">
          <p className="cardEyebrow">Status</p>
          <div className="statusIndicator">
            <span className={`statusDot ${installState?.running ? 'good' : installState?.installed ? 'warn' : 'off'}`} />
            <span className="statusText">
              {installState?.running ? 'Running' : installState?.installed ? 'Installed · stopped' : 'Not installed'}
            </span>
          </div>
          <p className="cardEyebrow" style={{marginTop: '12px'}}>Activity</p>
          <p className="activityText">{activity}</p>
        </div>

        <div className="sidebarCard">
          <p className="cardEyebrow">Installer updates</p>
          <div className="statusIndicator">
            <span className={`statusDot ${installerUpdateTone(installerUpdate)}`} />
            <span className="statusText">{installerUpdateLabel(installerUpdate)}</span>
          </div>
          <p className="activityText" style={{ marginTop: '10px' }}>
            {installerUpdate?.message || 'Checking for newer installer releases...'}
          </p>
          <div className="badgeRow" style={{ marginTop: '10px' }}>
            <span className="badge neutral">Current {installerUpdate?.currentVersion || '—'}</span>
            {installerUpdate?.latestVersion ? <span className="badge warn">Latest {installerUpdate.latestVersion}</span> : null}
          </div>
          {installerUpdate?.status === 'ready' ? (
            <div className="buttonRow" style={{ marginTop: '12px' }}>
              <button onClick={() => void window.jarvisApi.applyInstallerUpdate()}>Restart to apply</button>
            </div>
          ) : null}
        </div>

        <div className="sidebarCard">
          <p className="cardEyebrow">Notes</p>
          <div className="noticeList">
            {runtimeNotes.length ? runtimeNotes.map((note) => <p className="noteItem" key={note}>{note}</p>) : <p className="noteItem muted">No host warnings.</p>}
          </div>
        </div>
        </aside>

        <main className="main">
        <div className="sectionLabel">§ INSTALL</div>
        <section className="panel">
          <div className="panelHeader">
            <h2>Runtime strategy</h2>
            <button className="ghost" disabled={busy} onClick={() => void window.jarvisApi.openDashboard(dashboardUrl)}>
              ⎋ Dashboard
            </button>
          </div>

          <div className="modeStrip">
            {modeOptions.map((option) => {
              const selected = normalizedProfile.mode === option.value;
              return (
                <button
                  key={option.value}
                  className={`modeCard ${selected ? 'selected' : ''}`}
                  disabled={busy}
                  onClick={() => void persistProfile({ ...normalizedProfile, mode: option.value })}
                >
                  {option.label}
                </button>
              );
            })}
          </div>

          <div className="grid">
            <label>
              <span>Mode</span>
              <select
                value={normalizedProfile.mode}
                onChange={(event) => void persistProfile({ ...normalizedProfile, mode: event.target.value as InstallMode })}
              >
                {modeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span>Port</span>
              <input
                type="number"
                value={normalizedProfile.port}
                onChange={(event) => void persistProfile({ ...normalizedProfile, port: Number(event.target.value) || 3142 })}
              />
            </label>

            <label>
              <span>Upstream repo</span>
              <input
                value={normalizedProfile.jarvisRepo}
                onChange={(event) => void persistProfile({ ...normalizedProfile, jarvisRepo: event.target.value.trim() })}
              />
            </label>

            <label>
              <span>Data directory</span>
              <input
                placeholder={normalizedProfile.mode === 'docker' ? '~/.jarvis-docker' : '~/.jarvis'}
                value={normalizedProfile.dataDir || ''}
                onChange={(event) => void persistProfile({ ...normalizedProfile, dataDir: event.target.value })}
              />
            </label>

            {normalizedProfile.mode === 'docker' ? (
              <label>
                <span>Container name</span>
                <input
                  value={normalizedProfile.containerName || ''}
                  onChange={(event) => void persistProfile({ ...normalizedProfile, containerName: event.target.value || 'jarvis-daemon' })}
                />
              </label>
            ) : null}

            {normalizedProfile.mode === 'wsl2' ? (
              <label>
                <span>WSL distro</span>
                <select
                  value={normalizedProfile.wslDistro || summary?.wslDistros[0] || ''}
                  onChange={(event) => void persistProfile({ ...normalizedProfile, wslDistro: event.target.value })}
                >
                  {((summary?.wslDistros.length ? summary.wslDistros : ['']) || ['']).map((distro) => (
                    <option key={distro} value={distro}>
                      {distro || 'Auto-install default Ubuntu distro'}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            <label className="checkbox">
              <input
                type="checkbox"
                checked={normalizedProfile.installSidecar}
                onChange={(event) => void persistProfile({ ...normalizedProfile, installSidecar: event.target.checked })}
              />
              <span>Install local sidecar when supported</span>
            </label>
          </div>

          <div className="callout">
            <strong>{modeContent[normalizedProfile.mode].label}</strong>
            <p>{modeContent[normalizedProfile.mode].summary}</p>
            <p>{modeContent[normalizedProfile.mode].caution}</p>
          </div>

          {validationErrors.length ? (
            <div className="errorBox">
              <strong>Fix these settings before install:</strong>
              <ul>
                {validationErrors.map((error) => (
                  <li key={error}>{error}</li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="successBox">
              <strong>Profile looks valid.</strong>
              <p>The installer can run with the current settings.</p>
            </div>
          )}

          <div className="buttonRow">
            <button className={busy ? 'busy' : ''} disabled={busy || !isProfileValid} onClick={() => void handleInstall()}>
              ⊞ Install / Repair
            </button>
            <button className="ghost" disabled={busy || !isProfileValid} onClick={() => void openOnboarding()}>
              ↳ Jarvis onboard
            </button>
            <button className="ghost" disabled={busy || !isProfileValid} onClick={() => void handleLifecycle('status')}>
              ◎ Status
            </button>
          </div>
          {installProgress ? (
            <div className="installProgressCard">
              <div className="installProgressHeader">
                <strong>Installation progress</strong>
                <span>{Math.max(0, Math.min(100, Math.round(installProgress.percent)))}%</span>
              </div>
              <div className="installProgressTrack" aria-hidden="true">
                <div className="installProgressFill" style={{ width: `${Math.max(0, Math.min(100, installProgress.percent))}%` }} />
              </div>
              <p className="installProgressText">{installProgress.message}</p>
            </div>
          ) : null}
        </section>

        <div className="sectionLabel">§ DAEMON</div>
        <section className="panel">
          <div className="panelHeader">
            <h2>Daemon controls</h2>
            <div className="badgeRow">
              <span className="badge neutral">{modeContent[normalizedProfile.mode].label}</span>
              <span className="badge neutral">{dashboardUrl}</span>
              {installState ? (
                <span className={`badge ${installState.running ? 'good' : installState.installed ? 'warn' : 'neutral'}`}>
                  {installState.running ? 'Running' : installState.installed ? 'Installed' : 'Not installed'}
                </span>
              ) : null}
            </div>
          </div>
          <div className="daemonStatus">
            <span className={`statusDot ${installState?.running ? 'good' : installState?.installed ? 'warn' : 'off'}`} />
            <span className="daemonStatusText">
              {installState?.running ? 'Running' : installState?.installed ? 'Installed — stopped' : 'Not installed'}
            </span>
          </div>
          <div className="buttonRow">
            <button disabled={busy || !isProfileValid} onClick={() => void handleLifecycle('start')}>▶ Start</button>
            <button className="ghost" disabled={busy || !isProfileValid} onClick={() => void handleLifecycle('stop')}>■ Stop</button>
            <button className="ghost" disabled={busy || !isProfileValid} onClick={() => void handleLifecycle('restart')}>↺ Restart</button>
            <button className="ghost" disabled={busy || !isProfileValid} onClick={() => void handleLifecycle('logs')}>📋 Logs</button>
            <button className="ghost" disabled={busy || !isProfileValid} onClick={() => void handleUpdate()}>↑ Update</button>
          </div>
          <pre className="output">{logText || 'Lifecycle output will appear here.'}</pre>
        </section>

        <div className="sectionLabel">§ TERMINAL</div>
        <section className="panel terminalPanel">
          <div className="panelHeader">
            <h2>Embedded terminal</h2>
            {terminalId ? (
              <button
                className="ghost"
                onClick={() =>
                  void window.jarvisApi.terminalClose(terminalId).then(() => {
                    setTerminalId(null);
                    setActivity('Onboarding terminal closed.');
                  })
                }
              >
                ✕ Close
              </button>
            ) : null}
          </div>
          <div
            className="terminalMount"
            ref={terminalMount}
            onClick={() => terminalRef.current?.focus()}
            onPaste={(event) => {
              event.preventDefault();
              void pasteTerminalClipboard(event.clipboardData.getData('text'), 'paste');
            }}
          />
        </section>

        <div className="sectionLabel">§ REVERSE PROXY</div>
        <section className="proxy-section panel">
          <h2>Reverse Proxy</h2>
          <p className="section-desc">Auto-configure Cloudflare DNS + nginx + SSL for your VPS. Linux only.</p>
          <div className="proxy-form">
            <div className="form-row">
              <label>Domain / Subdomain</label>
              <input type="text" placeholder="jarvis.yourdomain.com" value={proxyConfig.domain} onChange={e => setProxyConfig({...proxyConfig, domain: e.target.value})} />
            </div>
            <div className="form-row">
              <label>Cloudflare API Token</label>
              <input type="password" placeholder="CF API token with DNS:Edit" value={proxyConfig.cfApiToken} onChange={e => setProxyConfig({...proxyConfig, cfApiToken: e.target.value})} />
            </div>
            <div className="form-row">
              <label>Cloudflare Zone ID</label>
              <input type="text" placeholder="Zone ID from CF dashboard" value={proxyConfig.cfZoneId} onChange={e => setProxyConfig({...proxyConfig, cfZoneId: e.target.value})} />
            </div>
            <div className="form-row">
              <label>SSL Email</label>
              <input type="email" placeholder="you@example.com" value={proxyConfig.email} onChange={e => setProxyConfig({...proxyConfig, email: e.target.value})} />
            </div>
            <div className="form-row">
              <label>VPS Public IP</label>
              <div className="input-with-btn">
                <input type="text" placeholder="1.2.3.4" value={proxyConfig.vpsIp} onChange={e => setProxyConfig({...proxyConfig, vpsIp: e.target.value})} />
                <button className="btn-inline" onClick={autoDetectIp}>Auto-detect</button>
              </div>
            </div>
            <div className="form-row">
              <label>Jarvis Port</label>
              <input type="number" value={proxyConfig.port} onChange={e => setProxyConfig({...proxyConfig, port: Number(e.target.value)})} />
            </div>
          </div>
          <button className="btn-primary" onClick={handleSetupProxy} disabled={proxyRunning}>
            {proxyRunning ? <><span className="spinner" /> Setting up…</> : '🔒 Setup Reverse Proxy'}
          </button>
          {proxyResult && (
            <div className={`proxy-result ${proxyResult.ok ? 'success' : 'error'}`}>
              <pre className="output-log">{proxyResult.output}</pre>
              {proxyResult.ok && proxyResult.url && (
                <p className="proxy-url">✅ Live at: <a href={proxyResult.url} target="_blank" rel="noreferrer">{proxyResult.url}</a></p>
              )}
            </div>
          )}
        </section>
        </main>
      </div>
    </>
  );
}
