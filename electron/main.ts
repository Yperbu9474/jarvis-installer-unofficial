import { app, BrowserWindow, ipcMain, shell } from 'electron';
import path from 'node:path';
import log from 'electron-log/main';
import {
  closeTerminal,
  createTerminal,
  resizeTerminal,
  terminalSessions,
  writeTerminal,
} from './src/pty';
import {
  getSavedProfile,
  installJarvis,
  loadSystemSummary,
  runLifecycleAction,
  saveProfile,
} from './src/jarvis';

log.initialize();

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 920,
    minWidth: 1200,
    minHeight: 800,
    backgroundColor: '#0f1722',
    title: 'Jarvis Installer',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) {
    void mainWindow.loadURL(devUrl);
  } else {
    void mainWindow.loadFile(path.join(app.getAppPath(), 'dist', 'index.html'));
  }
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('jarvis:systemSummary', async () => loadSystemSummary());
ipcMain.handle('jarvis:getProfile', async () => getSavedProfile());
ipcMain.handle('jarvis:saveProfile', async (_event, profile) => saveProfile(profile));
ipcMain.handle('jarvis:install', async (_event, profile) => installJarvis(profile));
ipcMain.handle('jarvis:lifecycle', async (_event, payload) => runLifecycleAction(payload.profile, payload.action));
ipcMain.handle('jarvis:openDashboard', async (_event, url) => shell.openExternal(url));

ipcMain.handle('terminal:create', async (_event, payload) => {
  const id = createTerminal(payload, (data) => {
    mainWindow?.webContents.send('terminal:data', { id, data });
  });
  return { id };
});

ipcMain.handle('terminal:write', async (_event, payload) => {
  writeTerminal(payload.id, payload.data);
  return { ok: true };
});

ipcMain.handle('terminal:resize', async (_event, payload) => {
  resizeTerminal(payload.id, payload.cols, payload.rows);
  return { ok: true };
});

ipcMain.handle('terminal:close', async (_event, payload) => {
  closeTerminal(payload.id);
  return { ok: true };
});

app.on('before-quit', () => {
  for (const id of terminalSessions.keys()) {
    closeTerminal(id);
  }
});
