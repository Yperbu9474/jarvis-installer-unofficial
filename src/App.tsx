import { useEffect, useMemo, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import type { InstallMode, InstallProfile, LifecycleAction, SystemSummary } from './lib/types';

const defaultProfile: InstallProfile = {
  mode: 'native',
  port: 3142,
  jarvisRepo: 'https://github.com/vierisid/jarvis.git',
  installSidecar: true,
  containerName: 'jarvis-daemon',
};

export default function App() {
  const [summary, setSummary] = useState<SystemSummary | null>(null);
  const [profile, setProfile] = useState<InstallProfile>(defaultProfile);
  const [activity, setActivity] = useState('Loading environment details...');
  const [logText, setLogText] = useState('');
  const [busy, setBusy] = useState(false);
  const [terminalId, setTerminalId] = useState<string | null>(null);
  const terminalMount = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);

  useEffect(() => {
    void (async () => {
      const [systemSummary, saved] = await Promise.all([
        window.jarvisApi.systemSummary(),
        window.jarvisApi.getProfile(),
      ]);
      setSummary(systemSummary);
      setProfile((current) => ({
        ...current,
        ...saved,
        mode: saved?.mode || systemSummary.supportedModes[0] || current.mode,
      }));
      setActivity('Ready to install or manage Jarvis.');
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

  const modeOptions = useMemo(
    () =>
      (summary?.supportedModes || []).map((mode) => ({
        value: mode,
        label:
          mode === 'native'
            ? 'Native Bun'
            : mode === 'docker'
              ? 'Docker'
              : 'Windows WSL2',
      })),
    [summary],
  );

  async function persistProfile(nextProfile: InstallProfile) {
    setProfile(nextProfile);
    await window.jarvisApi.saveProfile(nextProfile);
  }

  async function handleInstall() {
    setBusy(true);
    setActivity('Installing Jarvis and provisioning runtime dependencies...');
    const result = await window.jarvisApi.install(profile);
    setLogText(result.output || 'Installer completed without additional output.');
    setActivity(result.ok ? `Install finished. Dashboard expected at ${result.dashboardUrl}` : 'Install failed. Review the output below.');
    setBusy(false);
  }

  async function handleLifecycle(action: LifecycleAction) {
    setBusy(true);
    const result = await window.jarvisApi.lifecycle(profile, action);
    setLogText(result.output || `${action} completed.`);
    setActivity(result.ok ? `${action} completed.` : `${action} failed.`);
    setBusy(false);
  }

  async function openOnboarding() {
    if (terminalId) {
      await window.jarvisApi.terminalClose(terminalId);
      setTerminalId(null);
      terminalRef.current?.clear();
    }
    const session = await window.jarvisApi.terminalCreate({ profile, purpose: 'onboard' });
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
          <p>Bun: {summary?.hasBun ? summary.bunVersion || 'installed' : 'not detected'}</p>
          <p>Docker: {summary?.hasDocker ? 'available' : 'not detected'}</p>
          {summary?.wslDistros.length ? <p>WSL distros: {summary.wslDistros.join(', ')}</p> : null}
        </div>

        <div className="card accent">
          <h2>Current activity</h2>
          <p>{activity}</p>
        </div>
      </aside>

      <main className="main">
        <section className="panel">
          <div className="panelHeader">
            <div>
              <p className="eyebrow">Install wizard</p>
              <h2>Pick a runtime strategy</h2>
            </div>
            <button className="ghost" disabled={busy} onClick={() => void window.jarvisApi.openDashboard(`http://localhost:${profile.port}`)}>
              Open dashboard
            </button>
          </div>

          <div className="grid">
            <label>
              <span>Mode</span>
              <select
                value={profile.mode}
                onChange={(event) => void persistProfile({ ...profile, mode: event.target.value as InstallMode })}
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
                value={profile.port}
                onChange={(event) => void persistProfile({ ...profile, port: Number(event.target.value) || 3142 })}
              />
            </label>

            {profile.mode === 'docker' ? (
              <label>
                <span>Container name</span>
                <input
                  value={profile.containerName || ''}
                  onChange={(event) => void persistProfile({ ...profile, containerName: event.target.value || 'jarvis-daemon' })}
                />
              </label>
            ) : null}

            {profile.mode === 'wsl2' ? (
              <label>
                <span>WSL distro</span>
                <select
                  value={profile.wslDistro || summary?.wslDistros[0] || ''}
                  onChange={(event) => void persistProfile({ ...profile, wslDistro: event.target.value })}
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
                checked={profile.installSidecar}
                onChange={(event) => void persistProfile({ ...profile, installSidecar: event.target.checked })}
              />
              <span>Install local sidecar when supported</span>
            </label>
          </div>

          <div className="buttonRow">
            <button disabled={busy} onClick={() => void handleInstall()}>
              Install or repair
            </button>
            <button className="ghost" disabled={busy} onClick={() => void openOnboarding()}>
              Run onboarding
            </button>
            <button className="ghost" disabled={busy} onClick={() => void handleLifecycle('status')}>
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
          </div>
          <div className="buttonRow">
            <button disabled={busy} onClick={() => void handleLifecycle('start')}>
              Start
            </button>
            <button className="ghost" disabled={busy} onClick={() => void handleLifecycle('stop')}>
              Stop
            </button>
            <button className="ghost" disabled={busy} onClick={() => void handleLifecycle('restart')}>
              Restart
            </button>
            <button className="ghost" disabled={busy} onClick={() => void handleLifecycle('logs')}>
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
              <button className="ghost" onClick={() => void window.jarvisApi.terminalClose(terminalId).then(() => setTerminalId(null))}>
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
