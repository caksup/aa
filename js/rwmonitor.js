/* #38 | /root/js/rwmonitor.js | v 1.0 | u 08/09/2026 • 13:30:00 | xu : ke-1 | note : #noteresponse
- TOOLS MONITOR READ/WRITE FIRESTORE (instrumentasi sisi klien).
- Cara kerja: monkey-patch prototype Firestore compat (get/set/update/delete/add/batch/
  transaction/onSnapshot) untuk MENGHITUNG operasi read & write yang dilakukan aplikasi.
- Agregasi di memori, lalu FLUSH tiap 60 detik (dan saat page hide) ke collection 'rwstats'
  doc id 'day-YYYY-MM-DD' memakai FieldValue.increment (atomik, aman multi-klien).
- Model hitung meniru penagihan Firestore:
  * Query.get  -> reads += snapshot.size
  * DocRef.get -> reads += 1
  * onSnapshot -> attach: reads += size ; emisi berikutnya: reads += docChanges().length
  * set/update/delete/add/batch/transaction -> writes += 1 per operasi
- RW.ignore(fn) / RW.pause() disediakan agar query milik halaman viewer (rwstats.html)
  dan flush internal TIDAK ikut terhitung (menghindari inflasi).
- CATATAN: angka resmi tertagih tetap di Firebase Console > Usage; tools ini menampilkan
  statistik operasi yang DIINISIASI APLIKASI (pendekatan akurat untuk optimasi). */

(function(){
  'use strict';

  var RW = window.RW = {
    life: { reads:0, writes:0 },        // sejak page load
    mem:  { reads:0, writes:0 },        // belum di-flush ke Firestore
    log:  [],                            // ring buffer operasi terakhir (in-memory)
    paused: false,
    __patched: false,
    __started: false
  };

  function dayStr(d){
    d = d || new Date();
    var p=function(n){return String(n).padStart(2,'0');};
    return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate());
  }
  RW.dayStr = dayStr;
  RW.todayDocId = function(){ return 'day-'+dayStr(); };

  function pushLog(type, n, path){
    RW.log.push({ t: Date.now(), type: type, n: n, path: path||'' });
    if (RW.log.length > 60) RW.log.shift();
  }
  function addReads(n, path){
    RW.life.reads += n;
    if (RW.paused) return;
    RW.mem.reads += n;
    pushLog('read', n, path);
  }
  function addWrites(n, path){
    RW.life.writes += n;
    if (RW.paused) return;
    RW.mem.writes += n;
    pushLog('write', n, path);
  }
  RW.addReads = addReads; RW.addWrites = addWrites;

  RW.pause  = function(){ RW.paused = true; };
  RW.resume = function(){ RW.paused = false; };
  RW.ignore = function(fn){
    RW.pause();
    var done = function(){ RW.resume(); };
    try {
      var r = fn();
      if (r && typeof r.then === 'function') return r.then(function(v){ done(); return v; }, function(e){ done(); throw e; });
      done(); return r;
    } catch(e){ done(); throw e; }
  };

  function safePath(obj){
    try { return obj && obj.path ? obj.path : ''; } catch(e){ return ''; }
  }

  // ===== Monkey-patch Firestore compat =====
  function patch(){
    if (RW.__patched) return;
    var F = firebase.firestore;
    if (!F) return;
    RW.__patched = true;

    var Q = F.Query.prototype,
        D = F.DocumentReference.prototype,
        C = F.CollectionReference.prototype,
        B = F.WriteBatch.prototype,
        T = F.Transaction.prototype;

    function wrap(proto, name, counter){
      var orig = proto[name];
      if (!orig) return;
      proto[name] = function(){
        counter.call(this, arguments);
        return orig.apply(this, arguments);
      };
    }

    // --- READS ---
    (function(){
      var orig = Q.get;
      Q.get = function(){
        var self=this;
        return orig.apply(this, arguments).then(function(snap){
          addReads(snap.size, safePath(self));
          return snap;
        });
      };
    })();
    (function(){
      var orig = D.get;
      D.get = function(){
        var self=this;
        return orig.apply(this, arguments).then(function(){
          addReads(1, safePath(self));
          return arguments.length? arguments[0] : undefined;
        });
      };
    })();
    // onSnapshot Query: attach = size, emisi lanjut = docChanges
    (function(){
      var orig = Q.onSnapshot;
      Q.onSnapshot = function(){
        var self=this, first=true;
        var args = Array.prototype.slice.call(arguments);
        for (var i=0;i<args.length;i++){
          if (typeof args[i]==='function'){
            (function(idx){
              var fn = args[idx];
              args[idx] = function(snap){
                if (first){ addReads(snap.size, safePath(self)); first=false; }
                else { try{ addReads(snap.docChanges().length, safePath(self)); }catch(e){ addReads(0); } }
                return fn.apply(this, arguments);
              };
            })(i);
            break;
          }
        }
        return orig.apply(this, args);
      };
    })();
    (function(){
      var orig = D.onSnapshot;
      D.onSnapshot = function(){
        var self=this, first=true;
        var args = Array.prototype.slice.call(arguments);
        for (var i=0;i<args.length;i++){
          if (typeof args[i]==='function'){
            (function(idx){
              var fn = args[idx];
              args[idx] = function(){
                addReads(1, safePath(self));
                first=false;
                return fn.apply(this, arguments);
              };
            })(i);
            break;
          }
        }
        return orig.apply(this, args);
      };
    })();
    (function(){
      var orig = T.get;
      if (orig) T.get = function(){
        var self=this;
        return orig.apply(this, arguments).then(function(){ addReads(1, safePath(self)); return arguments.length?arguments[0]:undefined; });
      };
    })();

    // --- WRITES ---
    wrap(D, 'set',    function(){ addWrites(1, safePath(this)); });
    wrap(D, 'update', function(){ addWrites(1, safePath(this)); });
    wrap(D, 'delete', function(){ addWrites(1, safePath(this)); });
    wrap(C, 'add',    function(){ addWrites(1, safePath(this)); });
    wrap(B, 'set',    function(){ addWrites(1); });
    wrap(B, 'update', function(){ addWrites(1); });
    wrap(B, 'delete', function(){ addWrites(1); });
    if (T){
      wrap(T, 'set',    function(){ addWrites(1); });
      wrap(T, 'update', function(){ addWrites(1); });
      wrap(T, 'delete', function(){ addWrites(1); });
    }

    console.log('✅ rwmonitor: Firestore ter-instrument');
  }

  // ===== Flush agregat ke Firestore (hemat: 1 write / 60s / klien) =====
  function flush(){
    if (!window.db || (!RW.mem.reads && !RW.mem.writes)) return;
    var r = RW.mem.reads, w = RW.mem.writes;
    RW.mem = { reads:0, writes:0 };
    RW.pause();
    var F = firebase.firestore;
    db.collection('rwstats').doc(RW.todayDocId()).set({
      day: dayStr(),
      reads:  F.FieldValue.increment(r),
      writes: F.FieldValue.increment(w),
      updatedAt: F.FieldValue.serverTimestamp()
    }, { merge: true })
    .catch(function(){
      // gagal -> kembalikan agar tidak hilang
      RW.mem.reads += r; RW.mem.writes += w;
    })
    .then(function(){ RW.resume(); });
  }
  RW.flush = flush;

  // ===== Query helper utk viewer (dipakai rwstats.html) =====
  RW.listDays = function(limit){
    limit = limit || 30;
    return RW.ignore(function(){
      return db.collection('rwstats').orderBy('day','desc').limit(limit).get().then(function(snap){
        var out=[]; snap.forEach(function(d){ out.push(Object.assign({id:d.id}, d.data())); });
        return out;
      });
    });
  };
  RW.watchToday = function(cb){
    return RW.ignore(function(){
      return db.collection('rwstats').doc(RW.todayDocId()).onSnapshot(function(snap){
        cb(snap.exists ? snap.data() : { day: dayStr(), reads:0, writes:0 });
      });
    });
  };
  RW.summary = function(){
    return { life: RW.life, mem: RW.mem, log: RW.log.slice(-20) };
  };

  // ===== Auto-start saat window.db siap =====
  var poll = setInterval(function(){
    if (window.db && !RW.__started){
      RW.__started = true;
      clearInterval(poll);
      patch();
      setInterval(flush, 60000);
      window.addEventListener('pagehide', flush);
      document.addEventListener('visibilitychange', function(){ if (document.hidden) flush(); });
    }
  }, 200);
  // berhenti poll setelah 15 detik bila db tak pernah ada
  setTimeout(function(){ clearInterval(poll); }, 15000);
})();