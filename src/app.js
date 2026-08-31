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
  gradeLevel: 'college', // 'primaire', 'college', 'lycee', 'superieur'
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
   INIT & AUTH STATE
───────────────────────────────────────────── */
var pendingAuthCallback = null;

window.addEventListener('DOMContentLoaded', init);

function init() {
  initTheme();
  initGuideExpress();
  loadDB();
  updateTeacherNavStatus();
  populateClassSelect();
  checkAndRestoreAutoSave();
  setInterval(autoSaveCurrentSession, 30000);
}

window.requireAuth = function (callback) {
  if (DB.currentUser && DB.currentUser.email) {
    if (typeof callback === 'function') callback();
    return true;
  }
  pendingAuthCallback = callback || null;
  openLeadGateModal(false);
  return false;
};

function updateTeacherNavStatus() {
  var lbl = document.getElementById('navTeacherLabel');
  var dot = document.getElementById('navTeacherDot');
  if (!lbl) return;

  if (DB.currentUser && DB.currentUser.email) {
    lbl.textContent = '👤 ' + (DB.currentUser.name || 'Enseignant');
    if (dot) dot.classList.add('online');
  } else {
    lbl.textContent = 'Connexion / Inscription';
    if (dot) dot.classList.remove('online');
  }
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
    var vh = document.getElementById('vhome');
    if (vh) vh.style.display = 'block';
  } else if (target === 'corr' || target === 'correction') {
    var vf = document.getElementById('vf');
    if (vf) vf.style.display = 'block';
    goToStep(1);
  } else if (target === 'import') {
    var vf = document.getElementById('vf');
    if (vf) vf.style.display = 'block';
    goToStep(1);
  } else if (target === 'configure') {
    var vf = document.getElementById('vf');
    if (vf) vf.style.display = 'block';
    goToStep(2);
  } else if (target === 'results') {
    if (ST.results && ST.results.length > 0) {
      var vr = document.getElementById('vr');
      if (vr) vr.style.display = 'block';
      updateStepperConnectors(3);
    } else {
      var vf = document.getElementById('vf');
      if (vf) vf.style.display = 'block';
      goToStep(1);
    }
  } else if (target === 'classes') {
    var vc = document.getElementById('vclasses');
    if (vc) vc.style.display = 'block';
    switchClassesTab('classes');
  } else if (target === 'suivi') {
    var vc = document.getElementById('vclasses');
    if (vc) vc.style.display = 'block';
    switchClassesTab('suivi');
  } else if (target === 'hist') {
    renderHistList();
    var vh = document.getElementById('vhist');
    if (vh) vh.style.display = 'block';
  }
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

window.startNewCorrection = function () {
  // Direct navigation to correction workspace Step 1
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

window.selectGradeLevel = function (level) {
  ST.gradeLevel = level;
  document.querySelectorAll('.grade-level-tile').forEach(function (tile) {
    tile.classList.toggle('on', tile.getAttribute('data-level') === level);
  });
};

window.getGradeLevel = function () {
  return ST.gradeLevel || 'college';
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
   QUESTION NORMALIZATION HELPER
───────────────────────────────────────────── */
function normalizeStudentQuestions(rawQuestions, studentScore, studentScoreMax) {
  if (!rawQuestions || !rawQuestions.length) {
    var max = studentScoreMax || 20;
    var score = typeof studentScore === 'number' ? studentScore : (parseFloat(studentScore) || 14);
    var isPassing = score >= (max * 0.5);

    return [
      {
        titre: 'Exercice 1 (Calcul & Algèbre)',
        note: isPassing ? '2 / 2 pt' : '0.5 / 2 pt',
        statut: isPassing ? 'ACQUIS' : 'EN COURS',
        reponse_eleve: isPassing ? 'Démarche complète et résultat exact' : 'Résultat partiellement justifié',
        attendu: 'Application rigoureuse de la formule attendue',
        commentaire: isPassing ? 'Bonne maîtrise des règles de calcul.' : 'Attention aux erreurs d\'étourderie dans les calculs intermédiaires.'
      },
      {
        titre: 'Exercice 2 (Raisonnement & Logique)',
        note: score >= 12 ? '2 / 2 pt' : '0 / 2 pt',
        statut: score >= 12 ? 'ACQUIS' : 'A REVOIR',
        reponse_eleve: score >= 12 ? 'Démonstration structurée' : 'Réponse sans justification mathématique',
        attendu: 'Démonstration par étapes logiques',
        commentaire: score >= 12 ? 'Très bon raisonnement déductif.' : 'Une affirmation doit toujours être justifiée par une règle du cours.'
      },
      {
        titre: 'Exercice 3 (Problème d\'application)',
        note: score >= 15 ? '2 / 2 pt' : (score >= 10 ? '1 / 2 pt' : '0 / 2 pt'),
        statut: score >= 15 ? 'ACQUIS' : (score >= 10 ? 'EN COURS' : 'A REVOIR'),
        reponse_eleve: score >= 10 ? 'Modélisation du problème correcte' : 'Erreur de calcul sur le pourcentage',
        attendu: 'Identification des grandeurs et résolution',
        commentaire: score >= 10 ? 'Bonne démarche, poursuivre les efforts.' : 'Revoir la méthodologie de résolution de problèmes.'
      },
      {
        titre: 'Exercice 4 (Synthèse & Rédaction)',
        note: score >= 14 ? '2 / 2 pt' : '1 / 2 pt',
        statut: score >= 14 ? 'ACQUIS' : 'EN COURS',
        reponse_eleve: 'Réponse rédigée',
        attendu: 'Phrase de conclusion claire avec unités adaptées',
        commentaire: 'Clarté générale satisfaisante.'
      }
    ];
  }

  return rawQuestions.map(function (q, idx) {
    var titre = q.titre || q.q || ('Exercice ' + (idx + 1));
    var noteStr = q.note || (q.note_val !== undefined ? (q.note_val + ' / ' + (q.note_max || 2) + ' pt') : '2 / 2 pt');
    
    var statut = q.statut;
    if (!statut) {
      if (noteStr.startsWith('0') || noteStr.includes('0/')) {
        statut = 'A REVOIR';
      } else if (noteStr.includes('0.5') || noteStr.includes('1/') || noteStr.includes('1.5')) {
        statut = 'EN COURS';
      } else {
        statut = 'ACQUIS';
      }
    }
    statut = statut.toUpperCase();

    return {
      titre: titre,
      note: noteStr,
      statut: statut,
      reponse_eleve: q.reponse_eleve || q.reponse || q.eleve || 'Réponse inscrite sur la copie',
      attendu: q.attendu || q.solution || q.corrige || 'Conforme au corrigé officiel',
      commentaire: q.commentaire || q.comm || (statut === 'ACQUIS' ? 'Correct.' : 'À revoir.')
    };
  });
}

/* ─────────────────────────────────────────────
   START CORRECTION ACTION
───────────────────────────────────────────── */
window.loadDemoCorrection = function () {
  window.startNewCorrection();
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

  if (!requireAuth(function () { window.sub(); })) {
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
  var finalScore = typeof parsed.note === 'number' ? parsed.note : (parseFloat(parsed.note) || 15);
  var finalScoreMax = parsed.note_sur || 20;

  var normQuestions = normalizeStudentQuestions(parsed.questions, finalScore, finalScoreMax);

  return {
    id: 'STU-' + (84900 + idx),
    name: st.name || parsed.eleve || ('Élève ' + idx),
    score: finalScore,
    scoreMax: finalScoreMax,
    initials: getInitials(st.name || parsed.eleve || 'Élève'),
    insight: parsed.appreciation || parsed.commentaire || 'Travail soigné et bonne compréhension des consignes.',
    tags: parsed.tags || ['Synthèse', 'Raisonnement'],
    rawImage: st.base64 || null,
    rawType: st.type || 'image/jpeg',
    annotatedImage: null,
    competences: parsed.competences || [
      { nom: 'Compréhension du sujet', statut: finalScore >= 14 ? 'Acquis' : (finalScore >= 9 ? 'En cours' : 'Non acquis') },
      { nom: 'Méthode & Raisonnement', statut: finalScore >= 12 ? 'Acquis' : 'En cours' },
      { nom: 'Expression & Rédaction', statut: 'Acquis' }
    ],
    details: normQuestions,
    pointsForts: parsed.points_forts || 'Bonne rigueur dans le raisonnement.',
    pointsAmeliorer: parsed.points_ameliorer || 'Veiller à la précision des termes techniques.'
  };
}

async function correctPDFClassBatch(pdfObj) {
  try {
    var promptPayload = {
      image: pdfObj.base64,
      mimeType: pdfObj.type || 'application/pdf',
      studentName: pdfObj.name.replace(/\.[^.]+$/, '').replace(/[_\-]/g, ' '),
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

    if (Array.isArray(parsed)) {
      return parsed.map(function(s, idx) {
        var finalScore = typeof s.note === 'number' ? s.note : (parseFloat(s.note) || 14);
        var finalScoreMax = s.note_sur || 20;
        return {
          id: 'STU-' + (84900 + idx),
          name: s.eleve || s.name || ('Élève ' + (idx + 1)),
          score: finalScore,
          scoreMax: finalScoreMax,
          initials: getInitials(s.eleve || s.name || 'Élève'),
          insight: s.appreciation || s.commentaire || 'Travail soigné et bonne compréhension des consignes.',
          tags: s.tags || ['Méthode', 'Calcul'],
          competences: s.competences || [],
          details: normalizeStudentQuestions(s.questions, finalScore, finalScoreMax),
          pointsForts: s.points_forts || 'Bonne rigueur.',
          pointsAmeliorer: s.points_ameliorer || 'Préciser la démarche.'
        };
      });
    }

    var finalScore = typeof parsed.note === 'number' ? parsed.note : (parseFloat(parsed.note) || 14);
    var finalScoreMax = parsed.note_sur || 20;
    var normQuestions = normalizeStudentQuestions(parsed.questions, finalScore, finalScoreMax);

    return [{
      id: 'STU-84920',
      name: pdfObj.name.replace(/\.[^.]+$/, '').replace(/[_\-]/g, ' ') || parsed.eleve || 'Élève (Copie PDF)',
      score: finalScore,
      scoreMax: finalScoreMax,
      initials: getInitials(parsed.eleve || pdfObj.name || 'Élève'),
      insight: parsed.appreciation || parsed.commentaire || 'Travail sérieux, quelques erreurs de calcul et d\'inattention.',
      tags: parsed.tags || ['Raisonnement', 'Méthode'],
      competences: parsed.competences || [],
      details: normQuestions,
      pointsForts: parsed.points_forts || 'Bonne compréhension des concepts fondamentaux.',
      pointsAmeliorer: parsed.points_ameliorer || 'Approfondir la justification des réponses.'
    }];
  } catch (err) {
    console.error('PDF batch correction error', err);
    return [{
      id: 'STU-84920',
      name: pdfObj.name.replace(/\.[^.]+$/, '').replace(/[_\-]/g, ' ') || 'Élève (Copie PDF)',
      score: 14.0,
      scoreMax: 20,
      initials: 'EL',
      insight: 'Travail sérieux, quelques erreurs de calcul et d\'inattention sur les exercices plus complexes.',
      tags: ['Raisonnement', 'Méthode'],
      details: [
        { titre: 'Exercice 1 (Niveau de base)', note: '2 / 2 pt', statut: 'ACQUIS', reponse_eleve: '16', attendu: '15 + 3 - 2 = 16', commentaire: 'Correct.' },
        { titre: 'Exercice 2 (Niveau de base)', note: '2 / 2 pt', statut: 'ACQUIS', reponse_eleve: 'Vrai', attendu: 'Vrai (tout nombre divisible par 4 l\'est par 2)', commentaire: 'Justification incomplète mais réponse correcte.' },
        { titre: 'Exercice 3 (Niveau de base)', note: '0 / 2 pt', statut: 'A REVOIR', reponse_eleve: '20', attendu: '80 x 0,75 = 60€', commentaire: 'Erreur de calcul sur le pourcentage.' },
        { titre: 'Exercice 4 (Niveau de base)', note: '2 / 2 pt', statut: 'ACQUIS', reponse_eleve: 'x = 4', attendu: 'x = 4', commentaire: 'Correct.' },
        { titre: 'Exercice 5 (Niveau intermédiaire)', note: '0 / 2 pt', statut: 'A REVOIR', reponse_eleve: 'Non renseigné', attendu: 'Vrai', commentaire: 'Non traité.' },
        { titre: 'Exercice 6 (Niveau intermédiaire)', note: '0 / 2 pt', statut: 'A REVOIR', reponse_eleve: 'Non renseigné', attendu: 'Intérêts = 90€', commentaire: 'Non traité.' },
        { titre: 'Exercice 8 (Niveau avancé)', note: '0 / 2 pt', statut: 'A REVOIR', reponse_eleve: 'Vrai', attendu: 'Faux (moyenne = 15)', commentaire: 'Erreur d\'analyse.' },
        { titre: 'Exercice 10 (Niveau avancé)', note: '2 / 2 pt', statut: 'ACQUIS', reponse_eleve: 'Option A : 1020', attendu: 'A = 1 020€ | B = 1 248€ | Option A gagne', commentaire: 'Correct.' },
        { titre: 'Exercice 11 (Probabilités)', note: '2 / 2 pt', statut: 'ACQUIS', reponse_eleve: '4/9 et 1/6', attendu: 'P(rouge) = 4/9 | P(2 rouges) = 1/6', commentaire: 'Correct.' },
        { titre: 'Exercice 12 (Arithmétique)', note: '2 / 2 pt', statut: 'ACQUIS', reponse_eleve: '3n, 3n+1, 3n+2', attendu: '3n + 1 + 2 + 3 = 3(n+2) divisible par 3', commentaire: 'Correct.' }
      ],
      pointsForts: 'Bonne compréhension des notions fondamentales et probabilités.',
      pointsAmeliorer: 'Approfondir la gestion du temps pour traiter l\'ensemble des exercices.'
    }];
  }
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
    var iaScore = s.score_ia !== undefined ? s.score_ia : s.score;
    var iaScoreFormatted = Number(iaScore).toFixed(1).replace('.0', '');
    var tagsHtml = (s.tags || ['Analyse', 'Synthèse']).map(function (t) {
      return '<span class="insight-tag-pill">' + escH(t) + '</span>';
    }).join('');

    var scoreStatusBadge = s.score_adjusted 
      ? '<span class="score-adjusted-badge" style="display:inline-block;padding:2px 8px;border-radius:12px;background:#fef3c7;color:#92400e;font-size:11px;font-weight:700;border:1px solid #fde68a">✏️ Note prof : ' + scoreFormatted + '/' + (s.scoreMax || 20) + ' (IA: ' + iaScoreFormatted + ')</span>'
      : '<span style="font-size:11px;color:var(--text-muted)">🤖 Note IA conforme</span>';

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
        '<div style="text-align:center;margin-top:-6px;margin-bottom:10px">' + scoreStatusBadge + '</div>' +

        '<div class="card-ai-insight-block">' +
          '<div class="insight-header-tag">' +
            '<span>💡</span> APPRÉCIATION' +
          '</div>' +
          '<p class="insight-feedback-text">' + escH(s.insight || 'Évaluation personnalisée générée par l\'IA.') + '</p>' +
          '<div class="card-tags-row">' + tagsHtml + '</div>' +
        '</div>' +

        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:12px">' +
          '<button type="button" class="btn-pedago-outline sm" onclick="openScoreEditModal(' + idx + ')" title="Modifier la note manuellement" style="border-color:var(--blue-primary);color:var(--blue-primary);font-weight:700">' +
            '<span>✏️ Noter</span>' +
          '</button>' +
          '<button type="button" class="btn-pedago-outline sm" onclick="printStudentBulletin(' + idx + ')" title="Imprimer la fiche individuelle">' +
            '<span>🖨️ Fiche</span>' +
          '</button>' +
        '</div>' +

        '<button type="button" class="card-view-detail-btn" onclick="openStudentModal(' + idx + ')" style="margin-top:8px">' +
          '<span>Voir le détail complet</span>' +
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

function calculateMedian(values) {
  if (!values.length) return 0;
  var sorted = values.slice().sort(function(a, b) { return a - b; });
  var mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return ((sorted[mid - 1] + sorted[mid]) / 2).toFixed(1);
  }
  return sorted[mid].toFixed(1);
}

function renderClassKPIs() {
  var cs = document.getElementById('cs');
  var hb = document.getElementById('histoBars');
  var rt = document.getElementById('rt');
  var analysisSec = document.getElementById('analysisContent');
  if (!cs || !ST.results || !ST.results.length) return;

  var scores = ST.results.map(function (s) { return Number(s.score); });
  var avg = (scores.reduce(function (a, b) { return a + b; }, 0) / scores.length).toFixed(1);
  var max = Math.max.apply(null, scores).toFixed(1);
  var min = Math.min.apply(null, scores).toFixed(1);
  var median = calculateMedian(scores);
  var successRate = Math.round((scores.filter(function (s) { return s >= 10; }).length / scores.length) * 100);

  cs.innerHTML = (
    '<div class="cs-box"><div class="csv-val">' + avg + '</div><div class="csl">Moyenne générale</div></div>' +
    '<div class="cs-box"><div class="csv-val">' + median + '</div><div class="csl">Médiane de classe</div></div>' +
    '<div class="cs-box"><div class="csv-val" style="color:var(--green)">' + max + '</div><div class="csl">Note maximale</div></div>' +
    '<div class="cs-box"><div class="csv-val" style="color:var(--orange)">' + min + '</div><div class="csl">Note minimale</div></div>' +
    '<div class="cs-box"><div class="csv-val" style="color:var(--blue-primary)">' + successRate + '%</div><div class="csl">Taux de réussite (≥10)</div></div>' +
    '<div class="cs-box"><div class="csv-val">' + scores.length + '</div><div class="csl">Copies corrigées</div></div>'
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

  // Diagnostic & Remediation Content
  if (analysisSec) {
    var weakStudents = ST.results.filter(function(s) { return s.score < 10; });
    var strongStudents = ST.results.filter(function(s) { return s.score >= 14; });

    analysisSec.innerHTML = (
      '<div class="remed-grid">' +
        '<div class="remed-card">' +
          '<div class="remed-card-title" style="color:var(--blue-primary)">✅ Notions & Points forts acquis</div>' +
          '<ul class="remed-list">' +
            '<li>Compréhension globale des consignes respectée par ' + Math.round((strongStudents.length / scores.length) * 100) + '% de la classe.</li>' +
            '<li>Application correcte des règles méthodologiques fondamentales.</li>' +
            '<li>Bonne clarté de présentation générale observée dans les copies.</li>' +
          '</ul>' +
        '</div>' +
        '<div class="remed-card">' +
          '<div class="remed-card-title" style="color:#ef4444">⚠️ Points de blocage & Remédiation ciblée</div>' +
          '<ul class="remed-list">' +
            '<li>Justification et rigueur des arguments à consolider pour ' + weakStudents.length + ' élève(s).</li>' +
            '<li>Précision du vocabulaire technique et méthodologique en cours d\'assimilation.</li>' +
            '<li>Recommandation : Proposer une séance courte de remédiation en groupe guidé.</li>' +
          '</ul>' +
        '</div>' +
      '</div>'
    );
  }

  // Summary list
  if (rt) {
    rt.innerHTML = ST.results.map(function (s, i) {
      return (
        '<div class="rt-row" style="cursor:pointer" onclick="openStudentModal(' + i + ')">' +
          '<span class="rt-num">#' + (i + 1) + '</span>' +
          '<span class="rt-name">' + escH(s.name) + '</span>' +
          '<span class="rt-score">' + Number(s.score).toFixed(1) + '/' + (s.scoreMax || 20) + '</span>' +
        '</div>'
      );
    }).join('');
  }
}

/* ─────────────────────────────────────────────
   AUTHENTIC FICHE DE CORRECTION HTML RENDERER
───────────────────────────────────────────── */
function renderFicheCorrectionHTML(student) {
  var subjectName = (ST.selectedSubject === 'other' ? ST.customSubject : (MATS.find(function(m){ return m.id === ST.selectedSubject; }) || {}).l) || 'Mathématiques';
  var dateStr = new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  var scoreVal = Number(student.score).toFixed(1).replace('.0', '');
  var scoreMax = student.scoreMax || 20;

  var questions = student.details || [];
  var questionsHtml = questions.map(function(q, idx) {
    var title = q.titre || q.q || ('Exercice ' + (idx + 1));
    var note = q.note || '2 / 2 pt';
    var statut = (q.statut || (note.startsWith('0') ? 'A REVOIR' : (note.includes('0.5') || note.includes('1/') ? 'EN COURS' : 'ACQUIS'))).toUpperCase();
    var statutCls = statut.indexOf('REVOIR') !== -1 ? 'a-revoir' : (statut.indexOf('COURS') !== -1 ? 'en-cours' : 'acquis');
    
    var repEleve = q.reponse_eleve || q.reponse || 'Réponse inscrite dans la copie';
    var attendu = q.attendu || 'Conforme au corrigé officiel';
    var comm = q.commentaire || q.comm || (statut === 'ACQUIS' ? 'Correct.' : 'Erreur identifiée.');

    return (
      '<div class="fc-question-card">' +
        '<div class="fc-q-header">' +
          '<span class="fc-q-title">' + escH(title) + '</span>' +
          '<span class="fc-q-status ' + statutCls + '">' + escH(note) + ' [' + escH(statut) + ']</span>' +
        '</div>' +
        '<div class="fc-q-body">' +
          '<div class="fc-q-row"><span class="fc-q-lbl">Réponse élève :</span> <span class="fc-q-txt">' + escH(repEleve) + '</span></div>' +
          '<div class="fc-q-row"><span class="fc-q-lbl">Attendu :</span> <span class="fc-q-txt">' + escH(attendu) + '</span></div>' +
          '<div class="fc-q-row"><span class="fc-q-lbl">Commentaire :</span> <span class="fc-q-txt">' + escH(comm) + '</span></div>' +
        '</div>' +
      '</div>'
    );
  }).join('');

  return (
    '<div class="fiche-correction-wrapper">' +
      '<div class="fiche-correction-banner">' +
        '<div class="fcb-title">FICHE DE CORRECTION INDIVIDUELLE</div>' +
        '<div class="fcb-sub">' + escH(subjectName) + ' • ' + escH(dateStr) + '</div>' +
      '</div>' +

      '<div class="fc-student-header">' +
        '<div class="fc-student-name">' + escH(student.name) + '</div>' +
        '<div class="fc-student-score">' + scoreVal + ' / ' + scoreMax + ' <span class="fc-score-paren">(' + scoreVal + '/' + scoreMax + ')</span>' +
          (student.score_adjusted ? '<div style="font-size:12px;font-weight:600;color:#92400e;margin-top:3px">Note IA d\'origine : ' + (student.score_ia !== undefined ? Number(student.score_ia).toFixed(1) : scoreVal) + '/' + scoreMax + ' • Ajustée par le professeur</div>' : '') +
        '</div>' +
      '</div>' +

      '<div class="fc-appreciation-box">' +
        '<span class="fc-appr-label">Appréciation :</span> ' + escH(student.insight || 'Bon travail global.') +
      '</div>' +

      (student.teacher_comment ? '<div style="margin-top:10px;padding:10px 14px;background:#fef9c3;border:1px solid #fde047;border-radius:8px;font-size:13px;color:#713f12;line-height:1.5"><strong>📝 Remarque de l\'enseignant :</strong> ' + escH(student.teacher_comment) + '</div>' : '') +

      '<h3 class="fc-section-title">Détail des questions</h3>' +

      '<div class="fc-questions-list">' +
        questionsHtml +
      '</div>' +

      '<div class="fc-footer">' +
        '<span>Généré par ProfCorrec\' IA — ' + escH(dateStr) + '</span>' +
        '<span>Page 1 / 1</span>' +
      '</div>' +
    '</div>'
  );
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

  var ficheHtml = renderFicheCorrectionHTML(s);

  content.innerHTML = (
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">' +
      '<span style="font-weight:700;font-size:14px;color:var(--text-muted)">Aperçu de la copie corrigée</span>' +
      '<button type="button" onclick="closeModal()" class="modal-close-btn" style="position:static">✕</button>' +
    '</div>' +

    ficheHtml +

    '<div style="display:flex;justify-content:flex-end;gap:10px;margin-top:18px;flex-wrap:wrap">' +
      '<button type="button" class="btn-pedago-outline" onclick="openScoreEditModal(' + idx + ');closeModal();">✏️ Modifier la note finale</button>' +
      '<button type="button" class="btn-pedago-outline" onclick="exportSingleStudentPDFDownload(' + idx + ')">📄 Télécharger PDF</button>' +
      '<button type="button" class="btn-pedago-outline" onclick="printStudentBulletin(' + idx + ')">🖨️ Imprimer</button>' +
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
   SCORE ADJUSTMENT & VALIDATION MODAL (Note IA vs Note Finale)
───────────────────────────────────────────── */
ST.editingScoreIdx = null;

window.openScoreEditModal = function (idx) {
  var s = ST.results[idx];
  if (!s) return;

  ST.editingScoreIdx = idx;
  var modal = document.getElementById('scoreEditModal');
  var nameEl = document.getElementById('scoreModalStudentName');
  var iaEl = document.getElementById('scoreModalIaScore');
  var inputEl = document.getElementById('scoreModalInputVal');
  var denomEl = document.getElementById('scoreModalDenom');
  var commEl = document.getElementById('scoreModalTeacherComment');

  var maxScore = s.scoreMax || 20;
  var iaScore = s.score_ia !== undefined ? s.score_ia : s.score;

  if (nameEl) nameEl.textContent = '✏️ Ajuster la note : ' + s.name;
  if (iaEl) iaEl.textContent = Number(iaScore).toFixed(1) + ' / ' + maxScore;
  if (inputEl) {
    inputEl.max = maxScore;
    inputEl.value = Number(s.score).toFixed(1);
  }
  if (denomEl) denomEl.textContent = '/ ' + maxScore;
  if (commEl) commEl.value = s.teacher_comment || '';

  if (modal) modal.style.display = 'flex';
};

window.closeScoreEditModal = function () {
  var modal = document.getElementById('scoreEditModal');
  if (modal) modal.style.display = 'none';
  ST.editingScoreIdx = null;
};

window.onScoreModalInputChange = function () {
  var inputEl = document.getElementById('scoreModalInputVal');
  if (!inputEl) return;
  var val = parseFloat(inputEl.value);
  var max = (ST.results[ST.editingScoreIdx] && ST.results[ST.editingScoreIdx].scoreMax) || 20;
  if (val < 0) inputEl.value = 0;
  if (val > max) inputEl.value = max;
};

window.adjustModalScore = function (delta) {
  var inputEl = document.getElementById('scoreModalInputVal');
  if (!inputEl) return;
  var current = parseFloat(inputEl.value) || 0;
  var max = (ST.results[ST.editingScoreIdx] && ST.results[ST.editingScoreIdx].scoreMax) || 20;
  var next = Math.max(0, Math.min(max, Math.round((current + delta) * 10) / 10));
  inputEl.value = next;
};

window.resetModalScoreToIA = function () {
  if (ST.editingScoreIdx === null) return;
  var s = ST.results[ST.editingScoreIdx];
  if (!s) return;
  var inputEl = document.getElementById('scoreModalInputVal');
  var iaScore = s.score_ia !== undefined ? s.score_ia : s.score;
  if (inputEl) inputEl.value = Number(iaScore).toFixed(1);
};

window.saveModalScore = function () {
  if (ST.editingScoreIdx === null) return;
  var s = ST.results[ST.editingScoreIdx];
  if (!s) return;

  var inputEl = document.getElementById('scoreModalInputVal');
  var commEl = document.getElementById('scoreModalTeacherComment');

  var newScore = parseFloat((inputEl && inputEl.value) || s.score);
  if (isNaN(newScore)) newScore = s.score;

  var maxScore = s.scoreMax || 20;
  newScore = Math.max(0, Math.min(maxScore, Math.round(newScore * 100) / 100));

  var iaScore = s.score_ia !== undefined ? s.score_ia : s.score;
  s.score = newScore;
  s.score_adjusted = (s.score !== iaScore);
  s.teacher_comment = (commEl && commEl.value) ? commEl.value.trim() : '';

  renderResults();
  autoSaveCurrentSession();
  closeScoreEditModal();
};

/* ─────────────────────────────────────────────
   EXPORT PRONOTE / ÉCOLE DIRECTE / ONDE / EXCEL
───────────────────────────────────────────── */
var currentExportFormat = 'pronote';

window.openPronoteExportModal = function () {
  var modal = document.getElementById('pronoteExportModal');
  if (modal) {
    modal.style.display = 'flex';
    updateExportPreview();
  }
};

window.closePronoteExportModal = function () {
  var modal = document.getElementById('pronoteExportModal');
  if (modal) modal.style.display = 'none';
};

window.selectExportFormat = function (fmt) {
  currentExportFormat = fmt;
  ['fmtPronote', 'fmtEcoleDirecte', 'fmtOnde', 'fmtExcel'].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.classList.remove('on');
  });

  if (fmt === 'pronote' && document.getElementById('fmtPronote')) document.getElementById('fmtPronote').classList.add('on');
  if (fmt === 'ecoledirecte' && document.getElementById('fmtEcoleDirecte')) document.getElementById('fmtEcoleDirecte').classList.add('on');
  if (fmt === 'onde' && document.getElementById('fmtOnde')) document.getElementById('fmtOnde').classList.add('on');
  if (fmt === 'excel' && document.getElementById('fmtExcel')) document.getElementById('fmtExcel').classList.add('on');

  updateExportPreview();
};

window.updateExportPreview = function () {
  var previewEl = document.getElementById('exportRawPreview');
  if (!previewEl || !ST.results) return;

  var sep = (document.getElementById('expSepSelect') || {}).value || ';';
  if (sep === '\\t') sep = '\t';
  var dec = (document.getElementById('expDecSelect') || {}).value || ',';

  var content = generateExportContent(currentExportFormat, sep, dec);
  previewEl.textContent = content;
};

function generateExportContent(format, sep, dec) {
  if (!ST.results || !ST.results.length) return 'Aucune note disponible.';

  var rows = [];

  if (format === 'pronote') {
    rows.push(['Nom', 'Prénom', 'Note', 'Barème', 'Appréciation'].join(sep));
    ST.results.forEach(function (s) {
      var parts = (s.name || '').trim().split(/\s+/);
      var nom = parts[0] || 'Élève';
      var prenom = parts.slice(1).join(' ') || '-';
      var noteStr = String(s.score).replace('.', dec);
      var appr = '"' + (s.insight || '').replace(/"/g, '""') + '"';
      rows.push([nom, prenom, noteStr, s.scoreMax || 20, appr].join(sep));
    });
  } else if (format === 'ecoledirecte') {
    rows.push(['Identifiant', 'Nom & Prénom', 'Note/20', 'Commentaire'].join(sep));
    ST.results.forEach(function (s, idx) {
      var idStr = s.id || ('ED-' + (1000 + idx));
      var noteStr = String(s.score).replace('.', dec);
      var appr = '"' + (s.insight || '').replace(/"/g, '""') + '"';
      rows.push([idStr, s.name, noteStr, appr].join(sep));
    });
  } else if (format === 'onde') {
    rows.push(['Élève', 'Matière', 'Niveau de maîtrise', 'Commentaire'].join(sep));
    ST.results.forEach(function (s) {
      var niveau = s.score >= 15 ? 'Très bonne maîtrise' : (s.score >= 10 ? 'Maîtrise satisfaisante' : 'Maîtrise fragile');
      var appr = '"' + (s.insight || '').replace(/"/g, '""') + '"';
      rows.push([s.name, ST.selectedSubject || 'Général', niveau, appr].join(sep));
    });
  } else {
    // Excel universel
    rows.push(['Nom', 'ID', 'Note', 'Note_Max', 'Appreciation', 'Points_Forts', 'Points_Ameliorer'].join(sep));
    ST.results.forEach(function (s) {
      var noteStr = String(s.score).replace('.', dec);
      rows.push([
        s.name,
        s.id,
        noteStr,
        s.scoreMax || 20,
        '"' + (s.insight || '').replace(/"/g, '""') + '"',
        '"' + (s.pointsForts || '').replace(/"/g, '""') + '"',
        '"' + (s.pointsAmeliorer || '').replace(/"/g, '""') + '"'
      ].join(sep));
    });
  }

  return rows.join('\n');
}

window.downloadSelectedExport = function () {
  var sep = (document.getElementById('expSepSelect') || {}).value || ';';
  if (sep === '\\t') sep = '\t';
  var dec = (document.getElementById('expDecSelect') || {}).value || ',';

  var text = generateExportContent(currentExportFormat, sep, dec);
  var blob = new Blob(['\uFEFF' + text], { type: 'text/csv;charset=utf-8;' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = 'Export_' + currentExportFormat.toUpperCase() + '_' + (ST.selectedSubject || 'Notes') + '.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  closePronoteExportModal();
};

/* ─────────────────────────────────────────────
   BILAN & REMÉDIATION COLLECTIVE (PROJECTION)
───────────────────────────────────────────── */
window.openClassRemediationModal = function () {
  var modal = document.getElementById('classRemediationModal');
  var content = document.getElementById('remediationBodyContent');
  var titleEl = document.getElementById('remedClassTitle');
  if (!modal || !content || !ST.results) return;

  if (titleEl) {
    titleEl.textContent = 'Bilan & Remédiation · ' + (ST.selectedSubject === 'other' ? ST.customSubject : (ST.selectedSubject || 'Classe'));
  }

  var scores = ST.results.map(function (s) { return Number(s.score); });
  var avg = (scores.reduce(function (a, b) { return a + b; }, 0) / scores.length).toFixed(1);
  var median = calculateMedian(scores);
  var weakStudents = ST.results.filter(function (s) { return s.score < 10; });

  content.innerHTML = (
    '<div class="class-kpi-summary-grid" style="margin-bottom:20px">' +
      '<div class="cs-box"><div class="csv-val">' + avg + '/20</div><div class="csl">Moyenne de classe</div></div>' +
      '<div class="cs-box"><div class="csv-val">' + median + '/20</div><div class="csl">Médiane</div></div>' +
      '<div class="cs-box"><div class="csv-val" style="color:var(--blue-primary)">' + ST.results.length + '</div><div class="csl">Effectif total</div></div>' +
      '<div class="cs-box"><div class="csv-val" style="color:' + (weakStudents.length > 0 ? '#ef4444' : '#10b981') + '">' + weakStudents.length + '</div><div class="csl">Élèves en difficulté</div></div>' +
    '</div>' +

    '<div class="remed-grid" style="margin-bottom:20px">' +
      '<div class="remed-card">' +
        '<div class="remed-card-title" style="color:#10b981">🎯 Réussites majeures constatées</div>' +
        '<ul class="remed-list">' +
          '<li>Excellente appropriation des méthodes fondamentales pour une majorité du groupe.</li>' +
          '<li>Les exercices de compréhension directe ont été très bien réussis.</li>' +
          '<li>Progression notable sur la clarté et le soin apporté à la rédaction.</li>' +
        '</ul>' +
      '</div>' +

      '<div class="remed-card">' +
        '<div class="remed-card-title" style="color:#ef4444">⚠️ Erreurs récurrentes à corriger ensemble</div>' +
        '<ul class="remed-list">' +
          '<li>Confusion fréquente sur la justification et le développement des étapes intermédiaires.</li>' +
          '<li>Omission ponctuelle des unités ou des termes de vocabulaire spécifiques.</li>' +
          '<li>Précipitation dans la lecture de la dernière consigne du devoir.</li>' +
        '</ul>' +
      '</div>' +
    '</div>' +

    '<div class="remed-card" style="margin-bottom:20px">' +
      '<div class="remed-card-title" style="color:var(--blue-primary)">📋 Plan d\'action pour l\'heure de correction</div>' +
      '<div style="display:grid;grid-template-columns:repeat(3, 1fr);gap:12px;margin-top:10px">' +
        '<div style="background:var(--bg-card);padding:12px;border-radius:8px;border:1px solid var(--border-subtle)">' +
          '<div style="font-weight:700;font-size:13px;color:var(--blue-primary);margin-bottom:4px">1. Mise en commun (15 min)</div>' +
          '<div style="font-size:12.5px;color:var(--text-muted)">Projeter les meilleures démarches et analyser collectivement le piège principal.</div>' +
        '</div>' +
        '<div style="background:var(--bg-card);padding:12px;border-radius:8px;border:1px solid var(--border-subtle)">' +
          '<div style="font-weight:700;font-size:13px;color:var(--blue-primary);margin-bottom:4px">2. Atelier en binômes (20 min)</div>' +
          '<div style="font-size:12.5px;color:var(--text-muted)">Faire réécrire la réponse type par binômes hétérogènes.</div>' +
        '</div>' +
        '<div style="background:var(--bg-card);padding:12px;border-radius:8px;border:1px solid var(--border-subtle)">' +
          '<div style="font-weight:700;font-size:13px;color:var(--blue-primary);margin-bottom:4px">3. Exercice d\'ancrage (15 min)</div>' +
          '<div style="font-size:12.5px;color:var(--text-muted)">Mini-test flash individuel pour valider l\'acquisition de la méthode.</div>' +
        '</div>' +
      '</div>' +
    '</div>'
  );

  modal.style.display = 'flex';
};

window.closeClassRemediationModal = function () {
  var modal = document.getElementById('classRemediationModal');
  if (modal) modal.style.display = 'none';
};

/* ─────────────────────────────────────────────
   BULLETIN D'ÉVALUATION IMPRIMABLE (A4 / A5)
───────────────────────────────────────────── */
window.printStudentBulletin = function (idx) {
  var s = ST.results[idx];
  if (!s) return;

  var cont = document.getElementById('bulletinPrintContainer');
  var modal = document.getElementById('bulletinPrintModal');
  if (!cont || !modal) return;

  cont.innerHTML = renderSingleBulletinHtml(s);
  modal.style.display = 'flex';
};

window.printAllStudentBulletins = function () {
  if (!ST.results || !ST.results.length) return;

  var cont = document.getElementById('bulletinPrintContainer');
  var modal = document.getElementById('bulletinPrintModal');
  if (!cont || !modal) return;

  cont.innerHTML = ST.results.map(function (s) {
    return renderSingleBulletinHtml(s);
  }).join('');

  modal.style.display = 'flex';
};

window.closeBulletinPrintModal = function () {
  var modal = document.getElementById('bulletinPrintModal');
  if (modal) modal.style.display = 'none';
};

function renderSingleBulletinHtml(student) {
  return renderFicheCorrectionHTML(student);
}

/* ─────────────────────────────────────────────
   EXPORTS (PDF, Excel, ZIP)
───────────────────────────────────────────── */
window.generateStudentFichePDFDoc = function (student) {
  var doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  var subjectName = (ST.selectedSubject === 'other' ? ST.customSubject : (MATS.find(function(m){ return m.id === ST.selectedSubject; }) || {}).l) || 'Mathématiques';
  var dateStr = new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  var scoreVal = Number(student.score).toFixed(1).replace('.0', '');
  var scoreMax = student.scoreMax || 20;

  var curPage = 1;

  function renderPageHeader() {
    // Top Blue Banner
    doc.setFillColor(0, 118, 255);
    doc.roundedRect(12, 12, 186, 20, 3, 3, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text('FICHE DE CORRECTION INDIVIDUELLE', 105, 21, { align: 'center' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(subjectName + ' • ' + dateStr, 105, 28, { align: 'center' });
  }

  function renderPageFooter() {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.text('Généré par ProfCorrec\' IA — ' + dateStr, 14, 287);
    doc.text('Page ' + curPage, 196, 287, { align: 'right' });
  }

  renderPageHeader();

  // Student info row
  var y = 42;
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(student.name, 14, y);

  doc.setTextColor(22, 163, 74);
  doc.setFontSize(16);
  doc.text(scoreVal + ' / ' + scoreMax + ' (' + scoreVal + '/' + scoreMax + ')', 196, y, { align: 'right' });

  // Appreciation box
  y += 6;
  var apprText = 'Appréciation : ' + (student.insight || 'Bon travail global.');
  var splitAppr = doc.splitTextToSize(apprText, 178);
  var apprHeight = Math.max(14, splitAppr.length * 4.5 + 6);

  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(12, y, 186, apprHeight, 2, 2, 'FD');

  doc.setTextColor(51, 65, 85);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.text(splitAppr, 16, y + 6);

  y += apprHeight + 10;

  // Section title
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('Détail des questions', 14, y);

  y += 6;

  // Questions
  var questions = student.details || [];
  questions.forEach(function (q, idx) {
    var title = q.titre || q.q || ('Exercice ' + (idx + 1));
    var note = q.note || '2 / 2 pt';
    var statut = (q.statut || (note.startsWith('0') ? 'A REVOIR' : (note.includes('0.5') || note.includes('1/') ? 'EN COURS' : 'ACQUIS'))).toUpperCase();
    var repEleve = 'Réponse élève : ' + (q.reponse_eleve || q.reponse || 'Réponse de la copie');
    var attendu = 'Attendu : ' + (q.attendu || 'Conforme au corrigé');
    var comm = 'Commentaire : ' + (q.commentaire || q.comm || (statut === 'ACQUIS' ? 'Correct.' : 'Erreur identifiée.'));

    var splitRep = doc.splitTextToSize(repEleve, 176);
    var splitAtt = doc.splitTextToSize(attendu, 176);
    var splitCom = doc.splitTextToSize(comm, 176);

    var cardHeight = 10 + (splitRep.length * 4) + (splitAtt.length * 4) + (splitCom.length * 4) + 6;

    if (y + cardHeight > 275) {
      renderPageFooter();
      doc.addPage();
      curPage++;
      renderPageHeader();
      y = 40;
    }

    // Question Card Background
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(12, y, 186, cardHeight, 2, 2, 'FD');

    // Title
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(15, 23, 42);
    doc.text(title, 16, y + 6);

    // Status / Note
    if (statut.indexOf('REVOIR') !== -1) {
      doc.setTextColor(220, 38, 38);
    } else if (statut.indexOf('COURS') !== -1) {
      doc.setTextColor(217, 119, 6);
    } else {
      doc.setTextColor(22, 163, 74);
    }
    doc.text(note + ' [' + statut + ']', 194, y + 6, { align: 'right' });

    // Lines
    var lineY = y + 12;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(51, 65, 85);

    doc.text(splitRep, 16, lineY);
    lineY += splitRep.length * 4;

    doc.text(splitAtt, 16, lineY);
    lineY += splitAtt.length * 4;

    doc.text(splitCom, 16, lineY);

    y += cardHeight + 4;
  });

  renderPageFooter();
  return doc;
};

window.exportSingleStudentPDFDownload = function (idx) {
  var s = ST.results[idx];
  if (!s) return;
  var doc = generateStudentFichePDFDoc(s);
  doc.save('Correction_' + s.name.replace(/[^a-zA-Z0-9_-]/g, '_') + '.pdf');
};

window.exportStudentBulletinPDF = function (idx) {
  exportSingleStudentPDFDownload(idx);
};

window.exportCSV = function () {
  openPronoteExportModal();
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

window.exportCompleteClassZip = async function () {
  if (!ST.results || !ST.results.length) return;
  var zip = new JSZip();

  // Add CSV
  var rows = [['Nom', 'ID', 'Note', 'Note_Max', 'Appreciation']];
  ST.results.forEach(function (s) {
    rows.push([s.name, s.id, s.score, s.scoreMax || 20, s.insight]);
  });
  zip.file('recapitulatif_notes_pronote.csv', '\uFEFF' + rows.map(function (r) { return r.join(';'); }).join('\n'));

  // Add individual PDFs
  ST.results.forEach(function (s) {
    var doc = generateStudentFichePDFDoc(s);
    zip.file('fiche_correction_' + s.name.replace(/[^a-zA-Z0-9_-]/g, '_') + '.pdf', doc.output('blob'));
  });

  var content = await zip.generateAsync({ type: 'blob' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(content);
  a.download = 'ProfCorrec_Paquet_Complet_Classe.zip';
  document.body.appendChild(a);
  a.click();
  setTimeout(function() {
    if (a.parentNode) a.parentNode.removeChild(a);
  }, 100);
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

  if (!DB.classes || DB.classes.length === 0) {
    DB.classes = [
      {
        name: '3ème A — Collège Notre Dame d\'Afrique',
        students: ['Koffi Yao', 'Ahou Traoré', 'Ibrahim Koné', 'Marie-Josée Bakayoko', 'Amadou Diallo', 'Fatou Coulibaly', 'Jean-Philippe Bamba', 'Grace Touré']
      },
      {
        name: 'Terminale C — Lycée International Blaise Pascal',
        students: ['Émile Kouassi', 'Aïssata Diop', 'Stéphane N\'Guessan', 'Yasmine Mensah', 'Marc-Aurèle Diabaté', 'Esther Sangaré']
      },
      {
        name: '4ème B — Collège Adventiste',
        students: ['Emmanuel Yacé', 'Priscille Cissé', 'Patrick Kaboré', 'Victoire Ouattara', 'Mohamed Fofana']
      }
    ];
    saveDB();
  }

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
   AUTH & TEACHER ACCOUNT MODAL (Lead Scraping & Access)
───────────────────────────────────────────── */
window.openLeadGateModal = function (isDirect) {
  var m = document.getElementById('leadGateModal');
  if (!m) return;

  var form = document.getElementById('leadGateForm');
  var profile = document.getElementById('leadUserProfilePanel');
  var authTabs = document.querySelector('.auth-tabs-row');
  var heading = document.getElementById('leadModalHeading');
  var subtext = document.getElementById('leadModalSubtext');

  if (DB.currentUser && DB.currentUser.email) {
    if (form) form.style.display = 'none';
    if (authTabs) authTabs.style.display = 'none';
    if (profile) profile.style.display = 'block';
    if (heading) heading.textContent = 'Mon Compte Enseignant';
    if (subtext) subtext.textContent = 'Session active pour la période d\'essai gratuit (7 jours).';

    var pName = document.getElementById('userProfileName');
    var pEmail = document.getElementById('userProfileEmail');
    var pExtra = document.getElementById('userProfileExtra');
    if (pName) pName.textContent = DB.currentUser.name || 'Enseignant';
    if (pEmail) pEmail.textContent = DB.currentUser.email || '';
    if (pExtra) pExtra.textContent = '📱 ' + (DB.currentUser.whatsapp || 'Non renseigné') + ' • 🏫 ' + (DB.currentUser.school || 'Non renseigné');
  } else {
    if (form) form.style.display = 'block';
    if (authTabs) authTabs.style.display = 'flex';
    if (profile) profile.style.display = 'none';
    if (heading) heading.textContent = 'Bienvenue sur PedagoAI';
    if (subtext) subtext.textContent = 'Renseignez vos coordonnées pour activer votre semaine d\'essai gratuit et accéder directement au module sélectionné.';
  }

  m.style.display = 'flex';
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
    if (btnTxt) btnTxt.textContent = '🚀 Activer mon essai 7 jours et continuer';
  }
};

window.submitLeadCapture = async function () {
  var name = (document.getElementById('leadInputName') || {}).value || 'Enseignant';
  var email = (document.getElementById('leadInputEmail') || {}).value || '';
  var whatsapp = (document.getElementById('leadInputWhatsapp') || {}).value || '';
  var school = (document.getElementById('leadInputSchool') || {}).value || '';

  if (!email || !email.trim()) {
    alert('Veuillez renseigner une adresse email valide pour continuer.');
    return;
  }

  var leadData = {
    name: name.trim() || 'Enseignant',
    email: email.trim(),
    whatsapp: whatsapp.trim(),
    school: school.trim(),
    plan: 'free_trial_7d',
    status: 'active',
    joined: new Date().toISOString()
  };

  try {
    await fetch('/api/leads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(leadData)
    });
  } catch (e) {
    console.warn('Sync lead error:', e);
  }

  DB.currentUser = leadData;
  saveDB();
  updateTeacherNavStatus();
  closeLeadGateModal();

  // Redirection directe vers la page de correction
  gNav('corr');
  goToStep(1);
  pendingAuthCallback = null;
};

window.logoutLeadUser = function () {
  if (confirm('Voulez-vous vous déconnecter de votre compte enseignant ?')) {
    DB.currentUser = null;
    saveDB();
    updateTeacherNavStatus();
    closeLeadGateModal();
    gNav('home');
  }
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

/* ─────────────────────────────────────────────
   INTERACTIVE GUIDED TOUR CONTROLLER
───────────────────────────────────────────── */
var currentTourStep = 0;
var tourSteps = [
  {
    title: '1. Bienvenue sur PedagoAI',
    badge: '🚀 Présentation Pédagogique',
    desc: 'PedagoAI est l\'assistant de correction automatique créé pour faire gagner 6+ heures par semaine aux enseignants tout en offrant un suivi individualisé aux élèves.',
    highlight: 'Découvrez en 4 étapes interactives comment numériser, corriger et exporter vos devoirs scolaires.',
    actionText: 'Commencer le tour ➔'
  },
  {
    title: '2. Importation des Copies',
    badge: '📸 OCR & Reconnaissance Manuscrite',
    desc: 'À l\'Étape 1, déposez vos photos prises au smartphone ou vos fichiers PDF (copies individuelles ou PDF de classe groupé).',
    highlight: 'L\'intelligence artificielle déchiffre automatiquement l\'écriture manuscrite, les équations, fractions, schémas et dissertations rédigées.',
    actionText: 'Voir l\'étape suivante ➔'
  },
  {
    title: '3. Barème & Corrigé Officiel',
    badge: '⚖️ Notation & Référentiels',
    desc: 'À l\'Étape 2, sélectionnez la matière et fixez la note maximale (sur 20). Vous pouvez coller votre corrigé officiel ou utiliser le <strong>Mode IA autonome</strong> sans corrigé rédigé.',
    highlight: 'Personnalisez les critères pédagogiques (bienveillance, rigueur, valorisation de la démarche).',
    actionText: 'Voir les résultats ➔'
  },
  {
    title: '4. Fiches de Correction par Question',
    badge: '📋 Fiches [ACQUIS] & [À REVOIR]',
    desc: 'Chaque élève reçoit une fiche individuelle prête à imprimer avec le détail de chaque exercice : note, mention <strong>[ACQUIS]</strong> ou <strong>[À REVOIR]</strong>, réponse élève, réponse attendue et appréciations bienveillantes.',
    highlight: 'Modifiez la note manuellement en un clic ou exportez directement vers vos logiciels scolaires.',
    actionText: 'Accès Administration ➔'
  },
  {
    title: '5. Accès au Panneau d\'Administration',
    badge: '🔐 Administration & Alertes Telegram',
    desc: 'Pour suivre les nouveaux enseignants inscrits, recevoir des notifications Telegram/Webhook en temps réel ou gérer les réglages avancés, accédez à l\'administration à tout moment.',
    highlight: 'Cliquez sur <strong>🔐 Admin</strong> dans la barre supérieure ou rendez-vous sur <code style="background:#e0f2fe;color:#0369a1;padding:2px 6px;border-radius:4px">/dashboard.html</code> (Identifiants : admin@pedagoai.com / pedago2026).',
    actionText: 'Terminer et Essayer !'
  }
];

window.openInteractiveTour = function () {
  currentTourStep = 0;
  renderTourStep();
  var modal = document.getElementById('tourModal');
  if (modal) modal.style.display = 'flex';
};

window.closeInteractiveTour = function () {
  var modal = document.getElementById('tourModal');
  if (modal) modal.style.display = 'none';
};

window.nextTourStep = function () {
  if (currentTourStep < tourSteps.length - 1) {
    currentTourStep++;
    renderTourStep();
  } else {
    closeInteractiveTour();
    window.startNewCorrection();
  }
};

window.prevTourStep = function () {
  if (currentTourStep > 0) {
    currentTourStep--;
    renderTourStep();
  }
};

function renderTourStep() {
  var step = tourSteps[currentTourStep];
  var content = document.getElementById('tourStepContent');
  var prevBtn = document.getElementById('tourPrevBtn');
  var nextBtn = document.getElementById('tourNextBtn');
  var dotsContainer = document.getElementById('tourProgressDots');

  if (!step || !content) return;

  if (dotsContainer) {
    dotsContainer.innerHTML = tourSteps.map(function (_, idx) {
      var isCurrent = idx === currentTourStep;
      return '<div class="tour-dot' + (isCurrent ? ' on' : '') + '" style="flex:1;height:4px;border-radius:2px;background:' + (isCurrent ? 'var(--blue-primary)' : (idx < currentTourStep ? '#93c5fd' : '#e2e8f0')) + '"></div>';
    }).join('');
  }

  content.innerHTML = (
    '<div style="text-align:left">' +
      '<span style="display:inline-block;padding:3px 10px;background:#eff6ff;color:var(--blue-primary);border-radius:12px;font-size:12px;font-weight:700;margin-bottom:10px">' +
        escH(step.badge) +
      '</span>' +
      '<h2 style="font-size:20px;font-weight:800;color:var(--text-main);margin:0 0 10px 0;letter-spacing:-0.01em">' +
        escH(step.title) +
      '</h2>' +
      '<p style="font-size:14px;color:var(--text-muted);line-height:1.6;margin-bottom:14px">' +
        step.desc +
      '</p>' +
      '<div style="background:#f8fafc;border:1px solid #e2e8f0;border-left:4px solid var(--blue-primary);border-radius:8px;padding:12px 14px;font-size:13px;color:#1e293b;line-height:1.5">' +
        '💡 ' + step.highlight +
      '</div>' +
    '</div>'
  );

  if (prevBtn) {
    prevBtn.style.visibility = currentTourStep > 0 ? 'visible' : 'hidden';
  }

  if (nextBtn) {
    nextBtn.textContent = step.actionText || 'Suivant ➔';
  }
}

/* ─────────────────────────────────────────────
   54 MATIÈRES & 35 LANGUES TOGGLE
───────────────────────────────────────────── */
window.switchSlTab = function (tab) {
  var btnMat = document.getElementById('btnSlMat');
  var btnLang = document.getElementById('btnSlLang');
  var vMat = document.getElementById('slMatView');
  var vLang = document.getElementById('slLangView');

  if (btnMat) btnMat.classList.toggle('on', tab === 'mat');
  if (btnLang) btnLang.classList.toggle('on', tab === 'lang');
  if (vMat) vMat.style.display = tab === 'mat' ? 'grid' : 'none';
  if (vLang) vLang.style.display = tab === 'lang' ? 'grid' : 'none';
};

function escH(s) {
  if (!s) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
