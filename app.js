'use strict';

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = 'llama-3.3-70b-versatile';
const KEY_STORE = 'scuse_groq_key_v1';
const HISTORY_STORE = 'scuse_history_v1';
const MAX_HISTORY = 25;

const els = {
  scenarioChips: document.getElementById('scenarioChips'),
  customWrap: document.getElementById('customWrap'),
  customInput: document.getElementById('customInput'),
  credSlider: document.getElementById('credSlider'),
  credValue: document.getElementById('credValue'),
  credHint: document.getElementById('credHint'),
  generateBtn: document.getElementById('generateBtn'),
  genLabel: document.getElementById('genLabel'),
  loading: document.getElementById('loading'),
  resultCard: document.getElementById('resultCard'),
  resultBadge: document.getElementById('resultBadge'),
  resultText: document.getElementById('resultText'),
  copyBtn: document.getElementById('copyBtn'),
  regenBtn: document.getElementById('regenBtn'),
  historySection: document.getElementById('historySection'),
  historyList: document.getElementById('historyList'),
  clearHistory: document.getElementById('clearHistory'),
  settingsBtn: document.getElementById('settingsBtn'),
  settingsModal: document.getElementById('settingsModal'),
  apiKeyInput: document.getElementById('apiKeyInput'),
  saveKeyBtn: document.getElementById('saveKeyBtn'),
  closeModalBtn: document.getElementById('closeModalBtn'),
  keyStatus: document.getElementById('keyStatus'),
  toast: document.getElementById('toast'),
  year: document.getElementById('year'),
};

let selectedScenario = 'Perché sono arrivato tardi?';
let selectedTone = 'credibile';
let lastContext = '';
let lastCred = 50;
let lastTone = 'credibile';

const credHints = [
  [0, 'Ridicola: nemmeno tua nonna ci crederebbe.'],
  [20, 'Quasi assurda: bugia palese ma creativa.'],
  [40, 'Fragile: al limite del credibile.'],
  [60, 'Plausibile: potrebbe quasi funzionare.'],
  [80, 'Convincente: pochi farebbero domande.'],
  [95, 'Fotorealistica: crederesti a tutto.'],
];

const toneMap = {
  credibile: 'stile sobrio, naturale e molto credibile',
  ironica: 'stile ironico e spiritoso, con un pizzico di sarcasmo',
  assurda: 'stile totalmente assurdo, surreale e divertente',
};

// ---------- Chips ----------
document.querySelectorAll('#scenarioChips .chip').forEach((chip) => {
  chip.addEventListener('click', () => {
    document.querySelectorAll('#scenarioChips .chip').forEach((c) => c.classList.remove('active'));
    chip.classList.add('active');
    if (chip.dataset.scenario === 'custom') {
      selectedScenario = 'custom';
      els.customWrap.classList.remove('hidden');
      els.customInput.focus();
    } else {
      selectedScenario = chip.dataset.scenario;
      els.customWrap.classList.add('hidden');
    }
  });
});

document.querySelectorAll('.chip[data-tone]').forEach((chip) => {
  chip.addEventListener('click', () => {
    document.querySelectorAll('.chip[data-tone]').forEach((c) => c.classList.remove('active'));
    chip.classList.add('active');
    selectedTone = chip.dataset.tone;
  });
});

// ---------- Slider ----------
els.credSlider.addEventListener('input', updateSlider);
function updateSlider() {
  const v = Number(els.credSlider.value);
  els.credValue.textContent = v + '%';
  let hint = credHints[credHints.length - 1][1];
  for (const [min, text] of credHints) {
    if (v >= min) hint = text;
  }
  els.credHint.textContent = hint;
}
updateSlider();

// ---------- Key ----------
function getKey() {
  return localStorage.getItem(KEY_STORE) || '';
}

els.settingsBtn.addEventListener('click', openSettings);
els.closeModalBtn.addEventListener('click', closeSettings);
els.settingsModal.addEventListener('click', (e) => {
  if (e.target === els.settingsModal) closeSettings();
});

function openSettings() {
  setKeyStatus('', '');
  els.apiKeyInput.value = getKey();
  if (getKey()) {
    setKeyStatus('ok', 'Chiave già salvata su questo dispositivo.');
  }
  els.settingsModal.classList.remove('hidden');
  els.apiKeyInput.focus();
}

function closeSettings() {
  els.settingsModal.classList.add('hidden');
}

function setKeyStatus(cls, msg) {
  els.keyStatus.className = 'key-status ' + (cls || '');
  els.keyStatus.textContent = msg;
}

els.saveKeyBtn.addEventListener('click', () => {
  const val = els.apiKeyInput.value.trim();
  if (!val) {
    setKeyStatus('err', 'Inserisci una chiave API valida.');
    return;
  }
  if (!val.startsWith('gsk_') && !val.startsWith('gsk-')) {
    setKeyStatus('err', 'La chiave Groq inizia di solito con "gsk_". Controlla.');
    return;
  }
  localStorage.setItem(KEY_STORE, val);
  setKeyStatus('ok', 'Chiave salvata. Ora puoi generare scuse!');
  showToast('Chiave salvata su questo dispositivo');
  setTimeout(closeSettings, 900);
});

// ---------- Generation ----------
async function buildPrompt() {
  let context = selectedScenario;
  if (selectedScenario === 'custom') {
    context = els.customInput.value.trim() || 'situazione generica';
  }
  lastContext = context;
  lastCred = Number(els.credSlider.value);
  lastTone = selectedTone;

  let credDesc;
  if (lastCred >= 90) credDesc = 'estremamente credibile, quasi vera, nessuno sospetterebbe';
  else if (lastCred >= 60) credDesc = 'credibile, plausibile senza esagerazioni';
  else if (lastCred >= 35) credDesc = 'poco credibile, al limite, la gente storcerebbe il naso ma sorriderebbe';
  else credDesc = 'totalmente assurda, ridicola e ovviamente falsa, ma esilarante';

  return [
    { role: 'system', content: 'Sei un maestro nel trovare scuse originali. Rispondi SOLO con il testo della scusa in italiano, al massimo 2-3 frasi, senza introduzioni, senza virgolette, senza spiegazioni.' },
    { role: 'user', content: `Contesto: "${context}".\nCredibilità desiderata: ${lastCred}% (${credDesc}).\nStile: ${toneMap[lastTone]}.\nGenera la scusa perfetta.` },
  ];
}

async function generate() {
  const key = getKey();
  if (!key) {
    openSettings();
    setKeyStatus('err', 'Prima inserisci la tua chiave API Groq (una sola volta).');
    return;
  }

  setLoading(true);
  els.genLabel.textContent = 'Genero…';
  try {
    const messages = await buildPrompt();
    const res = await fetch(GROQ_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + key,
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages,
        temperature: 1.0,
        max_tokens: 220,
      }),
    });

    if (res.status === 401 || res.status === 403) {
      throw new Error('Chiave API non valida. Controlla le impostazioni.');
    }
    if (res.status === 429) {
      throw new Error('Troppe richieste per ora. Riprova tra un attimo.');
    }
    if (!res.ok) {
      throw new Error('Errore del servizio (' + res.status + '). Riprova.');
    }

    const data = await res.json();
    const excuse = data.choices[0].message.content.trim();
    showResult(excuse);
  } catch (err) {
    showToast(err.message || 'Errore durante la generazione.');
  } finally {
    setLoading(false);
    els.genLabel.textContent = '🎲 Genera scusa';
  }
}

// ---------- Result ----------
function showResult(text) {
  els.resultText.textContent = text;
  els.resultBadge.textContent = lastCred + '% di credibilità';
  els.resultCard.classList.remove('hidden');
  saveHistory(text, lastContext, lastCred, lastTone);
  els.resultText.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

els.generateBtn.addEventListener('click', generate);
els.regenBtn.addEventListener('click', generate);
els.copyBtn.addEventListener('click', async () => {
  const text = els.resultText.textContent;
  try {
    await navigator.clipboard.writeText(text);
    showToast('Scusa copiata!');
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
    showToast('Scusa copiata!');
  }
});

// ---------- Loading ----------
function setLoading(active) {
  els.loading.classList.toggle('hidden', !active);
  els.generateBtn.disabled = active;
}

// ---------- History ----------
function getHistory() {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_STORE)) || [];
  } catch {
    return [];
  }
}

function saveHistory(text, context, cred, tone) {
  const list = getHistory();
  list.unshift({ text, context, cred, tone, at: Date.now() });
  if (list.length > MAX_HISTORY) list.length = MAX_HISTORY;
  localStorage.setItem(HISTORY_STORE, JSON.stringify(list));
  renderHistory();
}

function renderHistory() {
  const list = getHistory();
  els.historySection.classList.toggle('hidden', list.length === 0);
  els.historyList.innerHTML = '';
  list.forEach((item) => {
    const li = document.createElement('li');
    li.textContent = item.text;
    const meta = document.createElement('span');
    meta.className = 'h-meta';
    const toneLabel = { credibile: 'Credibile', ironica: 'Ironica', assurda: 'Assurda' }[item.tone] || '';
    meta.textContent = contextLabel(item.context) + ' · ' + item.cred + '% · ' + toneLabel + ' · ' + new Date(item.at).toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' });
    li.appendChild(meta);
    els.historyList.appendChild(li);
  });
}

function contextLabel(ctx) {
  if (ctx === 'Perché sono arrivato tardi?') return 'Ritardo';
  if (ctx === 'Perché non posso uscire?') return 'Uscita';
  return 'Custom';
}

els.clearHistory.addEventListener('click', () => {
  localStorage.removeItem(HISTORY_STORE);
  renderHistory();
  showToast('Cronologia svuotata');
});

// ---------- Toast ----------
let toastTimer = null;
function showToast(msg) {
  els.toast.textContent = msg;
  els.toast.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => els.toast.classList.add('hidden'), 2600);
}

// ---------- Init ----------
els.year.textContent = new Date().getFullYear();
renderHistory();

if (!getKey()) {
  setTimeout(openSettings, 400);
}