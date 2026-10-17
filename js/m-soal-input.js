/* #xx | /root/js/m-soal-input.js | v 1.1 | u 17/10/2026 • 17:25:00 | xu : ke-2 | note : #noteresponse
- v1.0 -> v1.1:
  * Input gambar via URL atau Firebase Storage upload, dengan marker [gambar: URL]
    per soal pada input teks.
  * Kunci kategori Benar/Salah dapat ditulis dengan j: atau format lama di
    [pembahasan], dan token jawaban divalidasi agar nilai tidak salah jadi false.
- SUB-MODULE: Input Soal (parse teks → preview → simpan ke sesi atau Bank Soal).
- DIPINDAH DARI manage-soal.js v4.0 (semua fitur identik, tidak dipotong):
  * parseTextFormat: parser teks dengan normalisasi 'j:' + [pembahasan].
  * previewParse: preview hasil parse (tabel + warning soal UNKNOWN).
  * submitParse: simpan ke sesi ATAU Bank Soal (jalur __BANK__).
  * saveParseToBank: simpan hasil parse ke collection `questionBank` dengan metadata.
- SHARED HELPERS (dipakai juga oleh sub-module lain via window):
  * promptBankMeta(title, def) - prompt metadata (mapel/skill/level/tag).
  * promptFolderSelect() - prompt pilih folder dari window.__bank.folders.
  * createFolderPrompt() - buat folder baru inline.
- DEPENDENSI: window.escapeHtml, window.BANK_SUBJECTS, window.BANK_SKILLS,
  window.BANK_LEVELS, S.sessions, window.__lastParsed, window.__bank, window.M,
  window.alert2, window.toast, window.loading, window.db, window.firebase.
- EXPOSE: previewParse, submitParse, promptBankMeta, promptFolderSelect. */

// ============================================
// MEDIA GAMBAR SOAL
// ============================================
function normalizeQuestionImageUrl(value){
  if (!value) return '';
  try {
    var url = new URL(String(value).trim());
    return (url.protocol === 'https:' || url.protocol === 'http:') ? url.href : null;
  } catch(e) {
    return null;
  }
}
window.normalizeQuestionImageUrl = normalizeQuestionImageUrl;

async function uploadQuestionImage(file){
  if (!file) throw new Error('Pilih file gambar terlebih dahulu.');
  var extensions = { 'image/jpeg':'jpg', 'image/png':'png', 'image/webp':'webp', 'image/gif':'gif' };
  if (!extensions[file.type]) throw new Error('Format gambar harus JPG, PNG, WEBP, atau GIF.');
  if (file.size > 5 * 1024 * 1024) throw new Error('Ukuran gambar maksimal 5 MB.');
  if (!window.firebase || typeof firebase.storage !== 'function') {
    throw new Error('Firebase Storage belum tersedia. Muat ulang halaman dan coba lagi.');
  }
  var path = 'question-images/' + Date.now() + '-' + Math.random().toString(36).slice(2) + '.' + extensions[file.type];
  var ref = firebase.storage().ref().child(path);
  var uploaded = await ref.put(file, { contentType:file.type, cacheControl:'public,max-age=31536000' });
  return uploaded.ref.getDownloadURL();
}
window.uploadQuestionImage = uploadQuestionImage;

window.uploadQuestionImageFromInput = async function(fileInputId, urlInputId, statusId, previewId){
  var fileInput = document.getElementById(fileInputId);
  var status = document.getElementById(statusId);
  var file = fileInput && fileInput.files && fileInput.files[0];
  if (!file) {
    if (status) status.textContent = 'Pilih file gambar terlebih dahulu.';
    return;
  }
  if (status) status.textContent = 'Mengunggah gambar...';
  try {
    var url = await uploadQuestionImage(file);
    var urlInput = document.getElementById(urlInputId);
    if (urlInput) {
      urlInput.value = url;
      urlInput.dispatchEvent(new Event('input', { bubbles:true }));
    }
    if (status) status.textContent = 'Upload berhasil. URL gambar sudah terisi.';
    if (previewId) window.previewQuestionImage(url, previewId);
  } catch(error) {
    console.error('[m-soal-input] Gagal mengunggah gambar:', error);
    if (status) status.textContent = 'Upload gagal: ' + (error.message || 'Kesalahan tidak diketahui');
  }
};

window.previewQuestionImage = function(value, previewId){
  var preview = document.getElementById(previewId);
  if (!preview) return;
  var url = normalizeQuestionImageUrl(value);
  preview.innerHTML = url
    ? '<img src="' + escapeHtml(url).replace(/'/g, '&#39;') + '" alt="Pratinjau gambar soal" style="display:block;max-width:100%;max-height:220px;object-fit:contain;border-radius:8px;margin-top:.5rem;">'
    : '';
};

window.insertParseQuestionImage = function(){
  var urlInput = document.getElementById('parseImageUrl');
  var textarea = document.getElementById('parseText');
  var url = normalizeQuestionImageUrl(urlInput && urlInput.value);
  if (!url) {
    alert2('URL gambar tidak valid', 'Masukkan URL gambar yang diawali http:// atau https://.', 'warning');
    return;
  }
  if (!textarea) return;

  var text = textarea.value;
  var questionPattern = /^\s*\d+\.\s+.+$/gm;
  var match, questionOffsets = [];
  while ((match = questionPattern.exec(text)) !== null) {
    var pembahasanAt = text.toLowerCase().indexOf('[pembahasan]');
    if (pembahasanAt !== -1 && match.index >= pembahasanAt) break;
    questionOffsets.push(match.index);
  }
  if (!questionOffsets.length) {
    alert2('Soal belum ditemukan', 'Tambahkan nomor dan teks soal sebelum menyisipkan gambar.', 'warning');
    return;
  }
  var selectedOffset = questionOffsets[0];
  questionOffsets.forEach(function(offset){ if (offset <= textarea.selectionStart) selectedOffset = offset; });
  var lineEnd = text.indexOf('\n', selectedOffset);
  var insertAt = lineEnd === -1 ? text.length : lineEnd + 1;
  var marker = '[gambar: ' + url + ']\n';
  textarea.value = text.slice(0, insertAt) + marker + text.slice(insertAt);
  textarea.focus();
  textarea.setSelectionRange(insertAt + marker.length, insertAt + marker.length);
  window.__lastParsed = null;
};

function parseBooleanAnswerList(raw){
  var value = String(raw == null ? '' : raw).trim().replace(/^(?:(?:j|kunci|jawaban)\s*:\s*)/i, '');
  if (!value) return null;
  var tokens = value.split(/\s*(?:[,;|/])\s*|\s+(?:dan|and)\s+/i);
  var answers = [];
  for (var i=0;i<tokens.length;i++) {
    var token = tokens[i].trim().toLowerCase();
    if (/^(b|benar|true|t|1|y|ya|yes)$/.test(token)) answers.push(true);
    else if (/^(s|salah|false|f|0|n|no|tidak)$/.test(token)) answers.push(false);
    else return null;
  }
  return answers;
}
window.parseBooleanAnswerList = parseBooleanAnswerList;

// ============================================
// PARSER TEKS (IDENTIK v3.1)
// ============================================
function parseTextFormat(text) {
  // Normalisasi 1: pisahkan 'j:' yang menempel di akhir baris soal
  text = text.replace(/[ \t]+j\s*:/gi, '\nj:');
  // Normalisasi 2: line breaks konsisten
  var lines = text.split('\n').map(function(l){ return l.replace(/\r$/, ''); });

  var sessionId = null, subject = null;
  var questions = [];
  var pembahasanMap = {};

  // Metadata: [sesi: ...] dan [mapel: ...]
  lines.forEach(function(line){
    var m;
    if ((m = line.match(/^\[sesi\s*:\s*([^\]]+)\]/i))) sessionId = m[1].trim();
    if ((m = line.match(/^\[mapel\s*:\s*([^\]]+)\]/i))) subject = m[1].trim();
  });

  // Pass 1: ambil section [pembahasan]
  var inPemb = false, currentPemb = null;
  lines.forEach(function(line){
    if (line.trim().toLowerCase() === '[pembahasan]') { inPemb = true; return; }
    if (inPemb) {
      var m = line.match(/^\s*(\d+)\.\s*(.+)/);
      if (m) { currentPemb = parseInt(m[1]); pembahasanMap[currentPemb] = m[2].trim(); }
      else if (currentPemb !== null && line.trim()) pembahasanMap[currentPemb] += ' ' + line.trim();
    }
  });

  // Pass 2: parse soal + opsi + statement + j:
  var current = null;
  var save = function(){
    if (current) { questions.push(current); current = null; }
  };

  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    if (line.trim().toLowerCase() === '[pembahasan]') { save(); break; }
    if (line.match(/^\[(sesi|mapel)\s*:/i)) continue;
    if (!line.trim()) continue;

    // Soal baru: "1. Teks soal..."
    var qMatch = line.match(/^\s*(\d+)\.\s+(.+)/);
    if (qMatch) {
      save();
      current = { number: parseInt(qMatch[1]), text: qMatch[2].trim(), options: {}, statements: [], imageUrl:'', _rawAnswer: null, explicitType:'' };
      continue;
    }
    if (!current) continue;

    var imageMatch = line.match(/^\s*\[gambar\s*:\s*([^\]]+)\]\s*$/i);
    if (imageMatch) { current.imageUrl = imageMatch[1].trim(); continue; }

    var explicitTypeMatch = line.match(/^\s*\[tipe\s*:\s*([A-Z0-9_]+)\]\s*$/i);
    if (explicitTypeMatch) { current.explicitType = explicitTypeMatch[1].toUpperCase(); continue; }

    // Opsi: "A. Teks opsi"
    var optMatch = line.match(/^\s*([A-E])\.\s+(.+)/i);
    if (optMatch) { current.options[optMatch[1].toUpperCase()] = optMatch[2].trim(); continue; }

    // Statement PGK: "Statement 1: Teks pernyataan"
    var stMatch = line.match(/^\s*Statement\s*(\d+)\s*:\s*(.+)/i);
    if (stMatch) { current.statements.push(stMatch[2].trim()); continue; }

    // Kunci jawaban: "j: b" atau "j: a,c" atau "j: goes"
    var jMatch = line.match(/^\s*j\s*:\s*(.+)/i);
    if (jMatch) { current._rawAnswer = jMatch[1].trim(); continue; }

    // Lanjutan teks soal
    current.text += ' ' + line.trim();
  }
  save();

  // Tentukan tipe soal berdasarkan struktur
  questions.forEach(function(q){
    q.text = q.text.trim();

    if (q.explicitType === 'JEC_TF') {
      var tfAnswers = parseBooleanAnswerList(q._rawAnswer || '');
      q.type = 'JEC_TF';
      q.correctAnswer = tfAnswers && tfAnswers.length === 1 ? tfAnswers[0] : null;
      q.explanation = pembahasanMap[q.number] || '';
    }
    else if (q.explicitType === 'JEC_SA') {
      q.type = 'JEC_SA';
      q.correctAnswer = q._rawAnswer || '';
      q.explanation = pembahasanMap[q.number] || '';
    }
    else if (q.statements.length > 0) {
      var pemb = (pembahasanMap[q.number] || '').trim();
      var keyRaw = q._rawAnswer || pemb;
      var answers = parseBooleanAnswerList(keyRaw);
      if (answers && answers.length === q.statements.length) {
        q.type = 'PGK';
        q.correctAnswer = answers;
        q.explanation = q._rawAnswer && parseBooleanAnswerList(pemb) ? '' : pemb;
      } else {
        q.type = 'UNKNOWN';
        q.correctAnswer = [];
        q.explanation = '';
        q._warn = answers
          ? 'Kategori Benar/Salah: jumlah kunci (' + answers.length + ') harus sama dengan jumlah pernyataan (' + q.statements.length + '). Gunakan j: benar,salah.'
          : 'Kategori Benar/Salah: kunci tidak valid. Gunakan j: benar,salah atau j: true,false.';
      }
    }
    else if (Object.keys(q.options).length >= 2 && q._rawAnswer && /^[A-E]$/i.test(q._rawAnswer)) {
      q.type = 'PGS';
      q.correctAnswer = q._rawAnswer.toUpperCase();
      q.explanation = pembahasanMap[q.number] || '';
    }
    else if (Object.keys(q.options).length >= 2 && q._rawAnswer && /^[A-E]([,|][A-E])+$/i.test(q._rawAnswer)) {
      q.type = 'MCMA';
      q.correctAnswer = q._rawAnswer.split(/[,|]/).map(function(x){ return x.trim().toUpperCase(); });
      q.explanation = pembahasanMap[q.number] || '';
    }
    else if (q._rawAnswer) {
      q.type = 'ISIAN';
      q.correctAnswer = q._rawAnswer;
      q.explanation = pembahasanMap[q.number] || '';
    }
    else {
      q.type = 'UNKNOWN';
      q._warn = 'Tidak bisa deteksi tipe — cek format (j: / Statement / pilihan)';
    }
    delete q._rawAnswer;
  });

  return { sessionId: sessionId, subject: subject, questions: questions, pembahasanMap: pembahasanMap };
}

// ============================================
// PREVIEW PARSE
// ============================================
function previewParse() {
  var text = document.getElementById('parseText').value;
  var container = document.getElementById('parsePreview');
  if (!text.trim()) {
    container.innerHTML = '<div class="empty-state" style="padding:1.5rem;"><p>Paste teks dulu</p></div>';
    return;
  }

  try {
    var parsed = parseTextFormat(text);
    var counts = { PGS:0, MCMA:0, PGK:0, ISIAN:0, UNKNOWN:0 };
    parsed.questions.forEach(function(q){ counts[q.type]++; });

    var html = '<div style="background:#fff;padding:1rem;border-radius:8px;border:1px solid #e2e8f0;">';
    html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.75rem;flex-wrap:wrap;gap:.5rem;">';
    html += '<strong>Hasil Parse: ' + parsed.questions.length + ' soal</strong>';
    html += '<div style="display:flex;gap:.375rem;flex-wrap:wrap;">';
    ['PGS','MCMA','PGK','ISIAN'].forEach(function(t){
      if (counts[t] > 0) html += '<span class="question-type-badge ' + t.toLowerCase() + '">' + t + ': ' + counts[t] + '</span>';
    });
    if (counts.UNKNOWN > 0) html += '<span class="badge badge-error">UNKNOWN: ' + counts.UNKNOWN + '</span>';
    html += '</div></div>';

    if (parsed.sessionId) html += '<div style="font-size:.75rem;color:#64748b;margin-bottom:.5rem;">Sesi (teks): <b>' + escapeHtml(parsed.sessionId) + '</b>' + (parsed.subject ? ' | Mapel: <b>' + escapeHtml(parsed.subject) + '</b>' : '') + '</div>';

    html += '<div class="table-wrapper"><table class="table"><thead><tr><th>#</th><th>Tipe</th><th>Soal</th><th>Kunci</th></tr></thead><tbody>';
    parsed.questions.forEach(function(q){
      var tc = q.type === 'UNKNOWN' ? 'error' : q.type.toLowerCase();
      var key = '-';
      if (q.type === 'PGS') key = q.correctAnswer;
      else if (q.type === 'MCMA') key = (q.correctAnswer||[]).join(',');
      else if (q.type === 'PGK') key = (q.correctAnswer||[]).map(function(x){ return x?'B':'S'; }).join(',');
      else if (q.type === 'ISIAN') key = '<code>' + escapeHtml(q.correctAnswer) + '</code>';
      var warn = q._warn ? '<div style="color:#dc2626;font-size:.7rem;">⚠ ' + escapeHtml(q._warn) + '</div>' : '';
      html += '<tr><td>' + q.number + '</td><td><span class="question-type-badge ' + tc + '">' + (q.type==='PGK'?'Kategori B/S':q.type) + '</span></td>' +
        '<td style="max-width:300px;font-size:.8125rem;">' + escapeHtml(q.text.slice(0,120)) +
        (q.imageUrl ? '<div><img src="'+escapeHtml(q.imageUrl).replace(/'/g,'&#39;')+'" alt="Gambar soal" style="max-width:160px;max-height:90px;object-fit:contain;margin-top:.25rem;border-radius:4px;"></div>' : '') + warn + '</td>' +
        '<td style="font-size:.8125rem;">' + key + '</td></tr>';
    });
    html += '</tbody></table></div>';

    var unk = parsed.questions.filter(function(q){ return q.type === 'UNKNOWN'; });
    if (unk.length) html += '<div style="background:#fee2e2;padding:.75rem;border-radius:6px;margin-top:.75rem;font-size:.8125rem;color:#991b1b;"><strong>⚠ ' + unk.length + ' soal gagal dideteksi</strong> — cek format.</div>';

    html += '</div>';
    container.innerHTML = html;
    window.__lastParsed = parsed;
  } catch(e) {
    container.innerHTML = '<div style="background:#fee2e2;padding:.75rem;border-radius:6px;color:#991b1b;">Error: ' + escapeHtml(e.message) + '</div>';
  }
}

// ============================================
// SUBMIT PARSE (jalur sesi + jalur Bank Soal)
// ============================================
async function submitParse() {
  var text = document.getElementById('parseText').value;
  if (!text.trim()) { alert2('Info','Teks kosong','warning'); return; }
  if (!window.__lastParsed) previewParse();
  var parsed = window.__lastParsed;
  if (!parsed || parsed.questions.length === 0) { alert2('Error','Tidak ada soal terdeteksi','error'); return; }
  var invalidImageQuestion = parsed.questions.find(function(q){ return q.imageUrl && !normalizeQuestionImageUrl(q.imageUrl); });
  if (invalidImageQuestion) {
    alert2('URL gambar tidak valid', 'Gambar pada soal ' + invalidImageQuestion.number + ' harus menggunakan URL http:// atau https://.', 'error');
    return;
  }

  var sid = document.getElementById('parseSession').value || parsed.sessionId;

  var unk = parsed.questions.filter(function(q){ return q.type === 'UNKNOWN'; });
  if (unk.length && !confirm(unk.length + ' soal gagal deteksi akan di-skip. Lanjut?')) return;

  // JALUR BARU: target = Bank Soal
  if (sid === '__BANK__') {
    await saveParseToBank(parsed);
    return;
  }

  if (!sid) { alert2('Error','Pilih sesi acuan atau "Simpan ke Bank Soal"','error'); return; }
  var sess = (S.sessions||[]).find(function(s){ return s.id === sid; });
  if (!sess) { alert2('Error','Sesi "'+sid+'" tidak ditemukan. Pilih dari dropdown.','error'); return; }

  var load = loading('Menyimpan...');
  try {
    var existing = await db.collection('questions').where('sessionId','==',sid).get();
    var existingDocs=[];
    existing.forEach(function(doc){if(doc.data().deleted!==true)existingDocs.push(doc);});
    existingDocs.sort(function(a,b){return (Number(a.data().order)||0)-(Number(b.data().order)||0);});
    var replacing=window.__questionEditorSessionId===sid;
    if(replacing&&!confirm('Simpan perubahan dengan mengganti seluruh soal aktif pada sesi ini? Attempt yang sudah selesai tetap tersimpan.')){
      load.close();
      return;
    }
    var startOrder = replacing ? 0 : existingDocs.reduce(function(max,doc){return Math.max(max,Number(doc.data().order)||0);},0);
    var batch = db.batch();
    var saved = 0;

    parsed.questions.forEach(function(q, i){
      if (q.type === 'UNKNOWN') return;
      var data = {
        sessionId: sid, type: q.type, text: q.text,
        explanation: q.explanation||'', order: startOrder + i + 1,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        source: 'manual'
      };
      if (q.imageUrl) data.imageUrl = normalizeQuestionImageUrl(q.imageUrl);
      if (q.type === 'PGS' || q.type === 'MCMA') { data.options = q.options; data.correctAnswer = q.correctAnswer; }
      else if (q.type === 'PGK') { data.statements = q.statements; data.correctAnswer = q.correctAnswer; }
      else if (q.type === 'ISIAN') { data.correctAnswer = q.correctAnswer; }
      var ref=replacing&&existingDocs[saved]
        ? db.collection('questions').doc(existingDocs[saved].id)
        : db.collection('questions').doc();
      batch.set(ref, data);
      saved++;
    });
    if(replacing) existingDocs.slice(saved).forEach(function(doc){batch.delete(db.collection('questions').doc(doc.id));});

    await batch.commit();
    load.close();
    alert2('Berhasil', saved + ' soal disimpan ke <b>' + escapeHtml(sess.name) + '</b>.', 'success', function(){
      if(!replacing) document.getElementById('parseText').value = '';
      document.getElementById('parsePreview').innerHTML = '';
      window.__lastParsed = null;
      clearQuestionDraft(sid);
      if(window.loadSessions){
        Promise.resolve(window.loadSessions()).catch(function(error){
          console.error('[m-soal-input] Soal tersimpan, tetapi daftar sesi gagal diperbarui:',error);
          if(window.toast) toast('Soal tersimpan, tetapi daftar sesi gagal diperbarui.','warning');
        });
      }
      if (window.loadQuestions) window.loadQuestions();
    });
  } catch(e) { load.close(); alert2('Error','Gagal: '+e.message,'error'); }
}

function questionInputDraftKey(sessionId){return 'jec-question-input-draft:'+sessionId;}
function clearQuestionDraft(sessionId){
  try{localStorage.removeItem(questionInputDraftKey(sessionId));}
  catch(error){console.warn('[m-soal-input] Draft tidak dapat dihapus:',error);}
  try{sessionStorage.removeItem('questionEditorSessionId');}catch(error){}
  window.__questionEditorSessionId='';
}

function serializeSessionQuestions(questions){
  var blocks=questions.map(function(question,index){
    var lines=[(index+1)+'. '+String(question.text||'')];
    if(question.imageUrl) lines.push('[gambar: '+question.imageUrl+']');
    if(question.type==='PGS'||question.type==='MCMA'){
      ['A','B','C','D','E'].forEach(function(key){if(question.options&&question.options[key])lines.push(key+'. '+question.options[key]);});
      lines.push('j: '+(Array.isArray(question.correctAnswer)?question.correctAnswer.join(','):question.correctAnswer||''));
    }else if(question.type==='PGK'){
      (question.statements||[]).forEach(function(statement,i){lines.push('Statement '+(i+1)+': '+statement);});
      lines.push('j: '+(question.correctAnswer||[]).map(function(value){return value?'benar':'salah';}).join(','));
    }else if(question.type==='ISIAN'){
      lines.push('j: '+(Array.isArray(question.correctAnswer)?question.correctAnswer.join('|'):question.correctAnswer||''));
    }
    return lines.join('\n');
  });
  return blocks.join('\n\n');
}

window.loadSessionQuestionsIntoEditor=async function(sessionId){
  var session=(window.S&&S.sessions||[]).find(function(item){return item.id===sessionId;});
  if(!session){
    var sessionDoc=await db.collection('sessions').doc(sessionId).get();
    if(!sessionDoc.exists) throw new Error('Sesi tidak ditemukan.');
    session=Object.assign({id:sessionId},sessionDoc.data());
  }
  if(session.mode==='assessment'){
    if(!window.loadAssessmentQuestionsIntoEditor) throw new Error('Editor Asesmen belum siap.');
    if(window.switchSoalSubTab) window.switchSoalSubTab('assessment-input');
    return window.loadAssessmentQuestionsIntoEditor(sessionId);
  }
  if(window.switchSoalSubTab) window.switchSoalSubTab('input');
  if(window.loadSessionsDropdown) await window.loadSessionsDropdown();
  var target=document.getElementById('parseSession');
  if(target) target.value=sessionId;
  var snapshot=await db.collection('questions').where('sessionId','==',sessionId).get();
  var questions=[];
  snapshot.forEach(function(doc){
    var question=Object.assign({id:doc.id},doc.data());
    if(question.deleted!==true) questions.push(question);
  });
  questions.sort(function(a,b){return (Number(a.order)||0)-(Number(b.order)||0);});
  var textarea=document.getElementById('parseText');
  if(!textarea) throw new Error('Area input soal belum tampil.');
  window.__questionEditorSessionId=sessionId;
  textarea.__loadedQuestionEditorSession=sessionId;
  try{sessionStorage.setItem('questionEditorSessionId',sessionId);}catch(error){}
  var draft=null;
  try{draft=localStorage.getItem(questionInputDraftKey(sessionId));}
  catch(error){console.error('[m-soal-input] Draft tidak dapat dibaca:',error);}
  textarea.value=draft===null?serializeSessionQuestions(questions):draft;
  var preview=document.getElementById('parsePreview');
  if(preview) preview.innerHTML='';
  return questions.length;
};

async function restoreSessionEditorDraft(){
  var textarea=document.getElementById('parseText');
  var select=document.getElementById('parseSession');
  if(!textarea||!select||!select.options.length) return;
  var sessionId='';
  try{sessionId=sessionStorage.getItem('questionEditorSessionId')||'';}catch(error){}
  var storedSession=(window.S&&S.sessions||[]).find(function(item){return item.id===sessionId;});
  if(storedSession&&storedSession.mode==='assessment') return;
  if(!sessionId||textarea.__loadedQuestionEditorSession===sessionId||
     !Array.prototype.some.call(select.options,function(option){return option.value===sessionId;})) return;
  select.value=sessionId;
  var draft=null;
  try{draft=localStorage.getItem(questionInputDraftKey(sessionId));}
  catch(error){console.error('[m-soal-input] Draft tidak dapat dibaca:',error);}
  if(draft!==null){
    textarea.value=draft;
    textarea.__loadedQuestionEditorSession=sessionId;
    window.__questionEditorSessionId=sessionId;
    return;
  }
  await window.loadSessionQuestionsIntoEditor(sessionId);
}

window.clearParseDraft=function(){
  var select=document.getElementById('parseSession');
  var sessionId=select&&select.value;
  var textarea=document.getElementById('parseText');
  if(textarea) textarea.value='';
  var preview=document.getElementById('parsePreview');
  if(preview) preview.innerHTML='';
  window.__lastParsed=null;
  if(sessionId) clearQuestionDraft(sessionId);
};

document.addEventListener('input',function(event){
  if(!event.target||event.target.id!=='parseText') return;
  var sessionId=window.__questionEditorSessionId||(document.getElementById('parseSession')||{}).value;
  if(!sessionId) return;
  try{localStorage.setItem(questionInputDraftKey(sessionId),event.target.value);}
  catch(error){console.error('[m-soal-input] Gagal menyimpan draft input:',error);}
});

var questionEditorObserver=new MutationObserver(function(){
  restoreSessionEditorDraft().catch(function(error){
    console.error('[m-soal-input] Gagal memulihkan editor sesi:',error);
  });
});
if(document.body) questionEditorObserver.observe(document.body,{childList:true,subtree:true});

// ============================================
// SHARED HELPERS (dipakai sub-module lain via window)
// ============================================
async function promptBankMeta(title, def){
  if (window.M && typeof M.prompt === 'function') {
    return await M.prompt(title, { defaultValue: (def===undefined||def===null)?'':String(def) });
  }
  return window.prompt(title, (def===undefined||def===null)?'':String(def));
}

async function promptFolderSelect(){
  window.__bank = window.__bank || { folders: [] };
  if (!window.__bank.folders || !window.__bank.folders.length) {
    if (confirm('Belum ada folder. Buat folder baru?')) { await createFolderPrompt(); }
    return null;
  }
  var lines = window.__bank.folders.map(function(f,i){ return (i+1) + '. ' + (f.name||'(tanpa nama)'); }).join('\n');
  var input = await promptBankMeta('Pilih folder (ketik nomor, atau kosongkan untuk tanpa folder):\n\n' + lines + '\n', '');
  if (!input) return null;
  var idx = parseInt(input) - 1;
  if (idx >= 0 && idx < window.__bank.folders.length) return window.__bank.folders[idx].id;
  return null;
}

async function createFolderPrompt(){
  var name = await promptBankMeta('Nama folder baru:', '');
  if (!name) return;
  try {
    await db.collection('questionFolders').doc().set({
      name: name,
      order: ((window.__bank && window.__bank.folders) || []).length + 1,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    toast('Folder "' + name + '" ditambahkan','success');
    // Reload folders ke window.__bank
    var snap = await db.collection('questionFolders').orderBy('order').get();
    window.__bank = window.__bank || {};
    window.__bank.folders = [];
    snap.forEach(function(d){ window.__bank.folders.push(Object.assign({id:d.id}, d.data())); });
  } catch(e) { alert2('Error','Gagal: '+e.message,'error'); }
}

// ============================================
// SIMPAN HASIL PARSE KE BANK SOAL
// ============================================
async function saveParseToBank(parsed) {
  // Prompt metadata ringkas (gunakan subject dari [mapel:] jika ada)
  var subject = (await promptBankMeta('Mapel:', parsed.subject || (window.BANK_SUBJECTS && window.BANK_SUBJECTS[0]) || 'Umum'))
                || parsed.subject || (window.BANK_SUBJECTS && window.BANK_SUBJECTS[0]) || 'Umum';
  var skill = (await promptBankMeta('Skill/Kategori:', (window.BANK_SKILLS && window.BANK_SKILLS[0]) || 'Umum'))
              || (window.BANK_SKILLS && window.BANK_SKILLS[0]) || 'Umum';
  var level = (await promptBankMeta('Level (Mudah/Sedang/Sulit):', 'Sedang')) || 'Sedang';
  var tags = (await promptBankMeta('Tag (pisahkan koma):', '')) || '';
  var folderId = (await promptFolderSelect()) || null;

  var load = loading('Simpan ke Bank Soal...');
  try {
    var batch = db.batch();
    var saved = 0;
    var tagArr = tags.split(',').map(function(t){return t.trim();}).filter(Boolean);

    parsed.questions.forEach(function(q){
      if (q.type === 'UNKNOWN') return;
      var data = {
        type: q.type,
        text: q.text,
        explanation: q.explanation || '',
        subject: subject, skill: skill, level: level,
        tags: tagArr, folderId: folderId,
        status: 'active', version: 1,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      };
      if (q.imageUrl) data.imageUrl = normalizeQuestionImageUrl(q.imageUrl);
      if (q.type === 'PGS' || q.type === 'MCMA') { data.options = q.options; data.correctAnswer = q.correctAnswer; }
      else if (q.type === 'PGK') { data.statements = q.statements; data.correctAnswer = q.correctAnswer; }
      else if (q.type === 'ISIAN') { data.correctAnswer = q.correctAnswer; }
      batch.set(db.collection('questionBank').doc(), data);
      saved++;
    });

    await batch.commit();
    load.close();
    alert2('Berhasil', saved + ' soal disimpan ke <b>Bank Soal</b>.', 'success', function(){
      document.getElementById('parseText').value = '';
      document.getElementById('parsePreview').innerHTML = '';
      window.__lastParsed = null;
      // Pindah ke sub-tab Bank Soal (lewat orchestrator)
      if (window.switchSoalSubTab) window.switchSoalSubTab('bank');
    });
  } catch(e) { load.close(); alert2('Error','Gagal: '+e.message,'error'); }
}

// ============================================
// EXPOSE (callable dari inline onclick DOM)
// ============================================
window.previewParse      = previewParse;
window.submitParse       = submitParse;
window.promptBankMeta    = promptBankMeta;
window.promptFolderSelect= promptFolderSelect;
window.createFolderPrompt= createFolderPrompt;
window.parseTextFormat   = parseTextFormat;   // expose juga untuk sub-impex bisa pakai

console.log('✅ m-soal-input.js v1.0 loaded');