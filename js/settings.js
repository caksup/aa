/* #20 | /root/js/settings.js | v 2.0 | u 06/09/2026 • 22:15:00 | xu : ke-2 | note : 
- Settings admin (nama, email, ubah PIN)
- Settings panel siswa (anti-cheat, max tab switch, WA link, email template)
- Load & save dari Firestore collection 'admins' dan 'settings' */

async function loadSettings() {
  try {
    var adm = await db.collection('admins').doc(S.user.id).get();
    if (adm.exists) {
      document.getElementById('admName').value = adm.data().name || '';
      document.getElementById('admEmail').value = adm.data().email || '';
    }
    
    var set = await db.collection('settings').doc('global_settings').get();
    if (set.exists) {
      var d = set.data();
      document.getElementById('setAntiCheat').checked = d.antiCheatEnabled !== false;
      document.getElementById('setMaxTab').value = d.maxTabSwitches || 3;
      document.getElementById('setWA').value = d.whatsappGroupLink || '';
      document.getElementById('setEmail').value = d.parentEmailTemplate || '';
    }
  } catch(e) {
    console.error('Settings load error:', e);
  }
}

async function saveAdminSettings(e) {
  e.preventDefault();
  var name = document.getElementById('admName').value.trim();
  var email = document.getElementById('admEmail').value.trim();
  var pin = document.getElementById('admPin').value;
  
  if (!name) { alert2('Error', 'Nama wajib diisi', 'error'); return; }
  
  var data = {
    name: name,
    email: email,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  };
  
  if (pin) {
    if (pin.length < 4 || !/^\d+$/.test(pin)) { alert2('Error', 'PIN harus 4-6 digit angka', 'error'); return; }
    data.pinHash = await hashPin(pin);
  }
  
  await db.collection('admins').doc(S.user.id).update(data);
  
  S.user.name = name;
  S.user.email = email;
  sessionStorage.setItem('admin_session', JSON.stringify(S.user));
  
  toast('Pengaturan disimpan', 'success');
  if (pin) document.getElementById('admPin').value = '';
  
  // Update nama di header
  var nameEl = document.getElementById('headerUserName');
  if (nameEl) nameEl.textContent = name;
}

async function saveStudentSettings() {
  var data = {
    antiCheatEnabled: document.getElementById('setAntiCheat').checked,
    maxTabSwitches: parseInt(document.getElementById('setMaxTab').value) || 3,
    whatsappGroupLink: document.getElementById('setWA').value.trim(),
    parentEmailTemplate: document.getElementById('setEmail').value.trim()
  };
  
  await db.collection('settings').doc('global_settings').set(data, { merge: true });
  toast('Pengaturan siswa disimpan', 'success');
}