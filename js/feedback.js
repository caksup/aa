/* #19 | /root/js/feedback.js | v 1.0 | u 06/09/2026 • 22:14:00 | xu : ke-1 | note : 
- HALAMAN BARU: Feedback dari siswa
- Kategori: keliru (soal salah), kritik, saran
- Status: baru / resolved
- Admin bisa: lihat detail, tandai resolved/unresolve, hapus
- Badge counter di sidebar (jumlah feedback baru)
- Schema document: { studentId, studentName, type, subject, message, sessionId, questionId, status, createdAt, resolvedAt, adminNote } */

async function loadFeedbackCount() {
  try {
    var snap = await db.collection('feedback').where('status', '==', 'baru').get();
    var badge = document.getElementById('badgeFeedback');
    if (badge) badge.textContent = snap.size;
  } catch(e) { /* collection belum ada */ }
}

async function loadFeedback() {
  var filter = document.getElementById('feedbackFilter').value;
  var list = document.getElementById('feedbackList');
  
  try {
    var q;
    if (filter === 'all') q = db.collection('feedback').orderBy('createdAt', 'desc');
    else q = db.collection('feedback').where('status', '==', filter).orderBy('createdAt', 'desc');
    
    var snap = await q.get();
    
    // Stats
    var total = 0, baru = 0, resolved = 0;
    var allSnap = await db.collection('feedback').get();
    allSnap.forEach(function(d){
      total++;
      if (d.data().status === 'baru') baru++;
      else resolved++;
    });
    document.getElementById('fbTotal').textContent = total;
    document.getElementById('fbBaru').textContent = baru;
    document.getElementById('fbResolved').textContent = resolved;
    document.getElementById('badgeFeedback').textContent = baru;
    
    if (snap.empty) {
      list.innerHTML = '<div class="empty-state"><span class="material-icons">contact_support</span><p>Tidak ada feedback</p></div>';
      return;
    }
    
    list.innerHTML = '';
    snap.forEach(function(d){
      var data = Object.assign({ id: d.id }, d.data());
      var card = document.createElement('div');
      card.className = 'feedback-card ' + (data.status || 'baru');
      card.innerHTML = 
        '<div class="feedback-head">' +
          '<div>' +
            '<span class="fb-type ' + (data.type || 'saran') + '">' + (data.type || 'saran') + '</span> ' +
            '<strong>' + (data.subject || '(tanpa subjek)') + '</strong>' +
          '</div>' +
          '<span class="badge badge-' + (data.status === 'baru' ? 'warning' : 'success') + '">' + (data.status === 'baru' ? 'Baru' : 'Resolved') + '</span>' +
        '</div>' +
        '<div class="feedback-meta">' +
          '<span><span class="material-icons">person</span>' + (data.studentName || data.studentId || '-') + '</span>' +
          '<span><span class="material-icons">schedule</span>' + timeAgo(data.createdAt) + '</span>' +
          (data.sessionId ? '<span><span class="material-icons">event</span>' + data.sessionId + '</span>' : '') +
        '</div>' +
        '<div class="feedback-msg">' + (data.message || '') + '</div>' +
        (data.adminNote ? '<div style="background:#eff6ff;padding:.5rem;border-radius:6px;font-size:.8125rem;margin-bottom:.5rem;"><strong>Catatan Admin:</strong> ' + data.adminNote + '</div>' : '') +
        '<div class="feedback-actions">' +
          '<button class="btn btn-secondary btn-sm" onclick="viewFeedbackDetail(\'' + d.id + '\')"><span class="material-icons">visibility</span>Detail</button>' +
          (data.status === 'baru' ? '<button class="btn btn-success btn-sm" onclick="resolveFeedback(\'' + d.id + '\')"><span class="material-icons">task_alt</span>Tandai Resolved</button>' :
            '<button class="btn btn-warning btn-sm" onclick="unresolveFeedback(\'' + d.id + '\')"><span class="material-icons">undo</span>Buka Kembali</button>') +
          '<button class="btn btn-error btn-sm" onclick="deleteFeedback(\'' + d.id + '\')"><span class="material-icons">delete</span>Hapus</button>' +
        '</div>';
      list.appendChild(card);
    });
    
  } catch(e) {
    console.error('Feedback error:', e);
    list.innerHTML = '<div class="empty-state"><span class="material-icons">error</span><p>Error: ' + e.message + '</p><p style="font-size:.75rem;margin-top:.5rem;">Collection "feedback" mungkin belum ada. Akan dibuat otomatis saat siswa mengirim feedback pertama.</p></div>';
  }
}

async function viewFeedbackDetail(id) {
  var d = await db.collection('feedback').doc(id).get();
  if (!d.exists) return;
  var data = d.data();
  
  var msg = 
    '<p><strong>Tipe:</strong> <span class="fb-type ' + (data.type||'saran') + '">' + (data.type||'saran') + '</span></p>' +
    '<p><strong>Subjek:</strong> ' + (data.subject || '-') + '</p>' +
    '<p><strong>Dari:</strong> ' + (data.studentName || data.studentId) + '</p>' +
    '<p><strong>Waktu:</strong> ' + timeAgo(data.createdAt) + '</p>' +
    (data.sessionId ? '<p><strong>Sesi:</strong> ' + data.sessionId + '</p>' : '') +
    (data.questionId ? '<p><strong>Soal ID:</strong> ' + data.questionId + '</p>' : '') +
    '<p><strong>Status:</strong> ' + (data.status || 'baru') + '</p>' +
    '<hr style="margin:.75rem 0;">' +
    '<p><strong>Pesan:</strong></p><div style="background:#f8fafc;padding:.75rem;border-radius:6px;white-space:pre-wrap;">' + (data.message || '') + '</div>';
  
  if (data.adminNote) {
    msg += '<p style="margin-top:.75rem;"><strong>Catatan Admin:</strong></p><div style="background:#eff6ff;padding:.75rem;border-radius:6px;">' + data.adminNote + '</div>';
  }
  
  msg += '<div class="form-group" style="margin-top:1rem;"><label class="form-label">Tambah Catatan Admin</label><textarea class="form-control" id="fbNote" rows="2">' + (data.adminNote || '') + '</textarea></div>';
  
  M.custom({
    title: 'Detail Feedback',
    message: msg,
    type: 'info',
    buttons: [
      { text:'Tutup', class:'btn-secondary' },
      { text:'Simpan Catatan', class:'btn-primary', action: function(){
        var note = document.getElementById('fbNote').value.trim();
        db.collection('feedback').doc(id).update({ adminNote: note }).then(function(){
          toast('Catatan disimpan', 'success');
          loadFeedback();
        });
      }}
    ]
  });
}

async function resolveFeedback(id) {
  confirm2('Resolve', 'Tandai feedback ini sudah ditangani?', async function(){
    await db.collection('feedback').doc(id).update({
      status: 'resolved',
      resolvedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    toast('Ditandai resolved', 'success');
    loadFeedback();
  });
}

async function unresolveFeedback(id) {
  await db.collection('feedback').doc(id).update({
    status: 'baru',
    resolvedAt: null
  });
  toast('Dibuka kembali', 'success');
  loadFeedback();
}

async function deleteFeedback(id) {
  confirm2('Hapus', 'Hapus feedback ini permanen?', async function(){
    await db.collection('feedback').doc(id).delete();
    toast('Dihapus', 'success');
    loadFeedback();
  });
}