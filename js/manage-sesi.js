/* a#20 | /root/js/manage-sesi.js | v 6.0 | u 13/09/2026 • 08:30:00 | xu : ke-12 | note : #noteresponse
- REFACTOR BESAR (Opsi B): pecah jadi orchestrator + sub-module.
  * File ini SEKARANG HANYA orchestrator (~300 baris): helper shared, state,
    load sessions, accordion OVERVIEW (ringkasan semua batch), routing page,
    dan CRUD dasar (delete/toggle). Tidak ada lagi modal, bank picker, submenu
    sidebar, tab internal per batch, atau mode-fokus — semua pindah ke sub-module.
  * Sub-menu sidebar sekarang DI-DEKLARASI LANGSUNG DI ap.html sebagai nav-item
    terpisah (data-page: sesi-live / sesi-homework / sesi-realtime), bukan
    di-inject JS. Klik submenu = buka page-content sendiri (layar sendiri,
    seperti Riwayat Sesi).
  * Sub-module yang bertanggung jawab atas screen:
      js/m-sesi-liveexercise.js      (a#12) — screen #page-sesi-live
      js/m-sesi-homework.js          (a#11) — screen #page-sesi-homework
      js/m-sesi-realtimexercise.js   (a#14) — screen #page-sesi-realtime
      js/m-sesi-modal.js             (a#13) — modal Tambah/Edit sesi + saveSession
      js/m-sesi-bankpicker.js        (a#10) — bank picker + filter + materialize
      js/m-sesi-riwayat.js           (a#15) — screen riwayat (sudah ada)
- DELEGASI: render kartu didelegasikan ke sub-module bila tersedia
    window.renderLiveSessionCards / renderHomeworkSessionCards / renderRealtimeSessionCards.
    Fallback internal (renderSessionCard) dipakai bila sub-module belum load.
- HELPER YANG DIEKSPOS KE SUB-MODULE:
    window.escS, window.fmtDateSesi, window.sessionLink, window.copyTextS,
    window.autoCode, window.ensureUniqueCode, window.toggleSess, window.toggleSessIcon,
    window.copySessionLink, window.gotoSoalSession, window.isSessionDone,
    window.editSession, window.deleteSession, window.__sessAttemptCount,
    window.loadSessions.
- DATA LAMAN TIDAK DISSENTUH: skema sessions sama; field batch/mode/sourceType
  dsb tetap sama. Tidak ada migrasi.
- EXPOSE: window.loadSessions, window.loadSessionsForMode, window.editSession,
  window.deleteSession, window.toggleSess, window.toggleSessIcon, window.copySessionLink,
  window.gotoSoalSession, window.toggleBatch. */

var BULAN_SHORT = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];

// ============================================
// HELPER SHARED (dipakai sub-module)
// ============================================
function escS(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
window.escS = escS;

function slugify(s){ return String(s||'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,''); }

function copyTextS(t){
  if(navigator.clipboard&&navigator.clipboard.writeText){ navigator.clipboard.writeText(t).catch(function(){}); }
  else { var ta=document.createElement('textarea'); ta.value=t; ta.style.cssText='position:fixed;opacity:0;'; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); }
}
window.copyTextS = copyTextS;

function sessionLink(code){
  var base=location.href.split('?')[0].replace(/ap\.html$/,'sp.html');
  return base+'?jec-sim-tka='+encodeURIComponent(code);
}
window.sessionLink = sessionLink;

function fmtDateSesi(ts){
  if(!ts) return '-';
  var d;
  try{ d = ts.toDate ? ts.toDate() : new Date(ts); }catch(e){ return '-'; }
  if (isNaN(d.getTime())) return '-';
  var p = function(n){ return String(n).padStart(2,'0'); };
  return d.getDate() + '/' + BULAN_SHORT[d.getMonth()] + '/' + String(d.getFullYear()).slice(-2) +
         ' | ' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
}
window.fmtDateSesi = fmtDateSesi;

function sessTs(s){
  var t = 0;
  try { if (s.startTime && s.startTime.toDate) t = s.startTime.toDate().getTime(); else if (s.startTime) t = new Date(s.startTime).getTime(); } catch(e){}
  if (!t || isNaN(t)) {
    try { if (s.createdAt && s.createdAt.toDate) t = s.createdAt.toDate().getTime(); else if (s.createdAt) t = new Date(s.createdAt).getTime(); } catch(e){}
  }
  return (t && !isNaN(t)) ? t : 0;
}

// ============================================
// STATE
// ============================================
window.__sessAttemptCount = {};
window.__sesiUI = window.__sesiUI || { expanded:{} };

(function(){
  try {
    var raw = sessionStorage.getItem('sesiUIState');
    if (raw) {
      var p = JSON.parse(raw);
      window.__sesiUI.expanded = p.expanded || {};
    }
  } catch(e){}
})();

function saveSesiUI(){
  try { sessionStorage.setItem('sesiUIState', JSON.stringify(window.__sesiUI)); } catch(e){}
}

var BATCH_NONE = '__none__';
window.BATCH_NONE = BATCH_NONE;
window.batchOf = function(s){ return (s.batch && String(s.batch).trim()) ? String(s.batch).trim() : BATCH_NONE; };
window.batchLabel = function(b){ return b === BATCH_NONE ? 'Tanpa Batch (data lama)' : ('Batch / Ruang ' + b); };
window.modeOf = function(s){
  if (s.mode === 'assessment') return 'assessment';
  if (s.mode === 'homework') return 'homework';
  if (s.mode === 'realtime') return 'realtime';
  return 'live';
};

window.getBatchList = function(){
  var seen = {};
  S.sessions.forEach(function(s){ seen[window.batchOf(s)] = 1; });
  var list = Object.keys(seen);
  list.sort(function(a,b){
    if (a === BATCH_NONE) return 1;
    if (b === BATCH_NONE) return -1;
    var na = parseInt(a,10), nb = parseInt(b,10);
    if (!isNaN(na) && !isNaN(nb) && na !== nb) return na - nb;
    return a < b ? -1 : (a > b ? 1 : 0);
  });
  return list;
};

// ============================================
// LOAD SESI + STATS
// ============================================
async function computeAttemptCounts(){
  try {
    var snap = await db.collection('attempts').get();
    var map = {};
    snap.forEach(function(d){
      var a = d.data();
      if (a.deleted === true) return;
      map[a.sessionId] = (map[a.sessionId]||0) + 1;
    });
    window.__sessAttemptCount = map;
  } catch(e){ window.__sessAttemptCount = {}; }
}

async function backfillCodes(){
  for (var i=0;i<S.sessions.length;i++){
    var s=S.sessions[i];
    if(!s.code){
      var code=await autoCode(s.name, s.id);
      await db.collection('sessions').doc(s.id).update({code:code}).catch(function(){});
      s.code=code;
    }
  }
}

async function computeStats(){
  var qCount={}, doneMap={};
  var qSnap=await db.collection('questions').get();
  qSnap.forEach(function(d){
    var data=d.data();
    if (data.deleted === true) return;
    var sid=data.sessionId; qCount[sid]=(qCount[sid]||0)+1;
  });
  var aSnap=await db.collection('attempts').where('status','==','completed').get();
  aSnap.forEach(function(d){ var a=d.data(); if(a.deleted===true) return; doneMap[a.sessionId]=doneMap[a.sessionId]||{}; doneMap[a.sessionId][a.studentId]=1; });
  S.sessionStats={};
  S.sessions.forEach(function(s){
    var done=doneMap[s.id]?Object.keys(doneMap[s.id]).length:0;
    S.sessionStats[s.id]={ q:qCount[s.id]||0, done:done, assigned:(s.assignedStudents||[]).length };
  });
}

async function loadSessions(){
  var snap=await db.collection('sessions').get();
  S.sessions=[];
  var docs=[];
  snap.forEach(function(d){
    var data=d.data();
    if (data.deleted !== true) docs.push(Object.assign({id:d.id}, data));
  });
  S.sessions = docs;

  if(!S.sessions.length){
    S.sessionStats={};
    window.__sessAttemptCount={};
    renderOverview();
    return;
  }

  await backfillCodes();
  await computeStats();
  await computeAttemptCounts();

  S.sessions.sort(function(a,b){
    var ta = sessTs(a), tb = sessTs(b);
    if (ta !== tb) return tb - ta;
    var na = (a.name||'').toLowerCase(), nb = (b.name||'').toLowerCase();
    return na < nb ? -1 : (na > nb ? 1 : 0);
  });

  renderOverview();
}

// Dipakai sub-module: load sesi bila belum ter-load
window.loadSessionsForMode = async function(){
  if (!S.sessions || !S.sessions.length) await loadSessions();
};

window.isSessionDone=function(id){
  var st=S.sessionStats&&S.sessionStats[id];
  return !!(st && st.assigned>0 && st.done>=st.assigned);
};
window.isSessionDone = window.isSessionDone;

window.gotoSoalSession=function(sid){
  var session=(S.sessions||[]).find(function(item){return item.id===sid;});
  if(!session){alert2('Sesi tidak ditemukan','Muat ulang daftar sesi lalu coba kembali.','warning');return;}
  window.__questionEditorSessionId=sid;
  try{sessionStorage.setItem('questionEditorSessionId',sid);}catch(error){}
  var nav=document.querySelector('.nav-item[data-page="manage-soal"]');
  if(!nav){alert2('Manage Soal tidak tersedia','Menu Manage Soal belum siap dimuat.','error');return;}
  nav.click();
  setTimeout(function(){
    var subtab=session.mode==='assessment'?'assessment-input':'input';
    if(window.switchSoalSubTab) window.switchSoalSubTab(subtab);
    if(!window.loadSessionQuestionsIntoEditor){
      alert2('Editor belum siap','Modul input soal belum selesai dimuat. Muat ulang halaman lalu coba kembali.','error');
      return;
    }
    window.loadSessionQuestionsIntoEditor(sid).then(function(){
      if(session.mode!=='assessment'){
        var filter=document.getElementById('filterQSession');
        if(filter){filter.value=sid;if(window.loadQuestions)loadQuestions();}
      }
    }).catch(function(error){
      console.error('[manage-sesi] Gagal membuka editor sesi:',error);
      alert2('Editor sesi gagal dibuka',escS(error.message||'Kesalahan tidak diketahui'),'error');
    });
  },350);
};

// ============================================
// OVERVIEW ACCORDION (ringkasan semua batch di page-manage-sesi)
// ============================================
function renderOverview(){
  var list=document.getElementById('sessionList');
  if(!list) return;
  if(!S.sessions.length){
    list.innerHTML='<div class="empty-state"><span class="material-icons">event_busy</span><p>Belum ada sesi</p></div>';
    return;
  }

  var batches = window.getBatchList();
  if (!batches.some(function(b){ return window.__sesiUI.expanded[b]; })) {
    window.__sesiUI.expanded[batches[0]] = true;
    saveSesiUI();
  }

  var nLive = S.sessions.filter(function(s){ return modeOf(s)==='live'; }).length;
  var nHw   = S.sessions.filter(function(s){ return modeOf(s)==='homework'; }).length;
  var nRt   = S.sessions.filter(function(s){ return modeOf(s)==='realtime'; }).length;
  var nAs   = S.sessions.filter(function(s){ return modeOf(s)==='assessment'; }).length;

  var html =
    '<div style="font-size:.875rem;color:#475569;margin-bottom:.75rem;padding:1rem;background:#ecfdf5;border:1px solid #a7f3d0;border-radius:10px;">' +
      '<div style="font-weight:700;color:#065f46;margin-bottom:.5rem;display:flex;align-items:center;gap:.375rem;">' +
        '<span class="material-icons" style="font-size:20px;">info</span>Overview' +
      '</div>' +
      '<div style="display:flex;gap:1rem;flex-wrap:wrap;font-size:.8125rem;">' +
        '<span><b>'+S.sessions.length+'</b> sesi total</span>' +
        '<span><b>'+batches.length+'</b> batch/ruang</span>' +
        (nLive?'<span class="mode-badge-live">'+nLive+' Live</span>':'') +
        (nHw?'<span class="mode-badge-hw">'+nHw+' PR</span>':'') +
        (nRt?'<span class="badge badge-warning">'+nRt+' Realtime</span>':'') +
        (nAs?'<span class="badge badge-info">'+nAs+' Asesmen</span>':'') +
      '</div>' +
      '<div style="font-size:.75rem;color:#047857;margin-top:.5rem;">Pilih submenu di sidebar untuk masuk ke layar spesifik.</div>' +
    '</div>';

  batches.forEach(function(b){
    var inBatch = S.sessions.filter(function(s){ return window.batchOf(s)===b; });
    var nL = inBatch.filter(function(s){ return modeOf(s)==='live'; }).length;
    var nH = inBatch.filter(function(s){ return modeOf(s)==='homework'; }).length;
    var nR = inBatch.filter(function(s){ return modeOf(s)==='realtime'; }).length;
    var nA = inBatch.filter(function(s){ return modeOf(s)==='assessment'; }).length;
    var expanded = !!window.__sesiUI.expanded[b];

    html += '<div class="card" style="margin-bottom:.75rem;">' +
      '<div class="card-header" style="cursor:pointer;display:flex;justify-content:space-between;align-items:center;gap:.75rem;flex-wrap:wrap;" onclick="toggleBatch(\''+b+'\')">' +
        '<div style="display:flex;align-items:center;gap:.5rem;flex-wrap:wrap;">' +
          '<span class="material-icons" style="color:#10b981;transition:transform .2s;transform:rotate('+(expanded?'90':'0')+'deg);">chevron_right</span>' +
          '<span class="material-icons" style="color:#64748b;">meeting_room</span>' +
          '<strong>'+escS(window.batchLabel(b))+'</strong>' +
          '<span class="badge badge-info">'+inBatch.length+' sesi</span>' +
          (nL?'<span class="mode-badge-live" style="font-size:.65rem;">'+nL+' Live</span>':'') +
          (nH?'<span class="mode-badge-hw" style="font-size:.65rem;">'+nH+' PR</span>':'') +
          (nR?'<span class="badge badge-warning" style="font-size:.65rem;">'+nR+' Realtime</span>':'') +
          (nA?'<span class="badge badge-info" style="font-size:.65rem;">'+nA+' Asesmen</span>':'') +
        '</div>' +
        '<span style="font-size:.7rem;color:#94a3b8;">'+(expanded?'tutup':'buka')+'</span>' +
      '</div>' +
      '<div id="batchBody-'+b+'" style="display:'+(expanded?'block':'none')+';padding:1rem;border-top:1px solid #e2e8f0;">' +
        renderOverviewBatch(inBatch) +
      '</div>' +
    '</div>';
  });

  list.innerHTML = html;
}

function renderOverviewBatch(sessions){
  if (!sessions.length) return '<div style="color:#94a3b8;font-size:.8125rem;">Kosong</div>';
  // Delegasi ke sub-module bila ada, pakai render kartu internal sebagai fallback
  return sessions.map(renderSessionCard).join('');
}

window.toggleBatch = function(b){
  window.__sesiUI.expanded[b] = !window.__sesiUI.expanded[b];
  saveSesiUI();
  var body = document.getElementById('batchBody-'+b);
  if (body) body.style.display = window.__sesiUI.expanded[b] ? 'block' : 'none';
  var hdr = body ? body.parentNode.querySelector('.card-header .material-icons') : null;
  if (hdr) hdr.style.transform = 'rotate('+(window.__sesiUI.expanded[b]?'90':'0')+'deg)';
};

// ============================================
// RENDER KARTU INTERNAL (fallback bila sub-module belum ada)
// ============================================
function renderSessionCard(s){
  var code=s.code||'';
  var st=(S.sessionStats&&S.sessionStats[s.id])||{q:0,done:0,assigned:0};
  var hasAttempts = (window.__sessAttemptCount[s.id]||0) > 0;

  var modeBadge = (s.mode==='assessment')
    ? '<span class="badge badge-info"><span class="material-icons">assignment_turned_in</span>Asesmen</span>'
    : (s.mode==='homework')
    ? '<span class="mode-badge-hw"><span class="material-icons">menu_book</span>PR</span>'
    : (s.mode==='realtime')
      ? '<span class="badge badge-warning"><span class="material-icons">sports_esports</span>Realtime</span>'
      : '<span class="mode-badge-live"><span class="material-icons">bolt</span>Live</span>';
  var retryBadge = (s.mode==='homework' && s.retryMode==='conditional')
    ? ' <span class="hw-retry-badge"><span class="material-icons">refresh</span>2x</span>'
    : '';
  var bankBadge = (s.sourceType === 'bank' || s.sourceType === 'filter')
    ? ' <span class="badge badge-info" title="Soal dari Bank Soal"><span class="material-icons" style="font-size:12px;">inventory_2</span>Bank</span>'
    : '';

  var subtitle =
    '<div class="session-card-subtitle" style="font-size:.75rem;font-weight:700;color:#047857;margin-top:.25rem;display:flex;gap:.5rem;flex-wrap:wrap;">' +
      '<span style="display:inline-flex;align-items:center;gap:.2rem;">' +
        '<span class="material-icons" style="font-size:14px;">' + (s.status?'toggle_on':'toggle_off') + '</span>' +
        (s.status?'Aktif':'Off') +
      '</span>' +
      '<span>•</span>' +
      '<span style="display:inline-flex;align-items:center;gap:.2rem;">' +
        '<span class="material-icons" style="font-size:14px;">' + (s.visible?'visibility':'visibility_off') + '</span>' +
        (s.visible?'Visible':'Hidden') +
      '</span>' +
      '<span>•</span>' +
      '<span style="display:inline-flex;align-items:center;gap:.2rem;">' +
        '<span class="material-icons" style="font-size:14px;">' + (s.locked?'lock':'lock_open') + '</span>' +
        (s.locked?'Lock':'Unlock') +
      '</span>' +
      '<span>•</span>' +
      '<span style="display:inline-flex;align-items:center;gap:.2rem;">' +
        '<span class="material-icons" style="font-size:14px;">shield</span>' +
        (s.antiCheat!==false?'Anti-Cheat':'Anti-Cheat Off') +
      '</span>' +
      (hasAttempts ? '<span>•</span><span style="color:#f59e0b;display:inline-flex;align-items:center;gap:.2rem;"><span class="material-icons" style="font-size:14px;">history</span>'+window.__sessAttemptCount[s.id]+' attempt</span>' : '') +
    '</div>';

  return '<div class="session-card">'+
    '<div class="session-card-header">'+
      '<div class="session-card-title" style="flex:1;min-width:0;">' +
        '<div style="display:flex;align-items:center;gap:.375rem;flex-wrap:wrap;">' +
          '<span class="material-icons">event_available</span>' +
          '<strong>' + escS(s.name) + '</strong> ' +
          modeBadge + retryBadge + bankBadge +
          ' <span class="badge badge-'+(s.status?'success':'error')+'">'+(s.status?'Aktif':'Off')+'</span>'+
          ' <span class="badge badge-'+(s.visible?'info':'warning')+'">'+(s.visible?'Visible':'Hidden')+'</span>'+
          (s.locked?' <span class="badge badge-error">Locked</span>':'')+
          (code?' <span class="badge badge-info" style="font-family:monospace;">'+escS(code)+'</span>':'')+
        '</div>' +
        subtitle +
      '</div>'+
      '<div class="session-card-actions" style="flex-wrap:wrap;justify-content:flex-end;">'+
        (code?'<button class="btn btn-secondary btn-sm" onclick="copySessionLink(\''+s.id+'\')" title="Salin link siswa"><span class="material-icons">link</span></button> ':'')+
        '<button class="btn btn-secondary btn-sm" onclick="toggleSessIcon(\''+s.id+'\',\'status\')" title="Aktif/Nonaktif"><span class="material-icons">'+(s.status?'toggle_on':'toggle_off')+'</span></button>'+
        '<button class="btn btn-secondary btn-sm" onclick="toggleSessIcon(\''+s.id+'\',\'visible\')" title="Show/Hide"><span class="material-icons">'+(s.visible?'visibility':'visibility_off')+'</span></button>'+
        '<button class="btn '+(s.locked?'btn-warning':'btn-secondary')+' btn-sm" onclick="toggleSessIcon(\''+s.id+'\',\'locked\')" title="Lock/Unlock"><span class="material-icons">'+(s.locked?'lock':'lock_open')+'</span></button>'+
        '<button class="btn '+(s.antiCheat!==false?'btn-secondary':'btn-error')+' btn-sm" onclick="toggleSessIcon(\''+s.id+'\',\'antiCheat\')" title="Anti-Cheat on/off"><span class="material-icons">shield</span></button>'+
        '<button class="btn btn-secondary btn-sm" onclick="editSession(\''+s.id+'\')" title="Edit sesi"><span class="material-icons">edit</span></button>'+
        '<button class="btn btn-error btn-sm" onclick="deleteSession(\''+s.id+'\')" title="Pindahkan ke Sampah"><span class="material-icons">delete</span></button>'+
      '</div>'+
    '</div>'+
    (s.description?'<p style="font-size:.8125rem;color:#64748b;margin:.5rem 0;">'+escS(s.description)+'</p>':'')+
    '<div class="session-card-meta">'+
      '<div class="session-meta-item"><span class="material-icons">timer</span>'+(s.duration||60)+' menit</div>'+
      '<div class="session-meta-item" style="cursor:pointer;color:#047857;" onclick="gotoSoalSession(\''+s.id+'\')" title="Buka Manage Soal"><span class="material-icons">quiz</span><u>'+st.q+' soal</u></div>'+
      '<div class="session-meta-item"><span class="material-icons">groups</span>'+st.assigned+' assigned</div>'+
      '<div class="session-meta-item"><span class="material-icons">task_alt</span>'+st.done+'/'+st.assigned+' selesai</div>'+
    '</div>'+
  '</div>';
}
window.renderSessionCardFallback = renderSessionCard;

// ============================================
// CRUD (pindah ke m-sesi-modal.js untuk modal, tetap di sini untuk toggle/delete)
// ============================================
async function ensureUniqueCode(code, excludeId){
  var snap=await db.collection('sessions').where('code','==',code).get();
  var dup=false;
  snap.forEach(function(d){ if(d.id!==excludeId) dup=true; });
  return !dup;
}
window.ensureUniqueCode = ensureUniqueCode;

async function autoCode(name, excludeId){
  var base=slugify(name)||'sesi';
  var code=base, n=2;
  while(!(await ensureUniqueCode(code, excludeId))){ code=base+'-'+n; n++; }
  return code;
}
window.autoCode = autoCode;

async function toggleSess(id,field,val){
  var u={}; u[field]=val; u.updatedAt=firebase.firestore.FieldValue.serverTimestamp();
  await db.collection('sessions').doc(id).update(u);
  toast('Diperbarui','success'); loadSessions();
}
window.toggleSess = toggleSess;

window.toggleSessIcon=async function(id,field){
  var s=S.sessions.find(function(x){return x.id===id;});
  if(!s) return;
  var cur = field==='status' ? s.status
            : field==='visible' ? s.visible
            : field==='locked' ? s.locked
            : field==='antiCheat' ? (s.antiCheat !== false)
            : false;
  await toggleSess(id, field, !cur);
};

window.copySessionLink=async function(id){
  var s=S.sessions.find(function(x){return x.id===id;});
  if(!s||!s.code){ alert2('Info','Sesi belum punya kode','warning'); return; }
  copyTextS(sessionLink(s.code));
  toast('Link siswa disalin','success');
};

// editSession = delegate ke sub-module (m-sesi-modal.js)
function editSession(id){
  if (typeof window.openSessionModal === 'function') window.openSessionModal(id);
  else alert2('Info','Modal belum siap. Tunggu file m-sesi-modal.js dimuat.','warning');
}
window.editSession = editSession;

async function deleteSession(id){
  var s=S.sessions.find(function(x){return x.id===id;});
  if(!s) return;
  if (!confirm('Pindahkan sesi "'+(s.name||id)+'" ke Sampah?\n\nSoal snapshot & attempt siswa TIDAK ikut terhapus.\nAnda bisa memulihkannya nanti dari menu Sampah.')) return;
  var ok = await window.softDelete('sessions', id);
  if (ok) {
    toast('Sesi dipindahkan ke Sampah','success');
    loadSessions();
    if (window.__trash && window.__trash.initialized && window.Trash && window.Trash.load) {
      try { await window.Trash.load(); } catch(e){}
    }
  }
}
window.deleteSession = deleteSession;

// ============================================
// EXPOSE + AUTO-INIT
// ============================================
window.loadSessions = loadSessions;

(function(){
  // CSS fix offside kartu (anti-cache, selalu inject)
  if (!document.getElementById('sesi-offside-css')) {
    var st = document.createElement('style');
    st.id = 'sesi-offside-css';
    st.textContent = [
      '#sessionList .card{overflow:hidden !important;}',
      '#sessionList .session-card{overflow:hidden !important;}',
      '#sessionList .session-card-header{flex-wrap:wrap !important;}',
      '#sessionList .session-card-actions{flex-wrap:wrap !important;flex-shrink:1 !important;justify-content:flex-end;row-gap:.375rem;column-gap:.375rem;}',
      '#sessionList .session-card-meta{grid-template-columns:repeat(auto-fit,minmax(110px,1fr)) !important;}',
      '@media (max-width:767px){',
      '  #sessionList .session-card-actions{width:100%;justify-content:flex-start;}',
      '  #sessionList .session-card-actions .btn{padding:.375rem .5rem !important;}',
      '  #sessionList .session-card-actions .btn .material-icons{font-size:16px !important;}',
      '  #sessionList .session-card-meta{grid-template-columns:repeat(2,1fr) !important;}',
      '}'
    ].join('\n');
    document.head.appendChild(st);
  }

  // Auto-load saat page-manage-sesi dibuka (MutationObserver)
  function hookPage(){
    var page = document.getElementById('page-manage-sesi');
    if (!page || page.__hooked) return;
    page.__hooked = true;
    if (page.classList.contains('active')) loadSessions();
    var mo = new MutationObserver(function(){
      if (page.classList.contains('active')) loadSessions();
    });
    mo.observe(page, { attributes:true, attributeFilter:['class'] });
  }
  function kick(){ setTimeout(hookPage, 300); setTimeout(hookPage, 1200); }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', kick);
  } else {
    kick();
  }
})();

console.log('✅ manage-sesi.js v6.0 loaded (orchestrator ramping, submenu dipindah ke ap.html)');