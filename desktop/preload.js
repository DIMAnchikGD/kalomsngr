const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  startHost: (port) => ipcRenderer.invoke('host:start', port),
  stopHost: () => ipcRenderer.invoke('host:stop'),
  getIPv4Addresses: () => ipcRenderer.invoke('net:ipv4'),
  copyText: (text) => ipcRenderer.invoke('clipboard:copy', text)
});
