/* a#13 | /root/js/m-sesi-modal.js | v 1.3 | u 17/10/2026 • 17:00:00 | xu : ke-4 | note : #noteresponse
- v1.2 -> v1.3:
  * Jangan kirim FieldValue.delete() saat membuat sesi baru; Firestore hanya
    mengizinkan sentinel tersebut pada update/merge, bukan add().
- v1.1 -> v1.2:
  * Sesi dapat dibuat tanpa assignment siswa; siswa bisa ditambahkan nanti.
  * Batch/ruang menerima input baru selain pilihan yang sudah tersimpan.
  * Error pemuatan/penyimpanan sesi ditampilkan kepada pengguna.
- v1.0 -> v1.1 (UPDATE: durasi per soal untuk mode Realtime):
  * TAMBAH field "Durasi per soal (detik)" di section Mode Sesi, HANYA tampil saat
    mode = 'realtime'. Default 30 detik, range 10-120 detik (slider + input number
    untuk presisi).
  * Simpan ke field `questionDurationSec` (integer). Sesi mode live/homework tidak
    menyimpan field ini (default fallback 30 di host & siswa).
  * TAMBAH handler `onModeChange(mode)` yang toggle visibility field durasi realtime.
    Dipanggil dari onchange select mode.
  * UI: field durasi realtime muncul sebagai sub-group dalam card mode, dengan
    slider dan angka, hint "Semakin singkat = permainan lebih cepat & kompetitif".
- TETAP IDENTIK: batch inference, proteksi attempt, sumber soal (manual/bank/filter),
  union batch dari sesi+siswa, materialize bank questions.
- DEPENDENSI: escS, autoCode, ensureUniqueCode, loadSessions, __sessAttemptCount,
  openBankPicker, materializeBankQuestions, db, firebase, S, M, alert2, toast, loading.
- EXPOSE: window.openSessionModal, window.saveSession, window.assignAll,
  window.onSourceChange, window.onSourceFilter, window.onModeChange. */

window.__sessSelectedBankIds = [];
window.__sessSourceFilter = { subject:'', skill:'', level:'', tags:'', folderId:'', count:20 };

function inferBatchFromStudents(assignedIds){
  if (!assignedIds || !assignedIds.length) return null;
  var count = {};
  assignedIds.forEach(function(sid){
    var st = (S.students||[]).find(function(x){ return x.id === sid; });
    if (st && st.batch) {
      var b = String(st.batch).trim();
      if (b) count[b] = (count[b]||0) + 1;
    }
  });
  var best = null, bestN = 0;
  Object.keys(count).forEach(function(b){
    if (count[b] > bestN) { bestN = count[b]; best = b; }
  });
  return best ? { batch: best, count: bestN } : null;
}

async function openSessionModal(id, presetMode){
  var s = id ? S.sessions.find(function(x){ return x.id===id; }) : null;
  var hasAttempts = id && (window.__sessAttemptCount[id]||0) > 0;
  var studentsLoadError = null;

  var startVal='', endVal='';
  if(s&&s.startTime){ try{ startVal = s.startTime.toDate ? s.startTime.toDate().toISOString().slice(0,16) : new Date(s.startTime).toISOString().slice(0,16); }catch(e){} }
  if(s&&s.endTime){ try{ endVal = s.endTime.toDate ? s.endTime.toDate().toISOString().slice(0,16) : new Date(s.endTime).toISOString().slice(0,16); }catch(e){} }

  if(!S.students||!S.students.length){
    try {
      var stSnap=await db.collection('students').get();
      S.students=[]; stSnap.forEach(function(d){ S.students.push(Object.assign({id:d.id},d.data())); });
    } catch(error) {
      studentsLoadError = error;
      console.error('[m-sesi-modal] Gagal memuat daftar siswa:', error);
      if (id) {
        alert2('Gagal memuat siswa', 'Daftar siswa tidak dapat dimuat, jadi sesi tidak dibuka agar assignment yang sudah ada tidak berubah. ' + escS(error.message || ''), 'error');
        return;
      }
    }
  }
  S.students.sort(function(a,b){ return (a.id<b.id?-1:1); });
  var assignedNow = (s&&s.assignedStudents)||[];
  var rows = S.students.map(function(st){
    var chk = assignedNow.indexOf(st.id) !== -1;
    return '<label class="checkbox-wrapper" style="padding:.25rem 0;"><input type="checkbox" class="assign-chk" value="'+escS(st.id)+'" '+(chk?'checked':'')+'>'+escS(st.name)+' ('+escS(st.id)+')</label>';
  }).join('');
  if (!rows) {
    rows = studentsLoadError
      ? '<div style="color:#92400e;">Daftar siswa gagal dimuat. Sesi tetap dapat dibuat tanpa assignment. ' + escS(studentsLoadError.message || '') + '</div>'
      : '<div style="color:#64748b;">Belum ada siswa. Sesi tetap dapat dibuat dan siswa bisa ditambahkan nanti.</div>';
  }

  var curMode = (s && s.mode) ? s.mode : (presetMode || 'live');
  var curRetry = (s && s.retryMode) ? s.retryMode : 'once';
  var curAnti = s ? (s.antiCheat !== false) : true;
  var curActive = s ? !!s.status : presetMode === 'assessment';
  var curVisible = s ? !!s.visible : presetMode === 'assessment';
  var curSource = (s && s.sourceType) ? s.sourceType : 'manual';
  var curBatch = (s && s.batch) ? String(s.batch).trim() : '';
  var curQDur = (s && s.questionDurationSec) ? parseInt(s.questionDurationSec) : 30;

  var inferred = null;
  if (!curBatch && assignedNow.length) {
    inferred = inferBatchFromStudents(assignedNow);
    if (inferred) curBatch = inferred.batch;
  }

  var batchSet = {};
  (S.sessions||[]).forEach(function(x){
    var b = (x.batch && String(x.batch).trim());
    if (b) batchSet[b] = 1;
  });
  (S.students||[]).forEach(function(st){
    if (st.batch) {
      var b = String(st.batch).trim();
      if (b) batchSet[b] = 1;
    }
  });
  var batchList = Object.keys(batchSet).sort(function(a,b){
    var na = parseInt(a,10), nb = parseInt(b,10);
    if (!isNaN(na) && !isNaN(nb) && na !== nb) return na - nb;
    return a < b ? -1 : (a > b ? 1 : 0);
  });
  var batchHint = inferred
    ? '<small style="color:#047857;">Batch disarankan otomatis dari mayoritas siswa assigned ('+inferred.count+' siswa batch '+escS(inferred.batch)+'). Bisa diganti manual.</small>'
    : '<small style="color:#64748b;">Sesi lama tanpa batch akan masuk "Tanpa Batch". Isi batch lalu Simpan untuk mengelompokkan.</small>';

  var sourceLockedNotice = hasAttempts
    ? '<div style="background:#fef3c7;padding:.75rem;border-radius:6px;margin-bottom:.75rem;font-size:.8125rem;color:#92400e;border-left:3px solid #f59e0b;">' +
        '<b>⚠ Sesi ini sudah memiliki ' + window.__sessAttemptCount[id] + ' attempt.</b> Sumber soal dikunci agar riwayat siswa tidak rusak.' +
      '</div>'
    : '';

  var sourceEditInfo = (!hasAttempts && id)
    ? '<div style="padding:.5rem .75rem;background:#f1f5f9;border-radius:6px;font-size:.8125rem;color:#475569;">Sumber soal: <b>' +
        (curSource==='bank'?'Pilih dari Bank Soal':curSource==='filter'?'Auto dari Bank (filter)':'Manual') +
      '</b> <span style="color:#94a3b8;">(tidak dapat diubah saat edit agar data lama aman)</span></div>'
    : '';

  var content =
    '<input type="hidden" id="sessId" value="'+(id||'')+'">'+
    '<div class="form-group"><label class="form-label">Nama Sesi</label><input type="text" class="form-control" id="sessName" value="'+escS(s?s.name:'')+'" required></div>'+
    '<div class="form-group"><label class="form-label">Batch / Ruang</label>' +
      '<input type="text" class="form-control" id="sessBatch" list="batchDatalist" value="'+escS(curBatch)+'" placeholder="Pilih atau ketik batch/ruang">' +
      '<datalist id="batchDatalist">'+batchList.map(function(b){return '<option value="'+escS(b)+'">';}).join('')+'</datalist>' +
      batchHint +
    '</div>'+
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:.5rem;">'+
      '<div class="form-group"><label class="form-label">Mode Sesi</label>' +
        '<select class="form-control" id="sessMode" onchange="onModeChange(this.value)">' +
          '<option value="live"' + (curMode==='live'?' selected':'') + '>Live Exercise (di kelas)</option>' +
          '<option value="homework"' + (curMode==='homework'?' selected':'') + '>Homework / PR (di rumah)</option>' +
          '<option value="realtime"' + (curMode==='realtime'?' selected':'') + '>Realtime Live (host-led)</option>' +
          '<option value="assessment"' + (curMode==='assessment'?' selected':'') + '>Asesmen (Ulangan)</option>' +
        '</select></div>' +
      '<div class="form-group"><label class="form-label">Mode Retry (khusus PR)</label>' +
        '<select class="form-control" id="sessRetryMode">' +
          '<option value="once"' + (curRetry!=='conditional'?' selected':'') + '>Sekali saja (A)</option>' +
          '<option value="conditional"' + (curRetry==='conditional'?' selected':'') + '>Conditional 2x (D)</option>' +
        '</select>' +
        '<small style="color:#64748b;">Retry jika nilai &lt;50 atau benar &lt;setengah.</small></div>' +
    '</div>'+
    // ====== UPDATE v1.1: Durasi per soal (khusus Realtime) ======
    '<div id="rtDurGroup" class="form-group" style="display:'+(curMode==='realtime'?'block':'none')+';">' +
      '<label class="form-label" style="display:flex;align-items:center;gap:.375rem;">' +
        '<span class="material-icons" style="font-size:16px;color:#7c3aed;">timer</span>Durasi per soal (detik)' +
      '</label>' +
      '<div style="display:flex;gap:.75rem;align-items:center;">' +
        '<input type="range" id="sessQDurRange" min="10" max="120" step="5" value="'+curQDur+'" style="flex:1;" oninput="document.getElementById(\'sessQDurNum\').value=this.value">' +
        '<input type="number" class="form-control" id="sessQDurNum" value="'+curQDur+'" min="10" max="120" style="width:5rem;text-align:center;" oninput="document.getElementById(\'sessQDurRange\').value=this.value">' +
        '<span style="color:#64748b;font-size:.75rem;">dtk</span>' +
      '</div>' +
      '<small style="color:#64748b;">Semakin singkat = permainan lebih cepat &amp; kompetitif. Default 30 dtk.</small>' +
    '</div>'+
    '<div class="form-group"><label class="form-label">Kode Sesi (opsional)</label>'+
      '<input type="text" class="form-control" id="sessCode" value="'+escS(s?s.code:'')+'" placeholder="kosongkan = dibuat otomatis">'+
      '<small style="color:#64748b;">Link siswa: sp.html?jec-sim-tka=&lt;kode&gt;</small></div>'+
    '<div class="form-group"><label class="form-label">Deskripsi</label><textarea class="form-control" id="sessDesc" rows="2">'+escS(s?s.description:'')+'</textarea></div>'+
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:.5rem;">'+
      '<div class="form-group"><label class="form-label">Mulai</label><input type="datetime-local" class="form-control" id="sessStart" value="'+startVal+'"></div>'+
      '<div class="form-group"><label class="form-label">Selesai / Deadline</label><input type="datetime-local" class="form-control" id="sessEnd" value="'+endVal+'"></div>'+
    '</div>'+
    '<div class="form-group"><label class="form-label">Durasi total (menit)</label><input type="number" class="form-control" id="sessDur" value="'+(s?s.duration||60:60)+'"></div>'+
    '<div class="form-group"><label class="form-label">Assign Siswa (opsional, bisa ditambahkan nanti)</label>'+
      '<div style="display:flex;gap:.5rem;margin-bottom:.5rem;">'+
        '<button type="button" class="btn btn-secondary btn-sm" onclick="assignAll(true)">Pilih Semua</button>'+
        '<button type="button" class="btn btn-secondary btn-sm" onclick="assignAll(false)">Kosongkan</button>'+
      '</div>'+
      '<div id="assignBox" style="max-height:180px;overflow-y:auto;border:1px solid #e2e8f0;border-radius:8px;padding:.5rem;">'+rows+'</div>'+
    '</div>'+
    '<div class="form-group"><label class="form-label">Status</label><div style="display:flex;gap:1rem;align-items:center;flex-wrap:wrap;">'+
      '<label class="checkbox-wrapper"><input type="checkbox" id="sessActive" '+(curActive?'checked':'')+'>Aktif</label>'+
      '<label class="checkbox-wrapper"><input type="checkbox" id="sessVisible" '+(curVisible?'checked':'')+'>Visible</label>'+
      '<label class="checkbox-wrapper"><input type="checkbox" id="sessAntiCheat" '+((curAnti)?'checked':'')+'>Anti-Cheat</label>'+
    '</div></div>'+
    sourceLockedNotice +
    '<hr style="margin:1rem 0;border:none;border-top:1px solid #e2e8f0;">' +
    '<div class="form-group">' +
      '<label class="form-label" style="display:flex;align-items:center;gap:.375rem;font-weight:700;"><span class="material-icons" style="font-size:18px;color:#10b981;">quiz</span>Sumber Soal</label>' +
      (hasAttempts
        ? '<div style="padding:.5rem .75rem;background:#f1f5f9;border-radius:6px;font-size:.8125rem;color:#475569;">Sumber: <b>' + (curSource==='bank'?'Pilih dari Bank Soal':curSource==='filter'?'Auto dari Bank (filter)':'Manual') + '</b></div>'
        : (id
            ? sourceEditInfo
            : '<div style="display:flex;flex-direction:column;gap:.5rem;">' +
                '<label class="checkbox-wrapper"><input type="radio" name="sessSource" value="manual" checked onchange="onSourceChange(\'manual\')"> Manual — input soal nanti di menu Manage Soal</label>' +
                '<label class="checkbox-wrapper"><input type="radio" name="sessSource" value="bank" onchange="onSourceChange(\'bank\')"> Ambil dari Bank Soal — pilih manual (centang soal)</label>' +
                '<label class="checkbox-wrapper"><input type="radio" name="sessSource" value="filter" onchange="onSourceChange(\'filter\')"> Auto dari Bank — generate by filter</label>' +
              '</div>')) +
      '<div id="sessSourcePanel" style="margin-top:.5rem;"></div>' +
    '</div>';

  M.custom({
    title:(id?'Edit':'Tambah')+' Sesi',
    message:content, type:'info',
    buttons:[
      {text:'Batal',class:'btn-secondary'},
      {text:'Simpan',class:'btn-primary',action:function(){ saveSession(); }}
    ]
  });

  if (!id) {
    window.__sessSelectedBankIds = [];
    window.__sessSourceFilter = { subject:'', skill:'', level:'', tags:'', folderId:'', count:20 };
    renderSourcePanel('manual');
  }
}
window.openSessionModal = openSessionModal;

// ============================================
// HANDLERS
// ============================================
window.assignAll = function(v){
  document.querySelectorAll('.assign-chk').forEach(function(cb){ cb.checked = v; });
};

// UPDATE v1.1: toggle durasi realtime berdasarkan mode
window.onModeChange = function(mode){
  var durGroup = document.getElementById('rtDurGroup');
  if (durGroup) durGroup.style.display = (mode === 'realtime') ? 'block' : 'none';
};

window.onSourceChange = function(type){
  renderSourcePanel(type);
};

function renderSourcePanel(type){
  var panel = document.getElementById('sessSourcePanel');
  if (!panel) return;

  if (type === 'manual') {
    panel.innerHTML = '<div style="font-size:.8125rem;color:#64748b;padding:.5rem;background:#f8fafc;border-radius:6px;">Simpan sesi dulu, lalu tambahkan soal di menu <b>Manage Soal → Daftar Soal</b> dengan filter sesi ini.</div>';
    return;
  }

  if (type === 'bank') {
    panel.innerHTML =
      '<div style="background:#ecfdf5;padding:.75rem;border-radius:8px;border:1px solid #10b981;">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.5rem;">' +
          '<div><b>Pilih Soal dari Bank</b></div>' +
          '<button type="button" class="btn btn-primary btn-sm" onclick="openBankPicker()"><span class="material-icons" style="font-size:14px;">inventory_2</span> Buka Bank Soal</button>' +
        '</div>' +
        '<div id="bankPickerSummary" style="font-size:.8125rem;color:#065f46;">Belum ada soal dipilih.</div>' +
      '</div>';
    updateBankPickerSummary();
    return;
  }

  if (type === 'filter') {
    var f = window.__sessSourceFilter || { subject:'', skill:'', level:'', tags:'', folderId:'', count:20 };
    var subjectOpts = (window.BANK_SUBJECTS||['Bahasa Inggris','Matematika','IPA','Bahasa Indonesia','IPS','PPKn','Umum']).map(function(x){ return '<option value="'+escS(x)+'"'+(x===f.subject?' selected':'')+'>'+escS(x)+'</option>'; }).join('');
    var skillOpts = (window.BANK_SKILLS||['Grammar','Vocabulary','Reading','Listening','Writing','Speaking','Aljabar','Geometri','Statistika','Umum']).map(function(x){ return '<option value="'+escS(x)+'"'+(x===f.skill?' selected':'')+'>'+escS(x)+'</option>'; }).join('');
    var levelOpts = ['Mudah','Sedang','Sulit'].map(function(x){ return '<option value="'+escS(x)+'"'+(x===f.level?' selected':'')+'>'+escS(x)+'</option>'; }).join('');

    panel.innerHTML =
      '<div style="background:#eff6ff;padding:.75rem;border-radius:8px;border:1px solid #2563eb;">' +
        '<div style="font-weight:700;margin-bottom:.5rem;">Auto-generate dari Bank Soal</div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:.5rem;">' +
          '<div class="form-group" style="margin:0;"><label class="form-label" style="font-size:.75rem;">Mapel</label><select class="form-control" id="sfSubject" onchange="onSourceFilter(\'subject\',this.value)"><option value="">Semua</option>'+subjectOpts+'</select></div>' +
          '<div class="form-group" style="margin:0;"><label class="form-label" style="font-size:.75rem;">Skill</label><select class="form-control" id="sfSkill" onchange="onSourceFilter(\'skill\',this.value)"><option value="">Semua</option>'+skillOpts+'</select></div>' +
          '<div class="form-group" style="margin:0;"><label class="form-label" style="font-size:.75rem;">Level</label><select class="form-control" id="sfLevel" onchange="onSourceFilter(\'level\',this.value)"><option value="">Semua</option>'+levelOpts+'</select></div>' +
          '<div class="form-group" style="margin:0;"><label class="form-label" style="font-size:.75rem;">Jumlah Soal</label><input type="number" class="form-control" id="sfCount" value="'+(f.count||20)+'" min="1" max="100" onchange="onSourceFilter(\'count\',this.value)"></div>' +
          '<div class="form-group" style="margin:0;grid-column:1/-1;"><label class="form-label" style="font-size:.75rem;">Tag (pisahkan koma)</label><input type="text" class="form-control" id="sfTags" value="'+escS(f.tags||'')+'" placeholder="misal: tenses,kelas-8" onchange="onSourceFilter(\'tags\',this.value)"></div>' +
        '</div>' +
        '<button type="button" class="btn btn-secondary btn-sm" style="margin-top:.5rem;" onclick="previewFilterPreview()"><span class="material-icons" style="font-size:14px;">preview</span> Preview Soal yang Akan Diambil</button>' +
        '<div id="sfPreview" style="margin-top:.5rem;font-size:.8125rem;color:#1e40af;"></div>' +
      '</div>';
  }
}

window.onSourceFilter = function(key, val){
  window.__sessSourceFilter = window.__sessSourceFilter || {};
  if (key === 'count') val = parseInt(val) || 20;
  window.__sessSourceFilter[key] = val;
};

function updateBankPickerSummary(){
  var el = document.getElementById('bankPickerSummary');
  if (!el) return;
  var ids = window.__sessSelectedBankIds || [];
  if (!ids.length) { el.textContent = 'Belum ada soal dipilih.'; return; }
  el.innerHTML = '<b>' + ids.length + ' soal</b> dipilih dari Bank Soal. Akan di-snapshot saat simpan sesi.';
}
window.__updateBankPickerSummary = updateBankPickerSummary;

window.previewFilterPreview = async function(){
  if (!window.__bank || !window.__bank.items || !window.__bank.items.length) {
    try {
      var bankSnap = await db.collection('questionBank').get();
      window.__bank = window.__bank || { items: [] };
      window.__bank.items = [];
      bankSnap.forEach(function(d){
        var data = d.data();
        if (data.deleted !== true) window.__bank.items.push(Object.assign({id:d.id}, data));
      });
    } catch(e){}
  }
  var f = window.__sessSourceFilter || {};
  var tagArr = (f.tags||'').split(',').map(function(t){return t.trim();}).filter(Boolean);
  var matched = (window.__bank.items||[]).filter(function(it){
    if (it.status && it.status !== 'active') return false;
    if (f.subject && it.subject !== f.subject) return false;
    if (f.skill && it.skill !== f.skill) return false;
    if (f.level && it.level !== f.level) return false;
    if (tagArr.length) { for (var i=0;i<tagArr.length;i++){ if (!(it.tags||[]).includes(tagArr[i])) return false; } }
    return true;
  });
  var el = document.getElementById('sfPreview');
  if (!el) return;
  if (!matched.length) { el.innerHTML = '<span style="color:#dc2626;">⚠ Tidak ada soal yang cocok dengan filter.</span>'; return; }
  el.innerHTML = '✓ <b>' + matched.length + '</b> soal cocok. Akan diambil ' + Math.min(f.count||20, matched.length) + ' secara random saat simpan sesi.';
};

// ============================================
// SAVE SESSION (UPDATE v1.1: simpan questionDurationSec bila mode realtime)
// ============================================
async function saveSession(){
  try {
  var id = document.getElementById('sessId').value;
  var name = document.getElementById('sessName').value.trim();
  var code = document.getElementById('sessCode').value.trim().toLowerCase().replace(/\s+/g,'-');
  var startV = document.getElementById('sessStart').value;
  var endV = document.getElementById('sessEnd').value;
  var mode = document.getElementById('sessMode').value;
  var retryMode = document.getElementById('sessRetryMode').value;
  var batchV = (document.getElementById('sessBatch').value||'').trim();
  if(!name){ alert2('Error','Nama sesi wajib diisi','error'); return; }

  var assigned = Array.from(document.querySelectorAll('.assign-chk:checked')).map(function(cb){ return cb.value; });

  if(code){ if(!(await ensureUniqueCode(code,id))){ alert2('Error','Kode "'+code+'" sudah dipakai sesi lain','error'); return; } }
  else { code = await autoCode(name,id); }

  var data = {
    name:name, code:code,
    batch: batchV || null,
    mode:mode,
    retryMode:(mode==='homework') ? retryMode : 'once',
    description:document.getElementById('sessDesc').value.trim(),
    startTime:startV?new Date(startV).toISOString():null,
    endTime:endV?new Date(endV).toISOString():null,
    duration:parseInt(document.getElementById('sessDur').value)||60,
    status:document.getElementById('sessActive').checked,
    visible:document.getElementById('sessVisible').checked,
    antiCheat:document.getElementById('sessAntiCheat').checked,
    assignedStudents:assigned,
    updatedAt:firebase.firestore.FieldValue.serverTimestamp()
  };

  // UPDATE v1.1: simpan durasi per soal bila mode realtime
  if (mode === 'realtime') {
    var qDur = parseInt(document.getElementById('sessQDurNum').value) || 30;
    qDur = Math.max(10, Math.min(120, qDur));
    data.questionDurationSec = qDur;
  } else if (id) {
    data.questionDurationSec = firebase.firestore.FieldValue.delete();
  }

  if (!id) {
    var sourceRadio = document.querySelector('input[name="sessSource"]:checked');
    var sourceType = sourceRadio ? sourceRadio.value : 'manual';
    data.sourceType = sourceType;

    if (sourceType === 'bank') {
      var ids = window.__sessSelectedBankIds || [];
      if (!ids.length) { alert2('Error','Pilih minimal 1 soal dari Bank Soal, atau pilih sumber "Manual"','error'); return; }
      var refs = [];
      var items = (window.__bank && window.__bank.items) || [];
      ids.forEach(function(bid){
        var it = items.find(function(x){return x.id===bid;});
        if (it) refs.push({ bankId: it.id, bankVersion: it.version || 1 });
      });
      data.questionRefs = refs;
    } else if (sourceType === 'filter') {
      data.questionFilter = window.__sessSourceFilter || {};
    } else {
      data.sourceType = 'manual';
    }
    data.locked = false;
    data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
  }

  var sessionId = id;
  if(id){ await db.collection('sessions').doc(id).update(data); }
  else { var ref = await db.collection('sessions').add(data); sessionId = ref.id; }

  if (!id && (data.sourceType === 'bank' || data.sourceType === 'filter')) {
    if (typeof window.materializeBankQuestions === 'function') {
      await window.materializeBankQuestions(sessionId, data.sourceType, data);
    } else {
      console.warn('[m-sesi-modal] materializeBankQuestions belum siap, soal belum dibuat.');
    }
  }

  toast('Sesi disimpan ('+(mode==='homework'?'PR':mode==='realtime'?'Realtime':mode==='assessment'?'Asesmen':'Live')+', kode: '+code+', '+assigned.length+' siswa)','success');
  if (typeof window.loadSessions === 'function') window.loadSessions();
  } catch(error) {
    console.error('[m-sesi-modal] Gagal menyimpan sesi:', error);
    alert2('Gagal menyimpan sesi', escS(error.message || 'Terjadi kesalahan saat menyimpan sesi.'), 'error');
  }
}
window.saveSession = saveSession;

console.log('✅ m-sesi-modal.js v1.3 loaded (input sesi fleksibel)');