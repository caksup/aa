/* #xx | /root/js/m-soal-daftar.js | v 1.2 | u 17/10/2026 • 17:10:00 | xu : ke-3 | note : #noteresponse
- v1.1 -> v1.2:
  * Filter sesi tidak menggunakan orderBy Firestore, jadi soal lama tanpa `order`
    tetap muncul; hasil diurutkan di client sesuai sesi.
  * Abaikan hasil fetch lama saat pengguna mengganti filter dengan cepat.
  * Tampilkan error pemuatan secara eksplisit.
- v1.0 -> v1.1 (PATCH soft delete):
  * deleteQuestion: hard delete -> softDelete('questions', id). Item masuk ke Sampah,
    tidak hilang permanen. Konfirmasi ringan "Pindahkan ke Sampah?".
  * loadQuestions: filter client-side doc dengan deleted:true agar item ter-trash
    tidak muncul di daftar. Doc lama tanpa field `deleted` tetap muncul.
  * adoptToBank: tambah guard — tolak adopsi soal yang sudah di Sampah
    (harus di-restore dulu dari menu Sampah).
- TETAP IDENTIK (tidak dipotong dari v1.0):
  * Struktur tabel daftar soal (kolom #, Sesi, Tipe, Soal, Kunci, Asal, Aksi)
  * Badge "Bank" / "Manual" di kolom Asal
  * Tombol Adopsi ke Bank + Hapus di setiap baris
  * Fungsi adoptToBank (copy ke questionBank dengan metadata + adoptedFrom)
  * Update badgeQuestions setelah load
  * Expose: window.loadQuestions, window.deleteQuestion, window.adoptToBank */

// ============================================
// DAFTAR SOAL (per sesi / semua) - EXCLUDE deleted
// ============================================
var questionLoadVersion = 0;

async function loadQuestions() {
  var filterEl = document.getElementById('filterQSession');
  var list = document.getElementById('questionList');
  if (!list) return;
  var filter = filterEl ? filterEl.value : 'all';
  var loadVersion = ++questionLoadVersion;
  list.innerHTML = '<div class="empty-state"><span class="material-icons">hourglass_empty</span><p>Memuat soal...</p></div>';

  var docs = [];
  try {
    var query = filter === 'all'
      ? db.collection('questions')
      : db.collection('questions').where('sessionId','==',filter);
    var snap = await query.get();

    // Check filter again in the client so a selected session can never show another session's questions.
    snap.forEach(function(d){
      var data = d.data();
      if (data.deleted === true) return;
      if (filter !== 'all' && data.sessionId !== filter) return;
      docs.push({ id: d.id, data: data });
    });
  } catch(error) {
    if (loadVersion !== questionLoadVersion) return;
    console.error('[m-soal-daftar] Gagal memuat soal:', error);
    list.innerHTML =
      '<div class="empty-state" style="color:#b91c1c;">' +
        '<span class="material-icons">error_outline</span>' +
        '<p>Gagal memuat soal: ' + escapeHtml(error.message || 'Kesalahan tidak diketahui') + '</p>' +
        '<button class="btn btn-secondary btn-sm" onclick="loadQuestions()"><span class="material-icons">refresh</span>Coba lagi</button>' +
      '</div>';
    return;
  }
  if (loadVersion !== questionLoadVersion) return;

  function getDateValue(value) {
    if (!value) return 0;
    try {
      var date = value.toDate ? value.toDate() : new Date(value);
      var time = date.getTime();
      return isNaN(time) ? 0 : time;
    } catch(e) {
      return 0;
    }
  }
  docs.sort(function(a,b){
    if (filter !== 'all') {
      var ao = Number(a.data.order), bo = Number(b.data.order);
      var aHasOrder = a.data.order !== undefined && a.data.order !== null && a.data.order !== '' && !isNaN(ao);
      var bHasOrder = b.data.order !== undefined && b.data.order !== null && b.data.order !== '' && !isNaN(bo);
      if (aHasOrder && bHasOrder && ao !== bo) return ao - bo;
      if (aHasOrder !== bHasOrder) return aHasOrder ? -1 : 1;
    } else {
      var at = getDateValue(a.data.createdAt), bt = getDateValue(b.data.createdAt);
      if (at !== bt) return bt - at;
    }
    return a.id < b.id ? -1 : (a.id > b.id ? 1 : 0);
  });

  var bq = document.getElementById('badgeQuestions');
  if (bq) bq.textContent = docs.length;

  if (docs.length === 0) {
    list.innerHTML = '<div class="empty-state"><span class="material-icons">quiz</span><p>Belum ada soal</p></div>';
    return;
  }

  var labels = { PGS:'PG', MCMA:'Kompleks', PGK:'T/F', ISIAN:'Isian' };
  var cls = { PGS:'pgs', MCMA:'mcma', PGK:'pgk', ISIAN:'isian' };

  list.innerHTML =
    '<div class="table-wrapper"><table class="table"><thead><tr>' +
      '<th>#</th><th>Sesi</th><th>Tipe</th><th>Soal</th><th>Kunci</th><th>Asal</th><th>Aksi</th>' +
    '</tr></thead><tbody>' +
    docs.map(function(item, i){
      var data = item.data;
      var sess = (S.sessions||[]).find(function(s){ return s.id === data.sessionId; });
      var key = data.type==='PGS' ? (data.correctAnswer||'-')
              : data.type==='MCMA' ? (data.correctAnswer||[]).join(',')
              : data.type==='PGK' ? (window.parseBooleanAnswerList ? window.parseBooleanAnswerList(data.correctAnswer) || [] : data.correctAnswer||[]).map(function(x){return x?'B':'S';}).join(',')
              : '<code>' + escapeHtml(data.correctAnswer||'') + '</code>';
      var src = data.source === 'bank'
        ? '<span class="badge badge-info">Bank</span>'
        : '<span style="color:#94a3b8;">Manual</span>';
      var escId = item.id.replace(/'/g,"\\'");
      return '<tr>' +
        '<td>'+(i+1)+'</td>' +
        '<td>'+(sess ? escapeHtml(sess.name) : '-')+'</td>' +
        '<td><span class="question-type-badge '+(cls[data.type]||'')+'">'+(labels[data.type]||data.type)+'</span></td>' +
        '<td style="max-width:280px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">'+escapeHtml(data.text||'')+'</td>' +
        '<td style="font-size:.8125rem;">'+key+'</td>' +
        '<td style="font-size:.7rem;">'+src+'</td>' +
        '<td style="white-space:nowrap;">' +
          '<button class="btn btn-secondary btn-sm" onclick="adoptToBank(\''+escId+'\')" title="Adopsi ke Bank Soal (buat copy)"><span class="material-icons" style="font-size:14px;">inventory_2</span></button> ' +
          '<button class="btn btn-error btn-sm" onclick="deleteQuestion(\''+escId+'\')" title="Pindahkan ke Sampah"><span class="material-icons" style="font-size:14px;">delete</span></button>' +
        '</td></tr>';
    }).join('') +
    '</tbody></table></div>';
}

// ============================================
// HAPUS SOAL (soft delete - pindah ke Sampah)
// ============================================
async function deleteQuestion(id) {
  if (!confirm('Pindahkan soal ini ke Sampah?\n\nAnda bisa memulihkannya nanti dari menu Sampah.')) return;
  var ok = await window.softDelete('questions', id);
  if (ok) {
    toast('Soal dipindahkan ke Sampah','success');
    loadQuestions();
    // Refresh trash bila halamannya terbuka
    if (window.__trash && window.__trash.initialized && window.Trash && window.Trash.load) {
      try { await window.Trash.load(); } catch(e){}
    }
  }
}

// ============================================
// ADOPSI SOAL LAMA KE BANK SOAL (copy, tidak merusak)
// ============================================
async function adoptToBank(qid) {
  var ref = db.collection('questions').doc(qid);
  var doc = await ref.get();
  if (!doc.exists) { alert2('Error','Soal tidak ditemukan','error'); return; }
  var data = doc.data();
  // GUARD: tolak adopsi soal yang sudah di Sampah
  if (data.deleted === true) {
    alert2('Info','Soal ini sudah di Sampah. Pulihkan dulu dari menu Sampah sebelum diadopsi.','warning');
    return;
  }

  var subject = (await window.promptBankMeta('Mapel:', (window.BANK_SUBJECTS && window.BANK_SUBJECTS[0]) || 'Umum'))
                || (window.BANK_SUBJECTS && window.BANK_SUBJECTS[0]) || 'Umum';
  var skill = (await window.promptBankMeta('Skill/Kategori:', (window.BANK_SKILLS && window.BANK_SKILLS[0]) || 'Umum'))
              || (window.BANK_SKILLS && window.BANK_SKILLS[0]) || 'Umum';
  var level = (await window.promptBankMeta('Level (Mudah/Sedang/Sulit):', 'Sedang')) || 'Sedang';
  var tags = (await window.promptBankMeta('Tag (pisahkan koma):', '')) || '';
  var folderId = (await window.promptFolderSelect()) || null;

  var load = loading('Adopsi ke Bank...');
  try {
    var tagArr = tags.split(',').map(function(t){return t.trim();}).filter(Boolean);
    var bankData = {
      type: data.type,
      text: data.text || '',
      explanation: data.explanation || '',
      imageUrl: data.imageUrl || '',
      subject: subject, skill: skill, level: level,
      tags: tagArr, folderId: folderId,
      status: 'active', version: 1,
      adoptedFrom: qid,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    if (data.type === 'PGS' || data.type === 'MCMA') { bankData.options = data.options; bankData.correctAnswer = data.correctAnswer; }
    else if (data.type === 'PGK') {
      bankData.statements = data.statements;
      bankData.correctAnswer = window.parseBooleanAnswerList
        ? window.parseBooleanAnswerList(data.correctAnswer)
        : data.correctAnswer;
    }
    else if (data.type === 'ISIAN') { bankData.correctAnswer = data.correctAnswer; }

    await db.collection('questionBank').doc().set(bankData);
    load.close();
    toast('Soal diadopsi ke Bank Soal (soal lama tidak terpengaruh)','success');
    if (window.switchSoalSubTab) window.switchSoalSubTab('bank');
  } catch(e) { load.close(); alert2('Error','Gagal: '+e.message,'error'); }
}

// ============================================
// EXPOSE
// ============================================
window.loadQuestions  = loadQuestions;
window.deleteQuestion = deleteQuestion;
window.adoptToBank    = adoptToBank;

console.log('✅ m-soal-daftar.js v1.2 loaded (session filter reliable)');