const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  closeApp: () => ipcRenderer.send('close-app'),
  getEnv: (key) => ipcRenderer.invoke('get-env', key),
  setAQIIcon: (aqi) => ipcRenderer.invoke('set-aqi-icon', aqi),
  notify: (title, body) => ipcRenderer.invoke('notify', { title, body }),
  getPref: (key) => ipcRenderer.invoke('get-pref', key),
  onRefresh: (handler) => {
    try {
      if (typeof handler === 'function') {
        ipcRenderer.on('refresh-now', () => handler());
      }
    } catch (_) {}
  },
  onPrefsChanged: (handler) => {
    try {
      if (typeof handler === 'function') {
        ipcRenderer.on('prefs-changed', (_e, payload) => handler(payload));
      }
    } catch (_) {}
  },
});
