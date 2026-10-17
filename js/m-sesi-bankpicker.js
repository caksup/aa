/* a#10 | /root/js/m-sesi-bankpicker.js | v 1.0 | u 13/09/2026 • 09:40:00 | xu : ke-1 | note : #noteresponse
- FILE BARU (Opsi B): sub-module pemilih soal dari Bank Soal + materialisasi snapshot
  soal ke koleksi `questions` saat sesi baru dibuat. Dipisah dari manage-sesi.js
  agar orchestrator ramping. Dipanggil oleh m-sesi-modal.js (a#13) saat user memilih
  sumber soal "Ambil dari Bank Soal" atau "Auto dari Bank (filter)" lalu Simpan.
- TANGGUNG JAWAB:
  * window.openBankPicker()       — modal centang soal dari bank + search
  * window.materializeBankQuestions(sessionId, sourceType, sessData)
                                  — copy snapshot soal dari bank ke collection questions
  * window.previewFilterPreview() — preview jumlah soal yang cocok dengan filter
  * window.__bank = { items: [], folders: [] } — cache bank soal
- STATE:
  * window.__bank.items  — array soal dari collection questionBank (exclude deleted)
  * window.__bank.folders — array folder dari collection questionFolders
  * window.__sessSelectedBankIds — array id soal yang dipilih user (diisi oleh modal)
  * window.__sessSourceFilter — filter untuk auto-generate (subject/skill/level/tags/count)
- KONSTANTA (ensure, fallback bila manage-soal.js belum load):
  * window.BANK_SUBJECTS, window.BANK_SKILLS, window.BANK_LEVELS
- DEPENDENSI global: db, firebase, M (modal), alert2, toast.
- DEPENDENSI window.* dari manage-sesi.js v6.0: escS.
- EXPOSE: window.openBankPicker, window.materializeBankQuestions,
  window.previewFilterPreview, window.filterBankPicker, window.bpSelectAll,
  window.confirmBankPicker, window.__bank, window.__sessSelectedBankIds,
  window.__sessSourceFilter. */

// ============================================
// KONSTANTA (fallback bila manage-soal.js belum load)
// ============================================
window.BANK_SUBJECTS = window.BANK_SUBJECTS || ['Bahasa Inggris','Matematika','IPA','Bahasa Indonesia','IPS','PPKn','Umum'];
window.BANK_SKILLS   = window.BANK_SKILLS   || ['Grammar','Vocabulary','Reading','Listening','Writing','Speaking','Aljabar','Geometri','Statistika','Umum'];
window.BANK_LEVELS   = window.BANK_LEVELS   || ['Mudah','Sedang','Sulit'];

// ============================================
// STATE
// ============================================
window.__bank = window.__bank || { items: [], folders: [] };
window.__sessSelectedBankIds = window.__sessSelectedBankIds || [];
window.__sessSourceFilter = window.__sessSourceFilter || { subject:'', skill:'', level:'', tags:'', folderId:'', count:20 };

// ============================================
// HELPER: load bank dari Firestore
// ============================================
async function ensureBankLoaded(){
  if (window.__bank && window.__bank.items && window.__bank.items.length) return;
  try {
    var bankSnap = await db.collection('questionBank').get();
    window.__bank.items = [];
    bankSnap.forEach(function(d){
      var data = d.data();
      if (data.deleted !== true) window.__bank.items.push(Object.assign({id:d.id}, data));
    });
    var folderSnap = await db.collection('questionFolders').get();
    window.__bank.folders = [];
    folderSnap.forEach(function(d){ window.__bank.folders.push(Object.assign({id:d.id}, d.data())); });
  } catch(e){
    alert2('Error','Gagal muat bank soal: '+e.message,'error');
    throw e;
  }
}

// ============================================
// OPEN BANK PICKER (modal)
// ============================================
window.openBankPicker = async function(){
  try {
    await ensureBankLoaded();
  } catch(e){ return; }

  if (!window.__bank.items.length) {
    alert2('Info','Bank Soal masih kosong. Tambahkan soal dulu di menu Manage Soal → Bank Soal.','warning');
    return;
  }

  var items = window.__bank.items;
  var labels = { PGS:'PG', MCMA:'Kompleks', PGK:'T/F', ISIAN:'Isian' };
  var cls    = { PGS:'pgs', MCMA:'mcma', PGK:'pgk', ISIAN:'isian' };

  var rows = items.map(function(it){
    var checked = window.__sessSelectedBankIds.indexOf(it.id) !== -1;
    var escId = it.id.replace(/'/g,"\\'");
    return '<tr>' +
      '<td><input type="checkbox" class="bp-chk" data-id="'+escId+'" '+(checked?'checked':'')+'></td>' +
      '<td style="max-width:300px;font-size:.8125rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="'+escS(it.text||'')+'">'+escS((it.text||'').slice(0,100))+'</td>' +
      '<td><span class="question-type-badge '+(cls[it.type]||'')+'">'+(labels[it.type]||it.type)+'</span></td>' +
      '<td style="font-size:.75rem;">'+escS(it.subject||'-')+'<br><span style="color:#64748b;">'+escS(it.skill||'-')+'</span></td>' +
      '<td style="font-size:.75rem;">'+escS(it.level||'-')+'</td>' +
    '</tr>';
  }).join('');

  var html =
    '<div style="max-height:60vh;overflow-y:auto;">' +
      '<div style="display:flex;gap:.5rem;margin-bottom:.5rem;flex-wrap:wrap;">' +
        '<input type="text" class="form-control" id="bpSearch" placeholder="🔍 Cari teks/tag..." oninput="filterBankPicker()" style="flex:1;min-width:200px;margin:0;">' +
        '<button type="button" class="btn btn-secondary btn-sm" onclick="bpSelectAll(true)">Pilih Semua</button>' +
        '<button type="button" class="btn btn-secondary btn-sm" onclick="bpSelectAll(false)">Kosongkan</button>' +
      '</div>' +
      '<div class="table-wrapper"><table class="table" id="bpTable"><thead><tr>' +
        '<th style="width:40px;"><input type="checkbox" onchange="bpSelectAll(this.checked)"></th>' +
        '<th>Soal</th><th>Tipe</th><th>Mapel/Skill</th><th>Level</th>' +
      '</tr></thead><tbody>'+rows+'</tbody></table></div>' +
      '<div id="bpCount" style="margin-top:.5rem;font-size:.8125rem;color:#64748b;">0 dipilih</div>' +
    '</div>';

  M.custom({
    title: 'Pilih Soal dari Bank Soal ('+items.length+' tersedia)',
    message: html,
    type: 'info',
    buttons: [
      { text:'Batal', class:'btn-secondary' },
      { text:'Konfirmasi', class:'btn-primary', action: function(){ confirmBankPicker(); } }
    ]
  });
  updateBpCount();
};

window.filterBankPicker = function(){
  var q = (document.getElementById('bpSearch').value||'').toLowerCase();
  var rows = document.querySelectorAll('#bpTable tbody tr');
  rows.forEach(function(tr){
    var text = tr.textContent.toLowerCase();
    tr.style.display = text.indexOf(q) !== -1 ? '' : 'none';
  });
};

window.bpSelectAll = function(v){
  document.querySelectorAll('.bp-chk').forEach(function(cb){ cb.checked = v; });
  updateBpCount();
};

function updateBpCount(){
  var cnt = document.querySelectorAll('.bp-chk:checked').length;
  var el = document.getElementById('bpCount');
  if (el) el.textContent = cnt + ' dipilih';
}

window.confirmBankPicker = function(){
  var ids = [];
  document.querySelectorAll('.bp-chk:checked').forEach(function(cb){ ids.push(cb.dataset.id); });
  window.__sessSelectedBankIds = ids;
  if (typeof window.__updateBankPickerSummary === 'function') {
    window.__updateBankPickerSummary();
  } else {
    var el = document.getElementById('bankPickerSummary');
    if (el) {
      if (!ids.length) el.textContent = 'Belum ada soal dipilih.';
      else el.innerHTML = '<b>' + ids.length + ' soal</b> dipilih dari Bank Soal. Akan di-snapshot saat simpan sesi.';
    }
  }
  toast(ids.length + ' soal dipilih','success');
};

// ============================================
// PREVIEW FILTER (auto-generate by filter)
// ============================================
window.previewFilterPreview = async function(){
  try { await ensureBankLoaded(); } catch(e){ return; }

  var f = window.__sessSourceFilter || {};
  var tagArr = (f.tags||'').split(',').map(function(t){return t.trim();}).filter(Boolean);
  var matched = (window.__bank.items||[]).filter(function(it){
    if (it.status && it.status !== 'active') return false;
    if (f.subject && it.subject !== f.subject) return false;
    if (f.skill && it.skill !== f.skill) return false;
    if (f.level && it.level !== f.level) return false;
    if (tagArr.length) {
      for (var i=0;i<tagArr.length;i++){ if (!(it.tags||[]).includes(tagArr[i])) return false; }
    }
    return true;
  });
  var el = document.getElementById('sfPreview');
  if (!el) return;
  if (!matched.length) { el.innerHTML = '<span style="color:#dc2626;">⚠ Tidak ada soal yang cocok dengan filter.</span>'; return; }
  el.innerHTML = '✓ <b>' + matched.length + '</b> soal cocok. Akan diambil ' + Math.min(f.count||20, matched.length) + ' secara random saat simpan sesi.';
};

// ============================================
// MATERIALIZE: snapshot bank -> collection questions
// ============================================
window.materializeBankQuestions = async function(sessionId, sourceType, sessData){
  try {
    await ensureBankLoaded();

    var items = window.__bank.items;
    var selectedItems = [];

    if (sourceType === 'bank' && sessData.questionRefs) {
      sessData.questionRefs.forEach(function(r){
        var it = items.find(function(x){return x.id===r.bankId;});
        if (it) selectedItems.push({ item: it, version: r.bankVersion || it.version || 1 });
      });
    } else if (sourceType === 'filter' && sessData.questionFilter) {
      var f = sessData.questionFilter;
      var tagArr = (f.tags||'').split(',').map(function(t){return t.trim();}).filter(Boolean);
      var matched = items.filter(function(it){
        if (it.status && it.status !== 'active') return false;
        if (f.subject && it.subject !== f.subject) return false;
        if (f.skill && it.skill !== f.skill) return false;
        if (f.level && it.level !== f.level) return false;
        if (tagArr.length) {
          for (var i=0;i<tagArr.length;i++){ if (!(it.tags||[]).includes(tagArr[i])) return false; }
        }
        return true;
      });
      // Shuffle Fisher-Yates
      for (var i = matched.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var tmp = matched[i]; matched[i] = matched[j]; matched[j] = tmp;
      }
      var count = Math.min(f.count || 20, matched.length);
      selectedItems = matched.slice(0, count).map(function(it){ return { item: it, version: it.version || 1 }; });

      // Update session dengan refs hasil filter
      var refs = selectedItems.map(function(x){ return { bankId: x.item.id, bankVersion: x.version }; });
      await db.collection('sessions').doc(sessionId).update({ questionRefs: refs }).catch(function(){});
    }

    if (!selectedItems.length) {
      toast('Tidak ada soal yang bisa di-snapshot','warning');
      return;
    }

    var batch = db.batch();
    selectedItems.forEach(function(x, idx){
      var it = x.item;
      var data = {
        sessionId: sessionId,
        type: it.type,
        text: it.text || '',
        explanation: it.explanation || '',
        imageUrl: it.imageUrl || '',
        order: idx + 1,
        source: 'bank',
        bankId: it.id,
        bankVersion: x.version,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      };
      if (it.type === 'PGS' || it.type === 'MCMA') { data.options = it.options; data.correctAnswer = it.correctAnswer; }
      else if (it.type === 'PGK') {
        data.statements = it.statements;
        data.correctAnswer = window.parseBooleanAnswerList
          ? window.parseBooleanAnswerList(it.correctAnswer)
          : it.correctAnswer;
      }
      else if (it.type === 'ISIAN') { data.correctAnswer = it.correctAnswer; }
      batch.set(db.collection('questions').doc(), data);
    });
    await batch.commit();

    toast('✓ Snapshot ' + selectedItems.length + ' soal dari Bank Soal dibuat','success');
  } catch(e){
    console.error('[Materialize] error:', e);
    alert2('Warning','Gagal materialisasi snapshot: '+e.message+'. Anda bisa tambahkan soal manual di Manage Soal.','warning');
  }
};

console.log('✅ m-sesi-bankpicker.js v1.0 loaded (bank picker + materialize)');