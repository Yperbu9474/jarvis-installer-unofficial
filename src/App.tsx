import { useEffect, useMemo, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import type { InstallMode, InstallProfile, InstallState, LifecycleAction, SystemSummary } from './lib/types';

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
    caution: 'Requires a working WSL2 distro and Windows support already enabled.',
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

  if (profile.mode === 'wsl2' && !summary.wslDistros.length) {
    errors.push('No WSL distros were detected. Install or configure WSL2 first.');
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
    notes.push('Docker is not detected. The installer will try to install or start it where supported.');
  }

  if (profile.mode === 'wsl2' && summary.platform === 'win32') {
    notes.push('Jarvis commands will run inside WSL, not directly in Windows PowerShell.');
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
      dashboardUrl: `http://localhost:${fallback.port || 3142}`,
    },
  };
}

export default function App() {
  const [summary, setSummary] = useState<SystemSummary | null>(null);
  const [profile, setProfile] = useState<InstallProfile>(defaultProfile);
  const [activity, setActivity] = useState('Loading environment details...');
  const [logText, setLogText] = useState('');
  const [busy, setBusy] = useState(false);
  const [installState, setInstallState] = useState<InstallState | null>(null);
  const [terminalId, setTerminalId] = useState<string | null>(null);
  const terminalMount = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);

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
    const remove = window.jarvisApi.onTerminalData(({ id, data }) => {
      if (id === terminalId) terminalRef.current?.write(data);
    });
    return remove;
  }, [terminalId]);

  useEffect(() => {
    if (!terminalMount.current || terminalRef.current) return;
    const terminal = new Terminal({
      theme: {
        background: '#07111f',
        foreground: '#d7e3f5',
        cursor: '#f4b860',
      },
      fontFamily: '"JetBrains Mono", "SFMono-Regular", monospace',
      fontSize: 13,
    });
    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.open(terminalMount.current);
    fitAddon.fit();
    terminal.onData((data) => {
      if (terminalId) {
        void window.jarvisApi.terminalWrite(terminalId, data);
      }
    });
    terminalRef.current = terminal;
    fitRef.current = fitAddon;
    const onResize = () => {
      fitAddon.fit();
      if (terminalId) {
        void window.jarvisApi.terminalResize(terminalId, terminal.cols, terminal.rows);
      }
    };
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      terminal.dispose();
      terminalRef.current = null;
    };
  }, [terminalId]);

  const normalizedProfile = useMemo(() => normalizeProfile(profile, summary), [profile, summary]);
  const validationErrors = useMemo(() => getValidationErrors(normalizedProfile, summary), [normalizedProfile, summary]);
  const runtimeNotes = useMemo(() => getRuntimeNotes(normalizedProfile, summary), [normalizedProfile, summary]);
  const isProfileValid = validationErrors.length === 0;
  const dashboardUrl = `http://localhost:${normalizedProfile.port || 3142}`;

  const modeOptions = useMemo(
    () =>
      (summary?.supportedModes || []).map((mode) => ({
        value: mode,
        label: modeContent[mode].label,
      })),
    [summary],
  );

  async function persistProfile(nextProfile: InstallProfile) {
    const normalized = normalizeProfile(nextProfile, summary);
    setProfile(normalized);
    await window.jarvisApi.saveProfile(normalized);
    const state = await window.jarvisApi.detectState(normalized);
    setInstallState(state);
  }

  async function handleInstall() {
    if (!isProfileValid) {
      setActivity('Installer settings need attention before execution.');
      return;
    }

    setBusy(true);
    setActivity(`Checking existing Jarvis state in ${modeContent[normalizedProfile.mode].label} mode...`);
    try {
      const state = await window.jarvisApi.detectState(normalizedProfile);
      setInstallState(state);

      if (state.running) {
        const logs = await window.jarvisApi.lifecycle(normalizedProfile, 'logs');
        setLogText(logs.output || 'Jarvis is already running.');
        setActivity(`Jarvis is already running. Dashboard expected at ${state.dashboardUrl}`);
        return;
      }

      if (state.installed) {
        const startResult = await window.jarvisApi.lifecycle(normalizedProfile, 'start');
        const logs = await window.jarvisApi.lifecycle(normalizedProfile, 'logs');
        setLogText(logs.output || startResult.output || 'Jarvis started.');
        setActivity(startResult.ok ? `Jarvis was already installed and has been started.` : 'Jarvis is installed but failed to start. Review logs below.');
        const refreshed = await window.jarvisApi.detectState(normalizedProfile);
        setInstallState(refreshed);
        return;
      }

      setActivity(`Installing Jarvis in ${modeContent[normalizedProfile.mode].label} mode...`);
      const result = await window.jarvisApi.install(normalizedProfile);
      setLogText(result.output || 'Installer completed without additional output.');
      setActivity(result.ok ? `Install finished. Dashboard expected at ${result.dashboardUrl}` : 'Install failed. Review the output below.');
      const refreshed = await window.jarvisApi.detectState(normalizedProfile);
      setInstallState(refreshed);
    } catch (error) {
      setLogText(String(error));
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
    } catch (error) {
      setLogText(String(error));
      setActivity(`${action} failed before completion.`);
    } finally {
      setBusy(false);
    }
  }

  async function openOnboarding() {
    if (!isProfileValid) {
      setActivity('Current profile is invalid. Fix installer settings before onboarding.');
      return;
    }

    if (terminalId) {
      await window.jarvisApi.terminalClose(terminalId);
      setTerminalId(null);
      terminalRef.current?.clear();
    }
    const session = await window.jarvisApi.terminalCreate({ profile: normalizedProfile, purpose: 'onboard' });
    setTerminalId(session.id);
    setActivity('Interactive onboarding is running below.');
    setTimeout(() => {
      fitRef.current?.fit();
      if (terminalRef.current) {
        void window.jarvisApi.terminalResize(session.id, terminalRef.current.cols, terminalRef.current.rows);
      }
    }, 50);
  }

  return (
    <div className="shell">
      <aside className="sidebar">
        <div>
          <p className="eyebrow">Unofficial community build</p>
          <h1>Jarvis Installer</h1>
          <p className="lede">
            A desktop installer and control panel for the upstream Jarvis daemon at
            <span> usejarvis.dev</span>.
          </p>
        </div>

        <div className="card">
          <h2>Environment</h2>
          <p>{summary ? `${summary.platform} • ${summary.arch} • ${summary.hostname}` : 'Inspecting host...'}</p>
          <div className="badgeRow">
            <span className={`badge ${summary?.hasBun ? 'good' : 'warn'}`}>Bun {summary?.hasBun ? 'ready' : 'missing'}</span>
            <span className={`badge ${summary?.hasDocker ? 'good' : 'warn'}`}>Docker {summary?.hasDocker ? 'ready' : 'missing'}</span>
            <span className={`badge ${summary?.wslDistros.length ? 'good' : 'neutral'}`}>WSL {summary?.wslDistros.length || 0}</span>
          </div>
          {summary?.wslDistros.length ? <p>WSL distros: {summary.wslDistros.join(', ')}</p> : null}
        </div>

        <div className="card accent">
          <h2>Current activity</h2>
          <p>{activity}</p>
        </div>

        <div className="card">
          <h2>Runtime notes</h2>
          <div className="noticeList">
            {runtimeNotes.length ? runtimeNotes.map((note) => <p key={note}>{note}</p>) : <p>No immediate host warnings detected.</p>}
          </div>
        </div>
      </aside>

      <main className="main">
        <section className="panel">
          <div className="panelHeader">
            <div>
              <p className="eyebrow">Install wizard</p>
              <h2>Pick a runtime strategy</h2>
            </div>
            <button className="ghost" disabled={busy} onClick={() => void window.jarvisApi.openDashboard(dashboardUrl)}>
              Open dashboard
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
                  <strong>{option.label}</strong>
                  <span>{modeContent[option.value].summary}</span>
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
                  {(summary?.wslDistros || ['']).map((distro) => (
                    <option key={distro} value={distro}>
                      {distro || 'Default distro'}
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
            <button disabled={busy || !isProfileValid} onClick={() => void handleInstall()}>
              Install or repair
            </button>
            <button className="ghost" disabled={busy || !isProfileValid} onClick={() => void openOnboarding()}>
              Run onboarding
            </button>
            <button className="ghost" disabled={busy || !isProfileValid} onClick={() => void handleLifecycle('status')}>
              Status
            </button>
          </div>
        </section>

        <section className="panel">
          <div className="panelHeader">
            <div>
              <p className="eyebrow">Control panel</p>
              <h2>Daemon controls</h2>
            </div>
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
          <div className="buttonRow">
            <button disabled={busy || !isProfileValid} onClick={() => void handleLifecycle('start')}>
              Start
            </button>
            <button className="ghost" disabled={busy || !isProfileValid} onClick={() => void handleLifecycle('stop')}>
              Stop
            </button>
            <button className="ghost" disabled={busy || !isProfileValid} onClick={() => void handleLifecycle('restart')}>
              Restart
            </button>
            <button className="ghost" disabled={busy || !isProfileValid} onClick={() => void handleLifecycle('logs')}>
              Fetch logs
            </button>
          </div>
          <pre className="output">{logText || 'Lifecycle output will appear here.'}</pre>
        </section>

        <section className="panel terminalPanel">
          <div className="panelHeader">
            <div>
              <p className="eyebrow">Interactive UI</p>
              <h2>Embedded onboarding terminal</h2>
            </div>
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
                Close terminal
              </button>
            ) : null}
          </div>
          <div className="terminalMount" ref={terminalMount} />
        </section>
      </main>
    </div>
  );
}
