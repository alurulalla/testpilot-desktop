/**
 * TestPilot Desktop — Electron main process.
 *
 * It runs the existing TestPilot (Next.js) app as a child process and shows it
 * in a native window. The TestPilot source is NOT modified or copied — we point
 * at it via TP_APP_DIR (defaults to the sibling ../TestPilot folder).
 *
 *   dev  (TP_MODE=dev)  → spawns `npm run dev` in the app dir
 *   prod (TP_MODE=prod) → runs the Next standalone server bundled under resources/app
 */
const { app, BrowserWindow, shell, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const net = require('net');
const { spawn } = require('child_process');

// ── Config ──────────────────────────────────────────────────────────────────
const MODE = process.env.TP_MODE || 'dev';
const PORT = Number(process.env.TP_PORT || 3000);
const APP_URL = `http://localhost:${PORT}`;

// Where the TestPilot app lives.
//  - dev:  sibling folder ../../TestPilot (override with TP_APP_DIR)
//  - prod: packaged under the app's resources/app
const APP_DIR = MODE === 'prod'
  ? path.join(process.resourcesPath, 'app')
  : (process.env.TP_APP_DIR || path.resolve(__dirname, '..', '..', 'TestPilot'));

let serverProc = null;
let win = null;

// ── Small inline pages (splash + error), themed to TestPilot violet ───────────
function page(title, body) {
  return 'data:text/html;charset=utf-8,' + encodeURIComponent(`
    <html><head><meta charset="utf-8"><style>
      body{margin:0;height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;
        background:#0b0a0f;color:#f5f3fa;font-family:-apple-system,Segoe UI,Roboto,sans-serif;text-align:center;gap:14px}
      .m{font-size:34px;font-weight:700}.m .g{color:#a78bfa}
      .s{color:#a49db8;max-width:44ch;line-height:1.6;font-size:14px}
      code{background:#1b1827;padding:2px 6px;border-radius:5px;color:#c9b3ff;font-size:13px}
      .spin{width:26px;height:26px;border:3px solid #2a2740;border-top-color:#a78bfa;border-radius:50%;animation:s 1s linear infinite}
      @keyframes s{to{transform:rotate(360deg)}}
    </style></head><body>${body}</body></html>`);
}
const splashHtml = () => page('Starting', `<div class="m">Test<span class="g">Pilot</span></div><div class="spin"></div><div class="s">Starting the local server…</div>`);
const errorHtml = (dir, extra = '') => page('Error', `<div class="m">Test<span class="g">Pilot</span></div>
  <div class="s">Couldn't find or start the TestPilot app at:<br><code>${dir}</code><br><br>
  Make sure the app is set up (its <code>.env</code> and <code>npm install</code>), or set <code>TP_APP_DIR</code> to its path.${extra ? '<br><br>' + extra : ''}</div>`);

// ── Wait until the app server accepts connections ─────────────────────────────
function waitForPort(port, host = '127.0.0.1', timeoutMs = 180_000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      const socket = net.connect(port, host);
      socket.once('connect', () => { socket.destroy(); resolve(); });
      socket.once('error', () => {
        socket.destroy();
        if (Date.now() - start > timeoutMs) return reject(new Error('Server did not start within the timeout.'));
        setTimeout(tick, 600);
      });
    };
    tick();
  });
}

// ── Start the TestPilot server as a child process ─────────────────────────────
function startServer() {
  const isWin = process.platform === 'win32';
  const env = { ...process.env, PORT: String(PORT), BROWSER: 'none', NEXT_TELEMETRY_DISABLED: '1' };
  let cmd, args;

  if (MODE === 'dev') {
    cmd = isWin ? 'npm.cmd' : 'npm';
    args = ['run', 'dev'];
  } else {
    // Run the Next.js standalone server using Electron's bundled Node.
    env.ELECTRON_RUN_AS_NODE = '1';
    env.HOSTNAME = '127.0.0.1';
    cmd = process.execPath;
    args = [path.join(APP_DIR, 'server.js')];
  }

  serverProc = spawn(cmd, args, { cwd: APP_DIR, env, stdio: 'inherit', shell: false });
  serverProc.on('exit', (code) => console.log(`[testpilot] server exited (${code})`));
  serverProc.on('error', (e) => console.error('[testpilot] failed to start server:', e));
}

function stopServer() {
  if (!serverProc || serverProc.killed) return;
  try {
    if (process.platform === 'win32') spawn('taskkill', ['/pid', String(serverProc.pid), '/f', '/t']);
    else serverProc.kill('SIGTERM');
  } catch { /* best effort */ }
}

// ── Window ────────────────────────────────────────────────────────────────────
function createWindow() {
  win = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 960,
    minHeight: 620,
    backgroundColor: '#0b0a0f',
    title: 'TestPilot',
    icon: path.join(__dirname, '..', 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.loadURL(splashHtml());
  // open target=_blank / external links in the real browser, not a new app window
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(APP_URL)) return { action: 'allow' };
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

async function boot() {
  if (!fs.existsSync(path.join(APP_DIR, MODE === 'prod' ? 'server.js' : 'package.json'))) {
    win.loadURL(errorHtml(APP_DIR));
    return;
  }
  startServer();
  try {
    await waitForPort(PORT);
    win.loadURL(APP_URL);
  } catch (e) {
    win.loadURL(errorHtml(APP_DIR, String(e && e.message || e)));
  }
}

// ── App lifecycle ─────────────────────────────────────────────────────────────
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });

  app.whenReady().then(() => {
    Menu.setApplicationMenu(buildMenu());
    createWindow();
    boot();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) { createWindow(); boot(); }
    });
  });

  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
  app.on('before-quit', stopServer);
  process.on('exit', stopServer);
}

function buildMenu() {
  const isMac = process.platform === 'darwin';
  const template = [
    ...(isMac ? [{ role: 'appMenu' }] : []),
    { role: 'fileMenu' },
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [
        { role: 'reload' }, { role: 'forceReload' }, { type: 'separator' },
        { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { type: 'separator' },
        { role: 'togglefullscreen' }, { role: 'toggleDevTools' },
      ],
    },
    { role: 'windowMenu' },
  ];
  return Menu.buildFromTemplate(template);
}
