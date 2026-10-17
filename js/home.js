/* #12 | /root/js/home.js | v 2.0 | u 06/09/2026 • 22:07:00 | xu : ke-2 | note : 
- Dashboard Home: statistik (siswa, soal, sesi, attempts) + aktivitas terbaru
- Load paralel semua collection */

async function loadHome() {
  var res = await Promise.all([
    db.collection('students').get(),
    db.collection('questions').get(),
    db.collection('sessions').get(),
    db.collection('attempts').get()
  ]);
  
  document.getElementById('statStudents').textContent = res[0].size;
  document.getElementById('badgeStudents').textContent = res[0].size;
  document.getElementById('statQuestions').textContent = res[1].size;
  document.getElementById('badgeQuestions').textContent = res[1].size;
  document.getElementById('statSessions').textContent = res[2].size;
  document.getElementById('statAttempts').textContent = res[3].size;
  
  S.students = [];
  res[0].forEach(function(d){ S.students.push(Object.assign({ id: d.id }, d.data())); });
  
  // Activity
  var q2 = db.collection('attempts').orderBy('startedAt', 'desc').limit(5);
  var snap = await q2.get();
  var list = document.getElementById('activityList');
  
  if (snap.empty) {
    list.innerHTML = '<li class="empty-state"><span class="material-icons">history</span><p>Belum ada aktivitas</p></li>';
    return;
  }
  
  list.innerHTML = '';
  snap.forEach(function(d){
    var data = d.data();
    var student = S.students.find(function(s){ return s.id === data.studentId; });
    var li = document.createElement('li');
    li.className = 'activity-item';
    li.innerHTML = 
      '<div class="activity-icon"><span class="material-icons">' + (data.status === 'completed' ? 'assignment_turned_in' : 'pending') + '</span></div>' +
      '<div class="activity-text">' +
        '<strong>' + (student ? student.name : data.studentId) + '</strong> ' +
        (data.status === 'completed' ? 'menyelesaikan tes (nilai ' + data.score + ')' : 'sedang mengerjakan tes') +
        '<div class="activity-time">' + timeAgo(data.startedAt) + '</div>' +
      '</div>';
    list.appendChild(li);
  });
}