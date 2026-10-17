/* #16 | /root/js/live-tka.js | v 2.3 | u 09/09/2026 • 09:10:00 | xu : ke-4 | note : #noteresponse
- UPDATE: Live Monitoring kini HANYA menampilkan attempt dari sesi mode LIVE.
  Attempt dari sesi mode HOMEWORK (PR) TIDAK tampil di live monitor (PR tidak diawasi ketat).
  Filter dilakukan di renderLiveArray (dipakai kedua mode Hemat & Loss) setelah sessions ter-load.
- TETAP (tidak dipotong dari v2.2): toggle Hemat/Loss, polling 20s auto-stop, onSnapshot loss,
  sticky first column, responsive scroll, cache soal/siswa/sesi, isCorrectLive. */

function isCorrectLive(q, a){
  if (q.type==='PGS')  return (a===q.correctAnswer);
  if (q.type==='MCMA') return JSON.stringify((a||[]).slice().sort())===JSON.stringify((q.correctAnswer||[]).slice().sort());
  if (q.type==='PGK') {
    var expected = window.parseBooleanAnswerList ? window.parseBooleanAnswerList(q.correctAnswer) : q.correctAnswer;
    var actual = window.parseBooleanAnswerList ? window.parseBooleanAnswerList(a) : a;
    return Array.isArray(actual) && Array.isArray(expected) && actual.length === expected.length &&
      actual.every(function(value,index){ return value === expected[index]; });
  }
  if (q.type==='ISIAN')return String(a||'').toLowerCase().trim()===String(q.correctAnswer||'').toLowerCase().trim();
  return false;
}

// ===== Cek apakah sesi ber-mode LIVE (bukan homework) =====
function isLiveSession(sid){
  var sess = S.sessions.find(function(s){ return s.id === sid; });
  if (!sess) return true;              // session belum/tidak ditemukan -> anggap live (aman)
  return sess.mode !== 'homework';
}

// ===== Helpers responsive + style =====
function injectLiveStyle(){
  if (document.getElementById('live-tka-style')) return;
  var st = document.createElement('style');
  st.id = 'live-tka-style';
  st.textContent = [
    '.live-scroll{overflow-x:auto;-webkit-overflow-scrolling:touch;border:1px solid #e2e8f0;border-radius:8px;grid-column:1/-1;}',
    '.live-scroll table{min-width:760px;border-collapse:collapse;width:100%;}',
    '.live-scroll th,.live-scroll td{padding:.625rem .75rem;text-align:left;font-size:.8125rem;white-space:nowrap;border-bottom:1px solid #f1f5f9;}',
    '.live-scroll th{background:#f8fafc;font-weight:600;color:#475569;position:sticky;top:0;z-index:1;}',
    '.live-scroll td:first-child,.live-scroll th:first-child{position:sticky;left:0;background:inherit;z-index:2;box-shadow:1px 0 0 #e2e8f0;}',
    '.live-scroll tbody tr:hover{background:#f8fafc;}',
    '.live-scroll td:first-child{background:#fff;}',
    '.live-scroll tbody tr:hover td:first-child{background:#f8fafc;}',
    '.live-controls{display:flex;gap:.5rem;align-items:center;margin-bottom:.75rem;flex-wrap:wrap;}',
    '.live-mode-btn{display:inline-flex;align-items:center;gap:.375rem;padding:.5rem .875rem;border:2px solid #e2e8f0;background:#fff;border-radius:8px;font-size:.8125rem;font-weight:600;cursor:pointer;transition:all .15s;font-family:inherit;}',
    '.live-mode-btn:hover{border-color:#2563eb;color:#2563eb;}',
    '.live-mode-btn.active-hemat{background:#d1fae5;border-color:#10b981;color:#065f46;}',
    '.live-mode-btn.active-loss{background:#fee2e2;border-color:#ef4444;color:#991b1b;}',
    '.live-mode-btn .material-icons{font-size:18px;}',
    '.live-mode-info{font-size:.7rem;color:#64748b;margin-left:.5rem;}',
    '@media (max-width:640px){.live-scroll table{min-width:640px;}.live-scroll th,.live-scroll td{padding:.5rem;font-size:.75rem;}}'
  ].join('\n');
  document.head.appendChild(st);
}

function ensureToggleBtn(){
  var page = document.getElementById('page-live-tka');
  if (!page) return;
  var header = page.querySelector('.page-header');
  if (!header) return;
  if (document.getElementById('liveToggleBar')) return;

  var bar = document.createElement('div');
  bar.id = 'liveToggleBar';
  bar.className = 'live-controls';
  bar.innerHTML =
    '<button type="button" class="live-mode-btn" id="btnModeHemat" onclick="setLiveMode(\'hemat\')">' +
      '<span class="material-icons">savings</span>Hemat' +
    '</button>' +
    '<button type="button" class="live-mode-btn" id="btnModeLoss" onclick="setLiveMode(\'loss\')">' +
      '<span class="material-icons">bolt</span>Loss (real-time)' +
    '</button>' +
    '<span class="live-mode-info" id="liveModeInfo"></span>';
  header.appendChild(bar);
}

function renderToggleState(){
  var h = document.getElementById('btnModeHemat');
  var l = document.getElementById('btnModeLoss');
  var info = document.getElementById('liveModeInfo');
  if (!h || !l) return;
  var mode = S.liveMode || 'hemat';
  h.classList.toggle('active-hemat', mode === 'hemat');
  l.classList.toggle('active-loss', mode === 'loss');
  h.classList.toggle('active-loss', false);
  l.classList.toggle('active-hemat', false);
  if (info) info.textContent = mode === 'hemat'
    ? '(poll tiap 20 detik · hemat read · hanya mode Live)'
    : '(real-time onSnapshot · boros read · hanya mode Live)';
}

function setMode(mode){
  S.liveMode = (mode === 'loss') ? 'loss' : 'hemat';
  renderToggleState();
  stopAllLive();
  if (S.liveMode === 'loss') startLossMode();
  else startHematMode();
}
window.setLiveMode = setMode;

function stopAllLive(){
  if (S.liveUnsub) { try{ S.liveUnsub(); }catch(e){} S.liveUnsub = null; }
  if (S.liveTimer) { clearInterval(S.liveTimer); S.liveTimer = null; }
}
window.stopLive = stopAllLive;

// ===== Mode HEMAT (poll 20 detik) =====
function startHematMode(){
  S.livePollMs = S.livePollMs || 20000;
  hematTick();
  S.liveTimer = setInterval(hematTick, S.livePollMs);
}
function hematTick(){
  if (document.hidden) return;
  var page = document.getElementById('page-live-tka');
  if (!page || !page.classList.contains('active')) {
    if (S.liveTimer) { clearInterval(S.liveTimer); S.liveTimer = null; }
    return;
  }
  hematFetch();
}
async function hematFetch(){
  try {
    var snap = await db.collection('attempts').where('status','==','in_progress').get();
    var arr = []; snap.forEach(function(d){ arr.push(Object.assign({id:d.id}, d.data())); });
    renderLiveArray(arr);
  } catch(e){
    var grid = document.getElementById('liveGrid');
    if (grid) grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1;"><span class="material-icons">error</span><p>'+e.message+'</p></div>';
  }
}

// ===== Mode LOSS (onSnapshot real-time) =====
function startLossMode(){
  if (S.liveUnsub) S.liveUnsub();
  S.liveUnsub = db.collection('attempts').where('status','==','in_progress')
    .onSnapshot(function(snap){
      var arr=[]; snap.forEach(function(d){ arr.push(Object.assign({id:d.id}, d.data())); });
      renderLiveArray(arr);
    }, function(err){
      var grid = document.getElementById('liveGrid');
      if (grid) grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1;"><span class="material-icons">error</span><p>'+err.message+'</p></div>';
    });
}

// ===== Entry point =====
async function loadLive(){
  injectLiveStyle();
  ensureToggleBtn();
  renderToggleState();

  var f = document.getElementById('liveFilter'); if (f) f.style.display='none';

  S.qCache = S.qCache || {};
  if (!S.liveMode) S.liveMode = 'hemat';

  if (S.liveMode === 'loss') startLossMode();
  else startHematMode();
}

// ===== Render tabel (array-based, dipakai kedua mode) =====
async function renderLiveArray(attempts){
  var grid = document.getElementById('liveGrid');
  if (!grid) return;

  // Load students & sessions DULU agar filter mode akurat
  if(!S.students.length){
    var st=await db.collection('students').get(); S.students=[];
    st.forEach(function(d){ S.students.push(Object.assign({id:d.id},d.data())); });
  }
  if(!S.sessions.length){
    if (window.loadSessions) { try { await loadSessions(); } catch(e){} }
  }

  // ===== FILTER: hanya sesi mode LIVE (homework tidak di-live-monitor) =====
  attempts = (attempts||[]).filter(function(a){ return isLiveSession(a.sessionId); });

  if (!attempts || attempts.length === 0){
    grid.innerHTML =
      '<div class="empty-state" style="grid-column:1/-1;">' +
        '<span class="material-icons">visibility_off</span>' +
        '<p>Tidak ada siswa yang sedang mengerjakan Live Exercise</p>' +
      '</div>';
    return;
  }

  // Cache soal per sesi
  var sids={}; attempts.forEach(function(a){ sids[a.sessionId]=1; });
  for (var sid in sids){
    if(!S.qCache[sid]){
      var q=await db.collection('questions').where('sessionId','==',sid).get();
      var arr=[]; q.forEach(function(d){ arr.push(Object.assign({id:d.id},d.data())); });
      arr.sort(function(a,b){return (a.order||0)-(b.order||0);});
      S.qCache[sid]=arr;
    }
  }

  var rows = attempts.map(function(a){
    var st=S.students.find(function(s){return s.id===a.studentId;});
    var sess=S.sessions.find(function(s){return s.id===a.sessionId;});
    var qs=S.qCache[a.sessionId]||[];
    var benar=0, answered=0;
    qs.forEach(function(q){
      var ans=a.answers&&a.answers[q.id];
      if(ans!==undefined&&ans!==''){ answered++; if(isCorrectLive(q,ans)) benar++; }
    });
    var salah=answered-benar;
    var poin=qs.length?Math.round(benar/qs.length*100):0;
    var lvl=(a.tabSwitchCount||0)>5?'badge-error':(a.tabSwitchCount||0)>2?'badge-warning':'badge-success';

    return '<tr>'+
      '<td><strong>'+a.studentId+'</strong></td>'+
      '<td>'+(st?st.name:'-')+'</td>'+
      '<td>'+(sess?sess.name:'-')+'</td>'+
      '<td>'+(a.progress+1)+'/'+(a.totalQuestions||qs.length)+'</td>'+
      '<td style="color:#10b981;font-weight:600;">'+benar+'</td>'+
      '<td style="color:#ef4444;font-weight:600;">'+salah+'</td>'+
      '<td><strong>'+poin+'</strong></td>'+
      '<td><span class="badge '+lvl+'">'+(a.tabSwitchCount||0)+'</span></td>'+
      '</tr>';
  }).join('');

  grid.innerHTML =
    '<div class="live-scroll">' +
      '<table class="table">' +
        '<thead><tr>' +
          '<th>ID</th><th>Nama</th><th>Mengerjakan Sesi</th><th>Progres</th>' +
          '<th>Benar</th><th>Salah</th><th>Poin</th><th>Pelanggaran</th>' +
        '</tr></thead>' +
        '<tbody>' + rows + '</tbody>' +
      '</table>' +
    '</div>';
}

window.loadLive = loadLive;