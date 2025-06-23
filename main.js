const { app, BrowserWindow } = require("electron");
const path = require("path");
const AutoLaunch = require("auto-launch");


function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 250,
    height: 300,
    frame: false,
    transparent: false,
    resizable: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile("index.html");
}

app.whenReady().then(() => {
  createWindow();

  const aqiAutoLauncher = new AutoLaunch({
    name: "AQI Widget",
    path: app.getPath("exe"),
  });

  aqiAutoLauncher.enable();

  app.on("activate", function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

const { ipcMain } = require("electron");

ipcMain.on("close-app", () => {
  app.quit();
});

app.on("window-all-closed", function () {
  if (process.platform !== "darwin") app.quit();
});



