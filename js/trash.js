/* #xx | /root/js/trash.js | v 1.1 | u 10/09/2026 • 17:40:00 | xu : ke-2 | note : #noteresponse
- v1.0 -> v1.1 (PATCH badge sidebar + auto-refresh):
  * updateCounts(): sekarang juga update `#badgeTrash` di sidebar dengan total item
    ter-trash di semua collection (supaya admin lihat jumlah sampah tanpa buka menu).
    Badge disembunyikan bila total = 0.
  * softDelete(): memanggil loadTabData(col) + updateCounts() setelah update berhasil,
    sehingga badge sidebar otomatis naik saat modul soal memindahkan item ke Sampah.
    Bila halaman Sampah sedang terbuka, list juga di-refresh otomatis.
  * Auto-init saat page load: loadAllTabs() + updateCounts() dipanggil sekali setelah
    DOM ready (delay 500ms), sehingga badge sidebar terisi meski menu Sampah belum dibuka.
- TETAP IDENTIK (tidak dipotong dari v1.0):
  * TRASH_TABS config (6 tab: questions, questionBank, sessions, attempts, students, feedback)
  * Helper: escT, fmtTs, daysBetween, currentAdminId
  * softDelete (update deleted/deletedAt/deletedBy/deletedFrom)
  * restoreItem (balikkan soft delete)
  * purgeItem (hapus permanen dengan konfirmasi "DELETE")
  * loadTabData / loadAllTabs
  * render (tab bar + search + list + aksi Restore/Purge)
  * bulkPurgePrompt (purge semua > N hari)
  * scanTrash + renderScannerResult + moveToTrash + moveAllFindings
  * initTrash (migrasi deleted:false ke doc lama)
  * ensureTrashPage + openTrash + load
  * Expose: window.Trash, window.softDelete, window.openTrash, window.loadTrash */

// ============================================
// KONFIG
// ============================================
var TRASH_TABS = [
  { id:'questions',   col:'questions',      label:'Soal Snapshot', icon:'quiz' },
  { id:'questionBank',col:'questionBank',   label:'Bank Soal',     icon:'inventory_2' },
  { id:'sessions',    col:'sessions',       label:'Sesi',          icon:'event_available' },
  { id:'attempts',    col:'attempts',       label:'Riwayat',       icon:'history' },
  { id:'students',    col:'students',       label:'Siswa',         icon:'people' },
  { id:'feedback',    col:'feedback',       label:'Feedback',      icon:'contact_support' }
];

window.__trash = {
  activeTab: 'questions',
  data: {},
  counts: {},
  search: '',
  initialized: false
};

// ============================================
// HELPER
// ============================================
function escT(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

function fmtTs(ts){
  if(!ts) return '-';
  var d;
  try{ d = ts.toDate ? ts.toDate() : new Date(ts); }catch(e){ return '-'; }
  if(isNaN(d.getTime())) return '-';
  var p = function(n){ return String(n).padStart(2,'0'); };
  return d.getDate()+'/'+p(d.getMonth()+1)+'/'+d.getFullYear()+' '+p(d.getHours())+':'+p(d.getMinutes());
}

function daysBetween(ts, now){
  if(!ts) return null;
  var d;
  try{ d = ts.toDate ? ts.toDate() : new Date(ts); }catch(e){ return null; }
  if(isNaN(d.getTime())) return null;
  return Math.floor(((now||Date.now()) - d.getTime()) / 86400000);
}

function currentAdminId(){
  try{ return (window.S && window.S.user && (window.S.user.id || window.S.user.username)) || 'admin'; }catch(e){ return 'admin'; }
}

// ============================================
// SOFT DELETE HELPER (dengan auto-update badge sidebar)
// ============================================
async function softDelete(col, id){
  if (!col || !id) { console.error('[Trash] softDelete: col/id wajib'); return false; }
  try {
    await db.collection(col).doc(id).update({
      deleted: true,
      deletedAt: firebase.firestore.FieldValue.serverTimestamp(),
      deletedBy: currentAdminId(),
      deletedFrom: col
    });
    // Refresh data tab & update badge sidebar
    try {
      await loadTabData(col);
      updateCounts();
      // Bila halaman Sampah sedang terbuka, refresh list juga
      if (window.__trash.activeTab && document.getElementById('trashContent')) render();
    } catch(e){}
    return true;
  } catch(e){
    console.error('[Trash] softDelete error:', e);
    if (window.alert2) alert2('Error','Gagal menghapus: '+e.message,'error');
    return false;
  }
}
window.softDelete = softDelete;

// ============================================
// RESTORE (balikkan soft delete)
// ============================================
async function restoreItem(col, id){
  try {
    await db.collection(col).doc(id).update({
      deleted: false,
      deletedAt: null,
      deletedBy: null
    });
    if (window.toast) toast('Item dipulihkan','success');
    await loadTabData(col);
    render();
    updateCounts();
    return true;
  } catch(e){
    if (window.alert2) alert2('Error','Gagal memulihkan: '+e.message,'error');
    return false;
  }
}

// ============================================
// PURGE PERMANEN
// ============================================
function purgeItem(col, id, label){
  var input = prompt('PERINGATAN: Hapus PERMANEN tidak bisa dikembalikan.\n\n' +
                     'Item: ' + (label || id) + '\n\n' +
                     'Ketik DELETE (huruf besar) untuk konfirmasi:');
  if (input !== 'DELETE') {
    if (window.toast) toast('Purge dibatalkan','info');
    return;
  }
  (async function(){
    try {
      await db.collection(col).doc(id).delete();
      if (window.toast) toast('Item dihapus permanen','success');
      await loadTabData(col);
      render();
      updateCounts();
    } catch(e){
      if (window.alert2) alert2('Error','Gagal hapus permanen: '+e.message,'error');
    }
  })();
}

// ============================================
// LOAD DATA PER TAB
// ============================================
async function loadTabData(col){
  try {
    var snap = await db.collection(col).where('deleted','==',true).get();
    window.__trash.data[col] = [];
    snap.forEach(function(d){
      window.__trash.data[col].push(Object.assign({id:d.id}, d.data()));
    });
    window.__trash.data[col].sort(function(a,b){
      var ta = 0, tb = 0;
      try{ if(a.deletedAt && a.deletedAt.toDate) ta = a.deletedAt.toDate().getTime(); }catch(e){}
      try{ if(b.deletedAt && b.deletedAt.toDate) tb = b.deletedAt.toDate().getTime(); }catch(e){}
      return tb - ta;
    });
    window.__trash.counts[col] = window.__trash.data[col].length;
  } catch(e){
    console.warn('[Trash] loadTabData error for', col, e);
    window.__trash.data[col] = [];
    window.__trash.counts[col] = 0;
  }
}

async function loadAllTabs(){
  var ld = null;
  if (window.loading) ld = window.loading('Memuat Sampah...');
  for (var i=0; i<TRASH_TABS.length; i++){
    await loadTabData(TRASH_TABS[i].col);
  }
  if (ld) ld.close();
}

// ============================================
// UPDATE COUNTS (termasuk badge sidebar)
// ============================================
async function updateCounts(){
  // Update counts di header card (bila halaman Sampah terbuka)
  var el = document.getElementById('trash-counts');
  if (el) {
    var html = '';
    TRASH_TABS.forEach(function(t){
      var c = window.__trash.counts[t.col] || 0;
      html += '<div style="display:flex;align-items:center;gap:.375rem;padding:.5rem .75rem;background:'+(c>0?'#fef3c7':'#f1f5f9')+';border-radius:8px;font-size:.8125rem;">' +
        '<span class="material-icons" style="font-size:16px;color:'+(c>0?'#d97706':'#64748b')+';">'+t.icon+'</span>' +
        '<span style="color:#475569;">'+escT(t.label)+'</span>' +
        '<span style="margin-left:auto;font-weight:700;color:'+(c>0?'#d97706':'#94a3b8')+';">'+c+'</span>' +
      '</div>';
    });
    el.innerHTML = html;
  }

  // Update badge di sidebar (total semua item ter-trash)
  var total = 0;
  TRASH_TABS.forEach(function(t){ total += (window.__trash.counts[t.col] || 0); });
  var badge = document.getElementById('badgeTrash');
  if (badge) {
    badge.textContent = total;
    badge.style.display = total > 0 ? '' : 'none';
  }
}

// ============================================
// RENDER (tab + list)
// ============================================
function render(){
  var container = document.getElementById('trashContent');
  if (!container) return;

  var active = window.__trash.activeTab;
  var tab = TRASH_TABS.find(function(t){ return t.id === active; });
  if (!tab) { container.innerHTML = '<div class="empty-state">Tab tidak valid</div>'; return; }

  var items = window.__trash.data[tab.col] || [];
  var q = (window.__trash.search || '').toLowerCase().trim();
  var filtered = items.filter(function(it){
    if (!q) return true;
    var hay = [
      it.id, it.name, it.text, it.title, it.subject, it.message,
      it.sessionId, it.studentId, it.code, it.batch
    ].join(' ').toLowerCase();
    return hay.indexOf(q) !== -1;
  });

  var html = '';

  // Tab bar
  html += '<div style="display:flex;gap:.25rem;overflow-x:auto;padding-bottom:.5rem;margin-bottom:1rem;border-bottom:1px solid #e2e8f0;-webkit-overflow-scrolling:touch;">';
  TRASH_TABS.forEach(function(t){
    var c = window.__trash.counts[t.col] || 0;
    var isActive = (t.id === active);
    html += '<button type="button" onclick="window.Trash.setTab(\''+t.id+'\')" ' +
      'style="flex:0 0 auto;display:flex;align-items:center;gap:.375rem;padding:.5rem .875rem;background:'+(isActive?'#2563eb':'#f8fafc')+
      ';color:'+(isActive?'#fff':'#475569')+';border:1px solid '+(isActive?'#2563eb':'#e2e8f0')+
      ';border-radius:8px;cursor:pointer;font-size:.8125rem;font-weight:600;white-space:nowrap;">' +
      '<span class="material-icons" style="font-size:16px;">'+t.icon+'</span>' +
      escT(t.label) +
      (c > 0 ? ' <span style="background:'+(isActive?'#fff':'#2563eb')+';color:'+(isActive?'#2563eb':'#fff')+
        ';font-size:.65rem;padding:1px 6px;border-radius:50px;font-weight:700;">'+c+'</span>' : '') +
    '</button>';
  });
  html += '</div>';

  // Search + aksi tab
  html += '<div style="display:flex;gap:.5rem;margin-bottom:1rem;flex-wrap:wrap;align-items:center;">' +
    '<input type="text" id="trashSearch" placeholder="🔍 Cari ID / nama / teks..." value="'+escT(window.__trash.search||'')+'" ' +
      'oninput="window.__trash.search=this.value; window.Trash.render();" style="flex:1;min-width:200px;margin:0;">' +
    '<button type="button" class="btn btn-secondary btn-sm" onclick="window.Trash.bulkPurgePrompt(\''+tab.col+'\')" title="Purge semua item > N hari">' +
      '<span class="material-icons" style="font-size:14px;">delete_forever</span>Purge Lama</button>' +
    '<button type="button" class="btn btn-secondary btn-sm" onclick="window.Trash.load()">' +
      '<span class="material-icons" style="font-size:14px;">refresh</span>Refresh</button>' +
  '</div>';

  // Info tab
  html += '<div style="font-size:.8125rem;color:#64748b;margin-bottom:.75rem;">' +
    'Menampilkan <b>'+filtered.length+'</b> dari <b>'+items.length+'</b> item di Sampah ('+escT(tab.label)+')' +
  '</div>';

  // List
  if (filtered.length === 0) {
    html += '<div class="empty-state"><span class="material-icons">delete_outline</span>' +
      '<p>'+(items.length===0 ? 'Sampah '+escT(tab.label)+' kosong' : 'Tidak ada hasil pencarian')+'</p></div>';
  } else {
    html += '<div class="table-wrapper"><table class="table"><thead><tr>' +
      '<th>Item</th><th>Dihapus</th><th>Oleh</th><th>Umur</th><th style="text-align:right;">Aksi</th>' +
    '</tr></thead><tbody>';
    filtered.forEach(function(it){
      var label = itemLabel(tab.col, it);
      var deletedAt = fmtTs(it.deletedAt);
      var days = daysBetween(it.deletedAt && it.deletedAt.toDate ? it.deletedAt.toDate().getTime() : it.deletedAt);
      var ageStr = (days !== null) ? days + ' hari' : '-';
      var by = it.deletedBy || '-';
      html += '<tr>' +
        '<td style="max-width:400px;"><div style="font-weight:600;font-size:.8125rem;">'+escT(label)+'</div>' +
          '<div style="font-size:.7rem;color:#64748b;font-family:monospace;">'+escT(it.id)+'</div></td>' +
        '<td style="font-size:.75rem;font-family:monospace;">'+deletedAt+'</td>' +
        '<td style="font-size:.75rem;">'+escT(by)+'</td>' +
        '<td style="font-size:.75rem;">'+ageStr+'</td>' +
        '<td style="text-align:right;white-space:nowrap;">' +
          '<button type="button" class="btn btn-success btn-sm" onclick="window.Trash.restore(\''+tab.col+'\',\''+escT(it.id)+'\')" title="Pulihkan">' +
            '<span class="material-icons" style="font-size:14px;">restore</span></button> ' +
          '<button type="button" class="btn btn-error btn-sm" onclick="window.Trash.purge(\''+tab.col+'\',\''+escT(it.id)+'\',\''+escT(label).replace(/'/g,"\\'")+'\')" title="Hapus permanen">' +
            '<span class="material-icons" style="font-size:14px;">delete_forever</span></button>' +
        '</td>' +
      '</tr>';
    });
    html += '</tbody></table></div>';
  }

  container.innerHTML = html;
}

function itemLabel(col, it){
  if (col === 'questions') return (it.text || '').slice(0, 80) || '(tanpa teks)';
  if (col === 'questionBank') return (it.text || '').slice(0, 80) || '(tanpa teks)';
  if (col === 'sessions') return it.name || it.code || '(tanpa nama)';
  if (col === 'attempts') return 'Attempt #' + (it.id || '-') + (it.studentId ? ' - siswa ' + it.studentId : '');
  if (col === 'students') return it.name || '(tanpa nama)';
  if (col === 'feedback') return (it.message || it.subject || '(pesan kosong)').slice(0, 80);
  return it.name || it.text || it.id;
}

function setTab(id){
  window.__trash.activeTab = id;
  window.__trash.search = '';
  render();
}
window.Trash = window.Trash || {};
window.Trash.setTab = setTab;
window.Trash.render = render;

// ============================================
// BULK PURGE (semua item > N hari)
// ============================================
function bulkPurgePrompt(col){
  var items = window.__trash.data[col] || [];
  if (!items.length) {
    if (window.toast) toast('Tidak ada item di tab ini','info');
    return;
  }
  var input = prompt('Purge permanen semua item yang sudah di Sampah LEBIH dari N hari.\n\n' +
                     'Tab: ' + (TRASH_TABS.find(function(t){return t.col===col;})).label + '\n' +
                     'Total item: ' + items.length + '\n\n' +
                     'Ketik jumlah hari (contoh: 30):', '30');
  if (!input) return;
  var n = parseInt(input);
  if (!n || n < 1) {
    if (window.alert2) alert2('Error','Masukkan angka >= 1','error');
    return;
  }
  var now = Date.now();
  var targets = items.filter(function(it){
    var days = daysBetween(it.deletedAt && it.deletedAt.toDate ? it.deletedAt.toDate().getTime() : it.deletedAt, now);
    return days !== null && days > n;
  });
  if (!targets.length) {
    if (window.alert2) alert2('Info','Tidak ada item yang lebih dari '+n+' hari di Sampah','info');
    return;
  }
  var confirmFn = window.confirm2 || function(title, msg, cb){ if(confirm(msg)) cb(); };
  confirmFn('Konfirmasi Purge',
    'Purge PERMANEN ' + targets.length + ' item yang sudah > '+n+' hari di Sampah?',
    function(){
      var check = prompt('Ketik DELETE untuk lanjut:');
      if (check !== 'DELETE') { if (window.toast) toast('Dibatalkan','info'); return; }
      (async function(){
        var ld = window.loading ? window.loading('Purge '+targets.length+' item...') : null;
        var ok = 0, fail = 0;
        for (var i=0; i<targets.length; i++){
          try {
            await db.collection(col).doc(targets[i].id).delete();
            ok++;
          } catch(e){ fail++; }
        }
        if (ld) ld.close();
        if (window.alert2) alert2('Selesai', ok + ' item dipurge, ' + fail + ' gagal.', fail ? 'warning' : 'success');
        await loadTabData(col);
        render();
        updateCounts();
      })();
    });
}
window.Trash.bulkPurgePrompt = bulkPurgePrompt;

// ============================================
// SCANNER SAMPAH (identik v1.0)
// ============================================
async function scanTrash(){
  var ld = window.loading ? window.loading('Memindai data nyampah...') : null;
  var findings = [];
  try {
    // 1. Soal yatim: sessionId menunjuk sesi yang tidak ada
    var qSnap = await db.collection('questions').get();
    var sSnap = await db.collection('sessions').get();
    var sessIds = {};
    sSnap.forEach(function(d){ sessIds[d.id] = true; });
    qSnap.forEach(function(d){
      var data = d.data();
      if (data.deleted) return;
      if (data.sessionId && !sessIds[data.sessionId]) {
        findings.push({
          type: 'Soal Yatim', col: 'questions', id: d.id,
          desc: 'Soal ini merujuk ke sesi yang sudah tidak ada.',
          text: (data.text || '').slice(0, 60), severity: 'warning'
        });
      }
    });

    // 2. Attempt menggantung: in_progress > 7 hari
    var aSnap = await db.collection('attempts').where('status','==','in_progress').get();
    var now = Date.now();
    aSnap.forEach(function(d){
      var data = d.data();
      if (data.deleted) return;
      var ts = data.startedAt;
      var t = 0;
      try { t = ts && ts.toDate ? ts.toDate().getTime() : (ts ? new Date(ts).getTime() : 0); } catch(e){}
      var days = (t && !isNaN(t)) ? Math.floor((now - t) / 86400000) : null;
      if (days !== null && days > 7) {
        findings.push({
          type: 'Attempt Menggantung', col: 'attempts', id: d.id,
          desc: 'Status in_progress selama '+days+' hari.',
          text: 'Sesi: '+(data.sessionId||'-')+' | Siswa: '+(data.studentId||'-'), severity: 'warning'
        });
      }
    });

    // 3. Sesi expired tanpa attempt
    var aCount = {};
    var aAll = await db.collection('attempts').where('status','==','completed').get();
    aAll.forEach(function(d){
      var sid = d.data().sessionId;
      aCount[sid] = (aCount[sid]||0) + 1;
    });
    sSnap.forEach(function(d){
      var data = d.data();
      if (data.deleted) return;
      var end = 0;
      try { end = data.endTime && data.endTime.toDate ? data.endTime.toDate().getTime() : (data.endTime ? new Date(data.endTime).getTime() : 0); } catch(e){}
      if (end && end < now && data.status === true && !aCount[d.id]) {
        findings.push({
          type: 'Sesi Expired Kosong', col: 'sessions', id: d.id,
          desc: 'Sesi sudah berakhir tapi tidak ada siswa yang menyelesaikan.',
          text: data.name || d.id, severity: 'info'
        });
      }
    });

    // 4. Feedback resolved > 30 hari
    var fSnap = await db.collection('feedback').get();
    fSnap.forEach(function(d){
      var data = d.data();
      if (data.deleted) return;
      if (data.status === 'resolved' && data.resolvedAt) {
        var t = 0;
        try { t = data.resolvedAt.toDate ? data.resolvedAt.toDate().getTime() : new Date(data.resolvedAt).getTime(); } catch(e){}
        var days = t ? Math.floor((now - t) / 86400000) : null;
        if (days !== null && days > 30) {
          findings.push({
            type: 'Feedback Lama', col: 'feedback', id: d.id,
            desc: 'Feedback sudah resolved '+days+' hari lalu.',
            text: (data.subject || data.message || '').slice(0, 60), severity: 'info'
          });
        }
      }
    });

    // 5. Siswa nonaktif tanpa attempt
    var stSnap = await db.collection('students').get();
    var aBySt = {};
    aAll.forEach(function(d){
      var sid = d.data().studentId;
      if (sid) aBySt[sid] = (aBySt[sid]||0) + 1;
    });
    stSnap.forEach(function(d){
      var data = d.data();
      if (data.deleted) return;
      if (data.status === false && !aBySt[d.id]) {
        findings.push({
          type: 'Siswa Nonaktif Pasif', col: 'students', id: d.id,
          desc: 'Siswa nonaktif dan belum pernah mengerjakan.',
          text: data.name || d.id, severity: 'info'
        });
      }
    });

  } catch(e){
    if (ld) ld.close();
    if (window.alert2) alert2('Error','Scan gagal: '+e.message,'error');
    return;
  }
  if (ld) ld.close();
  renderScannerResult(findings);
}

function renderScannerResult(findings){
  var container = document.getElementById('scannerResult');
  if (!container) return;
  if (!findings.length) {
    container.innerHTML = '<div style="padding:1rem;background:#ecfdf5;border-radius:8px;color:#065f46;border-left:3px solid #10b981;">' +
      '<b>✓ Bersih!</b> Tidak ada data nyampah terdeteksi.</div>';
    return;
  }

  var html = '<div style="font-size:.8125rem;margin-bottom:.5rem;color:#475569;">' +
    'Ditemukan <b>'+findings.length+'</b> data nyampah.</div>';
  html += '<div style="display:flex;flex-direction:column;gap:.5rem;">';
  findings.forEach(function(f){
    var col = escT(f.col); var id = escT(f.id); var txt = escT(f.text || '');
    var colorMap = { warning:'#fef3c7', info:'#eff6ff' };
    var color = colorMap[f.severity] || '#f8fafc';
    html += '<div style="padding:.75rem;background:'+color+';border-radius:8px;border:1px solid #e2e8f0;">' +
      '<div style="display:flex;justify-content:space-between;align-items:start;gap:.5rem;flex-wrap:wrap;">' +
        '<div style="flex:1;min-width:200px;">' +
          '<div style="font-weight:700;font-size:.8125rem;color:#1e293b;">'+escT(f.type)+'</div>' +
          '<div style="font-size:.75rem;color:#64748b;margin-top:.125rem;">'+escT(f.desc)+'</div>' +
          (txt ? '<div style="font-size:.75rem;color:#475569;margin-top:.25rem;font-style:italic;">'+txt+'</div>' : '') +
        '</div>' +
        '<button type="button" class="btn btn-warning btn-sm" onclick="window.Trash.moveToTrash(\''+col+'\',\''+id+'\')" ' +
          'style="flex:0 0 auto;"><span class="material-icons" style="font-size:14px;">delete_sweep</span>Pindahkan</button>' +
      '</div>' +
    '</div>';
  });
  html += '</div>';
  html += '<div style="margin-top:.75rem;"><button type="button" class="btn btn-warning btn-sm" onclick="window.Trash.moveAllFindings()">' +
    '<span class="material-icons" style="font-size:14px;">delete_sweep</span>Pindahkan Semua ('+findings.length+')</button></div>';

  container.innerHTML = html;
  window.__trash.__lastFindings = findings;
}

async function moveToTrash(col, id){
  var ok = await softDelete(col, id);
  if (ok) {
    if (window.toast) toast('Dipindahkan ke Sampah','success');
    if (window.__trash.__lastFindings) {
      window.__trash.__lastFindings = window.__trash.__lastFindings.filter(function(f){
        return !(f.col === col && f.id === id);
      });
      renderScannerResult(window.__trash.__lastFindings);
    }
  }
}

async function moveAllFindings(){
  var findings = window.__trash.__lastFindings || [];
  if (!findings.length) return;
  if (!confirm('Pindahkan '+findings.length+' item ke Sampah?')) return;
  var ld = window.loading ? window.loading('Memindahkan...') : null;
  var ok = 0, fail = 0;
  for (var i=0; i<findings.length; i++){
    var r = await softDelete(findings[i].col, findings[i].id);
    if (r) ok++; else fail++;
  }
  if (ld) ld.close();
  if (window.alert2) alert2('Selesai', ok+' dipindahkan, '+fail+' gagal', fail?'warning':'success');
  window.__trash.__lastFindings = [];
  renderScannerResult([]);
  await loadAllTabs();
  render();
  updateCounts();
}

window.Trash.scan = scanTrash;
window.Trash.moveToTrash = moveToTrash;
window.Trash.moveAllFindings = moveAllFindings;

// ============================================
// INISIALISASI TRASH (identik v1.0)
// ============================================
async function initTrash(){
  if (!confirm(
      'Inisialisasi Trash akan menambahkan field `deleted:false` ke semua dokumen lama di 6 collection.\n\n' +
      'WAJIB dijalankan SEKALI agar query `where(deleted, ==, false)` bekerja untuk doc lama.\n\n' +
      'Proses aman, bisa dilanjutkan bila terputus. Lanjutkan?')) return;

  var ld = window.loading ? window.loading('Inisialisasi...') : null;
  var stats = {};
  try {
    for (var i=0; i<TRASH_TABS.length; i++){
      var tab = TRASH_TABS[i];
      var snap = await db.collection(tab.col).get();
      var batch = db.batch();
      var n = 0;
      snap.forEach(function(d){
        var data = d.data();
        if (typeof data.deleted === 'undefined') {
          batch.update(d.ref, { deleted: false });
          n++;
        }
      });
      if (n > 0) await batch.commit();
      stats[tab.col] = n;
    }
    if (ld) ld.close();
    var msg = Object.keys(stats).map(function(k){ return k + ': ' + stats[k]; }).join('\n');
    if (window.alert2) alert2('Inisialisasi Selesai', 'Dokumen yang di-update:\n\n' + msg, 'success');
    await loadAllTabs();
    render();
    updateCounts();
  } catch(e){
    if (ld) ld.close();
    if (window.alert2) alert2('Error','Gagal: '+e.message,'error');
  }
}
window.Trash.init = initTrash;

// ============================================
// OPEN TRASH (identik v1.0)
// ============================================
function ensureTrashPage(){
  var page = document.getElementById('page-trash');
  if (page) return page;

  var main = document.querySelector('.main-content');
  if (!main) return null;

  var div = document.createElement('div');
  div.id = 'page-trash';
  div.className = 'page-content';
  div.innerHTML =
    '<div class="page-header">' +
      '<h1 class="page-title"><span class="material-icons">delete_outline</span>Sampah / Recycle Bin</h1>' +
      '<div style="display:flex;gap:.5rem;flex-wrap:wrap;">' +
        '<button type="button" class="btn btn-secondary" onclick="window.Trash.scan()"><span class="material-icons">radar</span>Scanner</button>' +
        '<button type="button" class="btn btn-secondary" onclick="window.Trash.init()"><span class="material-icons">build</span>Inisialisasi</button>' +
        '<button type="button" class="btn btn-secondary" onclick="window.Trash.load()"><span class="material-icons">refresh</span>Refresh</button>' +
      '</div>' +
    '</div>' +
    '<div class="card" style="margin-bottom:1rem;">' +
      '<div class="card-body">' +
        '<div style="font-size:.8125rem;color:#475569;margin-bottom:.75rem;line-height:1.5;">' +
          '<b>Prinsip:</b> Aksi hapus di semua menu kini <b>soft delete</b> (item masuk ke sini, tidak hilang permanen). ' +
          'Anda bisa <b>Pulihkan</b> kapan saja, atau <b>Purge Permanen</b> jika yakin tidak butuh lagi (butuh konfirmasi "DELETE"). ' +
          'Gunakan <b>Scanner</b> untuk menemukan data nyampah yang belum ditandai.' +
        '</div>' +
        '<div id="trash-counts" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:.5rem;"></div>' +
      '</div>' +
    '</div>' +
    '<div class="card">' +
      '<div class="card-body">' +
        '<div id="trashContent"></div>' +
        '<div id="scannerResult" style="margin-top:1rem;"></div>' +
      '</div>' +
    '</div>';
  main.appendChild(div);
  return div;
}

async function openTrash(){
  ensureTrashPage();
  if (window.S && typeof S.setPage === 'function') {
    S.setPage('trash');
  } else {
    var pages = document.querySelectorAll('.page-content');
    for (var i=0; i<pages.length; i++) pages[i].classList.remove('active');
    var target = document.getElementById('page-trash');
    if (target) target.classList.add('active');
  }
  if (!window.__trash.initialized) {
    await loadAllTabs();
    window.__trash.initialized = true;
  }
  render();
  updateCounts();
}
window.openTrash = openTrash;
window.Trash.open = openTrash;

async function load(){
  await loadAllTabs();
  render();
  updateCounts();
}
window.loadTrash = load;
window.Trash.load = load;

window.Trash.restore = function(col, id){
  if (confirm('Pulihkan item ini?')) restoreItem(col, id);
};
window.Trash.purge = purgeItem;

// ============================================
// AUTO-INIT COUNTS saat page load (badge sidebar terisi)
// ============================================
(function(){
  function init(){
    if (typeof db === 'undefined') { setTimeout(init, 300); return; }
    loadAllTabs().then(function(){ updateCounts(); }).catch(function(){});
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function(){ setTimeout(init, 500); });
  } else {
    setTimeout(init, 500);
  }
})();

console.log('✅ trash.js v1.1 loaded (with sidebar badge auto-update)');