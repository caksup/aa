/* #18 | /root/js/pembahasan.js | v 3.1 | u 07/09/2026 • 17:55:00 | xu : ke-5 | note : #noteresponse
- FIX "teks tidak terkirim": link grup WA tidak mendukung prefill text.
  Kini teks selalu disalin ke clipboard; openWA() memilih mode:
  * chat.whatsapp.com (grup) -> buka grup + paste manual (teks sudah tersalin)
  * wa.me / api.whatsapp -> prefill ?text=
- Tetap: list sesi collapsable, tabel soal/kunci/review/pembahasan, edit per baris. */

var PEMB = { selected: null, loaded: {} };

function keyText(q){
  if(q.type==='PGS')  return String(q.correctAnswer);
  if(q.type==='MCMA') return (q.correctAnswer||[]).join(', ');
  if(q.type==='PGK') {
    var answers = window.parseBooleanAnswerList ? window.parseBooleanAnswerList(q.correctAnswer) : q.correctAnswer;
    return (answers||[]).map(function(x){return x?'B':'S';}).join(', ');
  }
  if(q.type==='ISIAN')return String(q.correctAnswer);
  return '-';
}
function escP(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function isCorrectP(q,a){
  if(q.type==='PGS')  return (a===q.correctAnswer);
  if(q.type==='MCMA') return JSON.stringify((a||[]).slice().sort())===JSON.stringify((q.correctAnswer||[]).slice().sort());
  if(q.type==='PGK') {
    var expected = window.parseBooleanAnswerList ? window.parseBooleanAnswerList(q.correctAnswer) : q.correctAnswer;
    var actual = window.parseBooleanAnswerList ? window.parseBooleanAnswerList(a) : a;
    return Array.isArray(actual) && Array.isArray(expected) && actual.length === expected.length &&
      actual.every(function(value,index){ return value === expected[index]; });
  }
  if(q.type==='ISIAN')return String(a||'').toLowerCase().trim()===String(q.correctAnswer||'').toLowerCase().trim();
  return false;
}

function copyText(t){
  if(navigator.clipboard && navigator.clipboard.writeText){ navigator.clipboard.writeText(t).catch(function(){}); }
  else { var ta=document.createElement('textarea'); ta.value=t; ta.style.cssText='position:fixed;opacity:0;'; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); }
}

function openWA(link, msg){
  copyText(msg); // selalu salin dulu
  if(!link){ window.open('https://wa.me/?text='+encodeURIComponent(msg),'_blank'); toast('Teks disalin & WA dibuka. Tempel di chat.','success'); return; }
  if(link.indexOf('chat.whatsapp.com')>-1){
    window.open(link,'_blank');
    toast('Teks pembahasan DISALIN. Buka grup lalu tempel (paste).','success');
  } else {
    var sep = link.indexOf('?')>-1 ? '&' : '?';
    window.open(link+sep+'text='+encodeURIComponent(msg),'_blank');
    toast('WA dibuka dengan teks. Tekan kirim di WA.','success');
  }
}

async function loadPembDropdown(){ await loadPembahasan(); }

async function loadPembahasan(){
  var page=document.getElementById('page-pembahasan');
  var dd=page.querySelector('.card'); if(dd) dd.style.display='none';
  var btn=page.querySelector('.btn-success');
  if(btn){ btn.id='btnSendWA'; btn.disabled=true; }

  if(!S.sessions.length) await loadSessionsDropdown();
  var c=document.getElementById('pembContent');
  if(!S.sessions.length){ c.innerHTML='<div class="empty-state"><span class="material-icons">event_busy</span><p>Belum ada sesi</p></div>'; return; }

  PEMB.selected=null; PEMB.loaded={};
  var html='';
  S.sessions.forEach(function(s){
    html+='<div class="card" style="margin-bottom:.75rem;">'+
      '<div class="card-header" style="display:flex;align-items:center;gap:.625rem;cursor:pointer;" onclick="togglePemb(\''+s.id+'\')">'+
        '<input type="radio" name="pembSesi" value="'+s.id+'" style="accent-color:#2563eb;width:18px;height:18px;flex-shrink:0;" onchange="selectPemb(\''+s.id+'\')" onclick="event.stopPropagation()">'+
        '<div class="card-title" style="flex:1;"><span class="material-icons">event_available</span>'+escP(s.name)+'</div>'+
        '<span class="material-icons" id="chev_'+s.id+'">expand_more</span>'+
      '</div>'+
      '<div class="card-body" id="pembBody_'+s.id+'" style="display:none;"></div>'+
    '</div>';
  });
  c.innerHTML=html;
}

window.selectPemb=function(id){
  PEMB.selected=id;
  var btn=document.getElementById('btnSendWA'); if(btn) btn.disabled=false;
};

window.togglePemb=async function(id){
  var body=document.getElementById('pembBody_'+id);
  var chev=document.getElementById('chev_'+id);
  if(!body) return;
  if(body.style.display==='none'){
    body.style.display='block';
    if(chev) chev.textContent='expand_less';
    if(!PEMB.loaded[id]) await renderPembTable(id);
  } else {
    body.style.display='none';
    if(chev) chev.textContent='expand_more';
  }
};

async function renderPembTable(id){
  var body=document.getElementById('pembBody_'+id);
  body.innerHTML='<div class="empty-state"><span class="spinner"></span><p>Memuat...</p></div>';
  try{
    var snap=await db.collection('questions').where('sessionId','==',id).get();
    var qs=[]; snap.forEach(function(d){ qs.push(Object.assign({id:d.id},d.data())); });
    qs.sort(function(a,b){return (a.order||0)-(b.order||0);});

    var aSnap=await db.collection('attempts').where('sessionId','==',id).where('status','==','completed').get();
    var attempts=[]; aSnap.forEach(function(d){ attempts.push(d.data()); });

    if(!qs.length){ body.innerHTML='<div class="empty-state"><span class="material-icons">quiz</span><p>Belum ada soal di sesi ini</p></div>'; PEMB.loaded[id]=true; return; }

    var labels={PGS:'PG',MCMA:'Kompleks',PGK:'T/F',ISIAN:'Isian'};
    var html='<div class="table-wrapper"><table class="table"><thead><tr>'+
      '<th>#</th><th>Soal</th><th>Tipe</th><th>Kunci</th><th>Review</th><th>Pembahasan</th><th></th>'+
      '</tr></thead><tbody>';
    qs.forEach(function(q,i){
      var benar=0; attempts.forEach(function(a){ if(isCorrectP(q, a.answers&&a.answers[q.id])) benar++; });
      html+='<tr><td>'+(i+1)+'</td>'+
        '<td style="max-width:260px;font-size:.8125rem;">'+escP(q.text||'')+'</td>'+
        '<td><span class="question-type-badge '+q.type.toLowerCase()+'">'+(labels[q.type]||q.type)+'</span></td>'+
        '<td><strong>'+keyText(q)+'</strong></td>'+
        '<td style="font-size:.75rem;color:#64748b;">'+(attempts.length?benar+'/'+attempts.length:'-')+'</td>'+
        '<td style="max-width:220px;font-size:.8125rem;">'+escP(q.explanation||'-')+'</td>'+
        '<td><button class="btn btn-secondary btn-sm" onclick="editPemb(\''+q.id+'\')"><span class="material-icons">edit</span></button></td></tr>';
    });
    html+='</tbody></table></div>';
    body.innerHTML=html;
    PEMB.loaded[id]=true;
  }catch(e){ body.innerHTML='<div class="empty-state"><span class="material-icons">error</span><p>'+e.message+'</p></div>'; }
}

window.editPemb=function(id){
  db.collection('questions').doc(id).get().then(function(d){
    if(!d.exists) return;
    var q=d.data();
    M.custom({
      title:'Edit Pembahasan',
      message:'<div class="form-group"><label class="form-label">Pembahasan</label>'+
        '<textarea class="form-control" id="editPembTa" rows="4">'+(q.explanation||'')+'</textarea></div>',
      type:'info',
      buttons:[
        {text:'Batal',class:'btn-secondary'},
        {text:'Simpan',class:'btn-primary',action:function(){
          var v=document.getElementById('editPembTa').value.trim();
          db.collection('questions').doc(id).update({explanation:v}).then(function(){
            toast('Pembahasan disimpan','success');
            var sid=q.sessionId;
            if(sid){ PEMB.loaded[sid]=false;
              var body=document.getElementById('pembBody_'+sid);
              if(body && body.style.display!=='none') renderPembTable(sid);
            }
          });
        }}
      ]
    });
  });
};

async function sendWA(){
  var sid=PEMB.selected;
  if(!sid){ alert2('Error','Pilih salah satu sesi dulu (klik radio di daftar sesi)','error'); return; }
  var set=await db.collection('settings').doc('global_settings').get();
  var wa=set.exists?set.data().whatsappGroupLink:'';

  var snap=await db.collection('questions').where('sessionId','==',sid).get();
  var qs=[]; snap.forEach(function(d){ qs.push(Object.assign({id:d.id},d.data())); });
  qs.sort(function(a,b){return (a.order||0)-(b.order||0);});
  var sess=S.sessions.find(function(s){return s.id===sid;});

  var msg='*PEMBAHASAN TKA ENGLISH*\n*Sesi:* '+(sess?sess.name:'-')+'\n\n';
  qs.forEach(function(q,i){
    msg+='*Soal '+(i+1)+'*\n'+(q.text||'')+'\n*Kunci:* '+keyText(q)+'\n*Pembahasan:*\n'+(q.explanation||'-')+'\n\n';
  });

  openWA(wa, msg);
}

window.savePemb=function(id){ editPemb(id); };
window.loadPembDropdown=loadPembDropdown;
window.loadPembahasan=loadPembahasan;
window.sendWA=sendWA;