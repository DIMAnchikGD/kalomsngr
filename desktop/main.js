const { app, BrowserWindow, ipcMain, clipboard } = require('electron');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

let win;
let backendProcess = null;

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 980,
    minHeight: 700,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) {
    win.loadURL(devUrl);
  } else {
    win.loadFile(path.join(__dirname, '../frontend/dist/index.html'));
  }
}

function resolveBackendEntry() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'app.asar.unpacked', 'backend', 'server.js')
    : path.join(__dirname, '../backend/server.js');
}

function startBackend(port = 3030) {
  if (backendProcess) {
    return { ok: true, port };
  }

  const backendEntry = resolveBackendEntry();
  backendProcess = spawn(process.execPath, [backendEntry], {
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      PORT: String(port),
      HOST: '0.0.0.0',
      DATA_DIR: app.getPath('userData')
    },
    stdio: 'inherit'
  });

  backendProcess.on('exit', () => {
    backendProcess = null;
  });

  return { ok: true, port };
}

function stopBackend() {
  if (backendProcess) {
    backendProcess.kill();
    backendProcess = null;
  }
  return { ok: true };
}

function getLocalIPv4() {
  const nets = os.networkInterfaces();
  const addresses = [];

  Object.entries(nets).forEach(([name, entries]) => {
    for (const net of entries || []) {
      if (net.family === 'IPv4' && !net.internal) {
        addresses.push({ interface: name, address: net.address });
      }
    }
  });

  return addresses;
}

ipcMain.handle('host:start', (_e, port) => startBackend(port));
ipcMain.handle('host:stop', () => stopBackend());
ipcMain.handle('net:ipv4', () => getLocalIPv4());
ipcMain.handle('clipboard:copy', (_e, text) => clipboard.writeText(text));

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  stopBackend();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
