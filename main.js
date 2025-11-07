require("dotenv").config();

const { app, BrowserWindow, ipcMain, globalShortcut, nativeImage, session, Tray, Menu, Notification } = require("electron");
const path = require("path");
const fs = require("fs");
const { execFile } = require("child_process");

let mainWindow;
let tray;
let alwaysOnTopEnabled = false;
let isQuitting = false;
let prefs = { notifyHighAQI: true, showOnStartup: true, minimizeToTrayOnClose: true };

// Ensure Open-at-login works in dev (Windows) by passing the app path
// to electron.exe. Otherwise Windows starts bare electron.exe after
// reboot and shows the default Electron window.
function setOpenAtLogin(enabled) {
  try {
    if (process.platform === 'win32') {
      const args = app.isPackaged ? [] : [app.getAppPath()];
      app.setLoginItemSettings({ openAtLogin: !!enabled, args });
    } else {
      app.setLoginItemSettings({ openAtLogin: !!enabled });
    }
  } catch (_) {}
}

function getConfigPath() {
  try {
    return path.join(app.getPath('userData'), 'aqi-widget-settings.json');
  } catch (_) {
    return path.join(__dirname, 'aqi-widget-settings.json');
  }
}

function loadPrefs() {
  try {
    const p = getConfigPath();
    if (fs.existsSync(p)) {
      const raw = fs.readFileSync(p, 'utf8');
      const obj = JSON.parse(raw);
      if (obj && typeof obj === 'object') {
        if (typeof obj.notifyHighAQI === 'boolean') prefs.notifyHighAQI = obj.notifyHighAQI;
        if (typeof obj.showOnStartup === 'boolean') prefs.showOnStartup = obj.showOnStartup;
        if (typeof obj.minimizeToTrayOnClose === 'boolean') prefs.minimizeToTrayOnClose = obj.minimizeToTrayOnClose;
      }
    }
  } catch (_) {}
}

function savePrefs() {
  try {
    const p = getConfigPath();
    const dir = path.dirname(p);
    try { fs.mkdirSync(dir, { recursive: true }); } catch (_) {}
    fs.writeFileSync(p, JSON.stringify(prefs, null, 2), 'utf8');
  } catch (_) {}
}

function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow();
  }
  if (!mainWindow.isVisible()) mainWindow.show();
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.focus();
}

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
      backgroundThrottling: false,
      devTools: !app.isPackaged,
    },
    // Show only after first paint to avoid any visual flash
    show: false,
    backgroundColor: '#ececec',
  });

  mainWindow.loadFile("index.html");
  mainWindow.once('ready-to-show', () => {
    try {
      if (prefs.showOnStartup) mainWindow.show();
    } catch (_) {}
  });
  try {
    mainWindow.setAlwaysOnTop(!!alwaysOnTopEnabled, "pop-up-menu");
  } catch {}

  // При попытке закрытия окна — сворачиваем в трей (если это не явный выход)
  try {
    mainWindow.on("close", (e) => {
      if (!isQuitting && prefs.minimizeToTrayOnClose !== false) {
        e.preventDefault();
        mainWindow.hide();
      }
    });
  } catch {}
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
    // Для значений > 300 используем 300+ иконку, если доступна; иначе безопасный фолбэк 201-300
    const plus300 = path.join(__dirname, "icon-300plus-512.png");
    if (fs.existsSync(plus300)) return plus300;
    // TODO: добавить icon-300plus-512.png в ассеты для полноты
    return path.join(__dirname, "icon-201-300-512.png");
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

// Установить AppUserModelID на Windows для корректной группировки ярлыков/уведомлений
try {
  if (process.platform === "win32") {
    const pkg = require("./package.json");
    const appId = (pkg && pkg.build && pkg.build.appId) ? pkg.build.appId : "com.yourapp.aqi";
    app.setAppUserModelId(appId);
  }
} catch (_) {}

app.on("second-instance", () => {
  showMainWindow();
});

// Hiddify proxy mode
// follow-system (default): не трогаем системные настройки и не переопределяем прокси приложения
// force: явно ставим прокси для приложения на HIDDIFY_PROXY
// off: отключаем прокси только для приложения (direct)
const HIDDIFY_MODE = String(process.env.HIDDIFY_MODE || "follow-system").toLowerCase();
const HIDDIFY_PROXY = process.env.HIDDIFY_PROXY || "http://127.0.0.1:7890"; // http://host:port, https://, socks5://
const HIDDIFY_BYPASS = process.env.HIDDIFY_PROXY_BYPASS || "localhost;127.0.0.1;<local>";
const HIDDIFY_SET_SYSTEM = ["1", "true", "yes"].includes(String(process.env.HIDDIFY_SET_SYSTEM_PROXY || "").toLowerCase());

function enableSystemProxyWindows(proxyServer, proxyBypass) {
  return new Promise((resolve) => {
    try {
      const key = "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings";
      const cmds = [
        ["add", key, "/v", "ProxyEnable", "/t", "REG_DWORD", "/d", "1", "/f"],
        ["add", key, "/v", "ProxyServer", "/t", "REG_SZ", "/d", proxyServer, "/f"],
        ["add", key, "/v", "ProxyOverride", "/t", "REG_SZ", "/d", proxyBypass, "/f"],
      ];
      let pending = cmds.length;
      cmds.forEach(args => {
        execFile("reg", args, { windowsHide: true }, () => {
          pending -= 1;
          if (pending === 0) resolve();
        });
      });
    } catch (_) {
      resolve();
    }
  });
}

app.whenReady().then(async () => {
  // Load persisted preferences
  loadPrefs();
  // Dev-mode Windows autostart safety: never keep an autostart entry
  // when running via `electron .` to avoid stray Electron windows on
  // reboot. If one exists, remove it once user launches the app.
  try {
    if (process.platform === 'win32' && !app.isPackaged) {
      const login = app.getLoginItemSettings();
      if (login && login.openAtLogin) {
        setOpenAtLogin(false);
      }
    }
  } catch (_) {}
  // Не мешаем вручную включенному Hiddify: по умолчанию следуем системным настройкам прокси
  try {
    if (HIDDIFY_MODE === "force") {
      await session.defaultSession.setProxy({ proxyRules: HIDDIFY_PROXY, proxyBypassRules: HIDDIFY_BYPASS });
      // Изменение системного прокси только если явно разрешено и запрошен режим force
      if (HIDDIFY_SET_SYSTEM && process.platform === "win32") {
        const proxyServer = HIDDIFY_PROXY.replace(/^\w+:\/\//, ""); // host:port
        await enableSystemProxyWindows(proxyServer, HIDDIFY_BYPASS);
      }
    } else if (HIDDIFY_MODE === "off") {
      await session.defaultSession.setProxy({ mode: "direct" });
    } else {
      // follow-system
      await session.defaultSession.setProxy({ mode: "system" });
    }
  } catch (e) {
    console.warn("Proxy configuration error", e);
  }

  createWindow();

  // System tray with context menu
  try {
    const baseIcon = nativeImage.createFromPath(path.join(__dirname, "icon-51-100-512.png"));
    const trayIcon = baseIcon.isEmpty() ? undefined : baseIcon.resize({ width: 16, height: 16 });
    tray = new Tray(trayIcon || baseIcon);
    tray.setToolTip("AQI Widget");

    const isWin = process.platform === "win32";
    const login = isWin ? app.getLoginItemSettings() : { openAtLogin: false };

    const buildMenu = () => Menu.buildFromTemplate([
      { label: "Открыть", click: () => showMainWindow() },
      { label: "Обновить", click: () => { try { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send("refresh-now"); } catch (_) {} } },
      { type: "separator" },
      { label: "Всегда поверх", type: "checkbox", checked: !!alwaysOnTopEnabled, click: (item) => {
          alwaysOnTopEnabled = item.checked;
          try { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.setAlwaysOnTop(!!alwaysOnTopEnabled, "pop-up-menu"); } catch {}
        }
      },
      { label: "Показывать окно при запуске", type: "checkbox", checked: !!prefs.showOnStartup, click: (item) => {
          prefs.showOnStartup = !!item.checked;
          savePrefs();
          try {
            if (prefs.showOnStartup) { showMainWindow(); }
          } catch {}
        }
      },
      { label: "Свернуть в трей при закрытии", type: "checkbox", checked: prefs.minimizeToTrayOnClose !== false, click: (item) => {
          prefs.minimizeToTrayOnClose = !!item.checked;
          savePrefs();
        }
      },
      { label: "Уведомления при высоком AQI", type: "checkbox", checked: !!prefs.notifyHighAQI, click: (item) => {
          prefs.notifyHighAQI = !!item.checked;
          savePrefs();
          try { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('prefs-changed', { key: 'notifyHighAQI', value: prefs.notifyHighAQI }); } catch {}
        }
      },
      isWin ? { label: "Автозапуск при входе", type: "checkbox", checked: !!login.openAtLogin, click: (item) => {
          try {
            if (app.isPackaged) {
              setOpenAtLogin(!!item.checked);
            } else {
              // In dev, never register autostart; also uncheck back
              setOpenAtLogin(false);
              try { item.checked = false; } catch (_) {}
            }
          } catch {}
        } } : { label: "Автозапуск недоступен", enabled: false },
      { type: "separator" },
      { label: "Выход", click: () => { try { isQuitting = true; app.quit(); } catch {} } },
    ]);

    const menu = buildMenu();
    tray.setContextMenu(menu);
    tray.on("click", () => showMainWindow());
    try { tray.on("double-click", () => showMainWindow()); } catch {}
  } catch (e) {
    console.warn("Tray init error", e);
  }

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

  // Автозапуск контролируется через меню трея и сохраняется в настройках.

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

ipcMain.on("close-app", () => {
  try {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (prefs.minimizeToTrayOnClose !== false) {
        mainWindow.hide();
      } else {
        isQuitting = true;
        app.quit();
      }
    } else {
      isQuitting = true;
      app.quit();
    }
  } catch {
    isQuitting = true;
    app.quit();
  }
});

ipcMain.handle("get-env", (_e, key) => process.env[key] ?? "");

ipcMain.handle("set-aqi-icon", (_e, aqi) => {
  setAppIconByAQI(aqi);
  return true;
});

ipcMain.handle('get-pref', (_e, key) => {
  try {
    if (key === 'notifyHighAQI') return !!prefs.notifyHighAQI;
  } catch (_) {}
  return undefined;
});

ipcMain.handle("notify", (_e, payload) => {
  try {
    const title = payload && typeof payload.title === "string" ? payload.title : "AQI";
    const body = payload && typeof payload.body === "string" ? payload.body : "";
    if (Notification && Notification.isSupported() && prefs.notifyHighAQI !== false) {
      const iconPath = path.join(__dirname, "icon-51-100-512.png");
      const n = new Notification({ title, body, silent: false, icon: iconPath });
      n.show();
      return true;
    }
  } catch (e) {
    console.warn("Notification error", e);
  }
  return false;
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
});

app.on("before-quit", () => {
  isQuitting = true;
});
