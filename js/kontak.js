/* #23 | /root/js/kontak.js | v 1.0 | u 07/09/2026 • 18:20:00 | xu : ke-1 | note : #noteresponse
- HALAMAN BARU "Kontak Orang Tua" (admin): tabel semua siswa + edit Nama & WA Orang Tua.
- Field siswa: name (nama), parentWA (nomor WA wali). Admin bisa edit keduanya.
- (Sisi siswa: isi parentWA + edit nama sendiri -> js/s/profile.js, menyusul.) */

function waBadgeK(v){
  return v ? '<span class="badge badge-success">'+v+'</span>' : '<span class="badge badge-warning">Belum diisi</span>';
}
function normWAK(v){
  if(!v) return '';
  var d=String(v).replace(/\D/g,'');
  if(d.indexOf('0')===0) d='62'+d.slice(1);
  return d;
}

async function loadKontak(){
  var c=document.getElementById('kontakList');
  var snap=await db.collection('students').get();
  var list=[]; snap.forEach(function(d){ list.push(Object.assign({id:d.id},d.data())); });
  list.sort(function(a,b){ return a.id<b.id?-1:1; });

  if(!list.length){ c.innerHTML='<div class="empty-state"><span class="material-icons">contact_phone</span><p>Belum ada siswa</p></div>'; return; }

  var html='<div class="table-wrapper"><table class="table"><thead><tr>'+
    '<th>ID</th><th>Nama Siswa</th><th>WA Orang Tua</th><th>Status</th><th>Aksi</th>'+
    '</tr></thead><tbody>';
  list.forEach(function(s){
    html+='<tr><td><strong>'+s.id+'</strong></td>'+
      '<td>'+(s.name||'-')+'</td>'+
      '<td>'+waBadgeK(s.parentWA)+'</td>'+
      '<td><span class="badge '+(s.status?'badge-success':'badge-error')+'">'+(s.status?'Aktif':'Nonaktif')+'</span></td>'+
      '<td><button class="btn btn-secondary btn-sm" onclick="editKontak(\''+s.id+'\')"><span class="material-icons">edit</span>Edit</button></td></tr>';
  });
  html+='</tbody></table></div>';
  c.innerHTML=html;
}

window.editKontak=async function(id){
  var d=await db.collection('students').doc(id).get();
  if(!d.exists) return;
  var s=d.data();
  M.custom({
    title:'Edit Kontak - '+id,
    message:
      '<div class="form-group"><label class="form-label">Nama Siswa</label>'+
      '<input type="text" class="form-control" id="kNama" value="'+(s.name||'')+'"></div>'+
      '<div class="form-group"><label class="form-label">Nama Orang Tua (opsional)</label>'+
      '<input type="text" class="form-control" id="kNamaWali" value="'+(s.parentName||'')+'"></div>'+
      '<div class="form-group"><label class="form-label">WA Orang Tua (contoh: 0812... / 62812...)</label>'+
      '<input type="tel" class="form-control" id="kWA" value="'+(s.parentWA||'')+'"></div>',
    type:'info',
    buttons:[
      {text:'Batal',class:'btn-secondary'},
      {text:'Simpan',class:'btn-primary',action:function(){ saveKontak(id); }}
    ]
  });
};

async function saveKontak(id){
  var nama=document.getElementById('kNama').value.trim();
  var wali=document.getElementById('kNamaWali').value.trim();
  var wa=document.getElementById('kWA').value.trim();
  if(!nama){ alert2('Error','Nama siswa wajib diisi','error'); return; }

  await db.collection('students').doc(id).update({
    name: nama,
    parentName: wali,
    parentWA: normWAK(wa),
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  }).catch(function(){});
  toast('Kontak disimpan','success');
  loadKontak();
}

window.loadKontak=loadKontak;
window.editKontak=window.editKontak;