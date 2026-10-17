/* #xx | /root/js/m-soal-bank.js | v 1.2 | u 17/10/2026 • 17:25:00 | xu : ke-3 | note : #noteresponse
- v1.1 -> v1.2:
  * Bank Soal menerima URL/upload gambar dan menampilkan pratinjaunya.
  * Simpan jawaban Benar/Salah bersama pernyataannya agar jawaban tidak bergeser
    ketika ada baris pernyataan kosong.
- v1.0 -> v1.1 (PATCH soft delete):
  * loadBank: filter client-side doc dengan deleted:true agar item ter-trash tidak muncul
    di daftar Bank Soal. Doc lama tanpa field `deleted` tetap muncul.
  * computeBankUsage: exclude snapshot yang sudah di-trash dari usage count
    (agar angka "Dipakai Nx" tidak menghitung soal yang sudah dibuang).
  * deleteBankQuestion: hard delete -> softDelete('questionBank', id) dengan konfirmasi
    ringan "Pindahkan ke Sampah?". Snapshot di sesi lama TIDAK terpengaruh.
- TETAP IDENTIK (tidak dipotong dari v1.0):
  * Init state window.__bank (items, folders, filter)
  * renderBankList + renderBankFilters + handlers filter (onBankSearch, onBankFilter, resetBankFilters)
  * viewBankDetail (preview opsi/statement/jawaban + pembahasan + badge Dipakai)
  * openBankEditor + saveBankEditor + onBkTypeChange + renderBkAnswerArea + toggleOptE + addPgkStatement
  * duplicateBankQuestion (copy dengan prefix [DUPLIKAT])
  * Folder manager: openFolderManager, renderFolderListModal, addFolderFromModal, deleteFolder
  * Expose: window.loadBank, window.viewBankDetail, window.openBankEditor, window.saveBankEditor,
    window.onBkTypeChange, window.toggleOptE, window.addPgkStatement, window.duplicateBankQuestion,
    window.deleteBankQuestion, window.openFolderManager, window.addFolderFromModal, window.deleteFolder */

// ============================================
// INIT STATE (backward compat)
// ============================================
window.__bank = window.__bank || {
  items: [],
  folders: [],
  filter: { subject:'', skill:'', level:'', tag:'', folder:'', search:'' }
};

// ============================================
// LOAD BANK + FOLDERS + USAGE (exclude deleted)
// ============================================
async function loadBank() {
  var list = document.getElementById('bankList');
  if (!list) return;
  list.innerHTML = '<div class="empty-state"><span class="material-icons">hourglass_empty</span><p>Memuat Bank Soal...</p></div>';
  try {
    var bankSnap = await db.collection('questionBank').orderBy('createdAt','desc').get();
    var folderSnap = await db.collection('questionFolders').orderBy('order').get();
    window.__bank.items = [];
    // FILTER: exclude soft-deleted (client-side)
    bankSnap.forEach(function(d){
      var data = d.data();
      if (data.deleted !== true) window.__bank.items.push(Object.assign({id:d.id}, data));
    });
    window.__bank.folders = [];
    folderSnap.forEach(function(d){ window.__bank.folders.push(Object.assign({id:d.id}, d.data())); });

    await computeBankUsage();
    renderBankList();
  } catch(e) {
    list.innerHTML = '<div class="empty-state" style="color:#991b1b;"><span class="material-icons">error</span><p>Gagal: '+escapeHtml(e.message)+'</p></div>';
  }
}

async function computeBankUsage() {
  try {
    var qSnap = await db.collection('questions').get();
    var usageMap = {};
    qSnap.forEach(function(d){
      var data = d.data();
      // Exclude snapshot yang sudah di-trash
      if (data.deleted === true) return;
      if (data.bankId) usageMap[data.bankId] = (usageMap[data.bankId]||0) + 1;
    });
    window.__bank.items.forEach(function(it){ it._usageCount = usageMap[it.id] || 0; });
  } catch(e){ console.warn('[Bank] usage compute error:', e); }
}

// ============================================
// RENDER LIST + FILTERS (identik v1.0)
// ============================================
function renderBankList() {
  var list = document.getElementById('bankList');
  if (!list) return;

  renderBankFilters();

  var f = window.__bank.filter;
  var filtered = window.__bank.items.filter(function(it){
    if (f.subject && it.subject !== f.subject) return false;
    if (f.skill && it.skill !== f.skill) return false;
    if (f.level && it.level !== f.level) return false;
    if (f.tag && !(it.tags||[]).includes(f.tag)) return false;
    if (f.folder && it.folderId !== f.folder) return false;
    if (f.search) {
      var q = f.search.toLowerCase();
      var hay = (it.text||'')+' '+(it.subject||'')+' '+(it.skill||'')+' '+((it.tags||[]).join(' '));
      if (hay.toLowerCase().indexOf(q) === -1) return false;
    }
    return true;
  });

  if (filtered.length === 0) {
    list.innerHTML =
      '<div class="empty-state"><span class="material-icons">inventory_2</span>' +
      '<p>Bank Soal kosong'+(window.__bank.items.length?' (coba ubah filter)':'')+'</p>' +
      '<p style="font-size:.8125rem;color:#64748b;">Tambah soal lewat sub-menu Input/Import dengan target "Simpan ke Bank Soal", atau klik tombol "+ Soal Bank" di atas.</p></div>';
    return;
  }

  var labels = { PGS:'PG', MCMA:'Kompleks', PGK:'T/F', ISIAN:'Isian' };
  var cls = { PGS:'pgs', MCMA:'mcma', PGK:'pgk', ISIAN:'isian' };

  var rows = filtered.map(function(it, i){
    var tags = (it.tags||[]).slice(0,4).map(function(t){ return '<span class="badge badge-info" style="font-size:.65rem;">'+escapeHtml(t)+'</span>'; }).join(' ');
    if ((it.tags||[]).length > 4) tags += ' <span style="font-size:.65rem;color:#94a3b8;">+'+((it.tags||[]).length-4)+'</span>';
    var folder = (it.folderId && window.__bank.folders.find(function(x){return x.id===it.folderId;}))
      ? window.__bank.folders.find(function(x){return x.id===it.folderId;}).name : '-';
    var key = it.type==='PGS' ? (it.correctAnswer||'-')
            : it.type==='MCMA' ? (it.correctAnswer||[]).join(',')
            : it.type==='PGK' ? (window.parseBooleanAnswerList ? window.parseBooleanAnswerList(it.correctAnswer) || [] : it.correctAnswer||[]).map(function(x){return x?'B':'S';}).join(',')
            : '<code>'+escapeHtml(it.correctAnswer||'')+'</code>';
    var escId = it.id.replace(/'/g,"\\'");
    return '<tr>' +
      '<td>'+(i+1)+'</td>' +
      '<td style="max-width:280px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="'+escapeHtml(it.text||'')+'">'+escapeHtml((it.text||'').slice(0,100))+'</td>' +
      '<td><span class="question-type-badge '+(cls[it.type]||'')+'">'+(labels[it.type]||it.type)+'</span></td>' +
      '<td style="font-size:.75rem;">'+escapeHtml(it.subject||'-')+'<br><span style="color:#64748b;">'+escapeHtml(it.skill||'-')+' · '+(it.level||'-')+'</span></td>' +
      '<td style="font-size:.75rem;">'+escapeHtml(folder)+'</td>' +
      '<td style="font-size:.7rem;">'+(tags||'<span style="color:#94a3b8;">-</span>')+'</td>' +
      '<td style="text-align:center;font-size:.8125rem;"><b>'+(it._usageCount||0)+'</b>x</td>' +
      '<td style="font-size:.8125rem;">'+key+'</td>' +
      '<td style="white-space:nowrap;">' +
        '<button class="btn btn-secondary btn-sm" onclick="viewBankDetail(\''+escId+'\')" title="Detail"><span class="material-icons" style="font-size:14px;">visibility</span></button> ' +
        '<button class="btn btn-secondary btn-sm" onclick="duplicateBankQuestion(\''+escId+'\')" title="Duplikat"><span class="material-icons" style="font-size:14px;">content_copy</span></button> ' +
        '<button class="btn btn-error btn-sm" onclick="deleteBankQuestion(\''+escId+'\')" title="Pindahkan ke Sampah"><span class="material-icons" style="font-size:14px;">delete</span></button>' +
      '</td>' +
    '</tr>';
  }).join('');

  list.innerHTML =
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.5rem;flex-wrap:wrap;gap:.5rem;">' +
      '<div style="font-size:.8125rem;color:#64748b;">Menampilkan <b>'+filtered.length+'</b> dari <b>'+window.__bank.items.length+'</b> soal bank</div>' +
      '<div style="display:flex;gap:.375rem;flex-wrap:wrap;">' +
        '<button class="btn btn-primary btn-sm" onclick="openBankEditor(null)" title="Tambah soal bank manual"><span class="material-icons" style="font-size:14px;">add</span>Soal Bank</button>' +
        '<button class="btn btn-secondary btn-sm" onclick="openFolderManager()" title="Kelola folder"><span class="material-icons" style="font-size:14px;">folder</span>Folder</button>' +
      '</div>' +
    '</div>' +
    '<div class="table-wrapper"><table class="table"><thead><tr>' +
      '<th>#</th><th>Soal</th><th>Tipe</th><th>Mapel/Skill</th><th>Folder</th><th>Tag</th><th>Dipakai</th><th>Kunci</th><th>Aksi</th>' +
    '</tr></thead><tbody>'+rows+'</tbody></table></div>';
}

function renderBankFilters() {
  var bar = document.getElementById('bankFilters');
  if (!bar) return;

  var allTags = {};
  window.__bank.items.forEach(function(it){ (it.tags||[]).forEach(function(t){ allTags[t]=1; }); });
  var tagList = Object.keys(allTags).sort();

  var f = window.__bank.filter;
  function opts(arr, selected){
    return '<option value="">Semua</option>' + arr.map(function(x){
      return '<option value="'+escapeHtml(x)+'"'+(x===selected?' selected':'')+'>'+escapeHtml(x)+'</option>';
    }).join('');
  }
  var folderOpts = '<option value="">Semua</option>' + window.__bank.folders.map(function(x){
    return '<option value="'+x.id+'"'+(x.id===f.folder?' selected':'')+'>'+escapeHtml(x.name)+'</option>';
  }).join('');

  bar.innerHTML =
    '<div style="display:flex;gap:.5rem;flex-wrap:wrap;align-items:center;margin-bottom:.75rem;">' +
      '<input type="text" id="bankSearch" placeholder="🔍 Cari teks/tag..." value="'+escapeHtml(f.search||'')+'" oninput="onBankSearch(this.value)" style="flex:1;min-width:180px;">' +
      '<select class="form-control" onchange="onBankFilter(\'subject\',this.value)" style="width:auto;min-width:120px;">'+opts(window.BANK_SUBJECTS, f.subject)+'</select>' +
      '<select class="form-control" onchange="onBankFilter(\'skill\',this.value)" style="width:auto;min-width:120px;">'+opts(window.BANK_SKILLS, f.skill)+'</select>' +
      '<select class="form-control" onchange="onBankFilter(\'level\',this.value)" style="width:auto;min-width:110px;">'+opts(window.BANK_LEVELS, f.level)+'</select>' +
      '<select class="form-control" onchange="onBankFilter(\'folder\',this.value)" style="width:auto;min-width:120px;">'+folderOpts+'</select>' +
      '<select class="form-control" onchange="onBankFilter(\'tag\',this.value)" style="width:auto;min-width:120px;">'+opts(tagList, f.tag)+'</select>' +
      '<button class="btn btn-secondary btn-sm" onclick="resetBankFilters()" title="Reset filter"><span class="material-icons" style="font-size:14px;">filter_alt_off</span></button>' +
    '</div>';
}

window.onBankSearch = function(v){ window.__bank.filter.search = v; renderBankList(); };
window.onBankFilter = function(key, v){ window.__bank.filter[key] = v; renderBankList(); };
window.resetBankFilters = function(){
  window.__bank.filter = { subject:'', skill:'', level:'', tag:'', folder:'', search:'' };
  renderBankList();
};

// ============================================
// DETAIL SOAL BANK (identik v1.0)
// ============================================
window.viewBankDetail = function(id){
  var it = window.__bank.items.find(function(x){return x.id===id;});
  if (!it) return;
  var labels = { PGS:'Pilihan Ganda', MCMA:'Pilihan Ganda Kompleks', PGK:'Kategori Benar/Salah', ISIAN:'Isian Singkat' };
  var folder = (it.folderId && window.__bank.folders.find(function(x){return x.id===it.folderId;}))
    ? window.__bank.folders.find(function(x){return x.id===it.folderId;}).name : '-';
  var tags = (it.tags||[]).map(function(t){ return '<span class="badge badge-info" style="margin-right:.25rem;">'+escapeHtml(t)+'</span>'; }).join('')
    || '<span style="color:#94a3b8;">-</span>';

  var optHtml = '';
  if ((it.type==='PGS'||it.type==='MCMA') && it.options) {
    optHtml = '<div style="margin-top:.75rem;"><b>Opsi:</b><ul style="margin:.25rem 0;padding-left:1.25rem;">';
    ['A','B','C','D','E'].forEach(function(l){
      if (it.options[l]) {
        var isCorrect = (it.type==='PGS') ? (it.correctAnswer===l) : ((it.correctAnswer||[]).includes(l));
        optHtml += '<li><b>'+l+'.</b> '+escapeHtml(it.options[l])+(isCorrect?' <span style="color:#10b981;font-weight:700;">✓ benar</span>':'')+'</li>';
      }
    });
    optHtml += '</ul></div>';
  } else if (it.type==='PGK' && it.statements) {
    var answers = window.parseBooleanAnswerList
      ? (window.parseBooleanAnswerList(it.correctAnswer) || [])
      : (it.correctAnswer || []);
    optHtml = '<div style="margin-top:.75rem;"><b>Pernyataan:</b><ol style="margin:.25rem 0;padding-left:1.25rem;">';
    it.statements.forEach(function(st,i){
      var a = answers[i];
      optHtml += '<li>'+escapeHtml(st)+' — <b>'+(a?'BENAR':'SALAH')+'</b></li>';
    });
    optHtml += '</ol></div>';
  } else if (it.type==='ISIAN') {
    optHtml = '<div style="margin-top:.75rem;"><b>Jawaban:</b> <code>'+escapeHtml(it.correctAnswer||'')+'</code></div>';
  }

  var html =
    '<div style="max-height:60vh;overflow-y:auto;">' +
      '<div style="display:flex;gap:.5rem;flex-wrap:wrap;margin-bottom:.75rem;">' +
        '<span class="question-type-badge '+(it.type||'').toLowerCase()+'">'+(labels[it.type]||it.type)+'</span>' +
        '<span class="badge badge-info">'+escapeHtml(it.subject||'-')+'</span>' +
        '<span class="badge badge-info">'+escapeHtml(it.skill||'-')+'</span>' +
        '<span class="badge badge-info">'+escapeHtml(it.level||'-')+'</span>' +
        '<span class="badge" style="background:#fef3c7;color:#92400e;">Dipakai: '+(it._usageCount||0)+'x</span>' +
      '</div>' +
      '<div style="background:#f8fafc;padding:.75rem;border-radius:8px;margin-bottom:.75rem;">' +
        '<div style="font-size:.75rem;color:#64748b;margin-bottom:.25rem;">Soal:</div>' +
        '<div style="font-size:.9375rem;line-height:1.6;">'+escapeHtml(it.text||'')+'</div>' +
        (it.imageUrl ? '<img src="'+escapeHtml(it.imageUrl).replace(/'/g,'&#39;')+'" alt="Gambar soal" style="display:block;max-width:100%;max-height:280px;object-fit:contain;margin-top:.75rem;border-radius:8px;">' : '') +
      '</div>' +
      optHtml +
      (it.explanation ? '<div style="margin-top:.75rem;padding:.75rem;background:#ecfdf5;border-left:3px solid #10b981;border-radius:6px;"><b>Pembahasan:</b><br>'+escapeHtml(it.explanation)+'</div>' : '') +
      '<div style="margin-top:.75rem;"><b>Folder:</b> '+escapeHtml(folder)+'</div>' +
      '<div style="margin-top:.5rem;"><b>Tag:</b> '+tags+'</div>' +
      '<div style="margin-top:.5rem;font-size:.75rem;color:#64748b;">Versi: '+(it.version||1)+'</div>' +
    '</div>';

  M.custom({
    title: 'Detail Soal Bank',
    message: html,
    type: 'info',
    buttons: [
      { text:'Tutup', class:'btn-secondary' },
      { text:'Edit', class:'btn-primary', action: function(){ openBankEditor(id); } },
      { text:'Duplikat', class:'btn-secondary', action: function(){ duplicateBankQuestion(id); } }
    ]
  });
};

// ============================================
// EDITOR SOAL BANK (identik v1.0)
// ============================================
window.openBankEditor = function(id){
  var source = id ? window.__bank.items.find(function(x){return x.id===id;}) : null;
  var it = source ? JSON.parse(JSON.stringify(source)) : null;
  var isEdit = !!it;
  var d = it || {
    type:'PGS', text:'', options:{A:'',B:'',C:'',D:''}, correctAnswer:'A',
    statements:[], explanation:'', imageUrl:'',
    subject: window.BANK_SUBJECTS[0], skill: window.BANK_SKILLS[0], level: window.BANK_LEVELS[1],
    tags:[], folderId:null
  };
  if (d.type === 'PGK' && window.parseBooleanAnswerList) {
    var normalizedAnswers = window.parseBooleanAnswerList(d.correctAnswer);
    if (normalizedAnswers) d.correctAnswer = normalizedAnswers;
  }

  function optsHtml(arr, selected){
    return arr.map(function(x){
      return '<option value="'+escapeHtml(x)+'"'+(x===selected?' selected':'')+'>'+escapeHtml(x)+'</option>';
    }).join('');
  }
  var folderOpts = '<option value="">— Tanpa Folder —</option>' + window.__bank.folders.map(function(x){
    return '<option value="'+x.id+'"'+(x.id===d.folderId?' selected':'')+'>'+escapeHtml(x.name)+'</option>';
  }).join('');

  var html =
    '<div style="max-height:60vh;overflow-y:auto;padding-right:.5rem;">' +
      '<div class="form-group"><label class="form-label">Tipe Soal</label>' +
        '<select class="form-control" id="bkType" onchange="onBkTypeChange()">' +
          '<option value="PGS"'+(d.type==='PGS'?' selected':'')+'>Pilihan Ganda (PGS)</option>' +
          '<option value="MCMA"'+(d.type==='MCMA'?' selected':'')+'>Pilihan Ganda Kompleks (MCMA)</option>' +
          '<option value="PGK"'+(d.type==='PGK'?' selected':'')+'>Kategori Benar/Salah</option>' +
          '<option value="ISIAN"'+(d.type==='ISIAN'?' selected':'')+'>Isian Singkat</option>' +
        '</select></div>' +
      '<div class="form-group"><label class="form-label">Teks Soal</label><textarea class="form-control" id="bkText" rows="3">'+escapeHtml(d.text||'')+'</textarea></div>' +
      '<div class="form-group"><label class="form-label">Gambar soal (opsional)</label>' +
        '<div style="display:flex;gap:.5rem;flex-wrap:wrap;align-items:center;">' +
          '<input type="url" class="form-control" id="bkImageUrl" value="'+escapeHtml(d.imageUrl||'')+'" placeholder="https://.../gambar.jpg" oninput="previewQuestionImage(this.value,\'bkImagePreview\')" style="flex:1;min-width:220px;margin:0;">' +
          '<input type="file" class="form-control" id="bkImageFile" accept="image/jpeg,image/png,image/webp,image/gif" style="max-width:220px;">' +
          '<button type="button" class="btn btn-secondary btn-sm" onclick="uploadQuestionImageFromInput(\'bkImageFile\',\'bkImageUrl\',\'bkImageStatus\',\'bkImagePreview\')"><span class="material-icons">cloud_upload</span>Upload</button>' +
        '</div><small id="bkImageStatus" style="display:block;color:#64748b;margin-top:.25rem;">JPG/PNG/WEBP/GIF, maksimal 5 MB.</small>' +
        '<div id="bkImagePreview"></div>' +
      '</div>' +
      '<div id="bkAnswerArea"></div>' +
      '<div class="form-group"><label class="form-label">Pembahasan</label><textarea class="form-control" id="bkExplanation" rows="2">'+escapeHtml(d.explanation||'')+'</textarea></div>' +
      '<hr style="margin:1rem 0;border:none;border-top:1px solid #e2e8f0;">' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:.75rem;">' +
        '<div class="form-group"><label class="form-label">Mapel</label><select class="form-control" id="bkSubject">'+optsHtml(window.BANK_SUBJECTS, d.subject)+'</select></div>' +
        '<div class="form-group"><label class="form-label">Skill</label><select class="form-control" id="bkSkill">'+optsHtml(window.BANK_SKILLS, d.skill)+'</select></div>' +
        '<div class="form-group"><label class="form-label">Level</label><select class="form-control" id="bkLevel">'+optsHtml(window.BANK_LEVELS, d.level)+'</select></div>' +
        '<div class="form-group"><label class="form-label">Folder</label><select class="form-control" id="bkFolder">'+folderOpts+'</select></div>' +
      '</div>' +
      '<div class="form-group"><label class="form-label">Tag (pisahkan koma)</label><input type="text" class="form-control" id="bkTags" value="'+escapeHtml((d.tags||[]).join(', '))+'"></div>' +
    '</div>';

  M.custom({
    title: isEdit ? 'Edit Soal Bank' : 'Tambah Soal Bank',
    message: html,
    type: 'info',
    buttons: [
      { text:'Batal', class:'btn-secondary' },
      { text: isEdit?'Simpan':'Tambah', class:'btn-primary', action: function(){ saveBankEditor(id); } }
    ]
  });

  window.__bkDraft = JSON.parse(JSON.stringify(d));
  renderBkAnswerArea();
  if (d.imageUrl) window.previewQuestionImage(d.imageUrl, 'bkImagePreview');
};

window.onBkTypeChange = function(){
  window.__bkDraft.type = document.getElementById('bkType').value;
  renderBkAnswerArea();
};

function renderBkAnswerArea(){
  var area = document.getElementById('bkAnswerArea');
  if (!area) return;
  var d = window.__bkDraft;
  var html = '';

  if (d.type === 'PGS' || d.type === 'MCMA') {
    html += '<div class="form-group"><label class="form-label">Opsi Jawaban</label>';
    ['A','B','C','D','E'].forEach(function(l){
      var val = (d.options && d.options[l]) || '';
      html += '<div style="display:flex;gap:.5rem;margin-bottom:.375rem;align-items:center;">' +
        '<b style="width:20px;">'+l+'.</b>' +
        '<input type="text" class="form-control" style="margin:0;" data-opt="'+l+'" value="'+escapeHtml(val)+'" placeholder="Opsi '+l+'">' +
        (l==='E' ? '<button class="btn btn-secondary btn-sm" onclick="toggleOptE()" id="bkOptEbtn" style="white-space:nowrap;">'+(val?'Hapus E':'Tambah E')+'</button>' : '') +
      '</div>';
    });
    if (d.type === 'PGS') {
      html += '<div style="margin-top:.5rem;"><label class="form-label">Jawaban Benar</label>' +
        '<select class="form-control" id="bkCorrect">' +
          ['A','B','C','D','E'].map(function(l){
            return '<option value="'+l+'"'+(d.correctAnswer===l?' selected':'')+'>'+l+'</option>';
          }).join('') +
        '</select></div>';
    } else {
      html += '<div style="margin-top:.5rem;"><label class="form-label">Jawaban Benar (centang semua yang benar)</label><div>';
      ['A','B','C','D','E'].forEach(function(l){
        var checked = (d.correctAnswer||[]).includes(l);
        html += '<label style="display:inline-flex;gap:.25rem;margin-right:.75rem;"><input type="checkbox" data-mcma="'+l+'"'+(checked?' checked':'')+'> '+l+'</label>';
      });
      html += '</div></div>';
    }
    html += '</div>';
  }
  else if (d.type === 'PGK') {
    html += '<div class="form-group"><label class="form-label">Pernyataan (Benar/Salah)</label>';
    var sts = d.statements || [];
    var ans = d.correctAnswer || [];
    sts.forEach(function(st, i){
      html += '<div style="display:flex;gap:.5rem;margin-bottom:.375rem;align-items:center;">' +
        '<b style="width:20px;">'+(i+1)+'.</b>' +
        '<input type="text" class="form-control" style="margin:0;" data-pgk="'+i+'" value="'+escapeHtml(st)+'">' +
        '<select data-pgkans="'+i+'" style="padding:.5rem;border-radius:6px;border:1px solid #e2e8f0;">' +
          '<option value="true"'+(ans[i]===true?' selected':'')+'>Benar</option>' +
          '<option value="false"'+(ans[i]===false?' selected':'')+'>Salah</option>' +
        '</select>' +
      '</div>';
    });
    html += '<button class="btn btn-secondary btn-sm" onclick="addPgkStatement()"><span class="material-icons" style="font-size:14px;">add</span>Tambah Pernyataan</button>';
    html += '</div>';
  }
  else if (d.type === 'ISIAN') {
    html += '<div class="form-group"><label class="form-label">Jawaban Benar</label><input type="text" class="form-control" id="bkIsian" value="'+escapeHtml(d.correctAnswer||'')+'"></div>';
  }
  area.innerHTML = html;
}

window.toggleOptE = function(){
  var inp = document.querySelector('[data-opt="E"]');
  if (!inp) return;
  if (inp.value) {
    inp.value = '';
    var btn = document.getElementById('bkOptEbtn');
    if (btn) btn.textContent = 'Tambah E';
  } else {
    var btn2 = document.getElementById('bkOptEbtn');
    if (btn2) btn2.textContent = 'Hapus E';
    inp.focus();
  }
};

window.addPgkStatement = function(){
  var d = window.__bkDraft;
  d.statements = d.statements || [];
  d.correctAnswer = d.correctAnswer || [];
  d.statements.push('');
  d.correctAnswer.push(true);
  renderBkAnswerArea();
};

async function saveBankEditor(id){
  var d = window.__bkDraft;
  d.text = (document.getElementById('bkText').value || '').trim();
  d.imageUrl = window.normalizeQuestionImageUrl(document.getElementById('bkImageUrl').value);
  d.explanation = document.getElementById('bkExplanation').value || '';
  d.subject = document.getElementById('bkSubject').value;
  d.skill = document.getElementById('bkSkill').value;
  d.level = document.getElementById('bkLevel').value;
  d.folderId = document.getElementById('bkFolder').value || null;
  d.tags = (document.getElementById('bkTags').value || '').split(',').map(function(t){return t.trim();}).filter(Boolean);

  if (!d.text) { alert2('Error','Teks soal wajib diisi','error'); return; }
  if (d.imageUrl === null) { alert2('Error','URL gambar harus diawali http:// atau https://.','error'); return; }

  if (d.type === 'PGS' || d.type === 'MCMA') {
    d.options = {};
    ['A','B','C','D','E'].forEach(function(l){
      var inp = document.querySelector('[data-opt="'+l+'"]');
      if (inp && inp.value.trim()) d.options[l] = inp.value.trim();
    });
    if (Object.keys(d.options).length < 2) { alert2('Error','Minimal 2 opsi','error'); return; }
    if (d.type === 'PGS') {
      d.correctAnswer = document.getElementById('bkCorrect').value;
    } else {
      d.correctAnswer = [];
      ['A','B','C','D','E'].forEach(function(l){
        var cb = document.querySelector('[data-mcma="'+l+'"]');
        if (cb && cb.checked) d.correctAnswer.push(l);
      });
      if (!d.correctAnswer.length) { alert2('Error','Pilih minimal 1 jawaban benar','error'); return; }
    }
  }
  else if (d.type === 'PGK') {
    var statements = [], correctAnswers = [];
    document.querySelectorAll('[data-pgk]').forEach(function(inp){
      var statement = inp.value.trim();
      if (!statement) return;
      var sel = document.querySelector('[data-pgkans="'+inp.dataset.pgk+'"]');
      statements.push(statement);
      correctAnswers.push(sel ? sel.value === 'true' : true);
    });
    d.statements = statements;
    d.correctAnswer = correctAnswers;
    if (!d.statements.length) { alert2('Error','Minimal 1 pernyataan','error'); return; }
  }
  else if (d.type === 'ISIAN') {
    d.correctAnswer = document.getElementById('bkIsian').value.trim();
    if (!d.correctAnswer) { alert2('Error','Jawaban wajib diisi','error'); return; }
  }

  var load = loading('Menyimpan...');
  try {
    var data = {
      type: d.type, text: d.text, explanation: d.explanation || '',
      options: d.options || null, statements: d.statements || null, correctAnswer: d.correctAnswer,
      imageUrl: d.imageUrl || null,
      subject: d.subject, skill: d.skill, level: d.level,
      tags: d.tags, folderId: d.folderId,
      status: 'active', version: (d.version||1) + (id ? 1 : 0),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    if (!id) data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
    Object.keys(data).forEach(function(k){ if (data[k] === null) delete data[k]; });

    if (id) {
      await db.collection('questionBank').doc(id).update(data);
      toast('Soal bank diperbarui','success');
    } else {
      await db.collection('questionBank').doc().set(data);
      toast('Soal bank ditambahkan','success');
    }
    load.close();
    loadBank();
  } catch(e) { load.close(); alert2('Error','Gagal: '+e.message,'error'); }
}
window.saveBankEditor = saveBankEditor;

// ============================================
// DUPLIKAT (identik v1.0)
// ============================================
window.duplicateBankQuestion = async function(id){
  var it = window.__bank.items.find(function(x){return x.id===id;});
  if (!it) return;
  var copy = Object.assign({}, it);
  delete copy.id; delete copy.createdAt; delete copy.updatedAt; delete copy._usageCount;
  copy.text = '[DUPLIKAT] ' + (copy.text || '');
  copy.version = 1;
  copy.createdAt = firebase.firestore.FieldValue.serverTimestamp();
  copy.updatedAt = firebase.firestore.FieldValue.serverTimestamp();
  try {
    await db.collection('questionBank').doc().set(copy);
    toast('Soal diduplikat','success');
    loadBank();
  } catch(e) { alert2('Error','Gagal: '+e.message,'error'); }
};

// ============================================
// HAPUS SOAL BANK (soft delete - pindah ke Sampah)
// ============================================
window.deleteBankQuestion = function(id){
  if (!confirm('Pindahkan soal bank ini ke Sampah?\n\nSnapshot di sesi lama TIDAK terpengaruh (tetap aman).\nAnda bisa memulihkannya nanti dari menu Sampah.')) return;
  (async function(){
    var ok = await window.softDelete('questionBank', id);
    if (ok) {
      toast('Soal bank dipindahkan ke Sampah','success');
      loadBank();
      if (window.__trash && window.__trash.initialized && window.Trash && window.Trash.load) {
        try { await window.Trash.load(); } catch(e){}
      }
    }
  })();
};

// ============================================
// FOLDER MANAGER (identik v1.0)
// ============================================
window.openFolderManager = function(){
  var html =
    '<div style="max-height:50vh;overflow-y:auto;">' +
      '<div style="display:flex;gap:.5rem;margin-bottom:.75rem;">' +
        '<input type="text" class="form-control" id="newFolderName" placeholder="Nama folder baru" style="margin:0;flex:1;">' +
        '<button class="btn btn-primary" onclick="addFolderFromModal()"><span class="material-icons" style="font-size:14px;">add</span>Tambah</button>' +
      '</div>' +
      '<div id="folderListModal"></div>' +
    '</div>';
  M.custom({
    title: 'Kelola Folder',
    message: html,
    type: 'info',
    buttons: [{ text:'Tutup', class:'btn-secondary', action: function(){ loadBank(); } }]
  });
  renderFolderListModal();
};

function renderFolderListModal(){
  var list = document.getElementById('folderListModal');
  if (!list) return;
  if (!window.__bank.folders.length) {
    list.innerHTML = '<div style="text-align:center;color:#94a3b8;padding:1rem;">Belum ada folder</div>';
    return;
  }
  list.innerHTML = '<div style="display:flex;flex-direction:column;gap:.375rem;">' +
    window.__bank.folders.map(function(f){
      var count = window.__bank.items.filter(function(it){return it.folderId===f.id;}).length;
      return '<div style="display:flex;justify-content:space-between;align-items:center;padding:.5rem .75rem;background:#f8fafc;border-radius:6px;">' +
        '<div><b>'+escapeHtml(f.name)+'</b> <span style="color:#64748b;font-size:.75rem;">('+count+' soal)</span></div>' +
        '<button class="btn btn-error btn-sm" onclick="deleteFolder(\''+f.id+'\')"><span class="material-icons" style="font-size:14px;">delete</span></button>' +
      '</div>';
    }).join('') +
  '</div>';
}

window.addFolderFromModal = async function(){
  var inp = document.getElementById('newFolderName');
  var name = (inp.value || '').trim();
  if (!name) return;
  try {
    await db.collection('questionFolders').doc().set({
      name: name,
      order: window.__bank.folders.length + 1,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    inp.value = '';
    toast('Folder ditambahkan','success');
    var snap = await db.collection('questionFolders').orderBy('order').get();
    window.__bank.folders = [];
    snap.forEach(function(d){ window.__bank.folders.push(Object.assign({id:d.id}, d.data())); });
    renderFolderListModal();
  } catch(e) { alert2('Error','Gagal: '+e.message,'error'); }
};

window.deleteFolder = async function(id){
  var count = window.__bank.items.filter(function(it){return it.folderId===id;}).length;
  if (count > 0) {
    alert2('Info','Folder masih berisi '+count+' soal. Pindahkan dulu atau hapus manual.','warning');
    return;
  }
  confirm2('Hapus Folder','Yakin hapus folder ini?', async function(){
    try {
      await db.collection('questionFolders').doc(id).delete();
      toast('Folder dihapus','success');
      var snap = await db.collection('questionFolders').orderBy('order').get();
      window.__bank.folders = [];
      snap.forEach(function(d){ window.__bank.folders.push(Object.assign({id:d.id}, d.data())); });
      renderFolderListModal();
    } catch(e) { alert2('Error','Gagal: '+e.message,'error'); }
  });
};

// ============================================
// EXPOSE
// ============================================
window.loadBank = loadBank;

console.log('✅ m-soal-bank.js v1.2 loaded (question images + boolean key fix)');