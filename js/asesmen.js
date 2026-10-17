/* Assessment session management and assessment-only question import. */
(function(){
  'use strict';

  var TYPE_A = ['JEC_PGS','JEC_MCMA','JEC_PGK','JEC_SA','JEC_TF'];
  var TYPE_B = ['JEC_CT','JEC_MT','JEC_EI','JEC_ST','JEC_IT','JEC_DC'];
  var TYPE_LABELS = {
    JEC_PGS:'Pilihan Ganda Sederhana', JEC_MCMA:'Pilihan Ganda Kompleks (MCMA)',
    JEC_PGK:'Kategori Benar/Salah', JEC_SA:'Short Answer', JEC_TF:'Benar/Salah',
    JEC_CT:'Cloze Test', JEC_MT:'Matching Test', JEC_EI:'Error Identification',
    JEC_ST:'Sentence Transformation', JEC_IT:'Interactive Test', JEC_DC:'Dialog Completion'
  };
  var TYPE_ALIASES = {
    PGS:'JEC_PGS', MCMA:'JEC_MCMA', PGK:'JEC_PGK', ISIAN:'JEC_SA',
    JEC_PGS:'JEC_PGS', JEC_MCMA:'JEC_MCMA', JEC_PGK:'JEC_PGK',
    JEC_SA:'JEC_SA', JEC_TF:'JEC_TF', JEC_CT:'JEC_CT', JEC_MT:'JEC_MT',
    JEC_EI:'JEC_EI', JEC_ST:'JEC_ST', JEC_IT:'JEC_IT', JEC_DC:'JEC_DC'
  };
  var AS = { targetSession:'', textQuestions:null, csvQuestions:null, editSessionId:'' };

  function canonicalType(type){ return TYPE_ALIASES[String(type||'').toUpperCase()] || ''; }
  function questionDraftKey(sessionId){ return 'jec-assessment-draft:' + sessionId; }
  function selectedTypeA(){
    return Array.prototype.slice.call(document.querySelectorAll('#assessmentTypeA input[type="checkbox"]:checked'))
      .map(function(input){ return input.value; });
  }

  function typeBTemplate(type){
    var examples = {
      JEC_CT:'1. Fill in the blank: [gap_1]\nDATA: {"gaps":[{"id":"gap_1","options":["A","B"],"correctAnswer":"A"}]}',
      JEC_MT:'1. Match each item with its pair.\nDATA: {"leftItems":["Premis 1","Premis 2"],"rightItems":["Respons A","Respons B"],"correctAnswer":{"0":"1","1":"0"}}',
      JEC_EI:'1. Select the incorrect phrase.\nA. Fragmen benar\nB. Fragmen salah\nj: B',
      JEC_ST:'1. Transform the sentence without changing its meaning.\nj: jawaban kalimat yang benar',
      JEC_IT:'1. Choose the correct response based on the media.\n[media: https://example.com/gambar.jpg]\n[interaction: JEC_PGS]\nA. Opsi A\nB. Opsi B\nj: A',
      JEC_DC:'1. Complete the dialogue.\nDATA: {"dialogue":[{"speaker":"A","text":"Hello!"},{"speaker":"B","text":"[blank]"}],"options":["Hi!","Goodbye!"],"correctAnswer":"0"}'
    };
    return examples[type] || '1. Teks soal atau instruksi\nDATA: {}';
  }

  function escapeJsonData(data){
    return JSON.stringify(data || {}).replace(/</g,'\\u003c');
  }

  function parseSpecialAssessmentText(text,type){
    var blocks=parseDelimitedQuestionBlocks(text);
    if (!blocks.length) throw new Error('Tidak ada soal bernomor yang ditemukan.');
    return blocks.map(function(block,index){
      var question={number:index+1,type:type,text:block.text||'',explanation:'',options:{},imageUrl:''};
      var dataRaw='';
      var answerRaw='';
      var imageRaw='';
      var mediaRaw='';
      var interactionType='';
      block.lines.forEach(function(line){
        var value=line.trim();
        if (!value) return;
        var match=value.match(/^\[data:\s*(.*)\]$/i);
        if (match) { dataRaw=match[1]; return; }
        match=value.match(/^data\s*:\s*(.*)$/i);
        if (match) { dataRaw=match[1]; return; }
        match=value.match(/^\[gambar\s*:\s*([^\]]+)\]$/i);
        if (match) { imageRaw=match[1].trim(); return; }
        match=value.match(/^\[media\s*:\s*([^\]]+)\]$/i);
        if (match) { mediaRaw=match[1].trim(); return; }
        match=value.match(/^\[interaction\s*:\s*([^\]]+)\]$/i);
        if (match) { interactionType=canonicalType(match[1]); return; }
        match=value.match(/^\[pembahasan\s*:\s*(.*)\]$/i);
        if (match) { question.explanation=match[1].trim(); return; }
        match=value.match(/^j\s*:\s*(.+)$/i);
        if (match) { answerRaw=match[1].trim(); return; }
        match=value.match(/^([A-E])\.\s+(.+)$/i);
        if (match) { question.options[match[1].toUpperCase()]=match[2].trim(); return; }
        question.text+=(question.text?' ':'')+value;
      });
      if (dataRaw) {
        try { Object.assign(question,JSON.parse(dataRaw)); }
        catch(error){ throw new Error('Data JSON soal '+question.number+' tidak valid: '+error.message); }
      }
      question.type=type;
      question.number=index+1;
      if (imageRaw) question.imageUrl=imageRaw;
      if (type==='JEC_EI'&&answerRaw) question.correctAnswer=answerRaw.toUpperCase();
      if (type==='JEC_ST') question.correctAnswer=question.correctAnswer || answerRaw;
      if (type==='JEC_IT') {
        question.mediaUrl=mediaRaw || question.mediaUrl || '';
        question.interactionType=interactionType || question.interactionType || 'JEC_PGS';
        if (question.interactionType==='JEC_PGS' && Object.keys(question.options).length && answerRaw) question.correctAnswer=answerRaw.toUpperCase();
        else if(question.interactionType==='JEC_MCMA'&&Object.keys(question.options).length&&answerRaw){
          question.correctAnswer=answerRaw.split(/[,|]/).map(function(key){return key.trim().toUpperCase();}).filter(Boolean);
        }
        else if (question.interactionType==='JEC_SA' && answerRaw) question.correctAnswer=answerRaw;
      }
      return question;
    });
  }

  function parseDelimitedQuestionBlocks(text){
    var blocks=[],current=null;
    String(text||'').replace(/\r/g,'').split('\n').forEach(function(line){
      var header=line.match(/^\s*(\d+)\.\s*(.*)$/);
      if (header) {
        if (current) blocks.push(current);
        current={text:header[2]||'',lines:[]};
      } else if (current) current.lines.push(line);
    });
    if (current) blocks.push(current);
    blocks.forEach(function(block){
      if (!block.text) {
        var first=block.lines.findIndex(function(line){return line.trim() && !/^(?:\[|data\s*:|j\s*:|[A-E]\.)/i.test(line.trim());});
        if (first!==-1) block.text=block.lines.splice(first,1)[0].trim();
      }
    });
    return blocks;
  }

  function esc(value){
    return String(value == null ? '' : value).replace(/&/g,'&amp;').replace(/</g,'&lt;')
      .replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }

  function modeLabel(session){
    if (session.status === false) return '<span class="badge badge-error">Off</span>';
    return '<span class="badge badge-success">Aktif</span>';
  }

  function renderSessionList(){
    var target = document.getElementById('assessmentSessionList');
    if (!target) return;
    var sessions = (window.S && S.sessions || []).filter(function(session){
      return session.mode === 'assessment' && session.deleted !== true;
    });
    if (!sessions.length) {
      target.innerHTML = '<div class="empty-state"><span class="material-icons">assignment_turned_in</span>' +
        '<p>Belum ada sesi Asesmen.</p><p style="font-size:.8125rem;color:#64748b;">Klik "Tambah Sesi Asesmen" untuk membuat ulangan baru.</p></div>';
      return;
    }
    target.innerHTML = sessions.map(function(session){
      var stats = S.sessionStats && S.sessionStats[session.id] || {q:0,done:0,assigned:0};
      var safeId = esc(session.id).replace(/'/g,'&#39;');
      var date = window.fmtDateSesi ? fmtDateSesi(session.startTime) : '-';
      return '<div class="session-card" style="margin-bottom:.75rem;"><div class="session-card-header">' +
        '<div class="session-card-title" style="flex:1;min-width:0;"><div style="display:flex;align-items:center;gap:.5rem;flex-wrap:wrap;">' +
        '<span class="material-icons" style="color:#2563eb;">assignment_turned_in</span><strong>'+esc(session.name)+'</strong>' +
        '<span class="badge badge-info">Asesmen</span>'+modeLabel(session)+
        (session.visible === false ? '<span class="badge badge-warning">Hidden</span>' : '')+
        (session.code ? '<span class="badge badge-info" style="font-family:monospace;">'+esc(session.code)+'</span>' : '')+
        '</div><div class="session-card-meta" style="display:flex;gap:.75rem;flex-wrap:wrap;margin-top:.5rem;font-size:.75rem;color:#64748b;">' +
        '<span onclick="gotoSoalSession(\''+safeId+'\')" title="Edit soal sesi" style="cursor:pointer;color:#047857;"><span class="material-icons" style="font-size:14px;vertical-align:middle;">quiz</span> <u>'+stats.q+' soal</u></span>' +
        '<span><span class="material-icons" style="font-size:14px;vertical-align:middle;">groups</span> '+stats.assigned+' siswa</span>' +
        '<span><span class="material-icons" style="font-size:14px;vertical-align:middle;">task_alt</span> '+stats.done+' selesai</span>' +
        '<span><span class="material-icons" style="font-size:14px;vertical-align:middle;">schedule</span> '+esc(date)+'</span>' +
        '</div></div><div class="session-card-actions" style="display:flex;gap:.375rem;flex-wrap:wrap;">' +
        '<button class="btn btn-secondary btn-sm" onclick="gotoSoalSession(\''+safeId+'\')" title="Kelola soal"><span class="material-icons">quiz</span></button>' +
        '<button class="btn btn-secondary btn-sm" onclick="editSession(\''+safeId+'\')" title="Edit sesi"><span class="material-icons">edit</span></button>' +
        '<button class="btn btn-secondary btn-sm" onclick="toggleSessIcon(\''+safeId+'\',\'status\')" title="Aktif/Nonaktif"><span class="material-icons">'+(session.status?'toggle_on':'toggle_off')+'</span></button>' +
        '<button class="btn btn-secondary btn-sm" onclick="toggleSessIcon(\''+safeId+'\',\'visible\')" title="Tampilkan/Sembunyikan"><span class="material-icons">'+(session.visible?'visibility':'visibility_off')+'</span></button>' +
        '<button class="btn btn-error btn-sm" onclick="deleteSession(\''+safeId+'\')" title="Pindahkan ke Sampah"><span class="material-icons">delete</span></button>' +
        '</div></div></div>';
    }).join('');
  }

  async function loadAssessmentScreen(){
    var target = document.getElementById('assessmentSessionList');
    if (!target) return;
    target.innerHTML = '<div class="empty-state"><span class="material-icons">hourglass_empty</span><p>Memuat sesi Asesmen...</p></div>';
    try {
      if (window.loadSessions) await window.loadSessions();
      renderSessionList();
    } catch(error) {
      console.error('[asesmen] Gagal memuat sesi:', error);
      target.innerHTML = '<div class="empty-state" style="color:#991b1b;"><span class="material-icons">error</span>' +
        '<p>Gagal memuat sesi Asesmen: '+esc(error.message || 'Kesalahan tidak diketahui')+'</p></div>';
    }
  }
  window.loadAssessmentScreen = loadAssessmentScreen;

  function buildAssessmentInput(){
    return '<div class="soal-info"><b>Editor sesi Asesmen.</b> Tipe 1–5 dapat dicampur dalam satu sesi. Tipe 6–11 dipilih satu jenis untuk seluruh input. Disarankan 30–50 butir per sesi.</div>' +
      '<div class="form-group"><label class="form-label">Tujuan Sesi Asesmen</label><select class="form-control" id="assessmentInputSession"><option value="">Memuat sesi Asesmen...</option></select></div>' +
      '<fieldset id="assessmentTypeA" style="border:1px solid #cbd5e1;border-radius:8px;padding:.75rem;margin:0 0 .75rem;"><legend style="font-weight:700;padding:0 .35rem;">Tipe A — boleh dicampur</legend>' +
        TYPE_A.map(function(type){return '<label style="display:inline-flex;align-items:center;gap:.35rem;margin:.25rem .8rem .25rem 0;"><input type="checkbox" value="'+type+'" checked> '+type.replace('JEC_','')+' — '+TYPE_LABELS[type]+'</label>';}).join('') +
      '</fieldset>' +
      '<div class="form-group"><label class="form-label" for="assessmentTypeB">Tipe B — pilih satu jenis</label><select class="form-control" id="assessmentTypeB"><option value="">Tidak memakai Tipe B</option>' +
        TYPE_B.map(function(type){return '<option value="'+type+'">'+type+' — '+TYPE_LABELS[type]+'</option>';}).join('')+
      '</select></div>' +
      '<div class="form-group"><label class="form-label">Parser Teks / Editor Soal</label><textarea class="form-control" id="assessmentTextFormat" rows="12" placeholder="1. Teks soal&#10;A. Opsi A&#10;B. Opsi B&#10;C. Opsi C&#10;D. Opsi D&#10;E. Opsi E&#10;j: B&#10;&#10;Kategori:&#10;1. Instruksi&#10;Statement 1: Pernyataan pertama&#10;Statement 2: Pernyataan kedua&#10;j: benar,tidak&#10;&#10;SA: j: jawaban alternatif 1|jawaban alternatif 2&#10;TF: [tipe: JEC_TF] lalu j: true atau false"></textarea><small id="assessmentDraftState" style="color:#64748b;">Draft teks tersimpan otomatis per sesi di browser ini.</small></div>' +
      '<div style="display:flex;gap:.5rem;flex-wrap:wrap;margin-bottom:.75rem;">' +
        '<button type="button" class="btn btn-secondary" onclick="previewAssessmentText()"><span class="material-icons">visibility</span>Preview Teks</button>' +
        '<button type="button" class="btn btn-primary" onclick="saveAssessmentText()"><span class="material-icons">save</span>Simpan Soal Teks</button>' +
      '</div><div id="assessmentTextPreview" style="margin-bottom:1rem;"></div>' +
      '<hr style="margin:1rem 0;border:none;border-top:1px solid #e2e8f0;">' +
      '<div style="background:#f8fafc;padding:1rem;border-radius:8px;margin-bottom:1rem;font-size:.75rem;line-height:1.6;">' +
        '<b>Format CSV (delimiter ;):</b><br><code>TYPE;TEXT;OPT_A;OPT_B;OPT_C;OPT_D;OPT_E;ANSWER;EXPLANATION;IMAGE_URL;STATEMENTS;DATA</code>' +
        '<br>Gunakan TYPE JEC_PGS sampai JEC_DC (alias PGS/MCMA/PGK/ISIAN lama tetap diterima). Untuk tipe 6–11 isi kolom DATA dengan JSON properti khusus, misalnya gaps, pasangan, dialogue, atau mediaUrl.' +
      '</div>' +
      '<div class="form-group"><label class="form-label">File CSV</label><input type="file" class="form-control" id="assessmentCsvFile" accept=".csv,.txt"></div>' +
      '<div style="display:flex;gap:.5rem;flex-wrap:wrap;margin-bottom:.75rem;">' +
        '<button type="button" class="btn btn-secondary" onclick="previewAssessmentCSV()"><span class="material-icons">visibility</span>Preview CSV</button>' +
        '<button type="button" class="btn btn-primary" onclick="saveAssessmentCSV()"><span class="material-icons">upload</span>Import CSV</button>' +
      '</div><div id="assessmentCsvPreview"></div>';
  }

  async function populateAssessmentTargets(){
    var select = document.getElementById('assessmentInputSession');
    if (!select) return;
    var savedEditor='';
    try{savedEditor=sessionStorage.getItem('questionEditorSessionId')||sessionStorage.getItem('assessmentInputSessionId')||'';}catch(error){}
    var previous = select.value || AS.targetSession || window.__questionEditorSessionId || savedEditor;
    try {
      var snapshot = await db.collection('sessions').get();
      var sessions = [];
      snapshot.forEach(function(doc){
        var data = doc.data();
        if (data.deleted !== true && data.mode === 'assessment') sessions.push({id:doc.id,data:data});
      });
      sessions.sort(function(a,b){ return String(a.data.name||'').localeCompare(String(b.data.name||'')); });
      select.innerHTML = '<option value="">Pilih sesi Asesmen</option>' + sessions.map(function(item){
        return '<option value="'+esc(item.id)+'">'+esc(item.data.name||'Sesi tanpa nama')+'</option>';
      }).join('');
      if (sessions.some(function(item){ return item.id === previous; })) select.value = previous;
      if (!sessions.length) select.innerHTML = '<option value="">Belum ada sesi Asesmen—buat dulu di Manage Sesi → Asesmen</option>';
      select.onchange=function(){
        AS.targetSession=select.value;
        AS.editSessionId=window.__questionEditorSessionId===select.value ? select.value : '';
        try{
          sessionStorage.setItem('assessmentInputSessionId',select.value);
          if(!AS.editSessionId) sessionStorage.removeItem('questionEditorSessionId');
        }catch(error){}
        loadAssessmentDraft(select.value);
      };
      if (select.value) loadAssessmentDraft(select.value);
    } catch(error) {
      console.error('[asesmen] Gagal memuat target sesi:', error);
      select.innerHTML = '<option value="">Gagal memuat sesi: '+esc(error.message || '')+'</option>';
    }
  }

  function loadAssessmentDraft(sessionId){
    var textarea=document.getElementById('assessmentTextFormat');
    if (!textarea || !sessionId) return;
    AS.targetSession=sessionId;
    var key=questionDraftKey(sessionId);
    try {
      var draft=localStorage.getItem(key);
      if (draft !== null) {
        var saved;
        try{saved=JSON.parse(draft);}catch(error){saved={text:draft};}
        if(saved&&typeof saved==='object'&&Object.prototype.hasOwnProperty.call(saved,'text')){
          textarea.value=saved.text||'';
          var typeB=document.getElementById('assessmentTypeB');
          if(typeB&&saved.typeB) typeB.value=saved.typeB;
          document.querySelectorAll('#assessmentTypeA input').forEach(function(input){
            if(Array.isArray(saved.typesA)) input.checked=saved.typesA.indexOf(input.value)!==-1;
            input.disabled=!!(typeB&&typeB.value);
          });
        } else textarea.value=draft;
      } else {
        textarea.value='';
        var typeB=document.getElementById('assessmentTypeB');
        if(typeB) typeB.value='';
        document.querySelectorAll('#assessmentTypeA input').forEach(function(input){input.checked=true;input.disabled=false;});
        var preview=document.getElementById('assessmentTextPreview');
        if(preview) preview.innerHTML='';
      }
    } catch(error) {
      console.warn('[asesmen] Draft lokal tidak dapat dibaca:',error);
    }
  }

  function renderQuestionPreview(questions, targetId){
    var target = document.getElementById(targetId);
    if (!target) return;
    var counts={};
    questions.forEach(function(question){counts[question.type]=(counts[question.type]||0)+1;});
    var html='<div class="soal-info"><b>'+questions.length+' soal valid</b> — '+
      Object.keys(counts).map(function(type){return type.replace('JEC_','')+': '+counts[type];}).join(' • ')+
      (questions.length<30||questions.length>50?'<br>Catatan: ulangan umumnya berisi 30–50 soal; jumlah ini tetap dapat disimpan.':'')+'</div>'+
      '<div style="display:grid;gap:.625rem;margin-top:.75rem;">';
    questions.forEach(function(question,index){
      var body='<div style="font-weight:600;">'+esc(question.text||'')+'</div>';
      if(question.imageUrl||question.mediaUrl){
        var image=window.normalizeQuestionImageUrl(question.imageUrl||question.mediaUrl);
        if(image) body+='<img src="'+esc(image)+'" alt="Media soal '+(index+1)+'" style="display:block;max-width:100%;max-height:180px;object-fit:contain;margin-top:.5rem;">';
      }
      if(question.options) body+='<div style="margin-top:.375rem;">'+Object.keys(question.options).filter(function(key){return question.options[key];}).map(function(key){return '<div>'+key+'. '+esc(question.options[key])+'</div>';}).join('')+'</div>';
      if(question.statements) body+='<ol style="margin:.375rem 0 0 1.25rem;">'+question.statements.map(function(statement){return '<li>'+esc(statement)+'</li>';}).join('')+'</ol>';
      if(question.gaps) body+='<div style="margin-top:.375rem;">'+question.gaps.length+' rumpang</div>';
      if(question.leftItems||question.rightItems) body+='<div style="margin-top:.375rem;">'+(question.leftItems||[]).length+' pasangan</div>';
      if(question.dialogue) body+='<div style="margin-top:.375rem;">'+question.dialogue.length+' bagian dialog</div>';
      html+='<article style="background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:.75rem;"><div style="display:flex;gap:.5rem;align-items:flex-start;"><span class="badge badge-info">'+(index+1)+'. '+question.type.replace('JEC_','')+'</span><div style="min-width:0;flex:1;">'+body+
        '<div style="margin-top:.375rem;color:#475569;font-size:.8125rem;"><b>Kunci:</b> '+esc(formatKey(question))+'</div>'+
        (question.explanation?'<div style="margin-top:.25rem;color:#1e3a8a;font-size:.8125rem;"><b>Pembahasan:</b> '+esc(question.explanation)+'</div>':'')+
        '</div></div></article>';
    });
    target.innerHTML=html+'</div>';
  }

  function formatKey(question){
    var answer=question.correctAnswer;
    if(question.type==='JEC_CT') return (question.gaps||[]).map(function(gap){return gap.id+': '+gap.correctAnswer;}).join(', ');
    if(question.type==='JEC_DC'){
      var selected=(question.options||[])[Number(answer)];
      return typeof selected==='string'?selected:(selected&&selected.text)||String(answer==null?'':answer);
    }
    if(question.type==='JEC_IT'&&question.interactionType==='JEC_SA'&&Array.isArray(answer)) return answer.join(' / ');
    if(Array.isArray(answer)) return answer.map(function(item){return typeof item==='boolean'?(item?'Benar':'Salah'):item;}).join(', ');
    if(answer&&typeof answer==='object') return JSON.stringify(answer);
    return answer===true?'Benar':answer===false?'Salah':String(answer==null?'':answer);
  }

  function validateAssessmentQuestions(questions){
    if (!questions || !questions.length) throw new Error('Tidak ada soal yang bisa diimpor.');
    if (questions.length > 450) throw new Error('Maksimal 450 soal per sekali impor.');
    questions.forEach(function(question,index){
      var number = question.number || index+1;
      question.type=canonicalType(question.type);
      if (!question.type) throw new Error('Tipe soal '+number+' tidak dikenal.');
      if (!String(question.text||'').trim()) throw new Error('Teks/instruksi soal '+number+' wajib diisi.');
      if (question.imageUrl && !window.normalizeQuestionImageUrl(question.imageUrl)) throw new Error('URL gambar soal '+number+' harus diawali http:// atau https://.');
      if (question.mediaUrl && !window.normalizeQuestionImageUrl(question.mediaUrl)) throw new Error('URL media soal '+number+' harus diawali http:// atau https://.');
      if (question.type === 'JEC_PGS' || question.type === 'JEC_MCMA' || question.type === 'JEC_EI') {
        var options = question.options || {};
        var available=Object.keys(options).filter(function(key){return String(options[key]||'').trim();});
        if (available.length < 2) throw new Error('Soal '+number+' harus memiliki minimal dua opsi.');
        if (question.type==='JEC_MCMA') {
          if (!Array.isArray(question.correctAnswer)||!question.correctAnswer.length||question.correctAnswer.some(function(key){return available.indexOf(String(key).toUpperCase())===-1;})) {
            throw new Error('Kunci MCMA soal '+number+' harus berisi opsi yang tersedia.');
          }
        } else if (!/^[A-E]$/.test(String(question.correctAnswer||'').toUpperCase()) || available.indexOf(String(question.correctAnswer).toUpperCase())===-1) {
          throw new Error('Kunci soal '+number+' harus menunjuk opsi A–E yang terisi.');
        }
      } else if (question.type==='JEC_PGK') {
        if (!question.statements || !question.statements.length) throw new Error('Soal kategori '+number+' harus memiliki pernyataan.');
        if (!Array.isArray(question.correctAnswer) || question.correctAnswer.length !== question.statements.length ||
            question.correctAnswer.some(function(answer){ return answer !== true && answer !== false; })) {
          throw new Error('Jumlah/kunci Benar-Salah soal '+number+' harus sesuai dengan pernyataannya.');
        }
      } else if(question.type==='JEC_SA'||question.type==='JEC_ST'){
        var textAnswers=Array.isArray(question.correctAnswer)?question.correctAnswer:[question.correctAnswer];
        if(!textAnswers.some(function(value){return typeof value==='string'&&value.trim();})) throw new Error('Kunci teks soal '+number+' wajib diisi.');
        question.correctAnswer=textAnswers.length===1?textAnswers[0]:textAnswers;
      } else if(question.type==='JEC_TF'){
        if(question.correctAnswer!==true&&question.correctAnswer!==false) throw new Error('Kunci soal Benar/Salah '+number+' harus true atau false.');
      } else if(question.type==='JEC_CT'){
        if(!Array.isArray(question.gaps)||!question.gaps.length) throw new Error('Cloze Test '+number+' harus memiliki gaps pada DATA JSON.');
        question.gaps.forEach(function(gap){
          if(!gap.id||!String(question.text).includes('['+gap.id+']')||!Array.isArray(gap.options)||gap.options.length<2||
             gap.options.indexOf(gap.correctAnswer)===-1) throw new Error('Gap "'+(gap.id||'')+'" soal '+number+' tidak lengkap atau kunci tidak valid.');
        });
      } else if(question.type==='JEC_MT'){
        if(!Array.isArray(question.leftItems)||!question.leftItems.length||!Array.isArray(question.rightItems)||!question.rightItems.length||
           !question.correctAnswer||typeof question.correctAnswer!=='object') throw new Error('Matching Test '+number+' memerlukan leftItems, rightItems, dan correctAnswer pada DATA JSON.');
        question.leftItems.forEach(function(_,i){
          if(question.correctAnswer[String(i)]===undefined||Number(question.correctAnswer[String(i)])<0||
             Number(question.correctAnswer[String(i)])>=question.rightItems.length) throw new Error('Pasangan item '+(i+1)+' soal '+number+' tidak valid.');
        });
      } else if(question.type==='JEC_IT'){
        question.interactionType=canonicalType(question.interactionType||'JEC_PGS');
        if(['JEC_PGS','JEC_MCMA','JEC_SA'].indexOf(question.interactionType)===-1) throw new Error('Mode Interaktif soal '+number+' harus PGS, MCMA, atau SA.');
        if(!question.mediaUrl&&!question.imageUrl) throw new Error('Interactive Test '+number+' harus memiliki URL media/gambar.');
        var nested=Object.assign({},question,{type:question.interactionType});
        if(question.interactionType!=='JEC_SA') validateAssessmentQuestions([nested]);
        else if(!String(question.correctAnswer||'').trim()) throw new Error('Kunci teks Interactive Test '+number+' wajib diisi.');
      } else if(question.type==='JEC_DC'){
        if(!Array.isArray(question.dialogue)||!question.dialogue.length||!Array.isArray(question.options)||question.options.length<2||
           question.correctAnswer===undefined||Number(question.correctAnswer)<0||Number(question.correctAnswer)>=question.options.length)
          throw new Error('Dialog Completion '+number+' memerlukan dialogue, options, dan correctAnswer pada DATA JSON.');
        if(!question.dialogue.some(function(line){return line.blank||String(line.text||'').indexOf('[blank]')!==-1;}))
          throw new Error('Dialog Completion '+number+' harus memiliki satu bagian percakapan yang kosong ([blank]).');
      }
    });
    return questions;
  }

  function parseAssessmentText(){
    if (typeof window.parseTextFormat !== 'function') throw new Error('Parser teks soal belum siap. Muat ulang halaman.');
    var source = document.getElementById('assessmentTextFormat');
    var input=source?source.value:'';
    var typeB=document.getElementById('assessmentTypeB');
    var specialType=typeB&&typeB.value;
    var questions;
    if(specialType){
      questions=parseSpecialAssessmentText(input,specialType);
    } else {
      var parsed=window.parseTextFormat(input);
      questions=(parsed.questions||[]).map(function(question){
        var type=canonicalType(question.type);
        var explicit=canonicalType(question.explicitType);
        if(explicit) type=explicit;
        var answer=question.correctAnswer;
        if(type==='JEC_SA'&&typeof answer==='string'&&answer.indexOf('|')!==-1) answer=answer.split('|').map(function(item){return item.trim();}).filter(Boolean);
        if(!explicit&&type==='JEC_SA'&&window.parseBooleanAnswerList&&window.parseBooleanAnswerList(answer)&&window.parseBooleanAnswerList(answer).length===1){
          type='JEC_TF';answer=window.parseBooleanAnswerList(answer)[0];
        }
        return {
          number:question.number,type:type,text:question.text,options:question.options,
          statements:question.statements,correctAnswer:answer,explanation:question.explanation,
          imageUrl:question.imageUrl
        };
      });
      var allowed=selectedTypeA();
      if(!allowed.length) throw new Error('Pilih minimal satu tipe pada Tipe A atau pilih satu tipe pada Tipe B.');
      var invalid=questions.find(function(question){return allowed.indexOf(question.type)===-1;});
      if(invalid) throw new Error('Tipe '+invalid.type+' pada soal '+invalid.number+' belum dicentang di daftar Tipe A.');
    }
    return validateAssessmentQuestions(questions);
  }

  window.previewAssessmentText = function(){
    try {
      AS.textQuestions = parseAssessmentText();
      renderQuestionPreview(AS.textQuestions,'assessmentTextPreview');
    } catch(error) {
      AS.textQuestions = null;
      var target = document.getElementById('assessmentTextPreview');
      if (target) target.innerHTML = '<div class="badge badge-error">'+esc(error.message)+'</div>';
    }
  };

  function parseDelimitedRows(text){
    var rows=[], row=[], value='', quoted=false;
    for (var i=0;i<text.length;i++) {
      var char=text.charAt(i);
      if (quoted && char === '"' && text.charAt(i+1) === '"') { value+='"'; i++; continue; }
      if (char === '"') { quoted=!quoted; continue; }
      if (!quoted && char === ';') { row.push(value); value=''; continue; }
      if (!quoted && (char === '\n' || char === '\r')) {
        if (char === '\r' && text.charAt(i+1) === '\n') i++;
        row.push(value); value='';
        if (row.some(function(cell){return cell.trim();})) rows.push(row);
        row=[];
        continue;
      }
      value+=char;
    }
    row.push(value);
    if (row.some(function(cell){return cell.trim();})) rows.push(row);
    if (quoted) throw new Error('Ada tanda kutip yang tidak berpasangan pada CSV.');
    return rows;
  }

  function parseAssessmentCSV(text){
    var rows=parseDelimitedRows(text);
    if (!rows.length) throw new Error('File CSV kosong.');
    var header = rows[0].map(function(cell){return cell.trim().toUpperCase();});
    var hasHeader = header[0] === 'TYPE';
    if (hasHeader) rows.shift();
    function col(row,name,index){ return hasHeader && header.indexOf(name) !== -1 ? row[header.indexOf(name)] || '' : row[index] || ''; }
    var questions=rows.map(function(row,index){
      var rawType=String(col(row,'TYPE',0)).trim().toUpperCase();
      var type=canonicalType(rawType);
      var question={
        number:index+1,type:type,text:String(col(row,'TEXT',1)).trim(),explanation:String(col(row,'EXPLANATION',8)).trim(),
        imageUrl:String(col(row,'IMAGE_URL',9)).trim()
      };
      var dataRaw=String(col(row,'DATA',11)).trim();
      if(dataRaw){
        try { Object.assign(question,JSON.parse(dataRaw)); }
        catch(error){ throw new Error('DATA JSON baris '+(index+1)+' tidak valid: '+error.message); }
      }
      if (type === 'JEC_PGS' || type === 'JEC_EI') {
        question.options={A:col(row,'OPT_A',2),B:col(row,'OPT_B',3),C:col(row,'OPT_C',4),D:col(row,'OPT_D',5),E:col(row,'OPT_E',6)};
        var answer=String(col(row,'ANSWER',7)).trim().toUpperCase();
        if (!/^[A-E]$/.test(answer) && !hasHeader && /^[A-E]$/.test(String(row[6]||'').trim().toUpperCase())) {
          answer=String(row[6]).trim().toUpperCase();
          question.options.E='';
          question.explanation=String(row[7]||'').trim();
          question.imageUrl=String(row[8]||'').trim();
        }
        question.correctAnswer=answer;
      } else if (type === 'JEC_MCMA') {
        question.options={A:col(row,'OPT_A',2),B:col(row,'OPT_B',3),C:col(row,'OPT_C',4),D:col(row,'OPT_D',5),E:col(row,'OPT_E',6)};
        question.correctAnswer=String(col(row,'ANSWER',7)).split(/[,|]/).map(function(key){return key.trim().toUpperCase();}).filter(Boolean);
      } else if (type === 'JEC_PGK') {
        var statementText=String(col(row,'STATEMENTS',10)).trim();
        if (!statementText && !hasHeader) statementText=String(row[1]||'').trim();
        question.statements=statementText.split('|').map(function(statement){return statement.trim();}).filter(Boolean);
        if (!statementText || statementText === question.text) question.text='Tentukan apakah setiap pernyataan berikut benar atau salah.';
        var keyRaw=String(col(row,'ANSWER',7)).trim();
        if (!keyRaw && !hasHeader) keyRaw=String(row[4]||'').trim();
        question.correctAnswer=window.parseBooleanAnswerList ? window.parseBooleanAnswerList(keyRaw) : null;
        if (!question.explanation && !hasHeader) question.explanation=String(row[5]||'').trim();
        if (!question.imageUrl && !hasHeader) question.imageUrl=String(row[6]||'').trim();
      } else if(type==='JEC_TF'){
        var tfRaw=String(col(row,'ANSWER',7)).trim();
        var tfList=window.parseBooleanAnswerList?window.parseBooleanAnswerList(tfRaw):null;
        question.correctAnswer=tfList&&tfList.length===1?tfList[0]:null;
      } else if(type==='JEC_SA'||type==='JEC_ST'){
        var textKey=String(col(row,'ANSWER',7)).trim();
        if(textKey){
          question.correctAnswer=textKey.split('|').map(function(item){return item.trim();}).filter(Boolean);
          if(question.correctAnswer.length===1) question.correctAnswer=question.correctAnswer[0];
        }
      } else if(type==='JEC_IT'){
        question.interactionType=canonicalType(question.interactionType||'JEC_PGS');
        var interactiveKey=String(col(row,'ANSWER',7)).trim();
        if((question.interactionType==='JEC_PGS'||question.interactionType==='JEC_MCMA')&&interactiveKey){
          question.options={A:col(row,'OPT_A',2),B:col(row,'OPT_B',3),C:col(row,'OPT_C',4),D:col(row,'OPT_D',5),E:col(row,'OPT_E',6)};
          question.correctAnswer=question.interactionType==='JEC_MCMA'
            ? interactiveKey.split(/[,|]/).map(function(key){return key.trim().toUpperCase();}).filter(Boolean)
            : interactiveKey.toUpperCase();
        } else if(question.interactionType==='JEC_SA'&&interactiveKey) question.correctAnswer=interactiveKey;
      }
      return question;
    });
    validateAssessmentTypeSelection(questions);
    return validateAssessmentQuestions(questions);
  }

  function validateAssessmentTypeSelection(questions){
    var groups={a:0,b:0}, bTypes={};
    questions.forEach(function(question){
      var type=canonicalType(question.type);
      if(TYPE_A.indexOf(type)!==-1) groups.a++;
      else if(TYPE_B.indexOf(type)!==-1){groups.b++;bTypes[type]=true;}
      else throw new Error('Tipe soal '+(question.type||'?')+' tidak dikenal.');
    });
    if(groups.a&&groups.b) throw new Error('Tipe A (1–5) tidak dapat dicampur dengan Tipe B (6–11) dalam satu input.');
    if(Object.keys(bTypes).length>1) throw new Error('Tipe B hanya boleh menggunakan satu jenis soal dalam satu input.');
    if(groups.a){
      var allowed=selectedTypeA();
      var invalid=questions.find(function(question){return allowed.indexOf(canonicalType(question.type))===-1;});
      if(invalid) throw new Error('Tipe '+invalid.type+' pada soal '+invalid.number+' belum dicentang.');
    }
    var dropdown=document.getElementById('assessmentTypeB');
    if(groups.b&&dropdown&&dropdown.value!==Object.keys(bTypes)[0]) {
      throw new Error('Pilih '+Object.keys(bTypes)[0]+' pada dropdown Tipe B sebelum preview atau simpan.');
    }
  }

  function validateSessionQuestionMix(existingDocs,questions,replacing){
    if(replacing)return;
    var previousTypes={};
    existingDocs.forEach(function(doc){
      var type=canonicalType(doc.data().type);
      if(type)previousTypes[type]=true;
    });
    var incomingTypes={};
    questions.forEach(function(question){incomingTypes[canonicalType(question.type)]=true;});
    var previous=Object.keys(previousTypes),incoming=Object.keys(incomingTypes);
    var previousA=previous.some(function(type){return TYPE_A.indexOf(type)!==-1;});
    var incomingA=incoming.some(function(type){return TYPE_A.indexOf(type)!==-1;});
    var previousB=previous.filter(function(type){return TYPE_B.indexOf(type)!==-1;});
    var incomingB=incoming.filter(function(type){return TYPE_B.indexOf(type)!==-1;});
    if((previousA&&previousB.length)||(incomingA&&incomingB.length)||
       (previousA&&incomingB.length)||(previousB.length&&incomingA)) {
      throw new Error('Tipe A (soal 1–5) dan Tipe B (soal 6–11) tidak dapat dicampur dalam satu sesi. Buka editor sesi untuk mengganti seluruh soal.');
    }
    if(previousB.length>1) throw new Error('Sesi ini sudah memiliki campuran beberapa Tipe B. Buka editor sesi untuk memperbaikinya.');
    if(previousB.length&&incomingB.some(function(type){return previousB.indexOf(type)===-1;})) {
      throw new Error('Satu sesi hanya boleh menggunakan satu jenis Tipe B. Buka editor sesi untuk mengganti tipe yang sudah ada.');
    }
  }

  window.previewAssessmentCSV = function(){
    var fileInput=document.getElementById('assessmentCsvFile');
    var file=fileInput && fileInput.files && fileInput.files[0];
    var target=document.getElementById('assessmentCsvPreview');
    if (!file) { if(target) target.innerHTML='<div class="badge badge-warning">Pilih file CSV terlebih dahulu.</div>'; return; }
    var reader=new FileReader();
    reader.onload=function(event){
      try {
        AS.csvQuestions=parseAssessmentCSV(String(event.target.result||''));
        renderQuestionPreview(AS.csvQuestions,'assessmentCsvPreview');
      } catch(error) {
        AS.csvQuestions=null;
        if(target) target.innerHTML='<div class="badge badge-error">'+esc(error.message)+'</div>';
      }
    };
    reader.onerror=function(){ if(target) target.innerHTML='<div class="badge badge-error">File CSV tidak dapat dibaca.</div>'; };
    reader.readAsText(file);
  };

  async function saveQuestions(sourceQuestions){
    var select=document.getElementById('assessmentInputSession');
    var sessionId=select && select.value;
    if (!sessionId) throw new Error('Pilih tujuan sesi Asesmen terlebih dahulu.');
    var sessionDoc=await db.collection('sessions').doc(sessionId).get();
    if (!sessionDoc.exists || sessionDoc.data().mode !== 'assessment' || sessionDoc.data().deleted === true) {
      throw new Error('Sesi tujuan tidak ditemukan atau bukan sesi Asesmen.');
    }
    validateAssessmentTypeSelection(sourceQuestions);
    var questions=validateAssessmentQuestions(sourceQuestions);
    var existing=await db.collection('questions').where('sessionId','==',sessionId).get();
    var existingDocs=[];
    existing.forEach(function(doc){
      var data=doc.data();
      if (data.deleted !== true) existingDocs.push(doc);
    });
    existingDocs.sort(function(a,b){return (Number(a.data().order)||0)-(Number(b.data().order)||0);});
    var replacing=AS.editSessionId===sessionId || window.__questionEditorSessionId===sessionId;
    if(replacing&&!window.confirm('Simpan perubahan dengan mengganti seluruh soal aktif pada sesi ini? Attempt siswa yang sudah selesai tetap menggunakan snapshot soal lama.')) throw new Error('Penyimpanan perubahan dibatalkan.');
    validateSessionQuestionMix(existingDocs,questions,replacing);
    var startOrder=replacing?0:existingDocs.reduce(function(max,doc){return Math.max(max,Number(doc.data().order)||0);},0);
    var batch=db.batch();
    questions.forEach(function(question,index){
      var data={
        sessionId:sessionId,type:question.type,text:String(question.text||'').trim(),
        correctAnswer:question.correctAnswer,explanation:question.explanation||'',
        order:startOrder+index+1,source:'assessment',createdAt:firebase.firestore.FieldValue.serverTimestamp()
      };
      if (question.imageUrl) data.imageUrl=window.normalizeQuestionImageUrl(question.imageUrl);
      ['options','statements','mediaUrl','interactionType','gaps','leftItems','rightItems','dialogue'].forEach(function(key){
        if(question[key]!==undefined) data[key]=question[key];
      });
      var ref=replacing&&existingDocs[index]
        ? db.collection('questions').doc(existingDocs[index].id)
        : db.collection('questions').doc();
      batch.set(ref,data);
    });
    if(replacing) existingDocs.slice(questions.length).forEach(function(doc){batch.delete(db.collection('questions').doc(doc.id));});
    await batch.commit();
    if(replacing){
      AS.editSessionId=sessionId;
      window.__questionEditorSessionId=sessionId;
      try{localStorage.removeItem(questionDraftKey(sessionId));}catch(error){console.warn('[asesmen] Draft tidak dapat dihapus:',error);}
    }
    if (window.loadSessions) {
      try{await window.loadSessions();}
      catch(error){
        console.error('[asesmen] Soal tersimpan, tetapi daftar sesi gagal diperbarui:',error);
        if(window.toast) toast('Soal tersimpan, tetapi daftar sesi gagal diperbarui. Muat ulang daftar sesi.','warning');
      }
    }
    if (window.loadAssessmentScreen) renderSessionList();
    return questions.length;
  }

  window.saveAssessmentText = async function(){
    try {
      var questions=parseAssessmentText();
      AS.textQuestions=questions;
      renderQuestionPreview(questions,'assessmentTextPreview');
      var count=await saveQuestions(questions);
      toast(count+' soal disimpan ke sesi Asesmen.','success');
      if(!AS.editSessionId){
        document.getElementById('assessmentTextFormat').value='';
        document.getElementById('assessmentTextPreview').innerHTML='';
        var select=document.getElementById('assessmentInputSession');
        if(select&&select.value) try{localStorage.removeItem(questionDraftKey(select.value));}catch(error){}
      }
      AS.textQuestions=null;
    } catch(error) {
      console.error('[asesmen] Gagal menyimpan input teks:',error);
      alert2('Gagal menyimpan soal Asesmen',esc(error.message||'Kesalahan tidak diketahui'),'error');
    }
  };

  window.saveAssessmentCSV = async function(){
    try {
      var fileInput=document.getElementById('assessmentCsvFile');
      var file=fileInput && fileInput.files && fileInput.files[0];
      if (!file) throw new Error('Pilih file CSV terlebih dahulu.');
      var contents=await new Promise(function(resolve,reject){
        var reader=new FileReader();
        reader.onload=function(event){resolve(String(event.target.result||''));};
        reader.onerror=function(){reject(new Error('File CSV tidak dapat dibaca.'));};
        reader.readAsText(file);
      });
      var questions=parseAssessmentCSV(contents);
      AS.csvQuestions=questions;
      renderQuestionPreview(questions,'assessmentCsvPreview');
      var count=await saveQuestions(questions);
      toast(count+' soal CSV disimpan ke sesi Asesmen.','success');
      if(AS.editSessionId){
        var textarea=document.getElementById('assessmentTextFormat');
        if(textarea) textarea.value=serializeAssessmentQuestions(questions);
      }
      fileInput.value='';
      document.getElementById('assessmentCsvPreview').innerHTML='';
      AS.csvQuestions=null;
    } catch(error) {
      console.error('[asesmen] Gagal mengimpor CSV:',error);
      alert2('Gagal mengimpor Asesmen',esc(error.message||'Kesalahan tidak diketahui'),'error');
    }
  };

  window.renderAssessmentInput = function(container){
    if (!container) return;
    container.innerHTML=buildAssessmentInput();
    var selector=container.querySelector('#assessmentTypeB');
    var textarea=container.querySelector('#assessmentTextFormat');
    if(selector) selector.onchange=function(){
      var chosen=selector.value;
      container.querySelectorAll('#assessmentTypeA input').forEach(function(input){input.disabled=!!chosen;});
      if(chosen&&textarea&&!textarea.value.trim()) textarea.value=typeBTemplate(chosen);
      if(!chosen&&textarea&&/^\s*DATA\s*:/im.test(textarea.value)){
        textarea.value='';
        var preview=container.querySelector('#assessmentTextPreview');
        if(preview) preview.innerHTML='';
      }
      saveAssessmentDraft();
    };
    if(textarea) textarea.addEventListener('input',saveAssessmentDraft);
    if(container.querySelector('#assessmentTypeA')){
      container.querySelectorAll('#assessmentTypeA input').forEach(function(input){
        input.onchange=saveAssessmentDraft;
      });
    }
    populateAssessmentTargets().then(function(){
      var savedEditor=window.__questionEditorSessionId;
      if(!savedEditor) try{savedEditor=sessionStorage.getItem('questionEditorSessionId')||'';}catch(error){}
      var hasDraft=false;
      try{hasDraft=localStorage.getItem(questionDraftKey(savedEditor))!==null;}catch(error){}
      if(savedEditor&&document.getElementById('assessmentInputSession')&&
          document.getElementById('assessmentInputSession').value===savedEditor&&!hasDraft) {
        window.loadAssessmentQuestionsIntoEditor(savedEditor).catch(function(error){
          console.error('[asesmen] Gagal memuat editor sesi:',error);
          var state=document.getElementById('assessmentDraftState');
          if(state) state.textContent='Gagal memuat soal sesi: '+(error.message||'kesalahan tidak diketahui');
        });
      }
    });
  };

  window.initAssessmentInput = function(){
    var card=document.querySelector('#soal-sub-assessment-input .soal-card-body');
    if (card) window.renderAssessmentInput(card);
  };

  function saveAssessmentDraft(){
    var select=document.getElementById('assessmentInputSession');
    var textarea=document.getElementById('assessmentTextFormat');
    var sessionId=select&&select.value;
    if(!sessionId||!textarea) return;
    AS.targetSession=sessionId;
    try{
      localStorage.setItem(questionDraftKey(sessionId),JSON.stringify({
        text:textarea.value,
        typeB:(document.getElementById('assessmentTypeB')||{}).value||'',
        typesA:selectedTypeA()
      }));
      sessionStorage.setItem('assessmentInputSessionId',sessionId);
      var state=document.getElementById('assessmentDraftState');
      if(state) state.textContent='Draft tersimpan otomatis untuk sesi ini.';
    }catch(error){
      console.error('[asesmen] Gagal menyimpan draft input:',error);
      var state=document.getElementById('assessmentDraftState');
      if(state) state.textContent='Draft tidak dapat disimpan di browser ini.';
    }
  }

  function serializeAssessmentQuestions(questions){
    var all=[];
    questions.forEach(function(question,index){
      var type=canonicalType(question.type);
      var lines=[(index+1)+'. '+String(question.text||'')];
      if(question.imageUrl) lines.push('[gambar: '+question.imageUrl+']');
      if(type==='JEC_PGS'||type==='JEC_MCMA'||type==='JEC_EI'){
        var options=question.options||{};
        ['A','B','C','D','E'].forEach(function(key){if(options[key])lines.push(key+'. '+options[key]);});
      }
      if(type==='JEC_PGK') (question.statements||[]).forEach(function(statement,i){lines.push('Statement '+(i+1)+': '+statement);});
      if(type==='JEC_PGS'||type==='JEC_EI') lines.push('j: '+question.correctAnswer);
      else if(type==='JEC_MCMA') lines.push('j: '+(question.correctAnswer||[]).join(','));
      else if(type==='JEC_PGK') lines.push('j: '+(question.correctAnswer||[]).map(function(value){return value?'benar':'salah';}).join(','));
      else if(type==='JEC_SA') {lines.push('[tipe: JEC_SA]');lines.push('j: '+(Array.isArray(question.correctAnswer)?question.correctAnswer.join('|'):question.correctAnswer||''));}
      else if(type==='JEC_TF') {lines.push('[tipe: JEC_TF]');lines.push('j: '+(question.correctAnswer?'true':'false'));}
      if(type==='JEC_CT'||type==='JEC_MT'||type==='JEC_EI'||type==='JEC_ST'||type==='JEC_IT'||type==='JEC_DC'){
        var payload={};
        ['options','gaps','leftItems','rightItems','dialogue','interactionType','correctAnswer','mediaUrl'].forEach(function(key){if(question[key]!==undefined)payload[key]=question[key];});
        if(question.mediaUrl) lines.push('[media: '+question.mediaUrl+']');
        lines.push('DATA: '+escapeJsonData(payload));
        if(question.explanation) lines.push('[pembahasan: '+question.explanation+']');
        all.push({type:type,lines:lines,explanation:''});
      } else {
        all.push({type:type,lines:lines,explanation:question.explanation||''});
      }
    });
    var text=all.map(function(item,index){
      var lines=item.lines.slice();
      lines[0]=(index+1)+lines[0].slice(lines[0].indexOf('.'));
      return lines.join('\n');
    }).join('\n\n');
    var explanations=all.filter(function(item){return item.explanation;});
    if(explanations.length) text+='\n\n[pembahasan]\n'+explanations.map(function(item,index){return (index+1)+'. '+item.explanation;}).join('\n');
    return text;
  }

  window.loadAssessmentQuestionsIntoEditor=async function(sessionId){
    await populateAssessmentTargets();
    var select=document.getElementById('assessmentInputSession');
    if(select) select.value=sessionId;
    AS.targetSession=sessionId;
    AS.editSessionId=sessionId;
    window.__questionEditorSessionId=sessionId;
    try{sessionStorage.setItem('questionEditorSessionId',sessionId);sessionStorage.setItem('assessmentInputSessionId',sessionId);}catch(error){}
    var draft=null;
    try{draft=localStorage.getItem(questionDraftKey(sessionId));}
    catch(error){console.error('[asesmen] Draft tidak dapat dibaca:',error);}
    if(draft!==null){
      loadAssessmentDraft(sessionId);
      var draftState=document.getElementById('assessmentDraftState');
      if(draftState) draftState.textContent='Draft sesi dipulihkan. Simpan untuk menerapkan perubahan.';
      return 0;
    }
    var snapshot=await db.collection('questions').where('sessionId','==',sessionId).get();
    var questions=[];
    snapshot.forEach(function(doc){
      var question=Object.assign({id:doc.id},doc.data());
      if(question.deleted!==true) questions.push(question);
    });
    questions.sort(function(a,b){return (Number(a.order)||0)-(Number(b.order)||0);});
    var typeB=questions.map(function(question){return canonicalType(question.type);}).find(function(type){return TYPE_B.indexOf(type)!==-1;});
    var typeA=questions.some(function(question){return TYPE_A.indexOf(canonicalType(question.type))!==-1;});
    if(typeB&&typeA) throw new Error('Sesi memiliki campuran Tipe A dan Tipe B. Pisahkan jenis soal sebelum membuka editor.');
    var dropdown=document.getElementById('assessmentTypeB');
    if(dropdown) dropdown.value=typeB||'';
    document.querySelectorAll('#assessmentTypeA input').forEach(function(input){
      input.checked=questions.length===0||questions.some(function(question){return canonicalType(question.type)===input.value;});
      input.disabled=!!typeB;
    });
    var textarea=document.getElementById('assessmentTextFormat');
    if(textarea) textarea.value=serializeAssessmentQuestions(questions);
    var preview=document.getElementById('assessmentTextPreview');
    if(preview) preview.innerHTML='';
    var state=document.getElementById('assessmentDraftState');
    if(state) state.textContent='Mode edit sesi: perubahan akan mengganti seluruh soal aktif pada sesi ini.';
    if(textarea) saveAssessmentDraft();
    return questions.length;
  };

  function watchPages(){
    var assessmentPage=document.getElementById('page-sesi-asesmen');
    if (assessmentPage && !assessmentPage.__assessmentWatch) {
      assessmentPage.__assessmentWatch=true;
      var observer=new MutationObserver(function(){
        if (assessmentPage.classList.contains('active')) loadAssessmentScreen();
      });
      observer.observe(assessmentPage,{attributes:true,attributeFilter:['class']});
      if (assessmentPage.classList.contains('active')) loadAssessmentScreen();
    }
    var drawer=document.getElementById('soal-drawer-root');
    if (drawer && !drawer.__assessmentDrawerWatch) {
      drawer.__assessmentDrawerWatch=true;
      if (window.S && S.soalSubTab === 'assessment-input') window.initAssessmentInput();
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',watchPages);
  else setTimeout(watchPages,0);
  var pageObserver=new MutationObserver(watchPages);
  pageObserver.observe(document.body,{childList:true,subtree:true});
})();

console.log('✅ asesmen.js v1.0 loaded');
