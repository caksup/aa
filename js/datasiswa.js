/* #50 | /root/js/datasiswa.js | v 1.2 | u 10/09/2026 • 22:20:00 | xu : ke-3 | note : #noteresponse
- FIX BUG "S.setPage is not a function" & halaman Data Siswa kosong:
  Penyebab: ap.html memanggil onclick="S.setPage('data-siswa')" tetapi fungsi S.setPage
  TIDAK PERNAH didefinisikan di codebase admin -> TypeError, mount tidak jalan, tabel kosong.
  Solusi (3 lapis, robust terhadap mekanisme switching apa pun):
   1) ensureSetPage(): definisikan S.setPage generik BILA belum ada (switch .page-content,
      update .nav-item.active, tutup sidebar mobile, lalu mount data-siswa).
   2) MutationObserver: pantau class #page-data-siswa; begitu mendapat .active -> tryMount().
      Ini bekerja walau page di-switch oleh mekanisme lain (header.js / S.setPage / dll).
   3) bindNavClick(): listener cadangan pada nav-item data-siswa -> tryMount() setelah 50ms.
- TETAP (tidak dipotong dari v1.1): state, filter batch/status/search, stats bar,
  tabel 13 kolom sticky, color-coding, modal detail 5 section, export Excel (2 sheet),
  export PDF (landscape, color-coded), WA normalization, sync field profile.js siswa. */

(function(){
  'use strict';

  // ===== State =====
  var state = {
    students: [],
    filterBatch: 'all',
    filterStatus: 'all',
    search: '',
    mounted: false
  };

  // ===== Helpers =====
  function $(id){ return document.getElementById(id); }
  function esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function p2(n){ return String(n).padStart(2,'0'); }

  function formatDate(ts){
    if(!ts) return '-';
    var d;
    try{ d = ts.toDate ? ts.toDate() : new Date(ts); }catch(e){ return '-'; }
    if(isNaN(d.getTime())) return '-';
    return d.getDate()+'/'+p2(d.getMonth()+1)+'/'+d.getFullYear()+' '+p2(d.getHours())+':'+p2(d.getMinutes());
  }

  function truncate(s, n){
    s = String(s||'');
    return s.length > n ? s.substring(0,n-1)+'…' : s;
  }

  function normWA(v){
    if(!v) return '';
    var d = String(v).replace(/\D/g,'');
    if (d.indexOf('0') === 0) d = '62' + d.slice(1);
    return d;
  }
  function parentWA(s){
    return s.parentContact || s.parentWA || '';
  }

  // ===== Style injection =====
  function injectStyle(){
    if(document.getElementById('datasiswa-style')) return;
    var st = document.createElement('style');
    st.id = 'datasiswa-style';
    st.textContent = [
      '.ds-toolbar{display:flex;gap:.75rem;margin-bottom:1rem;flex-wrap:wrap;align-items:center;}',
      '.ds-toolbar .form-control,.ds-toolbar select{flex:1;min-width:150px;max-width:250px;margin:0;}',
      '.ds-toolbar .btn{white-space:nowrap;}',
      '.ds-stats{display:flex;gap:.5rem;font-size:.8125rem;color:#64748b;margin-bottom:1rem;flex-wrap:wrap;}',
      '.ds-stats span{display:inline-flex;align-items:center;gap:.25rem;padding:.25rem .625rem;background:#f1f5f9;border-radius:50px;font-weight:600;}',
      '.ds-stats .material-icons{font-size:14px;}',
      '.ds-table-wrap{overflow:auto;border:1px solid #e2e8f0;border-radius:12px;background:#fff;max-height:calc(100vh - 280px);-webkit-overflow-scrolling:touch;}',
      '.ds-table{width:100%;border-collapse:collapse;font-size:.8125rem;min-width:1400px;}',
      '.ds-table thead{background:#f8fafc;position:sticky;top:0;z-index:3;}',
      '.ds-table th{padding:.75rem;text-align:left;font-weight:600;color:#475569;font-size:.7rem;text-transform:uppercase;letter-spacing:.3px;border-bottom:2px solid #e2e8f0;white-space:nowrap;}',
      '.ds-table td{padding:.75rem;border-bottom:1px solid #f1f5f9;vertical-align:middle;}',
      '.ds-table tbody tr:hover{background:#f8fafc;}',
      '.ds-table tbody tr:last-child td{border-bottom:none;}',
      '.ds-table th:first-child,.ds-table td:first-child{position:sticky;left:0;background:#fff;z-index:2;box-shadow:2px 0 4px rgba(0,0,0,.04);min-width:200px;}',
      '.ds-table thead th:first-child{background:#f8fafc;z-index:4;}',
      '.ds-table tbody tr:hover td:first-child{background:#f8fafc;}',
      '.ds-table th:last-child,.ds-table td:last-child{position:sticky;right:0;background:#fff;z-index:2;box-shadow:-2px 0 4px rgba(0,0,0,.04);}',
      '.ds-table thead th:last-child{background:#f8fafc;z-index:4;}',
      '.ds-table tbody tr:hover td:last-child{background:#f8fafc;}',
      '.ds-student-cell{display:flex;align-items:center;gap:.625rem;}',
      '.ds-avatar{width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,#10b981,#047857);color:#fff;display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0;}',
      '.ds-name{font-weight:600;color:#1e293b;}',
      '.ds-nick{font-size:.75rem;color:#64748b;font-style:italic;}',
      '.ds-id{font-family:monospace;color:#64748b;font-size:.75rem;}',
      '.ds-text-sm{font-size:.75rem;color:#475569;}',
      '.ds-text-xs{font-size:.7rem;color:#64748b;}',
      '.ds-muted{color:#cbd5e1;font-style:italic;font-size:.75rem;}',
      '.ds-badge{display:inline-flex;align-items:center;gap:.25rem;padding:.2rem .5rem;border-radius:50px;font-size:.7rem;font-weight:600;white-space:nowrap;}',
      '.ds-badge.aktif{background:#d1fae5;color:#065f46;}',
      '.ds-badge.nonaktif{background:#fee2e2;color:#991b1b;}',
      '.ds-badge.batch{background:#dbeafe;color:#1e40af;}',
      '.ds-score{font-weight:700;font-family:monospace;font-size:.875rem;}',
      '.ds-score.hi{color:#10b981;}',
      '.ds-score.md{color:#f59e0b;}',
      '.ds-score.lo{color:#ef4444;}',
      '.ds-empty{text-align:center;padding:3rem 1rem;color:#94a3b8;}',
      '.ds-empty .material-icons{font-size:48px;color:#cbd5e1;display:block;margin:0 auto .75rem;}',
      '.ds-loading{text-align:center;padding:2rem;color:#64748b;}',
      '.ds-col-head{white-space:nowrap;}',
      '@keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}',
      '.ds-spin{animation:spin 1s linear infinite;display:inline-block;}'
    ].join('\n');
    document.head.appendChild(st);
  }

  // ===== Fetch data =====
  async function loadStudents(){
    try {
      var snap = await db.collection('students').get();
      state.students = [];
      snap.forEach(function(d){
        state.students.push(Object.assign({id:d.id}, d.data()));
      });
      state.students.sort(function(a,b){
        var ba = (a.batch||'').toLowerCase(), bb = (b.batch||'').toLowerCase();
        if (ba !== bb) return ba < bb ? -1 : 1;
        return (a.name||'') < (b.name||'') ? -1 : 1;
      });
      console.log('[DataSiswa] loaded:', state.students.length);
    } catch(e){
      console.error('[DataSiswa] load error:', e);
      alert2('Error','Gagal memuat data siswa: '+e.message,'error');
    }
  }

  // ===== Filter =====
  function getFiltered(){
    var q = state.search.toLowerCase().trim();
    return state.students.filter(function(s){
      if (state.filterBatch !== 'all' && (s.batch||'') !== state.filterBatch) return false;
      if (state.filterStatus === 'aktif' && s.status === false) return false;
      if (state.filterStatus === 'nonaktif' && s.status !== false) return false;
      if (q) {
        var hay = [
          s.id, s.name, s.nickname, s.school, s.className, s.studentContact,
          s.parentName, parentWA(s), s.batch, s.address, s.motivationNote
        ].join(' ').toLowerCase();
        if (hay.indexOf(q) === -1) return false;
      }
      return true;
    });
  }

  function getBatches(){
    var set = {};
    state.students.forEach(function(s){ if(s.batch) set[s.batch]=1; });
    return Object.keys(set).sort();
  }

  // ===== Render =====
  function render(){
    var wrap = $('dataSiswaContent');
    if (!wrap) return;

    if (!state.mounted) {
      wrap.innerHTML =
        '<div class="ds-toolbar">' +
          '<select class="form-control" id="dsFilterBatch" onchange="onDsFilterBatch(this.value)">' +
            '<option value="all">Semua Batch</option>' +
          '</select>' +
          '<select class="form-control" id="dsFilterStatus" onchange="onDsFilterStatus(this.value)">' +
            '<option value="all">Semua Status</option>' +
            '<option value="aktif">Aktif</option>' +
            '<option value="nonaktif">Nonaktif</option>' +
          '</select>' +
          '<input type="text" class="form-control" id="dsSearch" placeholder="Cari nama / ID / sekolah / WA..." oninput="onDsSearch(this.value)">' +
          '<button type="button" class="btn btn-success" onclick="exportDsExcel()" title="Export Excel"><span class="material-icons">table_chart</span>Excel</button>' +
          '<button type="button" class="btn btn-error" onclick="exportDsPdf()" title="Export PDF"><span class="material-icons">picture_as_pdf</span>PDF</button>' +
          '<button type="button" class="btn btn-secondary" onclick="refreshDataSiswa()" title="Refresh"><span class="material-icons">refresh</span></button>' +
        '</div>' +
        '<div class="ds-stats" id="dsStats"></div>' +
        '<div class="ds-table-wrap" id="dsTableWrap">' +
          '<div id="dsTableInner"></div>' +
        '</div>';
      state.mounted = true;
    }

    var batchSel = $('dsFilterBatch');
    if (batchSel) {
      var batches = getBatches();
      batchSel.innerHTML = '<option value="all">Semua Batch ('+state.students.length+')</option>' +
        batches.map(function(b){
          var cnt = state.students.filter(function(s){ return s.batch===b; }).length;
          return '<option value="'+esc(b)+'">'+esc(b)+' ('+cnt+')</option>';
        }).join('');
      batchSel.value = state.filterBatch;
    }
    var statusSel = $('dsFilterStatus');
    if (statusSel) statusSel.value = state.filterStatus;
    var searchInp = $('dsSearch');
    if (searchInp) searchInp.value = state.search;

    var filtered = getFiltered();
    var stats = $('dsStats');
    if (stats) {
      var active = filtered.filter(function(s){ return s.status!==false; }).length;
      var inactive = filtered.length - active;
      var withAttempt = filtered.filter(function(s){ return (s.totalAttempts||0) > 0; }).length;
      var withMotivasi = filtered.filter(function(s){ return !!(s.motivationNote||'').trim(); }).length;
      stats.innerHTML =
        '<span><span class="material-icons">people</span>Total: <b>'+filtered.length+'</b></span>' +
        '<span style="background:#d1fae5;color:#065f46;"><span class="material-icons">check_circle</span>Aktif: <b>'+active+'</b></span>' +
        '<span style="background:#fee2e2;color:#991b1b;"><span class="material-icons">cancel</span>Nonaktif: <b>'+inactive+'</b></span>' +
        '<span style="background:#dbeafe;color:#1e40af;"><span class="material-icons">quiz</span>Sudah Mengerjakan: <b>'+withAttempt+'</b></span>' +
        '<span style="background:#fef3c7;color:#92400e;"><span class="material-icons">favorite</span>Isi Motivasi: <b>'+withMotivasi+'</b></span>';
    }

    var inner = $('dsTableInner');
    if (!inner) return;

    if (filtered.length === 0) {
      inner.innerHTML =
        '<div class="ds-empty">' +
          '<span class="material-icons">search_off</span>' +
          '<p><b>Tidak ada data</b></p>' +
          '<p style="font-size:.8125rem;">Coba ubah filter atau kata kunci pencarian.</p>' +
        '</div>';
      return;
    }

    var rows = filtered.map(function(s, idx){
      var photo = s.photoEmoji || '🎓';
      var statusClass = s.status !== false ? 'aktif' : 'nonaktif';
      var statusLabel = s.status !== false ? 'Aktif' : 'Nonaktif';
      var lastScore = s.lastScore || 0;
      var scoreClass = lastScore >= 80 ? 'hi' : (lastScore >= 50 ? 'md' : 'lo');
      var hasAttempt = (s.totalAttempts||0) > 0;
      var motivasi = (s.motivationNote||'').trim();

      return '<tr>' +
        '<td>' +
          '<div class="ds-student-cell">' +
            '<div style="color:#94a3b8;font-weight:600;min-width:24px;text-align:center;">'+(idx+1)+'</div>' +
            '<div class="ds-avatar">'+esc(photo)+'</div>' +
            '<div style="min-width:0;">' +
              '<div class="ds-name">'+esc(s.name||'-')+(s.nickname?' <span class="ds-nick">"'+esc(s.nickname)+'"</span>':'')+'</div>' +
              '<div class="ds-id">'+esc(s.id)+'</div>' +
            '</div>' +
          '</div>' +
        '</td>' +
        '<td><span class="ds-badge batch">'+esc(s.batch||'-')+'</span></td>' +
        '<td class="ds-text-sm">'+esc(s.year||'-')+'</td>' +
        '<td><span class="ds-badge '+statusClass+'">'+statusLabel+'</span></td>' +
        '<td class="ds-text-sm">'+(s.school ? esc(s.school) : '<span class="ds-muted">-</span>')+'</td>' +
        '<td class="ds-text-sm">'+(s.className ? esc(s.className) : '<span class="ds-muted">-</span>')+'</td>' +
        '<td class="ds-text-sm" style="font-family:monospace;">'+(s.studentContact ? esc(normWA(s.studentContact)) : '<span class="ds-muted">-</span>')+'</td>' +
        '<td class="ds-text-sm">'+(s.parentName ? esc(s.parentName) : '<span class="ds-muted">-</span>')+'</td>' +
        '<td class="ds-text-sm" style="font-family:monospace;">'+(parentWA(s) ? esc(normWA(parentWA(s))) : '<span class="ds-muted">-</span>')+'</td>' +
        '<td style="text-align:center;font-weight:600;">'+(s.totalAttempts||0)+'</td>' +
        '<td>' + (hasAttempt ? '<span class="ds-score '+scoreClass+'">'+lastScore+'</span>' : '<span class="ds-muted">-</span>') + '</td>' +
        '<td class="ds-text-sm" style="max-width:180px;" title="'+esc(motivasi)+'">'+(motivasi ? esc(truncate(motivasi, 50)) : '<span class="ds-muted">-</span>')+'</td>' +
        '<td style="text-align:center;">' +
          '<button type="button" class="btn btn-secondary btn-sm" onclick="viewDsDetail(\''+esc(s.id)+'\')" title="Detail Lengkap"><span class="material-icons">visibility</span></button>' +
        '</td>' +
      '</tr>';
    }).join('');

    inner.innerHTML =
      '<table class="ds-table">' +
        '<thead><tr>' +
          '<th class="ds-col-head">Siswa</th>' +
          '<th class="ds-col-head">Batch</th>' +
          '<th class="ds-col-head">Tahun</th>' +
          '<th class="ds-col-head">Status</th>' +
          '<th class="ds-col-head">Sekolah</th>' +
          '<th class="ds-col-head">Kelas</th>' +
          '<th class="ds-col-head">Kontak Siswa</th>' +
          '<th class="ds-col-head">Nama Ortu</th>' +
          '<th class="ds-col-head">WA Ortu</th>' +
          '<th class="ds-col-head" style="text-align:center;">Attempt</th>' +
          '<th class="ds-col-head">Score</th>' +
          '<th class="ds-col-head">Motivasi</th>' +
          '<th class="ds-col-head" style="text-align:center;">Aksi</th>' +
        '</tr></thead>' +
        '<tbody>'+rows+'</tbody>' +
      '</table>';
  }

  // ===== Event handlers =====
  window.onDsFilterBatch = function(v){ state.filterBatch = v; render(); };
  window.onDsFilterStatus = function(v){ state.filterStatus = v; render(); };
  window.onDsSearch = function(v){ state.search = v; render(); };

  window.refreshDataSiswa = async function(){
    var wrap = $('dsTableInner');
    if (wrap) wrap.innerHTML = '<div class="ds-loading"><span class="material-icons ds-spin">autorenew</span> Memuat ulang data...</div>';
    injectStyle();
    await loadStudents();
    render();
    toast('Data siswa diperbarui','success');
  };

  // ===== Detail modal =====
  window.viewDsDetail = function(id){
    var s = state.students.find(function(x){ return x.id === id; });
    if (!s) return;

    var html =
      '<div style="max-height:60vh;overflow-y:auto;padding-right:.5rem;">' +
        '<div style="text-align:center;margin-bottom:1rem;">' +
          '<div style="width:72px;height:72px;border-radius:50%;background:linear-gradient(135deg,#10b981,#047857);display:inline-flex;align-items:center;justify-content:center;font-size:36px;margin-bottom:.5rem;">'+esc(s.photoEmoji||'🎓')+'</div>' +
          '<h3 style="margin:0;">'+esc(s.name||'-')+(s.nickname?' <span style="color:#64748b;font-weight:400;">"'+esc(s.nickname)+'"</span>':'')+'</h3>' +
          '<div style="color:#64748b;font-family:monospace;">'+esc(s.id)+'</div>' +
        '</div>' +
        '<div style="display:grid;gap:.5rem;">' +
          sectionTitle('Data Pribadi') +
          infoRow('badge', 'ID Siswa', s.id) +
          infoRow('person', 'Nama Lengkap', s.name||'-') +
          infoRow('face', 'Nama Panggilan', s.nickname||'-') +
          infoRow('groups', 'Batch', s.batch||'-') +
          infoRow('calendar_today', 'Tahun', s.year||'-') +
          infoRow('pin', 'No. Urut', s.sequence||'-') +
          infoRow('toggle_on', 'Status Akun', s.status !== false ? 'Aktif' : 'Nonaktif') +
          infoRow('lock', 'PIN', s.pinHash ? 'Sudah di-set' : 'Belum di-set') +
          sectionTitle('Data Sekolah') +
          infoRow('school', 'Asal Sekolah', s.school||'-') +
          infoRow('class', 'Kelas', s.className||'-') +
          infoRow('home', 'Alamat', s.address||'-') +
          sectionTitle('Kontak') +
          infoRow('phone', 'Kontak Siswa', s.studentContact ? normWA(s.studentContact) : '-') +
          infoRow('family_restroom', 'Nama Orang Tua', s.parentName||'-') +
          infoRow('phone', 'WA Orang Tua', parentWA(s) ? normWA(parentWA(s)) : '-') +
          sectionTitle('Akademik') +
          infoRow('quiz', 'Total Attempt', (s.totalAttempts||0) + ' kali') +
          infoRow('emoji_events', 'Score Terakhir', (s.lastScore||0)) +
          infoRow('event_available', 'Sesi Terakhir', s.lastSessionName || s.lastSessionId || '-') +
          infoRow('schedule', 'Terakhir Update', formatDate(s.updatedAt)) +
          sectionTitle('Motivasi') +
          '<div style="padding:.75rem;background:#f8fafc;border-left:3px solid #10b981;border-radius:6px;font-style:italic;color:#1e293b;line-height:1.6;">' +
            (s.motivationNote ? esc(s.motivationNote) : '<span style="color:#94a3b8;">Belum diisi</span>') +
          '</div>' +
        '</div>' +
      '</div>';

    M.custom({
      title: 'Detail Siswa',
      message: html,
      type: 'info',
      buttons: [
        { text:'Tutup', class:'btn-secondary' },
        { text:'Buka Manage Siswa', class:'btn-primary', action: function(){
          if (window.S && typeof S.setPage === 'function') S.setPage('manage-siswa');
        } }
      ]
    });
  };

  function sectionTitle(txt){
    return '<div style="font-size:.75rem;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#047857;padding:.5rem 0 .25rem;border-bottom:1px solid #e2e8f0;margin-top:.5rem;">'+esc(txt)+'</div>';
  }

  function infoRow(icon,label,val){
    return '<div style="display:flex;align-items:center;gap:.75rem;padding:.5rem;background:#f8fafc;border-radius:8px;">' +
      '<span class="material-icons" style="color:#10b981;font-size:20px;">'+icon+'</span>' +
      '<div style="flex:1;min-width:0;">' +
        '<div style="font-size:.7rem;color:#64748b;">'+esc(label)+'</div>' +
        '<div style="font-size:.875rem;font-weight:600;word-break:break-word;">'+esc(val)+'</div>' +
      '</div>' +
    '</div>';
  }

  // ===== Export Excel =====
  window.exportDsExcel = function(){
    if (typeof XLSX === 'undefined') {
      alert2('Library Belum Dimuat','Library SheetJS (xlsx) belum dimuat. Tambahkan CDN xlsx di ap.html.','error');
      return;
    }
    var data = getFiltered();
    if (!data.length) { alert2('Info','Tidak ada data untuk di-export','warning'); return; }

    var rows = data.map(function(s, idx){
      return {
        'No': idx+1,
        'ID Siswa': s.id,
        'Nama Lengkap': s.name || '',
        'Nama Panggilan': s.nickname || '',
        'Batch': s.batch || '',
        'Tahun': s.year || '',
        'No. Urut': s.sequence || '',
        'Status': s.status !== false ? 'Aktif' : 'Nonaktif',
        'Asal Sekolah': s.school || '',
        'Kelas': s.className || '',
        'Alamat': s.address || '',
        'Kontak Siswa': s.studentContact ? normWA(s.studentContact) : '',
        'Nama Orang Tua': s.parentName || '',
        'WA Orang Tua': parentWA(s) ? normWA(parentWA(s)) : '',
        'Total Attempt': s.totalAttempts || 0,
        'Score Terakhir': s.lastScore || 0,
        'Sesi Terakhir': s.lastSessionName || s.lastSessionId || '',
        'Motivasi': s.motivationNote || ''
      };
    });

    var ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [
      {wch:5},{wch:12},{wch:25},{wch:15},
      {wch:10},{wch:7},{wch:7},{wch:10},
      {wch:25},{wch:12},{wch:35},{wch:14},
      {wch:22},{wch:14},
      {wch:12},{wch:10},{wch:25},{wch:40}
    ];
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Data Siswa');

    var batches = getBatches();
    var summaryRows = batches.map(function(b){
      var members = state.students.filter(function(s){ return s.batch===b; });
      var aktif = members.filter(function(s){ return s.status!==false; }).length;
      var withAtt = members.filter(function(s){ return (s.totalAttempts||0)>0; }).length;
      var withMot = members.filter(function(s){ return !!(s.motivationNote||'').trim(); }).length;
      var totalScore = 0, cntScore = 0;
      members.forEach(function(s){ if (s.lastScore!=null && s.totalAttempts>0){ totalScore += s.lastScore; cntScore++; } });
      return {
        'Batch': b,
        'Total Siswa': members.length,
        'Aktif': aktif,
        'Nonaktif': members.length - aktif,
        'Sudah Mengerjakan': withAtt,
        'Isi Motivasi': withMot,
        'Rata-rata Score': cntScore ? Math.round(totalScore/cntScore) : 0
      };
    });
    var ws2 = XLSX.utils.json_to_sheet(summaryRows);
    ws2['!cols'] = [{wch:12},{wch:12},{wch:8},{wch:10},{wch:18},{wch:12},{wch:16}];
    XLSX.utils.book_append_sheet(wb, ws2, 'Ringkasan Batch');

    var now = new Date();
    var fname = 'Data-Siswa-'+now.getFullYear()+p2(now.getMonth()+1)+p2(now.getDate())+'.xlsx';
    XLSX.writeFile(wb, fname);
    toast('Export Excel berhasil: '+fname,'success');
  };

  // ===== Export PDF =====
  window.exportDsPdf = function(){
    if (typeof window.jspdf === 'undefined' || !window.jspdf.jsPDF) {
      alert2('Library Belum Dimuat','Library jsPDF belum dimuat. Tambahkan CDN jsPDF & autoTable di ap.html.','error');
      return;
    }
    var data = getFiltered();
    if (!data.length) { alert2('Info','Tidak ada data untuk di-export','warning'); return; }

    var doc = new window.jspdf.jsPDF('l','mm','a4');
    var now = new Date();
    var dateStr = now.getDate()+'/'+p2(now.getMonth()+1)+'/'+now.getFullYear()+' '+p2(now.getHours())+':'+p2(now.getMinutes());

    doc.setFillColor(16, 185, 129);
    doc.rect(0,0,doc.internal.pageSize.getWidth(),25,'F');
    doc.setTextColor(255,255,255);
    doc.setFontSize(16);
    doc.setFont('helvetica','bold');
    doc.text('Data Siswa - Jagat Education Center', 14, 15);
    doc.setFontSize(9);
    doc.setFont('helvetica','normal');
    doc.text('Dicetak: '+dateStr+' | Total: '+data.length+' siswa', 14, 21);

    doc.setTextColor(0,0,0);
    doc.setFontSize(9);
    var filterText = 'Filter: Batch='+(state.filterBatch==='all'?'Semua':state.filterBatch)+', Status='+(state.filterStatus==='all'?'Semua':state.filterStatus);
    if (state.search) filterText += ', Search="'+state.search+'"';
    doc.text(filterText, 14, 32);

    var body = data.map(function(s, idx){
      return [
        idx+1,
        s.id,
        s.name + (s.nickname ? ' ("'+s.nickname+'")' : ''),
        s.batch || '-',
        s.year || '-',
        s.status !== false ? 'Aktif' : 'Nonaktif',
        s.school || '-',
        s.className || '-',
        s.studentContact ? normWA(s.studentContact) : '-',
        s.parentName || '-',
        parentWA(s) ? normWA(parentWA(s)) : '-',
        s.totalAttempts || 0,
        s.lastScore || 0,
        truncate(s.motivationNote||'', 50) || '-'
      ];
    });

    doc.autoTable({
      startY: 36,
      head: [['No','ID','Nama (Nickname)','Batch','Thn','Status','Sekolah','Kelas','WA Siswa','Ortu','WA Ortu','Att','Score','Motivasi']],
      body: body,
      styles: { fontSize: 7.5, cellPadding: 1.5 },
      headStyles: { fillColor: [4, 120, 87], textColor: 255, fontStyle: 'bold', fontSize: 7.5 },
      alternateRowStyles: { fillColor: [236, 253, 245] },
      columnStyles: {
        0:{cellWidth:8},1:{cellWidth:18},2:{cellWidth:45},3:{cellWidth:18},
        4:{cellWidth:12},5:{cellWidth:16},6:{cellWidth:35},7:{cellWidth:18},
        8:{cellWidth:22},9:{cellWidth:25},10:{cellWidth:22},11:{cellWidth:12},
        12:{cellWidth:14},13:{cellWidth:'auto'}
      },
      didParseCell: function(d){
        if (d.section === 'body' && d.column.index === 5) {
          var val = d.cell.raw;
          if (val === 'Aktif') d.cell.styles.textColor = [6, 95, 70];
          else if (val === 'Nonaktif') d.cell.styles.textColor = [153, 27, 27];
        }
        if (d.section === 'body' && d.column.index === 12) {
          var score = parseInt(d.cell.raw, 10);
          if (score >= 80) d.cell.styles.textColor = [6, 95, 70];
          else if (score >= 50) d.cell.styles.textColor = [245, 158, 11];
          else if (score > 0) d.cell.styles.textColor = [220, 38, 38];
        }
      }
    });

    var pageCount = doc.internal.getNumberOfPages();
    for (var i=1; i<=pageCount; i++){
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(150,150,150);
      doc.text('Halaman '+i+' dari '+pageCount+' | JEC Exercise ACT - Data Siswa', 14, doc.internal.pageSize.getHeight()-10);
      doc.text('© '+now.getFullYear()+' Jagat Education Center', doc.internal.pageSize.getWidth()-70, doc.internal.pageSize.getHeight()-10);
    }

    var fname = 'Data-Siswa-'+now.getFullYear()+p2(now.getMonth()+1)+p2(now.getDate())+'.pdf';
    doc.save(fname);
    toast('Export PDF berhasil: '+fname,'success');
  };

  // ===== MOUNT: buat container bila belum ada =====
  function tryMount(){
    var page = $('page-data-siswa');
    if (!page) return;
    var content = $('dataSiswaContent');
    if (!content) {
      content = document.createElement('div');
      content.id = 'dataSiswaContent';
      page.appendChild(content);
    }
    injectStyle();
    if (state.students.length === 0) {
      content.innerHTML = '<div class="ds-loading"><span class="material-icons">hourglass_empty</span> Memuat data siswa...</div>';
      loadStudents().then(render);
    } else {
      render();
    }
  }

  // ===== FIX: definisikan S.setPage generik BILA belum ada =====
  // (ap.html memanggil onclick="S.setPage('data-siswa')" tetapi fungsi ini tidak pernah
  //  didefinisikan -> TypeError. Kini kita sediakan fallback generik.)
  function ensureSetPage(){
    if (!window.S) window.S = {};
    if (typeof S.setPage === 'function') return;   // sudah ada (mekanisme asli) -> jangan timpa
    S.setPage = function(name){
      // switch page-content
      var pages = document.querySelectorAll('.page-content');
      for (var i=0;i<pages.length;i++) pages[i].classList.remove('active');
      var target = document.getElementById('page-'+name);
      if (target) target.classList.add('active');
      // update nav-item active
      var navs = document.querySelectorAll('.nav-item');
      for (var j=0;j<navs.length;j++){
        var dp = navs[j].getAttribute('data-page');
        if (dp === name) navs[j].classList.add('active');
        else navs[j].classList.remove('active');
      }
      // tutup sidebar mobile
      var sb = document.getElementById('sidebar');
      if (sb) sb.classList.remove('active');
      if (document.body) document.body.classList.remove('sidebar-open');
      // hook mount
      if (name === 'data-siswa') tryMount();
    };
    console.log('[DataSiswa] S.setPage fallback terpasang');
  }

  // ===== FIX: MutationObserver — mount otomatis saat #page-data-siswa jadi .active =====
  function observePageActive(){
    var target = $('page-data-siswa');
    if (!target) { setTimeout(observePageActive, 300); return; }
    if (typeof MutationObserver === 'undefined') return;
    var mo = new MutationObserver(function(muts){
      for (var i=0;i<muts.length;i++){
        if (muts[i].type === 'attributes' && muts[i].attributeName === 'class') {
          if (target.classList.contains('active')) tryMount();
        }
      }
    });
    mo.observe(target, { attributes:true, attributeFilter:['class'] });
  }

  // ===== FIX: listener cadangan pada nav-item =====
  function bindNavClick(){
    var navs = document.querySelectorAll('.nav-item[data-page="data-siswa"]');
    for (var i=0;i<navs.length;i++){
      (function(el){
        if (el._dsBound) return;
        el._dsBound = true;
        el.addEventListener('click', function(){ setTimeout(tryMount, 50); });
      })(navs[i]);
    }
  }

  // ===== Init =====
  function init(){
    ensureSetPage();
    observePageActive();
    bindNavClick();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  // ===== Public API =====
  window.loadDataSiswa = function(){ tryMount(); };

  console.log('✅ datasiswa.js v1.2 loaded — mounting robust (S.setPage fallback + observer)');
})();