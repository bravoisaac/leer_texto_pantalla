const statusText = document.getElementById('statusText');
const areaText = document.getElementById('areaText');
const textArea = document.getElementById('text');

const btnSelect = document.getElementById('btnSelect');
const btnRead = document.getElementById('btnRead');
const btnContinuous = document.getElementById('btnContinuous');
const btnStop = document.getElementById('btnStop');
const btnRefreshVoices = document.getElementById('btnRefreshVoices');
const btnVoiceSettings = document.getElementById('btnVoiceSettings');
const autoSpeak = document.getElementById('autoSpeak');
const lang = document.getElementById('lang');

const rate = document.getElementById('rate');
const rateVal = document.getElementById('rateVal');
const volume = document.getElementById('volume');
const volumeVal = document.getElementById('volumeVal');
const voiceSelect = document.getElementById('voice');
const voiceCount = document.getElementById('voiceCount');

const pollMs = document.getElementById('pollMs');
const pollMsVal = document.getElementById('pollMsVal');
const stableReads = document.getElementById('stableReads');
const stableReadsVal = document.getElementById('stableReadsVal');
const cancelOnChange = document.getElementById('cancelOnChange');

let continuousOn = false;
let continuousTimer = null;
let continuousInFlight = false;
let lastSeenNorm = '';
let stableCount = 0;
let lastSpokenNorm = '';

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
  const choice = getVoiceChoice();
  if (choice && !choice.startsWith('preset:')) {
    const match = voices.find((v) => v.voiceURI === choice);
    if (match) return match;
  }
  const es = voices.find((v) => (v.lang || '').toLowerCase().startsWith('es'));
  return es || voices[0] || null;
}

function getVoiceChoice() {
  const choice = localStorage.getItem('leertexto_voice_choice');
  if (choice) return choice;
  const legacy = localStorage.getItem('leertexto_voice_uri');
  if (legacy) {
    localStorage.setItem('leertexto_voice_choice', legacy);
    return legacy;
  }
  return 'preset:auto';
}

function findDefaultVoice(voices) {
  return voices.find((v) => v.default) || null;
}

function includesAny(haystack, needles) {
  const h = String(haystack || '').toLowerCase();
  return needles.some((n) => h.includes(n));
}

function findByLang(voices, prefix) {
  const p = String(prefix || '').toLowerCase();
  return voices.find((v) => String(v.lang || '').toLowerCase().startsWith(p)) || null;
}

function findByLangAndNameHints(voices, prefix, hints) {
  const p = String(prefix || '').toLowerCase();
  return (
    voices.find((v) => String(v.lang || '').toLowerCase().startsWith(p) && includesAny(v.name, hints)) ||
    voices.find((v) => String(v.lang || '').toLowerCase().startsWith(p) && includesAny(v.voiceURI, hints)) ||
    null
  );
}

function chooseVoiceForPreset(preset, voices) {
  switch (preset) {
    case 'preset:auto':
      return pickVoice();
    case 'preset:default':
      return findDefaultVoice(voices) || pickVoice();
    case 'preset:es':
      return findByLang(voices, 'es') || pickVoice();
    case 'preset:es_female': {
      const femaleHints = [
        'female',
        'femenina',
        'woman',
        'helena',
        'sabina',
        'laura',
        'paulina',
        'sofia',
        'lucia',
        'camila',
        'isabella',
        'zira',
        'eva',
      ];
      return findByLangAndNameHints(voices, 'es', femaleHints) || findByLang(voices, 'es') || pickVoice();
    }
    case 'preset:es_male': {
      const maleHints = ['male', 'masculina', 'man', 'pablo', 'raul', 'jorge', 'carlos', 'gabriel', 'diego', 'david'];
      return findByLangAndNameHints(voices, 'es', maleHints) || findByLang(voices, 'es') || pickVoice();
    }
    case 'preset:en':
      return findByLang(voices, 'en') || pickVoice();
    case 'preset:ja':
      return findByLang(voices, 'ja') || pickVoice();
    default:
      return pickVoice();
  }
}

function loadVoices() {
  const voices = speechSynthesis.getVoices();
  const picked = getVoiceChoice();

  voiceSelect.innerHTML = '';
  const presets = [
    { value: 'preset:auto', label: 'Auto (mejor disponible)' },
    { value: 'preset:default', label: 'Windows predeterminada' },
    { value: 'preset:es', label: 'Español (auto)' },
    { value: 'preset:es_female', label: 'Español (femenina)' },
    { value: 'preset:es_male', label: 'Español (masculina)' },
    { value: 'preset:en', label: 'Inglés (auto)' },
    { value: 'preset:ja', label: 'Japonés (auto)' },
  ];

  for (const p of presets) {
    const opt = document.createElement('option');
    opt.value = p.value;
    opt.textContent = p.label;
    voiceSelect.appendChild(opt);
  }

  const sep = document.createElement('option');
  sep.disabled = true;
  sep.value = '__sep__';
  sep.textContent = '— Voces instaladas —';
  voiceSelect.appendChild(sep);

  for (const v of voices) {
    const opt = document.createElement('option');
    opt.value = v.voiceURI;
    opt.textContent = `${v.name} — ${v.lang || '??'}`;
    voiceSelect.appendChild(opt);
  }

  if (picked) voiceSelect.value = picked;
  if (!voiceSelect.value) voiceSelect.value = 'preset:auto';
  if (voiceCount) voiceCount.textContent = `Voces instaladas: ${voices.length} (+7 presets)`;
}

function speak(text) {
  const clean = sanitizeForSpeech(text);
  if (!clean) return;
  if (cancelOnChange.checked) speechSynthesis.cancel();

  const utter = new SpeechSynthesisUtterance(clean);
  utter.rate = Math.max(0.1, Math.min(10, Number(rate.value)));
  utter.volume = Math.max(0, Math.min(1, Number(volume.value)));

  const choice = voiceSelect?.value || 'preset:auto';
  const voices = speechSynthesis.getVoices();
  const voice = choice.startsWith('preset:') ? chooseVoiceForPreset(choice, voices) : voices.find((v) => v.voiceURI === choice) || pickVoice();
  if (voice) utter.voice = voice;
  if (voice?.lang) utter.lang = voice.lang;
  speechSynthesis.speak(utter);
}

function sanitizeForSpeech(text) {
  // Keep letters (incl. ñ/á/é/...), numbers and whitespace; remove symbols/punctuation from OCR noise.
  // Example removed: - . " ! % $ & / ( )
  return String(text || '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeForCompare(text) {
  return sanitizeForSpeech(String(text || '').replace(/\r/g, ''));
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

async function continuousTick() {
  if (!continuousOn || continuousInFlight) return;
  continuousInFlight = true;
  try {
    const res = await window.leertexto.recognize();
    if (!res?.ok) {
      setStatus(res?.error || 'Error');
      return;
    }

    const norm = normalizeForCompare(res.text);
    if (!norm || norm.length < 2) {
      setStatus('Continuo: sin texto');
      return;
    }

    if (norm === lastSeenNorm) stableCount += 1;
    else {
      lastSeenNorm = norm;
      stableCount = 1;
    }

    // Anti-ruido: exige ver el mismo texto 2 veces seguidas.
    const need = Math.max(1, Number(stableReads.value) || 1);
    if (stableCount < need) {
      setStatus('Continuo: detectando…');
      return;
    }

    if (norm === lastSpokenNorm) {
      setStatus('Continuo: esperando cambio');
      return;
    }

    lastSpokenNorm = norm;
    textArea.value = res.text || '';
    setStatus('Continuo: nuevo texto');
    if (autoSpeak.checked && res.text) speak(res.text);
  } finally {
    continuousInFlight = false;
  }
}

function updateContinuousButton() {
  btnContinuous.textContent = `Continuo: ${continuousOn ? 'ON' : 'OFF'}`;
  btnContinuous.classList.toggle('primary', continuousOn);
}

function startContinuous() {
  continuousOn = true;
  lastSeenNorm = '';
  lastSpokenNorm = '';
  stableCount = 0;
  updateContinuousButton();
  setStatus('Continuo: ON');

  const ms = Math.max(100, Number(pollMs.value));
  if (continuousTimer) clearInterval(continuousTimer);
  continuousTimer = setInterval(continuousTick, ms);
  continuousTick();
}

function stopContinuous() {
  continuousOn = false;
  updateContinuousButton();
  setStatus('Continuo: OFF');
  if (continuousTimer) clearInterval(continuousTimer);
  continuousTimer = null;
}

btnContinuous.addEventListener('click', () => {
  if (continuousOn) stopContinuous();
  else startContinuous();
});

btnStop.addEventListener('click', () => speechSynthesis.cancel());

lang.addEventListener('change', async () => {
  await window.leertexto.setLanguage(lang.value);
  setStatus(`Idioma OCR: ${lang.value}`);
});

rate.addEventListener('input', () => {
  rateVal.textContent = Number(rate.value).toFixed(2);
  localStorage.setItem('leertexto_rate', String(rate.value));
});

volume.addEventListener('input', () => {
  const v = Math.max(0, Math.min(1, Number(volume.value)));
  volumeVal.textContent = `${Math.round(v * 100)}%`;
  localStorage.setItem('leertexto_volume', String(v));
});

voiceSelect.addEventListener('change', () => {
  localStorage.setItem('leertexto_voice_choice', voiceSelect.value || 'preset:auto');
  setStatus('Voz actualizada');
});

btnRefreshVoices.addEventListener('click', () => loadVoices());
btnVoiceSettings.addEventListener('click', async () => {
  await window.leertexto.openVoiceSettings();
});

pollMs.addEventListener('input', () => {
  pollMsVal.textContent = String(pollMs.value);
  localStorage.setItem('leertexto_poll_ms', String(pollMs.value));
  if (continuousOn) startContinuous();
});

stableReads.addEventListener('input', () => {
  stableReadsVal.textContent = String(stableReads.value);
  if (continuousOn) {
    lastSeenNorm = '';
    lastSpokenNorm = '';
    stableCount = 0;
  }
});

window.leertexto.onSelectionUpdated((sel) => {
  setArea(sel);
  setStatus('Área actualizada');
  if (continuousOn) {
    lastSeenNorm = '';
    lastSpokenNorm = '';
    stableCount = 0;
  }
});

window.leertexto.onHotkeyRead(async () => {
  setStatus('OCR… (la primera vez puede demorar)');
  const res = await window.leertexto.recognize();
  showResult(res);
});

window.leertexto.onHotkeyToggleContinuous(() => {
  if (continuousOn) stopContinuous();
  else startContinuous();
});

window.leertexto.onOcrProgress((msg) => {
  if (!msg || typeof msg.progress !== 'number') return;
  const pct = Math.round(msg.progress * 100);
  setStatus(`${msg.status || 'OCR'}… ${pct}%`);
});

speechSynthesis.onvoiceschanged = () => loadVoices();

const savedRate = Number(localStorage.getItem('leertexto_rate'));
if (!Number.isNaN(savedRate) && savedRate > 0) rate.value = String(savedRate);
rateVal.textContent = Number(rate.value).toFixed(2);

const savedVolume = Number(localStorage.getItem('leertexto_volume'));
if (!Number.isNaN(savedVolume) && savedVolume >= 0) volume.value = String(Math.max(0, Math.min(1, savedVolume)));
volumeVal.textContent = `${Math.round(Number(volume.value) * 100)}%`;

const savedPoll = Number(localStorage.getItem('leertexto_poll_ms'));
if (!Number.isNaN(savedPoll) && savedPoll >= 100) pollMs.value = String(savedPoll);
pollMsVal.textContent = String(pollMs.value);
stableReadsVal.textContent = String(stableReads.value);
updateContinuousButton();
loadVoices();
