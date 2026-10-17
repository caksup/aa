/* #xx | /root/js/m-soal-impex.js | v 1.2 | u 17/10/2026 • 17:25:00 | xu : ke-2 | note : #noteresponse
- v1.1 -> v1.2:
  * Samakan parser, template, dan export CSV untuk seluruh tipe soal.
  * CSV kategori Benar/Salah menerima true/false,
    benar/salah, b/s, dan 1/0, serta memvalidasi jumlah jawaban.
  * Tambah kolom URL gambar opsional pada akhir baris.
- SUB-MODULE: Import / Export Soal (CSV import + template download + export Bank).
- DIPINDAH DARI manage-soal.js v4.0 (semua fitur identik, tidak dipotong):
  * parseCSVFormat: parser CSV delimiter ';' (PGS/MCMA/PGK/ISIAN).
  * previewCSV: preview file CSV sebelum import.
  * doImportCSV: import CSV ke sesi ATAU Bank Soal (jalur __BANK__).
  * saveCsvToBank: simpan hasil CSV ke collection `questionBank` dengan metadata.
  * downloadTemplate: template TXT & CSV (dipanggil dari tombol di sub-impex).
  * exportBankCsv: export seluruh Bank Soal ke CSV (backup / edit massal).
- DEPENDENSI:
  * Dari orchestrator: window.escapeHtml, window.downloadFile, S.sessions.
  * Dari m-soal-input.js: window.promptBankMeta, window.promptFolderSelect.
  * Global: db, firebase, M, alert2, toast, loading.
- SHARED STATE: window.__csvQuestions (hasil preview), window.__bank (untuk export).
- EXPOSE: previewCSV, doImportCSV, downloadTemplate, exportBankCsv, parseCSVFormat. */

// ============================================
// PARSER CSV (IDENTIK v3.1)
// ============================================
function parseCSVFormat(text) {
  var lines = text.split('\n').map(function(l){ return l.replace(/\r$/,''); }).filter(function(l){ return l.trim(); });
  var out = [];
  // Skip header jika baris pertama diawali "TYPE"
  var start = (lines[0] && lines[0].toLowerCase().indexOf('type') === 0) ? 1 : 0;
  for (var i = start; i < lines.length; i++) {
    var c = lines[i].split(';');
    if (c.length < 4) continue;
    var type = (c[0]||'').trim().toUpperCase();
    var d = { type: type, text: (c[1]||'').trim(), explanation: '' };
    if (type === 'PGS') {
      d.options = {A:c[2]||'',B:c[3]||'',C:c[4]||'',D:c[5]||'',E:c[6]||''};
      var hasStandardAnswer = /^[A-E]$/i.test((c[7]||'').trim());
      var answer = hasStandardAnswer ? c[7] : c[6];
      if (!hasStandardAnswer) d.options.E = '';
      d.correctAnswer = (answer||'A').toUpperCase();
      d.explanation = (hasStandardAnswer ? c[8] : c[7] || '').trim();
      d.imageUrl = (c[9]||(!hasStandardAnswer ? c[8] : '')||'').trim();
    }
    else if (type === 'MCMA') {
      d.options = {A:c[2]||'',B:c[3]||'',C:c[4]||'',D:c[5]||'',E:c[6]||''};
      d.correctAnswer = (c[7]||'A').split(',').map(function(x){return x.trim().toUpperCase();});
      d.explanation = (c[8]||'').trim();
      d.imageUrl = (c[9]||'').trim();
    }
    else if (type === 'PGK') {
      var legacyKey = window.parseBooleanAnswerList ? window.parseBooleanAnswerList(c[4]) : null;
      var compactStatements = (c[2]||'').trim();
      var statementText = (c[10]||'').trim() || compactStatements || ((c[1]||'').indexOf('|') !== -1 ? c[1] : '');
      if (statementText === c[1]) d.text = '';
      d.statements = statementText.split('|').map(function(s){return s.trim();}).filter(Boolean);
      d.correctAnswer = window.parseBooleanAnswerList
        ? window.parseBooleanAnswerList(c[7]) || legacyKey
        : null;
      d.explanation = (c[8]||c[5]||'').trim();
      if (!d.correctAnswer || d.correctAnswer.length !== d.statements.length) {
        d.type = 'UNKNOWN';
        d._warn = 'Kunci Benar/Salah tidak valid atau jumlahnya tidak sama dengan jumlah pernyataan.';
      }
      d.imageUrl = (c[9]||c[6]||'').trim();
    }
    else if (type === 'ISIAN') {
      d.correctAnswer = (c[7]||c[2]||'').trim();
      d.explanation = (c[8]||c[3]||'').trim();
      d.imageUrl = (c[9]||c[4]||'').trim();
    }
    else d.type = 'UNKNOWN';
    out.push(d);
  }
  return out;
}

// ============================================
// PREVIEW CSV
// ============================================
function previewCSV() {
  var file = document.getElementById('impFile').files[0];
  var container = document.getElementById('csvPreview');
  if (!file) {
    container.innerHTML = '<div class="empty-state" style="padding:1.5rem;"><p>Pilih file dulu</p></div>';
    return;
  }
  var reader = new FileReader();
  reader.onload = function(e){
    var qs = parseCSVFormat(e.target.result);
    var counts = { PGS:0, MCMA:0, PGK:0, ISIAN:0, UNKNOWN:0 };
    qs.forEach(function(q){ counts[q.type]++; });
    var html = '<div style="background:#fff;padding:1rem;border-radius:8px;border:1px solid #e2e8f0;"><strong>' + qs.length + ' soal</strong> ';
    ['PGS','MCMA','PGK','ISIAN'].forEach(function(t){
      if (counts[t]) html += '<span class="question-type-badge ' + t.toLowerCase() + '">' + t + ':' + counts[t] + '</span> ';
    });
    if (counts.UNKNOWN) html += '<span class="badge badge-error">UNKNOWN:' + counts.UNKNOWN + '</span>';
    html += '</div>';
    container.innerHTML = html;
    window.__csvQuestions = qs;
  };
  reader.readAsText(file);
}

// ============================================
// IMPORT CSV (jalur sesi + jalur Bank Soal)
// ============================================
async function doImportCSV() {
  var sid = document.getElementById('impSession').value;
  var file = document.getElementById('impFile').files[0];
  if (!file) { alert2('Error','Pilih file','error'); return; }

  var reader = new FileReader();
  reader.onload = async function(e){
    var qs = parseCSVFormat(e.target.result).filter(function(q){ return q.type !== 'UNKNOWN'; });
    if (!qs.length) { alert2('Error','Tidak ada soal valid','error'); return; }
    var invalidImage = qs.find(function(q){ return q.imageUrl && !window.normalizeQuestionImageUrl(q.imageUrl); });
    if (invalidImage) { alert2('Error','URL gambar soal "'+invalidImage.text.slice(0,60)+'" harus diawali http:// atau https://.','error'); return; }

    // JALUR BARU: target = Bank Soal
    if (sid === '__BANK__') {
      await saveCsvToBank(qs);
      return;
    }

    if (!sid) { alert2('Error','Pilih sesi atau "Simpan ke Bank Soal"','error'); return; }
    var load = loading('Import...');
    try {
      var batch = db.batch();
      var existing = await db.collection('questions').where('sessionId','==',sid).get();
      var startOrder = existing.size + 1;
      qs.forEach(function(q, i){
        var data = {
          sessionId: sid, type: q.type, text: q.text,
          explanation: q.explanation||'', order: startOrder+i,
          createdAt: firebase.firestore.FieldValue.serverTimestamp(),
          source: 'manual'
        };
        if (q.type === 'PGS' || q.type === 'MCMA') { data.options = q.options; data.correctAnswer = q.correctAnswer; }
        else if (q.type === 'PGK') { data.statements = q.statements; data.correctAnswer = q.correctAnswer; }
        else if (q.type === 'ISIAN') { data.correctAnswer = q.correctAnswer; }
        if (q.imageUrl) data.imageUrl = window.normalizeQuestionImageUrl(q.imageUrl);
        batch.set(db.collection('questions').doc(), data);
      });
      await batch.commit();
      load.close();
      alert2('Berhasil', qs.length + ' soal diimport', 'success', function(){
        document.getElementById('impFile').value = '';
        document.getElementById('csvPreview').innerHTML = '';
        if (window.loadQuestions) window.loadQuestions();
      });
    } catch(err){ load.close(); alert2('Error','Gagal: '+err.message,'error'); }
  };
  reader.readAsText(file);
}

// ============================================
// SIMPAN HASIL CSV KE BANK SOAL
// ============================================
async function saveCsvToBank(qs) {
  var subject = (await window.promptBankMeta('Mapel:', (window.BANK_SUBJECTS && window.BANK_SUBJECTS[0]) || 'Umum'))
                || (window.BANK_SUBJECTS && window.BANK_SUBJECTS[0]) || 'Umum';
  var skill = (await window.promptBankMeta('Skill/Kategori:', (window.BANK_SKILLS && window.BANK_SKILLS[0]) || 'Umum'))
              || (window.BANK_SKILLS && window.BANK_SKILLS[0]) || 'Umum';
  var level = (await window.promptBankMeta('Level (Mudah/Sedang/Sulit):', 'Sedang')) || 'Sedang';
  var tags = (await window.promptBankMeta('Tag (pisahkan koma):', '')) || '';
  var folderId = (await window.promptFolderSelect()) || null;

  var load = loading('Simpan ke Bank Soal...');
  try {
    var batch = db.batch();
    var tagArr = tags.split(',').map(function(t){return t.trim();}).filter(Boolean);
    qs.forEach(function(q){
      var data = {
        type: q.type, text: q.text, explanation: q.explanation || '',
        subject: subject, skill: skill, level: level,
        tags: tagArr, folderId: folderId,
        status: 'active', version: 1,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      };
      if (q.type === 'PGS' || q.type === 'MCMA') { data.options = q.options; data.correctAnswer = q.correctAnswer; }
      else if (q.type === 'PGK') { data.statements = q.statements; data.correctAnswer = q.correctAnswer; }
      else if (q.type === 'ISIAN') { data.correctAnswer = q.correctAnswer; }
      if (q.imageUrl) data.imageUrl = window.normalizeQuestionImageUrl(q.imageUrl);
      batch.set(db.collection('questionBank').doc(), data);
    });
    await batch.commit();
    load.close();
    alert2('Berhasil', qs.length + ' soal disimpan ke <b>Bank Soal</b>.', 'success', function(){
      document.getElementById('impFile').value = '';
      document.getElementById('csvPreview').innerHTML = '';
      if (window.switchSoalSubTab) window.switchSoalSubTab('bank');
    });
  } catch(e) { load.close(); alert2('Error','Gagal: '+e.message,'error'); }
}

// ============================================
// TEMPLATE DOWNLOAD (TXT & CSV)
// ============================================
function downloadTemplate(format) {
  if (format === 'txt') {
    var t =
      '[sesi: 1]\n' +
      '[mapel: B. Inggris]\n\n' +
      '1. What is the capital city of England?\n' +
      'A. Paris\nB. London\nC. Berlin\nD. Madrid\n' +
      'j:b\n\n' +
      '2. Which are greetings? (Choose 2)\n' +
      'A. Good morning\nB. Goodbye night\nC. Good evening\nD. Bad day\n' +
      'j:a,c\n\n' +
      '3. True (B) / False (S):\n' +
      'Statement 1: London is the capital of France\n' +
      'Statement 2: She goes to school every day\n' +
      'Statement 3: They is my friends\n\n' +
      '4. She ___ (go) to school every day.\n' +
      'j:goes\n\n' +
      '[pembahasan]\n' +
      '1. London is the capital of England.\n' +
      '2. Morning and evening are greetings.\n' +
      '3. s,b,s\n' +
      '4. Third person singular uses "goes".';
    window.downloadFile(t, 'template_soal_tka.txt', 'text/plain');
  } else {
    var c =
      'TYPE;TEXT;OPT_A;OPT_B;OPT_C;OPT_D;OPT_E;ANSWER;EXPLANATION;IMAGE_URL;STATEMENTS\n' +
      'PGS;Capital of England?;Paris;London;Berlin;Madrid;;B;London;;\n' +
      'MCMA;Which are greetings?;Good morning;Goodbye;Good evening;Bad day;Nice day;A,C;Morning+evening;;\n' +
      'PGK;Evaluate each statement;;;;;;false,true;St1 false, st2 true;;London is France capital|She goes to school\n' +
      'ISIAN;She ___ (go) to school.;;;;;;goes;goes;;';
    window.downloadFile(c, 'template_soal_tka.csv', 'text/csv');
  }
  toast('Template terdownload', 'success');
}

// ============================================
// EXPORT BANK SOAL KE CSV
// ============================================
function exportBankCsv() {
  window.__bank = window.__bank || { items: [], folders: [] };
  if (!window.__bank.items.length) { alert2('Info','Bank Soal kosong','warning'); return; }

  var header = 'TYPE;TEXT;OPT_A;OPT_B;OPT_C;OPT_D;OPT_E;ANSWER;EXPLANATION;IMAGE_URL;STATEMENTS;SUBJECT;SKILL;LEVEL;TAGS;FOLDER;USAGE';
  var rows = window.__bank.items.map(function(it){
    var oa = (it.options && it.options.A) || '';
    var ob = (it.options && it.options.B) || '';
    var oc = (it.options && it.options.C) || '';
    var od = (it.options && it.options.D) || '';
    var oe = (it.options && it.options.E) || '';
    var ans = it.type==='PGS' ? (it.correctAnswer||'')
            : it.type==='MCMA' ? (it.correctAnswer||[]).join(',')
            : it.type==='PGK' ? (window.parseBooleanAnswerList ? window.parseBooleanAnswerList(it.correctAnswer) || [] : it.correctAnswer||[]).map(function(x){return x?'true':'false';}).join(',')
            : (it.correctAnswer||'');
    var folderName = (it.folderId && (window.__bank.folders||[]).find(function(x){return x.id===it.folderId;}))
      ? (window.__bank.folders.find(function(x){return x.id===it.folderId;}).name||'') : '';
    return [it.type, it.text||'', oa, ob, oc, od, oe, ans, it.explanation||'', it.imageUrl||'',
            (it.statements||[]).join('|'), it.subject||'', it.skill||'', it.level||'', (it.tags||[]).join(','), folderName, it._usageCount||0]
      .map(function(v){ return String(v==null?'':v).replace(/;/g,',').replace(/\n/g,' '); }).join(';');
  });

  var csv = header + '\n' + rows.join('\n');
  window.downloadFile(csv, 'bank_soal_' + Date.now() + '.csv', 'text/csv');
  toast('CSV terdownload','success');
}

// ============================================
// EXPOSE (callable dari inline onclick DOM)
// ============================================
window.previewCSV     = previewCSV;
window.doImportCSV    = doImportCSV;
window.downloadTemplate = downloadTemplate;
window.exportBankCsv  = exportBankCsv;
window.parseCSVFormat = parseCSVFormat;   // expose untuk reuse

console.log('✅ m-soal-impex.js v1.2 loaded');