'use strict';

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODELS_URL = 'https://api.groq.com/openai/v1/models';
const KEY_STORE = 'scuse_groq_key_v1';
const HISTORY_STORE = 'scuse_history_v1';
const MODEL_STORE = 'scuse_groq_model_v1';
const MODEL_LIST_STORE = 'scuse_groq_models_v1';
const MODEL_TTL = 6 * 60 * 60 * 1000;
const MODEL_PRIORITY = [
  'openai/gpt-oss-20b',
  'openai/gpt-oss-120b',
  'llama-3.3-70b-versatile',
  'llama-3.1-8b-instant',
  'qwen/qwen3-32b',
  'qwen/qwen3-8b',
  'qwen/qwen2.5-72b',
];
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
  diagError: document.getElementById('diagError'),
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
  modelWrap: document.getElementById('modelWrap'),
  modelSelect: document.getElementById('modelSelect'),
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

// ---------- Models ----------
const CHAT_EXCLUDE = /whisper|guard|orpheus|prompt/;

function getStoredModel() {
  return localStorage.getItem(MODEL_STORE) || '';
}

function setStoredModel(m) {
  localStorage.setItem(MODEL_STORE, m);
}

function getCachedModels() {
  try {
    const raw = localStorage.getItem(MODEL_LIST_STORE);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Date.now() - parsed.at > MODEL_TTL) return null;
    return parsed.ids;
  } catch {
    return null;
  }
}

async function fetchModels(key, force) {
  if (!force) {
    const cached = getCachedModels();
    if (cached && cached.length) return cached;
  }
  const res = await fetch(GROQ_MODELS_URL, { headers: { Authorization: 'Bearer ' + key } });
  if (!res.ok) throw new Error('Impossibile leggere i modelli.');
  const data = await res.json();
  const ids = (data.data || []).map((m) => m.id).filter((id) => !CHAT_EXCLUDE.test(id));
  localStorage.setItem(MODEL_LIST_STORE, JSON.stringify({ at: Date.now(), ids }));
  return ids;
}

async function ensureModels(key) {
  try {
    return await fetchModels(key, false);
  } catch {
    return [];
  }
}

function pickModel(ids) {
  for (const m of MODEL_PRIORITY) {
    if (ids.includes(m)) return m;
  }
  return ids[0] || '';
}

async function populateModels(key) {
  els.modelWrap.classList.remove('hidden');
  els.modelSelect.innerHTML = '<option value="">Caricamento…</option>';
  els.modelSelect.disabled = true;
  try {
    const ids = await fetchModels(key, false);
    if (!ids.length) throw new Error();
    els.modelSelect.innerHTML = '';
    ids.forEach((id) => {
      const opt = document.createElement('option');
      opt.value = id;
      opt.textContent = id;
      els.modelSelect.appendChild(opt);
    });
    const chosen = getStoredModel() && ids.includes(getStoredModel()) ? getStoredModel() : pickModel(ids);
    els.modelSelect.value = chosen;
    if (chosen) setStoredModel(chosen);
    els.modelSelect.disabled = false;
  } catch {
    els.modelSelect.innerHTML = '<option value="">Modelli non disponibili</option>';
    els.modelSelect.disabled = true;
  }
}

els.settingsBtn.addEventListener('click', openSettings);
els.closeModalBtn.addEventListener('click', closeSettings);
els.settingsModal.addEventListener('click', (e) => {
  if (e.target === els.settingsModal) closeSettings();
});

async function openSettings() {
  setKeyStatus('', '');
  els.apiKeyInput.value = getKey();
  if (getKey()) {
    setKeyStatus('ok', 'Chiave già salvata su questo dispositivo.');
    await populateModels(getKey());
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

els.modelSelect.addEventListener('change', () => {
  if (els.modelSelect.value) setStoredModel(els.modelSelect.value);
});

async function corsProbe() {
  try {
    const r = await fetch(GROQ_MODELS_URL, { method: 'GET' });
    return { ok: true, status: r.status };
  } catch (err) {
    return { ok: false, reason: (err && err.message) || 'Load failed' };
  }
}

async function testConnection(key) {
  const probe = await corsProbe();
  if (!probe.ok) {
    return { ok: false, probe, error: 'Browser→Groq bloccato (CORS/rete). Serve il ponte server.', needsProxy: true };
  }
  const msg = [{ role: 'user', content: 'Rispondi solo con la parola: ok' }];
  let models = [];
  try {
    models = await fetchModels(key, true);
  } catch {}
  const candidates = getCandidates(models).slice(0, 5);
  for (const model of candidates) {
    let out;
    try {
      out = await callGroq(key, model, msg);
    } catch (err) {
      return { ok: false, probe, error: 'rete: ' + err.message, needsProxy: false };
    }
    const { res, detail } = out;
    if (res.ok) return { ok: true, probe, model, error: '' };
    if (res.status === 401 || res.status === 403) return { ok: false, probe, error: detail || 'chiave non valida', needsProxy: false };
  }
  return { ok: false, probe, error: 'nessun modello risponde', needsProxy: false };
}

els.saveKeyBtn.addEventListener('click', async () => {
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
  els.saveKeyBtn.disabled = true;
  setKeyStatus('', 'Test di connessione in corso…');
  populateModels(val);
  const test = await testConnection(val);
  els.saveKeyBtn.disabled = false;
  if (test.ok) {
    setStoredModel(test.model);
    setKeyStatus('ok', 'Connessione riuscita! Modello attivo: ' + test.model);
    showToast('Chiave salvata e connessa');
    setDiag('Connessione riuscita ✓  Modello: ' + test.model, true);
    setTimeout(closeSettings, 1200);
  } else if (test.needsProxy) {
    const msg = 'Il tuo dispositivo non riesce a contattare Groq: la richiesta è bloccata dal browser (CORS) o dalla rete.\n\nDettaglio test: ' + (test.probe.reason || test.error || 'Load failed') + '\n\nIn breve: per far parlare la pagina con Groq serve un piccolo server ponte gratuito. Senza quello, niente browser può usare Groq.';
    setDiag(msg, false);
    setKeyStatus('err', 'Test: ' + (test.probe.reason || test.error));
  } else {
    const msg = 'Errori ricevuti: ' + (test.error || 'sconosciuto') + '.\n\nSe vedi "Access denied / check your network settings" = Groq blocca la tua rete (VPN? Paese? Antivirus?). Se vedi "model not found" = modello non disponibile per il piano. La chiave è salvata; riprova o scrivimi il testo esatto.';
    setKeyStatus('err', msg.split('\n')[0]);
    setDiag(msg, false);
  }
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

async function callGroq(key, model, messages) {
  const res = await fetch(GROQ_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + key,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 1.0,
      max_tokens: 220,
    }),
  });
  let data = null;
  let detail = '';
  try {
    data = await res.json();
    detail = (data && data.error && data.error.message) || '';
  } catch {}
  return { res, data, detail };
}

function getCandidates(models) {
  const list = [];
  const push = (m) => { if (m && !list.includes(m)) list.push(m); };
  push(getStoredModel());
  MODEL_PRIORITY.forEach(push);
  push('groq/compound');
  push('groq/compound-mini');
  push('meta-llama/llama-4-scout-17b-16e-instruct');
  push('meta-llama/llama-4-maverick-17b-128e-instruct');
  push('qwen/qwen3-8b');
  push('llama-3.1-8b-instant');
  push('llama-3.3-70b-versatile');
  models.forEach(push);
  push('openai/gpt-oss-20b');
  push('openai/gpt-oss-120b');
  return list;
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
    const probe = await corsProbe();
    if (!probe.ok) {
      throw new Error('Browser→Groq bloccato (CORS/rete): ' + probe.reason + '. Serve un piccolo "server ponte" gratuito per collegare la pagina a Groq.');
    }
    const messages = await buildPrompt();
    const models = await ensureModels(key);
    const candidates = getCandidates(models).slice(0, 6);
    let lastErr = '';

    for (const model of candidates) {
      if (lastErr) {
        els.genLabel.textContent = 'Provo ' + model.split('/').pop() + '…';
      }

      let okAttempt = false;
      for (let attempt = 0; attempt < 2 && !okAttempt; attempt++) {
        const { res, data, detail } = await callGroq(key, model, messages);

        if (res.status === 401 || res.status === 403) {
          throw new Error('Chiave API non valida (' + (detail || res.status) + '). Controlla le impostazioni.');
        }
        if (res.status === 429) {
          throw new Error('Limite richieste superato. Riprova tra un attimo.');
        }
        if (res.ok) {
          const choice = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
          const excuse = (choice || '').trim();
          if (excuse) {
            if (model) setStoredModel(model);
            showResult(excuse);
            return;
          }
          if (!lastErr) lastErr = 'Risposta vuota da Groq (riprovo)';
        } else {
          lastErr = detail || ('Errore ' + res.status);
          break;
        }
      }
    }

    throw new Error('Nessun modello disponibile. Ultimo errore: ' + lastErr);
  } catch (err) {
    setDiag(err.message || 'Errore durante la generazione.', false);
    showToast(err.message || 'Errore durante la generazione.');
  } finally {
    setLoading(false);
    els.genLabel.textContent = '🎲 Genera scusa';
  }
}

// ---------- Result ----------
function setDiag(msg, ok) {
  els.diagError.textContent = msg;
  els.diagError.classList.remove('hidden', 'diag-ok');
  if (ok) els.diagError.classList.add('diag-ok');
}

function showResult(text) {
  els.resultText.textContent = text;
  els.resultBadge.textContent = lastCred + '% di credibilità';
  els.resultCard.classList.remove('hidden');
  saveHistory(text, lastContext, lastCred, lastTone);
  els.diagError.classList.add('hidden');
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