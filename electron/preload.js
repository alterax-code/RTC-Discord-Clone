const { ipcRenderer } = require('electron');

window.electronAPI = {
  notify: (title, body) => ipcRenderer.send('notify', title, body),
};
