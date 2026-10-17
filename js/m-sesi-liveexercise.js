/* a#12 | /root/js/m-sesi-liveexercise.js | v 2.0 | u 13/09/2026 • 09:00:00 | xu : ke-2 | note : #noteresponse
- REFACTOR (Opsi B): dari sub-module renderer kartu (dipanggil orchestrator) menjadi
  SCREEN MANDIRI #page-sesi-live. Menu "Live Exercise" di sidebar kini membuka
  layar sendiri (pola sama seperti Riwayat Sesi).
- TANGGUNG JAWAB FILE INI:
  * Self-init saat #page-sesi-live di-activate (MutationObserver + expose loadLiveScreen).
  * Load sesi dari S.sessions (via window.loadSessionsForMode) lalu filter mode='live'.
  * Render list flat sorted by startTime desc (tidak perlu accordion batch karena
    overview batch sudah ada di parent #page-manage-sesi).
  * Patch async jumlah siswa in_progress per sesi (tidak blocking render).
  * Aksi khas live: gotoLiveMonitor (lompat ke page live-tka + filter sesi),
    duplicateSession (copy metadata + duplikat snapshot soal).
- DEPENDENSI (disediakan manage-sesi.js v6.0):
    window.escS, window.fmtDateSesi, window.loadSessionsForMode,
    window.__sessAttemptCount, window.toggleSessIcon, window.editSession,
    window.deleteSession, window.copySessionLink, window.gotoSoalSession,
    window.autoCode.
- GLOBAL yang dipakai: db, firebase, S, alert2, toast, loading, M (modal).
- EXPOSE: window.loadLiveScreen, window.renderLiveSessionCards (fallback),
  window.gotoLiveMonitor, window.duplicateSession.
- DATA LAMANYA TIDAK DISSENTUH (read-only). */

// ============================================
// STATE
// ============================================
var LIVE = {
  initialized: false,
  sessions: []   // hasil filter S.sessions mode=live
};

// ============================================
// RENDER (fallback bila ada yang panggil langsung)
// ============================================
function renderLiveSessionCards(sessions){
  if (!sessions || !sessions.length) {
    return '<div class="empty-state" style="padding:1.5rem;"><span class="material-icons">bolt</span>' +
      '<p>Belum ada sesi Live Exercise.</p>' +
      '<p style="font-size:.8125rem;color:#64748b;">Klik "Tambah Sesi" dan pilih mode Live Exercise.</p></div>';
  }
  var html = sessions.map(liveCard).join('');
  setTimeout(function(){
    patchLiveProgress(sessions.map(function(s){ return s.id; }));
  }, 50);
  return html;
}
window.renderLiveSessionCards = renderLiveSessionCards;

// ============================================
// RENDER KARTU LIVE
// ============================================
function liveCard(s){
  var code = s.code || '';
  var st = (S.sessionStats && S.sessionStats[s.id]) || {q:0, done:0, assigned:0};
  var hasAttempts = (window.__sessAttemptCount && window.__sessAttemptCount[s.id]) || 0;
  var antiOn = (s.antiCheat !== false);

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
        (antiOn?'Anti-Cheat AKTIF':'Anti-Cheat OFF') +
      '</span>' +
      (hasAttempts ? '<span>•</span><span style="color:#f59e0b;display:inline-flex;align-items:center;gap:.2rem;"><span class="material-icons" style="font-size:14px;">history</span>'+hasAttempts+' attempt</span>' : '') +
    '</div>';

  return '<div class="session-card">'+
    '<div class="session-card-header">'+
      '<div class="session-card-title" style="flex:1;min-width:0;">' +
        '<div style="display:flex;align-items:center;gap:.375rem;flex-wrap:wrap;">' +
          '<span class="material-icons" style="color:#10b981;">bolt</span>' +
          '<strong>' + escS(s.name) + '</strong> ' +
          '<span class="mode-badge-live"><span class="material-icons">bolt</span>Live</span>' +
          ((s.sourceType==='bank'||s.sourceType==='filter') ? ' <span class="badge badge-info" title="Soal dari Bank Soal"><span class="material-icons" style="font-size:12px;">inventory_2</span>Bank</span>' : '') +
          ' <span class="badge badge-'+(s.status?'success':'error')+'">'+(s.status?'Aktif':'Off')+'</span>'+
          ' <span class="badge badge-'+(s.visible?'info':'warning')+'">'+(s.visible?'Visible':'Hidden')+'</span>'+
          (s.locked?' <span class="badge badge-error">Locked</span>':'')+
          (code?' <span class="badge badge-info" style="font-family:monospace;">'+escS(code)+'</span>':'')+
        '</div>' +
        subtitle +
      '</div>'+
      '<div class="session-card-actions">'+
        '<button class="btn btn-primary btn-sm" onclick="gotoLiveMonitor(\''+s.id+'\')" title="Buka Live Monitoring"><span class="material-icons">visibility</span></button>'+
        (code?'<button class="btn btn-secondary btn-sm" onclick="copySessionLink(\''+s.id+'\')" title="Salin link siswa"><span class="material-icons">link</span></button> ':'')+
        '<button class="btn btn-secondary btn-sm" onclick="duplicateSession(\''+s.id+'\')" title="Duplikat sesi (copy soal)"><span class="material-icons">content_copy</span></button>'+
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
        '<div style="font-size:.7rem;font-weight:600;color:#64748b;">Sesi Berakhir:</div>' +
        '<div style="font-family:monospace;font-size:.8125rem;">' + fmtDateSesi(s.endTime) + '</div>' +
      '</div>' +
    '</div>'+
    '<div style="margin-top:.5rem;padding:.5rem .75rem;background:#ecfdf5;border:1px solid #a7f3d0;border-radius:8px;font-size:.8125rem;color:#065f46;display:flex;align-items:center;gap:.5rem;">' +
      '<span class="material-icons" style="font-size:16px;">monitor_heart</span>' +
      'Sedang mengerjakan: <b><span id="liveProg-'+s.id+'">…</span> siswa</b>' +
    '</div>'+
  '</div>';
}

// ============================================
// PATCH ASYNC: jumlah siswa in_progress per sesi
// ============================================
async function patchLiveProgress(ids){
  if (!ids || !ids.length) return;
  try {
    var snap = await db.collection('attempts').where('status','==','in_progress').get();
    var map = {};
    snap.forEach(function(d){
      var a = d.data();
      if (a.deleted === true) return;
      map[a.sessionId] = (map[a.sessionId]||0) + 1;
    });
    ids.forEach(function(sid){
      var el = document.getElementById('liveProg-'+sid);
      if (el) el.textContent = map[sid] || 0;
    });
  } catch(e){
    ids.forEach(function(sid){
      var el = document.getElementById('liveProg-'+sid);
      if (el) el.textContent = '0';
    });
  }
}

// ============================================
// SCREEN ENTRY POINT
// ============================================
async function loadLiveScreen(){
  var list = document.getElementById('liveScreenList');
  if (!list) return;

  list.innerHTML = '<div class="empty-state"><span class="material-icons">hourglass_empty</span><p>Memuat sesi Live...</p></div>';

  // Pastikan S.sessions + stats sudah ter-load (delegasi ke manage-sesi.js)
  if (typeof window.loadSessionsForMode === 'function') {
    await window.loadSessionsForMode();
  }

  // Filter mode=live, exclude deleted (sudah difilter manage-sesi.js saat loadSessions)
  var live = (S.sessions || []).filter(function(s){
    return (s.mode === 'live' || !s.mode);  // default mode = live
  });

  // Sort: yang sedang aktif + startTime terdekat di atas
  live.sort(function(a,b){
    var now = Date.now();
    var aStart = (a.startTime && a.startTime.toDate) ? a.startTime.toDate().getTime()
               : (a.startTime ? new Date(a.startTime).getTime() : 0);
    var aEnd = (a.endTime && a.endTime.toDate) ? a.endTime.toDate().getTime()
             : (a.endTime ? new Date(a.endTime).getTime() : 0);
    var bStart = (b.startTime && b.startTime.toDate) ? b.startTime.toDate().getTime()
               : (b.startTime ? new Date(b.startTime).getTime() : 0);
    var bEnd = (b.endTime && b.endTime.toDate) ? b.endTime.toDate().getTime()
             : (b.endTime ? new Date(b.endTime).getTime() : 0);
    var aActive = (aStart <= now && now <= aEnd) ? 1 : 0;
    var bActive = (bStart <= now && now <= bEnd) ? 1 : 0;
    if (aActive !== bActive) return bActive - aActive;
    if (bStart !== aStart) return bStart - aStart;
    return (a.name||'').localeCompare(b.name||'');
  });

  LIVE.sessions = live;

  // Header info
  var totalAssigned = 0, totalDone = 0;
  live.forEach(function(s){
    var st = (S.sessionStats && S.sessionStats[s.id]) || {q:0,done:0,assigned:0};
    totalAssigned += st.assigned || 0;
    totalDone += st.done || 0;
  });

  var header =
    '<div style="display:flex;justify-content:space-between;align-items:center;gap:.5rem;flex-wrap:wrap;margin-bottom:.75rem;">' +
      '<div style="font-size:.875rem;color:#475569;">' +
        '<b>'+live.length+'</b> sesi Live Exercise • ' +
        '<b>'+totalDone+'</b>/<b>'+totalAssigned+'</b> siswa selesai' +
      '</div>' +
      '<button type="button" class="btn btn-secondary btn-sm" onclick="loadLiveScreen()">' +
        '<span class="material-icons" style="font-size:14px;">refresh</span>Refresh</button>' +
    '</div>';

  if (!live.length) {
    list.innerHTML =
      '<div class="empty-state"><span class="material-icons">bolt</span>' +
        '<p>Belum ada sesi Live Exercise.</p>' +
        '<p style="font-size:.8125rem;color:#64748b;">Buat sesi baru dari menu <b>Manage Sesi</b> dan pilih mode <b>Live Exercise (di kelas)</b>.</p></div>';
    return;
  }

  list.innerHTML = header + live.map(liveCard).join('');

  // Patch async in_progress
  setTimeout(function(){
    patchLiveProgress(live.map(function(s){ return s.id; }));
  }, 50);
}
window.loadLiveScreen = loadLiveScreen;

// ============================================
// AKSI KHUSUS LIVE
// ============================================
window.gotoLiveMonitor = function(sid){
  var nav = document.querySelector('.nav-item[data-page="live-tka"]');
  if (!nav) return;
  nav.click();
  setTimeout(function(){
    var f = document.getElementById('liveFilter');
    if (f) { f.value = sid; if (window.loadLive) window.loadLive(); }
  }, 300);
};

window.duplicateSession = async function(sid){
  var src = S.sessions.find(function(x){ return x.id === sid; });
  if (!src) { alert2('Error','Sesi tidak ditemukan','error'); return; }
  if (!confirm('Duplikat sesi "'+(src.name||sid)+'"?\n\nSesi baru akan dibuat dengan nama "(Copy)" dan kode unik baru.\nSemua soal snapshot akan disalin ke sesi baru.')) return;

  var loadEl = (typeof loading === 'function') ? loading('Menduplikat sesi...') : null;
  try {
    var newCode = await autoCode((src.name||'sesi') + ' copy', null);

    var newData = {
      name: (src.name||'Sesi') + ' (Copy)',
      code: newCode,
      batch: src.batch || null,
      mode: src.mode || 'live',
      retryMode: src.retryMode || 'once',
      description: src.description || '',
      startTime: null,
      endTime: null,
      duration: src.duration || 60,
      status: false,
      visible: src.visible !== false,
      antiCheat: src.antiCheat !== false,
      locked: false,
      assignedStudents: (src.assignedStudents||[]).slice(),
      sourceType: src.sourceType || 'manual',
      questionRefs: src.questionRefs || null,
      questionFilter: src.questionFilter || null,
      duplicatedFrom: sid,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    if (!newData.questionRefs) delete newData.questionRefs;
    if (!newData.questionFilter) delete newData.questionFilter;

    var ref = await db.collection('sessions').add(newData);
    var newId = ref.id;

    // Salin snapshot soal
    var qSnap = await db.collection('questions').where('sessionId','==',sid).get();
    var batch = db.batch();
    var n = 0;
    qSnap.forEach(function(d){
      var q = d.data();
      if (q.deleted === true) return;
      var copy = Object.assign({}, q);
      delete copy.id;
      copy.sessionId = newId;
      copy.createdAt = firebase.firestore.FieldValue.serverTimestamp();
      batch.set(db.collection('questions').doc(), copy);
      n++;
    });
    if (n > 0) await batch.commit();

    if (loadEl) loadEl.close();
    alert2('Berhasil',
      'Sesi diduplikat dengan <b>'+n+'</b> soal.<br>Nama: '+escS(newData.name)+'<br>Kode: '+escS(newCode)+'<br><br>Status default OFF — aktifkan bila siap.',
      'success', function(){
        if (typeof window.loadSessions === 'function') window.loadSessions();
        loadLiveScreen();
      });
  } catch(e){
    if (loadEl) loadEl.close();
    alert2('Error','Gagal duplikat: '+e.message,'error');
  }
};

// ============================================
// AUTO-INIT (MutationObserver pada page aktif)
// ============================================
(function(){
  function hookPage(){
    var page = document.getElementById('page-sesi-live');
    if (!page || page.__liveHooked) return;
    page.__liveHooked = true;
    if (page.classList.contains('active')) loadLiveScreen();
    if (typeof MutationObserver === 'undefined') return;
    var mo = new MutationObserver(function(){
      if (page.classList.contains('active')) loadLiveScreen();
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

console.log('✅ m-sesi-liveexercise.js v2.0 loaded (screen mandiri #page-sesi-live)');