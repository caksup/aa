/* #11 | /root/js/init-dashboard.js | v 2.0 | u 06/09/2026 • 22:06:00 | xu : ke-2 | note : 
- Inisialisasi dashboard setelah login
- Bind: nav sidebar, tabs, question-type buttons, form events
- loadPage dispatcher ke file-file page-specific */

function initDashboard() {
  // Tabs
  document.querySelectorAll('.tab').forEach(function(tab){
    tab.addEventListener('click', function(){
      var card = tab.closest('.card');
      card.querySelectorAll('.tab').forEach(function(t){ t.classList.remove('active'); });
      tab.classList.add('active');
      card.querySelectorAll('.tab-content').forEach(function(c){ c.classList.remove('active'); });
      var target = card.querySelector('#tab-' + tab.dataset.tab);
      if (target) target.classList.add('active');
    });
  });
  
  // Sidebar nav
  document.querySelectorAll('.nav-item').forEach(function(item){
    item.addEventListener('click', function(){
      document.querySelectorAll('.nav-item').forEach(function(i){ i.classList.remove('active'); });
      item.classList.add('active');
      document.querySelectorAll('.page-content').forEach(function(p){ p.classList.remove('active'); });
      var page = document.getElementById('page-' + item.dataset.page);
      if (page) page.classList.add('active');
      
      if (window.innerWidth < 768) {
        document.getElementById('sidebar').classList.remove('active');
        document.body.classList.remove('sidebar-open');
      }
      
      loadPage(item.dataset.page);
    });
  });
  
  // Question type buttons
  document.querySelectorAll('.question-type-btn').forEach(function(btn){
    btn.addEventListener('click', function(){
      document.querySelectorAll('.question-type-btn').forEach(function(b){ b.classList.remove('active'); });
      btn.classList.add('active');
      S.qType = btn.dataset.type;
      if (typeof renderQOptions === 'function') renderQOptions();
    });
  });
  
  // Forms
  var formManual = document.getElementById('formManual');
  if (formManual) formManual.addEventListener('submit', function(e){ if (typeof saveStudent === 'function') saveStudent(e); });
  
  var formGenerate = document.getElementById('formGenerate');
  if (formGenerate) formGenerate.addEventListener('submit', function(e){ if (typeof generateStudents === 'function') generateStudents(e); });
  
  var formSoal = document.getElementById('formSoal');
  if (formSoal) formSoal.addEventListener('submit', function(e){ if (typeof saveQuestion === 'function') saveQuestion(e); });
  
  var formAdmin = document.getElementById('formAdmin');
  if (formAdmin) formAdmin.addEventListener('submit', function(e){ if (typeof saveAdminSettings === 'function') saveAdminSettings(e); });
  
  // Load home default
  if (typeof loadHome === 'function') loadHome();
  if (typeof renderQOptions === 'function') renderQOptions();
  if (typeof loadFeedbackCount === 'function') loadFeedbackCount();
}

function loadPage(page) {
  switch(page) {
    case 'home': loadHome(); break;
    case 'manage-siswa': loadStudents(); break;
    case 'manage-soal': loadSessionsDropdown(); loadQuestions(); break;
    case 'manage-sesi': loadSessions(); break;
    case 'live-tka': loadLive(); break;
    case 'review-tka': loadReviewDropdown(); break;
    case 'pembahasan': loadPembDropdown(); break;
    case 'feedback': loadFeedback(); break;
    case 'laporan': loadReports(); break;
    case 'settings': loadSettings(); break;
  }
}