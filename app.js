'use strict';

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODELS_URL = 'https://api.groq.com/openai/v1/models';
const KEY_STORE = 'scuse_groq_key_v1';
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

const els = {
  scenarioChips: document.getElementById('scenarioChips'),
  customWrap: document.getElementById('customWrap'),
  customInput: document.getElementById('customInput'),
  credSlider: document.getElementById('credSlider'),
  credValue: document.getElementById('credValue'),
  credHint: document.getElementById('credHint'),
  lenSlider: document.getElementById('lenSlider'),
  lenValue: document.getElementById('lenValue'),
  lenHint: document.getElementById('lenHint'),
  generateBtn: document.getElementById('generateBtn'),
  genLabel: document.getElementById('genLabel'),
  loading: document.getElementById('loading'),
  diagError: document.getElementById('diagError'),
  resultCard: document.getElementById('resultCard'),
  resultBadge: document.getElementById('resultBadge'),
  resultText: document.getElementById('resultText'),
  copyBtn: document.getElementById('copyBtn'),
  regenBtn: document.getElementById('regenBtn'),
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
let lastContext = '';
let lastCred = 50;
let lastLen = 1;
let variantCount = 0;
let useOffline = false;

const OFFLINE_EXCUSES = {
  'Perché sono arrivato tardy?': [
    'Il meteo non era previsto così.',
    'Il mio allarme era in modalità silenzioso.',
    'Ho aiutato un vecchio a attraversare la strada.',
    'La mia auto ha deciso di fare il rebelde.',
    'Il trasporto pubblico ha scelto quel momento per fare strike.',
    'Ho avuto un imprevisto familiare urgente.',
    'Il mio orologio si era fermato.',
    'La strada era bloccata da un evento sportivo.',
  ],
  'Perché non posso uscire?': [
    'Ho una consegna importante da completare.',
    'Il mio giardino ha bisogno di acqua adesso.',
    'Sto aspettando un pacco che deve arrivare.',
    'Mio fratello ha bisogno di me per una cosa.',
    'Il mio computer sta scaricando qualcosa di importante.',
    'Ho dimenticato di pagare una bolletta.',
    'Devo controllare il forno.',
  ],
  custom: [
    'Ho un impegnooo urgente.',
    'Qualcuno ha bisogno di me in questo momento.',
    'Sto gestendo una situazione che non può aspettare.',
    'Ho un problema tecnico da risolvere.',
    'La mia agenda è piena fino a sera.',
  ],
};

const credHints = [
  [0, 'Ridicola: nemmeno tua nonna ci crederebbe.'],
  [20, 'Quasi assurda: bugia palese ma creativa.'],
  [40, 'Fragile: al limite del credibile.'],
  [60, 'Plausibile: potrebbe quasi funzionare.'],
  [80, 'Convincente: pochi farebbero domande.'],
  [95, 'Fotorealistica: crederesti a tutto.'],
];

const lenLabels = ['Breve', 'Media', 'Lunga'];
const lenHints = [
  [0, 'Solo la frase essenziale, niente fronzoli.'],
  [1, 'Un paio di frasi, chiara e diretta.'],
  [2, 'Più dettagli, più scenari coperti.'],
];
const lenDescs = ['una frase breve e incisiva', '2-3 frasi bilanciate', '4 o più frasi con dettagli'];

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

// ---------- Length Slider ----------
els.lenSlider.addEventListener('input', updateLen);
function updateLen() {
  const v = Number(els.lenSlider.value);
  lastLen = v;
  els.lenValue.textContent = lenLabels[v];
  let hint = lenHints[lenHints.length - 1][1];
  for (const [min, text] of lenHints) {
    if (v >= min) hint = text;
  }
  els.lenHint.textContent = hint;
}
updateLen();

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
  lastLen = Number(els.lenSlider.value);
  variantCount++;

  let credDesc;
  if (lastCred >= 90) credDesc = 'estremamente credibile, quasi vera, nessuno sospetterebbe';
  else if (lastCred >= 60) credDesc = 'credibile, plausibile senza esagerazioni';
  else if (lastCred >= 35) credDesc = 'poco credibile, al limite, la gente storcerebbe il naso ma sorriderebbe';
  else credDesc = 'totalmente assurda, ridicola e ovviamente falsa, ma esilarante';

  let lenConstraint;
  if (lastLen === 0) lenConstraint = 'ESATTAMENTE 1 frase. Non scrivere più di una frase.';
  else if (lastLen === 1) lenConstraint = 'ESATTAMENTE 2-3 frasi. Non scrivere più di 3 frasi.';
  else lenConstraint = 'Fino a 5 frasi, senza superarle.';

  let maxTokens;
  if (lastLen === 0) maxTokens = 40;
  else if (lastLen === 1) maxTokens = 80;
  else maxTokens = 150;

  return {
    messages: [
      { role: 'system', content: 'Sei un maestro nel trovare scuse originali in italiano. Rispondi SOLO con il testo della scusa, senza introduzioni, senza virgolette, senza spiegazioni, senza punti elenco. Non aggiungere nulla prima o dopo la scusa.' },
      { role: 'user', content: `Contesto: "${context}".\nCredibilità desiderata: ${lastCred}% (${credDesc}).\n${lenConstraint}\nGenerazione #${variantCount}: dai UNA scusa completamente diversa e originale rispetto a tutte le risposte precedenti, mai stessa struttura o stile.` },
    ],
    maxTokens,
  };
}

async function callGroq(key, model, messages, maxTokens = 600) {
  const body = {
    model,
    messages,
    temperature: 1.0,
    max_tokens: maxTokens,
  };
  if (/^openai\/gpt-oss/.test(model)) body.reasoning_effort = 'low';
  if (model.startsWith('qwen/')) body.reasoning_effort = 'none';
  const res = await fetch(GROQ_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + key,
    },
    body: JSON.stringify(body),
  });
  let data = null;
  let detail = '';
  try {
    data = await res.json();
    detail = (data && data.error && data.error.message) || '';
  } catch {}
  return { res, data, detail };
}

function looksComplete(text) {
  const t = text.trim();
  return t.length > 0 && /[.!?…]["'"”»]?$/.test(t);
}

function getCandidates(models) {
  const list = [];
  const push = (m) => { if (m && !list.includes(m)) list.push(m); };
  const stored = getStoredModel();
  if (stored && models.includes(stored)) push(stored);
  models.forEach(push);
  return list;
}

async function generate() {
  const key = getKey();
  if (!key) {
    useOffline = true;
    generateOffline();
    return;
  }

  setLoading(true);
  els.genLabel.textContent = 'Genero…';
  try {
    const probe = await corsProbe();
    if (!probe.ok) {
      throw new Error('Browser→Groq bloccato (CORS/rete): ' + probe.reason + '. Serve un piccolo "server ponte" gratuito per collegare la pagina a Groq.');
    }
    const { messages, maxTokens } = await buildPrompt();
    const models = await ensureModels(key);
    const candidates = getCandidates(models).slice(0, 6);
    if (!candidates.length) throw new Error('Nenhum modelo disponível na sua conta. Verifique a chave API e os modelos disponíveis nas configurações.');
    let lastErr = '';

    for (const model of candidates) {
      if (lastErr && !lastErr.match(/does not exist|not found|404/i)) {
        els.genLabel.textContent = 'Provo ' + model.split('/').pop() + '…';
      }

      let okAttempt = false;
      for (let attempt = 0; attempt < 2 && !okAttempt; attempt++) {
        const { res, data, detail } = await callGroq(key, model, messages, maxTokens);

        if (res.status === 401 || res.status === 403) {
          throw new Error('Chiave API non valida (' + (detail || res.status) + '). Controlla le impostazioni.');
        }
        if (res.status === 429) {
          throw new Error('Limite richieste superato. Riprova tra un attimo.');
        }
        if (res.ok) {
          const choice = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
          const excuse = (choice || '').trim();
          if (excuse && looksComplete(excuse)) {
            if (model) setStoredModel(model);
            showResult(excuse);
            return;
          }
          if (!lastErr) lastErr = excuse ? 'Risposta incompleta (riprovo)' : 'Risposta vuota da Groq (riprovo)';
        } else {
          lastErr = detail || ('Errore ' + res.status);
          if (/does not exist|not found|404|access/i.test(lastErr)) continue;
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

// ---------- Offline Mode ----------
function generateOffline() {
  const scenarios = OFFLINE_EXCUSES[selectedScenario] || OFFLINE_EXCUSES.custom;
  const excuse = scenarios[Math.floor(Math.random() * scenarios.length)];
  showResult(excuse);
  setLoading(false);
  els.genLabel.textContent = '🎲 Genera scusa';
  showToast('Modo offline — scusa casuale');
}

// ---------- Result ----------
function setDiag(msg, ok) {
  els.diagError.textContent = msg;
  els.diagError.classList.remove('hidden', 'diag-ok');
  if (ok) els.diagError.classList.add('diag-ok');
}

function showResult(text) {
  els.resultText.textContent = text;
  els.resultBadge.textContent = lastCred + '% credibilità · ' + lenLabels[lastLen];
  els.resultCard.classList.remove('hidden');
  els.resultCard.classList.remove('show');
  void els.resultCard.offsetWidth;
  els.resultCard.classList.add('show');
  els.diagError.classList.add('hidden');
  els.resultText.classList.remove('show');
  void els.resultText.offsetWidth;
  els.resultText.classList.add('show');
  els.resultText.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  spawnConfetti();
}

// ---------- Confetti ----------
function spawnConfetti() {
  const canvas = document.getElementById('confettiCanvas');
  const ctx = canvas.getContext('2d');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  canvas.classList.remove('hidden');
  const particles = [];
  const colors = ['#6c8cff', '#9b6cff', '#3fb950', '#f85149', '#e3b341', '#ff7eb3'];
  for (let i = 0; i < 60; i++) {
    particles.push({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height - canvas.height,
      w: Math.random() * 10 + 4,
      h: Math.random() * 6 + 2,
      color: colors[Math.floor(Math.random() * colors.length)],
      vx: (Math.random() - 0.5) * 4,
      vy: Math.random() * 4 + 2,
      rotation: Math.random() * 360,
      rotSpeed: (Math.random() - 0.5) * 10,
      opacity: 1,
    });
  }
  let frame = 0;
  function animate() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    particles.forEach((p) => {
      p.x += p.vx;
      p.y += p.vy;
      p.rotation += p.rotSpeed;
      p.opacity -= 0.015;
      if (p.opacity <= 0) return;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate((p.rotation * Math.PI) / 180);
      ctx.globalAlpha = p.opacity;
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    });
    frame++;
    if (frame < 80) requestAnimationFrame(animate);
    else canvas.classList.add('hidden');
  }
  animate();
}

// ---------- Loading ----------
function setLoading(active) {
  els.loading.classList.toggle('hidden', !active);
  els.generateBtn.disabled = active;
  els.generateBtn.classList.toggle('loading', active);
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

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}

if (!getKey()) {
  setTimeout(openSettings, 400);
}