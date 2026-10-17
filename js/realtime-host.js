/* a#21 | /root/js/realtime-host.js | v 2.5 | u 15/09/2026 • 10:00:00 | xu : ke-7 | note : #noteresponse
- v2.4 -> v2.5 (UPDATE REQUEST USER: #1 #2 #5 host-side):
  * UPDATE #1: TOMBOL TAMBAH WAKTU (+10, +20, +30 detik) di Kontrol Host.
    Hanya tampil saat status=playing dan belum revealed. Tombol memanggil
    rtAddTime(seconds) yang update questionEndsAt di Firestore ke waktu
    sekarang + N detik. Countdown otomatis menyesuaikan.
  * UPDATE #2: TOMBOL REFRESH KONEKSI di header (icon refresh). Memanggil
    rtRefreshConnection() yang unsub semua listener lalu subscribe ulang
    + re-fetch room doc. Berguna jika koneksi hang / tidak sync.
  * UPDATE #5: INDIKATOR RADAR HIJAU ONLINE di header — bulatan hijau
    berkedip (CSS pulse animation) di kiri label LIVE/LOBBY/SELESAI,
    sebagai tanda koneksi realtime ke Firestore aktif.
  * CSS baru di-inject dari JS (id rt-host-style-v25): animasi
    @keyframes rtRadarPulse untuk efek radar.
  * TETAP IDENTIK dari v2.4: counter pemain di judul header, card pemain
    collapsible, header minimalis [←][🔗][↻] kiri, judul+status+kode tengah,
    [⏻] kanan. Kontrol Host, soal aktif + statistik + pembahasan, leaderboard,
    poin normal, optimistic update, auto-reveal tick, helper rtCurrentIndex()
    handle 0 dengan benar.
- EXPOSE: window.initRealtimeHost, window.rtStartNext, window.rtRevealNow,
  window.rtSkip, window.rtFinish, window.rtBack, window.rtCopyJoin,
  window.togglePlayersPanel, window.rtAddTime, window.rtRefreshConnection,
  window.ensureRealtimeHostPage. */

var RT = {
  roomId: null, room: null,
  unsubRoom: null, unsubPlayers: null, unsubAnswers: null, tickTimer: null,
  players: {}, answers: {}, qById: {}, qOrder: [],
  revealed: false, finished: false,
  online: true
};

function escH(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function rtLoading(msg){ if (typeof loading === 'function') return loading(msg); return { close: function(){} }; }
function rtDurationSec(){ return (RT.room && RT.room.questionDurationSec) || 30; }

function rtCurrentIndex(){
  if (!RT.room) return -1;
  var v = RT.room.currentQuestionIndex;
  return (typeof v === 'number' && !isNaN(v)) ? v : -1;
}

function rtEndsAtMs(){
  try {
    var t = RT.room && RT.room.questionEndsAt;
    if (!t) return 0;
    return t.toDate ? t.toDate().getTime() : new Date(t).getTime();
  } catch(e){ return 0; }
}

function normalPoints(a){
  if (!a || !a.correct) return 0;
  var dur = rtDurationSec();
  var usedSec = (a.timeMs || 0) / 1000;
  var remaining = Math.max(0, dur - usedSec);
  return 10 + Math.round(5 * remaining / Math.max(1,dur));
}

// ============================================
// CSS INJECT (radar online animation)
// ============================================
function injectHostStyles(){
  if (document.getElementById('rt-host-style-v25')) return;
  var st = document.createElement('style');
  st.id = 'rt-host-style-v25';
  st.textContent = [
    '.rt-online-radar{display:inline-block;width:10px;height:10px;background:#10b981;',
    '  border-radius:50%;margin-right:.375rem;vertical-align:middle;',
    '  animation:rtRadarPulse 2s ease-in-out infinite;}',
    '.rt-online-radar.offline{background:#ef4444;animation:none;}',
    '@keyframes rtRadarPulse{',
    '  0%,100%{box-shadow:0 0 0 0 rgba(16,185,129,.7);}',
    '  50%{box-shadow:0 0 0 6px rgba(16,185,129,0);}',
    '}',
    '.rt-time-btn{padding:.25rem .5rem;font-size:.75rem;font-weight:600;',
    '  border:1px solid #cbd5e1;background:#fff;border-radius:6px;cursor:pointer;',
    '  transition:all .15s;color:#475569;}',
    '.rt-time-btn:hover{background:#ecfdf5;border-color:#10b981;color:#047857;}',
    '.rt-time-btn:active{transform:scale(.95);}'
  ].join('\n');
  document.head.appendChild(st);
}

// ============================================
// NAVIGASI
// ============================================
function rtActivatePage(pageId, navPage){
  document.querySelectorAll('.page-content').forEach(function(p){ p.classList.remove('active'); });
  var pg = document.getElementById('page-' + pageId);
  if (pg) pg.classList.add('active');
  if (navPage) {
    document.querySelectorAll('.nav-item').forEach(function(i){ i.classList.remove('active'); });
    var nav = document.querySelector('.nav-item[data-page="' + navPage + '"]');
    if (nav) nav.classList.add('active');
  }
}

// ============================================
// PAGE SKELETON
// ============================================
function ensureRealtimeHostPage(){
  injectHostStyles();
  var page = document.getElementById('page-realtime-host');
  if (page) return page;
  var main = document.querySelector('.main-content');
  if (!main) return null;
  var div = document.createElement('div');
  div.id = 'page-realtime-host';
  div.className = 'page-content';
  div.innerHTML =
    '<div id="rtHostHeader"></div>' +
    '<div id="rtHostBody"><div class="empty-state"><span class="material-icons">hourglass_empty</span><p>Memuat room...</p></div></div>';
  main.appendChild(div);
  return div;
}
window.ensureRealtimeHostPage = ensureRealtimeHostPage;

// ============================================
// COLLAPSIBLE STATE
// ============================================
function playersStorageKey(){ return 'rt_host_players_open_' + (RT.roomId || 'default'); }
function isPlayersOpen(){
  try { return localStorage.getItem(playersStorageKey()) === '1'; } catch(e){ return false; }
}
function setPlayersOpen(open){
  try { localStorage.setItem(playersStorageKey(), open ? '1' : '0'); } catch(e){}
}
window.togglePlayersPanel = function(){
  setPlayersOpen(!isPlayersOpen());
  renderLobby();
};

// ============================================
// INIT
// ============================================
window.initRealtimeHost = async function(roomOrId){
  injectHostStyles();
  var roomId = (typeof roomOrId === 'object' && roomOrId) ? roomOrId.id : roomOrId;
  if (!roomId) { alert2('Error','Room tidak valid','error'); return; }
  ensureRealtimeHostPage();
  rtActivatePage('realtime-host', 'sesi-realtime');

  rtUnsubscribeAll();
  RT.roomId = roomId;
  RT.players = {}; RT.answers = {}; RT.qById = {}; RT.qOrder = [];
  RT.revealed = false; RT.finished = false;
  RT.online = true;

  if (localStorage.getItem(playersStorageKey()) == null) setPlayersOpen(false);

  var load = rtLoading('Memuat host dashboard...');
  try {
    var doc = await db.collection('liveRooms').doc(roomId).get();
    if (!doc.exists) { load.close(); alert2('Error','Room tidak ditemukan','error'); return; }
    RT.room = Object.assign({id: doc.id}, doc.data());
    RT.qOrder = RT.room.questionIds || [];

    if (RT.room.sessionId) {
      var qSnap = await db.collection('questions').where('sessionId','==',RT.room.sessionId).get();
      qSnap.forEach(function(d){
        var q = d.data();
        if (q.deleted !== true) RT.qById[d.id] = Object.assign({id:d.id}, q);
      });
    }
    load.close();

    renderHostHeader();
    renderHostAll();
    rtSubscribe();
    rtStartTick();
  } catch(e){
    load.close();
    alert2('Error','Gagal memuat host: '+e.message,'error');
  }
};

// ============================================
// SUBSCRIBE (dengan error handler untuk radar)
// ============================================
function rtSubscribe(){
  RT.unsubRoom = db.collection('liveRooms').doc(RT.roomId).onSnapshot(function(d){
    RT.online = true;
    renderHostHeader();
    if (!d.exists) return;
    var prevIndex = rtCurrentIndex();
    var prevStatus = RT.room ? RT.room.status : null;
    RT.room = Object.assign({id:d.id}, d.data());
    renderHostHeader();
    renderControl();
    var newIndex = rtCurrentIndex();
    if (prevIndex !== newIndex || prevStatus !== RT.room.status) {
      renderQuestionStats();
      renderLeaderboard();
    }
    var ends = rtEndsAtMs();
    if (RT.room.status === 'playing' && ends && Date.now() >= ends && !RT.revealed) {
      RT.revealed = true;
      renderQuestionStats();
      renderControl();
    }
  }, function(err){
    console.error('[rt-host] room snapshot error:', err);
    RT.online = false;
    renderHostHeader();
  });

  RT.unsubPlayers = db.collection('liveRooms').doc(RT.roomId).collection('players').onSnapshot(function(snap){
    RT.players = {};
    snap.forEach(function(d){ RT.players[d.id] = Object.assign({id:d.id}, d.data()); });
    renderHostHeader();
    renderLobby();
    renderLeaderboard();
  }, function(err){
    console.error('[rt-host] players snapshot error:', err);
    RT.online = false;
    renderHostHeader();
  });

  RT.unsubAnswers = db.collection('liveRooms').doc(RT.roomId).collection('answers').onSnapshot(function(snap){
    RT.answers = {};
    snap.forEach(function(d){ RT.answers[d.id] = Object.assign({id:d.id}, d.data()); });
    renderQuestionStats();
    renderLeaderboard();
  }, function(err){
    console.error('[rt-host] answers snapshot error:', err);
    RT.online = false;
    renderHostHeader();
  });
}

function rtUnsubscribeAll(){
  try { if (RT.unsubRoom) RT.unsubRoom(); } catch(e){}
  try { if (RT.unsubPlayers) RT.unsubPlayers(); } catch(e){}
  try { if (RT.unsubAnswers) RT.unsubAnswers(); } catch(e){}
  RT.unsubRoom = RT.unsubPlayers = RT.unsubAnswers = null;
  if (RT.tickTimer) { clearInterval(RT.tickTimer); RT.tickTimer = null; }
}

function rtStartTick(){
  if (RT.tickTimer) clearInterval(RT.tickTimer);
  RT.tickTimer = setInterval(function(){
    renderCountdown();
    var ends = rtEndsAtMs();
    if (RT.room && RT.room.status === 'playing' && ends && Date.now() >= ends && !RT.revealed) {
      RT.revealed = true;
      renderQuestionStats();
      renderControl();
    }
  }, 500);
}

// ============================================
// HEADER (dengan radar online + tombol refresh)
// ============================================
function renderHostHeader(){
  var el = document.getElementById('rtHostHeader');
  if (!el) return;
  if (!RT.room) { el.innerHTML = ''; return; }

  var statusLabel = RT.room.status === 'playing' ? 'LIVE' : (RT.room.status === 'finished' ? 'SELESAI' : 'LOBBY');
  var statusColor = RT.room.status === 'playing' ? '#dc2626' : (RT.room.status === 'finished' ? '#64748b' : '#7c3aed');
  var idx = rtCurrentIndex();
  var total = RT.qOrder.length || 0;
  var playerCount = Object.keys(RT.players).length;
  var codeDisplay = RT.room.code || '----';
  var radarClass = RT.online ? 'rt-online-radar' : 'rt-online-radar offline';
  var radarTitle = RT.online ? 'Koneksi realtime aktif' : 'Koneksi terputus, coba refresh';

  el.innerHTML =
    '<div style="display:flex;align-items:center;gap:.5rem;margin-bottom:1rem;flex-wrap:wrap;">' +
      '<button class="btn btn-secondary btn-sm" onclick="rtBack()" title="Kembali" style="padding:.5rem;">' +
        '<span class="material-icons" style="font-size:18px;">arrow_back</span></button>' +
      '<button class="btn btn-secondary btn-sm" onclick="rtCopyJoin()" title="Salin Link Join" style="padding:.5rem;">' +
        '<span class="material-icons" style="font-size:18px;">link</span></button>' +
      '<button class="btn btn-secondary btn-sm" onclick="rtRefreshConnection()" title="Refresh koneksi realtime" style="padding:.5rem;">' +
        '<span class="material-icons" style="font-size:18px;">refresh</span></button>' +
      '<div style="flex:1;min-width:150px;text-align:center;">' +
        '<div style="font-weight:700;font-size:1rem;">'+escH(RT.room.sessionName||'Realtime')+'</div>' +
        '<div style="font-size:.75rem;color:#64748b;">' +
          '<span class="'+radarClass+'" title="'+radarTitle+'"></span>' +
          '<b style="color:'+statusColor+';">'+statusLabel+'</b> • ' +
          '<span style="color:#5b21b6;font-weight:600;">'+playerCount+' pemain</span> • ' +
          'Soal <b>'+((idx+1)>0?(idx+1):'-')+'/'+total+'</b> • ' +
          'Kode <b style="font-family:monospace;color:#5b21b6;">'+escH(codeDisplay)+'</b>' +
        '</div>' +
      '</div>' +
      (RT.room.status !== 'finished'
        ? '<button class="btn btn-error btn-sm" onclick="rtFinish()" title="Akhiri Sesi & Simpan Hasil" style="padding:.5rem;">' +
            '<span class="material-icons" style="font-size:18px;">power_settings_new</span></button>'
        : '<span class="badge" style="background:#e2e8f0;color:#475569;">Selesai</span>') +
    '</div>';
}

// ============================================
// BODY
// ============================================
function renderHostAll(){
  var body = document.getElementById('rtHostBody');
  if (!body) return;
  body.innerHTML =
    '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:1rem;">' +
      '<div class="card"><div class="card-header" id="rtLobbyHeader" style="cursor:pointer;user-select:none;" onclick="togglePlayersPanel()"><div class="card-title"><span class="material-icons">groups</span>Pemain <span id="rtPlayerCount" style="color:#5b21b6;"></span></div><span class="material-icons" id="rtLobbyChevron" style="transition:transform .2s;color:#94a3b8;">expand_more</span></div><div class="card-body" id="rtLobby" style="display:none;padding-top:0;"></div></div>' +
      '<div class="card"><div class="card-header"><div class="card-title"><span class="material-icons">gamepad</span>Kontrol Host</div></div><div class="card-body" id="rtControl"></div></div>' +
    '</div>' +
    '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:1rem;margin-top:1rem;">' +
      '<div class="card"><div class="card-header"><div class="card-title"><span class="material-icons">quiz</span>Soal Aktif & Statistik</div></div><div class="card-body" id="rtQuestion"></div></div>' +
      '<div class="card"><div class="card-header"><div class="card-title"><span class="material-icons">leaderboard</span>Leaderboard</div></div><div class="card-body" id="rtLeader"></div></div>' +
    '</div>';
  renderLobby();
  renderControl();
  renderQuestionStats();
  renderLeaderboard();
}

function renderLobby(){
  var el = document.getElementById('rtLobby');
  var chevron = document.getElementById('rtLobbyChevron');
  var countEl = document.getElementById('rtPlayerCount');
  if (!el) return;

  var list = Object.keys(RT.players).map(function(k){ return RT.players[k]; });
  if (countEl) countEl.textContent = '('+list.length+')';

  var open = isPlayersOpen();
  if (chevron) chevron.style.transform = open ? 'rotate(180deg)' : 'rotate(0deg)';
  el.style.display = open ? 'block' : 'none';

  if (!list.length) {
    el.innerHTML = '<div class="empty-state" style="padding:1rem;"><span class="material-icons">group_add</span><p>Menunggu siswa...</p></div>';
    return;
  }
  el.innerHTML =
    '<div style="display:flex;flex-direction:column;gap:.25rem;max-height:260px;overflow-y:auto;">' +
    list.map(function(p,i){
      return '<div style="display:flex;align-items:center;gap:.5rem;padding:.375rem .5rem;background:#f8fafc;border-radius:6px;font-size:.8125rem;">' +
        '<span style="color:#94a3b8;width:1.25rem;text-align:right;">'+(i+1)+'.</span>' +
        '<span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">'+escH(p.name||p.studentId||p.id)+'</span>' +
      '</div>';
    }).join('') +
    '</div>';
}

function renderControl(){
  var el = document.getElementById('rtControl');
  if (!el || !RT.room) return;
  var idx = rtCurrentIndex();
  var total = RT.qOrder.length || 0;
  var finished = RT.room.status === 'finished';
  var dur = rtDurationSec();

  var html = '<div style="display:flex;flex-direction:column;gap:.625rem;">';
  html += '<div style="font-size:.8125rem;color:#64748b;">Soal aktif: <b>'+((idx+1)>0?(idx+1):'-')+' / '+total+'</b></div>';
  html += '<div style="display:flex;justify-content:space-between;align-items:center;gap:.5rem;">' +
    '<div style="font-size:.75rem;color:#64748b;">Durasi per soal</div>' +
    '<div style="padding:.25rem .5rem;background:#eff6ff;color:#1e40af;border-radius:6px;font-size:.8125rem;font-weight:700;">'+dur+' detik</div>' +
  '</div>';
  html += '<div id="rtCountdown" style="font-size:1.5rem;font-weight:800;font-family:monospace;color:#047857;">--:--</div>';

  // UPDATE #1: Tombol tambah waktu (hanya saat playing & belum revealed)
  var canAddTime = (RT.room.status === 'playing' && !RT.revealed && rtEndsAtMs() > Date.now());
  if (canAddTime) {
    html += '<div style="display:flex;gap:.375rem;flex-wrap:wrap;margin-top:.25rem;">' +
      '<span style="font-size:.75rem;color:#64748b;display:flex;align-items:center;">Tambah waktu:</span>' +
      '<button type="button" class="rt-time-btn" onclick="rtAddTime(10)">+10 dtk</button>' +
      '<button type="button" class="rt-time-btn" onclick="rtAddTime(20)">+20 dtk</button>' +
      '<button type="button" class="rt-time-btn" onclick="rtAddTime(30)">+30 dtk</button>' +
    '</div>';
  }

  if (finished) {
    html += '<div style="padding:.75rem;background:#f1f5f9;border-radius:8px;font-size:.8125rem;color:#475569;">Sesi selesai. Hasil tersimpan.</div>';
  } else if (RT.room.status === 'playing' && !RT.revealed && rtEndsAtMs() > Date.now()) {
    html += '<button class="btn btn-warning w-full" onclick="rtRevealNow()"><span class="material-icons">visibility</span>Reveal Sekarang</button>';
  } else if (RT.room.status === 'playing' && RT.revealed) {
    html += '<div style="padding:.625rem;background:#ecfdf5;border-radius:8px;font-size:.8125rem;color:#065f46;">Ter-reveal. Lanjut soal berikutnya.</div>';
    html += '<button class="btn btn-primary w-full" onclick="rtStartNext()"><span class="material-icons">skip_next</span>Soal Berikutnya</button>';
  } else {
    html += '<button class="btn btn-primary w-full" onclick="rtStartNext()"><span class="material-icons">play_arrow</span>Mulai Soal Berikutnya</button>';
  }
  html += '</div>';
  el.innerHTML = html;
}

function renderCountdown(){
  var el = document.getElementById('rtCountdown');
  if (!el) return;
  if (!RT.room || RT.room.status !== 'playing') { el.textContent = '--:--'; return; }
  var ends = rtEndsAtMs();
  if (!ends) { el.textContent = '--:--'; return; }
  var remain = Math.max(0, Math.floor((ends - Date.now())/1000));
  var m = Math.floor(remain/60), s = remain%60;
  el.textContent = String(m).padStart(2,'0')+':'+String(s).padStart(2,'0');
  el.style.color = remain <= 5 ? '#dc2626' : '#047857';
}

function currentQuestion(){
  var idx = rtCurrentIndex();
  if (idx < 0 || idx >= RT.qOrder.length) return null;
  var qid = RT.qOrder[idx];
  return (qid && RT.qById[qid]) || null;
}

function ansKey(a, q){
  if (!q) return '-';
  var v = a;
  if (q.type === 'MCMA' || q.type === 'PGK') {
    if (!Array.isArray(v)) return '-';
    if (q.type === 'PGK') return v.map(function(x){ return x?'B':'S'; }).join(',');
    return v.slice().sort().join(',');
  }
  return String(v==null?'-':v);
}

function renderQuestionStats(){
  var el = document.getElementById('rtQuestion');
  if (!el) return;
  var q = currentQuestion();
  var idx = rtCurrentIndex();

  if (!q || idx < 0) {
    el.innerHTML = '<div class="empty-state" style="padding:1rem;"><span class="material-icons">touch_app</span><p>Belum ada soal aktif.</p>' +
      (RT.qOrder.length ? '<p style="font-size:.75rem;color:#94a3b8;">Tersedia '+RT.qOrder.length+' soal. Klik "Mulai Soal Berikutnya".</p>' : '') +
    '</div>';
    return;
  }

  var labels = { PGS:'Pilihan Ganda', MCMA:'Pilihan Kompleks', PGK:'True/False', ISIAN:'Isian' };
  var html = '<div style="display:flex;gap:.5rem;flex-wrap:wrap;margin-bottom:.5rem;">' +
    '<span class="question-type-badge '+(q.type||'').toLowerCase()+'">'+(labels[q.type]||q.type)+'</span>' +
    '<span class="badge badge-info">Soal '+(idx+1)+'</span>' +
  '</div>';
  html += '<div style="font-size:.9375rem;line-height:1.6;margin-bottom:.75rem;">'+escH(q.text||'')+'</div>';

  var counts = {};
  var totalAns = 0;
  Object.keys(RT.answers).forEach(function(k){
    var a = RT.answers[k];
    if (a.qIndex !== idx) return;
    totalAns++;
    var key = ansKey(a.answer, q);
    counts[key] = (counts[key]||0) + 1;
  });

  var correctKey = ansKey(q.correctAnswer, q);
  var rows = [];
  if (q.type === 'PGS' || q.type === 'MCMA') {
    ['A','B','C','D','E'].forEach(function(l){
      if (!q.options || !q.options[l]) return;
      rows.push({ key:l, label:l+'. '+q.options[l] });
    });
  } else if (q.type === 'PGK') {
    (q.statements||[]).forEach(function(st,i){ rows.push({ key:'st'+i, label:(i+1)+'. '+st }); });
  } else {
    rows.push({ key:correctKey, label:'Jawaban: '+correctKey });
  }

  html += '<div style="font-size:.75rem;color:#64748b;margin-bottom:.375rem;">Jawaban masuk: <b>'+totalAns+'</b></div>';

  if (RT.revealed || RT.room.status === 'finished') {
    html += '<div style="padding:.5rem .75rem;background:#ecfdf5;border-left:3px solid #10b981;border-radius:6px;font-size:.8125rem;color:#065f46;margin-bottom:.5rem;">Kunci: <b>'+escH(correctKey)+'</b></div>';
    var max = 1;
    rows.forEach(function(r){ var c = counts[r.key]||0; if (c>max) max=c; });
    html += rows.map(function(r){
      var c = counts[r.key]||0;
      var pct = totalAns ? Math.round(c/totalAns*100) : 0;
      var isCorrect = (r.key === correctKey) || (q.type==='MCMA' && (q.correctAnswer||[]).includes(r.key));
      return '<div style="margin-bottom:.375rem;">' +
        '<div style="display:flex;justify-content:space-between;font-size:.75rem;"><span>'+escH(r.label.slice(0,60))+(isCorrect?' <b style="color:#10b981;">✓</b>':'')+'</span><span>'+c+' ('+pct+'%)</span></div>' +
        '<div style="height:6px;background:#e2e8f0;border-radius:3px;overflow:hidden;"><div style="height:100%;width:'+pct+'%;background:'+(isCorrect?'#10b981':'#94a3b8')+';"></div></div>' +
      '</div>';
    }).join('');

    var expl = q.explanation || q.discussion || q.pembahasan || q.solution || '';
    if (expl) {
      html += '<div style="margin-top:.75rem;padding:.625rem .75rem;background:#eff6ff;border-left:3px solid #2563eb;border-radius:6px;font-size:.8125rem;color:#1e40af;">' +
        '<b>Pembahasan:</b><br>' + escH(expl) +
      '</div>';
    }
  } else {
    html += '<div style="font-size:.8125rem;color:#64748b;">Statistik muncul setelah reveal.</div>';
  }
  el.innerHTML = html;
}

function renderLeaderboard(){
  var el = document.getElementById('rtLeader');
  if (!el) return;
  var agg = {};
  Object.keys(RT.answers).forEach(function(k){
    var a = RT.answers[k];
    var p = agg[a.studentId] || (agg[a.studentId] = { id:a.studentId, name:a.studentName||a.studentId, score:0, correct:0 });
    p.score += normalPoints(a);
    if (a.correct) p.correct++;
  });
  var list = Object.keys(agg).map(function(k){ return agg[k]; });
  list.sort(function(a,b){ return b.score - a.score; });
  if (!list.length) {
    el.innerHTML = '<div class="empty-state" style="padding:1rem;"><span class="material-icons">emoji_events</span><p>Belum ada skor.</p></div>';
    return;
  }
  el.innerHTML = list.slice(0,10).map(function(p,i){
    var medal = i===0?'🥇':i===1?'🥈':i===2?'🥉':'';
    return '<div style="display:flex;justify-content:space-between;align-items:center;padding:.375rem .5rem;border-bottom:1px solid #f1f5f9;font-size:.8125rem;">' +
      '<span>'+(medal||('<span style="color:#94a3b8;">'+(i+1)+'.</span>'))+' '+escH(p.name)+'</span>' +
      '<span style="font-weight:700;color:#5b21b6;">'+p.score+'</span>' +
    '</div>';
  }).join('');
}

// ============================================
// AKSI
// ============================================
window.rtStartNext = async function(){
  if (!RT.room || RT.room.status === 'finished') return;
  var idx = rtCurrentIndex() + 1;
  if (idx >= RT.qOrder.length) { alert2('Info','Semua soal selesai. Akhiri sesi (icon power) untuk menyimpan.','info'); return; }
  var dur = rtDurationSec();
  try {
    var newEndsAt = firebase.firestore.Timestamp.fromDate(new Date(Date.now() + dur*1000));
    await db.collection('liveRooms').doc(RT.roomId).update({
      status: 'playing',
      currentQuestionIndex: idx,
      questionEndsAt: newEndsAt,
      questionDurationSec: dur,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    RT.room.status = 'playing';
    RT.room.currentQuestionIndex = idx;
    RT.room.questionEndsAt = newEndsAt;
    RT.room.questionDurationSec = dur;
    RT.revealed = false;
    renderHostHeader();
    renderControl();
    renderQuestionStats();
    renderLeaderboard();
  } catch(e){ alert2('Error','Gagal memulai soal: '+e.message,'error'); }
};

window.rtRevealNow = async function(){
  if (!RT.room) return;
  try {
    var nowTs = firebase.firestore.Timestamp.fromDate(new Date());
    await db.collection('liveRooms').doc(RT.roomId).update({
      questionEndsAt: nowTs,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    RT.room.questionEndsAt = nowTs;
    RT.revealed = true;
    renderControl();
    renderQuestionStats();
    renderLeaderboard();
  } catch(e){ alert2('Error','Gagal reveal: '+e.message,'error'); }
};

window.rtSkip = async function(){ await window.rtStartNext(); };

// UPDATE #1: Tambah waktu soal
window.rtAddTime = async function(seconds){
  if (!RT.room || RT.room.status !== 'playing' || RT.revealed) return;
  if (typeof seconds !== 'number' || seconds <= 0) return;
  var ends = rtEndsAtMs();
  if (!ends) return;
  var newEndsMs = ends + (seconds * 1000);
  var newEndsAt = firebase.firestore.Timestamp.fromDate(new Date(newEndsMs));
  try {
    await db.collection('liveRooms').doc(RT.roomId).update({
      questionEndsAt: newEndsAt,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    RT.room.questionEndsAt = newEndsAt;
    renderCountdown();
    if (typeof toast === 'function') toast('+'+seconds+' detik ditambahkan','success');
  } catch(e){ alert2('Error','Gagal menambah waktu: '+e.message,'error'); }
};

// UPDATE #2: Refresh koneksi
window.rtRefreshConnection = async function(){
  if (!RT.roomId) return;
  var load = rtLoading('Menyegarkan koneksi...');
  try {
    rtUnsubscribeAll();
    var doc = await db.collection('liveRooms').doc(RT.roomId).get();
    if (doc.exists) {
      RT.room = Object.assign({id: doc.id}, doc.data());
      RT.qOrder = RT.room.questionIds || [];
      // Re-fetch soal
      if (RT.room.sessionId) {
        var qSnap = await db.collection('questions').where('sessionId','==',RT.room.sessionId).get();
        RT.qById = {};
        qSnap.forEach(function(d){
          var q = d.data();
          if (q.deleted !== true) RT.qById[d.id] = Object.assign({id:d.id}, q);
        });
      }
      RT.revealed = false;
      RT.online = true;
    }
    rtSubscribe();
    rtStartTick();
    load.close();
    renderHostHeader();
    renderHostAll();
    if (typeof toast === 'function') toast('Koneksi realtime di-refresh','success');
  } catch(e){
    load.close();
    RT.online = false;
    renderHostHeader();
    alert2('Error','Gagal refresh: '+e.message,'error');
  }
};

window.rtCopyJoin = function(){
  if (!RT.room || !RT.room.code) { toast('Kode belum tersedia','warning'); return; }
  var joinBase = location.href.split('?')[0].replace(/ap\.html$/,'sp.html');
  var code = RT.room.code;
  var link = joinBase + '?jec-rt=' + encodeURIComponent(code);
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(link).catch(function(){});
  else {
    var ta = document.createElement('textarea'); ta.value = link; ta.style.cssText='position:fixed;opacity:0;';
    document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove();
  }
  toast('Link join disalin (kode: '+code+')','success');
};

window.rtBack = function(){
  rtUnsubscribeAll();
  rtActivatePage('sesi-realtime', 'sesi-realtime');
  if (typeof window.loadRealtimeScreen === 'function') window.loadRealtimeScreen();
};

window.rtFinish = function(){
  if (!RT.room) return;
  var doFinish = async function(){
    var load = rtLoading('Menyimpan hasil...');
    try {
      var idxLast = RT.qOrder.length;
      var per = {};
      Object.keys(RT.answers).forEach(function(k){
        var a = RT.answers[k];
        var p = per[a.studentId] || (per[a.studentId] = { studentId:a.studentId, name:a.studentName||a.studentId, correct:0, points:0, answers:{} });
        if (a.correct) p.correct++;
        p.points += normalPoints(a);
        var q = RT.qById[RT.qOrder[a.qIndex]];
        if (q) p.answers[q.id] = a.answer;
      });

      var batch = db.batch();
      var nowTs = firebase.firestore.FieldValue.serverTimestamp();
      var n = 0;
      Object.keys(per).forEach(function(sid){
        var p = per[sid];
        var score = idxLast ? Math.round(p.correct / idxLast * 100) : 0;
        batch.set(db.collection('attempts').doc(), {
          studentId: p.studentId, studentName: p.name, sessionId: RT.room.sessionId,
          mode: 'realtime', status: 'completed', attemptNumber: 1,
          score: score, correctAnswers: p.correct, totalQuestions: idxLast,
          realtimePoints: p.points, answers: p.answers,
          totalTime: Math.round((Date.now() - ((RT.room.createdAt && RT.room.createdAt.toDate) ? RT.room.createdAt.toDate().getTime() : Date.now()))/1000),
          finishedAt: nowTs, createdAt: nowTs
        });
        n++;
      });

      Object.keys(RT.players).forEach(function(pid){
        if (per[pid]) return;
        batch.set(db.collection('attempts').doc(), {
          studentId: pid, studentName: RT.players[pid].name || pid, sessionId: RT.room.sessionId,
          mode: 'realtime', status: 'completed', attemptNumber: 1,
          score: 0, correctAnswers: 0, totalQuestions: idxLast,
          realtimePoints: 0, answers: {}, totalTime: 0,
          finishedAt: nowTs, createdAt: nowTs
        });
        n++;
      });

      if (n > 0) await batch.commit();
      await db.collection('liveRooms').doc(RT.roomId).update({
        status: 'finished',
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      RT.finished = true;
      load.close();
      alert2('Selesai', n + ' attempt disimpan.','success', function(){
        renderHostHeader();
        renderControl();
      });
    } catch(e){
      load.close();
      alert2('Error','Gagal menyimpan: '+e.message,'error');
    }
  };

  if (typeof confirm2 === 'function') {
    confirm2('Akhiri Sesi Realtime','Hasil disimpan sebagai attempt & room ditutup. Lanjut?', doFinish);
  } else if (confirm('Akhiri sesi dan simpan hasil?')) {
    doFinish();
  }
};

(function(){
  function kick(){ ensureRealtimeHostPage(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', kick);
  else { setTimeout(kick, 200); setTimeout(kick, 1000); }
})();

console.log('✅ realtime-host.js v2.5 loaded (+time buttons, refresh, radar online)');