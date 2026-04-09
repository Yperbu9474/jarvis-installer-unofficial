import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('jarvisApi', {
  systemSummary: () => ipcRenderer.invoke('jarvis:systemSummary'),
  getProfile: () => ipcRenderer.invoke('jarvis:getProfile'),
  detectState: (profile: unknown) => ipcRenderer.invoke('jarvis:detectState', profile),
  saveProfile: (profile: unknown) => ipcRenderer.invoke('jarvis:saveProfile', profile),
  install: (profile: unknown) => ipcRenderer.invoke('jarvis:install', profile),
  lifecycle: (profile: unknown, action: string) => ipcRenderer.invoke('jarvis:lifecycle', { profile, action }),
  openDashboard: (url: string) => ipcRenderer.invoke('jarvis:openDashboard', url),
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
});
