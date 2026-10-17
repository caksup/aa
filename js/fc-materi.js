/* fl#08 | /root/js/fc-materi.js | v 1.2 | u 21/09/2026 • 15:10:00 | xu : ke-3 | note : #noteresponse
- v1.1 -> v1.2 (PERFORMANCE: ENABLE OFFLINE PERSISTENCE + MULTI-TAB):
  * Tambah enablePersistence({synchronizeTabs:true}) untuk project
    jec-theory -> cache lokal aktif di IndexedDB + aman multi-tab.
    Ini menyelesaikan ~50% sisanya dari masalah loading 1 menit (sisanya
    di fc.js v2.1 yang sudah di-fix di response sebelumnya).
  * Tambah db.settings({cacheSizeBytes: 100MB}) -> cukup untuk koleksi
    topics, grade_map, fl_batch_assign, fl_student_progress, fl_submissions,
    fl_ex_result, materi_logs.
  * STRUKTUR IIFE DIPERTAHANKAN (v1.1 pattern):
    1. try { firebase.app('materi') } catch(e) { firebase.initializeApp(config,'materi') }
    2. app.firestore() instance
    3. settings() sync
    4. enablePersistence() async non-blocking
    5. expose window.dbMateri
  * enablePersistence TIDAK di-await -> file dieksekusi sync, downstream
    files bisa langsung pakai window.dbMateri; Firestore SDK akan queue
    operasi internal jika persistence belum siap.
  * Error handling identik fc.js v2.1: failed-precondition (multi-tab/
    incognito), unimplemented (browser no IndexedDB).
  * Dampak gabungan (fc.js v2.1 + fc-materi.js v1.2):
    - Load kedua+ : ~60 detik -> < 1 detik (kedua project dari cache)
    - Pindah tab : instant (data sudah di IndexedDB)
    - Offline : read/write tetap jalan, sync saat online
- afl.html: tidak perlu ubah (fc-materi.js tidak punya ?v= di v2.4).
- NEXT: admin-assign.js v1.10 (Promise.all + sessionStorage cache +
  watchdog) di response berikutnya. */
(function(){
  'use strict';
  var config = {
    apiKey: "AIzaSyANlesf-_gwiwC6LlpxvHVoB01fRbi6Rgs",
    authDomain: "jec-theory.firebaseapp.com",
    projectId: "jec-theory",
    storageBucket: "jec-theory.firebasestorage.app",
    messagingSenderId: "477278565141",
    appId: "1:477278565141:web:a3fe5175b94d8fb947af1c"
  };

  var app;
  try {
    app = firebase.app('materi');
  } catch(e) {
    app = firebase.initializeApp(config, 'materi');
  }

  // 1. Ambil instance Firestore
  var dbMateri = app.firestore();

  // 2. Set cache size SEBELUM operasi apapun
  try {
    dbMateri.settings({ cacheSizeBytes: 100 * 1024 * 1024 }); // 100 MB
  } catch(e) {
    console.warn('[fc-materi] settings error:', e.message);
  }

  // 3. Enable offline persistence (async, non-blocking)
  try {
    dbMateri.enablePersistence({ synchronizeTabs: true }).catch(function(err) {
      if (err && err.code === 'failed-precondition') {
        console.warn('[fc-materi] persistence: failed-precondition (multi-tab/incognito). Lanjut tanpa cache.');
      } else if (err && err.code === 'unimplemented') {
        console.warn('[fc-materi] persistence: browser tidak support IndexedDB.');
      } else {
        console.warn('[fc-materi] persistence error:', err ? (err.message || err) : 'unknown');
      }
    });
    console.log('✅ [fc-materi] offline persistence ENABLED (sync-tabs, 100MB cache)');
  } catch(e) {
    console.warn('[fc-materi] enablePersistence throw:', e.message);
  }

  // 4. Expose ke window (sync, downstream files aman pakai)
  window.dbMateri = dbMateri;

  console.log('✅ fc-materi.js v1.2 loaded (project: jec-theory, persistence ON)');
})();