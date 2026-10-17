/* a#11 | /root/js/m-sesi-homework.js | v 2.0 | u 13/09/2026 • 10:00:00 | xu : ke-2 | note : #noteresponse
- REFACTOR (Opsi B): dari sub-module renderer kartu menjadi SCREEN MANDIRI
  #page-sesi-homework. Menu "Homework" di sidebar kini membuka layar sendiri
  (pola sama seperti Riwayat Sesi & Live Exercise).
- TANGGUNG JAWAB FILE INI:
  * Self-init saat #page-sesi-homework di-activate (MutationObserver + expose loadHomeworkScreen).
  * Load sesi dari S.sessions (via window.loadSessionsForMode) lalu filter mode='homework'.
  * Render list flat sorted by deadline (terdekat di atas, sudah lewat di bawah).
  * Patch async statistik retry per sesi (jumlah siswa pakai retry + rata-rata nilai terbaik).
- FITUR KARTU PR (dipertahankan dari v1.0):
  * Deadline info: "Sisa X hari Y jam" (hijau), "Sisa < 24 jam" (amber),
    "LEWAT deadline" (merah). Dihitung sync saat render.
  * Statistik retry async: "Pakai retry: N siswa • Rata-rata nilai terbaik: M"
    di-patch dari attempts completed (attemptNumber >= 2).
  * Badge retry "2x" bila retryMode=conditional.
  * Tombol Duplikat (delegasi ke duplicateSession dari m-sesi-liveexercise.js bila ada).
  * Tombol Edit + Delete + toggle status/visible/locked/anti-cheat.
- DEPENDENSI (window.* dari manage-sesi.js v6.0):
    escS, fmtDateSesi, loadSessionsForMode, __sessAttemptCount, toggleSessIcon,
    editSession, deleteSession, copySessionLink, gotoSoalSession.
- DEPENDENSI (window.* dari m-sesi-liveexercise.js, opsional):
    duplicateSession (tombol duplikat disembunyikan bila belum tersedia).
- GLOBAL: db, S, toast.
- EXPOSE: window.loadHomeworkScreen, window.renderHomeworkSessionCards (fallback),
  window.hwDeadlineInfo, window.hwDeadlineStyle. */

// ============================================
// STATE
// ============================================
var HW = {
  initialized: false,
  sessions: []   // hasil filter S.sessions mode=homework
};

// ============================================
// HELPER DEADLINE (sync)
// ============================================
function hwDeadlineInfo(s){
  if (!s.endTime) return { text:'Tanpa deadline', state:'none' };
  var end;
  try { end = s.endTime.toDate ? s.endTime.toDate() : new Date(s.endTime); } catch(e){ return { text:'Tanpa deadline', state:'none' }; }
  if (isNaN(end.getTime())) return { text:'Tanpa deadline', state:'none' };
  var diff = end.getTime() - Date.now();
  if (diff <= 0) return { text:'LEWAT deadline ('+fmtDateSesi(s.endTime)+')', state:'over' };
  var m = Math.floor(diff/60000), d = Math.floor(m/1440); m %= 1440;
  var h = Math.floor(m/60); m %= 60;
  var rel = d>0 ? (d+' hari '+h+' jam') : (h>0 ? (h+' jam '+m+' menit') : (m+' menit'));
  return { text:'Sisa '+rel, state: (diff < 24*3600*1000) ? 'urgent' : 'ok' };
}
window.hwDeadlineInfo = hwDeadlineInfo;

function hwDeadlineStyle(state){
  if (state === 'over')   return 'background:#fee2e2;color:#991b1b;';
  if (state === 'urgent') return 'background:#fef3c7;color:#92400e;font-weight:700;';
  if (state === 'ok')     return 'background:#ecfdf5;color:#065f46;';
  return 'background:#f1f5f9;color:#64748b;';
}
window.hwDeadlineStyle = hwDeadlineStyle;

// ============================================
// RENDER KARTU PR (fallback)
// ============================================
function renderHomeworkSessionCards(sessions){
  if (!sessions || !sessions.length) {
    return '<div class="empty-state" style="padding:1.5rem;"><span class="material-icons">menu_book</span>' +
      '<p>Belum ada sesi Homework / PR.</p>' +
      '<p style="font-size:.8125rem;color:#64748b;">Buat sesi baru dari menu <b>Manage Sesi</b> dan pilih mode <b>Homework / PR (di rumah)</b>.</p></div>';
  }
  var html = sessions.map(hwCard).join('');
  setTimeout(function(){
    patchHwRetryStats(sessions.map(function(s){ return s.id; }));
  }, 50);
  return html;
}
window.renderHomeworkSessionCards = renderHomeworkSessionCards;

function hwCard(s){
  var code = s.code || '';
  var st = (S.sessionStats && S.sessionStats[s.id]) || {q:0, done:0, assigned:0};
  var hasAttempts = (window.__sessAttemptCount && window.__sessAttemptCount[s.id]) || 0;
  var antiOn = (s.antiCheat !== false);
  var dl = hwDeadlineInfo(s);
  var hasDup = typeof window.duplicateSession === 'function';

  var retryBadge = (s.retryMode === 'conditional')
    ? ' <span class="hw-retry-badge"><span class="material-icons">refresh</span>2x</span>'
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
      '<span style="display:inline-flex;align-items:center;gap:.2rem;color:'+(antiOn?'#065f46':'#991b1b')+';">' +
        '<span class="material-icons" style="font-size:14px;">shield</span>' +
        (antiOn?'Anti-Cheat':'Anti-Cheat Off') +
      '</span>' +
      (hasAttempts ? '<span>•</span><span style="color:#f59e0b;display:inline-flex;align-items:center;gap:.2rem;"><span class="material-icons" style="font-size:14px;">history</span>'+hasAttempts+' attempt</span>' : '') +
    '</div>';

  return '<div class="session-card">'+
    '<div class="session-card-header">'+
      '<div class="session-card-title" style="flex:1;min-width:0;">' +
        '<div style="display:flex;align-items:center;gap:.375rem;flex-wrap:wrap;">' +
          '<span class="material-icons" style="color:#d97706;">menu_book</span>' +
          '<strong>' + escS(s.name) + '</strong> ' +
          '<span class="mode-badge-hw"><span class="material-icons">menu_book</span>PR</span>' +
          retryBadge +
          ((s.sourceType==='bank'||s.sourceType==='filter') ? ' <span class="badge badge-info" title="Soal dari Bank Soal"><span class="material-icons" style="font-size:12px;">inventory_2</span>Bank</span>' : '') +
          ' <span class="badge badge-'+(s.status?'success':'error')+'">'+(s.status?'Aktif':'Off')+'</span>'+
          ' <span class="badge badge-'+(s.visible?'info':'warning')+'">'+(s.visible?'Visible':'Hidden')+'</span>'+
          (s.locked?' <span class="badge badge-error">Locked</span>':'')+
          (code?' <span class="badge badge-info" style="font-family:monospace;">'+escS(code)+'</span>':'')+
        '</div>' +
        subtitle +
      '</div>'+
      '<div class="session-card-actions">'+
        (hasDup ? '<button class="btn btn-secondary btn-sm" onclick="duplicateSession(\''+s.id+'\')" title="Duplikat sesi (copy soal)"><span class="material-icons">content_copy</span></button>' : '')+
        (code?'<button class="btn btn-secondary btn-sm" onclick="copySessionLink(\''+s.id+'\')" title="Salin link siswa"><span class="material-icons">link</span></button> ':'')+
        '<button class="btn btn-secondary btn-sm" onclick="toggleSessIcon(\''+s.id+'\',\'status\')" title="Aktif/Nonaktif"><span class="material-icons">'+(s.status?'toggle_on':'toggle_off')+'</span></button>'+
        '<button class="btn btn-secondary btn-sm" onclick="toggleSessIcon(\''+s.id+'\',\'visible\')" title="Show/Hide"><span class="material-icons">'+(s.visible?'visibility':'visibility_off')+'</span></button>'+
        '<button class="btn '+(s.locked?'btn-warning':'btn-secondary')+' btn-sm" onclick="toggleSessIcon(\''+s.id+'\',\'locked\')" title="Lock/Unlock"><span class="material-icons">'+(s.locked?'lock':'lock_open')+'</span></button>'+
        '<button class="btn '+(antiOn?'btn-secondary':'btn-error')+' btn-sm" onclick="toggleSessIcon(\''+s.id+'\',\'antiCheat\')" title="Anti-Cheat on/off"><span class="material-icons">shield</span></button>'+
        '<button class="btn btn-secondary btn-sm" onclick="editSession(\''+s.id+'\')" title="Edit"><span class="material-icons">edit</span></button>'+
        '<button class="btn btn-error btn-sm" onclick="deleteSession(\''+s.id+'\')" title="Pindahkan ke Sampah"><span class="material-icons">delete</span></button>'+
      '</div>'+
    '</div>'+
    (s.description?'<p style="font-size:.8125rem;color:#64748b;margin:.5rem 0;">'+escS(s.description)+'</p>':'')+
    '<div class="session-card-meta">'+
      '<div class="session-meta-item"><span class="material-icons">timer</span>'+(s.duration||60)+' menit</div>'+
      '<div class="session-meta-item" style="cursor:pointer;color:#047857;" onclick="gotoSoalSession(\''+s.id+'\')" title="Buka Manage Soal"><span class="material-icons">quiz</span><u>'+st.q+' soal</u></div>'+
      '<div class="session-meta-item"><span class="material-icons">groups</span>'+st.assigned+' assigned</div>'+
      '<div class="session-meta-item"><span class="material-icons">task_alt</span>'+st.done+'/'+st.assigned+' selesai</div>'+
      '<div class="session-meta-item" style="display:block;">' +
        '<div style="font-size:.7rem;font-weight:600;color:#64748b;">Sesi mulai:</div>' +
        '<div style="font-family:monospace;font-size:.8125rem;">' + fmtDateSesi(s.startTime) + '</div>' +
      '</div>' +
      '<div class="session-meta-item" style="display:block;">' +
        '<div style="font-size:.7rem;font-weight:600;color:#64748b;">Deadline:</div>' +
        '<div style="font-family:monospace;font-size:.8125rem;">' + fmtDateSesi(s.endTime) + '</div>' +
      '</div>' +
    '</div>'+
    '<div style="margin-top:.5rem;display:flex;gap:.5rem;flex-wrap:wrap;">' +
      '<div style="flex:1;min-width:180px;padding:.5rem .75rem;border-radius:8px;font-size:.8125rem;display:flex;align-items:center;gap:.5rem;'+hwDeadlineStyle(dl.state)+'">' +
        '<span class="material-icons" style="font-size:16px;">schedule</span>' + escS(dl.text) +
      '</div>' +
      '<div style="flex:1;min-width:180px;padding:.5rem .75rem;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;font-size:.8125rem;color:#475569;display:flex;align-items:center;gap:.5rem;">' +
        '<span class="material-icons" style="font-size:16px;color:#d97706;">refresh</span>' +
        '<span id="hwRetry-'+s.id+'">Statistik retry: memuat…</span>' +
      '</div>' +
    '</div>'+
  '</div>';
}

// ============================================
// PATCH ASYNC: statistik retry per sesi
// ============================================
async function patchHwRetryStats(ids){
  if (!ids || !ids.length) return;
  var idSet = {};
  ids.forEach(function(x){ idSet[x] = 1; });
  try {
    var snap = await db.collection('attempts').where('status','==','completed').get();
    var per = {};
    snap.forEach(function(d){
      var a = d.data();
      if (a.deleted === true) return;
      if (!idSet[a.sessionId]) return;
      var p = per[a.sessionId] || (per[a.sessionId] = { best:{}, retry:{} });
      var sc = a.score || 0;
      var stu = a.studentId || '?';
      if (p.best[stu] === undefined || sc > p.best[stu]) p.best[stu] = sc;
      if ((a.attemptNumber || 1) >= 2) p.retry[stu] = 1;
    });
    ids.forEach(function(sid){
      var el = document.getElementById('hwRetry-'+sid);
      if (!el) return;
      var p = per[sid];
      if (!p) { el.textContent = 'Statistik retry: belum ada attempt selesai'; return; }
      var nRetry = Object.keys(p.retry).length;
      var bests = Object.keys(p.best).map(function(k){ return p.best[k]; });
      var avg = bests.length ? Math.round(bests.reduce(function(x,y){return x+y;},0)/bests.length) : 0;
      el.innerHTML = 'Pakai retry: <b>'+nRetry+'</b> siswa • Rata-rata nilai terbaik: <b>'+avg+'</b>';
    });
  } catch(e){
    ids.forEach(function(sid){
      var el = document.getElementById('hwRetry-'+sid);
      if (el) el.textContent = 'Statistik retry: gagal dimuat';
    });
  }
}

// ============================================
// SCREEN ENTRY POINT
// ============================================
async function loadHomeworkScreen(){
  var list = document.getElementById('homeworkScreenList');
  if (!list) return;

  list.innerHTML = '<div class="empty-state"><span class="material-icons">hourglass_empty</span><p>Memuat sesi Homework...</p></div>';

  if (typeof window.loadSessionsForMode === 'function') {
    await window.loadSessionsForMode();
  }

  var hw = (S.sessions || []).filter(function(s){
    return s.mode === 'homework';
  });

  // Sort: deadline terdekat dulu (ascending), yang sudah lewat di bawah
  hw.sort(function(a,b){
    var now = Date.now();
    var aEnd = (a.endTime && a.endTime.toDate) ? a.endTime.toDate().getTime()
               : (a.endTime ? new Date(a.endTime).getTime() : Infinity);
    var bEnd = (b.endTime && b.endTime.toDate) ? b.endTime.toDate().getTime()
               : (b.endTime ? new Date(b.endTime).getTime() : Infinity);
    var aOver = aEnd < now ? 1 : 0;
    var bOver = bEnd < now ? 1 : 0;
    if (aOver !== bOver) return aOver - bOver;
    if (aEnd !== bEnd) return aEnd - bEnd;
    return (a.name||'').localeCompare(b.name||'');
  });

  HW.sessions = hw;

  var totalAssigned = 0, totalDone = 0, nOver = 0, nUrgent = 0, nOk = 0;
  hw.forEach(function(s){
    var st = (S.sessionStats && S.sessionStats[s.id]) || {q:0,done:0,assigned:0};
    totalAssigned += st.assigned || 0;
    totalDone += st.done || 0;
    var dl = hwDeadlineInfo(s);
    if (dl.state === 'over') nOver++;
    else if (dl.state === 'urgent') nUrgent++;
    else if (dl.state === 'ok') nOk++;
  });

  var header =
    '<div style="display:flex;justify-content:space-between;align-items:center;gap:.5rem;flex-wrap:wrap;margin-bottom:.75rem;">' +
      '<div style="font-size:.875rem;color:#475569;">' +
        '<b>'+hw.length+'</b> sesi Homework • ' +
        '<b>'+totalDone+'</b>/<b>'+totalAssigned+'</b> selesai' +
        (nOver?' • <span style="color:#dc2626;">'+nOver+' lewat</span>':'') +
        (nUrgent?' • <span style="color:#d97706;">'+nUrgent+' urgent</span>':'') +
        (nOk?' • <span style="color:#059669;">'+nOk+' aman</span>':'') +
      '</div>' +
      '<button type="button" class="btn btn-secondary btn-sm" onclick="loadHomeworkScreen()">' +
        '<span class="material-icons" style="font-size:14px;">refresh</span>Refresh</button>' +
    '</div>';

  if (!hw.length) {
    list.innerHTML =
      '<div class="empty-state"><span class="material-icons">menu_book</span>' +
        '<p>Belum ada sesi Homework / PR.</p>' +
        '<p style="font-size:.8125rem;color:#64748b;">Buat sesi baru dari menu <b>Manage Sesi</b> dan pilih mode <b>Homework / PR (di rumah)</b>.</p></div>';
    return;
  }

  list.innerHTML = header + hw.map(hwCard).join('');

  setTimeout(function(){
    patchHwRetryStats(hw.map(function(s){ return s.id; }));
  }, 50);
}
window.loadHomeworkScreen = loadHomeworkScreen;

// ============================================
// AUTO-INIT (MutationObserver pada page aktif)
// ============================================
(function(){
  function hookPage(){
    var page = document.getElementById('page-sesi-homework');
    if (!page || page.__hwHooked) return;
    page.__hwHooked = true;
    if (page.classList.contains('active')) loadHomeworkScreen();
    if (typeof MutationObserver === 'undefined') return;
    var mo = new MutationObserver(function(){
      if (page.classList.contains('active')) loadHomeworkScreen();
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

console.log('✅ m-sesi-homework.js v2.0 loaded (screen mandiri #page-sesi-homework)');