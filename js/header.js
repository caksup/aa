/* #09 | /root/js/header.js | v 2.1 | u 07/09/2026 • 13:31:00 | xu : ke-2 | note : 
- Logout kini bersihkan localStorage + sessionStorage (sinkron dengan login.js v2.2)
- Tetap: render header (ID | Nama), jam & tanggal real-time, menu toggle sidebar */

(function(){
  'use strict';
  function $(id){ return document.getElementById(id); }
  var clockInt = null;

  function startClock(){
    function upd(){
      var now = new Date();
      var d = $('headerDate'), t = $('headerTime');
      if (d) d.textContent = now.toLocaleDateString('id-ID', { day:'2-digit', month:'short', year:'numeric' });
      if (t) t.textContent = now.toLocaleTimeString('id-ID', { hour:'2-digit', minute:'2-digit', second:'2-digit' });
    }
    upd();
    if (!clockInt) clockInt = setInterval(upd, 1000);
  }

  function bindLogout(){
    var b = $('logoutBtn');
    if (b && !b._bound) {
      b._bound = true;
      b.addEventListener('click', function(){
        confirm2('Logout', 'Keluar dari panel admin?', function(){
          try{ localStorage.removeItem('admin_session'); }catch(e){}
          try{ sessionStorage.removeItem('admin_session'); }catch(e){}
          try{ localStorage.removeItem('admin_last_page'); }catch(e){}
          location.reload();
        });
      });
    }
  }

  function bindMenu(){
    var m = $('menuToggle');
    if (m && !m._bound) {
      m._bound = true;
      m.addEventListener('click', function(){
        var sb = document.getElementById('sidebar');
        if (sb) { sb.classList.toggle('active'); document.body.classList.toggle('sidebar-open'); }
      });
    }
  }

  function render(user){
    var u = $('headerUserId'); if (u) u.textContent = user.id;
    var n = $('headerUserName'); if (n) n.textContent = user.name || user.id;
    var h = $('appHeader'); if (h) h.style.display = 'flex';
    startClock();
    bindLogout();
    bindMenu();
  }

  window.HeaderManager = { render: render };
})();