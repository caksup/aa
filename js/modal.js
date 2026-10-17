/* #10 | /root/js/modal.js | v 2.1 | u 07/09/2026 • 10:35:00 | xu : ke-3 | note : 
- FIX BUG TOAST TIDAK HILANG: toast kini self-contained (style inline, tidak bergantung class CSS)
- Timer tunggal per toast: timer lama di-clear sebelum jadwal baru (anti bentrok)
- Toast auto-hide pasti jalan + animasi slide in/out via inline style
- Tetap: modal alert/confirm/custom, loading overlay, escape close
- Expose: M.alert, M.confirm, M.custom, M.toast, M.loading + alias alert2/confirm2/toast/loading */

(function(){
'use strict';

var overlay = document.getElementById('modalOverlay');
var icon = document.getElementById('modalIcon');
var title = document.getElementById('modalTitle');
var msg = document.getElementById('modalMsg');
var actions = document.getElementById('modalActions');

var iconMap = { info:'info', success:'check_circle', error:'error', warning:'warning' };

function show(opts) {
  if (!overlay) return;
  icon.textContent = iconMap[opts.type] || 'info';
  icon.className = 'material-icons modal-icon ' + (opts.type || 'info');
  title.textContent = opts.title || '';
  msg.innerHTML = opts.message || '';
  actions.innerHTML = '';
  (opts.buttons || []).forEach(function(b){
    var btn = document.createElement('button');
    btn.className = 'btn ' + (b.class || 'btn-primary');
    btn.innerHTML = b.text;
    btn.onclick = function(){
      overlay.style.display = 'none';
      if (b.action) b.action();
    };
    actions.appendChild(btn);
  });
  overlay.style.display = 'flex';
}

// ============================================
// TOAST (self-contained, anti-stuck)
// ============================================
function toast(m, type, dur) {
  dur = (typeof dur === 'number' && dur > 0) ? dur : 3000;

  var t = document.getElementById('toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'toast';
    document.body.appendChild(t);
  }

  // Clear timer lama supaya tidak bentrok
  if (t._hideTimer) { clearTimeout(t._hideTimer); t._hideTimer = null; }

  var colors = { success:'#10b981', error:'#ef4444', warning:'#f59e0b', info:'#2563eb' };
  var icons  = { success:'check_circle', error:'error', warning:'warning', info:'info' };
  var c = colors[type] || colors.info;
  var ic = icons[type] || 'info';

  // Style inline penuh (tidak bergantung file CSS)
  t.style.cssText =
    'position:fixed;top:70px;right:1rem;z-index:2147483646;' +
    'display:flex;align-items:center;gap:.5rem;' +
    'padding:.75rem 1.25rem;border-radius:8px;background:#fff;' +
    'box-shadow:0 10px 30px rgba(0,0,0,.2);font-size:.875rem;' +
    'border-left:4px solid ' + c + ';max-width:85vw;' +
    'font-family:Inter,-apple-system,sans-serif;color:#1e293b;' +
    'transform:translateX(120%);opacity:0;transition:transform .3s ease,opacity .3s ease;';

  t.innerHTML =
    '<span class="material-icons" style="color:' + c + ';font-size:20px;">' + ic + '</span>' +
    '<span>' + m + '</span>';

  // Slide in (force reflow dulu agar transisi jalan)
  void t.offsetWidth;
  t.style.transform = 'translateX(0)';
  t.style.opacity = '1';

  // Auto-hide pasti jalan
  t._hideTimer = setTimeout(function(){
    t.style.transform = 'translateX(120%)';
    t.style.opacity = '0';
    t._hideTimer = null;
  }, dur);
}

// ============================================
// LOADING OVERLAY
// ============================================
function loading(message) {
  var ld = document.getElementById('loadingOverlay');
  if (!ld) {
    ld = document.createElement('div');
    ld.id = 'loadingOverlay';
    ld.style.cssText = 'position:fixed;inset:0;background:rgba(255,255,255,.9);display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:2147483645;gap:.75rem;';
    ld.innerHTML = '<div class="spinner" style="width:40px;height:40px;border-width:3px;"></div><p style="color:#475569;font-size:.875rem;margin:0;">' + (message || 'Loading...') + '</p>';
    document.body.appendChild(ld);
  }
  return {
    close: function(){ if (ld && ld.parentNode) ld.remove(); },
    update: function(m){ var p = ld.querySelector('p'); if (p) p.textContent = m; }
  };
}

// ============================================
// PUBLIC API
// ============================================
window.M = {
  alert: function(t, m, type, cb){
    show({
      title: t, message: m, type: type || 'info',
      buttons: [{ text:'OK', class: 'btn-' + (type === 'error' ? 'error' : 'primary'), action: cb }]
    });
  },
  confirm: function(t, m, onYes, onNo){
    show({
      title: t, message: m, type: 'warning',
      buttons: [
        { text:'Batal', class:'btn-secondary', action: onNo },
        { text:'Ya', class:'btn-primary', action: onYes }
      ]
    });
  },
  custom: function(opts){
    show({
      title: opts.title,
      message: opts.message || opts.content,
      type: opts.type || 'info',
      buttons: opts.buttons || [{ text:'Tutup', class:'btn-secondary' }]
    });
  },
  toast: toast,
  loading: loading
};

window.alert2 = window.M.alert;
window.confirm2 = window.M.confirm;
window.toast = toast;
window.loading = loading;

// Escape untuk tutup modal
document.addEventListener('keydown', function(e){
  if (e.key === 'Escape' && overlay && overlay.style.display === 'flex') {
    overlay.style.display = 'none';
  }
});

console.log('✅ modal.js v2.1 loaded (toast anti-stuck)');
})();