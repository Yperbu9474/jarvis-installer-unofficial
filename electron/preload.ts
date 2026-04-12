import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('jarvisApi', {
  systemSummary: () => ipcRenderer.invoke('jarvis:systemSummary'),
  getProfile: () => ipcRenderer.invoke('jarvis:getProfile'),
  detectState: (profile: unknown) => ipcRenderer.invoke('jarvis:detectState', profile),
  saveProfile: (profile: unknown) => ipcRenderer.invoke('jarvis:saveProfile', profile),
  install: (profile: unknown) => ipcRenderer.invoke('jarvis:install', profile),
  update: (profile: unknown) => ipcRenderer.invoke('jarvis:update', profile),
  lifecycle: (profile: unknown, action: string) => ipcRenderer.invoke('jarvis:lifecycle', { profile, action }),
  openDashboard: (url: string) => ipcRenderer.invoke('jarvis:openDashboard', url),
  getReleaseNotice: () => ipcRenderer.invoke('jarvis:getReleaseNotice'),
  acknowledgeRelease: (releaseTag: string) => ipcRenderer.invoke('jarvis:acknowledgeRelease', releaseTag),
  getInstallerUpdateState: () => ipcRenderer.invoke('jarvis:getInstallerUpdateState'),
  applyInstallerUpdate: () => ipcRenderer.invoke('jarvis:applyInstallerUpdate'),
  terminalCreate: (payload: unknown) => ipcRenderer.invoke('terminal:create', payload),
  terminalWrite: (id: string, data: string) => ipcRenderer.invoke('terminal:write', { id, data }),
  terminalResize: (id: string, cols: number, rows: number) =>
    ipcRenderer.invoke('terminal:resize', { id, cols, rows }),
  terminalClose: (id: string) => ipcRenderer.invoke('terminal:close', { id }),
  onTerminalData: (listener: (payload: { id: string; data: string }) => void) => {
    const wrapped = (_event: unknown, payload: { id: string; data: string }) => listener(payload);
    ipcRenderer.on('terminal:data', wrapped);
    return () => ipcRenderer.off('terminal:data', wrapped);
  },
  onInstallerUpdate: (listener: (payload: unknown) => void) => {
    const wrapped = (_event: unknown, payload: unknown) => listener(payload);
    ipcRenderer.on('installer:update', wrapped);
    return () => ipcRenderer.off('installer:update', wrapped);
  },
  onInstallProgress: (listener: (payload: unknown) => void) => {
    const wrapped = (_event: unknown, payload: unknown) => listener(payload);
    ipcRenderer.on('jarvis:install-progress', wrapped);
    return () => ipcRenderer.off('jarvis:install-progress', wrapped);
  },
  setupProxy: (config: unknown) => ipcRenderer.invoke('jarvis:setupProxy', config),
});
