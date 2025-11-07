/*
  Cleans stray Electron autostart entries on Windows that launch bare
  electron.exe (which shows the default Electron window). Run:
    npm run cleanup-autostart
*/
const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');

function exec(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    execFile(cmd, args, { windowsHide: true, ...opts }, (err, stdout = '', stderr = '') => {
      resolve({ code: err ? (err.code || 1) : 0, stdout: String(stdout), stderr: String(stderr) });
    });
  });
}

async function cleanupRegistryRun() {
  const key = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';
  const q = await exec('reg', ['query', key]);
  const lines = q.stdout.split(/\r?\n/);
  const deletions = [];
  for (const line of lines) {
    const m = line.match(/^\s*([^\s].*?)\s+REG_\w+\s+(.*)$/i);
    if (!m) continue;
    const name = m[1].trim();
    const data = m[2].trim();
    const lower = data.toLowerCase();
    // Remove entries that launch bare electron.exe (typical dev leftovers)
    const isBareElectron = lower.includes('node_modules\\electron\\dist\\electron.exe') ||
                           /(^|\\)electron\.exe(\s|$)/i.test(data);
    const looksLikePackagedApp = lower.includes('resources\\app.asar') || /\\aqi-widget\.exe(\s|$)/.test(lower);
    if (isBareElectron && !looksLikePackagedApp) {
      const del = await exec('reg', ['delete', key, '/v', name, '/f']);
      if (del.code === 0) deletions.push({ name, data });
    }
  }
  return deletions;
}

async function resolveLnkTargetPS(lnkPath) {
  const script = `($sh = New-Object -ComObject WScript.Shell).CreateShortcut('${lnkPath.replace(/'/g, "''")}').TargetPath`;
  const r = await exec('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script]);
  return r.stdout.trim();
}

async function cleanupStartupFolder() {
  const removed = [];
  try {
    const candidates = [];
    const userStartup = path.join(process.env.APPDATA || '', 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup');
    const commonStartup = path.join(process.env.ProgramData || '', 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup');
    [userStartup, commonStartup].forEach(p => { if (p && fs.existsSync(p)) candidates.push(p); });

    for (const dir of candidates) {
      const files = fs.readdirSync(dir).filter(f => f.toLowerCase().endsWith('.lnk'));
      for (const f of files) {
        const full = path.join(dir, f);
        try {
          const target = (await resolveLnkTargetPS(full)).toLowerCase();
          if (target.includes('node_modules\\electron\\dist\\electron.exe') || /(^|\\)electron\.exe$/i.test(target)) {
            fs.unlinkSync(full);
            removed.push(full);
          }
        } catch (_) {}
      }
    }
  } catch (_) {}
  return removed;
}

async function main() {
  if (process.platform !== 'win32') {
    console.log('Nothing to clean: not Windows.');
    return;
  }
  const regRemoved = await cleanupRegistryRun();
  const lnkRemoved = await cleanupStartupFolder();
  console.log(JSON.stringify({ regRemoved, lnkRemoved }, null, 2));
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
