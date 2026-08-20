import { jsPDF } from 'jspdf';

var MATS = [
  { id: 'math', l: 'Mathématiques', e: '📐' },
  { id: 'fr', l: 'Français', e: '📝' },
  { id: 'hist', l: 'Histoire-Géo', e: '🌍' },
  { id: 'svt', l: 'SVT', e: '🧬' },
  { id: 'phys', l: 'Physique-Chimie', e: '⚗️' },
  { id: 'ang', l: 'Anglais', e: '🇬🇧' },
  { id: 'esp', l: 'Espagnol', e: '🇪🇸' },
  { id: 'all', l: 'Allemand', e: '🇩🇪' },
  { id: 'philo', l: 'Philosophie', e: '🧠' }
];
var NIVS = ['(auto)', 'CP/CE1', 'CE2/CM1', 'CM2', '6ème', '5ème', '4ème', '3ème', 'Seconde', 'Première', 'Terminale', 'BTS/BUT', 'Licence'];
var LM = {};
var ST = { students: [], pdfClass: null, refB: null, mode: 'A', mats: new Set(), niv: '', uploadMode: 'sep', teacherComments: '' };
var DB = { classes: [], evals: [], leads: [] };
var _annotIdx = null;
var _cmpSel = [];

function init() {
  initDark();
  initTuto();
  var mg = document.getElementById('mg2');
  MATS.forEach(function (m) {
    LM[m.id] = m.l;
    var d = document.createElement('div');
    d.className = 'mc';
    d.id = 'mc-' + m.id;
    d.innerHTML = '<span>' + m.e + '</span><span>' + m.l + '</span><span class="ck">✓</span>';
    d.onclick = function () { togM(m.id); };
    mg.appendChild(d);
  });
  var nr = document.getElementById('nr');
  NIVS.forEach(function (n, i) {
    var d = document.createElement('div');
    d.className = 'nc' + (i === 0 ? ' on' : '');
    d.id = 'nc-' + i;
    d.textContent = n;
    d.onclick = function () { setN(i, n); };
    nr.appendChild(d);
  });
  upSum();
  loadDB();
  populateClassSelect();
  fetchRemoteLeads();
}

/* ── DB ── */
function loadDB() {
  try {
    var r = localStorage.getItem('cpro_db');
    if (r) {
      var parsed = JSON.parse(r);
      DB.classes = parsed.classes || [];
      DB.evals = parsed.evals || [];
      DB.leads = parsed.leads || [];
    }
  } catch (e) {}
  upBadge();
  upLeadsBadge();
  renderClassList();
  renderHistList();
}
function saveDB() {
  try {
    localStorage.setItem('cpro_db', JSON.stringify(DB));
  } catch (e) {}
  upLeadsBadge();
}
function upBadge() {
  var b = document.getElementById('hbadge');
  if (DB.evals && DB.evals.length) {
    b.textContent = DB.evals.length;
    b.style.display = '';
  } else if (b) b.style.display = 'none';
}
function upLeadsBadge() {
  var b = document.getElementById('leadsBadge');
  if (b) {
    var count = (DB.leads && DB.leads.length) || 0;
    if (count > 0) {
      b.textContent = count;
      b.style.display = '';
    } else {
      b.style.display = 'none';
    }
  }
}

/* ── NAV ── */
function gNav(v) {
  ['corr', 'classes', 'suivi', 'hist'].forEach(function (n) {
    var btn = document.getElementById('n-' + n);
    if (btn) btn.classList.toggle('on', n === v);
  });
  ['vf', 'vl', 'vr', 'vclasses', 'vsuivi', 'vhist'].forEach(function (x) {
    var el = document.getElementById(x);
    if (el) el.style.display = 'none';
  });
  if (v === 'corr') {
    var el = document.getElementById('vr');
    if (el && el.style.display !== 'none') el.style.display = 'block';
    else document.getElementById('vf').style.display = 'block';
  } else if (v === 'classes') {
    renderClassList();
    document.getElementById('vclasses').style.display = 'block';
  } else if (v === 'suivi') {
    renderSuivi();
    document.getElementById('vsuivi').style.display = 'block';
  } else if (v === 'hist') {
    renderHistList();
    document.getElementById('vhist').style.display = 'block';
  } else if (v === 'leads') {
    renderLeadsList();
    document.getElementById('vleads').style.display = 'block';
  }
}

/* ── UPLOAD MODE ── */
function setUploadMode(m) {
  ST.uploadMode = m;
  document.getElementById('mt-sep').classList.toggle('on', m === 'sep');
  document.getElementById('mt-pdf').classList.toggle('on', m === 'pdf');
  document.getElementById('upload-sep').style.display = m === 'sep' ? 'block' : 'none';
  document.getElementById('upload-pdf').style.display = m === 'pdf' ? 'block' : 'none';
  document.getElementById('sb').disabled = (m === 'sep' ? ST.students.length === 0 : ST.pdfClass === null);
}

/* ── MATIERES ── */
function togM(id) {
  if (ST.mats.has(id)) ST.mats.delete(id);
  else ST.mats.add(id);
  document.getElementById('mc-' + id).classList.toggle('on', ST.mats.has(id));
  upSum();
}
function addCM() {
  var v = document.getElementById('cm').value.trim();
  if (!v || ST.mats.has('_' + v)) return;
  var id = '_' + v;
  LM[id] = v;
  var d = document.createElement('div');
  d.className = 'mc on';
  d.id = 'mc-' + id;
  d.innerHTML = '<span>📚</span><span>' + v + '</span><span class="ck">✓</span>';
  d.onclick = function () {
    ST.mats.delete(id);
    d.remove();
    upSum();
  };
  document.getElementById('mg2').appendChild(d);
  ST.mats.add(id);
  document.getElementById('cm').value = '';
  upSum();
}
function getL(id) {
  return LM[id] || (MATS.find(function (m) { return m.id === id; }) || { l: id }).l;
}
function upSum() {
  var s = document.getElementById('sum');
  if (!ST.mats.size) {
    s.innerHTML = '<span style="font-size:.71rem;color:var(--inkl)">Aucune matière — détection automatique</span>';
    return;
  }
  s.innerHTML = Array.from(ST.mats).map(function (id) {
    return '<span class="stag">' + escH(getL(id)) + '<button onclick="rmM(\'' + id + '\')">✕</button></span>';
  }).join('');
}
function rmM(id) {
  ST.mats.delete(id);
  var el = document.getElementById('mc-' + id);
  if (el) el.classList.remove('on');
  upSum();
}
function setN(i, n) {
  ST.niv = i === 0 ? '' : n;
  document.querySelectorAll('.nc').forEach(function (e, j) {
    e.classList.toggle('on', j === i);
  });
}

/* ── FILE OPS ── */
function dg(e, o, id) {
  e.preventDefault();
  document.getElementById(id).classList.toggle('over', o);
}
function dp0(e) {
  e.preventDefault();
  document.getElementById('dz0').classList.remove('over');
  af2(e.dataTransfer.files);
}
function dpRefB(e) {
  e.preventDefault();
  document.getElementById('rdzB').classList.remove('over');
  var f = e.dataTransfer.files[0];
  if (f) loadRefB(f);
}
function dpPDF(e) {
  e.preventDefault();
  document.getElementById('dzPDF').classList.remove('over');
  var f = e.dataTransfer.files[0];
  if (f && f.type === 'application/pdf') setPDFClass(f);
}
function af(e) { af2(e.target.files); }
function afPDF(e) {
  var f = e.target.files[0];
  if (f) setPDFClass(f);
}
function setPDFClass(f) {
  var r = new FileReader();
  r.onload = function (e) {
    ST.pdfClass = { base64: e.target.result.split(',')[1], type: f.type, name: f.name };
    document.getElementById('pdfClassName').textContent = f.name;
    document.getElementById('pdfClassPreview').style.display = 'block';
    document.getElementById('dzPDF').style.display = 'none';
    document.getElementById('sb').disabled = false;
  };
  r.readAsDataURL(f);
}
function rmPDFClass() {
  ST.pdfClass = null;
  document.getElementById('pdfClassPreview').style.display = 'none';
  document.getElementById('dzPDF').style.display = 'flex';
  document.getElementById('sb').disabled = true;
}
async function compressImage(b64, mime) {
  if (!mime || !mime.startsWith('image/')) return b64;
  return new Promise(function (res) {
    var img = new Image();
    img.onload = function () {
      var MAX = 1400, w = img.width, h = img.height;
      if (w > MAX) { h = Math.round(h * MAX / w); w = MAX; }
      if (h > MAX) { h = Math.round(h * MAX / h); h = MAX; }
      var cv = document.createElement('canvas');
      cv.width = w;
      cv.height = h;
      cv.getContext('2d').drawImage(img, 0, 0, w, h);
      res(cv.toDataURL('image/jpeg', 0.75).split(',')[1]);
    };
    img.onerror = function () { res(b64); };
    img.src = 'data:' + mime + ';base64,' + b64;
  });
}

function af2(fl) {
  Array.from(fl).forEach(function (f) {
    var r = new FileReader();
    r.onload = function (e) {
      var id = Date.now() + '_' + Math.random().toString(36).slice(2);
      var isPdf = f.type === 'application/pdf';
      var rawB64 = e.target.result.split(',')[1];
      var nm = f.name.replace(/\.[^.]+$/, '').replace(/[_\-]/g, ' ');
      (isPdf ? Promise.resolve(rawB64) : compressImage(rawB64, f.type)).then(function (b64) {
        ST.students.push({ id: id, name: nm, base64: b64, type: isPdf ? f.type : 'image/jpeg', isPdf: isPdf, status: 'wait', result: null });
        rStudents();
        document.getElementById('sb').disabled = false;
      });
    };
    r.readAsDataURL(f);
  });
}
function rmStudent(id) {
  ST.students = ST.students.filter(function (s) { return s.id !== id; });
  rStudents();
  document.getElementById('sb').disabled = ST.students.length === 0;
}
function rStudents() {
  var sl = document.getElementById('sl'), dz = document.getElementById('dz0'), cc = document.getElementById('ccnt'), am = document.getElementById('addMoreBtn');
  if (!ST.students.length) {
    sl.style.display = 'none';
    dz.style.display = 'flex';
    cc.style.display = 'none';
    am.style.display = 'none';
    return;
  }
  dz.style.display = 'none';
  sl.style.display = 'flex';
  am.style.display = 'inline-flex';
  cc.textContent = ST.students.length + ' élève' + (ST.students.length > 1 ? 's' : '');
  cc.style.display = '';
  var stMap = { wait: 'st-wait', run: 'st-run', ok: 'st-ok', err: 'st-err', retry: 'st-retry' };
  updateTimeEst();
  sl.innerHTML = ST.students.map(function (s, i) {
    var stL = { wait: 'En attente', run: 'Correction…', retry: 'Nouvel essai…', ok: s.result ? ((s.result.note_obtenue !== undefined ? s.result.note_obtenue : '?') + '/' + s.result.note_total) : '✓', err: 'Erreur' };
    return '<div class="si" id="si-' + s.id + '">' +
      '<div class="si-ico ' + (s.isPdf ? 'si-pdf' : 'si-img') + '">' + (s.isPdf ? '📄' : '🖼') + '</div>' +
      '<div class="si-name"><input type="text" value="' + escH(s.name) + '" onchange="ST.students[' + i + '].name=this.value" placeholder="Élève ' + (i + 1) + '"></div>' +
      '<span class="' + (stMap[s.status] || 'st-wait') + '">' + (stL[s.status] || 'En attente') + '</span>' +
      '<button class="si-rm" onclick="rmStudent(\'' + s.id + '\')">✕</button>' +
      '</div>';
  }).join('');
}
function escH(s) {
  if (!s) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function loadRefB(f) {
  if (!f) return;
  var r = new FileReader();
  r.onload = function (e) {
    ST.refB = { base64: e.target.result.split(',')[1], type: f.type, name: f.name, isPdf: f.type === 'application/pdf' };
    document.getElementById('rpBName').textContent = f.name;
    document.getElementById('rpB').style.display = 'block';
    document.getElementById('rdzB').style.display = 'none';
  };
  r.readAsDataURL(f);
}
function rmRefB() {
  ST.refB = null;
  document.getElementById('rpB').style.display = 'none';
  document.getElementById('rdzB').style.display = 'flex';
  document.getElementById('rfiB').value = '';
}
function setM(m) {
  ST.mode = m;
  document.getElementById('ma').classList.toggle('on', m === 'A');
  document.getElementById('mb').classList.toggle('on', m === 'B');
  document.getElementById('mbf').style.display = m === 'B' ? 'block' : 'none';
}
function bldBlk(b, t, isPdf) {
  return isPdf ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: b } } : { type: 'image', source: { type: 'base64', media_type: t, data: b } };
}

/* ── BUILD PROMPT ── */
function buildPrompt(forClass) {
  var matList = Array.from(ST.mats).map(function (id) { return getL(id); }).join(', ');
  var ei = document.getElementById('ei').value.trim();
  var ct = document.getElementById('ct2').value.trim();
  var p = ST.mode === 'A' ? 'MODE A — Correction autonome.' : 'MODE B — Corrigé prof fourni. ' + (ct ? 'CORRIGÉ :\n' + ct : '') + (ST.refB ? ' (document corrigé fourni)' : '') + ' Utilise UNIQUEMENT ce corrigé.';
  p += matList ? '\nMatière(s) : ' + matList : '\nMatière : détecter automatiquement';
  p += '\nNiveau : ' + (ST.niv || 'à détecter');
  if (ei) p += '\nContexte : ' + ei;
  p += '\nPour chaque question, le champ zone indique la position sur la feuille : haut, milieu_haut, milieu_bas, ou bas. Si le nom de l\'eleve est visible sur la feuille, indique-le dans nom_eleve_detecte.';
  var nm = getNoteMax();
  if (nm) p += '\n' + nm;
  var ci = getCorrInstr();
  if (ci) p += '\n\n' + ci;
  if (forClass) {
    p += '\n\nCe PDF contient les copies de PLUSIEURS élèves scannées à la suite. Identifie chaque élève (lis leur nom sur la copie, sinon utilise "Élève 1", "Élève 2"…). Pour chaque élève, corrige sa copie.';
    p += '\n\nRetourne UNIQUEMENT du JSON valide :\n{"students":[{"name":"","nom_eleve_detecte":"","matiere":"","niveau":"","type_exercice":"","mode":"' + ST.mode + '","questions":[{"titre":"","zone":"haut","reponse_eleve":"","attendu":"","points_obtenus":0,"points_total":0,"commentaire":""}],"note_obtenue":0,"note_total":0,"appreciation":"","remarques":""}]}';
  } else {
    p += '\n\nRetourne UNIQUEMENT du JSON valide (pas de backtick) :\n{"nom_eleve_detecte":"","matiere":"","niveau":"","type_exercice":"","mode":"' + ST.mode + '","questions":[{"titre":"","zone":"haut","reponse_eleve":"","attendu":"","points_obtenus":0,"points_total":0,"commentaire":""}],"note_obtenue":0,"note_total":0,"appreciation":"","remarques":""}';
  }
  return p;
}

/* ── API ── */
async function callAPI(messages) {
  var apiUrl = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_BACKEND_URL)
    ? import.meta.env.VITE_BACKEND_URL + '/api/correct'
    : '/api/correct';

  var resp;
  try {
    resp = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: messages })
    });
  } catch (netErr) {
    throw new Error('Impossible de contacter le serveur (' + (netErr.message || 'Erreur réseau') + '). Vérifiez votre connexion.');
  }

  var textData = await resp.text();
  var data;
  try {
    data = JSON.parse(textData);
  } catch (e) {
    if (!resp.ok) {
      throw new Error('Erreur serveur HTTP ' + resp.status + ' : ' + (textData.slice(0, 120) || 'Échec'));
    }
    var m = textData.match(/\{[\s\S]*\}/);
    if (m) {
      data = JSON.parse(m[0]);
    } else {
      throw new Error('Réponse invalide du serveur IA : ' + textData.slice(0, 100));
    }
  }

  if (data.error) {
    var errTxt = typeof data.error === 'string' ? data.error : (data.error.message || JSON.stringify(data.error));
    if (errTxt.includes('GEMINI_API_KEY') || errTxt.includes('API key')) {
      throw new Error('Clé API Gemini non configurée sur le serveur. Ajoutez GEMINI_API_KEY dans les variables d\'environnement.');
    }
    throw new Error(errTxt);
  }
  if (data.result) return data.result;
  var raw = data.content ? data.content.map(function (b) { return b.type === 'text' ? b.text : ''; }).join('').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim() : (data.text || '');
  try {
    return JSON.parse(raw);
  } catch (e) {
    var m2 = raw.match(/\{[\s\S]*\}/);
    if (m2) return JSON.parse(m2[0]);
    throw new Error('Format de correction IA invalide.');
  }
}

async function correctOne(student) {
  var mc = [];
  mc.push(bldBlk(student.base64, student.type, student.isPdf));
  mc.push({ type: 'text', text: '[Copie de : ' + student.name + ']\n' + buildPrompt(false) });
  if (ST.mode === 'B' && ST.refB) {
    mc.push({ type: 'text', text: '[Corrigé officiel :]' });
    mc.push(bldBlk(ST.refB.base64, ST.refB.type, ST.refB.isPdf));
  }
  return await callAPI([{ role: 'user', content: mc }]);
}

async function correctOneWithRetry(student, maxR) {
  maxR = maxR || 2;
  var lastErr;
  for (var att = 0; att <= maxR; att++) {
    try {
      return await correctOne(student);
    } catch (e) {
      lastErr = e;
      if (att < maxR) {
        student.status = 'retry';
        await new Promise(function (r) { setTimeout(r, 1400 * (att + 1)); });
        student.status = 'run';
      }
    }
  }
  throw lastErr;
}

async function correctPDFClass() {
  var mc = [];
  mc.push(bldBlk(ST.pdfClass.base64, ST.pdfClass.type, true));
  mc.push({ type: 'text', text: buildPrompt(true) });
  if (ST.mode === 'B' && ST.refB) {
    mc.push({ type: 'text', text: '[Corrigé officiel :]' });
    mc.push(bldBlk(ST.refB.base64, ST.refB.type, ST.refB.isPdf));
  }
  var res = await callAPI([{ role: 'user', content: mc }]);
  return res.students || [];
}

/* ── SUBMIT ── */
var _pendingSubmit = false;

function hasUserRegisteredLead() {
  try {
    var storedUser = localStorage.getItem('cpro_lead_user');
    return Boolean(storedUser);
  } catch (e) {
    return false;
  }
}

function openLeadGateModal() {
  var modal = document.getElementById('leadGateModal');
  if (modal) modal.style.display = 'flex';
}

function closeLeadGateModal() {
  var modal = document.getElementById('leadGateModal');
  if (modal) modal.style.display = 'none';
}

async function submitLeadCapture() {
  var name = document.getElementById('leadInputName').value.trim();
  var email = document.getElementById('leadInputEmail').value.trim();
  var whatsapp = document.getElementById('leadInputWhatsapp').value.trim();
  var school = document.getElementById('leadInputSchool').value.trim();
  var errEl = document.getElementById('leadGateErr');
  var btn = document.getElementById('leadGateBtn');

  if (!email && !whatsapp) {
    if (errEl) {
      errEl.textContent = 'Veuillez saisir au moins une adresse email ou un numéro WhatsApp.';
      errEl.style.display = 'block';
    }
    return;
  }

  if (errEl) errEl.style.display = 'none';
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span>⏳ Enregistrement…</span>';
  }

  var leadData = {
    id: 'lead_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
    name: name,
    email: email,
    whatsapp: whatsapp,
    school: school,
    createdAt: new Date().toISOString()
  };

  // Save in local DB
  if (!DB.leads) DB.leads = [];
  // Avoid duplicate by email or phone
  var exists = DB.leads.some(function(l) { return (email && l.email === email.toLowerCase()) || (whatsapp && l.whatsapp === whatsapp); });
  if (!exists) {
    DB.leads.unshift(leadData);
    saveDB();
  }

  try {
    localStorage.setItem('cpro_lead_user', JSON.stringify(leadData));
  } catch (e) {}

  // Post to backend server / API
  try {
    var targetUrl = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_BACKEND_URL)
      ? import.meta.env.VITE_BACKEND_URL + '/api/leads'
      : '/api/leads';

    await fetch(targetUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(leadData)
    });
  } catch (err) {
    console.warn('Could not post lead to server (saved locally in DB):', err);
  }

  closeLeadGateModal();
  if (btn) {
    btn.disabled = false;
    btn.innerHTML = '<span>🚀 Accéder à la correction</span>';
  }

  // Continue to start correction if user was launching one
  if (_pendingSubmit) {
    _pendingSubmit = false;
    executeSub();
  }
}

async function sub() {
  if (!hasUserRegisteredLead()) {
    _pendingSubmit = true;
    openLeadGateModal();
    return;
  }
  executeSub();
}

async function executeSub() {
  document.getElementById('sb').disabled = true;
  document.getElementById('em').style.display = 'none';
  ['vf', 'vl', 'vr'].forEach(function (x) { document.getElementById(x).style.display = 'none'; });
  document.getElementById('vl').style.display = 'block';

  if (ST.uploadMode === 'pdf') {
    document.getElementById('batchSub').textContent = 'Analyse du PDF de classe en cours…';
    document.getElementById('pf').style.width = '30%';
    document.getElementById('batchLabel').textContent = '1 / 1';
    document.getElementById('batchPct').textContent = '…';
    document.getElementById('biList').innerHTML = '<div class="bi run"><div class="spin-sm"></div><div class="bi-name">Détection des copies…</div></div>';
    try {
      var results = await correctPDFClass();
      ST.students = results.map(function (r, i) {
        return { id: 'pdf_' + i, name: r.name || ('Élève ' + (i + 1)), base64: null, type: null, isPdf: true, status: 'ok', result: r };
      });
      document.getElementById('pf').style.width = '100%';
      document.getElementById('batchLabel').textContent = ST.students.length + ' élève' + (ST.students.length > 1 ? 's' : '');
      document.getElementById('biList').innerHTML = ST.students.map(function (s) {
        return '<div class="bi ok">✅<div class="bi-name">' + escH(s.name) + '</div><div class="bi-score">' + (s.result.note_obtenue !== undefined ? s.result.note_obtenue : '?') + '/' + s.result.note_total + '</div></div>';
      }).join('');
    } catch (e) {
      document.getElementById('biList').innerHTML = '<div class="bi err">❌<div class="bi-name">' + escH(e.message) + '</div></div>';
      document.getElementById('vl').style.display = 'none';
      document.getElementById('vf').style.display = 'block';
      document.getElementById('em').textContent = 'Erreur : ' + e.message;
      document.getElementById('em').style.display = 'block';
      document.getElementById('sb').disabled = false;
      return;
    }
  } else {
    var total = ST.students.length;
    var done = 0;
    ST.students.forEach(function (s) { s.status = 'wait'; s.result = null; });
    var biEl = document.getElementById('biList');
    function updBI() {
      biEl.innerHTML = ST.students.map(function (s) {
        var cls = s.status === 'run' ? 'run' : s.status === 'ok' ? 'ok' : s.status === 'err' ? 'err' : '';
        var score = s.result && s.result.note_total != null ? ((s.result.note_obtenue !== undefined ? s.result.note_obtenue : '?') + '/' + s.result.note_total) : '';
        var ico = s.status === 'run' ? '<div class="spin-sm"></div>' : s.status === 'retry' ? '🔄' : s.status === 'ok' ? '✅' : s.status === 'err' ? '❌' : '⏳';
        return '<div class="bi ' + cls + '">' + ico + '<div class="bi-name">' + escH(s.name) + '</div><div class="bi-score">' + score + '</div></div>';
      }).join('');
      var r = biEl.querySelector('.run');
      if (r) r.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
    function updP() {
      var pct = Math.round((done / total) * 100);
      document.getElementById('pf').style.width = pct + '%';
      document.getElementById('batchLabel').textContent = done + ' / ' + total;
      document.getElementById('batchPct').textContent = pct + '%';
      document.getElementById('batchSub').textContent = done < total ? 'Correction : ' + (ST.students[done] ? ST.students[done].name : '') + '…' : 'Finalisation…';
    }
    updBI();
    updP();

    var BATCH = 2, bi2 = 0;
    while (bi2 < ST.students.length) {
      var batch2 = ST.students.slice(bi2, bi2 + BATCH);
      bi2 += BATCH;
      batch2.forEach(function (s) { s.status = 'run'; });
      updBI();
      await Promise.all(batch2.map(function (student, sIdx) {
        return new Promise(function (resolve) {
          setTimeout(function () {
            correctOneWithRetry(student, 3).then(function (res) {
              if (res.nom_eleve_detecte && /^El.ve \d+$/i.test(student.name)) student.name = res.nom_eleve_detecte;
              student.result = res;
              student.status = 'ok';
              student.lastError = null;
            }).catch(function (e) {
              student.status = 'err';
              student.lastError = e && e.message ? e.message : 'Erreur de communication avec l\'IA';
              console.error(e);
            }).finally(function () {
              done++;
              updBI();
              updP();
              resolve();
            });
          }, sIdx * 400);
        });
      }));
      if (bi2 < ST.students.length) {
        await new Promise(function (r) { setTimeout(r, 600); });
      }
    }
  }

  setTimeout(function () {
    document.getElementById('vl').style.display = 'none';
    document.getElementById('vr').style.display = 'block';
    renderResults();
    renderClassList();
  }, 400);
  document.getElementById('sb').disabled = false;
}

async function retryStudent(i) {
  var s = ST.students[i];
  if (!s) return;
  s.status = 'run';
  renderResults();
  try {
    var res = await correctOneWithRetry(s, 3);
    if (res.nom_eleve_detecte && /^El.ve \d+$/i.test(s.name)) s.name = res.nom_eleve_detecte;
    s.result = res;
    s.status = 'ok';
  } catch (e) {
    s.status = 'err';
    console.error(e);
  }
  renderResults();
}

/* ── SCORE UTILS ── */
function scCls(o, t) {
  if (!t) return { c: 'score-b', f: 'fill-b' };
  var r = o / t;
  return r >= 0.75 ? { c: 'score-a', f: 'fill-a' } : r >= 0.5 ? { c: 'score-b', f: 'fill-b' } : { c: 'score-c', f: 'fill-c' };
}

/* ── TEACHER COMMENTS ── */
function onTeacherCommentsInput() {
  var el = document.getElementById('teacherEvalComments');
  if (el) {
    ST.teacherComments = el.value;
    var b = document.getElementById('teacherNotesSavedBadge');
    if (b) {
      b.style.display = el.value.trim() ? 'inline-block' : 'none';
      b.textContent = '✓ Pris en compte';
    }
  }
}

/* ── RENDER RESULTS ── */
function renderResults() {
  var ok = ST.students.filter(function (s) { return s.status === 'ok' && s.result; });
  var matList = Array.from(new Set(ok.map(function (s) { return s.result.matiere || ''; }).filter(Boolean))).join(', ') || 'Mixte';
  var niv = Array.from(new Set(ok.map(function (s) { return s.result.niveau || ''; }).filter(Boolean))).join(', ') || '—';
  var evalNameDisp = (document.getElementById('evalName') || {}).value || '';
  document.getElementById('evalTitle').textContent = evalNameDisp || (matList + (niv && niv !== '—' ? ' — ' + niv : ''));
  var wn = ok.filter(function (s) { return s.result.note_total && s.result.note_obtenue != null; });
  var avg = wn.length ? Math.round(10 * wn.reduce(function (a, r) { return a + (r.result.note_obtenue / r.result.note_total) * 20; }, 0) / wn.length) / 10 : null;
  var above = wn.filter(function (s) { return (s.result.note_obtenue / s.result.note_total) >= 0.5; }).length;
  document.getElementById('cs').innerHTML =
    '<div class="cs-box"><div class="csv-val">' + ST.students.length + '</div><div class="csl">Copies</div></div>' +
    '<div class="cs-box"><div class="csv-val">' + (avg !== null ? avg + '/20' : '—') + '</div><div class="csl">Moyenne</div></div>' +
    '<div class="cs-box"><div class="csv-val">' + above + '</div><div class="csl">≥ 10/20</div></div>' +
    '<div class="cs-box"><div class="csv-val">' + ok.length + '/' + ST.students.length + '</div><div class="csl">Corrigées</div></div>';
  renderHistogram(wn);
  renderAnalysis(ok);

  var tc = document.getElementById('teacherEvalComments');
  if (tc && tc.value !== (ST.teacherComments || '')) {
    tc.value = ST.teacherComments || '';
  }
  var tb = document.getElementById('teacherNotesSavedBadge');
  if (tb) {
    tb.style.display = (ST.teacherComments && ST.teacherComments.trim()) ? 'inline-block' : 'none';
  }

  document.getElementById('rt').innerHTML = ST.students.map(function (s, i) {
    if (s.status !== 'ok' || !s.result) {
      var errDetail = s.lastError ? ('<div style="font-size:0.75rem;color:var(--r2);margin-top:2px">' + escH(s.lastError) + '</div>') : '';
      return '<div class="rt-row" style="background:rgba(192,57,43,.06);border-color:rgba(192,57,43,.2);flex-wrap:wrap">' +
        '<span class="rt-num">' + (i + 1) + '</span>' +
        '<div style="flex:1"><span class="rt-name">' + escH(s.name) + '</span>' + errDetail + '</div>' +
        '<span class="rt-score" style="color:var(--r2);font-weight:600">' + (s.status === 'run' ? '⏳ En cours…' : '❌ Non corrigé') + '</span>' +
        '<div style="margin-left:auto">' +
        (s.status === 'run' ? '<div class="spin-sm"></div>' : '<button class="bs2" style="padding:3px 10px;font-size:.72rem" onclick="event.stopPropagation();retryStudent(' + i + ')">🔄 Réessayer</button>') +
        '</div>' +
        '</div>';
    }
    var r = s.result;
    var no = r.note_obtenue, nt = r.note_total;
    var pct = nt ? (no / nt) * 100 : 50;
    var sc = scCls(no, nt);
    return '<div class="rt-row" onclick="showDetail(' + i + ')"><span class="rt-num">' + (i + 1) + '</span><span class="rt-name">' + escH(s.name) + '</span><span class="rt-mat">' + escH(r.matiere || '') + '</span><div class="rt-bar"><div class="rt-fill ' + sc.f + '" style="width:' + Math.min(pct, 100) + '%"></div></div><span class="rt-score ' + sc.c + '">' + (nt != null ? ((no !== undefined ? no : '?') + '/' + nt) : '—') + '</span><span class="rt-arr">→</span></div>';
  }).join('');
}

/* ── HISTOGRAM ── */
function renderHistogram(wn) {
  var slots = [0, 0, 0, 0];
  wn.forEach(function (s) {
    var n20 = s.result.note_obtenue / s.result.note_total * 20;
    if (n20 < 5) slots[0]++;
    else if (n20 < 10) slots[1]++;
    else if (n20 < 15) slots[2]++;
    else slots[3]++;
  });
  var max = Math.max.apply(null, slots) || 1;
  var colors = ['#e74c3c', '#e67e22', '#3498db', '#27ae60'];
  document.getElementById('histoBars').innerHTML = slots.map(function (v, i) {
    var h = Math.round((v / max) * 85);
    return '<div class="hbar-wrap"><div class="hbar-count">' + (v || '') + '</div><div class="hbar" style="height:' + Math.max(h, v ? 3 : 0) + 'px;background:' + colors[i] + '"></div></div>';
  }).join('');
}

/* ── ERROR ANALYSIS ── */
function renderAnalysis(ok) {
  if (!ok.length) {
    document.getElementById('analysisSec').style.display = 'none';
    return;
  }
  document.getElementById('analysisSec').style.display = 'block';
  var qMap = {};
  ok.forEach(function (s) {
    (s.result.questions || []).forEach(function (q) {
      if (!q.titre || !q.points_total) return;
      if (!qMap[q.titre]) qMap[q.titre] = { total: 0, fail: 0, pts: q.points_total };
      qMap[q.titre].total++;
      if ((q.points_obtenus / q.points_total) < 0.5) qMap[q.titre].fail++;
    });
  });
  var qs = Object.keys(qMap).map(function (k) {
    return { titre: k, failPct: Math.round((qMap[k].fail / qMap[k].total) * 100), total: qMap[k].total, fail: qMap[k].fail };
  });
  qs.sort(function (a, b) { return b.failPct - a.failPct; });
  if (!qs.length) {
    document.getElementById('analysisSec').style.display = 'none';
    return;
  }
  var topFail = qs.filter(function (q) { return q.failPct >= 50; });
  var html = '';
  if (qs.length) {
    html += '<div style="margin-bottom:1rem">';
    qs.slice(0, 6).forEach(function (q) {
      var col = q.failPct >= 75 ? 'var(--r2)' : q.failPct >= 50 ? 'var(--g)' : 'var(--a)';
      html += '<div class="q-fail-row"><span class="qfail-name">' + escH(q.titre) + '</span><div class="qfail-bar"><div class="qfail-fill" style="width:' + q.failPct + '%;background:' + col + '"></div></div><span class="qfail-pct" style="color:' + col + '">' + q.failPct + '%</span></div>';
    });
    html += '</div>';
  }
  if (topFail.length) {
    html += '<div style="font-size:.75rem;font-weight:600;color:var(--ink);margin-bottom:.5rem">📌 Points de remédiation suggérés</div>';
    topFail.forEach(function (q) {
      html += '<div class="remed-item"><span style="font-size:1rem;flex-shrink:0">' + (q.failPct >= 75 ? '🔴' : '🟡') + '</span><div><strong style="font-size:.78rem">' + escH(q.titre) + '</strong> — ' + q.fail + ' élève' + (q.fail > 1 ? 's' : '') + ' en difficulté (' + q.failPct + '%)<br><span style="font-size:.73rem;color:var(--inkm)">Revoir ce point lors du prochain cours. Proposer des exercices supplémentaires ciblés.</span></div></div>';
    });
  }
  document.getElementById('analysisContent').innerHTML = html;
}

/* ── DETAIL MODAL ── */
function showDetail(idx) {
  _annotIdx = idx;
  var s = ST.students[idx];
  if (!s || !s.result) return;
  var d = s.result;
  var qs = d.questions || [];
  var no = d.note_obtenue || 0, nt = d.note_total || 0;
  var pct = nt ? Math.round((no / nt) * 100) : 0;
  var gc = pct >= 75 ? '#52b788' : pct >= 50 ? '#e9a23b' : '#e74c3c';
  var ci = 2 * Math.PI * 26;
  var da = Math.round((pct / 100) * ci);
  var wellQ = qs.filter(function (q) { return q.points_total && (q.points_obtenus / q.points_total) >= 0.9; });
  var badQ = qs.filter(function (q) { return q.points_total && (q.points_obtenus / q.points_total) < 0.5; });
  var wH = wellQ.length ? wellQ.map(function (q) { return '<div class="m-sitem">' + escH(q.titre || 'Q') + '</div>'; }).join('') : '<div class="m-sempty">—</div>';
  var bH = badQ.length ? badQ.map(function (q) { return '<div class="m-sitem">' + escH(q.titre || 'Q') + '</div>'; }).join('') : '<div class="m-sempty">Aucune erreur majeure 🎉</div>';
  var qH = qs.map(function (q) {
    var qp = q.points_total ? Math.round((q.points_obtenus / q.points_total) * 100) : 50;
    var cl = qp >= 99 ? 'mqok' : qp >= 50 ? 'mqpa' : 'mqba';
    var ic = qp >= 99 ? '✅' : qp >= 50 ? '⚠️' : '❌';
    var bs = q.points_total != null ? ((q.points_obtenus !== undefined ? q.points_obtenus : '?') + ' / ' + q.points_total + ' pt' + (q.points_total > 1 ? 's' : '')) : '';
    return '<div class="mqc ' + cl + '">' +
      '<div class="mqh"><span style="font-size:13px;flex-shrink:0">' + ic + '</span><span class="mqt">' + escH(q.titre || 'Question') + '</span>' + (bs ? '<span class="mqbdg">' + bs + '</span>' : '') + '</div>' +
      '<div class="mqb">' +
      (q.reponse_eleve ? '<div class="mqr"><span class="mql">Élève</span><span class="mqv">' + escH(q.reponse_eleve) + '</span></div>' : '') +
      (q.attendu ? '<div class="mqr"><span class="mql">Attendu</span><span class="mqv">' + escH(q.attendu) + '</span></div>' : '') +
      (q.points_total ? '<div class="mqpb"><div class="mqpf" style="width:' + qp + '%"></div></div>' : '') +
      (q.commentaire ? '<div class="mqcmt modal-cmt">' + escH(q.commentaire) + '</div>' : '') +
      '</div></div>';
  }).join('');
  var canA = s && !s.isPdf && s.base64;
  document.getElementById('modalContent').innerHTML =
    '<div class="m-head">' +
    '<button class="m-close" onclick="closeModal()">✕</button>' +
    '<div class="m-name">' + escH(s.name) + '</div>' +
    '<div class="m-meta">' + (d.matiere ? '<span>' + escH(d.matiere) + '</span><span class="m-sep">·</span>' : '') + (d.niveau ? '<span>' + escH(d.niveau) + '</span><span class="m-sep">·</span>' : '') + (d.type_exercice ? '<span>' + escH(d.type_exercice) + '</span><span class="m-sep">·</span>' : '') + '<span>Mode ' + (d.mode || ST.mode) + '</span></div>' +
    '<div class="m-score-row">' +
    '<div class="m-gauge"><svg width="68" height="68" viewBox="0 0 60 60"><circle cx="30" cy="30" r="26" fill="none" stroke="rgba(255,255,255,.12)" stroke-width="5"/><circle cx="30" cy="30" r="26" fill="none" stroke="' + gc + '" stroke-width="5" stroke-linecap="round" stroke-dasharray="' + da + ' ' + ci + '"/></svg><div class="m-gval"><span>' + no + '</span><span class="m-gsub">/ ' + nt + '</span></div></div>' +
    '<div class="m-sd"><div class="m-slbl">Performance globale</div><div class="m-sbar"><div class="m-sfill" style="width:' + pct + '%;background:' + gc + '"></div></div><div class="m-sstats"><div class="m-st"><strong>' + pct + '%</strong></div><div class="m-st"><strong>' + wellQ.length + '</strong> réussie' + (wellQ.length > 1 ? 's' : '') + '</div><div class="m-st"><strong>' + badQ.length + '</strong> à revoir</div></div></div>' +
    '</div></div>' +
    '<div class="m-body">' +
    '<div class="edit-toolbar"><button class="btn-edit" id="btn-edit" onclick="enterEdit(' + idx + ')">✏️ Modifier</button><button class="btn-save" id="btn-save" onclick="saveEdits(' + idx + ')">💾 Enregistrer</button></div>' +
    '<div class="m-tabs">' +
    '<button class="m-tab on" id="mTab-d" onclick="swTab(\'d\')">📋 Correction</button>' +
    (canA ? '<button class="m-tab" id="mTab-a" onclick="swTab(\'a\')">🖊 Copie annotée</button>' : '') +
    '</div>' +
    '<div id="mVd">' +
    '<div style="height:.8rem"></div>' +
    '<div class="m-synth"><div class="m-sw"><div class="m-stitle">✅ Points réussis</div><div class="m-sitems">' + wH + '</div></div><div class="m-sb"><div class="m-stitle">❌ Points à revoir</div><div class="m-sitems">' + bH + '</div></div></div>' +
    (qs.length ? '<div class="m-sec">Détail par question</div><div class="m-qs">' + qH + '</div>' : '') +
    (d.appreciation ? '<div class="m-apprec"><div class="m-al">💬 Appréciation</div><div class="m-at modal-apprec">' + escH(d.appreciation) + '</div></div>' : '') +
    (d.remarques && d.remarques.toLowerCase() !== 'aucune' && d.remarques.length > 2 ? '<div class="m-rem"><div class="m-rl">⚠️ Remarques</div><div class="m-rt">' + escH(d.remarques) + '</div></div>' : '') +
    '</div>' +
    (canA ? '<div id="mVa" style="display:none"><div style="height:.8rem"></div><p style="font-size:.71rem;color:var(--inkl);margin-bottom:.6rem">Annotations positionnées par zone détectée par l\'IA.</p><div class="annot-wrap" id="annotWrap"><canvas id="annotCanvas"></canvas></div><div class="ann-legend"><span class="al-item"><span class="al-dot" style="background:#2d6a4f"></span>Correct</span><span class="al-item"><span class="al-dot" style="background:#b5860d"></span>Partiel</span><span class="al-item"><span class="al-dot" style="background:#c0392b"></span>Incorrect</span></div></div>' : '<div id="mVa" style="display:none"></div>') +
    '</div>' +
    '<div class="m-acts"><button class="btn-pdf-export" onclick="exportStudentSheetPDF(' + idx + ')">📥 Exporter PDF</button><button class="m-bpr" onclick="printOne(' + idx + ')">🖨 Imprimer</button><button class="btn-retour" onclick="printStudentSheet(' + idx + ')">📄 Fiche élève</button><button class="m-bcl" onclick="closeModal()">Fermer</button></div>';
  document.getElementById('modal').style.display = 'flex';
}

function swTab(t) {
  document.getElementById('mTab-d').classList.toggle('on', t === 'd');
  var ta = document.getElementById('mTab-a');
  if (ta) ta.classList.toggle('on', t === 'a');
  document.getElementById('mVd').style.display = t === 'd' ? 'block' : 'none';
  document.getElementById('mVa').style.display = t === 'a' ? 'block' : 'none';
  if (t === 'a' && _annotIdx !== null) setTimeout(function () { drawAnnot(_annotIdx); }, 80);
}

function drawAnnot(idx) {
  var s = ST.students[idx];
  if (!s || !s.result || !s.base64) return;
  var d = s.result;
  var qs = d.questions || [];
  var img = new Image();
  img.onload = function () {
    var wrap = document.getElementById('annotWrap');
    if (!wrap) return;
    var mw = Math.min(img.width, wrap.clientWidth || 600);
    var sc = mw / img.width;
    var cw = Math.round(img.width * sc);
    var ch = Math.round(img.height * sc);
    var cv = document.getElementById('annotCanvas');
    cv.width = cw;
    cv.height = ch;
    var ctx = cv.getContext('2d');
    ctx.drawImage(img, 0, 0, cw, ch);
    var zy = { haut: 0.12, milieu_haut: 0.37, milieu_bas: 0.62, bas: 0.87 };
    var cols = { ok: '#2d6a4f', pa: '#b5860d', ba: '#c0392b' };
    qs.forEach(function (q, i) {
      var p = q.points_total ? (q.points_obtenus / q.points_total) : 0.5;
      var col = p >= 0.99 ? cols.ok : p >= 0.5 ? cols.pa : cols.ba;
      var zone = q.zone || (i < qs.length / 2 ? 'haut' : 'bas');
      var yr = zy[zone] !== undefined ? zy[zone] : (i / Math.max(qs.length, 1));
      var y = Math.round(yr * ch);
      var mw2 = 54, bh = 24, br = 5, x = cw - mw2 - 6;
      ctx.fillStyle = col + 'ee';
      ctx.beginPath();
      ctx.moveTo(x + br, y - bh / 2);
      ctx.lineTo(x + mw2 - br, y - bh / 2);
      ctx.arcTo(x + mw2, y - bh / 2, x + mw2, y + bh / 2, br);
      ctx.lineTo(x + mw2, y + bh / 2 - br);
      ctx.arcTo(x + mw2, y + bh / 2, x, y + bh / 2, br);
      ctx.lineTo(x + br, y + bh / 2);
      ctx.arcTo(x, y + bh / 2, x, y - bh / 2, br);
      ctx.lineTo(x, y - bh / 2 + br);
      ctx.arcTo(x, y - bh / 2, x + mw2, y - bh / 2, br);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'white';
      ctx.font = 'bold 11px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      var sc2 = q.points_total != null ? (q.points_obtenus + '/' + q.points_total) : (p >= 0.99 ? '✓' : p >= 0.5 ? '~' : '✗');
      ctx.fillText(sc2, x + mw2 / 2, y);
      ctx.setLineDash([3, 4]);
      ctx.strokeStyle = col + '66';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(4, y);
      ctx.lineTo(x - 2, y);
      ctx.stroke();
      ctx.setLineDash([]);
    });
  };
  img.src = 'data:' + s.type + ';base64,' + s.base64;
}

function closeModal() {
  document.getElementById('modal').style.display = 'none';
}

/* ── EXPORT CSV ── */
function exportCSV() {
  var ok = ST.students;
  var matList = Array.from(new Set(ok.filter(function (s) { return s.result; }).map(function (s) { return s.result.matiere || ''; }).filter(Boolean))).join(' / ') || 'Correction';
  var dateStr = new Date().toLocaleDateString('fr-FR');
  var teacherCmt = ST.teacherComments || (document.getElementById('teacherEvalComments') || {}).value || '';
  var lines = [];
  if (teacherCmt.trim()) {
    lines.push('"Remarques enseignant : ' + teacherCmt.replace(/"/g, '""').replace(/\n/g, ' ') + '"');
    lines.push('');
  }
  lines.push('Élève,Matière,Niveau,Note obtenue,Note totale,Note /20,Appréciation');
  ok.forEach(function (s) {
    var r = s.result;
    var no = r ? r.note_obtenue : '';
    var nt = r ? r.note_total : '';
    var n20 = r && nt ? (Math.round((no / nt) * 200) / 10) : '';
    lines.push([
      '"' + escH(s.name) + '"',
      '"' + (r ? r.matiere || '' : '') + '"',
      '"' + (r ? r.niveau || '' : '') + '"',
      no !== undefined ? no : '',
      nt || '',
      n20,
      '"' + (r ? escH(r.appreciation || '') : '') + '"'
    ].join(','));
  });
  var csv = lines.join('\n');
  var blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = 'correction_' + matList.replace(/[^a-zA-Z0-9]/g, '_') + '_' + dateStr.replace(/\//g, '-') + '.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/* ── PRINT ── */
function printOne(idx) {
  var s = ST.students[idx];
  if (!s || !s.result) return;
  var d = s.result;
  var no = d.note_total != null ? ((d.note_obtenue !== undefined ? d.note_obtenue : '?') + ' / ' + d.note_total) : '—';
  document.getElementById('pz').innerHTML = '<div style="font-family:sans-serif;max-width:680px;margin:0 auto;padding:2rem;color:#1a1a2e"><div style="text-align:center;border-bottom:1px solid #ddd;padding-bottom:1rem;margin-bottom:1.5rem"><h1 style="font-size:1.2rem;margin-bottom:4px">Correction — ' + escH(s.name) + '</h1><p style="font-size:.8rem;color:#666">' + (d.matiere || '') + ' — ' + (d.niveau || '') + '</p><p style="font-size:.74rem;color:#999">' + new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' }) + '</p></div>' + (d.questions || []).map(function (q) {
    var p = q.points_total ? Math.round((q.points_obtenus / q.points_total) * 100) : 50;
    var bc = p >= 99 ? '#2d6a4f' : p >= 50 ? '#b5860d' : '#c0392b';
    return '<div style="border-left:3px solid ' + bc + ';border:.5px solid #e5e5e5;border-left-width:3px;padding:.62rem .82rem;margin-bottom:.4rem;border-radius:0 6px 6px 0"><div style="display:flex;justify-content:space-between;margin-bottom:3px"><strong style="font-size:.81rem">' + escH(q.titre || '') + '</strong>' + (q.points_total != null ? '<span style="font-size:.75rem;font-weight:600;color:' + bc + '">' + q.points_obtenus + '/' + q.points_total + '</span>' : '') + '</div>' + (q.reponse_eleve ? '<div style="font-size:.74rem;color:#666">Élève : ' + escH(q.reponse_eleve) + '</div>' : '') + (q.attendu ? '<div style="font-size:.74rem;color:#666">Attendu : ' + escH(q.attendu) + '</div>' : '') + (q.commentaire ? '<div style="font-size:.71rem;color:#888;font-style:italic;margin-top:3px">' + escH(q.commentaire) + '</div>' : '') + '</div>';
  }).join('') + '<div style="background:#1a1a2e;color:white;border-radius:10px;padding:.85rem 1.2rem;display:flex;justify-content:space-between;align-items:center;margin:1rem 0"><span style="font-size:.74rem;opacity:.5;text-transform:uppercase">Note finale</span><span style="font-size:1.65rem;font-weight:700">' + no + '</span></div>' + (d.appreciation ? '<div style="background:#e8f4ee;border-radius:7px;padding:.72rem;font-size:.79rem;color:#1b4332;line-height:1.65;margin-bottom:.55rem">' + escH(d.appreciation) + '</div>' : '') + (d.remarques && d.remarques.toLowerCase() !== 'aucune' ? '<div style="background:#fef9ec;border-radius:7px;padding:.72rem;font-size:.77rem;color:#5a3e00">' + escH(d.remarques) + '</div>' : '') + '</div>';
  window.print();
}

function printClass() {
  var ok = ST.students.filter(function (s) { return s.status === 'ok' && s.result; });
  var matList = Array.from(new Set(ok.map(function (s) { return s.result.matiere || ''; }).filter(Boolean))).join(', ') || 'Correction';
  var wn = ok.filter(function (s) { return s.result.note_total && s.result.note_obtenue != null; });
  var avg = wn.length ? Math.round(10 * wn.reduce(function (a, r) { return a + (r.result.note_obtenue / r.result.note_total) * 20; }, 0) / wn.length) / 10 : null;
  var teacherCmt = ST.teacherComments || (document.getElementById('teacherEvalComments') || {}).value || '';
  var teacherHtml = teacherCmt.trim() ?
    '<div style="background:#f4f6f8;border-left:3.5px solid #1a1a2e;border-radius:0 8px 8px 0;padding:.85rem 1.1rem;margin-bottom:1.4rem;font-size:.82rem;line-height:1.6;color:#2c3e50">' +
    '<strong style="color:#1a1a2e">✍️ Remarques et observations de l\'enseignant :</strong><br>' +
    escH(teacherCmt).replace(/\n/g, '<br>') +
    '</div>' : '';

  document.getElementById('pz').innerHTML = '<div style="font-family:sans-serif;max-width:750px;margin:0 auto;padding:2rem;color:#1a1a2e">' +
    '<div style="text-align:center;border-bottom:1px solid #ddd;padding-bottom:1rem;margin-bottom:1.5rem">' +
    '<h1 style="font-size:1.25rem;margin-bottom:4px">Résultats — ' + escH(matList) + '</h1>' +
    '<p style="font-size:.79rem;color:#666">' + new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' }) + (avg ? ' — Moyenne : ' + avg + '/20' : '') + '</p>' +
    '</div>' +
    teacherHtml +
    '<table style="width:100%;border-collapse:collapse;font-size:.81rem"><tr style="background:#f0ece3"><th style="text-align:left;padding:.48rem .68rem;font-weight:600">Élève</th><th style="text-align:left;padding:.48rem .68rem;font-weight:600">Matière</th><th style="text-align:right;padding:.48rem .68rem;font-weight:600">Note</th><th style="text-align:right;padding:.48rem .68rem;font-weight:600">/20</th><th style="text-align:left;padding:.48rem .68rem;font-weight:600">Appréciation</th></tr>' + ST.students.map(function (s, i) {
    var r = s.result;
    var bg = i % 2 === 0 ? 'white' : '#faf8f4';
    var no = r && r.note_total != null ? r.note_obtenue : '—';
    var nt = r ? r.note_total : null;
    var n20 = r && nt ? Math.round((r.note_obtenue / nt) * 200) / 10 : '—';
    return '<tr style="background:' + bg + ';border-bottom:.5px solid #eee"><td style="padding:.42rem .68rem">' + escH(s.name) + '</td><td style="padding:.42rem .68rem;color:#666;font-size:.77rem">' + escH((r && r.matiere) || '') + '</td><td style="padding:.42rem .68rem;text-align:right;font-weight:700">' + (nt ? no + '/' + nt : '—') + '</td><td style="padding:.42rem .68rem;text-align:right;font-weight:600;color:' + (typeof n20 === 'number' ? (n20 >= 10 ? '#2d6a4f' : n20 >= 8 ? '#b5860d' : '#c0392b') : '#888') + '">' + n20 + '</td><td style="padding:.42rem .68rem;color:#666;font-size:.73rem">' + escH((r && r.appreciation) || '') + '</td></tr>';
  }).join('') + '</table></div>';
  window.print();
}

/* ── SAVE / BACK ── */
function back() {
  ST.students = [];
  ST.pdfClass = null;
  ST.teacherComments = '';
  var tc = document.getElementById('teacherEvalComments');
  if (tc) tc.value = '';
  var tb = document.getElementById('teacherNotesSavedBadge');
  if (tb) tb.style.display = 'none';

  ['vr', 'vl', 'vhist'].forEach(function (x) {
    var el = document.getElementById(x);
    if (el) el.style.display = 'none';
  });
  document.getElementById('vf').style.display = 'block';
  document.getElementById('dz0').style.display = 'flex';
  document.getElementById('sl').style.display = 'none';
  document.getElementById('sb').disabled = true;
  document.getElementById('em').style.display = 'none';
  document.getElementById('ccnt').style.display = 'none';
  var te = document.getElementById('timeEst');
  if (te) te.style.display = 'none';

  document.getElementById('addMoreBtn').style.display = 'none';
  document.getElementById('pdfClassPreview').style.display = 'none';
  document.getElementById('dzPDF').style.display = 'flex';
  gNav('corr');
}

function sav() {
  var ok = ST.students.filter(function (s) { return s.status === 'ok' && s.result; });
  var evalNameVal = (document.getElementById('evalName') || {}).value || '';
  var matList = Array.from(new Set(ok.map(function (s) { return s.result.matiere || ''; }).filter(Boolean))).join(', ') || 'Inconnue';
  if (evalNameVal) matList = evalNameVal;
  var niv = Array.from(new Set(ok.map(function (s) { return s.result.niveau || ''; }).filter(Boolean))).join(', ') || '';
  var wn = ok.filter(function (s) { return s.result.note_total && s.result.note_obtenue != null; });
  var avg = wn.length ? Math.round(10 * wn.reduce(function (a, r) { return a + (r.result.note_obtenue / r.result.note_total) * 20; }, 0) / wn.length) / 10 : null;
  var teacherCmt = ST.teacherComments || (document.getElementById('teacherEvalComments') || {}).value || '';
  var id = Date.now();
  var ev = {
    id: id,
    ts: new Date().toISOString(),
    name: matList + (niv ? ' — ' + niv : ''),
    matiere: matList,
    niveau: niv,
    nb: ST.students.length,
    avg: avg,
    teacherComments: teacherCmt,
    students: ST.students.map(function (s) { return { name: s.name, status: s.status, result: s.result }; })
  };
  DB.evals.unshift(ev);
  if (DB.evals.length > 30) DB.evals = DB.evals.slice(0, 30);
  saveDB();
  upBadge();
  renderClassList();
  renderHistList();
  var b = document.getElementById('svbtn');
  b.innerHTML = '✅ Sauvegardé !';
  b.style.background = 'var(--ah)';
  setTimeout(function () {
    b.innerHTML = '🔖 Sauvegarder';
    b.style.background = '';
  }, 2500);
}

/* ── CLASSES ── */
function populateClassSelect() {
  var sel = document.getElementById('classSelect');
  if (!sel) return;
  sel.innerHTML = '<option value="">Aucune</option>';
  DB.classes.forEach(function (c) {
    var opt = document.createElement('option');
    opt.value = c.id;
    opt.textContent = c.name + ' (' + c.students.length + ' élèves)';
    sel.appendChild(opt);
  });
}

function loadClassStudents() {
  var sel = document.getElementById('classSelect');
  var cid = sel.value;
  if (!cid) return;
  var cl = DB.classes.find(function (c) { return String(c.id) === cid; });
  if (!cl) return;
  if (ST.uploadMode === 'sep') {
    alert('Les noms de la classe seront utilisés automatiquement.\nImportez les fichiers dans l\'ordre de la liste : ' + cl.students.join(', '));
  }
}

function showNewClass() {
  document.getElementById('newClassForm').style.display = 'block';
  document.getElementById('newClassName').focus();
}

function saveNewClass() {
  var name = document.getElementById('newClassName').value.trim();
  if (!name) return alert('Donnez un nom à la classe.');
  var raw = document.getElementById('newClassStudents').value;
  var students = raw.split(/[\n,]/).map(function (s) { return s.trim(); }).filter(function (s) { return s.length > 0; });
  if (!students.length) return alert('Ajoutez au moins un élève.');
  DB.classes.push({ id: Date.now(), name: name, students: students });
  saveDB();
  document.getElementById('newClassForm').style.display = 'none';
  document.getElementById('newClassName').value = '';
  document.getElementById('newClassStudents').value = '';
  renderClassList();
  populateClassSelect();
}

function getAllStudentEvaluations(studentName) {
  if (!studentName) return [];
  var sLow = studentName.trim().toLowerCase();
  var evals = [];
  var seenIds = new Set();

  // 1. From DB.evals
  (DB.evals || []).forEach(function (ev) {
    if (!ev || !ev.students) return;
    var match = ev.students.find(function (st) {
      return st && st.name && st.name.trim().toLowerCase() === sLow;
    });
    if (match && match.result && match.result.note_total && match.result.note_obtenue != null) {
      var d = match.result;
      var dObj = new Date(ev.ts || Date.now());
      var dStr = dObj.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
      var n20 = Math.round((d.note_obtenue / d.note_total) * 200) / 10;
      evals.push({
        id: ev.id,
        dateStr: dStr,
        ts: ev.ts || '',
        evalName: ev.name || ev.matiere || 'Évaluation',
        matiere: ev.matiere || d.matiere || '',
        niveau: ev.niveau || d.niveau || '',
        score: d.note_obtenue,
        total: d.note_total,
        score20: n20,
        appreciation: d.appreciation || '',
        remarques: d.remarques || '',
        questions: d.questions || [],
        classAvg: ev.avg != null ? ev.avg : null,
        teacherComments: ev.teacherComments || ''
      });
      seenIds.add(ev.id);
    }
  });

  // 2. From current active session ST.students (if not yet saved in DB.evals)
  if (ST.students && ST.students.length) {
    var curMatch = ST.students.find(function (s) {
      return s && s.name && s.name.trim().toLowerCase() === sLow && s.status === 'ok' && s.result && s.result.note_total && s.result.note_obtenue != null;
    });
    if (curMatch) {
      var ok = ST.students.filter(function (s) { return s.status === 'ok' && s.result; });
      var matList = Array.from(new Set(ok.map(function (s) { return s.result.matiere || ''; }).filter(Boolean))).join(', ') || 'Évaluation';
      var niv = Array.from(new Set(ok.map(function (s) { return s.result.niveau || ''; }).filter(Boolean))).join(', ') || '';
      var wn = ok.filter(function (s) { return s.result.note_total && s.result.note_obtenue != null; });
      var curAvg = wn.length ? Math.round(10 * wn.reduce(function (a, r) { return a + (r.result.note_obtenue / r.result.note_total) * 20; }, 0) / wn.length) / 10 : null;
      var curD = curMatch.result;
      var curN20 = Math.round((curD.note_obtenue / curD.note_total) * 200) / 10;
      var curDateStr = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
      var evalTitle = (document.getElementById('evalName') || {}).value || (matList + (niv ? ' — ' + niv : ''));

      evals.push({
        id: 'session-current',
        dateStr: curDateStr + ' (Actuel)',
        ts: new Date().toISOString(),
        evalName: evalTitle,
        matiere: matList,
        niveau: niv,
        score: curD.note_obtenue,
        total: curD.note_total,
        score20: curN20,
        appreciation: curD.appreciation || '',
        remarques: curD.remarques || '',
        questions: curD.questions || [],
        classAvg: curAvg,
        teacherComments: ST.teacherComments || ''
      });
    }
  }

  evals.sort(function (a, b) {
    return new Date(a.ts || 0) - new Date(b.ts || 0);
  });
  return evals;
}

function getStudentMetrics(studentName) {
  var evals = getAllStudentEvaluations(studentName);
  if (!evals.length) {
    return {
      evals: [],
      avg: null,
      count: 0,
      highest: null,
      lowest: null,
      trendDelta: null,
      trendLabel: '—',
      trendClass: 'student-score-empty',
      scoreClass: 'student-score-empty'
    };
  }
  var sum = evals.reduce(function (a, e) { return a + e.score20; }, 0);
  var avg = Math.round(10 * sum / evals.length) / 10;
  var scores = evals.map(function (e) { return e.score20; });
  var highest = Math.max.apply(null, scores);
  var lowest = Math.min.apply(null, scores);

  var last3 = evals.slice(-3);
  var trendDelta = null;
  var trendLabel = '—';
  var trendClass = '';
  if (last3.length >= 2) {
    trendDelta = Math.round(10 * (last3[last3.length - 1].score20 - last3[0].score20)) / 10;
    if (trendDelta > 0.5) {
      trendLabel = '📈 +' + trendDelta;
      trendClass = 'score-rise';
    } else if (trendDelta < -0.5) {
      trendLabel = '⚠️ ' + trendDelta;
      trendClass = 'score-drop';
    } else {
      trendLabel = '➡️ ' + (trendDelta >= 0 ? '+' : '') + trendDelta;
      trendClass = 'score-stable';
    }
  }

  var scoreClass = avg >= 14 ? 'student-score-good' : avg >= 10 ? 'student-score-med' : 'student-score-low';

  return {
    evals: evals,
    avg: avg,
    count: evals.length,
    highest: highest,
    lowest: lowest,
    trendDelta: trendDelta,
    trendLabel: trendLabel,
    trendClass: trendClass,
    scoreClass: scoreClass
  };
}

function renderClassList() {
  var el = document.getElementById('classList');
  var em = document.getElementById('classEmpty');
  var gs = document.getElementById('classesGlobalStats');

  if (!DB.classes.length) {
    if (el) el.innerHTML = '';
    if (gs) gs.innerHTML = '';
    if (em) em.style.display = 'block';
    return;
  }
  if (em) em.style.display = 'none';

  // 1. Calculate Global Stats
  var allScores = [];
  var totalStudentsCount = 0;
  var classStats = DB.classes.map(function (c) {
    totalStudentsCount += c.students.length;
    var cScores = [];
    var studentsData = c.students.map(function (sName) {
      var m = getStudentMetrics(sName);
      if (m.evals && m.evals.length) {
        m.evals.forEach(function (e) {
          cScores.push(e.score20);
          allScores.push(e.score20);
        });
      }
      return { name: sName, metrics: m };
    });

    var cAvg = cScores.length ? Math.round(10 * cScores.reduce(function (a, b) { return a + b; }, 0) / cScores.length) / 10 : null;
    return {
      classObj: c,
      studentsData: studentsData,
      classAvg: cAvg,
      scoresCount: cScores.length
    };
  });

  var globalAvg = allScores.length ? Math.round(10 * allScores.reduce(function (a, b) { return a + b; }, 0) / allScores.length) / 10 : null;

  // 2. Render Global Stats Bar
  if (gs) {
    gs.innerHTML = '<div class="classes-kpi-grid">' +
      '<div class="classes-kpi-card"><div class="classes-kpi-val">' + DB.classes.length + '</div><div class="classes-kpi-lbl">Classes</div></div>' +
      '<div class="classes-kpi-card"><div class="classes-kpi-val">' + totalStudentsCount + '</div><div class="classes-kpi-lbl">Élèves inscrits</div></div>' +
      '<div class="classes-kpi-card"><div class="classes-kpi-val highlight-avg">' + (globalAvg !== null ? globalAvg + '/20' : '—') + '</div><div class="classes-kpi-lbl">Moyenne générale</div></div>' +
      '<div class="classes-kpi-card"><div class="classes-kpi-val">' + (DB.evals.length + (ST.students.some(function(s){return s.status==='ok';}) ? 1 : 0)) + '</div><div class="classes-kpi-lbl">Évaluations</div></div>' +
      '</div>';
  }

  // 3. Render Class Blocks
  if (el) {
    el.innerHTML = classStats.map(function (csItem, i) {
      var c = csItem.classObj;
      var cAvg = csItem.classAvg;
      var avgPillClass = cAvg !== null ? (cAvg >= 14 ? 'avg-good' : cAvg >= 10 ? 'avg-med' : 'avg-low') : 'avg-none';
      var avgPillText = cAvg !== null ? '📊 Moyenne classe : ' + cAvg.toFixed(1) + '/20' : '📊 Aucune note enregistrée';

      var studentsHtml = csItem.studentsData.map(function (sItem) {
        var sName = sItem.name;
        var m = sItem.metrics;
        var initials = sName.split(/\s+/).map(function (w) { return w[0]; }).filter(Boolean).slice(0, 2).join('').toUpperCase() || 'É';
        var scoreText = m.avg !== null ? m.avg.toFixed(1) + '/20' : '—';
        var subText = m.count ? (m.count + ' devoir' + (m.count > 1 ? 's' : '') + (m.trendLabel !== '—' ? ' • ' + m.trendLabel : '')) : 'Non évalué';

        return '<div class="student-card-btn" onclick="openStudentDashboard(\'' + escH(sName).replace(/'/g, "\\'") + '\', ' + c.id + ')" title="Cliquez pour ouvrir le tableau de bord de ' + escH(sName) + '">' +
          '<div class="student-avatar">' + initials + '</div>' +
          '<div class="student-info-col">' +
          '<div class="student-name-text">' + escH(sName) + '</div>' +
          '<div class="student-stats-sub">' + subText + '</div>' +
          '</div>' +
          '<div class="student-score-badge ' + m.scoreClass + '">' + scoreText + '</div>' +
          '</div>';
      }).join('');

      return '<div class="class-block-card">' +
        '<div class="class-block-hdr">' +
        '<div class="class-block-info">' +
        '<span class="class-block-title">' + escH(c.name) + '</span>' +
        '<span class="class-avg-pill ' + avgPillClass + '">' + avgPillText + '</span>' +
        '<span style="font-size:12px;color:var(--label3)">(' + c.students.length + ' élève' + (c.students.length > 1 ? 's' : '') + ')</span>' +
        '</div>' +
        '<div class="cl-actions">' +
        '<button class="cl-btn" onclick="editClass(' + i + ')">✏️ Gérer la liste</button>' +
        '<button class="cl-btn danger" onclick="delClass(' + c.id + ')">🗑</button>' +
        '</div>' +
        '</div>' +
        '<div class="class-students-container">' +
        '<div class="class-students-subhdr">' +
        '<span>Élèves — Cliquez sur un élève pour ouvrir son tableau de bord</span>' +
        '<span>' + csItem.studentsData.filter(function(st){ return st.metrics.count > 0; }).length + ' / ' + c.students.length + ' évalués</span>' +
        '</div>' +
        '<div class="class-students-grid">' +
        studentsHtml +
        '</div>' +
        '</div>' +
        '<div id="classedit-' + c.id + '" style="display:none;padding:.75rem;background:var(--fill2);border-top:1px solid var(--separator)">' +
        '<div style="font-size:12px;font-weight:600;color:var(--label2);margin-bottom:8px">Modifier les élèves de ' + escH(c.name) + ' :</div>' +
        '<div class="student-grid" id="sgedit-' + c.id + '">' +
        c.students.map(function (s, j) {
          return '<div class="sg-item"><input type="text" value="' + escH(s) + '" onchange="updateStudent(' + c.id + ',' + j + ',this.value)"><button class="sg-del" onclick="removeStudent(' + c.id + ',' + j + ')">✕</button></div>';
        }).join('') +
        '<div class="sg-item" style="cursor:pointer;justify-content:center;color:var(--blue);border-style:dashed" onclick="addStudent(' + c.id + ')">+ Ajouter un élève</div>' +
        '</div>' +
        '</div>' +
        '</div>';
    }).join('');
  }
}

function openStudentDashboard(studentName, classId) {
  var evals = getAllStudentEvaluations(studentName);
  var m = getStudentMetrics(studentName);
  
  var className = '';
  var classObj = null;
  if (classId) {
    classObj = DB.classes.find(function (c) { return c.id === classId; });
    if (classObj) className = classObj.name;
  }
  if (!className) {
    classObj = DB.classes.find(function (c) {
      return c.students.some(function (st) { return st.toLowerCase() === studentName.toLowerCase(); });
    });
    if (classObj) className = classObj.name;
  }

  var initials = studentName.split(/\s+/).map(function (w) { return w[0]; }).filter(Boolean).slice(0, 2).join('').toUpperCase() || 'É';
  var scoreColor = m.avg !== null ? (m.avg >= 14 ? 'var(--green)' : m.avg >= 10 ? 'var(--orange)' : 'var(--red)') : 'var(--label3)';

  // Calculate Class rank & Class benchmark if classObj exists
  var classRankText = '—';
  var classAvgForChart = null;
  if (classObj && m.avg !== null) {
    var classmatesScores = classObj.students.map(function (st) {
      return { name: st, avg: getStudentMetrics(st).avg };
    }).filter(function (x) { return x.avg !== null; });
    classmatesScores.sort(function (a, b) { return b.avg - a.avg; });
    var rank = classmatesScores.findIndex(function (x) { return x.name.toLowerCase() === studentName.toLowerCase(); });
    if (rank !== -1) {
      classRankText = (rank + 1) + 'e / ' + classmatesScores.length;
    }
    if (classmatesScores.length) {
      classAvgForChart = Math.round(10 * classmatesScores.reduce(function (a, b) { return a + b.avg; }, 0) / classmatesScores.length) / 10;
    }
  }

  // Generate SVG chart
  var chartHtml = '';
  if (evals.length >= 1) {
    var cw = 560;
    var ch = 130;
    var padX = 40;
    var padY = 20;
    var chartW = cw - 2 * padX;
    var chartH = ch - 2 * padY;

    var pts = evals.map(function (e, idx) {
      var x = evals.length === 1 ? padX + chartW / 2 : padX + (idx / (evals.length - 1)) * chartW;
      var y = padY + chartH - (e.score20 / 20) * chartH;
      return { x: x, y: y, score: e.score20, name: e.evalName, date: e.dateStr };
    });

    var polylinePoints = pts.map(function (p) { return p.x + ',' + p.y; }).join(' ');

    // Class average line
    var classLineY = classAvgForChart !== null ? padY + chartH - (classAvgForChart / 20) * chartH : null;

    chartHtml = '<div class="sdb-chart-box">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">' +
      '<span style="font-size:12px;font-weight:600;color:var(--label2)">📈 Évolution chronologique des notes</span>' +
      (classAvgForChart !== null ? '<span style="font-size:11px;color:var(--label3)">Ligne pointillée : Moyenne classe (' + classAvgForChart + '/20)</span>' : '') +
      '</div>' +
      '<svg viewBox="0 0 ' + cw + ' ' + ch + '" style="width:100%;height:auto;overflow:visible">' +
      // Grid lines
      '<line x1="' + padX + '" y1="' + (padY) + '" x2="' + (cw - padX) + '" y2="' + (padY) + '" stroke="var(--separator)" stroke-dasharray="3 3"/>' +
      '<text x="' + (padX - 8) + '" y="' + (padY + 4) + '" font-size="9" fill="var(--label3)" text-anchor="end">20</text>' +
      '<line x1="' + padX + '" y1="' + (padY + chartH / 2) + '" x2="' + (cw - padX) + '" y2="' + (padY + chartH / 2) + '" stroke="var(--separator)" stroke-dasharray="3 3"/>' +
      '<text x="' + (padX - 8) + '" y="' + (padY + chartH / 2 + 4) + '" font-size="9" fill="var(--label3)" text-anchor="end">10</text>' +
      '<line x1="' + padX + '" y1="' + (padY + chartH) + '" x2="' + (cw - padX) + '" y2="' + (padY + chartH) + '" stroke="var(--separator)"/>' +
      '<text x="' + (padX - 8) + '" y="' + (padY + chartH + 4) + '" font-size="9" fill="var(--label3)" text-anchor="end">0</text>' +
      // Class average benchmark
      (classLineY !== null ? '<line x1="' + padX + '" y1="' + classLineY + '" x2="' + (cw - padX) + '" y2="' + classLineY + '" stroke="var(--blue)" stroke-width="1.5" stroke-dasharray="4 4" opacity="0.6"/>' : '') +
      // Trend line
      (evals.length > 1 ? '<polyline fill="none" stroke="var(--blue)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" points="' + polylinePoints + '"/>' : '') +
      // Data dots
      pts.map(function (p) {
        var dotColor = p.score >= 14 ? 'var(--green)' : p.score >= 10 ? 'var(--orange)' : 'var(--red)';
        return '<g>' +
          '<circle cx="' + p.x + '" cy="' + p.y + '" r="5" fill="' + dotColor + '" stroke="white" stroke-width="2"/>' +
          '<text x="' + p.x + '" y="' + (p.y - 8) + '" font-size="10" font-weight="bold" fill="var(--label)" text-anchor="middle">' + p.score.toFixed(1) + '</text>' +
          '<text x="' + p.x + '" y="' + (padY + chartH + 14) + '" font-size="8.5" fill="var(--label3)" text-anchor="middle">' + p.date + '</text>' +
          '</g>';
      }).join('') +
      '</svg>' +
      '</div>';
  }

  // Devoirs list
  var devoirsListHtml = '';
  if (!evals.length) {
    devoirsListHtml = '<div style="padding:24px;text-align:center;color:var(--label3);background:var(--fill);border-radius:10px;border:1px dashed var(--separator)">' +
      'Aucun devoir enregistré pour cet élève.<br><small style="margin-top:4px;display:inline-block">Les évaluations corrigées s\'afficheront ici automatiquement.</small>' +
      '</div>';
  } else {
    devoirsListHtml = evals.map(function (ev, idx) {
      var scorePillClass = ev.score20 >= 14 ? 'student-score-good' : ev.score20 >= 10 ? 'student-score-med' : 'student-score-low';
      var vsClassText = '';
      if (ev.classAvg !== null) {
        var diff = Math.round(10 * (ev.score20 - ev.classAvg)) / 10;
        vsClassText = diff > 0 ? ' • +' + diff + ' pts vs classe' : diff < 0 ? ' • ' + diff + ' pts vs classe' : ' • Conforme à la moyenne classe';
      }

      return '<div class="sdb-devoir-card">' +
        '<div class="sdb-devoir-hdr">' +
        '<div>' +
        '<div class="sdb-devoir-title">' + escH(ev.evalName) + '</div>' +
        '<div class="sdb-devoir-date">' + ev.dateStr + (ev.matiere ? ' • ' + escH(ev.matiere) : '') + vsClassText + '</div>' +
        '</div>' +
        '<div class="sdb-devoir-score-pill ' + scorePillClass + '">' + (ev.score !== undefined ? ev.score + '/' + ev.total : '') + ' (' + ev.score20.toFixed(1) + '/20)</div>' +
        '</div>' +
        (ev.appreciation ? '<div class="sdb-devoir-body"><strong>💬 Appréciation :</strong> ' + escH(ev.appreciation) + '</div>' : '') +
        (ev.teacherComments ? '<div class="sdb-devoir-body" style="margin-top:4px;background:rgba(255,149,0,0.08);color:#9e5200"><strong>✍️ Remarque enseignant :</strong> ' + escH(ev.teacherComments) + '</div>' : '') +
        '</div>';
    }).reverse().join('');
  }

  var modalHtml = '<div class="sdb-wrap">' +
    '<div class="sdb-head">' +
    '<div class="sdb-title-area">' +
    '<div class="sdb-avatar-lg">' + initials + '</div>' +
    '<div>' +
    '<div class="sdb-name">' + escH(studentName) + '</div>' +
    '<div class="sdb-class-tag">' +
    '<span>👥 ' + (className ? escH(className) : 'Classe non assignée') + '</span>' +
    (classRankText !== '—' ? '<span>• Rang : ' + classRankText + '</span>' : '') +
    '</div>' +
    '</div>' +
    '</div>' +
    '<button class="m-bcl" onclick="closeModal()" style="font-size:16px;width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;padding:0">✕</button>' +
    '</div>' +
    '<div class="sdb-kpi-grid">' +
    '<div class="sdb-kpi-box"><div class="sdb-kpi-val" style="color:' + scoreColor + '">' + (m.avg !== null ? m.avg.toFixed(1) + '/20' : '—') + '</div><div class="sdb-kpi-lbl">Moyenne générale</div></div>' +
    '<div class="sdb-kpi-box"><div class="sdb-kpi-val">' + (m.count ? m.count + ' devoir' + (m.count > 1 ? 's' : '') : '0') + '</div><div class="sdb-kpi-lbl">Devoirs corrigés</div></div>' +
    '<div class="sdb-kpi-box"><div class="sdb-kpi-val">' + (m.trendLabel !== '—' ? m.trendLabel : '—') + '</div><div class="sdb-kpi-lbl">Tendance (3 évals)</div></div>' +
    '<div class="sdb-kpi-box"><div class="sdb-kpi-val" style="font-size:15px">' + (m.lowest !== null ? m.lowest.toFixed(1) + ' - ' + m.highest.toFixed(1) : '—') + '</div><div class="sdb-kpi-lbl">Min / Max</div></div>' +
    '</div>' +
    chartHtml +
    '<div class="sdb-section-title"><span>📚 Historique détaillé des devoirs (' + evals.length + ')</span></div>' +
    '<div class="sdb-devoirs-list">' + devoirsListHtml + '</div>' +
    '<div class="sdb-actions">' +
    '<button class="btn-pdf-export" onclick="exportStudentBulletinPDF(\'' + escH(studentName).replace(/'/g, "\\'") + '\', ' + (classId || 'null') + ')">📥 Télécharger Bulletin PDF</button>' +
    '<button class="bs2" onclick="printStudentBulletin(\'' + escH(studentName).replace(/'/g, "\\'") + '\', ' + (classId || 'null') + ')">🖨 Imprimer Bulletin</button>' +
    '<button class="btn-retour" onclick="closeModal()">✕ Fermer</button>' +
    '</div>' +
    '</div>';

  var modalContent = document.getElementById('modalContent');
  if (modalContent) {
    modalContent.innerHTML = modalHtml;
  }
  document.getElementById('modal').style.display = 'flex';
}

function printStudentBulletin(studentName, classId) {
  var evals = getAllStudentEvaluations(studentName);
  var m = getStudentMetrics(studentName);
  var className = '';
  if (classId) {
    var cObj = DB.classes.find(function (c) { return c.id === classId; });
    if (cObj) className = cObj.name;
  }
  var dateStr = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });

  var html = '<div class="pr-page" style="padding:20mm;font-family:-apple-system,sans-serif">' +
    '<div style="display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #007aff;padding-bottom:12px;margin-bottom:20px">' +
    '<div><h1 style="font-size:22px;font-weight:bold;margin:0 0 4px">Bulletin Personnel de Suivi</h1><div style="font-size:13px;color:#666">' + dateStr + (className ? ' • Classe : ' + escH(className) : '') + '</div></div>' +
    '<div style="text-align:right"><div style="font-size:20px;font-weight:bold;color:#007aff">' + escH(studentName) + '</div>' + (m.avg !== null ? '<div style="font-size:15px;font-weight:bold;color:#333">Moyenne : ' + m.avg.toFixed(1) + '/20</div>' : '') + '</div>' +
    '</div>' +
    '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:20px">' +
    '<div style="background:#f5f7fa;padding:10px;border-radius:6px;text-align:center"><div style="font-size:16px;font-weight:bold">' + (m.avg !== null ? m.avg.toFixed(1) + '/20' : '—') + '</div><div style="font-size:11px;color:#666">Moyenne</div></div>' +
    '<div style="background:#f5f7fa;padding:10px;border-radius:6px;text-align:center"><div style="font-size:16px;font-weight:bold">' + m.count + '</div><div style="font-size:11px;color:#666">Devoirs</div></div>' +
    '<div style="background:#f5f7fa;padding:10px;border-radius:6px;text-align:center"><div style="font-size:16px;font-weight:bold">' + (m.lowest !== null ? m.lowest.toFixed(1) + ' - ' + m.highest.toFixed(1) : '—') + '</div><div style="font-size:11px;color:#666">Min / Max</div></div>' +
    '<div style="background:#f5f7fa;padding:10px;border-radius:6px;text-align:center"><div style="font-size:16px;font-weight:bold">' + m.trendLabel + '</div><div style="font-size:11px;color:#666">Tendance</div></div>' +
    '</div>' +
    '<h3 style="font-size:14px;font-weight:bold;margin:0 0 10px;border-bottom:1px solid #ddd;padding-bottom:4px">Historique des devoirs</h3>' +
    '<table style="width:100%;border-collapse:collapse;font-size:12px">' +
    '<thead><tr style="background:#f0f4f8;border-bottom:1px solid #ccc"><th style="padding:8px;text-align:left">Date</th><th style="padding:8px;text-align:left">Devoir</th><th style="padding:8px;text-align:center">Note</th><th style="padding:8px;text-align:center">/20</th><th style="padding:8px;text-align:left">Appréciation</th></tr></thead>' +
    '<tbody>' +
    evals.map(function (ev) {
      return '<tr style="border-bottom:1px solid #eee"><td style="padding:8px">' + ev.dateStr + '</td><td style="padding:8px;font-weight:bold">' + escH(ev.evalName) + '</td><td style="padding:8px;text-align:center">' + ev.score + '/' + ev.total + '</td><td style="padding:8px;text-align:center;font-weight:bold">' + ev.score20.toFixed(1) + '</td><td style="padding:8px">' + escH(ev.appreciation || '—') + '</td></tr>';
    }).join('') +
    '</tbody></table>' +
    '<div style="margin-top:30px;font-size:11px;color:#888;text-align:center">Document édité via ProfCorrec\' IA</div>' +
    '</div>';

  var pz = document.getElementById('pz');
  if (pz) {
    pz.innerHTML = html;
    window.print();
  }
}

/* ── PDF EXPORT UTILITIES WITH JSPDF ── */
function exportEvaluationPDF() {
  var ok = ST.students.filter(function (s) { return s.status === 'ok' && s.result; });
  if (!ok.length) {
    alert('Aucune note disponible à exporter en PDF.');
    return;
  }
  var wn = ok.filter(function (s) { return s.result.note_total && s.result.note_obtenue != null; });
  var avg = wn.length ? Math.round(10 * wn.reduce(function (a, r) { return a + (r.result.note_obtenue / r.result.note_total) * 20; }, 0) / wn.length) / 10 : null;
  var notes20 = wn.map(function (s) { return Math.round(10 * (s.result.note_obtenue / s.result.note_total) * 20) / 10; });
  var maxScore = notes20.length ? Math.max.apply(null, notes20) : null;
  var minScore = notes20.length ? Math.min.apply(null, notes20) : null;
  var passRate = notes20.length ? Math.round((notes20.filter(function (n) { return n >= 10; }).length / notes20.length) * 100) : 0;

  var matList = Array.from(new Set(ok.map(function (s) { return s.result.matiere || ''; }).filter(Boolean))).join(', ') || 'Évaluation';
  var niv = Array.from(new Set(ok.map(function (s) { return s.result.niveau || ''; }).filter(Boolean))).join(', ') || '';
  var evalNameDisp = (document.getElementById('evalName') || {}).value || (matList + (niv ? ' — ' + niv : ''));
  var dateStr = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });

  var doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  var pageWidth = 210;
  var pageHeight = 297;
  var margin = 14;
  var contentWidth = pageWidth - 2 * margin;

  // Header Banner
  doc.setFillColor(0, 122, 255);
  doc.roundedRect(margin, 12, contentWidth, 22, 3, 3, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('RAPPORT D\'ÉVALUATION DE CLASSE', margin + 6, 21);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.text(dateStr + (niv ? '  •  Niveau : ' + niv : ''), margin + 6, 29);

  // Subtitle
  var curY = 40;
  doc.setTextColor(30, 30, 30);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(evalNameDisp, margin, curY);
  curY += 6;

  // 4 KPI Summary Cards
  var kpiW = (contentWidth - 9) / 4;
  var kpiH = 15;
  var kpis = [
    { label: 'COPIES', val: ST.students.length + ' (' + ok.length + ' corr.)', col: [0, 122, 255] },
    { label: 'MOYENNE', val: (avg !== null ? avg + ' / 20' : '—'), col: [0, 122, 255] },
    { label: 'MIN / MAX', val: (minScore !== null ? minScore + ' - ' + maxScore : '—'), col: [80, 80, 80] },
    { label: 'RÉUSSITE', val: passRate + ' % (≥10)', col: passRate >= 60 ? [45, 138, 70] : [215, 60, 45] }
  ];

  kpis.forEach(function (k, idx) {
    var kx = margin + idx * (kpiW + 3);
    doc.setFillColor(245, 247, 250);
    doc.setDrawColor(225, 230, 238);
    doc.roundedRect(kx, curY, kpiW, kpiH, 2, 2, 'FD');

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(110, 115, 125);
    doc.text(k.label, kx + kpiW / 2, curY + 4.5, { align: 'center' });

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(k.col[0], k.col[1], k.col[2]);
    doc.text(k.val, kx + kpiW / 2, curY + 11.5, { align: 'center' });
  });
  curY += kpiH + 6;

  // Teacher comments if available
  if (ST.teacherComments && ST.teacherComments.trim()) {
    doc.setFillColor(254, 250, 235);
    doc.setDrawColor(245, 220, 160);
    var tLines = doc.splitTextToSize('Remarques de l\'enseignant : ' + ST.teacherComments.trim(), contentWidth - 8);
    var blockH = Math.max(12, tLines.length * 4.2 + 6);
    doc.roundedRect(margin, curY, contentWidth, blockH, 2, 2, 'FD');
    doc.setTextColor(130, 85, 20);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.text(tLines, margin + 4, curY + 5);
    curY += blockH + 6;
  }

  // Table header
  doc.setFillColor(235, 240, 248);
  doc.setDrawColor(205, 215, 230);
  doc.rect(margin, curY, contentWidth, 7, 'FD');
  doc.setTextColor(50, 60, 75);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.text('#', margin + 3, curY + 4.8);
  doc.text('Nom de l\'élève', margin + 12, curY + 4.8);
  doc.text('Note brute', margin + 65, curY + 4.8);
  doc.text('Note / 20', margin + 92, curY + 4.8);
  doc.text('Appréciation & Observations', margin + 120, curY + 4.8);
  curY += 7;

  // Table Rows
  ST.students.forEach(function (s, idx) {
    if (curY > pageHeight - 20) {
      doc.addPage();
      curY = 16;
      doc.setFillColor(235, 240, 248);
      doc.rect(margin, curY, contentWidth, 6.5, 'FD');
      doc.setTextColor(50, 60, 75);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.text('#', margin + 3, curY + 4.5);
      doc.text('Nom de l\'élève', margin + 12, curY + 4.5);
      doc.text('Note brute', margin + 65, curY + 4.5);
      doc.text('Note / 20', margin + 92, curY + 4.5);
      doc.text('Appréciation & Observations', margin + 120, curY + 4.5);
      curY += 6.5;
    }

    var isEven = idx % 2 === 0;
    var rowH = 7.5;
    var res = s.result;
    var noteObt = res ? res.note_obtenue : null;
    var noteTot = res ? res.note_total : null;
    var n20 = (res && noteTot) ? Math.round((noteObt / noteTot) * 200) / 10 : null;
    var apprec = res ? (res.appreciation || '—') : (s.status === 'run' ? 'Correction en cours...' : 'Non corrigé');

    var apprecLines = doc.splitTextToSize(apprec, 58);
    if (apprecLines.length > 1) {
      rowH = Math.max(rowH, apprecLines.length * 3.8 + 2.5);
    }

    doc.setFillColor(isEven ? 255 : 249, isEven ? 255 : 250, isEven ? 255 : 252);
    doc.setDrawColor(230, 235, 242);
    doc.rect(margin, curY, contentWidth, rowH, 'FD');

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(100, 100, 100);
    doc.text(String(idx + 1), margin + 3, curY + 4.8);

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 30, 30);
    doc.text(doc.splitTextToSize(s.name, 48)[0], margin + 12, curY + 4.8);

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(70, 70, 70);
    doc.text(noteTot != null ? (noteObt + ' / ' + noteTot) : '—', margin + 65, curY + 4.8);

    if (n20 !== null) {
      doc.setFont('helvetica', 'bold');
      if (n20 >= 14) doc.setTextColor(45, 138, 70);
      else if (n20 >= 10) doc.setTextColor(210, 120, 20);
      else doc.setTextColor(215, 60, 45);
      doc.text(n20.toFixed(1) + ' / 20', margin + 92, curY + 4.8);
    } else {
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(140, 140, 140);
      doc.text('—', margin + 92, curY + 4.8);
    }

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(60, 60, 60);
    doc.text(apprecLines, margin + 120, curY + 4);

    curY += rowH;
  });

  // Footer on all pages
  var totalPages = doc.getNumberOfPages();
  for (var p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(140, 140, 140);
    doc.text('Généré par ProfCorrec\' IA — ' + dateStr, margin, pageHeight - 8);
    doc.text('Page ' + p + ' / ' + totalPages, pageWidth - margin, pageHeight - 8, { align: 'right' });
  }

  var safeName = evalNameDisp.toLowerCase().replace(/[^a-z0-9_-]/g, '_').substring(0, 35);
  doc.save('evaluation_' + safeName + '.pdf');
}

function exportStudentBulletinPDF(studentName, classId) {
  var evals = getAllStudentEvaluations(studentName);
  var className = '';
  if (classId) {
    var cl = DB.classes.find(function (c) { return c.id === classId; });
    if (cl) className = cl.name;
  }
  if (!className) {
    var cFound = DB.classes.find(function (c) {
      return c.students.some(function (st) { return st.toLowerCase() === studentName.toLowerCase(); });
    });
    if (cFound) className = cFound.name;
  }

  var doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  var pageWidth = 210;
  var pageHeight = 297;
  var margin = 15;
  var contentWidth = pageWidth - 2 * margin;

  // Header Banner
  doc.setFillColor(0, 122, 255);
  doc.roundedRect(margin, 12, contentWidth, 24, 3, 3, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text('BULLETIN PERSONNEL DE SUIVI', margin + 8, 22);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  var dateStr = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
  doc.text(dateStr + (className ? '  •  Classe : ' + className : ''), margin + 8, 30);

  // Student Name
  var curY = 44;
  doc.setTextColor(20, 20, 20);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(studentName, margin, curY);
  curY += 7;

  // Calculate Metrics
  var avg = evals.length ? Math.round(10 * evals.reduce(function (s, e) { return s + e.score20; }, 0) / evals.length) / 10 : null;
  var scores = evals.map(function (e) { return e.score20; });
  var highest = scores.length ? Math.max.apply(null, scores) : null;
  var lowest = scores.length ? Math.min.apply(null, scores) : null;
  var last3 = evals.slice(-3);
  var trendDelta = last3.length >= 2 ? Math.round(10 * (last3[last3.length - 1].score20 - last3[0].score20)) / 10 : null;

  var kpiW = (contentWidth - 9) / 4;
  var kpiH = 16;
  var kpis = [
    { label: 'MOYENNE GÉNÉRALE', val: avg !== null ? avg + ' / 20' : '—', col: [0, 122, 255] },
    { label: 'DEVOIRS CORRIGÉS', val: evals.length + ' devoir' + (evals.length > 1 ? 's' : ''), col: [50, 50, 50] },
    { label: 'MIN / MAX', val: (lowest !== null ? lowest + ' - ' + highest : '—'), col: [80, 80, 80] },
    { label: 'TENDANCE (3 DERNIERS)', val: trendDelta !== null ? (trendDelta > 0 ? '+' + trendDelta + ' pts' : trendDelta + ' pts') : '—', col: trendDelta > 0 ? [45, 138, 70] : trendDelta < 0 ? [215, 60, 45] : [80, 80, 80] }
  ];

  kpis.forEach(function (k, idx) {
    var kx = margin + idx * (kpiW + 3);
    doc.setFillColor(245, 247, 250);
    doc.setDrawColor(225, 230, 238);
    doc.roundedRect(kx, curY, kpiW, kpiH, 2, 2, 'FD');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(110, 115, 125);
    doc.text(k.label, kx + kpiW / 2, curY + 5, { align: 'center' });
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(k.col[0], k.col[1], k.col[2]);
    doc.text(k.val, kx + kpiW / 2, curY + 12, { align: 'center' });
  });
  curY += kpiH + 8;

  // Devoirs table
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(30, 30, 30);
  doc.text('Détail des devoirs et évaluations', margin, curY);
  curY += 5;

  doc.setFillColor(235, 240, 248);
  doc.setDrawColor(205, 215, 230);
  doc.rect(margin, curY, contentWidth, 7, 'FD');
  doc.setTextColor(50, 60, 75);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.text('Date', margin + 3, curY + 4.8);
  doc.text('Devoir / Matière', margin + 28, curY + 4.8);
  doc.text('Note', margin + 78, curY + 4.8);
  doc.text('Note / 20', margin + 102, curY + 4.8);
  doc.text('Appréciation & Remarques', margin + 126, curY + 4.8);
  curY += 7;

  if (!evals.length) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(120, 120, 120);
    doc.text('Aucun devoir enregistré pour cet élève.', margin + 4, curY + 8);
    curY += 16;
  } else {
    evals.forEach(function (ev, idx) {
      if (curY > pageHeight - 22) {
        doc.addPage();
        curY = 16;
      }
      var isEven = idx % 2 === 0;
      var rowH = 8;
      var apprec = ev.appreciation || '—';
      var lines = doc.splitTextToSize(apprec, 50);
      if (lines.length > 1) {
        rowH = Math.max(rowH, lines.length * 3.8 + 3);
      }

      doc.setFillColor(isEven ? 255 : 249, isEven ? 255 : 250, isEven ? 255 : 252);
      doc.setDrawColor(230, 235, 242);
      doc.rect(margin, curY, contentWidth, rowH, 'FD');

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(90, 90, 90);
      doc.text(ev.dateStr || '—', margin + 3, curY + 5);

      doc.setFont('helvetica', 'bold');
      doc.setTextColor(30, 30, 30);
      doc.text(doc.splitTextToSize(ev.evalName || ev.matiere || 'Évaluation', 46)[0], margin + 28, curY + 5);

      doc.setFont('helvetica', 'normal');
      doc.setTextColor(70, 70, 70);
      doc.text(ev.score + ' / ' + ev.total, margin + 78, curY + 5);

      doc.setFont('helvetica', 'bold');
      if (ev.score20 >= 14) doc.setTextColor(45, 138, 70);
      else if (ev.score20 >= 10) doc.setTextColor(210, 120, 20);
      else doc.setTextColor(215, 60, 45);
      doc.text(ev.score20.toFixed(1) + ' / 20', margin + 102, curY + 5);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(60, 60, 60);
      doc.text(lines, margin + 126, curY + 4.5);

      curY += rowH;
    });
  }

  // Footer on all pages
  var totalPages = doc.getNumberOfPages();
  for (var p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(140, 140, 140);
    doc.text('Généré par ProfCorrec\' IA — ' + dateStr, margin, pageHeight - 8);
    doc.text('Page ' + p + ' / ' + totalPages, pageWidth - margin, pageHeight - 8, { align: 'right' });
  }

  var safeS = studentName.toLowerCase().replace(/[^a-z0-9_-]/g, '_');
  doc.save('bulletin_' + safeS + '.pdf');
}

function exportStudentSheetPDF(idx) {
  var s = ST.students[idx];
  if (!s || !s.result) return;
  var d = s.result;
  var qs = d.questions || [];
  var no = d.note_obtenue || 0, nt = d.note_total || 0;
  var n20 = nt ? Math.round((no / nt) * 200) / 10 : null;
  var mat = d.matiere || 'Évaluation';
  var niv = d.niveau || '';
  var dateStr = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });

  var doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  var pageWidth = 210;
  var pageHeight = 297;
  var margin = 15;
  var contentWidth = pageWidth - 2 * margin;

  // Header
  doc.setFillColor(0, 122, 255);
  doc.roundedRect(margin, 12, contentWidth, 22, 3, 3, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('FICHE DE CORRECTION INDIVIDUELLE', margin + 6, 20);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(mat + (niv ? ' — ' + niv : '') + '  •  ' + dateStr, margin + 6, 28);

  var curY = 40;
  doc.setTextColor(20, 20, 20);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text(s.name, margin, curY);

  // Score badge
  var scoreText = no + ' / ' + nt + (n20 !== null ? '  (' + n20 + '/20)' : '');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  if (n20 >= 14) doc.setTextColor(45, 138, 70);
  else if (n20 >= 10) doc.setTextColor(210, 120, 20);
  else doc.setTextColor(215, 60, 45);
  doc.text(scoreText, pageWidth - margin, curY, { align: 'right' });
  curY += 8;

  // Appreciation box
  if (d.appreciation) {
    doc.setFillColor(245, 248, 255);
    doc.setDrawColor(210, 225, 250);
    var apLines = doc.splitTextToSize('Appréciation : ' + d.appreciation, contentWidth - 8);
    var bh = Math.max(12, apLines.length * 4.2 + 5);
    doc.roundedRect(margin, curY, contentWidth, bh, 2, 2, 'FD');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(30, 60, 120);
    doc.text(apLines, margin + 4, curY + 5);
    curY += bh + 6;
  }

  // Questions breakdown
  if (qs.length) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.setTextColor(30, 30, 30);
    doc.text('Détail des questions', margin, curY);
    curY += 5;

    qs.forEach(function (q, qIdx) {
      if (curY > pageHeight - 25) {
        doc.addPage();
        curY = 16;
      }
      var qp = q.points_total ? (q.points_obtenus / q.points_total) : 0.5;
      var qCol = qp >= 0.99 ? [45, 138, 70] : qp >= 0.5 ? [210, 120, 20] : [215, 60, 45];
      var qIcon = qp >= 0.99 ? '[ACQUIS]' : qp >= 0.5 ? '[PARTIEL]' : '[A REVOIR]';

      doc.setFillColor(250, 251, 253);
      doc.setDrawColor(225, 230, 240);

      var qLines = [];
      if (q.reponse_eleve) qLines.push('Réponse élève : ' + q.reponse_eleve);
      if (q.attendu) qLines.push('Attendu : ' + q.attendu);
      if (q.commentaire) qLines.push('Commentaire : ' + q.commentaire);

      var qBlockH = 10 + (qLines.length * 4.2);
      doc.roundedRect(margin, curY, contentWidth, qBlockH, 2, 2, 'FD');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(30, 30, 30);
      doc.text((q.titre || ('Question ' + (qIdx + 1))), margin + 4, curY + 5);

      doc.setTextColor(qCol[0], qCol[1], qCol[2]);
      doc.text((q.points_obtenus !== undefined ? q.points_obtenus : '?') + ' / ' + q.points_total + ' pt  ' + qIcon, pageWidth - margin - 4, curY + 5, { align: 'right' });

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(70, 70, 70);
      var subY = curY + 9.5;
      qLines.forEach(function (ln) {
        var wrapped = doc.splitTextToSize(ln, contentWidth - 8);
        doc.text(wrapped[0], margin + 4, subY);
        subY += 4.2;
      });

      curY += qBlockH + 4;
    });
  }

  // Footer on all pages
  var totalPages = doc.getNumberOfPages();
  for (var p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(140, 140, 140);
    doc.text('Généré par ProfCorrec\' IA — ' + dateStr, margin, pageHeight - 8);
    doc.text('Page ' + p + ' / ' + totalPages, pageWidth - margin, pageHeight - 8, { align: 'right' });
  }

  var safeS = s.name.toLowerCase().replace(/[^a-z0-9_-]/g, '_');
  doc.save('copie_' + safeS + '.pdf');
}

function editClass(i) {
  var c = DB.classes[i];
  var ed = document.getElementById('classedit-' + c.id);
  ed.style.display = ed.style.display === 'none' ? 'block' : 'none';
}
function delClass(id) {
  if (!confirm('Supprimer cette classe ?')) return;
  DB.classes = DB.classes.filter(function (c) { return c.id !== id; });
  saveDB();
  renderClassList();
  populateClassSelect();
}
function updateStudent(cid, j, v) {
  var c = DB.classes.find(function (c) { return c.id === cid; });
  if (c) { c.students[j] = v; saveDB(); renderClassList(); }
}
function removeStudent(cid, j) {
  var c = DB.classes.find(function (c) { return c.id === cid; });
  if (c) { c.students.splice(j, 1); saveDB(); renderClassList(); }
}
function addStudent(cid) {
  var c = DB.classes.find(function (c) { return c.id === cid; });
  if (c) { c.students.push('Nouvel élève'); saveDB(); renderClassList(); }
}

/* ── SUIVI ── */
var _suiviFilter = 'all';

function setSuiviFilter(f) {
  _suiviFilter = f;
  renderSuivi();
}

function renderSuivi() {
  var q = (document.getElementById('suiviSearch') || {}).value || '';
  var el = document.getElementById('suiviContent');
  if (!el) return;
  if (!DB.evals.length) {
    el.innerHTML = '<div class="empty-state"><span class="ei">📈</span><p>Aucune évaluation sauvegardée</p><small>Sauvegardez des corrections pour suivre la progression des élèves</small></div>';
    return;
  }
  var smap = {};
  DB.evals.forEach(function (ev) {
    (ev.students || []).forEach(function (s) {
      if (!s.name) return;
      if (!smap[s.name]) smap[s.name] = [];
      if (s.result && s.result.note_total != null && s.result.note_obtenue != null) {
        smap[s.name].push({
          date: ev.ts,
          matiere: ev.matiere || ev.name || 'Évaluation',
          note: s.result.note_obtenue,
          total: s.result.note_total,
          n20: Math.round((s.result.note_obtenue / s.result.note_total) * 200) / 10
        });
      }
    });
  });

  var allNames = Object.keys(smap).filter(function (n) { return smap[n].length > 0; });
  if (!allNames.length) {
    el.innerHTML = '<div class="empty-state"><span class="ei">📈</span><p>Aucune note enregistrée</p><small>Sauvegardez des corrections pour suivre la progression</small></div>';
    return;
  }

  // Pre-calculate trajectory for each student
  var studentData = allNames.map(function (name) {
    var pts = smap[name].slice();
    // Sort chronologically
    pts.sort(function (a, b) { return new Date(a.date) - new Date(b.date); });
    var avg = Math.round(10 * pts.reduce(function (a, p) { return a + p.n20; }, 0) / pts.length) / 10;
    var last3 = pts.slice(-3);
    var hasTrend3 = last3.length >= 2;
    var delta3 = hasTrend3 ? Math.round((last3[last3.length - 1].n20 - last3[0].n20) * 10) / 10 : 0;
    
    var category = 'single';
    var cardClass = 'suivi-student-card suivi-card-neutral';
    var pillClass = 'suivi-trend-pill trend-pill-single';
    var pillText = 'ℹ️ 1ère note';
    var strokeColor = '#007AFF';

    if (hasTrend3) {
      if (delta3 <= -1.5) {
        category = 'drop';
        cardClass = 'suivi-student-card suivi-card-drop';
        pillClass = 'suivi-trend-pill trend-pill-drop-strong';
        pillText = '⚠️ Chute significative (' + (delta3 > 0 ? '+' : '') + delta3 + ' pts sur ' + last3.length + ' évals)';
        strokeColor = '#FF3B30';
      } else if (delta3 >= 1.5) {
        category = 'rise';
        cardClass = 'suivi-student-card suivi-card-rise';
        pillClass = 'suivi-trend-pill trend-pill-rise-strong';
        pillText = '📈 Forte hausse (+' + delta3 + ' pts sur ' + last3.length + ' évals)';
        strokeColor = '#34C759';
      } else if (delta3 >= 0.5) {
        category = 'stable';
        cardClass = 'suivi-student-card suivi-card-neutral';
        pillClass = 'suivi-trend-pill trend-pill-rise-mod';
        pillText = '↗️ En hausse (+' + delta3 + ' pts)';
        strokeColor = '#34C759';
      } else if (delta3 <= -0.5) {
        category = 'stable';
        cardClass = 'suivi-student-card suivi-card-neutral';
        pillClass = 'suivi-trend-pill trend-pill-drop-mod';
        pillText = '↘️ En baisse (' + delta3 + ' pts)';
        strokeColor = '#FF9500';
      } else {
        category = 'stable';
        cardClass = 'suivi-student-card suivi-card-neutral';
        pillClass = 'suivi-trend-pill trend-pill-stable';
        pillText = '➡️ Stable (' + (delta3 >= 0 ? '+' : '') + delta3 + ' pts)';
        strokeColor = '#007AFF';
      }
    }

    return {
      name: name,
      pts: pts,
      last3: last3,
      avg: avg,
      hasTrend3: hasTrend3,
      delta3: delta3,
      category: category,
      cardClass: cardClass,
      pillClass: pillClass,
      pillText: pillText,
      strokeColor: strokeColor
    };
  });

  // Global counts
  var countTotal = studentData.length;
  var countDrop = studentData.filter(function (s) { return s.category === 'drop'; }).length;
  var countRise = studentData.filter(function (s) { return s.category === 'rise'; }).length;
  var countStable = studentData.filter(function (s) { return s.category === 'stable' || s.category === 'single'; }).length;

  // Filter studentData according to search query and selected filter
  var filtered = studentData.filter(function (s) {
    if (q && s.name.toLowerCase().indexOf(q.toLowerCase()) < 0) return false;
    if (_suiviFilter === 'drop') return s.category === 'drop';
    if (_suiviFilter === 'rise') return s.category === 'rise';
    if (_suiviFilter === 'stable') return s.category === 'stable' || s.category === 'single';
    return true;
  });

  // KPI summary block HTML
  var kpiHtml = '<div class="suivi-kpi-grid">' +
    '<div class="suivi-kpi-card"><div class="suivi-kpi-val">' + countTotal + '</div><div class="suivi-kpi-lbl">Élèves suivis</div></div>' +
    '<div class="suivi-kpi-card" style="border-color:rgba(255,59,48,0.3)"><div class="suivi-kpi-val kpi-drop">' + countDrop + '</div><div class="suivi-kpi-lbl" style="color:var(--red)">⚠️ En chute (≥1.5 pt)</div></div>' +
    '<div class="suivi-kpi-card" style="border-color:rgba(52,199,89,0.3)"><div class="suivi-kpi-val kpi-rise">' + countRise + '</div><div class="suivi-kpi-lbl" style="color:var(--green-dark)">📈 En forte hausse</div></div>' +
    '<div class="suivi-kpi-card"><div class="suivi-kpi-val">' + countStable + '</div><div class="suivi-kpi-lbl">Stables / Autres</div></div>' +
    '</div>';

  // Filter tabs HTML
  var filterHtml = '<div class="suivi-filter-tabs">' +
    '<button class="suivi-filter-btn ' + (_suiviFilter === 'all' ? 'active' : '') + '" onclick="setSuiviFilter(\'all\')">Tous <span class="suivi-badge-count">' + countTotal + '</span></button>' +
    '<button class="suivi-filter-btn filter-drop ' + (_suiviFilter === 'drop' ? 'active' : '') + '" onclick="setSuiviFilter(\'drop\')">⚠️ Chute significative <span class="suivi-badge-count">' + countDrop + '</span></button>' +
    '<button class="suivi-filter-btn filter-rise ' + (_suiviFilter === 'rise' ? 'active' : '') + '" onclick="setSuiviFilter(\'rise\')">📈 Forte hausse <span class="suivi-badge-count">' + countRise + '</span></button>' +
    '<button class="suivi-filter-btn ' + (_suiviFilter === 'stable' ? 'active' : '') + '" onclick="setSuiviFilter(\'stable\')">➡️ Stables / Autres <span class="suivi-badge-count">' + countStable + '</span></button>' +
    '</div>';

  if (!filtered.length) {
    el.innerHTML = kpiHtml + filterHtml + '<div class="empty-state"><span class="ei">🔍</span><p>Aucun élève dans cette catégorie</p><small>' + (q ? 'Aucun résultat pour "' + escH(q) + '"' : 'Aucun élève ne correspond au filtre actif') + '</small></div>';
    return;
  }

  var listHtml = filtered.map(function (s) {
    var pts = s.pts;
    var w = 220, h = 50, pad = 10;
    var vals = pts.map(function (p) { return p.n20; });
    var mn = Math.min.apply(null, vals), mx = Math.max.apply(null, vals);
    var rng = mx - mn || 1;
    var points = vals.map(function (v, i) {
      var x = pad + (i / (Math.max(vals.length - 1, 1))) * (w - 2 * pad);
      var y = pad + ((mx - v) / rng) * (h - 2 * pad);
      return x + ',' + y;
    }).join(' ');

    var startIndex3 = Math.max(0, pts.length - 3);
    var dots = vals.map(function (v, i) {
      var x = pad + (i / (Math.max(vals.length - 1, 1))) * (w - 2 * pad);
      var y = pad + ((mx - v) / rng) * (h - 2 * pad);
      var isLast3 = i >= startIndex3;
      var col = isLast3 ? s.strokeColor : (v >= 10 ? '#34C759' : v >= 8 ? '#FF9500' : '#FF3B30');
      var r = isLast3 ? '4' : '3';
      return '<circle cx="' + x + '" cy="' + y + '" r="' + r + '" fill="' + col + '" stroke="white" stroke-width="' + (isLast3 ? '1.5' : '1') + '"/>';
    }).join('');

    return '<div class="' + s.cardClass + '">' +
      '<div style="display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:.6rem;margin-bottom:.75rem">' +
      '<div>' +
      '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:4px">' +
      '<span style="font-weight:700;font-size:.92rem;letter-spacing:-0.015em">' + escH(s.name) + '</span>' +
      '<span class="' + s.pillClass + '">' + s.pillText + '</span>' +
      '</div>' +
      '<div style="font-size:.73rem;color:var(--inkl)">' +
      pts.length + ' évaluation' + (pts.length > 1 ? 's' : '') + ' · Moyenne globale : <strong>' + s.avg + '/20</strong>' +
      (s.hasTrend3 ? ' · <span style="color:var(--inkm)">Évolution 3 dernières évals : <strong style="color:' + s.strokeColor + '">' + (s.delta3 > 0 ? '+' : '') + s.delta3 + ' pts</strong></span>' : '') +
      '</div>' +
      '</div>' +
      (vals.length > 1 ? '<svg width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '" class="chart-svg" style="flex-shrink:0"><polyline points="' + points + '" fill="none" stroke="' + s.strokeColor + '" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>' + dots + '</svg>' : '') +
      '</div>' +
      '<div style="display:flex;flex-direction:column;gap:5px;background:var(--fill2);padding:8px 10px;border-radius:8px">' +
      pts.map(function (p, idx) {
        var isLast3 = idx >= startIndex3;
        var col = p.n20 >= 10 ? 'var(--green-dark)' : p.n20 >= 8 ? 'var(--orange)' : 'var(--red)';
        var d = new Date(p.date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: '2-digit' });
        return '<div style="display:flex;align-items:center;gap:8px;font-size:.76rem;' + (isLast3 ? 'font-weight:500' : 'opacity:0.85') + '">' +
          '<span style="color:var(--inkl);min-width:68px;font-family:var(--font-mono);font-size:.72rem">' + d + '</span>' +
          '<span style="color:var(--inkm);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + escH(p.matiere) + '</span>' +
          (isLast3 ? '<span style="font-size:.65rem;background:var(--bg-primary);padding:1px 5px;border-radius:4px;color:var(--inkl);font-weight:600">3 dernières</span>' : '') +
          '<span style="margin-left:auto;font-weight:700;font-family:var(--font-mono);color:' + col + '">' + p.note + '/' + p.total + ' (' + p.n20 + '/20)</span>' +
          '</div>';
      }).join('') +
      '</div></div>';
  }).join('');

  el.innerHTML = kpiHtml + filterHtml + listHtml;
}

/* ── HISTORIQUE ── */
function loadHistEval(id) {
  var ev = DB.evals.find(function (e) { return e.id === id; });
  if (!ev) return;
  ST.students = (ev.students || []).map(function (s) {
    return { name: s.name, status: s.status || 'ok', result: s.result };
  });
  ST.teacherComments = ev.teacherComments || '';
  var en = document.getElementById('evalName');
  if (en) en.value = ev.matiere || ev.name || '';
  var tc = document.getElementById('teacherEvalComments');
  if (tc) tc.value = ST.teacherComments;
  var b = document.getElementById('teacherNotesSavedBadge');
  if (b) b.style.display = (ST.teacherComments && ST.teacherComments.trim()) ? 'inline-block' : 'none';

  ['vf', 'vl', 'vclasses', 'vsuivi', 'vcompare', 'vhist'].forEach(function (x) {
    var el = document.getElementById(x);
    if (el) el.style.display = 'none';
  });
  document.getElementById('vr').style.display = 'block';
  renderResults();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function renderHistList() {
  var el = document.getElementById('histList');
  var em = document.getElementById('histEmpty');
  var hs = document.getElementById('histStats');
  if (!el) return;
  if (!DB.evals.length) {
    if (em) em.style.display = 'block';
    el.innerHTML = '';
    if (hs) hs.innerHTML = '';
    _cmpSel = [];
    document.getElementById('cmpBtn').style.display = 'none';
    return;
  }
  if (em) em.style.display = 'none';
  var tot = DB.evals.reduce(function (a, e) { return a + e.nb; }, 0);
  var avgs = DB.evals.filter(function (e) { return e.avg != null; });
  var ga = avgs.length ? Math.round(10 * avgs.reduce(function (a, e) { return a + e.avg; }, 0) / avgs.length) / 10 : null;
  if (hs) hs.innerHTML = '<div class="sg2" style="margin-bottom:.85rem"><div class="sc2"><div class="sv2">' + DB.evals.length + '</div><div class="slb2">Évaluations</div></div><div class="sc2"><div class="sv2">' + tot + '</div><div class="slb2">Copies</div></div><div class="sc2"><div class="sv2">' + (ga !== null ? ga + '/20' : '—') + '</div><div class="slb2">Moy. générale</div></div></div>';
  el.innerHTML = DB.evals.map(function (ev) {
    var sel = _cmpSel.indexOf(ev.id) >= 0;
    var d = new Date(ev.ts);
    var hasNotes = ev.teacherComments && ev.teacherComments.trim().length > 0;
    return '<div class="hi" style="flex-wrap:nowrap;border-color:' + (sel ? 'var(--a)' : 'var(--b)') + ';cursor:pointer" onclick="loadHistEval(' + ev.id + ')">' +
      '<input type="checkbox" style="flex-shrink:0;cursor:pointer;accent-color:var(--a)" ' + (sel ? 'checked' : '') + ' onclick="event.stopPropagation()" onchange="toggleCmp(' + ev.id + ',this.checked)" title="Sélectionner pour comparer">' +
      '<div style="min-width:44px;text-align:center"><div style="font-family:Georgia,serif;font-size:1.05rem;font-weight:600;line-height:1">' + (ev.avg !== null && ev.avg !== undefined ? ev.avg : '—') + '</div><div style="font-size:.62rem;color:var(--inkl)">' + (ev.avg !== null && ev.avg !== undefined ? '/20' : '') + '</div></div>' +
      '<div style="width:.5px;background:var(--b);align-self:stretch;flex-shrink:0"></div>' +
      '<div style="flex:1;min-width:0"><div style="font-weight:500;font-size:.79rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + escH(ev.name) + (hasNotes ? ' <span title="Observations enseignant enregistrées" style="font-size:.75rem">✍️</span>' : '') + '</div><div style="font-size:.68rem;color:var(--inkl)">' + ev.nb + ' élève' + (ev.nb > 1 ? 's' : '') + ' · ' + d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: '2-digit' }) + '</div></div>' +
      '<button onclick="event.stopPropagation();delEval(' + ev.id + ',event)" style="background:none;border:none;cursor:pointer;color:var(--inkl);font-size:13px;padding:2px 4px;flex-shrink:0">🗑</button>' +
      '</div>';
  }).join('');
}

function toggleCmp(id, checked) {
  if (checked) { if (_cmpSel.length < 2) _cmpSel.push(id); }
  else { _cmpSel = _cmpSel.filter(function (x) { return x !== id; }); }
  document.getElementById('cmpBtn').style.display = _cmpSel.length === 2 ? 'inline-flex' : 'none';
  renderHistList();
}

function delEval(id, e) {
  e.stopPropagation();
  if (!confirm('Supprimer cette évaluation ?')) return;
  DB.evals = DB.evals.filter(function (ev) { return ev.id !== id; });
  _cmpSel = _cmpSel.filter(function (x) { return x !== id; });
  saveDB();
  upBadge();
  renderHistList();
}

function compareSelected() {
  if (_cmpSel.length !== 2) return;
  var ev1 = DB.evals.find(function (e) { return e.id === _cmpSel[0]; });
  var ev2 = DB.evals.find(function (e) { return e.id === _cmpSel[1]; });
  if (!ev1 || !ev2) return;
  var vc = document.getElementById('vcompare');
  var cc = document.getElementById('compareContent');
  var names = Array.from(new Set([].concat(
    ev1.students.map(function (s) { return s.name; }),
    ev2.students.map(function (s) { return s.name; })
  ))).sort();
  function findScore(ev, name) {
    var s = ev.students.find(function (s) { return s.name === name; });
    if (!s || !s.result || s.result.note_total == null) return null;
    return Math.round((s.result.note_obtenue / s.result.note_total) * 200) / 10;
  }
  cc.innerHTML = '<div style="display:flex;gap:.7rem;margin-bottom:.85rem;flex-wrap:wrap">' +
    '<div style="flex:1;background:var(--pd);border-radius:var(--rad);padding:.65rem .85rem"><div style="font-size:.7rem;color:var(--inkl);margin-bottom:2px">Évaluation A</div><div style="font-weight:600;font-size:.85rem">' + escH(ev1.name) + '</div></div>' +
    '<div style="flex:1;background:var(--pd);border-radius:var(--rad);padding:.65rem .85rem"><div style="font-size:.7rem;color:var(--inkl);margin-bottom:2px">Évaluation B</div><div style="font-weight:600;font-size:.85rem">' + escH(ev2.name) + '</div></div>' +
    '</div>' +
    '<div style="overflow-x:auto"><table class="cmp-table">' +
    '<thead><tr><th>Élève</th><th>Éval. A /20</th><th>Éval. B /20</th><th>Évolution</th></tr></thead>' +
    '<tbody>' + names.map(function (name) {
      var s1 = findScore(ev1, name), s2 = findScore(ev2, name);
      var diff = s1 !== null && s2 !== null ? Math.round((s2 - s1) * 10) / 10 : null;
      var diffStr = diff === null ? '—' : diff > 0 ? '<span class="cmp-up">▲ +' + diff + '</span>' : diff < 0 ? '<span class="cmp-down">▼ ' + diff + '</span>' : '<span class="cmp-same">= stable</span>';
      return '<tr><td style="font-weight:500">' + escH(name) + '</td><td>' + (s1 !== null ? s1 : '-') + '</td><td>' + (s2 !== null ? s2 : '-') + '</td><td>' + diffStr + '</td></tr>';
    }).join('') +
    '</tbody></table></div>';
  vc.style.display = 'block';
  setTimeout(function () { vc.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 100);
}

/* -- EDIT MODE -- */
function enterEdit(idx) {
  var be = document.getElementById('btn-edit'), bs = document.getElementById('btn-save');
  if (be) be.style.display = 'none';
  if (bs) bs.style.display = 'inline-flex';
  document.querySelectorAll('.modal-cmt,.modal-apprec').forEach(function (el) {
    el.contentEditable = 'true';
    el.style.cssText = 'border:.5px solid var(--a);border-radius:5px;padding:3px 6px;background:rgba(45,106,79,.06);outline:none;display:block;min-height:1.2em';
  });
  var first = document.querySelector('.modal-apprec,.modal-cmt');
  if (first) first.focus();
}

function saveEdits(idx) {
  var s = ST.students[idx];
  if (!s || !s.result) return;
  var ap = document.querySelector('.modal-apprec');
  if (ap) {
    s.result.appreciation = ap.innerText.trim();
    ap.contentEditable = 'false';
    ap.style.cssText = '';
  }
  document.querySelectorAll('.modal-cmt').forEach(function (el, i) {
    if (s.result.questions && s.result.questions[i]) s.result.questions[i].commentaire = el.innerText.trim();
    el.contentEditable = 'false';
    el.style.cssText = '';
  });
  var be = document.getElementById('btn-edit'), bs = document.getElementById('btn-save');
  if (bs) bs.style.display = 'none';
  if (be) {
    be.style.display = 'inline-flex';
    be.innerHTML = '✅ Sauvegardé';
    be.style.background = 'var(--al)';
    be.style.color = 'var(--ah)';
    setTimeout(function () {
      if (be) {
        be.innerHTML = '✏️ Modifier';
        be.style.background = '';
        be.style.color = '';
      }
    }, 2000);
  }
}

/* -- FICHE RETOUR ELEVE -- */
function printStudentSheet(idx) {
  var s = ST.students[idx];
  if (!s || !s.result) return;
  var d = s.result;
  var ap = document.querySelector('.modal-apprec');
  var apText = ap ? ap.innerText.trim() : (d.appreciation || '');
  var no = d.note_total != null ? ((d.note_obtenue !== undefined ? d.note_obtenue : '?') + ' / ' + d.note_total) : '—';
  var n20 = d.note_total ? Math.round(d.note_obtenue / d.note_total * 200) / 10 + '/20' : '—';
  var rows = (d.questions || []).map(function (q, i) {
    var cmtEl = document.querySelectorAll('.modal-cmt')[i];
    var cmt = cmtEl ? cmtEl.innerText.trim() : (q.commentaire || '');
    var p = q.points_total ? Math.round((q.points_obtenus / q.points_total) * 100) : 50;
    var col = p >= 99 ? '#2d6a4f' : p >= 50 ? '#b5860d' : '#c0392b';
    return '<tr style="border-bottom:.5px solid #eee;vertical-align:top">' +
      '<td style="padding:.42rem .6rem;font-size:.8rem;font-weight:500">' + (i + 1) + '. ' + escH(q.titre || '') + '</td>' +
      '<td style="padding:.42rem .6rem;font-size:.77rem;color:#555">' + escH(q.reponse_eleve || '—') + '</td>' +
      '<td style="padding:.42rem .6rem;font-size:.77rem;color:#555">' + escH(q.attendu || '—') + '</td>' +
      '<td style="padding:.42rem .6rem;text-align:center;font-weight:700;color:' + col + '">' + (q.points_total != null ? q.points_obtenus + '/' + q.points_total : '—') + '</td>' +
      '<td style="padding:.42rem .6rem;font-size:.74rem;color:#666;font-style:italic">' + escH(cmt) + '</td>' +
      '</tr>';
  }).join('');
  document.getElementById('pz').innerHTML =
    '<div style="font-family:sans-serif;max-width:700px;margin:0 auto;padding:1.5rem 2rem;color:#1a1a2e">' +
    '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:1rem;border-bottom:2px solid #1a1a2e;padding-bottom:1rem;margin-bottom:1.25rem">' +
    '<div><h1 style="font-size:1.3rem;font-weight:700;margin-bottom:4px">' + escH(s.name) + '</h1>' +
    '<p style="font-size:.8rem;color:#666">' + escH(d.matiere || '') + ' — ' + escH(d.niveau || '') + '</p>' +
    '<p style="font-size:.73rem;color:#999">' + new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' }) + '</p></div>' +
    '<div style="text-align:center;background:#1a1a2e;color:white;border-radius:12px;padding:.8rem 1.25rem;flex-shrink:0">' +
    '<div style="font-size:.63rem;text-transform:uppercase;opacity:.5;margin-bottom:4px">Note</div>' +
    '<div style="font-size:1.9rem;font-weight:700;line-height:1">' + no + '</div>' +
    '<div style="font-size:.7rem;opacity:.55;margin-top:3px">' + n20 + '</div></div></div>' +
    '<table style="width:100%;border-collapse:collapse;font-size:.82rem;margin-bottom:1.25rem">' +
    '<thead><tr style="background:#f0ece3">' +
    '<th style="text-align:left;padding:.42rem .6rem;font-weight:600;font-size:.71rem">Question</th>' +
    '<th style="text-align:left;padding:.42rem .6rem;font-weight:600;font-size:.71rem">Votre réponse</th>' +
    '<th style="text-align:left;padding:.42rem .6rem;font-weight:600;font-size:.71rem">Réponse attendue</th>' +
    '<th style="text-align:center;padding:.42rem .6rem;font-weight:600;font-size:.71rem">Points</th>' +
    '<th style="text-align:left;padding:.42rem .6rem;font-weight:600;font-size:.71rem">Commentaire</th>' +
    '</tr></thead><tbody>' + rows + '</tbody></table>' +
    (apText ? '<div style="background:#e8f4ee;border-radius:8px;padding:.82rem 1rem;font-size:.82rem;color:#1b4332;line-height:1.7"><strong>Appréciation :</strong> ' + escH(apText) + '</div>' : '') +
    '</div>';
  window.print();
}

/* ── NOTE MAX & INSTRUCTIONS ── */
var _noteMax = 'auto';

function setNote(val) {
  _noteMax = val;
  document.querySelectorAll('.note-chip').forEach(function (el) {
    el.classList.toggle('on', el.getAttribute('data-val') === val);
  });
  document.getElementById('noteCustomWrap').style.display = val === 'custom' ? 'block' : 'none';
}

function getNoteMax() {
  if (_noteMax === 'auto') return 'Détecte automatiquement la note maximale depuis la copie (généralement /10, /20, /50 ou /100).';
  if (_noteMax === 'custom') {
    var v = (document.getElementById('noteCustomVal') || {}).value;
    return v ? 'La note maximale est sur ' + v + '.' : 'Détecte automatiquement la note maximale.';
  }
  return 'La note maximale est sur ' + _noteMax + '. Assure-toi que note_total=' + _noteMax + ' dans le JSON.';
}

function swInstr(t) {
  document.getElementById('itab-rules').classList.toggle('on', t === 'rules');
  document.getElementById('itab-custom').classList.toggle('on', t === 'custom');
  document.getElementById('iview-rules').style.display = t === 'rules' ? 'block' : 'none';
  document.getElementById('iview-custom').style.display = t === 'custom' ? 'block' : 'none';
}

function getCorrInstr() {
  var QR = [
    'Ne pas pénaliser les fautes d orthographe',
    'Accepter les réponses partiellement correctes (demi-point possible)',
    'Appliquer un barème strict sans interprétation',
    'Appréciation bienveillante et encourageante',
    'La présentation et la mise en page sont prises en compte',
    'Accepter les synonymes et formulations équivalentes',
    'La démarche compte même si le résultat final est faux',
    'Ne pas pénaliser les erreurs de calcul si la méthode est correcte'
  ];
  var rules = [];
  for (var i = 1; i <= 8; i++) {
    var el = document.getElementById('qr' + i);
    if (el && el.checked) rules.push('- ' + QR[i - 1]);
  }
  var custom = (document.getElementById('corrInstr') || {}).value || '';
  var out = '';
  if (rules.length) out += 'RÈGLES DE CORRECTION IMPOSÉES :\n' + rules.join('\n');
  if (custom.trim()) out += (out ? '\n\n' : '') + 'INSTRUCTIONS SPÉCIFIQUES DE L ENSEIGNANT :\n' + custom.trim();
  return out;
}

/* ── DARK MODE ── */
function toggleDark() {
  var isDark = document.body.classList.toggle('dark');
  document.getElementById('darkToggle').textContent = isDark ? '☀️' : '🌙';
  try { localStorage.setItem('cpro_dark', isDark ? '1' : '0'); } catch (e) {}
}
function initDark() {
  try {
    var pref = localStorage.getItem('cpro_dark');
    if (pref === '1' || (pref === null && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      document.body.classList.add('dark');
      document.getElementById('darkToggle').textContent = '☀️';
    }
  } catch (e) {}
}

/* ── TIME ESTIMATE ── */
function updateTimeEst() {
  var n = ST.uploadMode === 'pdf' ? 10 : ST.students.length;
  var el = document.getElementById('timeEst');
  var val = document.getElementById('timeEstVal');
  if (!el || !val) return;
  if (n === 0) { el.style.display = 'none'; return; }
  var batches = Math.ceil(n / 3);
  var secs = batches * 22;
  var str = '';
  if (secs < 60) str = '~' + secs + ' secondes';
  else if (secs < 120) str = '~1 min';
  else str = '~' + Math.round(secs / 60) + ' min';
  str += ' pour ' + n + ' copie' + (n > 1 ? 's' : '');
  if (n > 20) str += ' ☕';
  val.textContent = str;
  el.style.display = 'block';
}

/* ── PRINT ALL SHEETS ── */
function printAllSheets() {
  var ok = ST.students.filter(function (s) { return s.status === 'ok' && s.result; });
  if (!ok.length) return;
  var pages = ok.map(function (s) {
    var d = s.result;
    var no = d.note_total != null ? ((d.note_obtenue !== undefined ? d.note_obtenue : '?') + ' / ' + d.note_total) : '—';
    var n20 = d.note_total ? Math.round(d.note_obtenue / d.note_total * 200) / 10 + '/20' : '—';
    var evalN = (document.getElementById('evalName') || {}).value || '';
    var rows = (d.questions || []).map(function (q, i) {
      var p = q.points_total ? Math.round((q.points_obtenus / q.points_total) * 100) : 50;
      var col = p >= 99 ? '#2d6a4f' : p >= 50 ? '#b5860d' : '#c0392b';
      return '<tr style="border-bottom:.5px solid #eee;vertical-align:top">' +
        '<td style="padding:.38rem .55rem;font-size:.78rem;font-weight:500">' + (i + 1) + '. ' + escH(q.titre || '') + '</td>' +
        '<td style="padding:.38rem .55rem;font-size:.75rem;color:#555">' + escH(q.reponse_eleve || '—') + '</td>' +
        '<td style="padding:.38rem .55rem;font-size:.75rem;color:#555">' + escH(q.attendu || '—') + '</td>' +
        '<td style="padding:.38rem .55rem;text-align:center;font-weight:700;font-size:.78rem;color:' + col + '">' + (q.points_total != null ? q.points_obtenus + '/' + q.points_total : '—') + '</td>' +
        '<td style="padding:.38rem .55rem;font-size:.72rem;color:#666;font-style:italic">' + escH(q.commentaire || '') + '</td>' +
        '</tr>';
    }).join('');
    return '<div style="page-break-after:always;font-family:sans-serif;max-width:680px;margin:0 auto;padding:1.25rem 1.75rem;color:#1a1a2e">' +
      '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:1rem;border-bottom:2px solid #1a1a2e;padding-bottom:.85rem;margin-bottom:1rem">' +
      '<div>' +
      '<h2 style="font-size:1.15rem;font-weight:700;margin-bottom:3px">' + escH(s.name) + '</h2>' +
      (evalN ? '<p style="font-size:.78rem;font-weight:500;color:#333;margin-bottom:2px">' + escH(evalN) + '</p>' : '') +
      '<p style="font-size:.75rem;color:#666">' + escH(d.matiere || '') + ' — ' + escH(d.niveau || '') + '</p>' +
      '<p style="font-size:.7rem;color:#999">' + new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' }) + '</p>' +
      '</div>' +
      '<div style="text-align:center;background:#1a1a2e;color:white;border-radius:10px;padding:.7rem 1.1rem;flex-shrink:0">' +
      '<div style="font-size:.6rem;text-transform:uppercase;opacity:.5;margin-bottom:3px">Note</div>' +
      '<div style="font-size:1.75rem;font-weight:700;line-height:1">' + no + '</div>' +
      '<div style="font-size:.67rem;opacity:.55;margin-top:2px">' + n20 + '</div></div></div>' +
      '<table style="width:100%;border-collapse:collapse;font-size:.8rem;margin-bottom:1rem">' +
      '<thead><tr style="background:#f0ece3">' +
      '<th style="text-align:left;padding:.38rem .55rem;font-weight:600;font-size:.69rem">Question</th>' +
      '<th style="text-align:left;padding:.38rem .55rem;font-weight:600;font-size:.69rem">Votre réponse</th>' +
      '<th style="text-align:left;padding:.38rem .55rem;font-weight:600;font-size:.69rem">Réponse attendue</th>' +
      '<th style="text-align:center;padding:.38rem .55rem;font-weight:600;font-size:.69rem">Points</th>' +
      '<th style="text-align:left;padding:.38rem .55rem;font-weight:600;font-size:.69rem">Commentaire</th>' +
      '</tr></thead><tbody>' + rows + '</tbody></table>' +
      (d.appreciation ? '<div style="background:#e8f4ee;border-radius:7px;padding:.7rem .9rem;font-size:.79rem;color:#1b4332;line-height:1.65"><strong>Appréciation :</strong> ' + escH(d.appreciation) + '</div>' : '') +
      '</div>';
  }).join('');
  document.getElementById('pz').innerHTML = pages;
  window.print();
}

/* ── TUTORIAL TOGGLE ── */
var _tutoOpen = false;
function toggleTuto() {
  _tutoOpen = !_tutoOpen;
  var body = document.getElementById('tutoBody');
  var arrow = document.getElementById('tutoArrow');
  if (body) body.classList.toggle('show', _tutoOpen);
  if (arrow) arrow.classList.toggle('open', _tutoOpen);
  try { localStorage.setItem('cpro_tuto', _tutoOpen ? '1' : '0'); } catch (e) {}
}
function initTuto() {
  try {
    var pref = localStorage.getItem('cpro_tuto');
    if (pref === null || pref === '1') {
      _tutoOpen = true;
      var body = document.getElementById('tutoBody');
      var arrow = document.getElementById('tutoArrow');
      if (body) body.classList.add('show');
      if (arrow) arrow.classList.add('open');
    }
  } catch (e) {}
}

/* ── LEADS & CONTACTS MANAGEMENT ── */
async function fetchRemoteLeads() {
  try {
    var targetUrl = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_BACKEND_URL)
      ? import.meta.env.VITE_BACKEND_URL + '/api/leads'
      : '/api/leads';

    var res = await fetch(targetUrl);
    if (res.ok) {
      var data = await res.json();
      if (data.leads && Array.isArray(data.leads)) {
        // Merge without duplicating
        if (!DB.leads) DB.leads = [];
        var localMap = {};
        DB.leads.forEach(function (l) {
          var key = (l.email || '') + '|' + (l.whatsapp || '');
          localMap[key] = true;
        });

        data.leads.forEach(function (r) {
          var key = (r.email || '') + '|' + (r.whatsapp || '');
          if (!localMap[key]) {
            DB.leads.push(r);
            localMap[key] = true;
          }
        });
        saveDB();
      }
    }
  } catch (e) {
    console.warn('Silent fallback for remote leads:', e);
  }
}

function refreshLeadsList() {
  fetchRemoteLeads().then(function () {
    renderLeadsList();
  });
}

function renderLeadsList() {
  var list = DB.leads || [];
  var totalEl = document.getElementById('leadStatTotal');
  var emailsEl = document.getElementById('leadStatEmails');
  var waEl = document.getElementById('leadStatWhatsapp');
  var emptyEl = document.getElementById('leadsEmpty');
  var tableEl = document.getElementById('leadsTableWrap');
  var tbody = document.getElementById('leadsTableBody');

  var total = list.length;
  var withEmail = list.filter(function (l) { return Boolean(l.email); }).length;
  var withWa = list.filter(function (l) { return Boolean(l.whatsapp); }).length;

  if (totalEl) totalEl.textContent = total;
  if (emailsEl) emailsEl.textContent = withEmail;
  if (waEl) waEl.textContent = withWa;

  if (total === 0) {
    if (emptyEl) emptyEl.style.display = 'block';
    if (tableEl) tableEl.style.display = 'none';
    return;
  }

  if (emptyEl) emptyEl.style.display = 'none';
  if (tableEl) tableEl.style.display = 'block';

  if (tbody) {
    tbody.innerHTML = list.map(function (lead, idx) {
      var dt = lead.createdAt ? new Date(lead.createdAt).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-';
      var emailLink = lead.email ? '<a href="mailto:' + escH(lead.email) + '" style="color:var(--blue);text-decoration:none;font-weight:500">✉️ ' + escH(lead.email) + '</a>' : '<span style="color:var(--label3)">-</span>';
      
      var waClean = lead.whatsapp ? lead.whatsapp.replace(/[^0-9+]/g, '') : '';
      var waLink = lead.whatsapp ? '<a href="https://wa.me/' + encodeURIComponent(waClean.replace('+', '')) + '" target="_blank" rel="noreferrer" style="color:var(--green-dark);background:var(--green-light);padding:3px 8px;border-radius:6px;text-decoration:none;font-weight:600;font-size:12px;display:inline-flex;align-items:center;gap:4px">💬 ' + escH(lead.whatsapp) + '</a>' : '<span style="color:var(--label3)">-</span>';

      return '<tr style="border-bottom:1px solid var(--separator);transition:background .15s" onmouseover="this.style.background=\'var(--fill3)\'" onmouseout="this.style.background=\'transparent\'">' +
        '<td style="padding:10px 14px;color:var(--label2);font-size:12px">' + dt + '</td>' +
        '<td style="padding:10px 14px;font-weight:600;color:var(--label)">' + escH(lead.name || 'Enseignant anonyme') + '</td>' +
        '<td style="padding:10px 14px">' + emailLink + '</td>' +
        '<td style="padding:10px 14px">' + waLink + '</td>' +
        '<td style="padding:10px 14px;color:var(--label2)">' + escH(lead.school || '-') + '</td>' +
        '<td style="padding:10px 14px;text-align:right">' +
          '<button onclick="delLead(' + idx + ')" style="background:transparent;border:none;color:var(--red);cursor:pointer;font-size:13px;padding:4px 8px;border-radius:6px" title="Supprimer">🗑️</button>' +
        '</td>' +
      '</tr>';
    }).join('');
  }
}

function delLead(idx) {
  if (confirm('Voulez-vous supprimer ce contact de la liste ?')) {
    DB.leads.splice(idx, 1);
    saveDB();
    renderLeadsList();
  }
}

function exportLeadsCSV() {
  var list = DB.leads || [];
  if (list.length === 0) {
    alert('Aucun contact à exporter.');
    return;
  }

  var headers = ['Date', 'Nom', 'Email', 'WhatsApp', 'Etablissement'];
  var rows = list.map(function (l) {
    return [
      l.createdAt || '',
      '"' + (l.name || '').replace(/"/g, '""') + '"',
      '"' + (l.email || '').replace(/"/g, '""') + '"',
      '"' + (l.whatsapp || '').replace(/"/g, '""') + '"',
      '"' + (l.school || '').replace(/"/g, '""') + '"'
    ].join(';');
  });

  var csvContent = '\uFEFF' + headers.join(';') + '\n' + rows.join('\n');
  var blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = 'contacts_enseignants_' + new Date().toISOString().slice(0, 10) + '.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Expose all functions to global window for inline event handlers
window.init = init;
window.toggleDark = toggleDark;
window.gNav = gNav;
window.toggleTuto = toggleTuto;
window.setUploadMode = setUploadMode;
window.dg = dg;
window.dp0 = dp0;
window.dpPDF = dpPDF;
window.dpRefB = dpRefB;
window.af = af;
window.afPDF = afPDF;
window.rmPDFClass = rmPDFClass;
window.loadClassStudents = loadClassStudents;
window.togM = togM;
window.addCM = addCM;
window.rmM = rmM;
window.setN = setN;
window.setNote = setNote;
window.setM = setM;
window.loadRefB = loadRefB;
window.rmRefB = rmRefB;
window.swInstr = swInstr;
window.sub = sub;
window.submitLeadCapture = submitLeadCapture;
window.openLeadGateModal = openLeadGateModal;
window.closeLeadGateModal = closeLeadGateModal;
window.refreshLeadsList = refreshLeadsList;
window.renderLeadsList = renderLeadsList;
window.delLead = delLead;
window.exportLeadsCSV = exportLeadsCSV;
window.back = back;
window.exportCSV = exportCSV;
window.printClass = printClass;
window.printAllSheets = printAllSheets;
window.sav = sav;
window.showNewClass = showNewClass;
window.saveNewClass = saveNewClass;
window.editClass = editClass;
window.delClass = delClass;
window.updateStudent = updateStudent;
window.removeStudent = removeStudent;
window.addStudent = addStudent;
window.renderSuivi = renderSuivi;
window.compareSelected = compareSelected;
window.toggleCmp = toggleCmp;
window.delEval = delEval;
window.showDetail = showDetail;
window.closeModal = closeModal;
window.enterEdit = enterEdit;
window.saveEdits = saveEdits;
window.swTab = swTab;
window.printOne = printOne;
window.printStudentSheet = printStudentSheet;
window.rmStudent = rmStudent;
window.ST = ST;
window.updateTimeEst = updateTimeEst;
window.retryStudent = retryStudent;
window.onTeacherCommentsInput = onTeacherCommentsInput;
window.loadHistEval = loadHistEval;
window.setSuiviFilter = setSuiviFilter;
window.exportEvaluationPDF = exportEvaluationPDF;
window.exportStudentBulletinPDF = exportStudentBulletinPDF;
window.exportStudentSheetPDF = exportStudentSheetPDF;
window.openStudentDashboard = openStudentDashboard;
window.printStudentBulletin = printStudentBulletin;
window.getAllStudentEvaluations = getAllStudentEvaluations;
window.getStudentMetrics = getStudentMetrics;
window.renderClassList = renderClassList;

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
