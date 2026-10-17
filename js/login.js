/* #06 | /root/js/login.js | v 2.2 | u 07/09/2026 • 13:30:00 | xu : ke-3 | note : 
- Session admin disimpan di localStorage + sessionStorage (persist walau tab/browser ditutup)
- Restore otomatis pada window 'load' (hindari blank) + kembalikan menu terakhir
- Tetap: login (cek ID + verifyPin), toggle PIN, logout via header.js
- Tidak mengubah fungsi lama, hanya menambah persist + restore */

(function(){
  'use strict';
  function $(id){ return document.getElementById(id); }

  function saveSession(u){
    var s = JSON.stringify(u);
    try{ localStorage.setItem('admin_session', s); }catch(e){}
    try{ sessionStorage.setItem('admin_session', s); }catch(e){}
  }
  function readSession(){
    var s = null;
    try{ s = localStorage.getItem('admin_session') || sessionStorage.getItem('admin_session'); }catch(e){}
    return s;
  }
  function clearSession(){
    try{ localStorage.removeItem('admin_session'); }catch(e){}
    try{ sessionStorage.removeItem('admin_session'); }catch(e){}
  }

  // Rekam menu terakhir (untuk restore posisi)
  document.addEventListener('click', function(e){
    var nav = e.target.closest ? e.target.closest('.nav-item') : null;
    if (nav && nav.dataset.page) {
      try{ localStorage.setItem('admin_last_page', nav.dataset.page); }catch(e){}
    }
  });

  // Toggle lihat PIN
  var tp = $('togglePin');
  if (tp) tp.addEventListener('click', function(){
    var p = $('loginPin');
    var icon = tp.querySelector('.material-icons');
    if (p.type === 'password') { p.type = 'text'; icon.textContent = 'visibility'; }
    else { p.type = 'password'; icon.textContent = 'visibility_off'; }
  });

  function showDashboard(){
    $('loginScreen').style.display = 'none';
    $('dashboard').style.display = 'flex';
    if (window.HeaderManager) HeaderManager.render(S.user);
    if (window.initDashboard) initDashboard();
    restoreLastPage();
  }

  function restoreLastPage(){
    var last = null;
    try{ last = localStorage.getItem('admin_last_page'); }catch(e){}
    if (last && last !== 'home') {
      setTimeout(function(){
        var el = document.querySelector('.nav-item[data-page="' + last + '"]');
        if (el) el.click();
      }, 150);
    }
  }

  // Login manual
  var form = $('loginForm');
  if (form) form.addEventListener('submit', async function(e){
    e.preventDefault();
    var err = $('loginErr');
    var id = $('loginId').value.trim();
    var pin = $('loginPin').value;
    var btn = form.querySelector('button[type="submit"]');

    err.style.display = 'none';
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Verifikasi...';

    try {
      var snap = await db.collection('admins').doc(id).get();
      if (!snap.exists) {
        err.textContent = 'ID Admin tidak ditemukan!';
        err.style.display = 'block'; btn.disabled = false;
        btn.innerHTML = '<span class="material-icons">login</span>Masuk'; return;
      }
      var data = snap.data();
      var valid = await verifyPin(pin, data.pinHash);
      if (!valid) {
        err.textContent = 'PIN salah!';
        err.style.display = 'block'; btn.disabled = false;
        btn.innerHTML = '<span class="material-icons">login</span>Masuk'; return;
      }

      S.user = { id: id, name: data.name || id, email: data.email || '' };
      saveSession(S.user);
      await db.collection('admins').doc(id).update({ lastLogin: firebase.firestore.FieldValue.serverTimestamp() }).catch(function(){});
      showDashboard();
    } catch (error) {
      err.textContent = 'Error: ' + error.message;
      err.style.display = 'block'; btn.disabled = false;
      btn.innerHTML = '<span class="material-icons">login</span>Masuk';
    }
  });

  // Restore session setelah semua script siap
  function restore(){
    var raw = readSession();
    if (!raw) return; // tetap di login
    var u;
    try{ u = JSON.parse(raw); }catch(e){ clearSession(); return; }
    if (!u || !u.id) { clearSession(); return; }
    S.user = u;
    showDashboard();
  }

  if (document.readyState === 'complete') restore();
  else window.addEventListener('load', restore);

  window.showAdminDashboard = showDashboard;
  window.clearAdminSession = clearSession;
})();