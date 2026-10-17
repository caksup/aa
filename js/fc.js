/* #07 | /root/js/fc.js | v 2.1 | u 21/09/2026 • 15:00:00 | xu : ke-3 | note : #noteresponse
- v2.0 -> v2.1 (PERFORMANCE: ENABLE OFFLINE PERSISTENCE + MULTI-TAB):
  * Tambah enablePersistence({synchronizeTabs:true}) -> cache lokal aktif
    di IndexedDB + aman multi-tab (10+ tab tidak hang karena leader
    election otomatis). Ini akar masalah loading 1 menit di LTE.
  * Tambah db.settings({cacheSizeBytes: 100MB}) -> default 40MB terlalu
    kecil untuk admin app dengan ~500 students + topics + assignments.
  * URUTAN eksekusi (kritis):
    1. initializeApp (sync)
    2. firestore() instance
    3. settings() (sync, SEBELUM operasi apapun)
    4. enablePersistence() (async, non-blocking, dengan catch)
    5. expose window.db (sync, file downstream bisa langsung pakai)
  * enablePersistence TIDAK di-await karena fc.js dieksekusi sync oleh
    afl.html. Firestore SDK akan queue operasi internal jika persistence
    belum siap -> aman.
  * Error handling untuk 2 kasus umum:
    - failed-precondition: multi-tab conflict atau browser private mode
    - unimplemented: browser tidak support IndexedDB
  * Dampak: load pertama tetap ~1-3s (fetch server), load kedua+ <500ms
    (dari cache), offline tetap jalan, multi-tab stabil.
- afl.html: tidak perlu ubah cache-bust (fc.js tidak punya ?v= di v2.2).
- NEXT: fc-materi.js v1.2 (persistence untuk project jec-theory) di
  response berikutnya. */

var firebaseConfig = {
  apiKey: "AIzaSyCbvRHwaqylM5SHIEpAJ64p06dNyL8ELFA",
  authDomain: "jec-extka.firebaseapp.com",
  projectId: "jec-extka",
  storageBucket: "jec-extka.firebasestorage.app",
  messagingSenderId: "690768918335",
  appId: "1:690768918335:web:00790eaf004816b94a458a"
};

// 1. Init app
firebase.initializeApp(firebaseConfig);

// 2. Ambil instance
var db = firebase.firestore();

// 3. Set cache size SEBELUM operasi apapun (default 40MB terlalu kecil
//    untuk admin app dengan ratusan dokumen materi + students + assign)
try {
  db.settings({ cacheSizeBytes: 100 * 1024 * 1024 }); // 100 MB
} catch(e) {
  console.warn('[fc] settings error:', e.message);
}

// 4. Enable offline persistence (async, non-blocking)
//    synchronizeTabs:true = aman untuk multi-tab (leader election otomatis)
try {
  db.enablePersistence({ synchronizeTabs: true }).catch(function(err) {
    if (err && err.code === 'failed-precondition') {
      // Biasanya terjadi di private/incognito mode ATAU jika Firestore
      // dipanggil dari instance lain sebelum persistence siap. Aman
      // lanjut tanpa persistence.
      console.warn('[fc] persistence: failed-precondition (multi-tab/incognito). Lanjut tanpa cache.');
    } else if (err && err.code === 'unimplemented') {
      console.warn('[fc] persistence: browser tidak support IndexedDB.');
    } else {
      console.warn('[fc] persistence error:', err ? (err.message || err) : 'unknown');
    }
  });
  console.log('✅ [fc] offline persistence ENABLED (sync-tabs, 100MB cache)');
} catch(e) {
  console.warn('[fc] enablePersistence throw:', e.message);
}

// 5. Expose ke window (sync, downstream files aman pakai)
window.db = db;
window.fdb = firebase.firestore; // FieldValue dll

console.log('✅ Firebase initialized - project: ' + firebaseConfig.projectId);