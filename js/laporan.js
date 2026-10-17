/* #22 | /root/js/laporan.js | v 2.2 | u 07/09/2026 • 23:10:00 | xu : ke-4 | note : #noteresponse
- FIX "Cannot set properties of null": tidak bergantung pada id tbody tertentu;
  render ulang SELURUH tabel (#page-laporan .table) thead+tbody, kolom + AKSI.
- Tambah sendReportsWA() (rekap -> WA grup, konsep salin-dulu) & exportReports() (CSV)
  sesuai tombol di ap.html; tetap sendReport/copyReport per siswa (wa.me wali).
- Tidak menghapus fitur lama. */

function copyTextL(t){
  if(navigator.clipboard && navigator.clipboard.writeText){ navigator.clipboard.writeText(t).catch(function(){}); }
  else { var ta=document.createElement('textarea'); ta.value=t; ta.style.cssText='position:fixed;opacity:0;'; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); }
}
function normalizeWA(v){
  if(!v) return '';
  var d=String(v).replace(/\D/g,'');
  if(d.indexOf('0')===0) d='62'+d.slice(1);
  return d;
}
function openWAL(link, msg, copiedMsg){
  copyTextL(msg);
  if(!link){ window.open('https://wa.me/?text='+encodeURIComponent(msg),'_blank'); toast(copiedMsg||'Teks disalin & WA dibuka.','success'); return; }
  if(link.indexOf('chat.whatsapp.com')>-1){ window.open(link,'_blank'); toast('Teks disalin. Buka grup & paste.','success'); }
  else { var s=link.indexOf('?')>-1?'&':'?'; window.open(link+s+'text='+encodeURIComponent(msg),'_blank'); toast('WA dibuka dengan teks.','success'); }
}

async function ensureLaporanData(){
  if(!S.sessions.length) await loadSessionsDropdown();
  if(!S.students.length){
    var st=await db.collection('students').get(); S.students=[];
    st.forEach(function(d){ S.students.push(Object.assign({id:d.id},d.data())); });
  }
}

async function loadReports(){
  await ensureLaporanData();
  var sel=document.getElementById('laporanSession');
  if(sel && sel.options.length<=1){
    var opts='<option value="all">Semua Sesi</option>';
    S.sessions.forEach(function(s){ opts+='<option value="'+s.id+'">'+s.name+'</option>'; });
    sel.innerHTML=opts;
  }
  var filter=(sel&&sel.value)||'all';

  var snap=await db.collection('attempts').where('status','==','completed').get();
  var attempts=[];
  snap.forEach(function(d){ var a=Object.assign({id:d.id},d.data()); if(filter==='all'||a.sessionId===filter) attempts.push(a); });
  attempts.sort(function(a,b){ return (b.score||0)-(a.score||0); });
  window.__lapAttempts=attempts;

  var scores=attempts.map(function(a){return a.score||0;});
  var el;
  el=document.getElementById('repAvg'); if(el) el.textContent = scores.length?Math.round(scores.reduce(function(x,y){return x+y;},0)/scores.length):0;
  el=document.getElementById('repMax'); if(el) el.textContent = scores.length?Math.max.apply(null,scores):0;
  el=document.getElementById('repMin'); if(el) el.textContent = scores.length?Math.min.apply(null,scores):0;
  el=document.getElementById('repCount'); if(el) el.textContent = attempts.length;

  // Render ulang seluruh tabel (thead+tbody) agar kolom konsisten + ada AKSI
  var table=document.querySelector('#page-laporan .table');
  if(!table) return;

  var rows='';
  if(!attempts.length){
    rows='<tr><td colspan="8" style="text-align:center;color:#94a3b8;">Belum ada laporan</td></tr>';
  } else {
    rows=attempts.map(function(a){
      var st=S.students.find(function(s){return s.id===a.studentId;});
      var sess=S.sessions.find(function(s){return s.id===a.sessionId;});
      var sent=a.sentToParent;
      return '<tr>'+
        '<td><strong>'+a.studentId+'</strong></td>'+
        '<td>'+(st?st.name:'-')+'</td>'+
        '<td>'+(sess?sess.name:'-')+'</td>'+
        '<td><strong>'+(a.score||0)+'</strong></td>'+
        '<td>'+(a.correctAnswers||0)+'/'+(a.totalQuestions||0)+'</td>'+
        '<td>'+formatDuration(a.totalTime||0)+'</td>'+
        '<td style="font-size:.75rem;color:#64748b;">'+formatDate(a.finishedAt||a.startedAt)+'</td>'+
        '<td style="white-space:nowrap;">'+
          '<button class="btn btn-success btn-sm" onclick="sendReport(\''+a.id+'\')"><span class="material-icons">send</span>Kirim Laporan</button> '+
          '<button class="btn btn-secondary btn-sm" onclick="copyReport(\''+a.id+'\')"><span class="material-icons">content_copy</span></button>'+
        '</td></tr>';
    }).join('');
  }

  table.innerHTML =
    '<thead><tr><th>ID</th><th>Nama</th><th>Sesi</th><th>Nilai</th><th>Benar</th><th>Waktu</th><th>Tanggal</th><th>Aksi</th></tr></thead>'+
    '<tbody>'+rows+'</tbody>';
}

async function reportText(a){
  var st=S.students.find(function(s){return s.id===a.studentId;});
  var sess=S.sessions.find(function(s){return s.id===a.sessionId;});
  return '*LAPORAN HASIL TKA ENGLISH*\n\n'+
    'Nama: '+(st?st.name:a.studentId)+'\n'+
    'ID: '+a.studentId+'\n'+
    'Sesi: '+(sess?sess.name:'-')+'\n'+
    'Nilai: *'+(a.score||0)+'*\n'+
    'Benar: '+(a.correctAnswers||0)+'/'+(a.totalQuestions||0)+'\n'+
    'Waktu: '+formatDuration(a.totalTime||0)+'\n'+
    'Tanggal: '+formatDate(a.finishedAt||a.startedAt)+'\n\n'+
    'Terima kasih atas perhatian Bapak/Ibu wali murid.';
}

// Kirim per siswa: salin dulu, lalu wa.me ke nomor wali (atau pilih kontak)
async function sendReport(id){
  var a=(window.__lapAttempts||[]).find(function(x){return x.id===id;});
  if(!a) return;
  var st=S.students.find(function(s){return s.id===a.studentId;});
  var num=normalizeWA(st && st.parentWA);
  var msg=await reportText(a);
  copyTextL(msg);
  if(num){ window.open('https://wa.me/'+num+'?text='+encodeURIComponent(msg),'_blank'); toast('Teks disalin & WA wali dibuka. Tekan kirim.','success'); }
  else { window.open('https://wa.me/?text='+encodeURIComponent(msg),'_blank'); toast('WA wali belum diisi. Teks disalin - pilih kontak & paste.','warning'); }
  await db.collection('attempts').doc(id).update({ sentToParent:true }).catch(function(){});
  a.sentToParent=true;
  loadReports();
}

async function copyReport(id){
  var a=(window.__lapAttempts||[]).find(function(x){return x.id===id;});
  if(!a) return;
  copyTextL(await reportText(a));
  toast('Laporan disalin','success');
}

// Rekap -> WA Grup (tombol "Kirim WA" di header), konsep salin-dulu
async function sendReportsWA(){
  var attempts=window.__lapAttempts||[];
  if(!attempts.length){ await loadReports(); attempts=window.__lapAttempts||[]; }
  if(!attempts.length){ alert2('Info','Belum ada data laporan','warning'); return; }
  var set=await db.collection('settings').doc('global_settings').get();
  var wa=set.exists?set.data().whatsappGroupLink:'';
  var msg=buildRekap(attempts);
  openWAL(wa, msg);
}

function buildRekap(attempts){
  var scores=attempts.map(function(a){return a.score||0;});
  var msg='*REKAP LAPORAN TKA ENGLISH*\n\n'+
    'Total Peserta: '+attempts.length+'\n'+
    'Rata-rata: '+Math.round(scores.reduce(function(x,y){return x+y;},0)/scores.length)+'\n'+
    'Tertinggi: '+Math.max.apply(null,scores)+'\n'+
    'Terendah: '+Math.min.apply(null,scores)+'\n\n*Top 10:*\n';
  attempts.slice(0,10).forEach(function(a,i){
    var st=S.students.find(function(s){return s.id===a.studentId;});
    msg+=(i+1)+'. '+(st?st.name:a.studentId)+' — '+(a.score||0)+'\n';
  });
  return msg;
}

// Export CSV (tombol "Export CSV")
function exportReports(){
  var attempts=window.__lapAttempts||[];
  if(!attempts.length){ alert2('Info','Belum ada data untuk diexport','warning'); return; }
  var csv='ID,Nama,Sesi,Nilai,Benar,Total,Waktu(detik),Tanggal\n';
  attempts.forEach(function(a){
    var st=S.students.find(function(s){return s.id===a.studentId;});
    var sess=S.sessions.find(function(s){return s.id===a.sessionId;});
    csv+=a.studentId+','+(st?'"'+st.name+'"':'-')+','+(sess?'"'+sess.name+'"':'-')+','+(a.score||0)+','+(a.correctAnswers||0)+','+(a.totalQuestions||0)+','+(a.totalTime||0)+','+formatDate(a.finishedAt||a.startedAt)+'\n';
  });
  var blob=new Blob([csv],{type:'text/csv;charset=utf-8;'});
  var url=URL.createObjectURL(blob);
  var a2=document.createElement('a');
  a2.href=url; a2.download='laporan_tka_'+new Date().toISOString().split('T')[0]+'.csv';
  a2.click();
  setTimeout(function(){ URL.revokeObjectURL(url); },1000);
  toast('Export CSV berhasil','success');
}

async function generateReports(){ await sendReportsWA(); } // kompatibilitas

window.loadReports=loadReports;
window.sendReport=sendReport;
window.copyReport=copyReport;
window.sendReportsWA=sendReportsWA;
window.exportReports=exportReports;
window.generateReports=generateReports;