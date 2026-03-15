const statusText = document.getElementById('statusText');
const areaText = document.getElementById('areaText');
const textArea = document.getElementById('text');

const btnSelect = document.getElementById('btnSelect');
const btnRead = document.getElementById('btnRead');
const btnStop = document.getElementById('btnStop');
const autoSpeak = document.getElementById('autoSpeak');
const lang = document.getElementById('lang');

const rate = document.getElementById('rate');
const rateVal = document.getElementById('rateVal');

function setStatus(text) {
  statusText.textContent = text;
}

function setArea(sel) {
  if (!sel) {
    areaText.textContent = '—';
    return;
  }
  areaText.textContent = `x=${Math.round(sel.x)}, y=${Math.round(sel.y)}, w=${Math.round(sel.width)}, h=${Math.round(sel.height)}`;
}

function pickVoice() {
  const voices = speechSynthesis.getVoices();
  const es = voices.find((v) => (v.lang || '').toLowerCase().startsWith('es'));
  return es || voices[0] || null;
}

function speak(text) {
  if (!text) return;
  speechSynthesis.cancel();

  const utter = new SpeechSynthesisUtterance(text);
  utter.rate = Number(rate.value);
  const voice = pickVoice();
  if (voice) utter.voice = voice;
  speechSynthesis.speak(utter);
}

function showResult(res) {
  if (!res?.ok) {
    setStatus(res?.error || 'Error');
    return;
  }
  textArea.value = res.text || '';
  setStatus(res.text ? 'OK' : 'No se detectó texto');
  if (autoSpeak.checked && res.text) speak(res.text);
}

btnSelect.addEventListener('click', async () => {
  setStatus('Selecciona un rectángulo (arrastrar). ESC cancela.');
  await window.leertexto.openSelection();
});

btnRead.addEventListener('click', async () => {
  setStatus('OCR… (la primera vez puede demorar)');
  const res = await window.leertexto.recognize();
  showResult(res);
});

btnStop.addEventListener('click', () => speechSynthesis.cancel());

lang.addEventListener('change', async () => {
  await window.leertexto.setLanguage(lang.value);
  setStatus(`Idioma OCR: ${lang.value}`);
});

rate.addEventListener('input', () => {
  rateVal.textContent = Number(rate.value).toFixed(2);
});

window.leertexto.onSelectionUpdated((sel) => {
  setArea(sel);
  setStatus('Área actualizada');
});

window.leertexto.onHotkeyRead(async () => {
  setStatus('OCR… (la primera vez puede demorar)');
  const res = await window.leertexto.recognize();
  showResult(res);
});

window.leertexto.onOcrProgress((msg) => {
  if (!msg || typeof msg.progress !== 'number') return;
  const pct = Math.round(msg.progress * 100);
  setStatus(`${msg.status || 'OCR'}… ${pct}%`);
});

speechSynthesis.onvoiceschanged = () => {};

rateVal.textContent = Number(rate.value).toFixed(2);
