const { app, BrowserWindow, Notification } = require('electron');

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    title: 'RTC Strikes Back',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  // Charger l'app Next.js
  win.loadURL('http://localhost:3000');

  // Notifications système quand la fenêtre n'est pas au premier plan
  win.webContents.on('ipc-message', (event, channel, ...args) => {
    if (channel === 'notify' && !win.isFocused()) {
      const notif = new Notification({
        title: args[0] || 'Nouveau message',
        body: args[1] || '',
      });
      notif.show();
    }
  });
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
