/* #08 | /root/js/hash.js | v 2.0 | u 06/09/2026 • 22:01:00 | xu : ke-2 | note : 
- Hash PIN dengan SHA-256 (Web Crypto API) + fallback jika tidak tersedia
- verifyPin untuk compare hash
- formatDate, formatDuration, timeAgo untuk formatting waktu
- Expose ke window untuk dipakai global */

window.hashPin = async function(pin) {
  try {
    var buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pin.toString()));
    return Array.from(new Uint8Array(buf)).map(function(b){ return b.toString(16).padStart(2,'0'); }).join('');
  } catch(e) {
    var h = 0;
    for (var i = 0; i < pin.length; i++){ h = ((h << 5) - h) + pin.charCodeAt(i); h |= 0; }
    return 'fb_' + Math.abs(h).toString(16);
  }
};

window.verifyPin = async function(pin, hash) {
  return (await hashPin(pin)) === hash;
};

window.formatDate = function(input) {
  if (!input) return '-';
  try {
    var d;
    if (input && input.toDate) d = input.toDate();
    else if (typeof input === 'string') d = new Date(input);
    else d = input;
    if (isNaN(d.getTime())) return '-';
    return d.toLocaleDateString('id-ID', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' });
  } catch(e) { return '-'; }
};

window.formatDuration = function(seconds) {
  if (!seconds || seconds < 0) return '00:00';
  var s = Math.floor(seconds);
  var m = Math.floor(s / 60);
  var sec = s % 60;
  return m.toString().padStart(2,'0') + ':' + sec.toString().padStart(2,'0');
};

window.timeAgo = function(ts) {
  if (!ts) return 'Baru saja';
  var d;
  try { d = ts.toDate ? ts.toDate() : new Date(ts); } catch(e) { return 'Baru saja'; }
  var s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 60) return 'Baru saja';
  if (s < 3600) return Math.floor(s/60) + ' menit lalu';
  if (s < 86400) return Math.floor(s/3600) + ' jam lalu';
  if (s < 604800) return Math.floor(s/86400) + ' hari lalu';
  return d.toLocaleDateString('id-ID');
};