/* a#17 | /root/js/hw-review.js | v 1.2 | u 15/09/2026 • 14:00:00 | xu : ke-3 | note : #noteresponse
- v1.1 -> v1.2 (FIX PASTI BLANK PAGE — root cause ditemukan):
  * ROOT CAUSE AKTUAL: ap.html sudah punya <div id="page-hw-review" class="page-content">
    (container kosong). Saat ensureHwReviewPage() jalan, ia mendeteksi page sudah ada
    dan LANGSUNG RETURN tanpa mengisi innerHTML. Akibatnya page kosong, dan ketika
    S.setPage('hw-review') menambah class 'active', page tampil tapi body tetap kosong
    (blank putih).
  * FIX 1 (CRITICAL): ensureHwReviewPage() sekarang cek apakah page sudah punya
    #hwrBody. Jika page ada tapi TIDAK punya #hwrBody, isi innerHTML dengan
    struktur lengkap (page-header + hwrBody). Ini handle kasus ap.html sudah
    memuat container kosong.
  * FIX 2: loadHwReviewScreen() force rebuild body bila #hwrBody tidak ada di DOM,
    atau bila #hwrSessionSelect tidak ditemukan (body rusak/placeholder).
  * FIX 3: Tambah debug console log di setiap tahap init, hook, dan load, supaya
    mudah troubleshoot bila masih ada masalah.
  * FIX 4: activateHwReview() memanggil ensureHwReviewPage() dulu sebelum add class
    'active', untuk menjamin struktur lengkap.
- TETAP IDENTIK dari v1.1:
  * Wrapper S.setPage deteksi hw-review.
  * Watchdog 500ms auto-load (max 20x).
  * Backup click listener di nav-item hw-review.
  * Multi-kick init di 4 waktu.
  * Tabel rekap siswa + tab Try 1/2 + render soal lengkap + pembahasan.
- EXPOSE: window.ensureHwReviewPage, window.activateHwReview,
  window.loadHwReviewScreen, window.hwrOnSessionChange, window.hwrRefresh,
  window.hwrOpenReview, window.hwrSwitchTry, window.hwrBackToList. */

var HWR = {
  sessions: [],
  sessionId: null,
  attemptsByStudent: {},
  studentOrder: [],
  questions: [],
  questionsById: {},
  questionsSessionId: null,
  currentStudentId: null,
  currentTryIdx: 0,
  watchdogAttempts: 0
};

function hwrEsc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

function hwrLoading(msg){
  if (typeof loading === 'function') return loading(msg);
  return { close: function(){} };
}

function hwrTsMs(t){
  if (!t) return 0;
  try { return t.toDate ? t.toDate().getTime() : new Date(t).getTime(); }
  catch(e){ return 0; }
}

function hwrFmtDate(t){
  var ms = hwrTsMs(t);
  if (!ms) return '-';
  var d = new Date(ms);
  var B = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
  function p2(n){ return String(n).padStart(2,'0'); }
  return d.getDate()+' '+B[d.getMonth()]+' '+d.getFullYear()+' '+p2(d.getHours())+':'+p2(d.getMinutes());
}

function hwrFmtDur(sec){
  sec = Math.max(0, Math.round(sec||0));
  var m = Math.floor(sec/60), s = sec%60;
  if (m > 0) return m+' mnt '+s+' dtk';
  return s+' dtk';
}

// ============================================
// PAGE SKELETON (FIX: handle container kosong dari ap.html)
// ============================================
function ensureHwReviewPage(){
  var page = document.getElementById('page-hw-review');
  var isNew = !page;
  
  if (!page) {
    var main = document.querySelector('.main-content');
    if (!main) {
      console.warn('[hwr] main-content tidak ditemukan');
      return null;
    }
    page = document.createElement('div');
    page.id = 'page-hw-review';
    page.className = 'page-content';
    main.appendChild(page);
    console.log('[hwr] page dibuat dari scratch');
  }
  
  // FIX 1 CRITICAL: cek apakah page punya struktur body (#hwrBody)
  // Jika tidak (artinya container kosong dari ap.html), isi struktur
  var hasBody = !!page.querySelector('#hwrBody');
  if (!hasBody) {
    page.innerHTML =
      '<div class="page-header">' +
        '<h1 class="page-title"><span class="material-icons">rate_review</span>Homework Review</h1>' +
        '<div style="display:flex;gap:.5rem;flex-wrap:wrap;">' +
          '<button class="btn btn-secondary" onclick="hwrRefresh()"><span class="material-icons">refresh</span>Refresh</button>' +
        '</div>' +
      '</div>' +
      '<div id="hwrBody"><div class="empty-state"><span class="material-icons">hourglass_empty</span><p>Memuat sesi homework...</p></div></div>';
    console.log('[hwr] struktur page diisi (container ada tapi kosong)');
  } else {
    console.log('[hwr] struktur page sudah ada');
  }
  
  return page;
}
window.ensureHwReviewPage = ensureHwReviewPage;

function activateHwReview(){
  document.querySelectorAll('.page-content').forEach(function(p){ p.classList.remove('active'); });
  var pg = ensureHwReviewPage(); // FIX 4: pastikan struktur ada sebelum activate
  if (pg) pg.classList.add('active');
  document.querySelectorAll('.nav-item').forEach(function(i){ i.classList.remove('active'); });
  var nav = document.querySelector('.nav-item[data-page="hw-review"]');
  if (nav) nav.classList.add('active');
  console.log('[hwr] page diactivate');
}
window.activateHwReview = activateHwReview;

// ============================================
// WRAPPER S.setPage (FIX 1 dari v1.1)
// ============================================
function hookSetPage(){
  if (window.__hwrSetPageHooked) {
    console.log('[hwr] setPage hook sudah terpasang');
    return;
  }
  if (!window.S) {
    console.warn('[hwr] window.S belum ada, coba lagi nanti');
    return;
  }
  if (typeof window.S.setPage !== 'function') {
    console.warn('[hwr] S.setPage bukan function:', typeof window.S.setPage);
    return;
  }
  window.__hwrSetPageHooked = true;
  var originalSetPage = window.S.setPage.bind(window.S);
  window.S.setPage = function(pageName){
    var result;
    try { result = originalSetPage(pageName); } catch(e){ console.error('[hwr] setPage error:', e); }
    if (pageName === 'hw-review') {
      console.log('[hwr] setPage("hw-review") terdeteksi, trigger load');
      ensureHwReviewPage();
      setTimeout(function(){
        var pg = document.getElementById('page-hw-review');
        if (pg && pg.classList.contains('active')) {
          loadHwReviewScreen();
        }
      }, 50);
    }
    return result;
  };
  console.log('[hwr] setPage wrapper terpasang');
}

// ============================================
// BACKUP CLICK LISTENER
// ============================================
function hookNavClicks(){
  var navs = document.querySelectorAll('.nav-item[data-page="hw-review"]');
  navs.forEach(function(nav){
    if (nav.__hwrClickHooked) return;
    nav.__hwrClickHooked = true;
    nav.addEventListener('click', function(){
      console.log('[hwr] nav-item hw-review diklik');
      setTimeout(function(){
        ensureHwReviewPage();
        var pg = document.getElementById('page-hw-review');
        if (pg && pg.classList.contains('active')) {
          loadHwReviewScreen();
        }
      }, 100);
    });
  });
  console.log('[hwr] click listener terpasang di', navs.length, 'nav-item');
}

// ============================================
// WATCHDOG
// ============================================
function startWatchdog(){
  if (window.__hwrWatchdog) {
    console.log('[hwr] watchdog sudah jalan');
    return;
  }
  window.__hwrWatchdog = setInterval(function(){
    var pg = document.getElementById('page-hw-review');
    if (!pg || !pg.classList.contains('active')) {
      HWR.watchdogAttempts = 0;
      return;
    }
    var body = document.getElementById('hwrBody');
    var isEmpty = !body || !body.innerHTML ||
                  body.innerHTML.indexOf('Memuat sesi homework') !== -1 ||
                  !document.getElementById('hwrSessionSelect');
    if (isEmpty && HWR.watchdogAttempts < 20) {
      HWR.watchdogAttempts++;
      console.warn('[hwr] watchdog: body kosong saat page aktif (attempt '+HWR.watchdogAttempts+')');
      loadHwReviewScreen();
    }
  }, 500);
  console.log('[hwr] watchdog dimulai');
}

// ============================================
// LOAD SCREEN (FIX 2: force rebuild bila body rusak)
// ============================================
async function loadHwReviewScreen(){
  console.log('[hwr] loadHwReviewScreen dipanggil');
  
  // Pastikan page & body ada
  ensureHwReviewPage();
  var body = document.getElementById('hwrBody');
  if (!body) {
    console.error('[hwr] hwrBody tidak ditemukan setelah ensureHwReviewPage');
    return;
  }
  
  // FIX 2: force rebuild bila body tidak punya session select
  var hasSelect = !!document.getElementById('hwrSessionSelect');
  if (!hasSelect) {
    console.log('[hwr] session select tidak ada, rebuild body');
    body.innerHTML = '<div class="empty-state"><span class="material-icons">hourglass_empty</span><p>Memuat sesi homework...</p></div>';
  }

  var load = hwrLoading('Memuat sesi homework...');
  try {
    var snap = await db.collection('sessions').get();
    HWR.sessions = [];
    snap.forEach(function(d){
      var s = Object.assign({id:d.id}, d.data());
      if (s.deleted === true) return;
      if (s.mode !== 'homework') return;
      HWR.sessions.push(s);
    });
    HWR.sessions.sort(function(a,b){ return (a.name||'').localeCompare(b.name||''); });
    console.log('[hwr] load', HWR.sessions.length, 'sesi homework');
    load.close();

    var opts = '<option value="">— Pilih Sesi Homework —</option>' + HWR.sessions.map(function(s){
      return '<option value="'+s.id+'"'+(s.id===HWR.sessionId?' selected':'')+'>'+hwrEsc(s.name||s.id)+'</option>';
    }).join('');

    body.innerHTML =
      '<div class="card"><div class="card-body">' +
        '<div style="display:flex;gap:.75rem;align-items:flex-end;flex-wrap:wrap;">' +
          '<div class="form-group" style="margin:0;flex:1;min-width:220px;">' +
            '<label class="form-label"><span class="material-icons" style="font-size:16px;vertical-align:-3px;color:#f59e0b;">menu_book</span> Sesi Pekerjaan Rumah</label>' +
            '<select class="form-control" id="hwrSessionSelect" onchange="hwrOnSessionChange(this.value)">'+opts+'</select>' +
          '</div>' +
        '</div>' +
        '<div style="font-size:.8125rem;color:#64748b;margin-top:.5rem;">' +
          'Menampilkan hasil pengerjaan siswa yang <b>sudah selesai</b> (status completed). ' +
          'Percobaan ulang (retry) tersimpan sebagai Try terpisah.' +
        '</div>' +
      '</div></div>' +
      '<div id="hwrListArea"></div>' +
      '<div id="hwrReviewArea"></div>';

    if (HWR.sessionId) hwrLoadAttempts();
  } catch(e){
    load.close();
    console.error('[hwr] loadHwReviewScreen error:', e);
    body.innerHTML =
      '<div class="empty-state"><span class="material-icons" style="color:#dc2626;">error</span>' +
      '<p>Gagal memuat: '+hwrEsc(e.message)+'</p>' +
      '<button class="btn btn-primary btn-sm" onclick="loadHwReviewScreen()" style="margin-top:.75rem;">' +
        '<span class="material-icons" style="font-size:14px;">refresh</span>Coba Lagi</button></div>';
  }
}
window.loadHwReviewScreen = loadHwReviewScreen;

window.hwrOnSessionChange = function(sid){
  HWR.sessionId = sid || null;
  HWR.currentStudentId = null;
  var ra = document.getElementById('hwrReviewArea');
  if (ra) ra.innerHTML = '';
  if (!sid) {
    var la = document.getElementById('hwrListArea');
    if (la) la.innerHTML = '';
    return;
  }
  hwrLoadAttempts();
};

window.hwrRefresh = function(){
  if (!HWR.sessionId) { loadHwReviewScreen(); return; }
  hwrLoadAttempts();
};

// ============================================
// LOAD ATTEMPTS
// ============================================
async function hwrLoadAttempts(){
  var la = document.getElementById('hwrListArea');
  if (!la) return;
  la.innerHTML = '<div class="empty-state"><span class="material-icons">hourglass_empty</span><p>Memuat hasil...</p></div>';

  try {
    var snap = await db.collection('attempts')
      .where('sessionId','==',HWR.sessionId)
      .where('status','==','completed')
      .get();

    HWR.attemptsByStudent = {};
    HWR.studentOrder = [];
    snap.forEach(function(d){
      var a = Object.assign({id:d.id}, d.data());
      if (a.mode !== 'homework') return;
      var sid = a.studentId || 'unknown';
      if (!HWR.attemptsByStudent[sid]) {
        HWR.attemptsByStudent[sid] = [];
        HWR.studentOrder.push(sid);
      }
      HWR.attemptsByStudent[sid].push(a);
    });

    HWR.studentOrder.forEach(function(sid){
      HWR.attemptsByStudent[sid].sort(function(x,y){
        var nx = (typeof x.attemptNumber === 'number') ? x.attemptNumber : 1;
        var ny = (typeof y.attemptNumber === 'number') ? y.attemptNumber : 1;
        if (nx !== ny) return nx - ny;
        return hwrTsMs(x.startedAt) - hwrTsMs(y.startedAt);
      });
    });

    HWR.studentOrder.sort(function(a,b){
      var na = (HWR.attemptsByStudent[a][0] && HWR.attemptsByStudent[a][0].studentName) || a;
      var nb = (HWR.attemptsByStudent[b][0] && HWR.attemptsByStudent[b][0].studentName) || b;
      return String(na).localeCompare(String(nb));
    });
    
    console.log('[hwr] load', HWR.studentOrder.length, 'siswa');

    hwrRenderList();
  } catch(e){
    console.error('[hwr] hwrLoadAttempts error:', e);
    la.innerHTML = '<div class="empty-state"><span class="material-icons" style="color:#dc2626;">error</span><p>Gagal memuat hasil: '+hwrEsc(e.message)+'</p></div>';
  }
}

function hwrRenderList(){
  var la = document.getElementById('hwrListArea');
  if (!la) return;

  if (!HWR.studentOrder.length) {
    la.innerHTML = '<div class="empty-state"><span class="material-icons">inbox</span><p>Belum ada siswa yang menyelesaikan homework ini.</p></div>';
    return;
  }

  var sess = HWR.sessions.find(function(s){ return s.id === HWR.sessionId; });

  var rows = HWR.studentOrder.map(function(sid, i){
    var atts = HWR.attemptsByStudent[sid];
    var first = atts[0], last = atts[atts.length-1];
    var name = first.studentName || sid;
    var tries = atts.length;

    var tryCells = '';
    for (var t=0; t<2; t++){
      var a = atts[t];
      tryCells += '<td style="text-align:center;">' + (a ? '<b>'+(a.score!=null?a.score:'-')+'</b>' : '<span style="color:#cbd5e1;">-</span>') + '</td>';
    }

    var viol = (last.tabSwitchCount||0) + (last.blurCount||0);

    return '<tr>' +
      '<td>'+(i+1)+'</td>' +
      '<td><b>'+hwrEsc(name)+'</b><div style="font-size:.7rem;color:#94a3b8;">'+hwrEsc(sid)+'</div></td>' +
      '<td style="text-align:center;"><span class="badge badge-info">'+tries+'x</span></td>' +
      tryCells +
      '<td style="text-align:center;"><b style="color:#047857;">'+(last.score!=null?last.score:'-')+'</b></td>' +
      '<td style="font-size:.75rem;">'+hwrFmtDate(last.finishedAt)+'</td>' +
      '<td style="text-align:center;">'+(viol>0 ? '<span class="badge badge-warning">'+viol+'</span>' : '<span style="color:#cbd5e1;">0</span>')+'</td>' +
      '<td><button class="btn btn-primary btn-sm" onclick="hwrOpenReview(\''+hwrEsc(sid).replace(/'/g,"\\'")+'\')"><span class="material-icons" style="font-size:14px;">rate_review</span>Review</button></td>' +
    '</tr>';
  }).join('');

  la.innerHTML =
    '<div class="card" style="margin-top:1rem;"><div class="card-header"><div class="card-title">' +
      '<span class="material-icons">groups</span>Hasil Pengerjaan — '+hwrEsc(sess?sess.name:'') +
      ' <span class="badge badge-success">'+HWR.studentOrder.length+' siswa</span>' +
    '</div></div><div class="card-body">' +
      '<div class="table-wrapper"><table class="table"><thead><tr>' +
        '<th>#</th><th>Siswa</th><th>Percobaan</th><th>Try 1</th><th>Try 2</th><th>Skor Akhir</th><th>Selesai</th><th>Pelanggaran</th><th>Aksi</th>' +
      '</tr></thead><tbody>'+rows+'</tbody></table></div>' +
    '</div></div>';
}

// ============================================
// REVIEW DETAIL
// ============================================
window.hwrOpenReview = async function(studentId){
  var ra = document.getElementById('hwrReviewArea');
  if (!ra) return;
  HWR.currentStudentId = studentId;
  HWR.currentTryIdx = 0;

  var la = document.getElementById('hwrListArea');
  if (la) la.style.display = 'none';

  ra.innerHTML = '<div class="empty-state"><span class="material-icons">hourglass_empty</span><p>Memuat snapshot soal...</p></div>';

  if (HWR.sessionId !== HWR.questionsSessionId) {
    try {
      var qSnap = await db.collection('questions').where('sessionId','==',HWR.sessionId).get();
      HWR.questions = [];
      HWR.questionsById = {};
      qSnap.forEach(function(d){
        var q = Object.assign({id:d.id}, d.data());
        if (q.deleted === true) return;
        HWR.questions.push(q);
        HWR.questionsById[q.id] = q;
      });
      HWR.questions.sort(function(a,b){ return (a.order||0)-(b.order||0); });
      HWR.questionsSessionId = HWR.sessionId;
    } catch(e){
      HWR.questions = []; HWR.questionsById = {};
    }
  }

  hwrRenderReview();
  ra.scrollIntoView({behavior:'smooth', block:'start'});
};

window.hwrSwitchTry = function(idx){
  HWR.currentTryIdx = idx;
  hwrRenderReview();
};

window.hwrBackToList = function(){
  HWR.currentStudentId = null;
  var ra = document.getElementById('hwrReviewArea');
  if (ra) ra.innerHTML = '';
  var la = document.getElementById('hwrListArea');
  if (la) la.style.display = '';
};

function hwrRenderReview(){
  var ra = document.getElementById('hwrReviewArea');
  if (!ra) return;

  var atts = HWR.attemptsByStudent[HWR.currentStudentId] || [];
  if (!atts.length) { ra.innerHTML = '<div class="empty-state"><p>Tidak ada attempt.</p></div>'; return; }
  if (HWR.currentTryIdx >= atts.length) HWR.currentTryIdx = 0;
  var att = atts[HWR.currentTryIdx];

  var tabs = atts.map(function(a, i){
    var active = (i === HWR.currentTryIdx);
    return '<button class="btn btn-sm '+(active?'btn-primary':'btn-secondary')+'" onclick="hwrSwitchTry('+i+')" style="margin-right:.375rem;">' +
      '<span class="material-icons" style="font-size:14px;">'+(i===0?'play_circle':'replay')+'</span>Try '+(i+1)+
      (a.score!=null?' ('+a.score+')':'') +
    '</button>';
  }).join('');

  var viol = (att.tabSwitchCount||0) + (att.blurCount||0);
  var meta =
    '<div style="display:flex;gap:.5rem;flex-wrap:wrap;align-items:center;margin:.75rem 0;">' +
      '<span class="badge badge-success" style="font-size:.8125rem;padding:.375rem .625rem;">Skor: <b>'+(att.score!=null?att.score:'-')+'</b></span>' +
      '<span class="badge badge-info">Benar: '+(att.correctAnswers!=null?att.correctAnswers:'-')+' / '+(att.totalQuestions!=null?att.totalQuestions:'-')+'</span>' +
      '<span class="badge badge-info">Durasi: '+hwrFmtDur(att.totalTime)+'</span>' +
      '<span class="badge badge-info">Selesai: '+hwrFmtDate(att.finishedAt)+'</span>' +
      (att.autoSubmitted ? '<span class="badge badge-warning">Auto-submit</span>' : '') +
      (viol>0 ? '<span class="badge badge-warning">Pelanggaran: '+viol+'</span>' : '') +
    '</div>';

  var soalHtml = hwrRenderSoalList(att);

  ra.innerHTML =
    '<div class="card" style="margin-top:1rem;">' +
      '<div class="card-header"><div class="card-title">' +
        '<span class="material-icons">rate_review</span>Review: '+hwrEsc(att.studentName||HWR.currentStudentId) +
      '</div>' +
      '<div style="display:flex;gap:.375rem;">' +
        '<button class="btn btn-secondary btn-sm" onclick="hwrBackToList()"><span class="material-icons" style="font-size:14px;">arrow_back</span>Kembali</button>' +
      '</div></div>' +
      '<div class="card-body">' +
        '<div style="margin-bottom:.5rem;">'+tabs+'</div>' +
        meta +
        soalHtml +
      '</div>' +
    '</div>';
}

// ============================================
// RENDER SOAL
// ============================================
function hwrCheck(q, ans){
  if (!q) return false;
  if (q.type === 'PGS') return String(ans||'').trim() === String(q.correctAnswer||'').trim();
  if (q.type === 'ISIAN') return String(ans||'').toLowerCase().trim() === String(q.correctAnswer||'').toLowerCase().trim();
  if (q.type === 'MCMA') {
    if (!Array.isArray(ans) || !Array.isArray(q.correctAnswer)) return false;
    return ans.slice().sort().join('|') === q.correctAnswer.slice().sort().join('|');
  }
  if (q.type === 'PGK') {
    if (window.parseBooleanAnswerList) {
      var expected = window.parseBooleanAnswerList(q.correctAnswer);
      var actual = window.parseBooleanAnswerList(ans);
      return !!(expected && actual && actual.length === expected.length &&
        (!q.statements || expected.length === q.statements.length) &&
        actual.every(function(value,index){ return value === expected[index]; }));
    }
    if (!Array.isArray(ans) || !Array.isArray(q.correctAnswer)) return false;
    if (ans.length !== q.correctAnswer.length) return false;
    for (var i=0;i<q.correctAnswer.length;i++) if (ans[i] !== q.correctAnswer[i]) return false;
    return true;
  }
  return false;
}

function hwrFmtAns(q, ans){
  if (ans == null || ans === '') return '<span style="color:#94a3b8;">(tidak dijawab)</span>';
  if (q.type === 'MCMA' && Array.isArray(ans)) return ans.slice().sort().join(', ') || '(kosong)';
  if (q.type === 'PGK' && Array.isArray(ans)) {
    return ans.map(function(v,i){ return (i+1)+':'+(v===true?'B':(v===false?'S':'-')); }).join(', ');
  }
  return hwrEsc(String(ans));
}

function hwrRenderSoalList(att){
  var answers = att.answers || {};
  var labels = { PGS:'Pilihan Ganda', MCMA:'Pilihan Ganda Kompleks', PGK:'Kategori Benar/Salah', ISIAN:'Isian Singkat' };

  if (!HWR.questions.length) {
    return '<div class="empty-state"><span class="material-icons">warning</span><p>Snapshot soal tidak ditemukan untuk sesi ini.</p></div>';
  }

  var cards = HWR.questions.map(function(q, i){
    var ans = answers[q.id];
    var answered = (ans !== undefined && ans !== null && ans !== '');
    var ok = hwrCheck(q, ans);

    var statusBadge = !answered
      ? '<span class="badge badge-warning">Tidak dijawab</span>'
      : (ok ? '<span class="badge badge-success"><span class="material-icons" style="font-size:12px;vertical-align:-2px;">check_circle</span>Benar</span>'
            : '<span class="badge badge-error"><span class="material-icons" style="font-size:12px;vertical-align:-2px;">cancel</span>Salah</span>');

    var body = '';

    if (q.type === 'PGS' || q.type === 'MCMA') {
      var keys = (q.type === 'PGS') ? [q.correctAnswer] : (q.correctAnswer||[]);
      var picks = (q.type === 'PGS') ? (ans!=null?[ans]:[]) : (Array.isArray(ans)?ans:[]);
      body += '<div style="display:flex;flex-direction:column;gap:.375rem;margin-top:.5rem;">';
      ['A','B','C','D','E'].forEach(function(l){
        if (!q.options || q.options[l] == null || q.options[l] === '') return;
        var isKey = keys.indexOf(l) !== -1;
        var isPick = picks.indexOf(l) !== -1;
        var bg = '#fff', bd = '#e2e8f0';
        if (isKey && isPick) { bg = '#ecfdf5'; bd = '#10b981'; }
        else if (isKey)      { bg = '#f0fdf4'; bd = '#86efac'; }
        else if (isPick)     { bg = '#fef2f2'; bd = '#fca5a5'; }
        var tags = '';
        if (isPick) tags += '<span class="badge badge-info" style="margin-left:.375rem;">Jawaban Siswa</span>';
        if (isKey)  tags += '<span class="badge badge-success" style="margin-left:.375rem;">Kunci</span>';
        body += '<div style="padding:.5rem .625rem;border:1px solid '+bd+';background:'+bg+';border-radius:8px;font-size:.8125rem;">' +
          '<b>'+l+'.</b> '+hwrEsc(q.options[l]) + tags +
        '</div>';
      });
      body += '</div>';
    }
    else if (q.type === 'PGK') {
      var sts = q.statements || [];
      var arr = Array.isArray(ans) ? ans : [];
      var keyArr = window.parseBooleanAnswerList
        ? (window.parseBooleanAnswerList(q.correctAnswer) || [])
        : (q.correctAnswer || []);
      body += '<div style="display:flex;flex-direction:column;gap:.375rem;margin-top:.5rem;">';
      sts.forEach(function(st, si){
        var sv = arr[si], kv = keyArr[si];
        var sok = (sv === kv);
        body += '<div style="padding:.5rem .625rem;border:1px solid '+(sok?'#86efac':'#fca5a5')+';background:'+(sok?'#f0fdf4':'#fef2f2')+';border-radius:8px;font-size:.8125rem;">' +
          '<b>'+(si+1)+'.</b> '+hwrEsc(st) +
          '<div style="margin-top:.25rem;font-size:.75rem;color:#475569;">' +
            'Jawaban siswa: <b>'+(sv===true?'True':(sv===false?'False':'-'))+'</b> • ' +
            'Kunci: <b>'+(kv===true?'True':(kv===false?'False':'-'))+'</b> ' +
            (sok ? '<span class="material-icons" style="font-size:14px;vertical-align:-3px;color:#10b981;">check_circle</span>'
                 : '<span class="material-icons" style="font-size:14px;vertical-align:-3px;color:#dc2626;">cancel</span>') +
          '</div>' +
        '</div>';
      });
      body += '</div>';
    }
    else {
      body += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:.5rem;margin-top:.5rem;">' +
        '<div style="padding:.5rem .625rem;border:1px solid '+(ok?'#86efac':'#fca5a5')+';background:'+(ok?'#f0fdf4':'#fef2f2')+';border-radius:8px;font-size:.8125rem;">' +
          '<div style="font-size:.7rem;color:#64748b;">Jawaban Siswa</div><b>'+hwrFmtAns(q, ans)+'</b>' +
        '</div>' +
        '<div style="padding:.5rem .625rem;border:1px solid #86efac;background:#f0fdf4;border-radius:8px;font-size:.8125rem;">' +
          '<div style="font-size:.7rem;color:#64748b;">Kunci</div><b>'+hwrEsc(q.correctAnswer||'')+'</b>' +
        '</div>' +
      '</div>';
    }

    var expl = q.explanation || q.discussion || q.pembahasan || q.solution || '';
    var explHtml = expl
      ? '<div style="margin-top:.625rem;padding:.625rem .75rem;background:#eff6ff;border-left:3px solid #2563eb;border-radius:6px;font-size:.8125rem;color:#1e40af;">' +
          '<b>Pembahasan:</b><br>'+hwrEsc(expl) +
        '</div>'
      : '';

    return '<div style="border:1px solid #e2e8f0;border-radius:10px;padding:.875rem;margin-bottom:.75rem;background:#fff;">' +
      '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:.5rem;flex-wrap:wrap;">' +
        '<div style="font-size:.8125rem;color:#64748b;">Soal '+(i+1)+' <span class="question-type-badge '+String(q.type||'').toLowerCase()+'">'+(labels[q.type]||q.type||'?')+'</span></div>' +
        statusBadge +
      '</div>' +
      '<div style="font-size:.9375rem;line-height:1.6;margin-top:.375rem;">'+hwrEsc(q.text||'')+'</div>' +
      body +
      explHtml +
    '</div>';
  }).join('');

  return cards;
}

// ============================================
// AUTO-INIT (multi-kick + semua hook)
// ============================================
(function(){
  function kick(){
    console.log('[hwr] kick init');
    ensureHwReviewPage();
    hookSetPage();
    hookNavClicks();
    startWatchdog();

    // Auto-load jika page sudah active (user reload saat di page ini)
    var pg = document.getElementById('page-hw-review');
    if (pg && pg.classList.contains('active')) {
      console.log('[hwr] page sudah active, auto-load');
      setTimeout(loadHwReviewScreen, 200);
    }
    
    // Retry hook setPage jika S belum ready
    if (!window.__hwrSetPageHooked) {
      console.log('[hwr] setPage belum terhook, retry 1s');
      setTimeout(hookSetPage, 1000);
    }
  }

  // Multi-kick
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function(){ setTimeout(kick, 300); });
  } else {
    setTimeout(kick, 300);
    setTimeout(kick, 800);
    setTimeout(kick, 1500);
    setTimeout(kick, 3000);
  }
})();

console.log('✅ hw-review.js v1.2 loaded (fix pasti blank page + debug log)');