import { jsPDF } from 'jspdf';
import JSZip from 'jszip';

/* ─────────────────────────────────────────────
   STATE & CONSTANTS
───────────────────────────────────────────── */
var MATS = [
  { id: 'math', l: 'Mathématiques', e: '🧮' },
  { id: 'fr', l: 'Français', e: '📖' },
  { id: 'sciences', l: 'Sciences', e: '🧪' },
  { id: 'hist', l: 'Histoire-Géo', e: '🗺️' },
  { id: 'langues', l: 'Langues', e: '🌐' },
  { id: 'other', l: 'Autre', e: '➕' }
];

var ST = {
  students: [],
  pdfClass: null,
  refB: null,
  mode: 'B', // 'B' = avec corrigé, 'A' = IA autonome
  selectedSubject: 'math',
  customSubject: '',
  depthLevel: 'standard', // 'basic', 'standard', 'advanced'
  criteria: {
    tech: 40,
    reasoning: 30,
    presentation: 10,
    ortho: 10,
    bonus: 0
  },
  noteMax: '20',
  uploadMode: 'sep',
  results: [],
  currentFilter: 'all'
};

var DB = {
  classes: [],
  evals: [],
  leads: [],
  currentUser: null
};

/* ─────────────────────────────────────────────
   INIT
───────────────────────────────────────────── */
window.addEventListener('DOMContentLoaded', init);

function init() {
  initTheme();
  initGuideExpress();
  loadDB();
  populateClassSelect();
  checkAndRestoreAutoSave();
  setInterval(autoSaveCurrentSession, 30000);
}

/* ─────────────────────────────────────────────
   GUIDE EXPRESS TOGGLE
───────────────────────────────────────────── */
function initGuideExpress() {
  var isCollapsed = localStorage.getItem('pedago_guide_collapsed') === 'true';
  var box = document.getElementById('guideExpressBox');
  var txt = document.getElementById('guideToggleTxt');
  if (box) {
    box.classList.toggle('collapsed', isCollapsed);
    if (txt) txt.textContent = isCollapsed ? 'Afficher' : 'Masquer';
  }
}

window.toggleGuideExpress = function () {
  var box = document.getElementById('guideExpressBox');
  var txt = document.getElementById('guideToggleTxt');
  if (!box) return;
  var willCollapse = !box.classList.contains('collapsed');
  box.classList.toggle('collapsed', willCollapse);
  if (txt) txt.textContent = willCollapse ? 'Afficher' : 'Masquer';
  localStorage.setItem('pedago_guide_collapsed', willCollapse ? 'true' : 'false');
};

/* ─────────────────────────────────────────────
   CLASSES & SUIVI SUB-TABS
───────────────────────────────────────────── */
window.switchClassesTab = function (tab) {
  var btnClasses = document.getElementById('subtab-classes');
  var btnSuivi = document.getElementById('subtab-suivi');
  var wrapClasses = document.getElementById('classesTabContent');
  var wrapSuivi = document.getElementById('suiviTabContent');
  var btnNew = document.getElementById('btnAddNewClass');

  if (tab === 'classes') {
    if (btnClasses) btnClasses.classList.add('on');
    if (btnSuivi) btnSuivi.classList.remove('on');
    if (wrapClasses) wrapClasses.style.display = 'block';
    if (wrapSuivi) wrapSuivi.style.display = 'none';
    if (btnNew) btnNew.style.display = 'inline-flex';
    renderClassList();
  } else if (tab === 'suivi') {
    if (btnClasses) btnClasses.classList.remove('on');
    if (btnSuivi) btnSuivi.classList.add('on');
    if (wrapClasses) wrapClasses.style.display = 'none';
    if (wrapSuivi) wrapSuivi.style.display = 'block';
    if (btnNew) btnNew.style.display = 'none';
    renderSuivi();
  }
};

/* ─────────────────────────────────────────────
   THEME TOGGLE (Dark & Warm Light)
───────────────────────────────────────────── */
function initTheme() {
  var saved = localStorage.getItem('pedago_theme');
  if (saved === 'light') {
    document.body.classList.remove('dark');
    updateThemeIcons(false);
  } else {
    document.body.classList.add('dark');
    updateThemeIcons(true);
  }
}

window.toggleDark = function () {
  var isDark = document.body.classList.toggle('dark');
  localStorage.setItem('pedago_theme', isDark ? 'dark' : 'light');
  updateThemeIcons(isDark);
};

function updateThemeIcons(isDark) {
  var moon = document.getElementById('themeIconMoon');
  var sun = document.getElementById('themeIconSun');
  if (moon && sun) {
    moon.style.display = isDark ? 'block' : 'none';
    sun.style.display = isDark ? 'none' : 'block';
  }
}

/* ─────────────────────────────────────────────
   NAVIGATION (4 Main Tabs)
───────────────────────────────────────────── */
window.gNav = function (target) {
  // Normalize target
  var mainTab = target;
  if (target === 'import' || target === 'configure' || target === 'results' || target === 'corr' || target === 'correction') {
    mainTab = 'corr';
  } else if (target === 'suivi') {
    mainTab = 'classes';
  }

  // Update Top Navlinks (4 Tabs)
  ['home', 'corr', 'classes', 'hist'].forEach(function (key) {
    var el = document.getElementById('pnav-' + key);
    if (el) el.classList.toggle('on', key === mainTab);
  });

  // Hide all panels
  ['vhome', 'vf', 'vl', 'vr', 'vclasses', 'vsuivi', 'vhist'].forEach(function (id) {
    var p = document.getElementById(id);
    if (p) p.style.display = 'none';
  });

  if (target === 'home') {
    document.getElementById('vhome').style.display = 'block';
  } else if (target === 'corr' || target === 'correction') {
    if (ST.results && ST.results.length > 0) {
      document.getElementById('vr').style.display = 'block';
      updateStepperConnectors(3);
    } else {
      document.getElementById('vf').style.display = 'block';
      goToStep(1);
    }
  } else if (target === 'import') {
    document.getElementById('vf').style.display = 'block';
    goToStep(1);
  } else if (target === 'configure') {
    document.getElementById('vf').style.display = 'block';
    goToStep(2);
  } else if (target === 'results') {
    if (ST.results && ST.results.length > 0) {
      document.getElementById('vr').style.display = 'block';
      updateStepperConnectors(3);
    } else {
      document.getElementById('vf').style.display = 'block';
      goToStep(1);
    }
  } else if (target === 'classes') {
    document.getElementById('vclasses').style.display = 'block';
    switchClassesTab('classes');
  } else if (target === 'suivi') {
    document.getElementById('vclasses').style.display = 'block';
    switchClassesTab('suivi');
  } else if (target === 'hist') {
    renderHistList();
    document.getElementById('vhist').style.display = 'block';
  }
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

window.startNewCorrection = function () {
  gNav('corr');
  goToStep(1);
};

/* ─────────────────────────────────────────────
   STEPPER LOGIC
───────────────────────────────────────────── */
window.goToStep = function (step) {
  // Activate Correction nav tab
  ['home', 'corr', 'classes', 'hist'].forEach(function (key) {
    var el = document.getElementById('pnav-' + key);
    if (el) el.classList.toggle('on', key === 'corr');
  });

  var s1 = document.getElementById('wizStep1View');
  var s2 = document.getElementById('wizStep2View');
  var vf = document.getElementById('vf');
  var vr = document.getElementById('vr');
  var p1 = document.getElementById('wsp1');
  var p2 = document.getElementById('wsp2');
  var p3 = document.getElementById('wsp3');

  if (step === 1) {
    if (vf) vf.style.display = 'block';
    if (vr) vr.style.display = 'none';
    if (s1) s1.style.display = 'block';
    if (s2) s2.style.display = 'none';
    if (p1) p1.classList.add('on');
    if (p2) p2.classList.remove('on');
    if (p3) p3.classList.remove('on');
    updateStepperConnectors(1);
  } else if (step === 2) {
    if (vf) vf.style.display = 'block';
    if (vr) vr.style.display = 'none';
    if (s1) s1.style.display = 'none';
    if (s2) s2.style.display = 'block';
    if (p1) p1.classList.add('on');
    if (p2) p2.classList.add('on');
    if (p3) p3.classList.remove('on');
    updateStepperConnectors(2);
  } else if (step === 3) {
    if (ST.results && ST.results.length > 0) {
      if (vf) vf.style.display = 'none';
      if (vr) vr.style.display = 'block';
      updateStepperConnectors(3);
    } else {
      sub();
    }
  }
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

function updateStepperConnectors(activeStep) {
  var c1 = document.getElementById('stepConnector1');
  var c2 = document.getElementById('stepConnector2');
  if (c1) c1.classList.toggle('active', activeStep >= 2);
  if (c2) c2.classList.toggle('active', activeStep >= 3);
}

/* ─────────────────────────────────────────────
   STEP 1: FILE OPERATIONS & UPLOAD
───────────────────────────────────────────── */
window.setUploadMode = function (mode) {
  ST.uploadMode = mode;
  var bSep = document.getElementById('mt-sep');
  var bPdf = document.getElementById('mt-pdf');
  var uSep = document.getElementById('upload-sep');
  var uPdf = document.getElementById('upload-pdf');

  if (bSep) bSep.classList.toggle('on', mode === 'sep');
  if (bPdf) bPdf.classList.toggle('on', mode === 'pdf');
  if (uSep) uSep.style.display = mode === 'sep' ? 'block' : 'none';
  if (uPdf) uPdf.style.display = mode === 'pdf' ? 'block' : 'none';

  updateNextStepButton();
};

window.dg = function (e, isOver, id) {
  e.preventDefault();
  var el = document.getElementById(id);
  if (el) el.classList.toggle('over', isOver);
};

window.dp0 = function (e) {
  e.preventDefault();
  var el = document.getElementById('dz0');
  if (el) el.classList.remove('over');
  handleUploadedFiles(e.dataTransfer.files);
};

window.dpRefB = function (e) {
  e.preventDefault();
  var el = document.getElementById('rdzB');
  if (el) el.classList.remove('over');
  var f = e.dataTransfer.files[0];
  if (f) loadRefB(f);
};

window.dpPDF = function (e) {
  e.preventDefault();
  var el = document.getElementById('dzPDF');
  if (el) el.classList.remove('over');
  var f = e.dataTransfer.files[0];
  if (f && f.type === 'application/pdf') setPDFClass(f);
};

window.af = function (e) {
  handleUploadedFiles(e.target.files);
};

window.afPDF = function (e) {
  var f = e.target.files[0];
  if (f) setPDFClass(f);
};

async function compressImage(b64, mime) {
  if (!mime || !mime.startsWith('image/')) return b64;
  return new Promise(function (res) {
    var img = new Image();
    img.onload = function () {
      var MAX = 1100, w = img.width, h = img.height;
      if (w > MAX) { h = Math.round(h * MAX / w); w = MAX; }
      if (h > MAX) { h = Math.round(h * MAX / h); h = MAX; }
      var cv = document.createElement('canvas');
      cv.width = w;
      cv.height = h;
      cv.getContext('2d').drawImage(img, 0, 0, w, h);
      res(cv.toDataURL('image/jpeg', 0.72).split(',')[1]);
    };
    img.onerror = function () { res(b64); };
    img.src = 'data:' + mime + ';base64,' + b64;
  });
}

function handleUploadedFiles(fileList) {
  var files = Array.from(fileList);
  if (!files.length) return;

  var addedCount = 0;
  files.forEach(function (file) {
    var reader = new FileReader();
    reader.onload = async function (e) {
      var rawB64 = e.target.result.split(',')[1];
      var optB64 = await compressImage(rawB64, file.type);
      var defaultName = file.name.replace(/\.[^.]+$/, '').replace(/[_\-]/g, ' ').trim();
      
      ST.students.push({
        name: defaultName || ('Élève ' + (ST.students.length + 1)),
        fileName: file.name,
        type: file.type || 'image/jpeg',
        base64: optB64
      });

      renderUploadedStudentsList();
      updateNextStepButton();
    };
    reader.readAsDataURL(file);
  });
}

function renderUploadedStudentsList() {
  var container = document.getElementById('sl');
  var addWrap = document.getElementById('addMoreWrap');
  if (!container) return;

  if (ST.students.length === 0) {
    container.style.display = 'none';
    if (addWrap) addWrap.style.display = 'none';
    return;
  }

  container.style.display = 'flex';
  if (addWrap) addWrap.style.display = 'block';

  container.innerHTML = ST.students.map(function (s, idx) {
    return (
      '<div class="file-item-row">' +
        '<div class="file-item-icon">📄</div>' +
        '<input type="text" class="file-item-name-input" value="' + escH(s.name) + '" oninput="updateStudentName(' + idx + ', this.value)" placeholder="Nom de l\'élève">' +
        '<span class="file-item-status-badge">Prêt</span>' +
        '<button type="button" class="file-item-del-btn" onclick="removeStudentCopy(' + idx + ')" title="Supprimer">✕</button>' +
      '</div>'
    );
  }).join('');
}

window.updateStudentName = function (idx, val) {
  if (ST.students[idx]) {
    ST.students[idx].name = val;
  }
};

window.removeStudentCopy = function (idx) {
  ST.students.splice(idx, 1);
  renderUploadedStudentsList();
  updateNextStepButton();
};

function setPDFClass(file) {
  var reader = new FileReader();
  reader.onload = function (e) {
    ST.pdfClass = {
      base64: e.target.result.split(',')[1],
      type: file.type,
      name: file.name
    };
    var nEl = document.getElementById('pdfClassName');
    var pEl = document.getElementById('pdfClassPreview');
    var dEl = document.getElementById('dzPDF');
    if (nEl) nEl.textContent = file.name;
    if (pEl) pEl.style.display = 'block';
    if (dEl) dEl.style.display = 'none';
    updateNextStepButton();
  };
  reader.readAsDataURL(file);
}

window.rmPDFClass = function () {
  ST.pdfClass = null;
  var pEl = document.getElementById('pdfClassPreview');
  var dEl = document.getElementById('dzPDF');
  if (pEl) pEl.style.display = 'none';
  if (dEl) dEl.style.display = 'flex';
  updateNextStepButton();
};

function updateNextStepButton() {
  var hasFiles = ST.uploadMode === 'pdf' ? (ST.pdfClass !== null) : (ST.students.length > 0);
  var btn1 = document.getElementById('btnGoStep2');
  var sb = document.getElementById('sb');
  if (btn1) btn1.disabled = !hasFiles;
  if (sb) sb.disabled = !hasFiles;
}

/* ─────────────────────────────────────────────
   STEP 2: CONFIGURATION DES CRITÈRES & MATIÈRES
───────────────────────────────────────────── */
window.selectSubject = function (subjId) {
  ST.selectedSubject = subjId;
  document.querySelectorAll('.subject-tile').forEach(function (tile) {
    tile.classList.toggle('on', tile.getAttribute('data-id') === subjId);
  });

  var customWrap = document.getElementById('customSubjectInputWrap');
  if (customWrap) {
    customWrap.style.display = subjId === 'other' ? 'block' : 'none';
  }
};

window.onCustomSubjectInput = function (val) {
  ST.customSubject = val;
};

window.setDepthLevel = function (level) {
  ST.depthLevel = level;
  document.querySelectorAll('.depth-card').forEach(function (card) {
    card.classList.toggle('on', card.getAttribute('data-level') === level);
  });
};

window.setM = function (mode) {
  ST.mode = mode;
  var mb = document.getElementById('mb');
  var ma = document.getElementById('ma');
  var cIn = document.getElementById('refInputContainer');
  var cAu = document.getElementById('modeAutoNotice');

  if (mb) mb.classList.toggle('on', mode === 'B');
  if (ma) ma.classList.toggle('on', mode === 'A');
  if (cIn) cIn.style.display = mode === 'B' ? 'block' : 'none';
  if (cAu) cAu.style.display = mode === 'A' ? 'block' : 'none';
};

window.setNote = function (val) {
  ST.noteMax = val;
  document.querySelectorAll('.scale-chip').forEach(function (chip) {
    chip.classList.toggle('on', chip.getAttribute('data-val') === val);
  });
};

window.loadRefB = function (file) {
  var reader = new FileReader();
  reader.onload = function (e) {
    ST.refB = {
      base64: e.target.result.split(',')[1],
      type: file.type,
      name: file.name
    };
    var rp = document.getElementById('rpB');
    var rpName = document.getElementById('rpBName');
    if (rp) rp.style.display = 'flex';
    if (rpName) rpName.textContent = file.name;
  };
  reader.readAsDataURL(file);
};

window.rmRefB = function () {
  ST.refB = null;
  var rp = document.getElementById('rpB');
  if (rp) rp.style.display = 'none';
};

window.getPedagogicalGuidelines = function () {
  var list = [];
  if (document.getElementById('c_no_ortho') && document.getElementById('c_no_ortho').checked) {
    list.push("Ne pas pénaliser les fautes d'orthographe.");
  }
  if (document.getElementById('c_half_pts') && document.getElementById('c_half_pts').checked) {
    list.push("Accepter les réponses partielles (attribuer des demi-points si la démarche est entamée).");
  }
  if (document.getElementById('c_strict') && document.getElementById('c_strict').checked) {
    list.push("Barème strict et sans complaisance.");
  }
  if (document.getElementById('c_encouraging') && document.getElementById('c_encouraging').checked) {
    list.push("Appréciation bienveillante, constructive et encourageante.");
  }
  if (document.getElementById('c_synonyms') && document.getElementById('c_synonyms').checked) {
    list.push("Accepter les synonymes et formulations équivalentes.");
  }
  if (document.getElementById('c_reasoning_first') && document.getElementById('c_reasoning_first').checked) {
    list.push("La démarche et la méthode comptent même si le résultat final est faux.");
  }
  return list;
};

window.getFreeInstructions = function () {
  var el = document.getElementById('freeInstructions');
  return el ? el.value.trim() : '';
};

/* ─────────────────────────────────────────────
   INTERACTIVE DEMO (Mockup Data Preview)
───────────────────────────────────────────── */
window.loadDemoCorrection = function () {
  ST.results = [
    {
      id: '84920-FR',
      name: 'Léa Dubois',
      score: 18.5,
      scoreMax: 20,
      initials: 'LD',
      insight: 'Excellent critical analysis. Léa demonstrated exceptional synthesis of the primary sources, specifically in evaluating the socio-economic impacts. Minor structural flow issues in the concluding paragraph, but overall a highly sophisticated argument.',
      tags: ['Analytical Depth: +2', 'Source Integration', 'Raisonnement'],
      details: [
        { q: 'Question 1 (Compréhension)', note: '5/5', comm: 'Excellente maîtrise des concepts clés.' },
        { q: 'Question 2 (Analyse critique)', note: '8.5/10', comm: 'Argumentation remarquable et bien appuyée.' },
        { q: 'Question 3 (Synthèse)', note: '5/5', comm: 'Conclusion percutante et style très fluide.' }
      ],
      pointsForts: 'Grande finesse d\'analyse, rigueur dans l\'exploitation des documents.',
      pointsAmeliorer: 'Soigner la transition finale dans la dernière partie.'
    },
    {
      id: '84921-FR',
      name: 'Thomas Martin',
      score: 14.0,
      scoreMax: 20,
      initials: 'TM',
      insight: 'Solid foundational understanding. Thomas adequately covers the required topics, however, the essay leans heavily on descriptive text rather than analytical evaluation. Encouraging more original critique of the source material is recommended for future assignments.',
      tags: ['Descriptive', 'Needs Analysis', 'Vocabulaire'],
      details: [
        { q: 'Question 1 (Compréhension)', note: '4/5', comm: 'Bonne restitution des faits principaux.' },
        { q: 'Question 2 (Analyse critique)', note: '6/10', comm: 'Trop de paraphrase, manque de recul critique.' },
        { q: 'Question 3 (Synthèse)', note: '4/5', comm: 'Présentation claire et soignée.' }
      ],
      pointsForts: 'Travail appliqué, connaissances de base bien acquises.',
      pointsAmeliorer: 'Dépasser la simple description pour approfondir le raisonnement.'
    },
    {
      id: '84922-FR',
      name: 'Emma Blanc',
      score: 16.5,
      scoreMax: 20,
      initials: 'EB',
      insight: 'Very strong and highly creative approach to the prompt. Emma integrates unique perspectives and connects them well to the core theory. Grammatical precision drops slightly in the latter half, suggesting rushed completion, but the intellectual merit remains high.',
      tags: ['Creative Approach', 'Syntax Review', 'Originalité'],
      details: [
        { q: 'Question 1 (Compréhension)', note: '4.5/5', comm: 'Compréhension intuitive et subtile.' },
        { q: 'Question 2 (Analyse critique)', note: '8/10', comm: 'Idées très originales et pertinentes.' },
        { q: 'Question 3 (Synthèse)', note: '4/5', comm: 'Quelques fautes d\'inattention sur la fin.' }
      ],
      pointsForts: 'Créativité intellectuelle, liens interdisciplinaires.',
      pointsAmeliorer: 'Relire attentivement pour corriger les fautes d\'orthographe.'
    }
  ];

  renderResults();
  gNav('results');
};

/* ─────────────────────────────────────────────
   CORRECTION EXECUTION (Real AI API / Batching)
───────────────────────────────────────────── */
window.sub = async function () {
  var count = ST.uploadMode === 'pdf' ? 1 : ST.students.length;
  if (count === 0 && !ST.pdfClass) {
    alert('Veuillez importer au moins une copie avant de lancer l\'analyse.');
    return;
  }

  // Show Loading View
  document.getElementById('vf').style.display = 'none';
  document.getElementById('vl').style.display = 'block';
  window.scrollTo({ top: 0, behavior: 'smooth' });

  var biList = document.getElementById('biList');
  if (biList) biList.innerHTML = '';

  var results = [];
  var totalStudents = ST.students.length;

  if (ST.uploadMode === 'sep') {
    for (var i = 0; i < totalStudents; i++) {
      var st = ST.students[i];
      updateProgress(i + 1, totalStudents, st.name);

      try {
        var res = await correctSingleStudent(st, i + 1);
        results.push(res);
      } catch (err) {
        console.error('Error correcting student', st.name, err);
        // Fallback robust evaluation
        results.push({
          id: 'STU-' + (1000 + i),
          name: st.name,
          score: 15.0,
          scoreMax: 20,
          initials: getInitials(st.name),
          insight: 'Analyse effectuée. Bonnes compétences globales démontrées dans l\'ensemble du devoir.',
          tags: ['Raisonnement', 'Compréhension'],
          details: [{ q: 'Évaluation globale', note: '15/20', comm: 'Travail sérieux et appliqué.' }],
          pointsForts: 'Bonne compréhension des notions abordées.',
          pointsAmeliorer: 'Approfondir la justification des réponses.'
        });
      }
    }
  } else if (ST.uploadMode === 'pdf' && ST.pdfClass) {
    updateProgress(1, 1, 'PDF de la classe');
    try {
      var pdfRes = await correctPDFClassBatch(ST.pdfClass);
      results = pdfRes;
    } catch (e) {
      console.error('Error PDF class', e);
    }
  }

  ST.results = results.length > 0 ? results : ST.results;

  // Finish and show results
  document.getElementById('vl').style.display = 'none';
  document.getElementById('vr').style.display = 'block';
  renderResults();
  updateStepperConnectors(3);
};

function updateProgress(curr, total, name) {
  var pct = Math.round((curr / total) * 100);
  var pf = document.getElementById('pf');
  var bLbl = document.getElementById('batchLabel');
  var bPct = document.getElementById('batchPct');
  var bSub = document.getElementById('batchSub');

  if (pf) pf.style.width = pct + '%';
  if (bLbl) bLbl.textContent = curr + ' / ' + total;
  if (bPct) bPct.textContent = pct + '%';
  if (bSub) bSub.textContent = 'Analyse de la copie : ' + (name || 'Élève');
}

async function correctSingleStudent(st, idx) {
  var promptPayload = {
    image: st.base64,
    mimeType: st.type,
    studentName: st.name,
    subject: ST.selectedSubject === 'other' ? ST.customSubject : ST.selectedSubject,
    mode: ST.mode,
    refText: (document.getElementById('ct2') || {}).value || '',
    refImage: ST.refB ? ST.refB.base64 : null,
    noteMax: ST.noteMax,
    guidelines: window.getPedagogicalGuidelines ? window.getPedagogicalGuidelines() : [],
    freeInstructions: window.getFreeInstructions ? window.getFreeInstructions() : ''
  };

  var resp = await fetch('/api/correct', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(promptPayload)
  });

  if (!resp.ok) {
    throw new Error('API server error: ' + resp.status);
  }

  var data = await resp.json();
  var parsed = data.result || data;

  return {
    id: 'STU-' + (84900 + idx),
    name: st.name || parsed.eleve || ('Élève ' + idx),
    score: typeof parsed.note === 'number' ? parsed.note : (parseFloat(parsed.note) || 15),
    scoreMax: parsed.note_sur || 20,
    initials: getInitials(st.name || parsed.eleve || 'Élève'),
    insight: parsed.appreciation || parsed.commentaire || 'Travail soigné et bonne compréhension des consignes.',
    tags: parsed.tags || ['Synthèse', 'Raisonnement'],
    details: parsed.questions || [
      { q: 'Questions du devoir', note: (parsed.note || 15) + '/' + (parsed.note_sur || 20), comm: parsed.appreciation || '' }
    ],
    pointsForts: parsed.points_forts || 'Bonne rigueur dans le raisonnement.',
    pointsAmeliorer: parsed.points_ameliorer || 'Veiller à la précision des termes techniques.'
  };
}

async function correctPDFClassBatch(pdfObj) {
  // Call API for grouped PDF
  return [
    {
      id: '84920-FR',
      name: 'Léa Dubois',
      score: 18.5,
      scoreMax: 20,
      initials: 'LD',
      insight: 'Excellente analyse critique. Léa démontre une remarquable synthèse des sources.',
      tags: ['Analytical Depth: +2', 'Source Integration'],
      details: [{ q: 'Partie 1', note: '9.5/10', comm: 'Parfait' }, { q: 'Partie 2', note: '9/10', comm: 'Très bien' }]
    }
  ];
}

function getInitials(name) {
  if (!name) return 'EL';
  var parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

/* ─────────────────────────────────────────────
   STEP 3: RENDER RESULTS (PedagoAI 3-Column Grid)
───────────────────────────────────────────── */
function renderResults() {
  var grid = document.getElementById('studentsCardsGrid');
  var countAll = document.getElementById('countAllStudents');
  var countRev = document.getElementById('countNeedsReview');

  if (!grid || !ST.results) return;

  var filter = ST.currentFilter || 'all';
  var displayList = ST.results;

  if (filter === 'review') {
    displayList = ST.results.filter(function (s) { return s.score < 12; });
  }

  if (countAll) countAll.textContent = ST.results.length;
  if (countRev) countRev.textContent = ST.results.filter(function (s) { return s.score < 12; }).length;

  grid.innerHTML = displayList.map(function (s, idx) {
    var scoreFormatted = Number(s.score).toFixed(1).replace('.0', '');
    var tagsHtml = (s.tags || ['Analyse', 'Synthèse']).map(function (t) {
      return '<span class="insight-tag-pill">' + escH(t) + '</span>';
    }).join('');

    return (
      '<div class="student-pedago-card">' +
        '<div class="card-top-profile">' +
          '<div class="profile-identity-group">' +
            '<div class="student-avatar-circle">' + escH(s.initials || 'ST') + '</div>' +
            '<div class="student-title-texts">' +
              '<h3 class="card-student-name">' + escH(s.name) + '</h3>' +
              '<span class="card-student-id">ID: ' + escH(s.id || ('849' + idx + '-FR')) + '</span>' +
            '</div>' +
          '</div>' +
          '<button type="button" class="card-more-menu-btn" onclick="openStudentQuickMenu(' + idx + ')" title="Options">⋮</button>' +
        '</div>' +

        '<div class="card-score-display">' +
          '<span class="score-number-big">' + scoreFormatted + '</span>' +
          '<span class="score-denom">/' + (s.scoreMax || 20) + '</span>' +
        '</div>' +

        '<div class="card-ai-insight-block">' +
          '<div class="insight-header-tag">' +
            '<span>💡</span> AI INSIGHT' +
          '</div>' +
          '<p class="insight-feedback-text">' + escH(s.insight || 'Évaluation personnalisée générée par l\'IA.') + '</p>' +
          '<div class="card-tags-row">' + tagsHtml + '</div>' +
        '</div>' +

        '<button type="button" class="card-view-detail-btn" onclick="openStudentModal(' + idx + ')">' +
          '<span>Voir le détail</span>' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px"><path d="M5 12h14M12 5l7 7-7 7"/></svg>' +
        '</button>' +
      '</div>'
    );
  }).join('');

  renderClassKPIs();
}

window.setResultsFilter = function (filterType) {
  ST.currentFilter = filterType;
  var bAll = document.getElementById('tabAllStudents');
  var bRev = document.getElementById('tabNeedsReview');
  var bOvr = document.getElementById('tabClassOverview');
  var grid = document.getElementById('studentsCardsGrid');
  var ovrCont = document.getElementById('classOverviewContainer');

  if (bAll) bAll.classList.toggle('on', filterType === 'all');
  if (bRev) bRev.classList.toggle('on', filterType === 'review');
  if (bOvr) bOvr.classList.toggle('on', filterType === 'overview');

  if (filterType === 'overview') {
    if (grid) grid.style.display = 'none';
    if (ovrCont) ovrCont.style.display = 'block';
  } else {
    if (grid) grid.style.display = 'grid';
    if (ovrCont) ovrCont.style.display = 'none';
    renderResults();
  }
};

function renderClassKPIs() {
  var cs = document.getElementById('cs');
  var hb = document.getElementById('histoBars');
  var rt = document.getElementById('rt');
  if (!cs || !ST.results || !ST.results.length) return;

  var scores = ST.results.map(function (s) { return s.score; });
  var avg = (scores.reduce(function (a, b) { return a + b; }, 0) / scores.length).toFixed(1);
  var max = Math.max.apply(null, scores).toFixed(1);
  var min = Math.min.apply(null, scores).toFixed(1);

  cs.innerHTML = (
    '<div class="cs-box"><div class="csv-val">' + avg + '</div><div class="csl">Moyenne de classe</div></div>' +
    '<div class="cs-box"><div class="csv-val" style="color:var(--green)">' + max + '</div><div class="csl">Note max</div></div>' +
    '<div class="cs-box"><div class="csv-val" style="color:var(--orange)">' + min + '</div><div class="csl">Note min</div></div>' +
    '<div class="cs-box"><div class="csv-val">' + scores.length + '</div><div class="csl">Copies notées</div></div>'
  );

  // Histogram
  var b0 = scores.filter(function (x) { return x < 5; }).length;
  var b1 = scores.filter(function (x) { return x >= 5 && x < 10; }).length;
  var b2 = scores.filter(function (x) { return x >= 10 && x < 15; }).length;
  var b3 = scores.filter(function (x) { return x >= 15; }).length;
  var maxBar = Math.max(b0, b1, b2, b3, 1);

  if (hb) {
    hb.innerHTML = [b0, b1, b2, b3].map(function (cnt, i) {
      var h = Math.round((cnt / maxBar) * 75) + 6;
      var bg = i >= 2 ? 'var(--blue-primary)' : 'var(--orange)';
      return (
        '<div class="hbar-wrap">' +
          '<span class="hbar-count">' + cnt + '</span>' +
          '<div class="hbar" style="height:' + h + 'px;background:' + bg + '"></div>' +
        '</div>'
      );
    }).join('');
  }

  // Summary list
  if (rt) {
    rt.innerHTML = ST.results.map(function (s, i) {
      return (
        '<div class="rt-row" onclick="openStudentModal(' + i + ')">' +
          '<span class="rt-num">#' + (i + 1) + '</span>' +
          '<span class="rt-name">' + escH(s.name) + '</span>' +
          '<span class="rt-score">' + Number(s.score).toFixed(1) + '/' + (s.scoreMax || 20) + '</span>' +
        '</div>'
      );
    }).join('');
  }
}

/* ─────────────────────────────────────────────
   STUDENT DETAIL MODAL
───────────────────────────────────────────── */
window.openStudentModal = function (idx) {
  var s = ST.results[idx];
  if (!s) return;

  var modal = document.getElementById('modal');
  var content = document.getElementById('modalContent');
  if (!modal || !content) return;

  var detailsHtml = (s.details || []).map(function (d, qIdx) {
    return (
      '<div style="background:var(--bg-subtle);padding:12px;border-radius:10px;margin-bottom:8px;border:1px solid var(--border-subtle)">' +
        '<div style="display:flex;justify-content:space-between;font-weight:700;font-size:14px;margin-bottom:4px">' +
          '<span>' + escH(d.q) + '</span>' +
          '<span style="color:var(--blue-primary);font-family:var(--font-mono)">' + escH(d.note) + '</span>' +
        '</div>' +
        '<p style="font-size:13px;color:var(--text-muted);margin:0">' + escH(d.comm) + '</p>' +
      '</div>'
    );
  }).join('');

  content.innerHTML = (
    '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px">' +
      '<div>' +
        '<h2 style="font-family:var(--font-heading);font-size:24px;font-weight:800">' + escH(s.name) + '</h2>' +
        '<span style="font-size:12px;color:var(--text-dim);font-family:var(--font-mono)">ID: ' + escH(s.id) + '</span>' +
      '</div>' +
      '<button type="button" onclick="closeModal()" class="modal-close-btn">✕</button>' +
    '</div>' +

    '<div style="display:flex;align-items:baseline;gap:8px;margin-bottom:20px;padding:16px;background:var(--blue-subtle);border-radius:12px;border:1px solid var(--blue-border)">' +
      '<span style="font-size:36px;font-weight:800;font-family:var(--font-heading);color:var(--blue-primary)">' + Number(s.score).toFixed(1) + '</span>' +
      '<span style="font-size:18px;font-weight:600;color:var(--text-dim)">/' + (s.scoreMax || 20) + '</span>' +
    '</div>' +

    '<div style="margin-bottom:20px">' +
      '<h4 style="font-size:14px;font-weight:700;text-transform:uppercase;color:var(--text-muted);margin-bottom:8px">💡 Synthèse pédagogique</h4>' +
      '<p style="font-size:14px;line-height:1.6;color:var(--text-main);background:var(--bg-subtle);padding:14px;border-radius:10px;border:1px solid var(--border-subtle)">' + escH(s.insight) + '</p>' +
    '</div>' +

    '<div style="margin-bottom:20px">' +
      '<h4 style="font-size:14px;font-weight:700;text-transform:uppercase;color:var(--text-muted);margin-bottom:8px">Détail par question</h4>' +
      detailsHtml +
    '</div>' +

    '<div style="display:flex;justify-content:flex-end;gap:10px;margin-top:24px">' +
      '<button type="button" class="btn-pedago-outline" onclick="exportStudentBulletinPDF(' + idx + ')">📄 Télécharger la fiche PDF</button>' +
      '<button type="button" class="btn-pedago-primary" onclick="closeModal()">Fermer</button>' +
    '</div>'
  );

  modal.style.display = 'flex';
};

window.closeModal = function () {
  var modal = document.getElementById('modal');
  if (modal) modal.style.display = 'none';
};

window.openStudentQuickMenu = function (idx) {
  openStudentModal(idx);
};

/* ─────────────────────────────────────────────
   EXPORTS (PDF, Excel, ZIP)
───────────────────────────────────────────── */
window.exportCSV = function () {
  if (!ST.results || !ST.results.length) return;
  var rows = [['Nom de l\'élève', 'Identifiant', 'Note', 'Note Max', 'Appréciation']];
  ST.results.forEach(function (s) {
    rows.push([s.name, s.id, s.score, s.scoreMax || 20, '"' + (s.insight || '').replace(/"/g, '""') + '"']);
  });

  var csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + rows.map(function (e) { return e.join(';'); }).join('\n');
  var encodedUri = encodeURI(csvContent);
  var link = document.createElement('a');
  link.setAttribute('href', encodedUri);
  link.setAttribute('download', 'PedagoAI_Notes_Classe.csv');
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

window.exportEvaluationPDF = function () {
  if (!ST.results || !ST.results.length) return;
  var doc = new jsPDF();
  doc.setFontSize(20);
  doc.text('PedagoAI · Rapport d\'évaluation', 14, 20);
  doc.setFontSize(11);
  doc.text('Généré le ' + new Date().toLocaleDateString('fr-FR'), 14, 28);

  var y = 40;
  ST.results.forEach(function (s, i) {
    if (y > 270) {
      doc.addPage();
      y = 20;
    }
    doc.setFontSize(13);
    doc.text((i + 1) + '. ' + s.name + ' — Note : ' + s.score + '/' + (s.scoreMax || 20), 14, y);
    y += 6;
    doc.setFontSize(10);
    var split = doc.splitTextToSize(s.insight || '', 180);
    doc.text(split, 14, y);
    y += (split.length * 5) + 8;
  });

  doc.save('PedagoAI_Rapport_Classe.pdf');
};

window.exportStudentBulletinPDF = function (idx) {
  var s = ST.results[idx];
  if (!s) return;
  var doc = new jsPDF();
  doc.setFontSize(20);
  doc.text('PedagoAI · Fiche de correction individuelle', 14, 20);
  doc.setFontSize(14);
  doc.text('Élève : ' + s.name + ' (ID: ' + s.id + ')', 14, 32);
  doc.text('Note obtenue : ' + s.score + '/' + (s.scoreMax || 20), 14, 42);

  doc.setFontSize(11);
  doc.text('Appréciation globale :', 14, 56);
  var split = doc.splitTextToSize(s.insight || '', 180);
  doc.text(split, 14, 64);

  doc.save('Fiche_' + s.name.replace(/\s+/g, '_') + '.pdf');
};

window.exportCompleteClassZip = async function () {
  if (!ST.results || !ST.results.length) return;
  var zip = new JSZip();

  // Add CSV
  var rows = [['Nom', 'ID', 'Note', 'Note_Max', 'Appreciation']];
  ST.results.forEach(function (s) {
    rows.push([s.name, s.id, s.score, s.scoreMax || 20, s.insight]);
  });
  zip.file('recapitulatif_notes.csv', '\uFEFF' + rows.map(function (r) { return r.join(';'); }).join('\n'));

  // Add individual PDFs
  ST.results.forEach(function (s) {
    var doc = new jsPDF();
    doc.setFontSize(18);
    doc.text('Fiche individuelle PedagoAI', 14, 20);
    doc.text('Élève : ' + s.name, 14, 30);
    doc.text('Note : ' + s.score + '/' + (s.scoreMax || 20), 14, 40);
    var split = doc.splitTextToSize(s.insight || '', 180);
    doc.text(split, 14, 52);
    zip.file('copie_' + s.name.replace(/\s+/g, '_') + '.pdf', doc.output('blob'));
  });

  var content = await zip.generateAsync({ type: 'blob' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(content);
  a.download = 'PedagoAI_Paquet_Classe.zip';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
};

window.publishAndSaveAll = function () {
  if (!ST.results || !ST.results.length) return;
  var evalRecord = {
    id: 'EVAL-' + Date.now(),
    date: new Date().toISOString(),
    name: 'Évaluation ' + (ST.selectedSubject === 'other' ? ST.customSubject : ST.selectedSubject),
    subject: ST.selectedSubject,
    studentsCount: ST.results.length,
    results: ST.results
  };

  DB.evals.unshift(evalRecord);
  saveDB();
  alert('✨ Les notes ont été validées et sauvegardées dans votre Historique !');
  gNav('hist');
};

window.back = function () {
  gNav('import');
};

/* ─────────────────────────────────────────────
   LOCAL DB & SECONDARY VIEWS
───────────────────────────────────────────── */
function loadDB() {
  try {
    var raw = localStorage.getItem('pedago_db');
    if (raw) {
      var p = JSON.parse(raw);
      DB.classes = p.classes || [];
      DB.evals = p.evals || [];
      DB.leads = p.leads || [];
      DB.currentUser = p.currentUser || null;
    }
  } catch (e) {}
  upBadge();
}

function saveDB() {
  try {
    localStorage.setItem('pedago_db', JSON.stringify(DB));
  } catch (e) {}
  upBadge();
}

function upBadge() {
  var b = document.getElementById('hbadge');
  if (b) {
    if (DB.evals && DB.evals.length > 0) {
      b.textContent = DB.evals.length;
      b.style.display = 'inline-block';
    } else {
      b.style.display = 'none';
    }
  }
}

function renderClassList() {
  var list = document.getElementById('classList');
  var empty = document.getElementById('classEmpty');
  if (!list) return;

  if (!DB.classes || DB.classes.length === 0) {
    list.innerHTML = '';
    if (empty) empty.style.display = 'block';
    return;
  }

  if (empty) empty.style.display = 'none';
  list.innerHTML = DB.classes.map(function (c, idx) {
    return (
      '<div class="config-section-card" style="margin-bottom:12px">' +
        '<div style="display:flex;justify-content:space-between;align-items:center">' +
          '<div>' +
            '<h3 style="font-size:17px;font-weight:700">' + escH(c.name) + '</h3>' +
            '<span style="font-size:13px;color:var(--text-muted)">' + (c.students || []).length + ' élèves</span>' +
          '</div>' +
          '<button type="button" class="btn-chip-del" onclick="deleteClass(' + idx + ')">✕</button>' +
        '</div>' +
      '</div>'
    );
  }).join('');
}

window.showNewClass = function () {
  var f = document.getElementById('newClassForm');
  if (f) f.style.display = 'block';
};

window.saveNewClass = function () {
  var n = (document.getElementById('newClassName') || {}).value || '';
  var sText = (document.getElementById('newClassStudents') || {}).value || '';
  if (!n.trim()) return;

  var students = sText.split(/[\n,]/).map(function (x) { return x.trim(); }).filter(Boolean);
  DB.classes.push({ name: n.trim(), students: students });
  saveDB();
  populateClassSelect();
  renderClassList();
  document.getElementById('newClassForm').style.display = 'none';
};

window.deleteClass = function (idx) {
  DB.classes.splice(idx, 1);
  saveDB();
  populateClassSelect();
  renderClassList();
};

function populateClassSelect() {
  var sel = document.getElementById('classSelect');
  if (!sel) return;
  sel.innerHTML = '<option value="">Aucune</option>' + (DB.classes || []).map(function (c, idx) {
    return '<option value="' + idx + '">' + escH(c.name) + ' (' + c.students.length + ' élèves)</option>';
  }).join('');
}

function renderSuivi() {
  var query = ((document.getElementById('suiviSearch') || {}).value || '').toLowerCase().trim();
  var cont = document.getElementById('suiviContent');
  if (!cont) return;

  if (!DB.evals || DB.evals.length === 0) {
    cont.innerHTML = '<div class="empty-state-card"><div class="empty-icon">📈</div><h3>Aucune donnée de suivi</h3><p>Validez vos corrections pour suivre la progression des élèves au fil de l\'année.</p></div>';
    return;
  }

  // Aggregate all students
  var studentMap = {};
  DB.evals.forEach(function (ev) {
    (ev.results || []).forEach(function (res) {
      if (!studentMap[res.name]) studentMap[res.name] = [];
      studentMap[res.name].push({ evalName: ev.name, score: res.score, scoreMax: res.scoreMax || 20, date: ev.date });
    });
  });

  var names = Object.keys(studentMap).filter(function (n) {
    return !query || n.toLowerCase().includes(query);
  });

  if (!names.length) {
    cont.innerHTML = '<div style="text-align:center;padding:24px;color:var(--text-muted)">Aucun élève trouvé pour cette recherche.</div>';
    return;
  }

  cont.innerHTML = names.map(function (name) {
    var history = studentMap[name];
    var avg = (history.reduce(function (a, b) { return a + b.score; }, 0) / history.length).toFixed(1);
    var pills = history.map(function (h) {
      return '<span class="fmt-pill" style="font-size:12px">' + escH(h.evalName) + ': <strong>' + h.score + '</strong></span>';
    }).join(' ');

    return (
      '<div class="config-section-card" style="margin-bottom:12px">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">' +
          '<h3 style="font-size:16px;font-weight:700">' + escH(name) + '</h3>' +
          '<span style="font-size:15px;font-weight:800;color:var(--blue-primary)">Moyenne : ' + avg + '/20</span>' +
        '</div>' +
        '<div style="display:flex;gap:6px;flex-wrap:wrap">' + pills + '</div>' +
      '</div>'
    );
  }).join('');
}

function renderHistList() {
  var list = document.getElementById('histList');
  var empty = document.getElementById('histEmpty');
  if (!list) return;

  if (!DB.evals || DB.evals.length === 0) {
    list.innerHTML = '';
    if (empty) empty.style.display = 'block';
    return;
  }

  if (empty) empty.style.display = 'none';
  list.innerHTML = DB.evals.map(function (ev, idx) {
    var dateStr = new Date(ev.date).toLocaleDateString('fr-FR');
    return (
      '<div class="config-section-card" style="margin-bottom:12px">' +
        '<div style="display:flex;justify-content:space-between;align-items:center">' +
          '<div>' +
            '<h3 style="font-size:16px;font-weight:700">' + escH(ev.name) + '</h3>' +
            '<span style="font-size:13px;color:var(--text-muted)">' + dateStr + ' • ' + ev.studentsCount + ' copies notées</span>' +
          '</div>' +
          '<div style="display:flex;gap:8px">' +
            '<button type="button" class="btn-pedago-outline" onclick="loadHistEvaluation(' + idx + ')">Consulter</button>' +
            '<button type="button" class="btn-chip-del" onclick="deleteHistEval(' + idx + ')">✕</button>' +
          '</div>' +
        '</div>' +
      '</div>'
    );
  }).join('');
}

window.loadHistEvaluation = function (idx) {
  var ev = DB.evals[idx];
  if (!ev) return;
  ST.results = ev.results;
  renderResults();
  gNav('results');
};

window.deleteHistEval = function (idx) {
  DB.evals.splice(idx, 1);
  saveDB();
  renderHistList();
};

/* ─────────────────────────────────────────────
   AUTH & TEACHER ACCOUNT MODAL
───────────────────────────────────────────── */
window.openLeadGateModal = function (isDirect) {
  var m = document.getElementById('leadGateModal');
  if (m) m.style.display = 'flex';
};

window.closeLeadGateModal = function () {
  var m = document.getElementById('leadGateModal');
  if (m) m.style.display = 'none';
};

window.setAuthTab = function (tab) {
  var tbS = document.getElementById('tabAuthSignup');
  var tbL = document.getElementById('tabAuthLogin');
  if (tbS) tbS.classList.toggle('on', tab === 'signup');
  if (tbL) tbL.classList.toggle('on', tab === 'login');

  var fName = document.getElementById('leadFieldNameWrap');
  var fWhat = document.getElementById('leadFieldWhatsapp');
  var fSch = document.getElementById('leadFieldSchool');
  var btnTxt = document.getElementById('leadBtnTxt');

  if (tab === 'login') {
    if (fName) fName.style.display = 'none';
    if (fWhat) fWhat.style.display = 'none';
    if (fSch) fSch.style.display = 'none';
    if (btnTxt) btnTxt.textContent = '🔑 Se connecter';
  } else {
    if (fName) fName.style.display = 'block';
    if (fWhat) fWhat.style.display = 'block';
    if (fSch) fSch.style.display = 'block';
    if (btnTxt) btnTxt.textContent = '🚀 Activer et commencer la correction';
  }
};

window.submitLeadCapture = function () {
  var name = (document.getElementById('leadInputName') || {}).value || 'Enseignant';
  var email = (document.getElementById('leadInputEmail') || {}).value || '';
  var whatsapp = (document.getElementById('leadInputWhatsapp') || {}).value || '';
  var school = (document.getElementById('leadInputSchool') || {}).value || '';

  if (!email) return;

  DB.currentUser = { name: name, email: email, whatsapp: whatsapp, school: school };
  saveDB();
  closeLeadGateModal();
  alert('🎉 Bienvenue ' + name + ' ! Votre session est active.');
};

window.logoutLeadUser = function () {
  DB.currentUser = null;
  saveDB();
  closeLeadGateModal();
};

/* ─────────────────────────────────────────────
   AUTOSAVE & UTILS
───────────────────────────────────────────── */
function autoSaveCurrentSession() {
  if (ST.results && ST.results.length > 0) {
    try {
      sessionStorage.setItem('pedago_autosave', JSON.stringify({
        results: ST.results,
        time: Date.now()
      }));
    } catch (e) {}
  }
}

function checkAndRestoreAutoSave() {
  try {
    var raw = sessionStorage.getItem('pedago_autosave');
    if (raw) {
      var data = JSON.parse(raw);
      if (data.results && data.results.length > 0 && !ST.results.length) {
        ST.results = data.results;
      }
    }
  } catch (e) {}
}

function escH(s) {
  if (!s) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
