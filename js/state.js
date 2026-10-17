/* #05 | /root/js/state.js | v 1.1 | u 07/09/2026 • 10:16:00 | xu : ke-2 | note : 
- Global state Admin Panel (adaptasi dari standalone v2.0)
- Idempotent: tidak menimpa window.S jika sudah ada (dari bootstrap ap.html)
- Melengkapi field yang kurang agar semua file js/ aman */

(function(){
  'use strict';

  var defaults = {
    user: null,
    students: [],
    sessions: [],
    questions: [],
    attempts: [],
    feedback: [],
    qType: 'PGS',
    batchFilter: 'all',
    selected: new Set(),
    liveUnsub: null,
    reviewAttempts: [],
    __laporanData: []
  };

  // Pakai yang sudah ada (bootstrap), atau buat baru
  window.S = window.S || {};

  // Lengkapi field yang belum ada (jaga-jaga kalau bootstrap tidak jalan)
  Object.keys(defaults).forEach(function(k){
    if (window.S[k] === undefined) window.S[k] = defaults[k];
  });

  console.log('✅ state.js loaded — window.S siap');
})();