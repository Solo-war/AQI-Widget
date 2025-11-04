require("dotenv").config();

const { app, BrowserWindow, ipcMain, globalShortcut, nativeImage } = require("electron");
const path = require("path");

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 250,
    height: 400,
    frame: false,
    transparent: false,
    resizable: false,
    minWidth: 220,
    minHeight: 400,
    icon: path.join(__dirname, "icon-51-100-512.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      devTools: !app.isPackaged,
    },
  });

  mainWindow.loadFile("index.html");
  return mainWindow;
}

function getIconPathForAQI(aqi) {
  const v = Number(aqi);
  if (Number.isFinite(v)) {
    if (v <= 50) return path.join(__dirname, "icon-0-50-512.png");
    if (v <= 100) return path.join(__dirname, "icon-51-100-512.png");
    if (v <= 150) return path.join(__dirname, "icon-101-150-512.png");
    if (v <= 200) return path.join(__dirname, "icon-151-200-512.png");
    if (v <= 300) return path.join(__dirname, "icon-201-300-512.png");
    return path.join(__dirname, "icon-300plus-512.png");
  }
  return path.join(__dirname, "icon-0-50-512.png");
}

function setAppIconByAQI(aqi) {
  try {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    const iconPath = getIconPathForAQI(aqi);
    const img = nativeImage.createFromPath(iconPath);
    if (img && !img.isEmpty()) {
      // Supported on Windows and Linux
      if (typeof mainWindow.setIcon === 'function') {
        mainWindow.setIcon(img);
      }
    }
  } catch (e) {
    console.warn("Failed to set app icon", e);
  }
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
  process.exit(0);
}

app.on("second-instance", () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

app.whenReady().then(() => {
  createWindow();

  // Global shortcut to show/focus the app
  const accelerator = "Control+Alt+Q";
  try {
    const registered = globalShortcut.register(accelerator, () => {
      if (!mainWindow || mainWindow.isDestroyed()) {
        createWindow();
        return;
      }
      if (!mainWindow.isVisible()) mainWindow.show();
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    });
    if (!registered) {
      console.warn("Global shortcut registration failed");
    }
  } catch (e) {
    console.warn("Global shortcut error", e);
  }

  // Enable auto start on Windows
  if (process.platform === "win32") {
    app.setLoginItemSettings({ openAtLogin: true });
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

ipcMain.on("close-app", () => {
  app.quit();
});

ipcMain.handle("get-env", (_e, key) => process.env[key] ?? "");

ipcMain.handle("set-aqi-icon", (_e, aqi) => {
  setAppIconByAQI(aqi);
  return true;
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
});
