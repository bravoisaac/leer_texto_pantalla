const { contextBridge, ipcRenderer } = require('electron');

function sendLog(level, message, meta) {
  try {
    ipcRenderer.send('app:log', {
      level,
      source: `renderer:${location?.pathname || 'unknown'}`,
      message,
      meta,
    });
  } catch {
    // ignore logging failures
  }
}

window.addEventListener('error', (e) => {
  sendLog('error', e?.message || 'window.error', {
    filename: e?.filename,
    lineno: e?.lineno,
    colno: e?.colno,
    stack: e?.error?.stack,
  });
});

window.addEventListener('unhandledrejection', (e) => {
  const reason = e?.reason;
  sendLog('error', 'unhandledrejection', {
    reason: reason?.message || String(reason),
    stack: reason?.stack,
  });
});

async function captureSelectedRegionPng() {
  const selection = await ipcRenderer.invoke('selection:get');
  if (!selection) return { ok: false, error: 'No hay un área seleccionada todavía.' };
  if (selection.width < 5 || selection.height < 5) return { ok: false, error: 'El área seleccionada es muy pequeña.' };
  const png = await ipcRenderer.invoke('capture:regionPng', selection);
  if (!png) return { ok: false, error: 'No se pudo capturar la pantalla.' };
  return { ok: true, png };
}

contextBridge.exposeInMainWorld('leertexto', {
  openSelection: () => ipcRenderer.invoke('selection:open'),
  recognize: async () => {
    try {
      const cap = await captureSelectedRegionPng();
      if (!cap.ok) return cap;
      return await ipcRenderer.invoke('ocr:recognizeImage', cap.png);
    } catch (err) {
      sendLog('error', 'recognize() failed', { stack: err?.stack || String(err) });
      return { ok: false, error: 'Error inesperado. Revisa la consola.' };
    }
  },
  setLanguage: (lang) => ipcRenderer.invoke('ocr:setLanguage', lang),
  onSelectionUpdated: (cb) => ipcRenderer.on('selection-updated', (_e, sel) => cb(sel)),
  onOcrProgress: (cb) => ipcRenderer.on('ocr-progress', (_e, msg) => cb(msg)),
  onHotkeyRead: (cb) => ipcRenderer.on('hotkey:read', () => cb()),
  cancelSelection: () => ipcRenderer.send('selection:cancel'),
  finishSelection: (selection) => ipcRenderer.send('selection:done', selection),
  debugLog: (message, meta) => sendLog('info', String(message || ''), meta),
});
