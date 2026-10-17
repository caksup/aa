/* a#14 | /root/js/m-sesi-realtimexercise.js | v 2.5 | u 18/09/2026 • 03:00:00 | xu : ke-8 | note : #noteresponse
- v2.2 (baseline user) -> v2.5 (UPDATE KODE ROOM JEC-xxx sequential +
  perbaikan sisi siswa akan dikirim di file terpisah):
  * UPDATE #1: genRoomCode() kini ASYNC dan menghasilkan format JEC-001,
    JEC-002, JEC-003, ... (3 digit angka urut sesuai urutan pembuatan
    room realtime, persist via Firestore transaction di
    collection counters, doc realtimeRoom).
    - Counter atomic (runTransaction) sehingga tidak pernah bentrok walau
      banyak admin membuka secara bersamaan / hari berganti.
    - Nomor > 999 tetap tampil (misal JEC-1024), tidak overflow.
    - Fallback bila transaction gagal (offline/rules): JEC-xxx acak 3 digit
      (100-999) + loop cek unik, sehingga pembuatan room tidak pernah
      gagal total.
  * UPDATE #2: startRealtimeRoom() sekarang memanggil genRoomCode() async.
  * UPDATE #3: modal fallback openRealtimeHost() menampilkan kode dalam
    format baru (JEC-001) + catatan "urut per sesi".
  * KOMPATIBILITAS: room lama (JECxxx 6-char, JEC-RTxxx) tetap valid —
    sisi siswa (realtime.js v1.6, respons berikutnya) akan menerima
    semua format.
  * TETAP IDENTIK dari v2.2 baseline:
    - Screen mandiri #page-sesi-realtime + load robust (fallback query +
      watchdog + click backup).
    - Kartu realtime + patch status room async + tombol mulai/duplikat/
      toggle/edit/delete + meta durasi per soal dari sesi.
    - findActiveRoom (reuse room lobby/playing, tidak buat duplikat).
    - startRealtimeRoom menyalin questionDurationSec dari sesi.
    - openRealtimeHost -> host dashboard bila ada, else modal kode.
- DEPENDENSI (window.* dari manage-sesi.js): escS, fmtDateSesi,
  loadSessionsForMode, loadSessions, __sessAttemptCount, toggleSessIcon,
  editSession, deleteSession, gotoSoalSession. Opsional: duplicateSession.
- GLOBAL: db, firebase, S, alert2, toast, loading, M.
- EXPOSE: window.loadRealtimeScreen, window.renderRealtimeSessionCards,
  window.startRealtimeRoom, window.openRealtimeHost. */

// ============================================
// STATE
// ============================================
var RT = {
  initialized: false,
  sessions: []
};

// ============================================
// HELPER ROOM (UPDATE #1: JEC-xxx sequential via transaction)
// ============================================

// Fallback: JEC- + 3 digit acak (100-999) bila counter transaction gagal
function genRoomCodeFallback(){
  function rnd(){ return String(Math.floor(Math.random()*900)+100); }
  return 'JEC-' + rnd();
}

// Format angka ke JEC-001, JEC-002, dst. (>999 tampil apa adanya)
function formatRoomCode(num){
  return 'JEC-' + String(num).padStart(3, '0');
}

// Ambil nomor urut berikutnya via transaction atomic
async function getNextRoomNumber(){
  var counterRef = db.collection('counters').doc('realtimeRoom');
  var nextNum = 1;
  await db.runTransaction(async function(tx){
    var snap = await tx.get(counterRef);
    var current = 0;
    if (snap.exists) current = parseInt(snap.data().next, 10) || 0;
    nextNum = current + 1;
    tx.set(counterRef, {
      next: nextNum,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
  });
  return nextNum;
}

// Cek kode belum dipakai di liveRooms
async function ensureUniqueRoomCode(code){
  var snap = await db.collection('liveRooms').where('code','==',code).get();
  return snap.empty;
}

// Find active room (tetap dari v2.2)
async function findActiveRoom(sid){
  try {
    var snap = await db.collection('liveRooms').where('sessionId','==',sid).where('status','in',['lobby','playing']).get();
    var room = null;
    snap.forEach(function(d){ room = Object.assign({id:d.id}, d.data()); });
    return room;
  } catch(e){ return null; }
}

// Generator utama: sequential JEC-001 + fallback aman
async function genRoomCode(){
  // Coba jalur sequential
  try {
    var num = await getNextRoomNumber();
    var code = formatRoomCode(num);
    // Guard: bila nomor ternyata sudah dipakai (counter pernah di-edit manual)
    var tries = 0;
    while (!(await ensureUniqueRoomCode(code)) && tries < 5) {
      num++;
      code = formatRoomCode(num);
      tries++;
    }
    if (await ensureUniqueRoomCode(code)) return code;
    console.warn('[rt] sequential code collision, pakai fallback');
  } catch(e){
    console.warn('[rt] counter transaction gagal, pakai fallback:', e.message);
  }
  // Fallback: acak + loop cek unik
  var code2 = genRoomCodeFallback();
  var t2 = 0;
  while (!(await ensureUniqueRoomCode(code2)) && t2 < 10) {
    code2 = genRoomCodeFallback();
    t2++;
  }
  return code2;
}

// ============================================
// FALLBACK: query sessions langsung bila orchestrator gagal
// ============================================
async function fetchSessionsDirect(){
  console.warn('[rt-screen] fallback: query sessions langsung');
  var snap = await db.collection('sessions').get();
  var docs = [];
  snap.forEach(function(d){
    var data = d.data();
    if (data.deleted !== true) docs.push(Object.assign({id:d.id}, data));
  });
  S.sessions = docs;
  S.sessionStats = S.sessionStats || {};
  window.__sessAttemptCount = window.__sessAttemptCount || {};
  try {
    var qSnap = await db.collection('questions').get();
    var qCount = {};
    qSnap.forEach(function(d){
      var data = d.data();
      if (data.deleted === true) return;
      qCount[data.sessionId] = (qCount[data.sessionId]||0) + 1;
    });
    docs.forEach(function(s){
      var st = S.sessionStats[s.id];
      if (!st) { S.sessionStats[s.id] = { q: qCount[s.id]||0, done:0, assigned:(s.assignedStudents||[]).length }; }
      else { st.q = qCount[s.id]||0; }
    });
  } catch(e){}
}

// ============================================
// RENDER KARTU REALTIME (tetap dari v2.2)
// ============================================
function renderRealtimeSessionCards(sessions){
  if (!sessions || !sessions.length) {
    return '<div class="empty-state" style="padding:1.5rem;"><span class="material-icons">sports_esports</span>' +
      '<p>Belum ada sesi Realtime Live.</p>' +
      '<p style="font-size:.8125rem;color:#64748b;">Buat sesi baru dari menu <b>Manage Sesi</b> dan pilih mode <b>Realtime Live (host-led)</b>.</p></div>';
  }
  var html = sessions.map(rtCard).join('');
  setTimeout(function(){
    patchRtStatus(sessions.map(function(s){ return s.id; }));
  }, 50);
  return html;
}
window.renderRealtimeSessionCards = renderRealtimeSessionCards;

function rtCard(s){
  var code = s.code || '';
  var st = (S.sessionStats && S.sessionStats[s.id]) || {q:0, done:0, assigned:0};
  var hasAttempts = (window.__sessAttemptCount && window.__sessAttemptCount[s.id]) || 0;
  var hasDup = typeof window.duplicateSession === 'function';
  var noQuestions = (st.q || 0) === 0;

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
        '<span class="material-icons" style="font-size:14px;">groups</span>' +
        (s.assignedStudents||[]).length + ' assigned' +
      '</span>' +
      (hasAttempts ? '<span>•</span><span style="color:#f59e0b;display:inline-flex;align-items:center;gap:.2rem;"><span class="material-icons" style="font-size:14px;">history</span>'+hasAttempts+' attempt</span>' : '') +
    '</div>';

  return '<div class="session-card">'+
    '<div class="session-card-header">'+
      '<div class="session-card-title" style="flex:1;min-width:0;">' +
        '<div style="display:flex;align-items:center;gap:.375rem;flex-wrap:wrap;">' +
          '<span class="material-icons" style="color:#7c3aed;">sports_esports</span>' +
          '<strong>' + escS(s.name) + '</strong> ' +
          '<span class="badge" style="background:#ede9fe;color:#5b21b6;"><span class="material-icons" style="font-size:12px;">sports_esports</span>Realtime</span>' +
          ((s.sourceType==='bank'||s.sourceType==='filter') ? ' <span class="badge badge-info" title="Soal dari Bank Soal"><span class="material-icons" style="font-size:12px;">inventory_2</span>Bank</span>' : '') +
          ' <span class="badge badge-'+(s.status?'success':'error')+'">'+(s.status?'Aktif':'Off')+'</span>'+
          ' <span class="badge badge-'+(s.visible?'info':'warning')+'">'+(s.visible?'Visible':'Hidden')+'</span>'+
          (code?' <span class="badge badge-info" style="font-family:monospace;">'+escS(code)+'</span>':'')+
        '</div>' +
        subtitle +
      '</div>'+
      '<div class="session-card-actions">'+
        '<button class="btn btn-primary btn-sm" onclick="openRealtimeHost(\''+s.id+'\')" title="Mulai / Buka Host Dashboard"'+(noQuestions?' disabled style="opacity:.5;cursor:not-allowed;"':'')+'><span class="material-icons">sports_esports</span></button>'+
        (hasDup ? '<button class="btn btn-secondary btn-sm" onclick="duplicateSession(\''+s.id+'\')" title="Duplikat sesi (copy soal)"><span class="material-icons">content_copy</span></button>' : '')+
        '<button class="btn btn-secondary btn-sm" onclick="toggleSessIcon(\''+s.id+'\',\'status\')" title="Aktif/Nonaktif"><span class="material-icons">'+(s.status?'toggle_on':'toggle_off')+'</span></button>'+
        '<button class="btn btn-secondary btn-sm" onclick="toggleSessIcon(\''+s.id+'\',\'visible\')" title="Show/Hide"><span class="material-icons">'+(s.visible?'visibility':'visibility_off')+'</span></button>'+
        '<button class="btn btn-secondary btn-sm" onclick="editSession(\''+s.id+'\')" title="Edit"><span class="material-icons">edit</span></button>'+
        '<button class="btn btn-error btn-sm" onclick="deleteSession(\''+s.id+'\')" title="Pindahkan ke Sampah"><span class="material-icons">delete</span></button>'+
      '</div>'+
    '</div>'+
    (s.description?'<p style="font-size:.8125rem;color:#64748b;margin:.5rem 0;">'+escS(s.description)+'</p>':'')+
    '<div class="session-card-meta">'+
      '<div class="session-meta-item"><span class="material-icons">timer</span>'+(s.duration||60)+' menit</div>'+
      '<div class="session-meta-item" style="cursor:pointer;color:#047857;" onclick="gotoSoalSession(\''+s.id+'\')" title="Buka Manage Soal"><span class="material-icons">quiz</span><u>'+st.q+' soal</u></div>'+
      (s.mode==='realtime' && s.questionDurationSec
        ? '<div class="session-meta-item"><span class="material-icons">speed</span>'+escS(String(s.questionDurationSec))+' dtk/soal</div>'
        : '')+
      '<div class="session-meta-item" style="display:block;">' +
        '<div style="font-size:.7rem;font-weight:600;color:#64748b;">Sesi mulai:</div>' +
        '<div style="font-family:monospace;font-size:.8125rem;">' + fmtDateSesi(s.startTime) + '</div>' +
      '</div>' +
      '<div class="session-meta-item" style="display:block;">' +
        '<div style="font-size:.7rem;font-weight:600;color:#64748b;">Sesi Berakhir:</div>' +
        '<div style="font-family:monospace;font-size:.8125rem;">' + fmtDateSesi(s.endTime) + '</div>' +
      '</div>' +
    '</div>'+
    (noQuestions
      ? '<div style="margin-top:.5rem;padding:.5rem .75rem;background:#fee2e2;border-radius:8px;font-size:.8125rem;color:#991b1b;display:flex;align-items:center;gap:.5rem;">' +
          '<span class="material-icons" style="font-size:16px;">warning</span> Sesi belum punya soal — tambahkan soal dulu agar Realtime bisa dimulai.' +
        '</div>'
      : '<div style="margin-top:.5rem;padding:.5rem .75rem;background:#f5f3ff;border:1px solid #ddd6fe;border-radius:8px;font-size:.8125rem;color:#5b21b6;display:flex;align-items:center;gap:.5rem;flex-wrap:wrap;">' +
          '<span class="material-icons" style="font-size:16px;">wifi_tethering</span>' +
          '<span id="rtStatus-'+s.id+'">Status room: memuat…</span>' +
        '</div>') +
  '</div>';
}

// ============================================
// PATCH ASYNC: status room aktif per sesi (tetap dari v2.2)
// ============================================
async function patchRtStatus(ids){
  if (!ids || !ids.length) return;
  var idSet = {};
  ids.forEach(function(x){ idSet[x] = 1; });
  try {
    var snap = await db.collection('liveRooms').where('status','in',['lobby','playing']).get();
    var rooms = [];
    snap.forEach(function(d){
      var r = Object.assign({id:d.id}, d.data());
      if (idSet[r.sessionId]) rooms.push(r);
    });
    for (var i=0; i<Math.min(rooms.length,10); i++){
      try {
        var ps = await db.collection('liveRooms').doc(rooms[i].id).collection('players').get();
        rooms[i]._players = ps.size;
      } catch(e){ rooms[i]._players = 0; }
    }
    var bySession = {};
    rooms.forEach(function(r){ bySession[r.sessionId] = r; });

    ids.forEach(function(sid){
      var el = document.getElementById('rtStatus-'+sid);
      if (!el) return;
      var r = bySession[sid];
      if (!r) { el.textContent = 'Status room: belum ada room aktif — klik tombol ungu untuk memulai.'; return; }
      var label = r.status === 'playing' ? 'LIVE BERLANGSUNG' : 'LOBBY (menunggu siswa)';
      el.innerHTML = 'Status room: <b>'+label+'</b> • kode join: <b style="font-family:monospace;">'+escS(r.code||'-')+'</b> • pemain: <b>'+(r._players||0)+'</b>';
    });
  } catch(e){
    ids.forEach(function(sid){
      var el = document.getElementById('rtStatus-'+sid);
      if (el) el.textContent = 'Status room: gagal dimuat';
    });
  }
}

// ============================================
// SCREEN ENTRY POINT (tetap dari v2.2)
// ============================================
function rtErrorUI(msg){
  return '<div class="empty-state" style="padding:1.5rem;">' +
    '<span class="material-icons" style="color:#dc2626;">error</span>' +
    '<p style="color:#991b1b;font-weight:600;">Gagal memuat sesi Realtime</p>' +
    '<p style="font-size:.8125rem;color:#64748b;">'+escS(msg||'Kesalahan tidak diketahui.')+'</p>' +
    '<button type="button" class="btn btn-primary btn-sm" style="margin-top:.75rem;" onclick="loadRealtimeScreen()">' +
      '<span class="material-icons" style="font-size:14px;">refresh</span>Coba Lagi</button>' +
  '</div>';
}

async function loadRealtimeScreen(){
  var list = document.getElementById('realtimeScreenList');
  if (!list) { console.warn('[rt-screen] container #realtimeScreenList tidak ditemukan'); return; }

  list.innerHTML = '<div class="empty-state"><span class="material-icons">hourglass_empty</span><p>Memuat sesi Realtime...</p></div>';

  try {
    if (typeof window.loadSessionsForMode === 'function') {
      await window.loadSessionsForMode();
    } else if (typeof window.loadSessions === 'function') {
      await window.loadSessions();
    } else {
      await fetchSessionsDirect();
    }
    if (!S.sessions || !S.sessions.length) {
      await fetchSessionsDirect();
    }
  } catch(e) {
    console.error('[rt-screen] gagal load sessions via orchestrator:', e);
    try {
      await fetchSessionsDirect();
    } catch(e2) {
      console.error('[rt-screen] fallback langsung juga gagal:', e2);
      list.innerHTML = rtErrorUI('Tidak dapat memuat data sesi. Periksa koneksi / console. (' + (e2 && e2.message ? e2.message : e2) + ')');
      return;
    }
  }

  try {
    var rt = (S.sessions || []).filter(function(s){
      return s.mode === 'realtime';
    });
    rt.sort(function(a,b){
      return (a.name||'').localeCompare(b.name||'');
    });
    RT.sessions = rt;
    console.log('[rt-screen] render', rt.length, 'sesi realtime dari', (S.sessions||[]).length, 'sesi total');

    var totalAssigned = 0;
    rt.forEach(function(s){
      var st = (S.sessionStats && S.sessionStats[s.id]) || {q:0,done:0,assigned:0};
      totalAssigned += st.assigned || 0;
    });

    var header =
      '<div style="display:flex;justify-content:space-between;align-items:center;gap:.5rem;flex-wrap:wrap;margin-bottom:.75rem;">' +
        '<div style="font-size:.875rem;color:#475569;">' +
          '<b>'+rt.length+'</b> sesi Realtime • ' +
          '<b>'+totalAssigned+'</b> siswa assigned' +
        '</div>' +
        '<button type="button" class="btn btn-secondary btn-sm" onclick="loadRealtimeScreen()">' +
          '<span class="material-icons" style="font-size:14px;">refresh</span>Refresh</button>' +
      '</div>';

    if (!rt.length) {
      list.innerHTML =
        '<div class="empty-state"><span class="material-icons">sports_esports</span>' +
          '<p>Belum ada sesi Realtime Live.</p>' +
          '<p style="font-size:.8125rem;color:#64748b;">Buat sesi baru lewat tombol <b>Tambah Sesi Realtime</b> di atas, lalu pilih mode <b>Realtime Live (host-led)</b>.</p></div>';
      return;
    }

    list.innerHTML = header + rt.map(rtCard).join('');

    setTimeout(function(){
      patchRtStatus(rt.map(function(s){ return s.id; }));
    }, 50);
  } catch(e){
    console.error('[rt-screen] error render:', e);
    list.innerHTML = rtErrorUI('Error saat render: ' + (e && e.message ? e.message : e));
  }
}
window.loadRealtimeScreen = loadRealtimeScreen;

// ============================================
// MULAI / BUKA HOST (UPDATE #2: async genRoomCode + durasi per soal)
// ============================================
window.startRealtimeRoom = async function(sid){
  var s = S.sessions.find(function(x){ return x.id === sid; });
  if (!s) { alert2('Error','Sesi tidak ditemukan','error'); return null; }

  var existing = await findActiveRoom(sid);
  if (existing) return existing;

  var qSnap = await db.collection('questions').where('sessionId','==',sid).get();
  var qs = [];
  qSnap.forEach(function(d){
    var q = d.data();
    if (q.deleted !== true) qs.push(Object.assign({id:d.id}, q));
  });
  qs.sort(function(a,b){ return (a.order||0)-(b.order||0); });
  if (!qs.length) { alert2('Error','Sesi belum punya soal. Tambahkan soal dulu.','error'); return null; }

  // UPDATE #1: kode sequential JEC-001, JEC-002, ...
  var code = await genRoomCode();

  // UPDATE #2 (dari v2.2): durasi per soal dari setting sesi
  var qDur = parseInt(s.questionDurationSec, 10);
  if (isNaN(qDur) || qDur < 10 || qDur > 120) qDur = 30;

  var loadEl = (typeof loading === 'function') ? loading('Membuat room realtime...') : null;
  try {
    var ref = await db.collection('liveRooms').add({
      sessionId: sid,
      sessionName: s.name || '',
      hostId: (window.S && S.user && (S.user.id || S.user.username)) || 'admin',
      hostName: (window.S && S.user && S.user.name) || 'Admin',
      code: code,
      status: 'lobby',
      questionIds: qs.map(function(q){ return q.id; }),
      currentQuestionIndex: -1,
      questionDurationSec: qDur,
      revealAnswer: true,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    if (loadEl) loadEl.close();
    return Object.assign({id: ref.id}, {
      sessionId: sid, code: code, status: 'lobby',
      questionIds: qs.map(function(q){return q.id;}),
      questionDurationSec: qDur
    });
  } catch(e){
    if (loadEl) loadEl.close();
    alert2('Error','Gagal membuat room: '+e.message,'error');
    return null;
  }
};

window.openRealtimeHost = async function(sid){
  var s = S.sessions.find(function(x){ return x.id === sid; });
  if (!s) return;
  var loadEl = (typeof loading === 'function') ? loading('Menyiapkan host...') : null;
  var room = await window.startRealtimeRoom(sid);
  if (loadEl) loadEl.close();
  if (!room) return;

  var hostPage = document.getElementById('page-realtime-host');
  if (hostPage && window.S && typeof S.setPage === 'function') {
    window.__rtHostRoom = room;
    S.setPage('realtime-host');
    if (window.initRealtimeHost) window.initRealtimeHost(room.id || room);
    return;
  }

  // Fallback modal: kode format baru JEC-xxx
  var joinBase = location.href.split('?')[0].replace(/ap\.html$/,'sp.html');
  var joinLink = joinBase + '?jec-rt=' + encodeURIComponent(room.code || '');
  M.custom({
    title: 'Room Realtime Dibuat',
    message:
      '<div style="text-align:center;margin-bottom:1rem;">' +
        '<div style="font-size:.8125rem;color:#64748b;margin-bottom:.25rem;">Kode join siswa:</div>' +
        '<div style="font-size:2rem;font-weight:800;font-family:monospace;letter-spacing:.15em;color:#5b21b6;">'+escS(room.code||'')+'</div>' +
        '<div style="font-size:.75rem;color:#94a3b8;margin-top:.25rem;">Format JEC-001, JEC-002, ... (urut per sesi)</div>' +
      '</div>' +
      '<div style="background:#f5f3ff;padding:.75rem;border-radius:8px;font-size:.8125rem;color:#5b21b6;margin-bottom:.75rem;">' +
        'Siswa membuka panel siswa dan masuk lewat kode di atas, atau lewat link:<br>' +
        '<code style="word-break:break-all;">'+escS(joinLink)+'</code>' +
      '</div>' +
      '<div style="font-size:.8125rem;color:#64748b;">Host dashboard penuh (lobby, kontrol soal, leaderboard live) tersedia setelah <b>realtime-host.js</b> dimuat.</div>',
    type: 'info',
    buttons: [
      { text:'Tutup', class:'btn-secondary' },
      { text:'Salin Link Join', class:'btn-primary', action: function(){
          if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(joinLink).catch(function(){});
          toast('Link join disalin (kode: '+(room.code||'')+')','success');
        } }
    ]
  });

  patchRtStatus([sid]);
};

// ============================================
// AUTO-INIT (tetap dari v2.2)
// ============================================
(function(){
  function isPlaceholder(){
    var list = document.getElementById('realtimeScreenList');
    if (!list) return false;
    return list.textContent.indexOf('Memuat sesi Realtime') !== -1;
  }

  function hookPage(){
    var page = document.getElementById('page-sesi-realtime');
    if (!page || page.__rtHooked) return;
    page.__rtHooked = true;

    if (page.classList.contains('active')) loadRealtimeScreen();

    if (typeof MutationObserver !== 'undefined') {
      var mo = new MutationObserver(function(){
        if (page.classList.contains('active')) loadRealtimeScreen();
      });
      mo.observe(page, { attributes:true, attributeFilter:['class'] });
    }

    var wd = new MutationObserver(function(){
      if (page.classList.contains('active')) {
        setTimeout(function(){
          if (page.classList.contains('active') && isPlaceholder()) {
            console.warn('[rt-screen] watchdog: list masih placeholder, reload paksa');
            loadRealtimeScreen();
          }
        }, 2000);
      }
    });
    wd.observe(page, { attributes:true, attributeFilter:['class'] });
  }

  function hookNav(){
    var nav = document.querySelector('.nav-item[data-page="sesi-realtime"]');
    if (!nav || nav.__rtNavHooked) return;
    nav.__rtNavHooked = true;
    nav.addEventListener('click', function(){
      setTimeout(loadRealtimeScreen, 150);
    });
  }

  function kick(){
    hookPage();
    hookNav();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function(){ setTimeout(kick, 300); });
  } else {
    setTimeout(kick, 300);
    setTimeout(kick, 1200);
  }
})();

console.log('✅ m-sesi-realtimexercise.js v2.5 loaded (kode JEC-xxx sequential)');