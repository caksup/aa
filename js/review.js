/* #17 | /root/js/review.js | v 2.1 | u 10/09/2026 • 20:00:00 | xu : ke-3 | note : #noteresponse
- v2.0 -> v2.1 (ADDITIVE improvements):
  * ADD DELETE BUTTON per attempt di tabel review (soft delete via window.softDelete)
    + tombol "Hapus Semua Attempt" di header untuk bulk delete per sesi (konfirmasi
    berlapis dengan input teks nama sesi). Attempt ter-trash tidak tampil di daftar.
  * ADD HISTOGRAM DISTRIBUSI NILAI (5 bucket: 0-20, 21-40, 41-60, 61-80, 81-100)
    dengan bar horizontal proporsional, warna per bucket, label jumlah + persentase.
    Responsive (stack di mobile). Stats ring (avg/max/min) tetap ada di bawah histogram.
  * ADD RESPONSIVE TABLE: desktop tetap tabel horizontal scroll, mobile (<768px)
    bertransformasi jadi card per row dengan data-label (teknik responsive table
    tanpa library). Header tabel sticky.
  * SOFT-DELETE AWARE: exclude attempt dengan deleted===true dari daftar & stats.
- TETAP IDENTIK: loadReviewDropdown, viewDetail (dengan tabSwitch/blur/auto-submit info),
  formatDuration helper, expose window.loadReview / window.viewDetail.
- EXPOSE BARU: window.deleteReviewAttempt, window.deleteAllAttemptsInSession.
- DEPENDENSI: db, firebase, S, M, alert2, toast, confirm2, window.softDelete. */

// ============================================
// RESPONSIVE CSS (inject sekali)
// ============================================
function injectReviewResponsiveCSS(){
  if (document.getElementById('review-responsive-css')) return;
  var st = document.createElement('style');
  st.id = 'review-responsive-css';
  st.textContent = [
    /* Histogram distribusi */
    '.rv-hist{display:flex;flex-direction:column;gap:.5rem;margin-bottom:1rem;}',
    '.rv-hist-row{display:grid;grid-template-columns:60px 1fr 60px;gap:.5rem;align-items:center;font-size:.8125rem;}',
    '.rv-hist-label{font-weight:600;color:#475569;font-family:monospace;}',
    '.rv-hist-bar{height:22px;background:#f1f5f9;border-radius:4px;overflow:hidden;position:relative;}',
    '.rv-hist-fill{height:100%;border-radius:4px;transition:width .4s ease;min-width:2px;}',
    '.rv-hist-count{font-size:.75rem;color:#64748b;text-align:right;font-family:monospace;}',
    /* Stats ring */
    '.rv-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:.5rem;margin-top:.75rem;padding-top:.75rem;border-top:1px dashed #e2e8f0;}',
    '.rv-stat{text-align:center;}',
    '.rv-stat-value{font-size:1.25rem;font-weight:800;font-family:monospace;}',
    '.rv-stat-label{font-size:.7rem;color:#64748b;text-transform:uppercase;letter-spacing:.05em;}',
    '.rv-stat-value.max{color:#10b981;}.rv-stat-value.avg{color:#2563eb;}.rv-stat-value.min{color:#ef4444;}',
    /* Responsive table */
    '.rv-table-wrap{overflow-x:auto;-webkit-overflow-scrolling:touch;}',
    '.rv-table thead th{position:sticky;top:0;background:#fff;z-index:1;}',
    '@media (max-width: 768px){',
    '  .rv-table thead{display:none;}',
    '  .rv-table tbody tr{display:block;margin-bottom:.75rem;padding:.75rem;background:#fff;border:1px solid #e2e8f0;border-radius:10px;box-shadow:0 1px 3px rgba(0,0,0,.04);}',
    '  .rv-table tbody td{display:flex;justify-content:space-between;align-items:center;padding:.375rem 0;border-bottom:1px dashed #f1f5f9;}',
    '  .rv-table tbody td:last-child{border-bottom:none;padding-top:.5rem;justify-content:flex-end;}',
    '  .rv-table tbody td::before{content:attr(data-label);font-size:.7rem;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.05em;}',
    '}',
    /* Bulk delete bar */
    '.rv-bulk-bar{display:flex;justify-content:space-between;align-items:center;gap:.5rem;margin-bottom:.75rem;padding:.5rem .75rem;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;flex-wrap:wrap;}'
  ].join('\n');
  document.head.appendChild(st);
}

// ============================================
// HELPERS
// ============================================
function formatDuration(sec){
  if(!sec) return '0d';
  var h = Math.floor(sec/3600), m = Math.floor((sec%3600)/60), s = sec%60;
  var p = function(n){ return String(n).padStart(2,'0'); };
  if (h > 0) return h+'j '+p(m)+'m';
  if (m > 0) return m+'m '+p(s)+'d';
  return s+'d';
}

function escRv(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

// ============================================
// HISTOGRAM DISTRIBUSI NILAI
// ============================================
function renderScoreDistribution(scores){
  if (!scores.length) {
    return '<div class="empty-state" style="padding:1rem;"><span class="material-icons">bar_chart</span><p>Belum ada data</p></div>';
  }

  var buckets = [
    { label:'0-20',  min:0,  max:20,  color:'#ef4444' },
    { label:'21-40', min:21, max:40,  color:'#f97316' },
    { label:'41-60', min:41, max:60,  color:'#eab308' },
    { label:'61-80', min:61, max:80,  color:'#3b82f6' },
    { label:'81-100',min:81, max:100, color:'#10b981' }
  ];
  buckets.forEach(function(b){ b.count = 0; });
  scores.forEach(function(s){
    for (var i=0; i<buckets.length; i++){
      if (s >= buckets[i].min && s <= buckets[i].max) { buckets[i].count++; break; }
    }
  });
  var maxCount = Math.max.apply(null, buckets.map(function(b){ return b.count; })) || 1;
  var total = scores.length;

  var avg = Math.round(scores.reduce(function(x,y){return x+y;},0)/scores.length);
  var max = Math.max.apply(null, scores);
  var min = Math.min.apply(null, scores);

  var histHtml = '<div class="rv-hist">' +
    buckets.map(function(b){
      var pct = Math.round(b.count/total*100);
      var widthPct = Math.round(b.count/maxCount*100);
      return '<div class="rv-hist-row">' +
        '<div class="rv-hist-label">'+b.label+'</div>' +
        '<div class="rv-hist-bar"><div class="rv-hist-fill" style="width:'+widthPct+'%;background:'+b.color+';"></div></div>' +
        '<div class="rv-hist-count">'+b.count+' ('+pct+'%)</div>' +
      '</div>';
    }).join('') +
  '</div>';

  var statsHtml =
    '<div class="rv-stats">' +
      '<div class="rv-stat"><div class="rv-stat-value max">'+max+'</div><div class="rv-stat-label">Tertinggi</div></div>' +
      '<div class="rv-stat"><div class="rv-stat-value avg">'+avg+'</div><div class="rv-stat-label">Rata-rata</div></div>' +
      '<div class="rv-stat"><div class="rv-stat-value min">'+min+'</div><div class="rv-stat-label">Terendah</div></div>' +
    '</div>';

  return histHtml + statsHtml;
}

// ============================================
// TABEL RESPONSIVE + DELETE BUTTON
// ============================================
function renderReviewTable(sid){
  if (!S.reviewAttempts.length) {
    return '<tr><td colspan="7" style="text-align:center;color:#94a3b8;">Belum ada data</td></tr>';
  }

  var bulkBar =
    '<div class="rv-bulk-bar">' +
      '<div style="font-size:.8125rem;color:#475569;"><b>'+S.reviewAttempts.length+'</b> attempt tercatat di sesi ini</div>' +
      '<button type="button" class="btn btn-error btn-sm" onclick="deleteAllAttemptsInSession(\''+sid+'\')">' +
        '<span class="material-icons" style="font-size:14px;">delete_sweep</span>Hapus Semua Attempt</button>' +
    '</div>';

  var rows = S.reviewAttempts.map(function(a){
    var st = S.students.find(function(s){ return s.id === a.studentId; });
    var name = st ? st.name : a.studentId;
    var escId = a.id.replace(/'/g,"\\'");
    return '<tr>' +
      '<td data-label="ID"><code style="font-size:.7rem;">'+a.studentId+'</code></td>' +
      '<td data-label="Nama"><strong>'+escRv(name)+'</strong></td>' +
      '<td data-label="Nilai"><strong style="color:#2563eb;">'+(a.score||0)+'</strong></td>' +
      '<td data-label="Benar">'+(a.correctAnswers||0)+'/'+(a.totalQuestions||0)+'</td>' +
      '<td data-label="Waktu">'+formatDuration(a.totalTime||0)+'</td>' +
      '<td data-label="Detail">' +
        '<button type="button" class="btn btn-secondary btn-sm" onclick="viewDetail(\''+escId+'\')" title="Lihat detail">' +
          '<span class="material-icons" style="font-size:14px;">visibility</span></button>' +
      '</td>' +
      '<td data-label="Hapus">' +
        '<button type="button" class="btn btn-error btn-sm" onclick="deleteReviewAttempt(\''+escId+'\')" title="Pindahkan ke Sampah">' +
          '<span class="material-icons" style="font-size:14px;">delete</span></button>' +
      '</td>' +
    '</tr>';
  }).join('');

  return bulkBar + rows;
}

// ============================================
// LOAD REVIEW (entry point)
// ============================================
async function loadReviewDropdown() {
  if (S.sessions.length === 0) await loadSessionsDropdown();
}

async function loadReview() {
  injectReviewResponsiveCSS();

  var sid = document.getElementById('reviewSession').value;
  var dist = document.getElementById('scoreDist');
  var top = document.getElementById('topPerformers');
  var body = document.getElementById('reviewBody');

  var emptyDist = '<span class="material-icons" style="font-size:48px;color:#94a3b8;">pie_chart</span>';
  var emptyTop = '<p style="color:#94a3b8;text-align:center;">Belum ada data</p>';
  var emptyBody = '<tr><td colspan="7" style="text-align:center;color:#94a3b8;">Pilih sesi</td></tr>';

  if (!sid) {
    dist.innerHTML = emptyDist; top.innerHTML = emptyTop; body.innerHTML = emptyBody;
    return;
  }

  var q = db.collection('attempts').where('sessionId', '==', sid).where('status', '==', 'completed');
  var snap = await q.get();

  // Muat students kalau belum
  if (!S.students.length) {
    var stSnap = await db.collection('students').get();
    S.students = []; stSnap.forEach(function(d){ S.students.push(Object.assign({id:d.id}, d.data())); });
  }

  if (snap.empty) {
    dist.innerHTML = '<div class="empty-state"><p>Belum ada data</p></div>';
    top.innerHTML = emptyTop;
    body.innerHTML = emptyBody;
    return;
  }

  S.reviewAttempts = [];
  snap.forEach(function(d){
    var data = d.data();
    if (data.deleted === true) return;  // exclude ter-trash
    S.reviewAttempts.push(Object.assign({ id: d.id }, data));
  });

  if (!S.reviewAttempts.length) {
    dist.innerHTML = '<div class="empty-state"><p>Semua attempt sudah dihapus / di-trash.</p></div>';
    top.innerHTML = emptyTop;
    body.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#94a3b8;">Tidak ada attempt aktif</td></tr>';
    return;
  }

  var scores = S.reviewAttempts.map(function(a){ return a.score || 0; });

  // Histogram + stats
  dist.innerHTML = renderScoreDistribution(scores);

  // Top performers (5 teratas, responsive)
  var sorted = S.reviewAttempts.slice().sort(function(a,b){ return (b.score||0) - (a.score||0); });
  top.innerHTML = sorted.slice(0, 5).map(function(a, i){
    var st = S.students.find(function(s){ return s.id === a.studentId; });
    var medal = i===0?'🥇':i===1?'🥈':i===2?'🥉':'';
    return '<div style="display:flex;align-items:center;gap:.5rem;padding:.5rem 0;border-bottom:1px solid #e2e8f0;">' +
      '<span style="width:28px;height:28px;border-radius:50%;background:' + (i<3?'#f59e0b':'#f1f5f9') + ';color:' + (i<3?'#fff':'#475569') + ';display:flex;align-items:center;justify-content:center;font-size:.75rem;font-weight:700;">' + (medal||(i+1)) + '</span>' +
      '<span style="flex:1;font-size:.8125rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + escRv(st ? st.name : a.studentId) + '</span>' +
      '<span class="badge badge-success">' + (a.score||0) + '</span>' +
    '</div>';
  }).join('');

  // Tabel responsive + bulk delete bar + delete per row
  body.innerHTML = renderReviewTable(sid);
}

// ============================================
// VIEW DETAIL (identik v2.0)
// ============================================
async function viewDetail(id) {
  var d = await db.collection('attempts').doc(id).get();
  if (!d.exists) return;
  var a = d.data();
  var st = S.students.find(function(s){ return s.id === a.studentId; });

  var msg =
    '<p><strong>Nilai:</strong> ' + (a.score||0) + '</p>' +
    '<p><strong>Benar:</strong> ' + (a.correctAnswers||0) + '/' + (a.totalQuestions||0) + '</p>' +
    '<p><strong>Waktu:</strong> ' + formatDuration(a.totalTime||0) + '</p>' +
    '<p><strong>Tab Switch:</strong> ' + (a.tabSwitchCount||0) + '</p>' +
    '<p><strong>Blur:</strong> ' + (a.blurCount||0) + '</p>';
  if (a.autoSubmitted) msg += '<p style="color:#f59e0b;"><strong>⚠ Auto-submit</strong> (waktu habis / pelanggaran)</p>';

  if (M && M.alert) M.alert('Detail - ' + (st ? st.name : a.studentId), msg, 'info');
  else alert2('Detail - ' + (st ? st.name : a.studentId), msg, 'info');
}

// ============================================
// DELETE (soft delete via trash)
// ============================================
window.deleteReviewAttempt = async function(id){
  var a = S.reviewAttempts.find(function(x){ return x.id === id; });
  var st = a ? S.students.find(function(s){ return s.id === a.studentId; }) : null;
  var label = (st ? st.name : '') + ' (score ' + (a ? (a.score||0) : '-') + ')';
  if (!confirm('Pindahkan attempt '+label+' ke Sampah?\n\nAnda bisa memulihkannya nanti dari menu Sampah.')) return;
  var ok = await window.softDelete('attempts', id);
  if (ok) {
    toast('Attempt dipindahkan ke Sampah','success');
    loadReview();
    if (window.__trash && window.__trash.initialized && window.Trash && window.Trash.load) {
      try { await window.Trash.load(); } catch(e){}
    }
  }
};

window.deleteAllAttemptsInSession = async function(sid){
  var s = (S.sessions||[]).find(function(x){ return x.id === sid; });
  var name = s ? s.name : sid;
  var n = S.reviewAttempts.length;
  if (!n) { toast('Tidak ada attempt untuk dihapus','info'); return; }
  var input = prompt('PERINGATAN: Hapus '+n+' attempt dari sesi "'+name+'".\n\nKetik HAPUS (huruf besar) untuk konfirmasi:');
  if (input !== 'HAPUS') { toast('Dibatalkan','info'); return; }
  var load = window.loading ? window.loading('Menghapus '+n+' attempt...') : null;
  var ok = 0, fail = 0;
  for (var i=0; i<S.reviewAttempts.length; i++){
    var r = await window.softDelete('attempts', S.reviewAttempts[i].id);
    if (r) ok++; else fail++;
  }
  if (load) load.close();
  if (window.alert2) alert2('Selesai', ok+' dipindahkan ke Sampah, '+fail+' gagal.', fail?'warning':'success');
  loadReview();
  if (window.__trash && window.__trash.initialized && window.Trash && window.Trash.load) {
    try { await window.Trash.load(); } catch(e){}
  }
};

// ============================================
// EXPOSE
// ============================================
window.loadReview = loadReview;
window.loadReviewDropdown = loadReviewDropdown;
window.viewDetail = viewDetail;

console.log('✅ review.js v2.1 loaded (histogram + responsive + delete)');