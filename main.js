const { app, BrowserWindow, globalShortcut, ipcMain, nativeImage, screen } = require('electron');
const path = require('path');
const screenshot = require('screenshot-desktop');
const { createWorker } = require('tesseract.js');

let mainWindow = null;
let selectionWindow = null;
let lastSelection = null; // { x, y, width, height } in screen DIP coords

let ocrWorker = null;
let ocrLanguage = 'spa';
let ocrWorkerLang = null;

function ts() {
  return new Date().toISOString();
}

function log(level, message, extra) {
  const line = `[${ts()}] [${level.toUpperCase()}] ${message}`;
  if (extra !== undefined) {
    // eslint-disable-next-line no-console
    (console[level] || console.log)(line, extra);
  } else {
    // eslint-disable-next-line no-console
    (console[level] || console.log)(line);
  }
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 520,
    height: 620,
    resizable: true,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.webContents.on('render-process-gone', (_e, details) => {
    log('error', `Main window render-process-gone: ${details?.reason || 'unknown'}`, details);
  });
}

function getVirtualBounds() {
  const displays = screen.getAllDisplays();
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;

  for (const display of displays) {
    left = Math.min(left, display.bounds.x);
    top = Math.min(top, display.bounds.y);
    right = Math.max(right, display.bounds.x + display.bounds.width);
    bottom = Math.max(bottom, display.bounds.y + display.bounds.height);
  }

  return { x: left, y: top, width: right - left, height: bottom - top };
}

function openSelectionWindow() {
  if (selectionWindow) return;

  const bounds = getVirtualBounds();
  log('info', `Open selection window: x=${bounds.x} y=${bounds.y} w=${bounds.width} h=${bounds.height}`);
  selectionWindow = new BrowserWindow({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    transparent: true,
    frame: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    hasShadow: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    focusable: true,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  selectionWindow.loadFile(path.join(__dirname, 'renderer', 'selection.html'));
  selectionWindow.once('ready-to-show', () => {
    if (!selectionWindow) return;
    selectionWindow.show();
    selectionWindow.focus();
  });
  selectionWindow.on('closed', () => {
    selectionWindow = null;
  });

  selectionWindow.webContents.on('render-process-gone', (_e, details) => {
    log('error', `Selection window render-process-gone: ${details?.reason || 'unknown'}`, details);
  });
}

function readPngSize(buf) {
  try {
    const b = Buffer.isBuffer(buf) ? buf : Buffer.from(buf || []);
    if (b.length < 24) return null;
    // PNG signature
    if (
      b[0] !== 0x89 ||
      b[1] !== 0x50 ||
      b[2] !== 0x4e ||
      b[3] !== 0x47 ||
      b[4] !== 0x0d ||
      b[5] !== 0x0a ||
      b[6] !== 0x1a ||
      b[7] !== 0x0a
    ) {
      return null;
    }
    // IHDR width/height at bytes 16..23 big-endian
    const width = b.readUInt32BE(16);
    const height = b.readUInt32BE(20);
    return { width, height };
  } catch {
    return null;
  }
}

const screenshotDisplayCache = new Map(); // electronDisplayId -> screenshotDisplayId

async function resolveScreenshotDisplayIdForElectronDisplay(display) {
  const cached = screenshotDisplayCache.get(display.id);
  if (cached) return cached;

  const expected = {
    width: Math.max(1, Math.round(display.bounds.width * (display.scaleFactor || 1))),
    height: Math.max(1, Math.round(display.bounds.height * (display.scaleFactor || 1))),
    left: Math.round(display.bounds.x * (display.scaleFactor || 1)),
    top: Math.round(display.bounds.y * (display.scaleFactor || 1)),
  };

  const displays = await screenshot.listDisplays();
  log('info', 'screenshot.listDisplays()', displays);

  // Fast path: many platforms return geometry in listDisplays().
  const exact = displays.find(
    (d) =>
      typeof d?.width === 'number' &&
      typeof d?.height === 'number' &&
      d.width === expected.width &&
      d.height === expected.height &&
      (typeof d?.left !== 'number' || d.left === expected.left) &&
      (typeof d?.top !== 'number' || d.top === expected.top),
  );
  if (exact?.id) {
    screenshotDisplayCache.set(display.id, exact.id);
    log('info', `Resolved screenshot display (fast): electronId=${display.id} -> screen=${exact.id}`, { expected, name: exact.name });
    return exact.id;
  }

  const dimMatch = displays.find(
    (d) => typeof d?.width === 'number' && typeof d?.height === 'number' && d.width === expected.width && d.height === expected.height,
  );
  if (dimMatch?.id) {
    screenshotDisplayCache.set(display.id, dimMatch.id);
    log('info', `Resolved screenshot display (dims): electronId=${display.id} -> screen=${dimMatch.id}`, {
      expected,
      name: dimMatch.name,
      left: dimMatch.left,
      top: dimMatch.top,
    });
    return dimMatch.id;
  }

  for (const d of displays) {
    try {
      const img = await screenshot({ format: 'png', screen: d.id });
      const size = readPngSize(img);
      if (size && size.width === expected.width && size.height === expected.height) {
        screenshotDisplayCache.set(display.id, d.id);
        log('info', `Resolved screenshot display: electronId=${display.id} -> screen=${d.id}`, { expected, size, name: d.name });
        return d.id;
      }
    } catch (err) {
      log('warn', `Failed to probe screenshot display ${d?.id}`, err?.message || err);
    }
  }

  const fallback = displays?.[0]?.id ?? null;
  screenshotDisplayCache.set(display.id, fallback);
  log('warn', `Using fallback screenshot display for electronId=${display.id}`, { fallback, expected });
  return fallback;
}

async function ensureOcrWorker() {
  const userData = app.getPath('userData');

  if (!ocrWorker) {
    log('info', `OCR: createWorker lang=${ocrLanguage}`);
    try {
      // Important: in Node/Electron main we must NOT point to the browser worker script.
      // Let tesseract.js use its Node worker-thread implementation.
      ocrWorker = await createWorker(ocrLanguage, 1, {
        logger: (m) => mainWindow && mainWindow.webContents.send('ocr-progress', m),
        cachePath: path.join(userData, 'tesseract-cache'),
      });
      ocrWorkerLang = ocrLanguage;
      return;
    } catch (err) {
      ocrWorker = null;
      ocrWorkerLang = null;
      throw err;
    }
  }

  if (ocrWorkerLang !== ocrLanguage) {
    log('info', `OCR: reinitialize lang=${ocrLanguage}`);
    try {
      await ocrWorker.reinitialize(ocrLanguage, 1);
      ocrWorkerLang = ocrLanguage;
    } catch (err) {
      try {
        await ocrWorker.terminate();
      } catch {
        // ignore
      }
      ocrWorker = null;
      ocrWorkerLang = null;
      throw err;
    }
  }
}

function registerShortcuts() {
  globalShortcut.unregisterAll();
  globalShortcut.register('CommandOrControl+Shift+S', () => openSelectionWindow());
  globalShortcut.register('CommandOrControl+Shift+L', () => {
    if (mainWindow) mainWindow.webContents.send('hotkey:read');
  });
}

app.on('ready', () => {
  log('info', 'App ready');
  createMainWindow();
  registerShortcuts();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
});

app.on('will-quit', async () => {
  log('info', 'App will-quit');
  globalShortcut.unregisterAll();
  if (ocrWorker) {
    try {
      await ocrWorker.terminate();
    } catch {
      // ignore
    }
  }
});

process.on('uncaughtException', (err) => {
  log('error', 'uncaughtException', err?.stack || err);
});

process.on('unhandledRejection', (reason) => {
  log('error', 'unhandledRejection', reason?.stack || reason);
});

ipcMain.on('app:log', (_evt, payload) => {
  const level = payload?.level === 'warn' || payload?.level === 'error' || payload?.level === 'info' ? payload.level : 'info';
  const source = payload?.source ? String(payload.source) : 'renderer';
  const message = payload?.message ? String(payload.message) : '(no message)';
  const meta = payload?.meta;
  log(level, `${source}: ${message}`, meta);
});

ipcMain.handle('selection:open', async () => {
  openSelectionWindow();
  return { ok: true };
});

ipcMain.handle('selection:get', async () => lastSelection);

ipcMain.handle('capture:regionPng', async (_evt, selection) => {
  try {
    if (!selection || typeof selection.x !== 'number') return null;
    const display = screen.getDisplayMatching(selection);
    const scaleFactor = display.scaleFactor || 1;

    const screenshotScreenId = await resolveScreenshotDisplayIdForElectronDisplay(display);
    if (!screenshotScreenId) return null;

    const fullPng = await screenshot({ format: 'png', screen: screenshotScreenId });
    const fullImg = nativeImage.createFromBuffer(fullPng);

    const crop = {
      x: Math.max(0, Math.round((selection.x - display.bounds.x) * scaleFactor)),
      y: Math.max(0, Math.round((selection.y - display.bounds.y) * scaleFactor)),
      width: Math.max(1, Math.round(selection.width * scaleFactor)),
      height: Math.max(1, Math.round(selection.height * scaleFactor)),
    };

    const size = fullImg.getSize();
    if (crop.x + crop.width > size.width || crop.y + crop.height > size.height) {
      log('warn', 'Crop out of bounds, clamping', { crop, size });
      crop.width = Math.max(1, Math.min(crop.width, size.width - crop.x));
      crop.height = Math.max(1, Math.min(crop.height, size.height - crop.y));
    }

    const cropped = fullImg.crop(crop);
    return cropped.toPNG();
  } catch (err) {
    log('error', 'capture:regionPng failed', err?.stack || err);
    return null;
  }
});

ipcMain.handle('ocr:recognizeImage', async (_evt, imagePng) => {
  try {
    const buf = Buffer.isBuffer(imagePng) ? imagePng : Buffer.from(imagePng || []);
    if (!buf.length) return { ok: false, error: 'Imagen vacía.' };

    await ensureOcrWorker();
    const result = await ocrWorker.recognize(buf);
    const text = (result?.data?.text || '').replace(/\r/g, '').replace(/[ \t]+\n/g, '\n').trim();
    return { ok: true, text };
  } catch (err) {
    log('error', 'OCR failed', err?.stack || err);
    return { ok: false, error: 'OCR falló. Revisa la consola para ver el error.' };
  }
});

ipcMain.handle('ocr:setLanguage', async (_evt, lang) => {
  const next = typeof lang === 'string' ? lang.trim() : '';
  if (!next) return { ok: false, error: 'Idioma inválido.' };
  if (ocrLanguage === next) return { ok: true };

  ocrLanguage = next;
  return { ok: true };
});

ipcMain.on('selection:cancel', () => {
  log('info', 'Selection cancelled');
  if (selectionWindow) selectionWindow.close();
});

ipcMain.on('selection:done', (_evt, selection) => {
  if (selection && typeof selection.x === 'number') {
    lastSelection = selection;
    log('info', 'Selection done', lastSelection);
    // If display layout changed, invalidate cache mapping.
    screenshotDisplayCache.delete(screen.getDisplayMatching(lastSelection).id);
    if (mainWindow) mainWindow.webContents.send('selection-updated', lastSelection);
  }
  if (selectionWindow) selectionWindow.close();
});
