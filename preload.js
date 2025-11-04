const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  closeApp: () => ipcRenderer.send('close-app'),
  getEnv: (key) => ipcRenderer.invoke('get-env', key),
  setAQIIcon: (aqi) => ipcRenderer.invoke('set-aqi-icon', aqi),
});
