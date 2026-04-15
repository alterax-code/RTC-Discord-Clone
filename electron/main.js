const { app, BrowserWindow, Notification, ipcMain } = require('electron');
const path = require('path');

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    title: 'RTC Strikes Back',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  // Charger l'app Next.js
  win.loadURL('http://localhost:3000');

  // Notifications système quand la fenêtre n'est pas au premier plan
  ipcMain.on('notify', (_event, title, body) => {
    if (win.isFocused()) return;
    new Notification({
      title: title || 'Nouveau message',
      body: body || '',
    }).show();
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
