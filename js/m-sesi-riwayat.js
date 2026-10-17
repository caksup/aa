/* #32 | /root/js/m-sesi-riwayat.js | v 1.1 | u 10/09/2026 • 19:15:00 | xu : ke-2 | note : #noteresponse
- RENAME: riwayat-sesi.js -> m-sesi-riwayat.js (konsisten penamaan sub-module Manage Sesi
  dengan m-sesi-liveexercise.js, m-sesi-homework.js, m-sesi-realtimexercise.js).
- ADDITIVE PATCH (soft-delete aware): filter sesi dengan `deleted === true` agar sesi
  yang sudah dipindahkan ke Sampah tidak muncul di daftar Riwayat. Doc lama tanpa
  field `deleted` tetap tampil (prinsip backward compat).
- ADDITIVE PATCH (realtime aware): badge mode "Realtime" muncul bila sesi mode=realtime;
  avg score dihitung dari attempts mode realtime juga (field realtimePoints ikut
  di-summary bila score null).
- ADDITIVE PATCH: tombol Arsipkan sekarang memakai `deleted:false` aware — cek flag
  `archived` + `deleted` agar sesi di-trash tidak bisa diarsipkan.
- TETAP IDENTIK (tidak dipotong dari v1.0):
  * Self-bind nav-item data-page="riwayat-sesi" (callable dari sidebar tanpa ubah init-dashboard.js).
  * loadRiwayatSesi: filter S.sessions dengan isSessionDone + !archived; ambil finishedAt
    terakhir + avg score dari attempts completed.
  * Kartu sesi: nama, kode, badge Selesai, tombol Lihat Hasil + Arsipkan, meta soal/siswa/avg/selesai.
  * openRiwayatReview(sid): lompat ke Review TKA + pilih sesi.
  * arsipkanSesi(id): update archived=true, refresh daftar.
- DEPENDENSI: db, firebase, S, toast, confirm2, window.isSessionDone, window.loadSessions.
- EXPOSE: window.loadRiwayatSesi, window.openRiwayatReview, window.arsipkanSesi. */

(function(){
  'use strict';

  function escR(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  function formatDate(d){
    if (!d || isNaN(d.getTime())) return '-';
    var BULAN = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
    var p = function(n){ return String(n).padStart(2,'0'); };
    return d.getDate()+'/'+BULAN[d.getMonth()]+'/'+String(d.getFullYear()).slice(-2)+
           ' '+p(d.getHours())+':'+p(d.getMinutes());
  }

  // Self-bind nav-item riwayat-sesi (biar tidak perlu edit init-dashboard.js)
  function bindNav(){
    var navs = document.querySelectorAll('.nav-item[data-page="riwayat-sesi"]');
    navs.forEach(function(n){
      if(!n._boundR){
        n._boundR = true;
        n.addEventListener('click', function(){ loadRiwayatSesi(); });
      }
    });
  }

  async function loadRiwayatSesi(){
    bindNav();
    var list = document.getElementById('riwayatSesiList');
    if(!list) return;

    list.innerHTML = '<div class="empty-state"><span class="material-icons">hourglass_empty</span><p>Memuat...</p></div>';

    // Pastikan sessions & stats sudah terisi
    if(!S.sessions.length || !S.sessionStats || !Object.keys(S.sessionStats).length){
      if(window.loadSessions) await loadSessions();
    }

    // FILTER: sesi selesai + belum archived + tidak di-trash (deleted !== true)
    var doneSessions = S.sessions.filter(function(s){
      if(s.archived) return false;
      if(s.deleted === true) return false;   // ADDITIVE: exclude yang di-trash
      return window.isSessionDone ? window.isSessionDone(s.id) : false;
    });

    if(!doneSessions.length){
      list.innerHTML = '<div class="empty-state"><span class="material-icons">history</span><p>Belum ada sesi yang seluruh siswa assigned-nya selesai</p>' +
        '<p style="font-size:.8125rem;color:#64748b;">Sesi masuk daftar ini ketika semua siswa yang ditugaskan sudah menyelesaikan pengerjaan.</p></div>';
      return;
    }

    // Ambil finishedAt terakhir per sesi (dari attempts completed, exclude attempts ter-trash)
    var finishMap = {};
    var aSnap = await db.collection('attempts').where('status','==','completed').get();
    aSnap.forEach(function(d){
      var a = d.data();
      if (a.deleted === true) return;
      var t = a.finishedAt || a.startedAt;
      if(!t) return;
      var ts;
      try{ ts = t.toDate ? t.toDate().getTime() : new Date(t).getTime(); }catch(e){ return; }
      if(!finishMap[a.sessionId] || ts > finishMap[a.sessionId]) finishMap[a.sessionId] = ts;
    });

    // Hitung avg score per sesi (include realtime mode via realtimePoints fallback)
    var avgMap = {};
    var sumMap = {};
    var cntMap = {};
    aSnap.forEach(function(d){
      var a = d.data();
      if (a.deleted === true) return;
      var sc = a.score;
      if (sc == null && a.mode === 'realtime' && a.realtimePoints != null) sc = a.realtimePoints;
      if (sc == null) return;
      sumMap[a.sessionId] = (sumMap[a.sessionId]||0) + sc;
      cntMap[a.sessionId] = (cntMap[a.sessionId]||0) + 1;
    });
    Object.keys(sumMap).forEach(function(k){ avgMap[k] = Math.round(sumMap[k]/cntMap[k]); });

    var html = doneSessions.map(function(s){
      var st = S.sessionStats[s.id] || {q:0, done:0, assigned:0};
      var finishTs = finishMap[s.id];
      var finishStr = finishTs ? formatDate(new Date(finishTs)) : '-';
      var avg = avgMap[s.id];

      // Badge mode
      var modeBadge = (s.mode === 'homework')
        ? '<span class="mode-badge-hw"><span class="material-icons">menu_book</span>PR</span>'
        : (s.mode === 'realtime')
          ? '<span class="badge" style="background:#ede9fe;color:#5b21b6;"><span class="material-icons" style="font-size:12px;">sports_esports</span>Realtime</span>'
          : '<span class="mode-badge-live"><span class="material-icons">bolt</span>Live</span>';

      return '<div class="session-card">'+
        '<div class="session-card-header">'+
          '<div class="session-card-title" style="flex:1;min-width:0;">'+
            '<div style="display:flex;align-items:center;gap:.375rem;flex-wrap:wrap;">'+
              '<span class="material-icons">task_alt</span>'+
              '<strong>'+escR(s.name)+'</strong> '+
              modeBadge+
              (s.code?' <span class="badge badge-info" style="font-family:monospace;">'+escR(s.code)+'</span>':'')+
              ' <span class="badge badge-success">Selesai</span>'+
            '</div>'+
          '</div>'+
          '<div class="session-card-actions" style="flex-shrink:0;">'+
            '<button class="btn btn-primary btn-sm" onclick="openRiwayatReview(\''+s.id+'\')" title="Lihat Hasil"><span class="material-icons">rate_review</span>Lihat Hasil</button> '+
            '<button class="btn btn-secondary btn-sm" onclick="arsipkanSesi(\''+s.id+'\')" title="Arsipkan"><span class="material-icons">archive</span>Arsipkan</button>'+
          '</div>'+
        '</div>'+
        '<div class="session-card-meta">'+
          '<div class="session-meta-item"><span class="material-icons">quiz</span>'+st.q+' soal</div>'+
          '<div class="session-meta-item"><span class="material-icons">groups</span>'+st.done+'/'+st.assigned+' siswa</div>'+
          (avg!=null?'<div class="session-meta-item"><span class="material-icons">emoji_events</span>Avg: '+avg+'</div>':'')+
          '<div class="session-meta-item"><span class="material-icons">event_busy</span>Selesai: '+finishStr+'</div>'+
        '</div>'+
      '</div>';
    }).join('');

    list.innerHTML = html;
  }

  // Lompat ke Review TKA + pilih sesi tsb
  window.openRiwayatReview = function(sid){
    var nav = document.querySelector('.nav-item[data-page="review-tka"]');
    if(nav){
      nav.click();
      setTimeout(function(){
        var sel = document.getElementById('reviewSession');
        if(sel){ sel.value = sid; if(window.loadReview) loadReview(); }
      }, 300);
    }
  };

  // Arsipkan sesi (tandai archived=true, hilang dari riwayat ini)
  window.arsipkanSesi = function(id){
    var s = (S.sessions||[]).find(function(x){ return x.id === id; });
    if (!s) { alert2('Error','Sesi tidak ditemukan','error'); return; }
    if (s.deleted === true) { alert2('Info','Sesi ini sudah di Sampah. Pulihkan dulu bila perlu.','warning'); return; }
    confirm2('Arsipkan Sesi','Sesi "'+(s.name||id)+'" akan dihapus dari daftar Riwayat (data tetap tersimpan). Lanjutkan?', async function(){
      try {
        await db.collection('sessions').doc(id).update({
          archived:true,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        toast('Sesi diarsipkan','success');
        loadRiwayatSesi();
      } catch(e){ alert2('Error','Gagal arsip: '+e.message,'error'); }
    });
  };

  window.loadRiwayatSesi = loadRiwayatSesi;

  // Auto-bind saat DOM ready
  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded', bindNav);
  } else {
    bindNav();
  }
})();

console.log('✅ m-sesi-riwayat.js v1.1 loaded (rename + soft-delete + realtime aware)');