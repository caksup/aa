/* #13 | /root/js/manage-siswa.js | v 2.0 | u 06/09/2026 • 22:08:00 | xu : ke-2 | note : 
- CRUD siswa lengkap: Input manual, Generate otomatis, List dengan batch filter
- Toggle status, edit nama, reset PIN, hapus siswa
- Select all, delete selected, toggle selected status
- Export CSV */

async function loadStudents() {
  var snap = await db.collection('students').get();
  S.students = [];
  var batches = {};
  snap.forEach(function(d){
    var data = Object.assign({ id: d.id }, d.data());
    S.students.push(data);
    var b = data.batch || 'Unknown';
    if (!batches[b]) batches[b] = [];
    batches[b].push(data);
  });
  
  // Pills
  var pills = document.getElementById('batchPills');
  pills.innerHTML = '<button class="pill ' + (S.batchFilter === 'all' ? 'active' : '') + '" data-batch="all"><span class="material-icons">list</span>Semua<span class="badge badge-info" style="margin-left:.25rem;">' + S.students.length + '</span></button>';
  
  Object.keys(batches).sort().forEach(function(b){
    pills.innerHTML += '<button class="pill ' + (S.batchFilter === b ? 'active' : '') + '" data-batch="' + b + '"><span class="material-icons">group_work</span>Batch ' + b + '<span class="badge badge-info" style="margin-left:.25rem;">' + batches[b].length + '</span></button>';
  });
  
  pills.querySelectorAll('.pill').forEach(function(p){
    p.onclick = function(){ setBatchFilter(p.dataset.batch); };
  });
  
  renderStudents();
}

function setBatchFilter(b) {
  S.batchFilter = b;
  loadStudents();
}

function renderStudents() {
  var grid = document.getElementById('studentGrid');
  var list = S.students;
  if (S.batchFilter !== 'all') list = list.filter(function(s){ return s.batch === S.batchFilter; });
  
  if (list.length === 0) {
    grid.innerHTML = '<div class="empty-state"><span class="material-icons">person_off</span><p>Tidak ada siswa</p></div>';
    return;
  }
  
  grid.innerHTML = list.map(function(s){
    return '<div class="student-card">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;">' +
        '<div class="student-card-id">' + s.id + '</div>' +
        '<label class="toggle"><input type="checkbox" ' + (s.status ? 'checked' : '') + ' onchange="toggleStatus(\'' + s.id + '\', this.checked)"><span class="toggle-slider"></span></label>' +
      '</div>' +
      '<div class="student-card-name">' + s.name + '</div>' +
      '<div style="display:flex;gap:.25rem;margin:.375rem 0;flex-wrap:wrap;">' +
        '<span class="badge badge-info">Batch ' + s.batch + '</span>' +
        '<span class="badge badge-' + (s.status ? 'success' : 'error') + '">' + (s.status ? 'Aktif' : 'Nonaktif') + '</span>' +
      '</div>' +
      '<div class="student-card-actions">' +
        '<button class="btn btn-secondary btn-sm" onclick="editStudent(\'' + s.id + '\')"><span class="material-icons">edit</span></button>' +
        '<button class="btn btn-warning btn-sm" onclick="resetPin(\'' + s.id + '\')"><span class="material-icons">vpn_key</span></button>' +
        '<button class="btn btn-error btn-sm" onclick="deleteStudent(\'' + s.id + '\')"><span class="material-icons">delete</span></button>' +
        '<label class="checkbox-wrapper" style="margin-left:auto;font-size:.75rem;"><input type="checkbox" class="sel-student" value="' + s.id + '" ' + (S.selected.has(s.id) ? 'checked' : '') + '>Pilih</label>' +
      '</div>' +
    '</div>';
  }).join('');
  
  grid.querySelectorAll('.sel-student').forEach(function(cb){
    cb.onchange = function(){
      if (cb.checked) S.selected.add(cb.value);
      else S.selected.delete(cb.value);
    };
  });
}

async function saveStudent(e) {
  e.preventDefault();
  var year = document.getElementById('mYear').value.padStart(2, '0');
  var batch = document.getElementById('mBatch').value.padStart(2, '0');
  var seq = document.getElementById('mSeq').value.padStart(2, '0');
  var name = document.getElementById('mName').value.trim();
  var pin = document.getElementById('mPin').value;
  var id = year + batch + seq;
  
  var existing = await db.collection('students').doc(id).get();
  if (existing.exists) { alert2('Error', 'ID ' + id + ' sudah ada!', 'error'); return; }
  
  var pinHash = await hashPin(pin);
  await db.collection('students').doc(id).set({
    year: year, batch: batch, sequence: seq, name: name,
    pinHash: pinHash, status: true,
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  });
  
  alert2('Berhasil', 'Siswa ' + id + ' - ' + name + ' ditambahkan.', 'success');
  e.target.reset();
  document.getElementById('mPin').value = '1234';
  loadStudents();
}

async function generateStudents(e) {
  e.preventDefault();
  var year = document.getElementById('gYear').value.padStart(2, '0');
  var batch = document.getElementById('gBatch').value.padStart(2, '0');
  var start = parseInt(document.getElementById('gStart').value);
  var count = parseInt(document.getElementById('gCount').value);
  var pin = document.getElementById('gPin').value;
  
  var pinHash = await hashPin(pin);
  var b = db.batch();
  var created = 0, skipped = 0;
  
  for (var i = 0; i < count; i++) {
    var seq = (start + i).toString().padStart(2, '0');
    var id = year + batch + seq;
    var ex = await db.collection('students').doc(id).get();
    if (!ex.exists) {
      b.set(db.collection('students').doc(id), {
        year: year, batch: batch, sequence: seq, name: 'Siswa ' + seq,
        pinHash: pinHash, status: true,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      created++;
    } else skipped++;
  }
  
  await b.commit();
  alert2('Berhasil', created + ' siswa ditambahkan.' + (skipped ? ' ' + skipped + ' dilewati.' : ''), 'success');
  loadStudents();
}

function selectAllStudents(checked) {
  document.querySelectorAll('.sel-student').forEach(function(cb){
    cb.checked = checked;
    if (checked) S.selected.add(cb.value);
    else S.selected.delete(cb.value);
  });
}

async function deleteSelected() {
  if (S.selected.size === 0) { alert2('Info', 'Pilih siswa dulu', 'warning'); return; }
  confirm2('Hapus', 'Hapus ' + S.selected.size + ' siswa?', async function(){
    var b = db.batch();
    S.selected.forEach(function(id){ b.delete(db.collection('students').doc(id)); });
    await b.commit();
    alert2('Berhasil', S.selected.size + ' siswa dihapus', 'success');
    S.selected.clear();
    loadStudents();
  });
}

async function toggleSelected() {
  if (S.selected.size === 0) { alert2('Info', 'Pilih siswa dulu', 'warning'); return; }
  var b = db.batch();
  for (var id of S.selected) {
    var s = S.students.find(function(x){ return x.id === id; });
    if (s) b.update(db.collection('students').doc(id), { status: !s.status, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
  }
  await b.commit();
  alert2('Berhasil', 'Status diubah', 'success');
  loadStudents();
}

async function toggleStatus(id, status) {
  await db.collection('students').doc(id).update({ status: status, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
  toast('Status diperbarui', 'success');
}

async function editStudent(id) {
  var s = S.students.find(function(x){ return x.id === id; });
  var newName = prompt('Nama baru:', s.name);
  if (newName && newName.trim()) {
    await db.collection('students').doc(id).update({ name: newName.trim(), updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
    toast('Diperbarui', 'success');
    loadStudents();
  }
}

async function resetPin(id) {
  var pin = prompt('PIN baru (4-6 digit):', '1234');
  if (pin && pin.length >= 4 && /^\d+$/.test(pin)) {
    var pinHash = await hashPin(pin);
    await db.collection('students').doc(id).update({ pinHash: pinHash, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
    toast('PIN direset', 'success');
  } else if (pin !== null) {
    alert2('Error', 'PIN harus 4-6 digit angka', 'error');
  }
}

async function deleteStudent(id) {
  confirm2('Hapus', 'Hapus siswa ' + id + '?', async function(){
    await db.collection('students').doc(id).delete();
    toast('Dihapus', 'success');
    loadStudents();
  });
}

function exportStudents() {
  if (S.students.length === 0) { alert2('Info', 'Tidak ada data', 'warning'); return; }
  var csv = 'ID,Nama,Tahun,Batch,Urutan,Status\n';
  S.students.forEach(function(s){
    csv += s.id + ',' + s.name + ',' + (s.year || '') + ',' + (s.batch || '') + ',' + (s.sequence || '') + ',' + (s.status ? 'Aktif' : 'Nonaktif') + '\n';
  });
  var blob = new Blob([csv], { type: 'text/csv' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'students_' + new Date().toISOString().split('T')[0] + '.csv';
  a.click();
  toast('Export berhasil', 'success');
}