import { app, BrowserWindow, dialog, Menu, protocol, session, screen } from 'electron';
import { resolve, isAbsolute } from 'node:path';
import { appendFileSync, mkdirSync } from 'node:fs';
import { createApp } from '../../api/src/app.js';
import { APPLICATION_URL, createProtocolHandler, isApplicationUrl } from './protocol.js';

// This name also fixes a stable per-user data location across installer upgrades.
app.setName('CareLink Doctor');
const isTest = process.env.CARELINK_TEST_MODE === '1';
const testData = process.env.CARELINK_USER_DATA;
if (isTest && testData && isAbsolute(testData)) app.setPath('userData', testData);
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'carelink',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      codeCache: true,
    },
  },
]);

let window: BrowserWindow | null = null;
let services: Awaited<ReturnType<typeof createApp>> | undefined;
let closing = false;
let mayQuit = false;

function showStartupError(error: unknown) {
  const dataRoot = app.getPath('userData');
  mkdirSync(dataRoot, { recursive: true });
  appendFileSync(
    resolve(dataRoot, 'startup-error.log'),
    `${new Date().toISOString()} ${String(error)}\n`,
  );
  if (!isTest)
    dialog.showErrorBox(
      'CareLink Doctor',
      'CareLink could not start. Restart the application or check startup-error.log in the application data folder.\n\nCareLink 启动失败。请重启应用，或查看应用数据目录中的 startup-error.log。',
    );
  console.error(error);
}

async function openWindow() {
  const workArea = screen.getPrimaryDisplay().workAreaSize;
  window = new BrowserWindow({
    width: Math.min(1440, workArea.width),
    height: Math.min(960, workArea.height),
    minWidth: Math.min(1024, workArea.width),
    minHeight: Math.min(680, workArea.height),
    title: 'CareLink Doctor',
    backgroundColor: '#f6f9fc',
    icon: resolve(__dirname, '../assets/icon.ico'),
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
      devTools: !app.isPackaged || isTest,
      spellcheck: false,
    },
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event, url) => {
    if (!isApplicationUrl(url)) event.preventDefault();
  });
  window.webContents.on('will-redirect', (event, url) => {
    if (!isApplicationUrl(url)) event.preventDefault();
  });
  window.webContents.on('will-attach-webview', (event) => event.preventDefault());
  window.on('closed', () => {
    window = null;
  });
  window.once('ready-to-show', () => {
    if (!isTest) window?.show();
  });
  await window.loadURL(APPLICATION_URL);
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (window?.isMinimized()) window.restore();
    window?.focus();
  });
  app.on('window-all-closed', () => app.quit());
  app.on('before-quit', (event) => {
    if (mayQuit || !services) return;
    event.preventDefault();
    if (closing) return;
    closing = true;
    void services
      .close()
      .catch((error: unknown) => console.error(error))
      .finally(() => {
        mayQuit = true;
        app.quit();
      });
  });
  void app
    .whenReady()
    .then(async () => {
      Menu.setApplicationMenu(null);
      session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) =>
        callback(false),
      );
      session.defaultSession.setPermissionCheckHandler(() => false);
      session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
        callback({
          cancel: !isApplicationUrl(details.url) && !details.url.startsWith('devtools:'),
        });
      });
      services = await createApp({
        databasePath: resolve(app.getPath('userData'), 'data/doctor.sqlite'),
        runtime: 'desktop-demo',
        logger: false,
      });
      protocol.handle('carelink', createProtocolHandler(services, resolve(__dirname, 'renderer')));
      await openWindow();
    })
    .catch((error: unknown) => {
      showStartupError(error);
      app.quit();
    });
}
