/* #14 | /root/js/manage-soal.js | v 5.5 | u 10/09/2026 • 22:05:00 | xu : ke-11 | note : #noteresponse
- v5.4 -> v5.5 (FIX 2 bug):
  * BUG insertBefore NotFoundError (penyebab BLANK): referensi node salah parent.
    SEBELUM: page.parentNode.insertBefore(root, pageHeader.nextSibling)  <- SALAH
             (pageHeader.nextSibling adalah child dari page, bukan page.parentNode).
    SESUDAH: page.insertBefore(root, pageHeader.nextSibling) + try/catch dengan
             fallback (insert sebelum oldCard, else appendChild) sehingga drawer
             PASTI masuk DOM dan page tidak blank walau DOM anomali.
  * BUG indent submenu: .nav-sub-item margin-left:-2rem membuat sub-item sejajar
    tepi sidebar. SESUDAH: container .nav-submenu margin-left:1.25rem (geser masuk),
    sub-item margin-left:-2px hanya untuk menimpa border container saat active.
    Tree-line kini rapi: border container #d1fae5, border sub-item active #10b981.
- TETAP IDENTIK (tidak dipotong dari v5.4):
  * bindParentCapture (capture phase, sidebar tidak close saat toggle expand),
    activatePageSoal (sync), handler submenu (activate->switch->close mobile),
    injectSidebarSubmenu, syncSubmenuActive, buildSoalDrawer (selain fix insert),
    konstanta BANK_*, helper shared, switchSoalSubTab, auto-init, fallback legacy.
- EXPOSE: window.escapeHtml, window.downloadFile, window.loadSessionsDropdown,
  window.switchSoalSubTab, window.BANK_SUBJECTS, window.BANK_SKILLS, window.BANK_LEVELS. */

// ============================================
// KONSTANTA SHARED (dipakai sub-module)
// ============================================
window.BANK_SUBJECTS = ['Bahasa Inggris','Matematika','IPA','Bahasa Indonesia','IPS','PPKn','Umum'];
window.BANK_SKILLS   = ['Grammar','Vocabulary','Reading','Listening','Writing','Speaking','Aljabar','Geometri','Statistika','Umum'];
window.BANK_LEVELS   = ['Mudah','Sedang','Sulit'];

// ============================================
// HELPER SHARED
// ============================================
function escapeHtml(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
window.escapeHtml = escapeHtml;

function downloadFile(content, filename, type) {
  var blob = new Blob([content], { type: type + ';charset=utf-8;' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  setTimeout(function(){ URL.revokeObjectURL(url); }, 1000);
}
window.downloadFile = downloadFile;

// ============================================
// DROPDOWN SESI (SHARED)
// ============================================
async function loadSessionsDropdown() {
  var questionFilter = document.getElementById('filterQSession');
  var selectedQuestionSession = questionFilter ? questionFilter.value : 'all';
  var snap = await db.collection('sessions').get();
  S.sessions = [];
  var opts1 = '<option value="">Pilih Sesi</option>';
  var opts2 = '<option value="all">Semua</option>';

  snap.forEach(function(d){
    var data = Object.assign({ id: d.id }, d.data());
    S.sessions.push(data);
    opts1 += '<option value="' + d.id + '">' + escapeHtml(data.name||'') + '</option>';
    if (data.deleted !== true) {
      opts2 += '<option value="' + d.id + '">' + escapeHtml(data.name||'') + '</option>';
    }
  });

  ['parseSession','qSession','reviewSession','liveFilter','pembSession','impSession','laporanSession'].forEach(function(id){
    var el = document.getElementById(id);
    if (el) el.innerHTML = opts1;
  });
  var f = document.getElementById('filterQSession');
  if (f) {
    f.innerHTML = opts2;
    f.value = selectedQuestionSession;
    if (f.value !== selectedQuestionSession) f.value = 'all';
  }

  var bankOpt = '<option value="__BANK__">— Simpan ke Bank Soal (tanpa sesi) —</option>';
  ['parseSession','impSession'].forEach(function(id){
    var el = document.getElementById(id);
    if (el) el.insertAdjacentHTML('afterbegin', bankOpt);
  });
}
window.loadSessionsDropdown = loadSessionsDropdown;

// ============================================
// CSS SUB-MENU SIDEBAR (inject dari JS, anti-cache) - INDENT DIPERBAIKI
// ============================================
function injectSubmenuCSS(){
  if (document.getElementById('soal-submenu-css')) return;
  var st = document.createElement('style');
  st.id = 'soal-submenu-css';
  st.textContent = [
    '.nav-item.has-sub{position:relative;}',
    '.nav-item.has-sub .nav-chevron{margin-left:auto;font-size:18px;color:#94a3b8;transition:transform .2s ease;flex-shrink:0;}',
    '.nav-item.has-sub[data-expanded="true"] .nav-chevron{transform:rotate(90deg);color:#10b981;}',
    '.nav-item.has-sub[data-expanded="true"]{background:#f8fafc;color:#047857;border-left-color:#34d399;}',
    /* Container: GESER MASUK (indent) relatif sidebar */
    '.nav-submenu{display:none;background:#f8fafc;margin:.25rem .5rem .5rem 1.25rem;border-left:2px solid #d1fae5;border-radius:0 8px 8px 0;overflow:hidden;}',
    '.nav-submenu.active{display:block;animation:navSubIn .2s ease;}',
    '@keyframes navSubIn{from{opacity:0;transform:translateY(-4px);}to{opacity:1;transform:translateY(0);}}',
    /* Sub-item: indent internal kecil; margin-left:-2px hanya menimpa border container */
    '.nav-sub-item{display:flex;align-items:center;gap:.5rem;padding:.5rem .75rem .5rem .875rem;color:#64748b;cursor:pointer;font-size:.8125rem;transition:all .15s;text-decoration:none;border-left:2px solid transparent;margin-left:-2px;}',
    '.nav-sub-item:hover{background:#ecfdf5;color:#047857;}',
    '.nav-sub-item.active{background:#ecfdf5;color:#047857;border-left-color:#10b981;font-weight:600;}',
    '.nav-sub-item .material-icons{font-size:16px;color:#94a3b8;}',
    '.nav-sub-item.active .material-icons{color:#10b981;}',
    '.nav-sub-item .sub-badge{margin-left:auto;background:#f59e0b;color:#fff;font-size:.6rem;padding:1px 5px;border-radius:50px;font-weight:700;white-space:nowrap;}',
    '@media (max-width:767px){',
    '  .nav-submenu{margin-left:1rem;}',
    '  .nav-sub-item{padding:.4rem .75rem .4rem .875rem;font-size:.8rem;}',
    '}'
  ].join('\n');
  document.head.appendChild(st);
}

// ============================================
// SIDEBAR SUB-MENU
// ============================================
var SOAL_SUBS = [
  { id:'input',  icon:'edit_note',            label:'Input Soal',      badge:null },
  { id:'assessment-input', icon:'assignment_turned_in', label:'Input Asesmen', badge:null },
  { id:'impex',  icon:'swap_horiz',           label:'Import / Export', badge:null },
  { id:'daftar', icon:'format_list_bulleted', label:'Daftar Soal',     badge:null },
  { id:'bank',   icon:'inventory_2',          label:'Bank Soal',       badge:'Baru' }
];

function isSubExpanded(){
  try { return sessionStorage.getItem('soalSubExpanded') === 'true'; } catch(e){ return false; }
}
function setSubExpanded(v){
  try { sessionStorage.setItem('soalSubExpanded', v ? 'true' : 'false'); } catch(e){}
}

function activatePageSoal(){
  document.querySelectorAll('.page-content').forEach(function(p){ p.classList.remove('active'); });
  var pg = document.getElementById('page-manage-soal');
  if (pg) pg.classList.add('active');
  document.querySelectorAll('.nav-item').forEach(function(i){ i.classList.remove('active'); });
  var nav = document.querySelector('.nav-item[data-page="manage-soal"]');
  if (nav) nav.classList.add('active');
  tryInitDrawer();
}

function closeSidebarMobile(){
  if (window.innerWidth < 768) {
    var sb = document.getElementById('sidebar');
    if (sb) sb.classList.remove('active');
    document.body.classList.remove('sidebar-open');
  }
}

function bindParentCapture(){
  var sb = document.getElementById('sidebar');
  var parent = document.querySelector('.nav-item[data-page="manage-soal"]');
  if (!sb || !parent || sb.__soalCaptureBound) return;
  sb.__soalCaptureBound = true;
  sb.addEventListener('click', function(ev){
    var t = ev.target && ev.target.closest ? ev.target.closest('.nav-item[data-page="manage-soal"]') : null;
    if (!t) return;
    ev.stopPropagation();
    ev.preventDefault();
    var cur = isSubExpanded();
    setSubExpanded(!cur);
    parent.setAttribute('data-expanded', (!cur) ? 'true' : 'false');
    var menu = document.getElementById('soal-sidebar-submenu');
    if (menu) {
      if (!cur) menu.classList.add('active');
      else menu.classList.remove('active');
    }
    activatePageSoal();
    switchSoalSubTab(S.soalSubTab || 'input', true);
    syncSubmenuActive();
  }, true);
}

function injectSidebarSubmenu(){
  injectSubmenuCSS();

  var parent = document.querySelector('.nav-item[data-page="manage-soal"]');
  if (!parent) return;
  if (parent.__soalSubInjected) {
    var existingMenu = document.getElementById('soal-sidebar-submenu');
    if (existingMenu) {
      parent.classList.add('has-sub');
      parent.setAttribute('data-expanded', isSubExpanded() ? 'true' : 'false');
      if (isSubExpanded()) existingMenu.classList.add('active');
      else existingMenu.classList.remove('active');
    }
    return;
  }
  parent.__soalSubInjected = true;

  parent.classList.add('has-sub');
  parent.setAttribute('data-expanded', isSubExpanded() ? 'true' : 'false');
  if (!parent.querySelector('.nav-chevron')) {
    var chev = document.createElement('span');
    chev.className = 'material-icons nav-chevron';
    chev.textContent = 'chevron_right';
    parent.appendChild(chev);
  }

  var sub = document.createElement('div');
  sub.id = 'soal-sidebar-submenu';
  sub.className = 'nav-submenu' + (isSubExpanded() ? ' active' : '');
  SOAL_SUBS.forEach(function(s){
    var item = document.createElement('a');
    item.className = 'nav-sub-item';
    item.setAttribute('data-sub', s.id);
    item.href = 'javascript:void(0)';
    item.innerHTML =
      '<span class="material-icons">' + s.icon + '</span>' +
      '<span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + escapeHtml(s.label) + '</span>' +
      (s.badge ? '<span class="sub-badge">' + escapeHtml(s.badge) + '</span>' : '');
    item.addEventListener('click', function(ev){
      ev.preventDefault();
      ev.stopPropagation();
      activatePageSoal();
      switchSoalSubTab(s.id);
      syncSubmenuActive();
      closeSidebarMobile();
    });
    sub.appendChild(item);
  });

  // Insert sub-menu setelah parent (keduanya child dari sidebar/aside) - aman
  try {
    if (parent.nextSibling) parent.parentNode.insertBefore(sub, parent.nextSibling);
    else parent.parentNode.appendChild(sub);
  } catch(e){
    parent.parentNode.appendChild(sub);
  }

  syncSubmenuActive();
}

function syncSubmenuActive(){
  var sub = document.getElementById('soal-sidebar-submenu');
  if (!sub) return;
  var active = S.soalSubTab || 'input';
  sub.querySelectorAll('.nav-sub-item').forEach(function(item){
    if (item.getAttribute('data-sub') === active) item.classList.add('active');
    else item.classList.remove('active');
  });
}

// ============================================
// DRAWER BUILDER (FIX insertBefore)
// ============================================
function buildSoalDrawer(){
  var page = document.getElementById('page-manage-soal');
  if (!page) return;
  if (document.getElementById('soal-drawer-root')) return;

  var cssOk = !!document.getElementById('soal-drawer-css');
  if (!cssOk) {
    var st = document.createElement('style');
    st.id = 'soal-drawer-css';
    st.textContent = [
      '.soal-drawer{display:grid;grid-template-columns:220px 1fr;gap:1rem;align-items:start;}',
      '.soal-sidebar{background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:.5rem;position:sticky;top:72px;max-height:calc(100vh - 88px);overflow-y:auto;}',
      '.soal-subnav{display:flex;align-items:center;gap:.625rem;padding:.75rem .875rem;border-radius:8px;cursor:pointer;color:#475569;font-weight:600;font-size:.875rem;transition:all .15s;text-decoration:none;border:1px solid transparent;margin-bottom:.25rem;}',
      '.soal-subnav:hover{background:#f1f5f9;color:#2563eb;}',
      '.soal-subnav.active{background:linear-gradient(135deg,#eff6ff,#dbeafe);color:#1e40af;border-color:#bfdbfe;}',
      '.soal-subnav .material-icons{font-size:18px;}',
      '.soal-subnav .sub-badge{margin-left:auto;background:#2563eb;color:#fff;font-size:.65rem;padding:1px 6px;border-radius:50px;font-weight:700;}',
      '.soal-content{min-width:0;}',
      '.soal-sub-content{display:none;animation:soalFade .25s ease;}',
      '.soal-sub-content.active{display:block;}',
      '@keyframes soalFade{from{opacity:0;}to{opacity:1;}}',
      '.soal-card{background:#fff;border-radius:12px;border:1px solid #e2e8f0;margin-bottom:1rem;overflow:hidden;}',
      '.soal-card-header{padding:1rem 1.25rem;border-bottom:1px solid #e2e8f0;}',
      '.soal-card-title{font-size:1rem;font-weight:700;display:flex;align-items:center;gap:.5rem;color:#1e293b;}',
      '.soal-card-title .material-icons{color:#2563eb;font-size:20px;}',
      '.soal-card-body{padding:1.25rem;}',
      '#page-manage-soal .tabs{display:none !important;}',
      '#page-manage-soal .tab-content{display:none !important;}',
      '.soal-old-card-hidden{display:none !important;}',
      '@media (max-width: 900px){',
      '  .soal-drawer{grid-template-columns:1fr;}',
      '  .soal-sidebar{position:static;max-height:none;display:flex;gap:.375rem;overflow-x:auto;padding:.5rem;}',
      '  .soal-subnav{flex:0 0 auto;white-space:nowrap;margin-bottom:0;}',
      '}'
    ].join('\n');
    document.head.appendChild(st);
  }

  var oldCard = page.querySelector('.card') || page.querySelector('[class*="card"]');
  var tabParse = oldCard ? (oldCard.querySelector('#tab-parse') || document.getElementById('tab-parse')) : null;
  var tabCsv   = oldCard ? (oldCard.querySelector('#tab-csv')   || document.getElementById('tab-csv'))   : null;
  var tabList  = oldCard ? (oldCard.querySelector('#tab-list')  || document.getElementById('tab-list'))  : null;
  var pageHeader = page.querySelector('.page-header');

  var root = document.createElement('div');
  root.id = 'soal-drawer-root';
  root.className = 'soal-drawer';

  var sidebar = document.createElement('aside');
  sidebar.className = 'soal-sidebar';
  SOAL_SUBS.forEach(function(s){
    var a = document.createElement('a');
    a.className = 'soal-subnav';
    a.setAttribute('data-sub', s.id);
    a.innerHTML =
      '<span class="material-icons">' + s.icon + '</span>' +
      '<span>' + escapeHtml(s.label) + '</span>' +
      (s.badge ? '<span class="sub-badge">' + escapeHtml(s.badge) + '</span>' : '');
    a.addEventListener('click', function(){ switchSoalSubTab(s.id); });
    sidebar.appendChild(a);
  });

  var content = document.createElement('div');
  content.className = 'soal-content';

  var subInput = buildSubCard('soal-sub-input', 'edit_note', 'Input Soal Manual (Parse Teks)',
    'Paste teks soal dengan format khusus (PGS, MCMA, PGK, ISIAN). Bisa simpan langsung ke sesi atau ke Bank Soal.');
  var inputBody = subInput.querySelector('.soal-card-body');
  if (tabParse) { while (tabParse.firstChild) inputBody.appendChild(tabParse.firstChild); }
  else inputBody.innerHTML = '<div class="empty-state"><p>Konten Input Soal tidak ditemukan.</p></div>';

  var subAssessment = buildSubCard('soal-sub-assessment-input', 'assignment_turned_in', 'Input Asesmen',
    'Import khusus ke sesi Asesmen dengan parser teks atau CSV untuk PGS, MCMA, dan Kategori Benar/Salah.');
  var assessmentBody = subAssessment.querySelector('.soal-card-body');
  if (window.renderAssessmentInput) window.renderAssessmentInput(assessmentBody);
  else assessmentBody.innerHTML = '<div class="empty-state"><p>Modul Input Asesmen sedang dimuat.</p></div>';

  var subImpex = buildSubCard('soal-sub-impex', 'swap_horiz', 'Import / Export Soal',
    'Upload CSV untuk import massal, atau download template. Export Bank Soal ke CSV.');
  var impexBody = subImpex.querySelector('.soal-card-body');
  var tplRow = document.createElement('div');
  tplRow.className = 'soal-template-row';
  tplRow.innerHTML =
    '<div style="flex:1;min-width:200px;font-size:.8125rem;">' +
      '<b style="display:flex;align-items:center;gap:.375rem;margin-bottom:.25rem;">' +
        '<span class="material-icons">description</span>Template Format Soal' +
      '</b>' +
      '<div style="color:#1e40af;">Download contoh format untuk import. TXT lebih mudah dibaca, CSV cocok untuk spreadsheet.</div>' +
    '</div>' +
    '<button type="button" class="btn btn-success btn-sm" onclick="downloadTemplate(\'txt\')">' +
      '<span class="material-icons">download</span>Template TXT</button>' +
    '<button type="button" class="btn btn-warning btn-sm" onclick="downloadTemplate(\'csv\')">' +
      '<span class="material-icons">download</span>Template CSV</button>';
  impexBody.appendChild(tplRow);
  if (tabCsv) { while (tabCsv.firstChild) impexBody.appendChild(tabCsv.firstChild); }
  var exportBankBtn = document.createElement('div');
  exportBankBtn.style.cssText = 'margin-top:1rem;padding-top:1rem;border-top:1px dashed #e2e8f0;';
  exportBankBtn.innerHTML =
    '<div style="font-size:.8125rem;color:#475569;margin-bottom:.5rem;">' +
      '<b>Export Bank Soal:</b> Download seluruh isi Bank Soal ke format CSV untuk backup / edit massal.' +
    '</div>' +
    '<button type="button" class="btn btn-secondary btn-sm" onclick="if(window.exportBankCsv) exportBankCsv(); else toast(\'Bank belum dimuat\',\'warning\');">' +
      '<span class="material-icons" style="font-size:14px;">download</span>Export Bank ke CSV</button>';
  impexBody.appendChild(exportBankBtn);

  var subDaftar = buildSubCard('soal-sub-daftar', 'format_list_bulleted', 'Daftar Soal (Snapshot per Sesi)',
    'Lihat soal yang sudah tersimpan di setiap sesi. Soal dari Bank Soal ditandai "Bank". Bisa diadopsi ke Bank (copy).');
  var daftarBody = subDaftar.querySelector('.soal-card-body');
  if (tabList) { while (tabList.firstChild) daftarBody.appendChild(tabList.firstChild); }

  var subBank = buildSubCard('soal-sub-bank', 'inventory_2', 'Bank Soal (Reusable)',
    'Soal master yang bisa dipakai ulang di berbagai sesi/ruang. Tambahkan metadata (mapel, skill, level, tag, folder) untuk filter canggih.');
  var bankBody = subBank.querySelector('.soal-card-body');
  bankBody.innerHTML = '<div id="bankFilters"></div><div id="bankList"></div>';

  content.appendChild(subInput);
  content.appendChild(subAssessment);
  content.appendChild(subImpex);
  content.appendChild(subDaftar);
  content.appendChild(subBank);

  root.appendChild(sidebar);
  root.appendChild(content);

  if (oldCard) {
    oldCard.classList.add('soal-old-card-hidden');
    oldCard.style.display = 'none';
  }

  // FIX v5.5: insert pada PAGE (bukan page.parentNode), dengan fallback berlapis
  var inserted = false;
  if (pageHeader) {
    try {
      page.insertBefore(root, pageHeader.nextSibling);
      inserted = true;
    } catch(e){ inserted = false; }
  }
  if (!inserted) {
    try {
      if (oldCard && oldCard.parentNode === page) page.insertBefore(root, oldCard);
      else page.appendChild(root);
      inserted = true;
    } catch(e){ inserted = false; }
  }
  if (!inserted) page.appendChild(root);

  var saved = null;
  try { saved = sessionStorage.getItem('soalSubTab'); } catch(e){}
  var initial = saved && SOAL_SUBS.some(function(s){return s.id===saved;}) ? saved : 'input';
  switchSoalSubTab(initial, true);

  loadSessionsDropdown();
}

function buildSubCard(id, icon, title, subtitle){
  var card = document.createElement('div');
  card.id = id;
  card.className = 'soal-card soal-sub-content';
  card.innerHTML =
    '<div class="soal-card-header">' +
      '<div class="soal-card-title">' +
        '<span class="material-icons">' + icon + '</span>' +
        '<div>' +
          '<div>' + escapeHtml(title) + '</div>' +
          '<div style="font-size:.75rem;font-weight:500;color:#64748b;margin-top:.125rem;">' + escapeHtml(subtitle) + '</div>' +
        '</div>' +
      '</div>' +
    '</div>' +
    '<div class="soal-card-body"></div>';
  return card;
}

function switchSoalSubTab(name, silent){
  S.soalSubTab = name;
  try { sessionStorage.setItem('soalSubTab', name); } catch(e){}

  var root = document.getElementById('soal-drawer-root');
  if (root) {
    root.querySelectorAll('.soal-subnav').forEach(function(a){
      if (a.getAttribute('data-sub') === name) a.classList.add('active');
      else a.classList.remove('active');
    });
    root.querySelectorAll('.soal-sub-content').forEach(function(el){
      if (el.id === 'soal-sub-' + name) el.classList.add('active');
      else el.classList.remove('active');
    });
  }

  syncSubmenuActive();

  if (silent) return;

  if (name === 'daftar' && window.loadQuestions) {
    setTimeout(function(){ window.loadQuestions(); }, 50);
  } else if (name === 'bank' && window.loadBank) {
    setTimeout(function(){ window.loadBank(); }, 50);
  } else if (name === 'assessment-input' && window.initAssessmentInput) {
    setTimeout(function(){ window.initAssessmentInput(); }, 50);
  } else if (name === 'input' || name === 'impex') {
    if (window.loadSessionsDropdown) window.loadSessionsDropdown();
  }
}
window.switchSoalSubTab = switchSoalSubTab;

// ============================================
// AUTO-INIT
// ============================================
function tryInitDrawer(){
  var page = document.getElementById('page-manage-soal');
  if (!page) return;
  injectSidebarSubmenu();
  bindParentCapture();
  if (document.getElementById('soal-drawer-root')) return;
  if (!page.querySelector('.card')) { setTimeout(tryInitDrawer, 200); return; }
  buildSoalDrawer();
}

(function(){
  function watchManageSoal(){
    var page = document.getElementById('page-manage-soal');
    if (page && !page.__drawerObserved && typeof MutationObserver !== 'undefined') {
      page.__drawerObserved = true;
      var mo = new MutationObserver(function(){
        if (page.classList.contains('active')) {
          tryInitDrawer();
          syncSubmenuActive();
        }
      });
      mo.observe(page, { attributes:true, attributeFilter:['class'] });
    }
  }
  function kick(){
    injectSubmenuCSS();
    tryInitDrawer();
    bindParentCapture();
    watchManageSoal();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', kick);
  } else {
    setTimeout(kick, 200);
    setTimeout(kick, 800);
    setTimeout(kick, 2000);
  }
})();

// Fallback legacy functions
window.previewParse     = window.previewParse     || function(){ toast('Input belum siap','warning'); };
window.submitParse      = window.submitParse      || function(){ toast('Input belum siap','warning'); };
window.previewCSV       = window.previewCSV       || function(){ toast('Import belum siap','warning'); };
window.doImportCSV      = window.doImportCSV      || function(){ toast('Import belum siap','warning'); };
window.downloadTemplate = window.downloadTemplate || function(){ toast('Template belum siap','warning'); };
window.loadQuestions    = window.loadQuestions    || function(){ toast('Daftar belum siap','warning'); };
window.deleteQuestion   = window.deleteQuestion   || function(){ toast('Daftar belum siap','warning'); };

console.log('✅ manage-soal.js v5.5 loaded (fix insertBefore + indent submenu)');