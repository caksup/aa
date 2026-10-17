// #21 | /root/js/devtools.js | v 3.2 | update : 10/09/2026 • 09:20:00 | Note : Eruda dipindah ke DEPAN + persist (auto-load setelah refresh via localStorage flag); Console Inject Script (REPL: run JS arbitrary, support await, riwayat snippet); Firestore Manager (list/view/edit/add/delete/wipe dokumen Firestore); tools inti tetap di depan; semua fitur v3.1 tetap (tema hacker, minimize, fullscreen, drag-atas, Cek File, 37+ tools)
(function(){
'use strict';
if (!new URLSearchParams(location.search).has('devtools')) return;

var HK = {
  bg:'#050805', bg2:'#0a0f0a', bg3:'#001a00',
  line:'#00ff4133', line2:'#00ff4155',
  fg:'#00ff41', fgDim:'#00b32d', fgSoft:'#00ff4122',
  accent:'#39ff14', bad:'#ff3b3b', warn:'#ffb000'
};

var DT = {
    open:false, fullscreen:false, minimized:false,
    logs:[], reqs:[],
    _cap:false, _reqWrapped:false, _lastResultShown:false, _domWatch:null,
    pos:{x:null,y:null}, lastAuto:null, clockInterval:null,
    fsCol:'students', fsLim:10,
    devliveFiles:[
        'ap.html','sp.html','seed.html','cek.html',
        'css/g.css','css/a.css','css/s.css','css/brand.css',
        'js/fc.js','js/hash.js','js/modal.js','js/header.js','js/devtools.js',
        'js/state.js','js/login.js','js/init-dashboard.js','js/home.js',
        'js/manage-siswa.js','js/manage-soal.js','js/manage-sesi.js',
        'js/riwayat-sesi.js','js/live-tka.js','js/review.js','js/pembahasan.js',
        'js/feedback.js','js/laporan.js','js/kontak.js','js/settings.js','js/datasiswa.js'
    ],
    devliveData:[],

    init:function(){
        this.injectCSS(); this.captureLogs(); this.loadPos(); this.buildFab(); this.buildPanel(); this.startClock();
        // Eruda persist: auto-load bila sebelumnya diaktifkan
        try{ if (localStorage.getItem('tka_dt_eruda')==='1') this.loadEruda(true); }catch(e){}
        var s=this; setTimeout(function(){ s.autoScan(true); },1200);
    },

    injectCSS:function(){
        if (document.getElementById('adt-hacker-css')) return;
        var st=document.createElement('style'); st.id='adt-hacker-css';
        st.textContent=[
            '#adt-panel{background:'+HK.bg+' !important;border:1px solid '+HK.line2+' !important;font-family:"Courier New",ui-monospace,monospace !important;box-shadow:0 0 24px '+HK.line+', inset 0 0 60px #00ff4108 !important;}',
            '#adt-header{background:linear-gradient(135deg,'+HK.bg3+',#003000) !important;border-bottom:1px solid '+HK.line2+' !important;color:'+HK.fg+' !important;}',
            '#adt-header span[id]{background:'+HK.fgSoft+' !important;border:1px solid '+HK.line+' !important;}',
            '#adt-header span[id]:hover{background:'+HK.fg+' !important;color:#000 !important;}',
            '#adt-header span[id] .material-icons{color:inherit !important;}',
            '#adt-toolbar{background:'+HK.bg2+' !important;border-bottom:1px solid '+HK.line+' !important;}',
            '#adt-toolbar button{background:#0a140a !important;border:1px solid '+HK.line+' !important;}',
            '#adt-toolbar button:hover{background:'+HK.fgSoft+' !important;border-color:'+HK.fg+' !important;}',
            '#adt-toolbar button .material-icons{color:'+HK.fg+' !important;}',
            '#adt-toolbar button span:last-child{color:'+HK.fg+' !important;}',
            '#adt-result{background:'+HK.bg+' !important;}',
            '#adt-result pre{background:#000 !important;color:'+HK.fg+' !important;border:1px solid '+HK.line+' !important;text-shadow:0 0 4px '+HK.line+';}',
            '#adt-result table{background:transparent !important;}',
            '#adt-result thead tr{background:'+HK.bg3+' !important;}',
            '#adt-result th{background:'+HK.bg3+' !important;color:'+HK.fg+' !important;border-bottom:1px solid '+HK.line2+' !important;}',
            '#adt-result td{background:transparent !important;color:'+HK.fgDim+' !important;border-bottom:1px solid '+HK.line+' !important;}',
            '#adt-result td b,#adt-result td strong{color:'+HK.fg+' !important;}',
            '#adt-result tr:hover td{background:'+HK.fgSoft+' !important;}',
            '#adt-result input,#adt-result select,#adt-result textarea{background:#000 !important;color:'+HK.fg+' !important;border:1px solid '+HK.line2+' !important;}',
            '#adt-copy{background:'+HK.bg3+' !important;color:'+HK.fg+' !important;border:1px solid '+HK.line2+' !important;}',
            '#adt-copy:hover{background:'+HK.fg+' !important;color:#000 !important;}',
            '#adt-fab{background:linear-gradient(135deg,#003300,#001a00) !important;border:1px solid '+HK.fg+' !important;box-shadow:0 0 14px '+HK.line2+' !important;color:'+HK.fg+' !important;}',
            '#adt-fab .material-icons{color:'+HK.fg+' !important;}',
            '#adt-badge{background:'+HK.accent+' !important;color:#000 !important;border-color:'+HK.bg+' !important;}',
            '#adt-result::-webkit-scrollbar,#adt-toolbar::-webkit-scrollbar{width:6px;height:6px;}',
            '#adt-result::-webkit-scrollbar-thumb,#adt-toolbar::-webkit-scrollbar-thumb{background:'+HK.fgDim+';border-radius:3px;}',
            '#adt-result::-webkit-scrollbar-track,#adt-toolbar::-webkit-scrollbar-track{background:'+HK.bg2+';}'
        ].join('\n');
        document.head.appendChild(st);
    },

    loadPos:function(){ try{ var p=JSON.parse(localStorage.getItem('tka_dt_pos')); if(p) this.pos=p; }catch(e){} if(!this.pos.x) this.pos={x:innerWidth-62,y:innerHeight-62}; },
    savePos:function(){ try{ localStorage.setItem('tka_dt_pos',JSON.stringify(this.pos)); }catch(e){} },

    startClock:function(){
        if(this.clockInterval) clearInterval(this.clockInterval);
        var upd=function(){ var el=document.getElementById('devlive-clock'); if(el){ var n=new Date(); var p=function(x){return String(x).padStart(2,'0');}; el.textContent=p(n.getHours())+':'+p(n.getMinutes())+':'+p(n.getSeconds()); } };
        upd(); this.clockInterval=setInterval(upd,1000);
    },

    mp:function(title,def){
        if (window.M && typeof window.M.prompt==='function') return window.M.prompt(title,{defaultValue:(def===undefined||def===null)?'':String(def)});
        return window.prompt(title,(def===undefined||def===null)?'':String(def));
    },

    // ===== ERUDA (persist + loader) =====
    loadEruda:function(auto){
        var self=this;
        var s=document.createElement('script');
        s.src='https://cdn.jsdelivr.net/npm/eruda';
        s.onload=function(){
            try{
                eruda.init();
                if(!auto) eruda.show();
                try{ localStorage.setItem('tka_dt_eruda','1'); }catch(e){}
                self.logs.push({t:Date.now(),type:'info',msg:'Eruda '+(auto?'auto-loaded (persist)':'diaktifkan')});
                if(auto && self.open) self.show('Eruda persist: aktif (akan tetap ada setelah refresh).');
            }catch(e){ if(!auto) self.show('Eruda init error: '+e.message); }
        };
        s.onerror=function(){ if(!auto) self.show('CDN Eruda gagal dimuat.'); };
        document.head.appendChild(s);
    },

    buildFab:function(){
        var fab=document.createElement('div'); fab.id='adt-fab';
        fab.innerHTML='<span class="material-icons" style="font-size:24px;">terminal</span>';
        fab.style.cssText='position:fixed;width:48px;height:48px;border-radius:50%;background:linear-gradient(135deg,#003300,#001a00);color:'+HK.fg+';display:flex;align-items:center;justify-content:center;z-index:2147483640;box-shadow:0 0 14px '+HK.line2+';border:1px solid '+HK.fg+';cursor:grab;user-select:none;touch-action:none;transition:box-shadow .2s;';
        fab.style.left=this.pos.x+'px'; fab.style.top=this.pos.y+'px';
        var b=document.createElement('span'); b.id='adt-badge';
        b.style.cssText='position:absolute;top:-4px;right:-4px;background:'+HK.accent+';color:#000;border-radius:10px;font-size:9px;padding:1px 5px;font-weight:800;border:1.5px solid '+HK.bg+';pointer-events:none;';
        b.textContent='…'; fab.appendChild(b);
        var self=this; var dr=false,mv=false,sx,sy,ox,oy;
        var st=function(e){ dr=true;mv=false; var t=e.touches?e.touches[0]:e; sx=t.clientX;sy=t.clientY; ox=fab.offsetLeft;oy=fab.offsetTop; fab.style.boxShadow='0 0 24px '+HK.fg; };
        var mo=function(e){ if(!dr)return; e.preventDefault(); var t=e.touches?e.touches[0]:e; var dx=t.clientX-sx,dy=t.clientY-sy; if(Math.abs(dx)>4||Math.abs(dy)>4)mv=true; var nx=Math.max(0,Math.min(ox+dx,innerWidth-48)),ny=Math.max(0,Math.min(oy+dy,innerHeight-48)); fab.style.left=nx+'px'; fab.style.top=ny+'px'; };
        var en=function(){ if(!dr)return; dr=false; fab.style.boxShadow='0 0 14px '+HK.line2; self.pos={x:fab.offsetLeft,y:fab.offsetTop}; self.savePos(); if(!mv) self.toggle(); };
        fab.addEventListener('mousedown',st); fab.addEventListener('touchstart',st,{passive:false});
        document.addEventListener('mousemove',mo); document.addEventListener('touchmove',mo,{passive:false});
        document.addEventListener('mouseup',en); document.addEventListener('touchend',en);
        document.body.appendChild(fab);
    },

    buildPanel:function(){
        var p=document.createElement('div'); p.id='adt-panel';
        p.style.cssText='position:fixed;left:8px;right:8px;bottom:80px;top:50%;max-height:60vh;background:'+HK.bg+';border-radius:12px;box-shadow:0 0 24px '+HK.line+';z-index:2147483641;display:none;flex-direction:column;overflow:hidden;border:1px solid '+HK.line2+';font-family:"Courier New",ui-monospace,monospace;';
        var hb=function(id,icon,title){ return '<span id="'+id+'" title="'+title+'" style="cursor:pointer;padding:3px;border-radius:4px;background:'+HK.fgSoft+';border:1px solid '+HK.line+';display:flex;align-items:center;justify-content:center;color:'+HK.fg+';"><span class="material-icons" style="font-size:18px;">'+icon+'</span></span>'; };
        var h='<div id="adt-header" style="background:linear-gradient(135deg,'+HK.bg3+',#003000);color:'+HK.fg+';padding:10px 14px;display:flex;justify-content:space-between;align-items:center;cursor:move;user-select:none;border-bottom:1px solid '+HK.line2+';">';
        h+='<span style="font-size:13px;font-weight:800;display:flex;align-items:center;gap:6px;text-shadow:0 0 6px '+HK.line+';"><span class="material-icons" style="font-size:18px;">terminal</span> DevTools <small style="opacity:.7;font-weight:500;">v3.2</small></span>';
        h+='<div style="display:flex;gap:6px;">';
        h+=hb('adt-minimize','minimize','Minimize');
        h+=hb('adt-fullscreen','fullscreen','Fullscreen');
        h+=hb('adt-close','close','Close');
        h+='</div></div>';
        h+='<div id="adt-toolbar" style="overflow-x:auto;white-space:nowrap;padding:8px 10px;background:'+HK.bg2+';border-bottom:1px solid '+HK.line+';scrollbar-width:none;-webkit-overflow-scrolling:touch;">';
        h+='<div style="display:inline-flex;gap:6px;">';
        var tools=[
            ['eruda','bug_report','Eruda'],
            ['inject','play_circle','Inject'],
            ['logs','terminal','Console'],
            ['fsman','storage','FS Manager'],
            ['jscheck','code','Cek JS'],
            ['fbcheck','cloud','Firebase'],
            ['state','person','State'],
            ['fsquery','search','Query FS'],
            ['filecheck','fact_check','Cek File'],
            ['devlive','sensors','DevLive'],
            ['integration','link','Integration'],
            ['history','history','Riwayat'],
            ['reqlog','monitor_heart','Req Log'],
            ['globals','public','Globals'],
            ['lsinspect','folder','Storage'],
            ['quota','sd_storage','Quota'],
            ['cookies','cookie','Cookies'],
            ['network','wifi','Network'],
            ['httphead','http','Headers'],
            ['dom','account_tree','DOM'],
            ['domwatch','visibility','DOM Watch'],
            ['performance','speed','Perf/Mem'],
            ['fps','timer','FPS'],
            ['sysinfo','computer','SysInfo'],
            ['battery','battery_full','Battery'],
            ['geo','place','Geo'],
            ['screen','devices','Screen'],
            ['color','palette','Color'],
            ['a11y','accessibility','A11y'],
            ['base64','swap_horiz','Base64'],
            ['uuid','fingerprint','UUID'],
            ['timestamp','schedule','Timestamp'],
            ['regex','manage_search','Regex'],
            ['jsonfmt','data_object','JSON'],
            ['clipboard','content_paste','Clipboard'],
            ['pinhash','lock','Hash PIN'],
            ['clearcache','cleaning_services','Cache'],
            ['clearls','delete_sweep','Data'],
            ['reload','refresh','Reload']
        ];
        tools.forEach(function(t){
            h+='<button data-tool="'+t[0]+'" title="'+t[2]+'" style="flex:0 0 auto;display:flex;flex-direction:column;align-items:center;gap:2px;padding:6px 10px;background:#0a140a;border:1px solid '+HK.line+';border-radius:8px;cursor:pointer;min-width:56px;transition:all .15s;">';
            h+='<span class="material-icons" style="font-size:20px;color:'+HK.fg+';">'+t[1]+'</span>';
            h+='<span style="font-size:9px;font-weight:700;color:'+HK.fg+';white-space:nowrap;">'+t[2]+'</span>';
            h+='</button>';
        });
        h+='</div></div>';
        h+='<div id="adt-result" style="flex:1;overflow-y:auto;background:'+HK.bg+';padding:10px;display:none;">';
        h+='<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">';
        h+='<span style="font-size:10px;font-weight:800;color:'+HK.fgDim+';display:flex;align-items:center;gap:3px;"><span class="material-icons" style="font-size:12px;">output</span> HASIL</span>';
        h+='<button id="adt-copy" style="background:'+HK.bg3+';color:'+HK.fg+';border:1px solid '+HK.line2+';padding:4px 10px;border-radius:5px;font-size:9px;font-weight:700;cursor:pointer;display:flex;align-items:center;gap:3px;"><span class="material-icons" style="font-size:11px;">content_copy</span> Salin</button>';
        h+='</div>';
        h+='<pre id="adt-result-text" style="font-size:9px;color:'+HK.fg+';white-space:pre-wrap;margin:0;font-family:monospace;line-height:1.4;user-select:text;-webkit-user-select:text;background:#000;padding:8px;border-radius:6px;border:1px solid '+HK.line+';"></pre>';
        h+='</div>';
        p.innerHTML=h; document.body.appendChild(p);
        var self=this;
        document.getElementById('adt-close').addEventListener('click',function(e){ e.stopPropagation(); self.toggle(); });
        document.getElementById('adt-fullscreen').addEventListener('click',function(e){ e.stopPropagation(); self.toggleFullscreen(); });
        document.getElementById('adt-minimize').addEventListener('click',function(e){ e.stopPropagation(); self.toggleMinimize(); });
        document.getElementById('adt-copy').addEventListener('click',function(){ self.copyResult(); });
        this.initDrag();
        p.querySelectorAll('[data-tool]').forEach(function(btn){ btn.addEventListener('click',function(){ self.run(btn.dataset.tool); }); });
    },

    initDrag:function(){
        var header=document.getElementById('adt-header'); var panel=document.getElementById('adt-panel');
        if(!header||!panel) return;
        var isDragging=false,startY=0,startTop=0;
        var down=function(e){ var t=e.target; if(t&&t.closest&&t.closest('#adt-close,#adt-fullscreen,#adt-minimize'))return; isDragging=true; startY=e.clientY||(e.touches&&e.touches[0].clientY); var r=panel.getBoundingClientRect(); startTop=r.top; panel.style.transition='none'; e.preventDefault(); };
        var move=function(e){ if(!isDragging)return; var cy=e.clientY||(e.touches&&e.touches[0].clientY); if(!cy)return; var nt=startTop+(cy-startY); var maxTop=innerHeight-160; panel.style.top=Math.max(0,Math.min(nt,maxTop))+'px'; panel.style.bottom='auto'; };
        var up=function(){ if(isDragging){ isDragging=false; panel.style.transition=''; } };
        header.addEventListener('mousedown',down); header.addEventListener('touchstart',down,{passive:false});
        document.addEventListener('mousemove',move); document.addEventListener('touchmove',move,{passive:false});
        document.addEventListener('mouseup',up); document.addEventListener('touchend',up);
    },

    toggle:function(){ this.open=!this.open; document.getElementById('adt-panel').style.display=this.open?'flex':'none'; },

    toggleFullscreen:function(){
        if(this.minimized) this.toggleMinimize();
        this.fullscreen=!this.fullscreen;
        var panel=document.getElementById('adt-panel'); var fsBtn=document.getElementById('adt-fullscreen');
        if(this.fullscreen){ panel.style.cssText='position:fixed;left:0;right:0;top:0;bottom:0;width:100%;height:100%;max-height:none;z-index:2147483647;display:flex;flex-direction:column;overflow:hidden;border-radius:0;background:'+HK.bg+';border:1px solid '+HK.line2+';font-family:"Courier New",monospace;'; fsBtn.innerHTML='<span class="material-icons" style="font-size:18px;">fullscreen_exit</span>'; }
        else { panel.style.cssText='position:fixed;left:8px;right:8px;bottom:80px;top:50%;max-height:60vh;background:'+HK.bg+';border-radius:12px;box-shadow:0 0 24px '+HK.line+';z-index:2147483641;display:flex;flex-direction:column;overflow:hidden;border:1px solid '+HK.line2+';font-family:"Courier New",monospace;'; fsBtn.innerHTML='<span class="material-icons" style="font-size:18px;">fullscreen</span>'; }
    },

    toggleMinimize:function(){
        this.minimized=!this.minimized;
        var panel=document.getElementById('adt-panel'); var tb=document.getElementById('adt-toolbar'); var rs=document.getElementById('adt-result'); var btn=document.getElementById('adt-minimize');
        if(this.minimized){ if(this.fullscreen)this.toggleFullscreen(); if(tb)tb.style.display='none'; if(rs)rs.style.display='none'; panel.style.top='auto'; panel.style.bottom='8px'; panel.style.maxHeight='none'; panel.style.height='auto'; btn.innerHTML='<span class="material-icons" style="font-size:18px;">expand_less</span>'; }
        else { if(tb)tb.style.display=''; if(rs&&this._lastResultShown)rs.style.display='block'; panel.style.height=''; panel.style.maxHeight='60vh'; btn.innerHTML='<span class="material-icons" style="font-size:18px;">minimize</span>'; }
    },

    show:function(t){ var r=document.getElementById('adt-result'),x=document.getElementById('adt-result-text'); if(r&&x){ x.textContent=t; r.style.display='block'; this._lastResultShown=true; } },
    showHTML:function(h){ var r=document.getElementById('adt-result'),x=document.getElementById('adt-result-text'); if(r&&x){ x.innerHTML=h; r.style.display='block'; this._lastResultShown=true; } },

    copyResult:function(){
        var t=document.getElementById('adt-result-text'); if(!t)return; var x=t.innerText;
        if(navigator.clipboard&&navigator.clipboard.writeText) navigator.clipboard.writeText(x).then(function(){ if(window.M)window.M.toast('Tersalin','success'); });
        else { var ta=document.createElement('textarea'); ta.value=x; ta.style.cssText='position:fixed;opacity:0;'; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); if(window.M)window.M.toast('Tersalin','success'); }
    },

    run:function(id){
        var self=this;
        var m={
            eruda:function(){ self.tEruda(); },
            inject:function(){ self.tInject(); },
            logs:function(){ self.tLogs(); },
            fsman:function(){ self.tFsMan(); },
            jscheck:function(){ self.tJs(); },
            fbcheck:function(){ self.tFb(); },
            state:function(){ self.tState(); },
            fsquery:function(){ self.tQuery(); },
            lsinspect:function(){ self.tLs(); },
            cookies:function(){ self.tCookies(); },
            network:function(){ self.tNetwork(); },
            dom:function(){ self.tDOM(); },
            performance:function(){ self.tPerformance(); },
            color:function(){ self.tColor(); },
            a11y:function(){ self.tA11y(); },
            screen:function(){ self.tScreen(); },
            pinhash:function(){ self.tPin(); },
            clearcache:function(){ self.tCache(); },
            clearls:function(){ self.tClearLs(); },
            integration:function(){ self.tIntegration(); },
            filecheck:function(){ self.tFileCheck(); },
            reqlog:function(){ self.tReqLog(); },
            globals:function(){ self.tGlobals(); },
            quota:function(){ self.tQuota(); },
            httphead:function(){ self.tHttpHead(); },
            domwatch:function(){ self.tDomWatch(); },
            fps:function(){ self.tFps(); },
            sysinfo:function(){ self.tSysInfo(); },
            battery:function(){ self.tBattery(); },
            geo:function(){ self.tGeo(); },
            base64:function(){ self.tBase64(); },
            uuid:function(){ self.tUuid(); },
            timestamp:function(){ self.tTimestamp(); },
            regex:function(){ self.tRegex(); },
            jsonfmt:function(){ self.tJson(); },
            clipboard:function(){ self.tClipboard(); },
            devlive:function(){ self.tDevlive(); },
            history:function(){ self.tHistory(); },
            reload:function(){ location.reload(true); }
        };
        if(m[id]) m[id]();
    },

    captureLogs:function(){
        if(this._cap)return; this._cap=true; var s=this;
        ['log','info','warn','error'].forEach(function(k){
            var o=console[k].bind(console);
            console[k]=function(){ var a=[]; for(var i=0;i<arguments.length;i++){ var x=arguments[i]; try{ a.push(typeof x==='object'?JSON.stringify(x):String(x)); }catch(e){ a.push(String(x)); } } s.logs.push({t:Date.now(),type:k,msg:a.join(' ')}); if(s.logs.length>300)s.logs.shift(); o.apply(console,arguments); };
        });
        window.addEventListener('error',function(e){ s.logs.push({t:Date.now(),type:'error',msg:'ERR: '+e.message+' @'+(e.filename||'').split('/').pop()+':'+e.lineno}); });
        window.addEventListener('unhandledrejection',function(e){ s.logs.push({t:Date.now(),type:'error',msg:'REJECT: '+((e.reason&&e.reason.message)||e.reason)}); });
    },

    // ===== ERUDA tool (toggle + persist) =====
    tEruda:function(){
        var on=false; try{ on=localStorage.getItem('tka_dt_eruda')==='1'; }catch(e){}
        if(window.eruda){
            if(on){
                if(confirm('Eruda AKTIF & persist.\nMatikan (hapus persist) & reload?')){ try{ localStorage.removeItem('tka_dt_eruda'); }catch(e){} location.reload(); }
                else { eruda.show(); this.show('Eruda ditampilkan.'); }
            } else { eruda.show(); this.show('Eruda ditampilkan.'); }
            return;
        }
        this.show('Memuat Eruda...');
        this.loadEruda(false);
    },

    // ===== INJECT SCRIPT (REPL) =====
    tInject:function(){
        var self=this;
        var hist=[]; try{ hist=JSON.parse(localStorage.getItem('tka_dt_inject_hist')||'[]'); }catch(e){}
        var html='<div style="font-size:10px;font-weight:800;margin-bottom:6px;display:flex;align-items:center;gap:4px;color:'+HK.fg+';"><span class="material-icons" style="font-size:12px;">play_circle</span> INJECT SCRIPT (REPL)</div>';
        html+='<textarea id="dt-inject-code" rows="6" style="width:100%;font-family:monospace;font-size:9px;padding:6px;border-radius:6px;" placeholder="Contoh: return S.students.length&#10;atau: await db.collection(\'students\').limit(2).get()">'+(hist[0]?hist[0].replace(/</g,'&lt;'):'')+'</textarea>';
        html+='<div style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap;">';
        html+='<button id="dt-inject-run" style="background:'+HK.bg3+';color:'+HK.fg+';border:1px solid '+HK.line2+';padding:5px 12px;border-radius:5px;font-size:9px;font-weight:700;cursor:pointer;">▶ RUN</button>';
        html+='<button id="dt-inject-save" style="background:'+HK.bg2+';color:'+HK.fgDim+';border:1px solid '+HK.line+';padding:5px 12px;border-radius:5px;font-size:9px;font-weight:700;cursor:pointer;">Simpan snippet</button>';
        html+='<button id="dt-inject-clear" style="background:'+HK.bg2+';color:'+HK.fgDim+';border:1px solid '+HK.line+';padding:5px 12px;border-radius:5px;font-size:9px;font-weight:700;cursor:pointer;">Bersihkan</button>';
        html+='</div>';
        html+='<div id="dt-inject-out" style="margin-top:6px;padding:6px;background:#000;border:1px solid '+HK.line+';border-radius:6px;font-family:monospace;font-size:9px;color:'+HK.fg+';white-space:pre-wrap;min-height:24px;">(output)</div>';
        if(hist.length){
            html+='<div style="margin-top:6px;font-size:9px;color:'+HK.fgDim+';font-weight:700;">RIWAYAT SNIPPET:</div>';
            hist.slice(0,6).forEach(function(sn,i){
                html+='<button class="dt-inject-hist" data-i="'+i+'" style="display:block;width:100%;text-align:left;margin-top:3px;background:'+HK.bg2+';color:'+HK.fgDim+';border:1px solid '+HK.line+';padding:4px 6px;border-radius:4px;font-size:8px;font-family:monospace;cursor:pointer;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">'+sn.replace(/</g,'&lt;')+'</button>';
            });
        }
        this.showHTML(html);

        var ta=document.getElementById('dt-inject-code');
        var out=document.getElementById('dt-inject-out');
        var runCode=function(code){
            return new Promise(function(resolve){
                try{
                    var fn;
                    if (/\bawait\b/.test(code)) fn=new Function('return (async function(){ '+code+' })()');
                    else fn=new Function('return (function(){ '+code+' })()');
                    var r=fn();
                    if (r && typeof r.then==='function') r.then(function(v){ resolve({ok:true,val:v}); },function(e){ resolve({ok:false,err:e}); });
                    else resolve({ok:true,val:r});
                }catch(e){ resolve({ok:false,err:e}); }
            });
        };
        var fmt=function(v){
            if (v===undefined) return 'undefined';
            if (v===null) return 'null';
            if (typeof v==='object'){ try{ return JSON.stringify(v,null,1); }catch(e){ return String(v); } }
            return String(v);
        };
        document.getElementById('dt-inject-run').addEventListener('click',function(){
            var code=ta.value;
            out.textContent='running...';
            runCode(code).then(function(r){
                var txt;
                if(r.ok){ txt='=> '+fmt(r.val); self.logs.push({t:Date.now(),type:'info',msg:'INJECT OK: '+code.slice(0,60)}); }
                else { txt='ERROR: '+(r.err&&r.err.message||r.err); self.logs.push({t:Date.now(),type:'error',msg:'INJECT ERR: '+(r.err&&r.err.message||r.err)}); }
                out.textContent=txt;
                // push riwayat
                try{
                    var h2=JSON.parse(localStorage.getItem('tka_dt_inject_hist')||'[]');
                    h2=[code].concat(h2.filter(function(x){return x!==code;})).slice(0,10);
                    localStorage.setItem('tka_dt_inject_hist',JSON.stringify(h2));
                }catch(e){}
            });
        });
        document.getElementById('dt-inject-save').addEventListener('click',function(){
            try{
                var h2=JSON.parse(localStorage.getItem('tka_dt_inject_hist')||'[]');
                h2=[ta.value].concat(h2.filter(function(x){return x!==ta.value;})).slice(0,10);
                localStorage.setItem('tka_dt_inject_hist',JSON.stringify(h2));
                if(window.M)window.M.toast('Snippet disimpan','success');
            }catch(e){}
        });
        document.getElementById('dt-inject-clear').addEventListener('click',function(){ ta.value=''; out.textContent='(output)'; });
        document.querySelectorAll('.dt-inject-hist').forEach(function(btn){
            btn.addEventListener('click',function(){ var i=+btn.dataset.i; var h2=[]; try{ h2=JSON.parse(localStorage.getItem('tka_dt_inject_hist')||'[]'); }catch(e){} if(h2[i]!==undefined) ta.value=h2[i]; });
        });
    },

    // ===== FIRESTORE MANAGER =====
    tFsMan:function(){
        var self=this;
        Promise.resolve(this.mp('Collection (students/sessions/questions/attempts/feedback/settings/admins):','students')).then(function(col){
            if(!col) return;
            Promise.resolve(self.mp('Limit dokumen:','10')).then(function(lim){
                self.fsCol=col; self.fsLim=parseInt(lim)||10; self.fsLoad();
            });
        });
    },
    fsLoad:function(){
        var self=this; var col=this.fsCol, lim=this.fsLim;
        if(typeof window.db==='undefined'){ this.show('db tidak ditemukan.'); return; }
        this.show('Memuat '+col+' (limit '+lim+')...');
        window.db.collection(col).limit(lim).get().then(function(s){ self.fsRender(s); }).catch(function(e){ self.show('Error: '+e.message); });
    },
    fsRender:function(snap){
        var self=this; var col=this.fsCol;
        var html='<div style="font-size:10px;font-weight:800;margin-bottom:6px;display:flex;align-items:center;gap:4px;color:'+HK.fg+';flex-wrap:wrap;"><span class="material-icons" style="font-size:12px;">storage</span> FS MANAGER: '+col+' ('+snap.size+')</div>';
        html+='<div style="display:flex;gap:6px;margin-bottom:6px;flex-wrap:wrap;">';
        html+='<button id="dt-fs-refresh" style="background:'+HK.bg2+';color:'+HK.fg+';border:1px solid '+HK.line+';padding:4px 10px;border-radius:5px;font-size:9px;font-weight:700;cursor:pointer;">Refresh</button>';
        html+='<button id="dt-fs-add" style="background:'+HK.bg3+';color:'+HK.fg+';border:1px solid '+HK.line2+';padding:4px 10px;border-radius:5px;font-size:9px;font-weight:700;cursor:pointer;">+ Add Doc</button>';
        html+='<button id="dt-fs-wipe" style="background:#2a0000;color:'+HK.bad+';border:1px solid '+HK.bad+';padding:4px 10px;border-radius:5px;font-size:9px;font-weight:700;cursor:pointer;">Wipe ALL</button>';
        html+='</div>';
        html+='<table style="width:100%;border-collapse:collapse;font-size:9px;background:'+HK.bg2+';border-radius:6px;overflow:hidden;">';
        html+='<thead><tr style="background:'+HK.bg3+';color:'+HK.fg+';"><th style="padding:4px 3px;text-align:left;">Doc ID</th><th style="padding:4px 3px;text-align:left;">Preview</th><th style="padding:4px 3px;">Aksi</th></tr></thead><tbody>';
        if(snap.empty){ html+='<tr><td colspan="3" style="padding:6px;color:'+HK.fgDim+';text-align:center;">(kosong)</td></tr>'; }
        snap.forEach(function(d){
            var data=d.data();
            var prev=Object.keys(data).slice(0,3).map(function(k){ var v=data[k]; var vs=(typeof v==='object')?'{…}':String(v); return k+'='+vs.slice(0,14); }).join(', ');
            var escId=String(d.id).replace(/'/g,"\\'");
            html+='<tr style="border-bottom:1px solid '+HK.line+';">';
            html+='<td style="padding:3px;font-weight:600;word-break:break-all;">'+d.id+'</td>';
            html+='<td style="padding:3px;font-size:8px;color:'+HK.fgDim+';">'+(prev||'-')+'</td>';
            html+='<td style="padding:3px;white-space:nowrap;">';
            html+='<button onclick="DT.fsView(\''+col+'\',\''+escId+'\')" style="background:'+HK.bg2+';color:'+HK.fg+';border:1px solid '+HK.line+';padding:2px 6px;border-radius:4px;font-size:8px;cursor:pointer;margin-right:3px;">View</button>';
            html+='<button onclick="DT.fsEdit(\''+col+'\',\''+escId+'\')" style="background:'+HK.bg2+';color:'+HK.warn+';border:1px solid '+HK.warn+';padding:2px 6px;border-radius:4px;font-size:8px;cursor:pointer;margin-right:3px;">Edit</button>';
            html+='<button onclick="DT.fsDel(\''+col+'\',\''+escId+'\')" style="background:#2a0000;color:'+HK.bad+';border:1px solid '+HK.bad+';padding:2px 6px;border-radius:4px;font-size:8px;cursor:pointer;">Del</button>';
            html+='</td></tr>';
        });
        html+='</tbody></table>';
        this.showHTML(html);
        document.getElementById('dt-fs-refresh').addEventListener('click',function(){ self.fsLoad(); });
        document.getElementById('dt-fs-add').addEventListener('click',function(){ self.fsAdd(col); });
        document.getElementById('dt-fs-wipe').addEventListener('click',function(){ self.fsWipe(col); });
    },
    fsView:function(col,id){
        var self=this;
        window.db.collection(col).doc(id).get().then(function(d){
            if(!d.exists){ self.show('Doc tidak ada.'); return; }
            self.show('DOC '+col+'/'+id+'\n'+'═'.repeat(36)+'\n'+JSON.stringify(d.data(),null,1));
        }).catch(function(e){ self.show('Error: '+e.message); });
    },
    fsEdit:function(col,id){
        var self=this;
        window.db.collection(col).doc(id).get().then(function(d){
            if(!d.exists){ self.show('Doc tidak ada.'); return; }
            self.show('EDIT '+col+'/'+id+'\n'+'═'.repeat(36)+'\n'+JSON.stringify(d.data(),null,1));
            Promise.resolve(self.mp('Field (boleh dot path, mis: address.city):','')).then(function(field){
                if(!field) return;
                Promise.resolve(self.mp('Value baru (JSON: angka/bool/object pakai format JSON; teks biasa = string):','')).then(function(valStr){
                    if(valStr===null) return;
                    var val;
                    try{ val=JSON.parse(valStr); }catch(e){ val=valStr; }
                    var upd={}; upd[field]=val;
                    window.db.collection(col).doc(id).update(upd).then(function(){
                        self.show('UPDATED '+field+' = '+JSON.stringify(val));
                        self.fsLoad();
                    }).catch(function(e){ self.show('Update error: '+e.message); });
                });
            });
        }).catch(function(e){ self.show('Error: '+e.message); });
    },
    fsDel:function(col,id){
        var self=this;
        if(!confirm('HAPUS dokumen?\n'+col+'/'+id)) return;
        window.db.collection(col).doc(id).delete().then(function(){ self.show('DELETED '+col+'/'+id); self.fsLoad(); }).catch(function(e){ self.show('Delete error: '+e.message); });
    },
    fsAdd:function(col){
        var self=this;
        Promise.resolve(this.mp('Data dokumen (JSON):','{"name":"Contoh"}')).then(function(json){
            if(!json) return;
            try{
                var data=JSON.parse(json);
                window.db.collection(col).add(data).then(function(ref){ self.show('ADDED '+col+'/'+ref.id); self.fsLoad(); }).catch(function(e){ self.show('Add error: '+e.message); });
            }catch(e){ self.show('JSON invalid: '+e.message); }
        });
    },
    fsWipe:function(col){
        var self=this;
        Promise.resolve(this.mp('WIPE SEMUA dokumen di "'+col+'".\nKetik nama collection untuk konfirmasi:','')).then(function(conf){
            if(conf!==col){ self.show('Wipe dibatalkan (konfirmasi salah).'); return; }
            self.show('Wiping '+col+'...');
            window.db.collection(col).get().then(function(s){
                var batch=window.db.batch(); var n=0;
                s.forEach(function(d){ batch.delete(d.ref); n++; });
                return batch.commit().then(function(){ return n; });
            }).then(function(n){ self.show('WIPED '+n+' dokumen di '+col); self.fsLoad(); }).catch(function(e){ self.show('Wipe error: '+e.message); });
        });
    },

    tLogs:function(){
        if(!this.logs.length){ this.show('(belum ada log)'); return; }
        var o='CONSOLE ('+this.logs.length+')\n'+'═'.repeat(36)+'\n';
        this.logs.slice(-60).forEach(function(l){ o+='['+new Date(l.t).toLocaleTimeString('id-ID')+'] '+l.type.toUpperCase()+': '+l.msg+'\n'; });
        this.show(o);
    },

    tJs:function(){
        var html='<div style="font-size:10px;font-weight:800;margin-bottom:6px;display:flex;align-items:center;gap:4px;color:'+HK.fg+';"><span class="material-icons" style="font-size:12px;">code</span> CEK JS (Globals & Functions)</div>';
        html+='<table style="width:100%;border-collapse:collapse;font-size:9px;background:'+HK.bg2+';border-radius:6px;overflow:hidden;">';
        html+='<thead><tr style="background:'+HK.bg3+';color:'+HK.fg+';"><th style="padding:4px 3px;text-align:left;">Name</th><th style="padding:4px 3px;">Type</th><th style="padding:4px 3px;">St</th></tr></thead><tbody>';
        var checks=[
            ['firebase','object','Firebase SDK'],['db','object','Firestore instance'],
            ['hashPin','function','js/hash.js'],['verifyPin','function','js/hash.js'],
            ['formatDate','function','js/hash.js'],['formatDuration','function','js/hash.js'],['timeAgo','function','js/hash.js'],
            ['M','object','js/modal.js'],['alert2','function','js/modal.js'],['confirm2','function','js/modal.js'],['toast','function','js/modal.js'],['loading','function','js/modal.js'],
            ['HeaderManager','object','js/header.js'],['S','object','js/state.js'],
            ['loadHome','function','js/home.js'],['loadStudents','function','js/manage-siswa.js'],['saveStudent','function','js/manage-siswa.js'],['generateStudents','function','js/manage-siswa.js'],['exportStudents','function','js/manage-siswa.js'],
            ['loadQuestions','function','js/manage-soal.js'],['saveQuestion','function','js/manage-soal.js'],['openImport','function','js/manage-soal.js'],
            ['loadSessions','function','js/manage-sesi.js'],['openSessionModal','function','js/manage-sesi.js'],
            ['loadLive','function','js/live-tka.js'],['loadReview','function','js/review.js'],['loadPembahasan','function','js/pembahasan.js'],['sendWA','function','js/pembahasan.js'],
            ['loadFeedback','function','js/feedback.js'],['resolveFeedback','function','js/feedback.js'],
            ['loadReports','function','js/laporan.js'],['loadSettings','function','js/settings.js'],['saveAdminSettings','function','js/settings.js'],['saveStudentSettings','function','js/settings.js'],
            ['loadDataSiswa','function','js/datasiswa.js'],['S.setPage','function','ap.html (fallback datasiswa)']
        ];
        var okCount=0;
        checks.forEach(function(c){
            var target=(c[0]==='S.setPage')?(window.S&&typeof window.S.setPage):typeof window[c[0]];
            var exists=(c[0]==='S.setPage')?!!window.S:(typeof window[c[0]]!=='undefined');
            var typeMatch=target===c[1];
            var status=typeMatch?'<span style="color:'+HK.accent+';font-weight:800;">OK</span>':(exists?'<span style="color:'+HK.warn+';font-weight:800;">WRONG TYPE ('+target+')</span>':'<span style="color:#666;font-weight:700;">MISS</span>');
            if(typeMatch)okCount++;
            html+='<tr style="border-bottom:1px solid '+HK.line+';">';
            html+='<td style="padding:3px;font-weight:600;">'+c[0]+'</td>';
            html+='<td style="padding:3px;font-size:8px;color:'+HK.fgDim+';">'+c[2]+'</td>';
            html+='<td style="padding:3px;text-align:center;">'+status+'</td>';
            html+='</tr>';
        });
        html+='</tbody></table>';
        html+='<div style="margin-top:6px;padding:5px 8px;background:'+HK.bg2+';border:1px solid '+HK.line+';border-radius:6px;font-size:9px;font-weight:700;text-align:center;color:'+HK.fg+';">';
        html+='<span style="color:'+(okCount===checks.length?HK.accent:HK.warn)+';">'+okCount+' / '+checks.length+' LOADED</span></div>';
        this.showHTML(html);
    },

    tFb:function(){
        this.show('Menguji Firebase...');
        if(typeof window.db==='undefined'){ this.show('db tidak ditemukan. Pastikan js/fc.js termuat.'); return; }
        var o='FIREBASE (project: jec-extka)\n'+'═'.repeat(36)+'\n';
        try{ o+='ProjectId: '+(window.firebase.app().options.projectId||'-')+'\n\n'; }catch(e){ o+='? '+e.message+'\n'; }
        var cols=['admins','students','sessions','questions','attempts','feedback','settings'];
        var ch=Promise.resolve();
        cols.forEach(function(c){ ch=ch.then(function(){ return window.db.collection(c).limit(1).get().then(function(s){ o+='[OK] '+c+' ('+s.size+')\n'; }).catch(function(e){ o+='[XX] '+c+': '+e.message+'\n'; }); }); });
        var self=this; ch.then(function(){ self.show(o); });
    },

    tState:function(){
        var o='STATE\n'+'═'.repeat(36)+'\n';
        o+='Session key: '+(sessionStorage.getItem('admin_session')||sessionStorage.getItem('student_session')||'none')+'\n';
        o+='localStorage.length: '+localStorage.length+'\n';
        o+='sessionStorage.length: '+sessionStorage.length+'\n';
        o+='URL: '+location.href+'\n';
        o+='Window.S: '+(window.S?'exists':'missing')+'\n';
        if(window.S){
            o+='S.user: '+JSON.stringify(window.S.user)+'\n';
            o+='S.students: '+window.S.students.length+'\n';
            o+='S.sessions: '+window.S.sessions.length+'\n';
            o+='S.questions: '+window.S.questions.length+'\n';
            o+='S.qType: '+window.S.qType+'\n';
            o+='S.batchFilter: '+window.S.batchFilter+'\n';
            o+='S.selected.size: '+window.S.selected.size+'\n';
            o+='S.setPage: '+(typeof window.S.setPage)+'\n';
        }
        this.show(o);
    },

    tQuery:function(){
        var self=this;
        Promise.resolve(this.mp('Collection:','students')).then(function(col){
            if(!col)return;
            Promise.resolve(self.mp('Limit:','3')).then(function(limStr){
                var lim=parseInt(limStr)||3;
                self.show('Query '+col+'...');
                window.db.collection(col).limit(lim).get().then(function(s){
                    var o=col+' ('+s.size+')\n'+'═'.repeat(36)+'\n';
                    if(s.empty)o+='(kosong)';
                    s.forEach(function(d){ o+='\n['+d.id+']\n'+JSON.stringify(d.data(),null,1)+'\n'; });
                    self.show(o);
                }).catch(function(e){ self.show('Error: '+e.message); });
            });
        });
    },

    tLs:function(){
        var self=this;
        var o='LOCALSTORAGE ('+localStorage.length+')\n'+'═'.repeat(36)+'\n';
        for(var i=0;i<localStorage.length;i++){ var k=localStorage.key(i); var v=localStorage.getItem(k); o+=k+' = '+(v.length>80?v.slice(0,80)+'…':v)+'\n'; }
        o+='\nSESSIONSTORAGE ('+sessionStorage.length+')\n'+'═'.repeat(36)+'\n';
        for(var j=0;j<sessionStorage.length;j++){ var k2=sessionStorage.key(j); var v2=sessionStorage.getItem(k2); o+=k2+' = '+(v2.length>80?v2.slice(0,80)+'…':v2)+'\n'; }
        this.show(o);
        Promise.resolve(this.mp('Hapus key (kosong=batal):','')).then(function(d){ if(d){ localStorage.removeItem(d); sessionStorage.removeItem(d); self.tLs(); } });
    },

    tPin:function(){
        var self=this;
        Promise.resolve(this.mp('PIN:','1234')).then(function(pin){
            if(!pin)return;
            if(typeof window.hashPin!=='function'){ self.show('hashPin tidak tersedia (js/hash.js belum termuat)'); return; }
            window.hashPin(pin).then(function(h){ self.show('HASH PIN\n'+'═'.repeat(36)+'\nPIN: '+pin+'\nHash: '+h); }).catch(function(e){ self.show('Error: '+e.message); });
        });
    },

    tCache:function(){
        var self=this; this.show('Clearing...');
        var done=[];
        var p1=(typeof caches!=='undefined')?caches.keys().then(function(ks){ ks.forEach(function(k){ caches.delete(k); }); if(ks.length)done.push('Cache: '+ks.length); }).catch(function(){}):Promise.resolve();
        var p2=(navigator.serviceWorker&&navigator.serviceWorker.getRegistrations)?navigator.serviceWorker.getRegistrations().then(function(rs){ rs.forEach(function(r){ r.unregister(); }); if(rs.length)done.push('SW: '+rs.length); }).catch(function(){}):Promise.resolve();
        Promise.all([p1,p2]).then(function(){ self.show('Done\n'+(done.join('\n')||'(tidak ada)')); });
    },

    tClearLs:function(){
        var ok=confirm('Hapus SEMUA localStorage & sessionStorage?\nSession login akan hilang.');
        if(!ok)return;
        var n=localStorage.length;
        try{ localStorage.clear(); sessionStorage.clear(); }catch(e){}
        this.show(n+' key dihapus. Reload...');
        setTimeout(function(){ location.reload(); },800);
    },

    tIntegration:function(){
        var scripts=[
            {f:'js/fc.js',g:'db',n:'Firebase Core'},{f:'js/hash.js',g:'hashPin',n:'Hash & Security'},
            {f:'js/modal.js',g:'M',n:'Modal System'},{f:'js/header.js',g:'HeaderManager',n:'Header Manager'},
            {f:'js/state.js',g:'S',n:'Global State'},{f:'js/login.js',g:null,n:'Login Logic'},
            {f:'js/init-dashboard.js',g:'initDashboard',n:'Init Dashboard'},{f:'js/home.js',g:'loadHome',n:'Home Page'},
            {f:'js/manage-siswa.js',g:'loadStudents',n:'Manage Siswa'},{f:'js/manage-soal.js',g:'loadQuestions',n:'Manage Soal'},
            {f:'js/manage-sesi.js',g:'loadSessions',n:'Manage Sesi'},{f:'js/live-tka.js',g:'loadLive',n:'Live Monitoring'},
            {f:'js/review.js',g:'loadReview',n:'Review TKA'},{f:'js/pembahasan.js',g:'loadPembahasan',n:'Pembahasan'},
            {f:'js/feedback.js',g:'loadFeedback',n:'Feedback'},{f:'js/settings.js',g:'loadSettings',n:'Settings'},
            {f:'js/datasiswa.js',g:'loadDataSiswa',n:'Data Siswa'},{f:'js/devtools.js',g:'DT',n:'DevTools (this)'}
        ];
        var loadedScripts=Array.from(document.querySelectorAll('script[src]')).map(function(s){ return s.src.split('/').pop().split('?')[0]; });
        var html='<div style="font-size:10px;font-weight:800;margin-bottom:6px;display:flex;align-items:center;gap:4px;color:'+HK.fg+';"><span class="material-icons" style="font-size:12px;">link</span> INTEGRATION CHECKER</div>';
        html+='<table style="width:100%;border-collapse:collapse;font-size:9px;background:'+HK.bg2+';border-radius:6px;overflow:hidden;">';
        html+='<thead><tr style="background:'+HK.bg3+';color:'+HK.fg+';"><th style="padding:4px 3px;text-align:left;">File</th><th style="padding:4px 3px;">Global</th><th style="padding:4px 3px;">St</th><th style="padding:4px 3px;text-align:left;">Note</th></tr></thead><tbody>';
        scripts.forEach(function(s,i){
            var isLoaded=loadedScripts.indexOf(s.f)!==-1;
            var isGlobal=s.g?(window[s.g]!==undefined):true;
            var status=(isLoaded&&isGlobal)?'<span style="color:'+HK.accent+';font-weight:800;">WORK</span>':(isLoaded?'<span style="color:'+HK.warn+';font-weight:800;">LOAD</span>':'<span style="color:'+HK.bad+';font-weight:800;">MISS</span>');
            var note=isGlobal?'Active':(isLoaded?'No Global':'Not Found');
            html+='<tr style="border-bottom:1px solid '+HK.line+';"><td style="padding:3px;font-weight:600;">'+(i+1)+'. '+s.f+'</td><td style="padding:3px;text-align:center;color:'+HK.fgDim+';font-size:8px;">'+(s.g||'-')+'</td><td style="padding:3px;text-align:center;">'+status+'</td><td style="padding:3px;color:'+HK.fgDim+';font-size:8px;">'+s.n+' ('+note+')</td></tr>';
        });
        html+='</tbody></table>';
        this.showHTML(html);
    },

    tFileCheck:function(){
        var self=this;
        var files=['ap.html','sp.html','seed.html','cek.html','css/g.css','css/a.css','css/s.css','css/brand.css','js/fc.js','js/hash.js','js/modal.js','js/header.js','js/state.js','js/login.js','js/init-dashboard.js','js/home.js','js/manage-siswa.js','js/manage-soal.js','js/manage-sesi.js','js/riwayat-sesi.js','js/live-tka.js','js/review.js','js/pembahasan.js','js/feedback.js','js/laporan.js','js/kontak.js','js/settings.js','js/datasiswa.js','js/devtools.js'];
        self.showHTML('<div style="color:'+HK.fg+';font-size:10px;">Memeriksa '+files.length+' file + Firestore...</div>');
        var rows=[]; var idx=0;
        function next(){
            if(idx>=files.length){ render(); checkFb(); return; }
            var f=files[idx++];
            fetch(f+'?_t='+Date.now(),{cache:'no-store'}).then(function(r){
                var ct=r.headers.get('content-type')||'-';
                var mimeBad=f.endsWith('.js')&&r.ok&&!/javascript|ecmascript/i.test(ct);
                rows.push({f:f,st:r.ok?r.status+' OK':String(r.status),ok:r.ok,ct:ct+(mimeBad?' ← MIME SALAH!':''),bad:mimeBad});
                next();
            }).catch(function(e){ rows.push({f:f,st:'GAGAL',ok:false,ct:e.message,bad:true}); next(); });
        }
        function render(){
            var html='<div style="font-size:10px;font-weight:800;margin-bottom:6px;display:flex;align-items:center;gap:4px;color:'+HK.fg+';"><span class="material-icons" style="font-size:12px;">fact_check</span> CEK FILE (HTTP + MIME)</div>';
            html+='<table style="width:100%;border-collapse:collapse;font-size:9px;background:'+HK.bg2+';border-radius:6px;overflow:hidden;">';
            html+='<thead><tr style="background:'+HK.bg3+';color:'+HK.fg+';"><th style="padding:4px 3px;text-align:left;">File</th><th style="padding:4px 3px;">Status</th><th style="padding:4px 3px;text-align:left;">Content-Type</th></tr></thead><tbody>';
            rows.forEach(function(r){
                html+='<tr style="border-bottom:1px solid '+HK.line+';">';
                html+='<td style="padding:3px;font-weight:600;">'+r.f+'</td>';
                html+='<td style="padding:3px;text-align:center;color:'+(r.ok?HK.accent:HK.bad)+';font-weight:800;">'+r.st+'</td>';
                html+='<td style="padding:3px;font-size:8px;color:'+(r.bad?HK.bad:HK.fgDim)+';">'+r.ct+'</td>';
                html+='</tr>';
            });
            html+='</tbody></table>';
            html+='<div id="dt-fb-line" style="margin-top:6px;padding:5px 8px;background:'+HK.bg2+';border:1px solid '+HK.line+';border-radius:6px;font-size:9px;color:'+HK.fgDim+';">Memeriksa Firebase...</div>';
            self.showHTML(html);
        }
        function checkFb(){
            var el=document.getElementById('dt-fb-line');
            if(typeof window.db==='undefined'){ if(el)el.innerHTML='<span style="color:'+HK.bad+';">FIREBASE: db tidak ditemukan</span>'; return; }
            window.db.collection('settings').doc('global_settings').get().then(function(){ if(el)el.innerHTML='<span style="color:'+HK.accent+';font-weight:800;">FIREBASE: TERKONEKSI ✓</span> — rules benar.'; }).catch(function(e){
                var extra=String(e.code||e.message).includes('permission')?' → Rules belum open: <code>allow read, write: if true;</code>':'';
                if(el)el.innerHTML='<span style="color:'+HK.bad+';font-weight:800;">FIREBASE GAGAL: '+(e.code||e.message)+'</span>'+extra;
            });
        }
        next();
    },

    wrapReq:function(){
        if(this._reqWrapped)return; this._reqWrapped=true; var self=this; var of=window.fetch;
        window.fetch=function(){ var url=arguments[0]; var u=(typeof url==='string')?url:(url&&url.url)||'?'; var t0=Date.now();
            return of.apply(this,arguments).then(function(r){ self.reqs.push({t:t0,url:u,st:r.status,ms:Date.now()-t0}); if(self.reqs.length>200)self.reqs.shift(); return r; }).catch(function(e){ self.reqs.push({t:t0,url:u,st:'ERR',ms:Date.now()-t0}); throw e; }); };
    },
    tReqLog:function(){
        this.wrapReq();
        var o='REQUEST LOG ('+this.reqs.length+')\n'+'═'.repeat(36)+'\n';
        o+='(fetch di-wrap mulai sekarang; request lama tidak tercatat)\n\n';
        this.reqs.slice(-50).forEach(function(r){ o+='['+new Date(r.t).toLocaleTimeString('id-ID')+'] '+r.st+' '+r.ms+'ms '+r.url+'\n'; });
        this.show(o);
    },
    tGlobals:function(){
        var known=['S','PS','M','db','firebase','DT','hashPin','verifyPin','formatDate','formatDuration','timeAgo','alert2','confirm2','toast','loading','HeaderManager','loadHome','loadStudents','loadQuestions','loadSessions','loadLive','loadReview','loadPembahasan','loadFeedback','loadReports','loadSettings','loadDataSiswa','showScreen','XLSX','jspdf'];
        var o='GLOBALS DETECTED\n'+'═'.repeat(36)+'\n';
        known.forEach(function(k){ o+=(window[k]!==undefined?'[✓] ':'[ ] ')+k+' : '+typeof window[k]+'\n'; });
        var custom=Object.keys(window).filter(function(k){ return known.indexOf(k)===-1 && !/^(webkit|on|chrome|__)/.test(k); });
        o+='\nLainnya ('+custom.length+'): '+custom.slice(0,40).join(', ')+(custom.length>40?'…':'');
        this.show(o);
    },
    tQuota:function(){
        var self=this;
        if(!navigator.storage||!navigator.storage.estimate){ this.show('Storage Estimate API tidak tersedia'); return; }
        navigator.storage.estimate().then(function(e){
            var o='STORAGE QUOTA\n'+'═'.repeat(36)+'\n';
            o+='Usage:  '+((e.usage||0)/1048576).toFixed(2)+' MB\n';
            o+='Quota:  '+((e.quota||0)/1048576).toFixed(2)+' MB\n';
            o+='Sisa:   '+(((e.quota||0)-(e.usage||0))/1048576).toFixed(2)+' MB\n';
            self.show(o);
        }).catch(function(e){ self.show('Error: '+e.message); });
    },
    tHttpHead:function(){
        var self=this; this.show('Mengambil header...');
        fetch(location.href,{cache:'no-store'}).then(function(r){ var o='HTTP HEADERS ('+r.status+')\n'+'═'.repeat(36)+'\n'; r.headers.forEach(function(v,k){ o+=k+': '+v+'\n'; }); self.show(o); }).catch(function(e){ self.show('Error: '+e.message); });
    },
    tDomWatch:function(){
        var self=this;
        if(this._domWatch){ this._domWatch.disconnect(); this._domWatch=null; this.show('DOM Watch dihentikan.'); return; }
        var count=0;
        this._domWatch=new MutationObserver(function(m){ count+=m.length; });
        this._domWatch.observe(document.body,{childList:true,subtree:true,attributes:true});
        this.show('DOM Watch aktif 5 detik... interaksi sekarang.');
        setTimeout(function(){ if(self._domWatch){ self._domWatch.disconnect(); self._domWatch=null; } self.show('DOM WATCH\n'+'═'.repeat(36)+'\nMutasi dalam 5 detik: '+count); },5000);
    },
    tFps:function(){
        var self=this; var frames=0,t0=performance.now();
        function loop(){ frames++; if(performance.now()-t0<1000) requestAnimationFrame(loop); else self.show('FPS METER\n'+'═'.repeat(36)+'\nFPS ~ '+frames+' (1 detik sampling)'); }
        requestAnimationFrame(loop); this.show('Mengukur FPS...');
    },
    tSysInfo:function(){
        var o='SYSTEM INFO\n'+'═'.repeat(36)+'\n';
        o+='UA: '+navigator.userAgent+'\n';
        o+='Platform: '+(navigator.platform||'-')+'\n';
        o+='Language: '+navigator.language+'\n';
        o+='Cores: '+(navigator.hardwareConcurrency||'?')+'\n';
        o+='DeviceMemory: '+(navigator.deviceMemory||'?')+' GB\n';
        o+='MaxTouch: '+(navigator.maxTouchPoints||0)+'\n';
        o+='Online: '+navigator.onLine+'\n';
        o+='CookiesEnabled: '+navigator.cookieEnabled+'\n';
        this.show(o);
    },
    tBattery:function(){
        var self=this;
        if(!navigator.getBattery){ this.show('Battery API tidak tersedia'); return; }
        navigator.getBattery().then(function(b){
            var o='BATTERY\n'+'═'.repeat(36)+'\n';
            o+='Level: '+Math.round(b.level*100)+'%\n';
            o+='Charging: '+(b.charging?'YES':'NO')+'\n';
            o+='ChargingTime: '+(b.chargingTime===Infinity?'∞':b.chargingTime)+'\n';
            o+='DischargingTime: '+(b.dischargingTime===Infinity?'∞':b.dischargingTime)+'\n';
            self.show(o);
        }).catch(function(e){ self.show('Error: '+e.message); });
    },
    tGeo:function(){
        var self=this;
        if(!navigator.geolocation){ this.show('Geolocation tidak tersedia'); return; }
        this.show('Meminta izin lokasi...');
        navigator.geolocation.getCurrentPosition(function(p){ self.show('GEOLOCATION\n'+'═'.repeat(36)+'\nLat: '+p.coords.latitude+'\nLng: '+p.coords.longitude+'\nAccuracy: '+p.coords.accuracy+' m'); },function(e){ self.show('Geo error: '+e.message); },{timeout:8000});
    },
    tBase64:function(){
        var self=this;
        Promise.resolve(this.mp('Mode: 1=encode, 2=decode','1')).then(function(mode){
            Promise.resolve(self.mp('Text:','')).then(function(txt){
                if(txt===null||txt==='')return;
                try{ var out=(mode==='2')?decodeURIComponent(escape(atob(txt))):btoa(unescape(encodeURIComponent(txt))); self.show('BASE64 ('+(mode==='2'?'decode':'encode')+')\n'+'═'.repeat(36)+'\n'+out); }catch(e){ self.show('Error: '+e.message); }
            });
        });
    },
    tUuid:function(){
        var o='UUID / RANDOM ID\n'+'═'.repeat(36)+'\n';
        for(var i=0;i<5;i++){ o+=((window.crypto&&crypto.randomUUID)?crypto.randomUUID():'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,function(c){var r=Math.random()*16|0;return (c==='x'?r:(r&0x3|0x8)).toString(16);}))+'\n'; }
        this.show(o);
    },
    tTimestamp:function(){
        var self=this; var now=Date.now();
        var head='NOW\n'+'═'.repeat(36)+'\nEpoch ms: '+now+'\nEpoch s : '+Math.floor(now/1000)+'\nLocal   : '+new Date(now).toString()+'\nISO     : '+new Date(now).toISOString()+'\n';
        self.show(head);
        Promise.resolve(this.mp('Konversi epoch(ms/s) atau tanggal (kosong=skip):','')).then(function(v){
            if(!v)return;
            var o=head+'\nCONVERT\n'+'═'.repeat(36)+'\n';
            if(/^\d+$/.test(v)){ var ms=v.length<=10?(+v)*1000:+v; o+='Input epoch -> '+new Date(ms).toString()+'\nISO: '+new Date(ms).toISOString(); }
            else { var d=new Date(v); o+=isNaN(d.getTime())?'Tanggal tidak valid':('Input tanggal -> epoch ms: '+d.getTime()+'\nepoch s: '+Math.floor(d.getTime()/1000)); }
            self.show(o);
        });
    },
    tRegex:function(){
        var self=this;
        Promise.resolve(this.mp('Pattern (regex):','\\d+')).then(function(pat){
            if(!pat)return;
            Promise.resolve(self.mp('Flags:','g')).then(function(fl){
                Promise.resolve(self.mp('Test string:','')).then(function(str){
                    if(str===null)return;
                    try{
                        var re=new RegExp(pat,fl||'');
                        var o='REGEX TEST\n'+'═'.repeat(36)+'\nPattern: /'+pat+'/'+(fl||'')+'\nTest: '+re.test(str)+'\n';
                        var ms=str.match(new RegExp(pat,(fl||'').indexOf('g')>-1?fl:(fl||'')+'g'));
                        o+='Matches: '+(ms?ms.length+' -> '+ms.join(' | '):'none');
                        self.show(o);
                    }catch(e){ self.show('Regex error: '+e.message); }
                });
            });
        });
    },
    tJson:function(){
        var self=this;
        Promise.resolve(this.mp('Paste JSON:','')).then(function(txt){
            if(!txt)return;
            try{ self.show('JSON PRETTY\n'+'═'.repeat(36)+'\n'+JSON.stringify(JSON.parse(txt),null,2)); }catch(e){ self.show('JSON invalid: '+e.message); }
        });
    },
    tClipboard:function(){
        var self=this;
        if(!navigator.clipboard){ this.show('Clipboard API tidak tersedia'); return; }
        navigator.clipboard.readText().then(function(t){ self.show('CLIPBOARD READ\n'+'═'.repeat(36)+'\n'+(t||'(kosong)')); }).catch(function(e){
            self.show('Read ditolak ('+e.message+'). Coba write test...');
            navigator.clipboard.writeText('devtools-test').then(function(){ self.show('Write OK: "devtools-test"'); }).catch(function(e2){ self.show('Write gagal: '+e2.message); });
        });
    },

    tDevlive:function(){ if(this.devliveData.length)this.renderTable(); this.autoScan(false); },

    tHistory:function(){
        var self=this; this.show('Memindai riwayat update file...');
        var filesToScan=this.devliveFiles.slice(); var results=[]; var idx=0;
        var next=function(){
            if(idx>=filesToScan.length){ renderAll(); return; }
            var f=filesToScan[idx++];
            fetch(f+'?_t='+Date.now(),{cache:'no-store'}).then(function(r){ if(!r.ok)throw new Error(r.status); return r.text(); }).then(function(text){
                var info=self.parseInfo(text,f);
                results.push({file:f,path:info.path,version:info.version,updated:info.updated,ts:info.ts,hasHeader:info.hasHeader,note:self.extractNote(text)});
                next();
            }).catch(function(e){ results.push({file:f,path:f,version:'-',updated:'-',ts:0,hasHeader:false,note:'Gagal dimuat ('+e.message+')'}); next(); });
        };
        next();
        function renderAll(){
            results.sort(function(a,b){ return b.ts-a.ts; });
            var html='<div style="font-size:10px;font-weight:800;margin-bottom:6px;display:flex;align-items:center;gap:4px;color:'+HK.fg+';"><span class="material-icons" style="font-size:12px;">history</span> RIWAYAT UPDATE FILE</div>';
            html+='<table style="width:100%;border-collapse:collapse;font-size:9px;background:'+HK.bg2+';border-radius:6px;overflow:hidden;">';
            html+='<thead><tr style="background:'+HK.bg3+';color:'+HK.fg+';"><th style="padding:4px 3px;text-align:left;">FILE</th><th style="padding:4px 3px;">VER</th><th style="padding:4px 3px;">UPDATE</th><th style="padding:4px 3px;text-align:left;">NOTE</th></tr></thead><tbody>';
            results.forEach(function(r){
                var statusIcon=r.hasHeader?'✅':'⚠️';
                var rowStyle=r.ts>0?'':'color:#666;';
                html+='<tr style="border-bottom:1px solid '+HK.line+';'+rowStyle+'">';
                html+='<td style="padding:4px 3px;font-weight:600;">'+statusIcon+' '+r.path+'</td>';
                html+='<td style="padding:4px 3px;text-align:center;color:'+HK.fg+';font-weight:700;">'+r.version+'</td>';
                html+='<td style="padding:4px 3px;text-align:center;white-space:nowrap;">'+self.fmtTs(r.ts)+'</td>';
                html+='<td style="padding:4px 3px;color:'+HK.fgDim+';font-size:8px;">'+(r.note||'-')+'</td>';
                html+='</tr>';
            });
            html+='</tbody></table>';
            self.showHTML(html);
        }
    },

    autoScan:function(silent){
        var self=this;
        Promise.resolve().then(function(){ return self.discover(); }).then(function(d){ d.forEach(function(f){ if(self.devliveFiles.indexOf(f)===-1)self.devliveFiles.push(f); }); }).catch(function(){}).then(function(){ return self.scan(); }).then(function(){
            self.lastAuto=new Date();
            if(!silent)self.renderTable();
            var b=document.getElementById('adt-badge');
            if(b)b.textContent=self.devliveData.filter(function(r){ return r.status==='connect'; }).length+'✅';
        });
    },

    discover:function(){
        var dirs=['','js/','css/'];
        var promises=dirs.map(function(d){
            return fetch(d+'?_dl='+Date.now(),{cache:'no-store'}).then(function(r){ if(!r.ok)return []; return r.text(); }).then(function(h){
                var f=[]; var re=/href="([^"]+)"/g; var m;
                while((m=re.exec(h))){ var n=m[1]; if(n.indexOf('?')===0||n.indexOf('/')===0||n.indexOf('://')>-1)continue; if(n==='../'||n==='./'||n.endsWith('/'))continue; n=n.split('?')[0]; if(/\.(js|html|css|json)$/.test(n))f.push(d+n); }
                return f;
            }).catch(function(){ return []; });
        });
        return Promise.all(promises).then(function(arrs){ var flat=[]; arrs.forEach(function(a){ a.forEach(function(x){ if(flat.indexOf(x)===-1)flat.push(x); }); }); return flat; });
    },

    parseInfo:function(text,file){
        var head=(text||'').split('\n').slice(0,10).join('\n'); var path=file;
        var mRoot=head.match(/#root\s*:\s*([^\s|]+)/i);
        var mPath=head.match(/#path\s*:\s*root\/([^\s|]+)/i);
        var mIdx=head.match(/^<!--\s*#(\d+)\s*\|\s*([^\s|]+)/i);
        if(mRoot)path=mRoot[1].trim(); else if(mPath)path=mPath[1].trim(); else if(mIdx)path=mIdx[2].trim();
        var vm=head.match(/v(?:ersion)?[:\s•]*([0-9]+(?:\.[0-9]+)+)/i)||head.match(/v\s+([0-9]+(?:\.[0-9]+)+)/i);
        var um=head.match(/update[d]?[:\s•]*([^|\n]+)/i)||head.match(/u\s+([^|\n]+)/i);
        var ts=0;
        if(um){ var dm=um[1].match(/(\d{2})[\/\-](\d{2})[\/\-](\d{2,4})/); if(dm){ var yy=+dm[3]; if(yy<100)yy+=2000; var tm=um[1].match(/(\d{2}):(\d{2}):(\d{2})/); ts=new Date(yy,+dm[2]-1,+dm[1],tm?+tm[1]:0,tm?+tm[2]:0,tm?+tm[3]:0).getTime(); } }
        var hasHeader=!!(vm||um||mRoot||mPath||mIdx);
        return {path:path,version:vm?vm[1]:'-',updated:um?um[1].trim():'-',ts:ts,hasHeader:hasHeader};
    },

    extractNote:function(text){
        var head=(text||'').split('\n').slice(0,5).join('\n');
        var m=head.match(/Note\s*:\s*([^\n]+)/i)||head.match(/note\s*:\s*([^\n]+)/i);
        if(m)return m[1].replace(/\-\->/g,'').replace(/\*-->/g,'').trim();
        return '';
    },

    scan:function(){
        var self=this; var res=[]; var idx=0;
        return new Promise(function(resolve){
            var next=function(){
                if(idx>=self.devliveFiles.length){ res.sort(function(a,b){ return b.ts-a.ts; }); self.devliveData=res; resolve(); return; }
                var f=self.devliveFiles[idx++];
                fetch(f+(f.indexOf('?')>-1?'&':'?')+'_dl='+Date.now(),{cache:'no-store'}).then(function(r){ if(!r.ok)throw new Error(r.status); return r.text(); }).then(function(text){
                    var i=self.parseInfo(text,f);
                    res.push(Object.assign({file:f,status:i.hasHeader?'connect':'no-header'},i));
                }).catch(function(){ res.push({file:f,path:f,version:'-',updated:'-',ts:0,status:'missing'}); }).then(next);
            };
            next();
        });
    },

    fmtTs:function(ts){ if(!ts)return '-'; var d=new Date(ts),p=function(n){return String(n).padStart(2,'0');}; return p(d.getDate())+'/'+p(d.getMonth()+1)+' '+p(d.getHours())+':'+p(d.getMinutes()); },

    renderTable:function(){
        var self=this;
        var ok=this.devliveData.filter(function(r){ return r.status==='connect'; }).length;
        var ico={connect:'✅','no-header':'⚠️',missing:'❌'};
        var h='<div style="font-size:9px;margin-bottom:4px;background:'+HK.bg2+';padding:5px 6px;border-radius:5px;display:flex;align-items:center;gap:4px;flex-wrap:wrap;border:1px solid '+HK.line+';">';
        h+='<span class="material-icons" style="font-size:12px;color:'+HK.accent+';">sensors</span>';
        h+='<b style="color:'+HK.fg+';">DevLive</b>';
        h+='<span style="color:'+HK.accent+';font-weight:800;">✅ '+ok+'/'+this.devliveData.length+'</span>';
        h+='<span style="color:'+HK.fgDim+';">• scan</span>';
        h+='<span id="devlive-clock" style="font-weight:700;color:'+HK.fg+';font-family:monospace;">--:--:--</span>';
        h+='</div>';
        h+='<table style="width:100%;border-collapse:collapse;font-size:8px;background:'+HK.bg2+';border-radius:6px;overflow:hidden;"><thead><tr style="background:'+HK.bg3+';color:'+HK.fg+';"><th style="padding:3px 2px;text-align:left;">FILE</th><th style="padding:3px 2px;">VER</th><th style="padding:3px 2px;">UPDATE</th><th style="padding:3px 2px;">ST</th></tr></thead><tbody>';
        this.devliveData.forEach(function(r,i){
            h+='<tr style="border-bottom:1px solid '+HK.line+';'+(i===0&&r.ts>0?'background:'+HK.fgSoft+';':'')+'">';
            h+='<td style="padding:3px 2px;font-weight:600;max-width:100px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">'+r.path+'</td>';
            h+='<td style="padding:3px 2px;text-align:center;color:'+HK.fg+';font-weight:700;">'+r.version+'</td>';
            h+='<td style="padding:3px 2px;text-align:center;white-space:nowrap;color:'+HK.fgDim+';">'+self.fmtTs(r.ts)+'</td>';
            h+='<td style="padding:3px 2px;text-align:center;">'+(ico[r.status]||'?')+'</td>';
            h+='</tr>';
        });
        h+='</tbody></table>';
        this.showHTML(h);
    },

    tCookies:function(){
        var cookies=document.cookie.split(';').map(function(c){ return c.trim(); });
        if(cookies.length===0||(cookies.length===1&&cookies[0]==='')){ this.show('Tidak ada cookie.'); return; }
        var html='<div style="font-size:10px;font-weight:800;margin-bottom:6px;display:flex;align-items:center;gap:4px;color:'+HK.fg+';"><span class="material-icons" style="font-size:12px;">cookie</span> COOKIES</div>';
        html+='<table style="width:100%;border-collapse:collapse;font-size:9px;background:'+HK.bg2+';border-radius:6px;overflow:hidden;">';
        html+='<thead><tr style="background:'+HK.bg3+';color:'+HK.fg+';"><th style="padding:4px 3px;text-align:left;">Name</th><th style="padding:4px 3px;text-align:left;">Value</th></tr></thead><tbody>';
        cookies.forEach(function(c){ var parts=c.split('='); var name=parts.shift(); var val=parts.join('='); html+='<tr style="border-bottom:1px solid '+HK.line+';"><td style="padding:3px;font-weight:600;">'+name+'</td><td style="padding:3px;word-break:break-all;font-size:8px;">'+val+'</td></tr>'; });
        html+='</tbody></table>';
        this.showHTML(html);
    },

    tNetwork:function(){
        var conn=navigator.connection||navigator.mozConnection||navigator.webkitConnection;
        var html='<div style="font-size:10px;font-weight:800;margin-bottom:6px;display:flex;align-items:center;gap:4px;color:'+HK.fg+';"><span class="material-icons" style="font-size:12px;">wifi</span> NETWORK INFO</div>';
        html+='<table style="width:100%;border-collapse:collapse;font-size:9px;background:'+HK.bg2+';border-radius:6px;overflow:hidden;">';
        html+='<tr style="border-bottom:1px solid '+HK.line+';"><td style="padding:4px 3px;font-weight:600;">Online</td><td style="padding:4px 3px;"><b style="color:'+(navigator.onLine?HK.accent:HK.bad)+';">'+(navigator.onLine?'YES':'NO')+'</b></td></tr>';
        if(conn){ html+='<tr style="border-bottom:1px solid '+HK.line+';"><td style="padding:4px 3px;font-weight:600;">Type</td><td style="padding:4px 3px;">'+(conn.effectiveType||'Unknown')+'</td></tr><tr style="border-bottom:1px solid '+HK.line+';"><td style="padding:4px 3px;font-weight:600;">Downlink</td><td style="padding:4px 3px;">'+(conn.downlink||'?')+' Mbps</td></tr><tr style="border-bottom:1px solid '+HK.line+';"><td style="padding:4px 3px;font-weight:600;">RTT</td><td style="padding:4px 3px;">'+(conn.rtt||'?')+' ms</td></tr>'; }
        html+='<tr style="border-bottom:1px solid '+HK.line+';"><td style="padding:4px 3px;font-weight:600;">Protocol</td><td style="padding:4px 3px;">'+location.protocol+'</td></tr><tr><td style="padding:4px 3px;font-weight:600;">Host</td><td style="padding:4px 3px;">'+location.host+'</td></tr></table>';
        this.showHTML(html);
    },

    tDOM:function(){
        var all=document.querySelectorAll('*').length,imgs=document.querySelectorAll('img').length,scripts=document.querySelectorAll('script').length,links=document.querySelectorAll('link').length;
        var html='<div style="font-size:10px;font-weight:800;margin-bottom:6px;display:flex;align-items:center;gap:4px;color:'+HK.fg+';"><span class="material-icons" style="font-size:12px;">account_tree</span> DOM INSPECTOR</div>';
        html+='<table style="width:100%;border-collapse:collapse;font-size:9px;background:'+HK.bg2+';border-radius:6px;overflow:hidden;">';
        html+='<tr style="border-bottom:1px solid '+HK.line+';"><td style="padding:4px 3px;font-weight:600;">Total Elements</td><td style="padding:4px 3px;"><b>'+all+'</b></td></tr><tr style="border-bottom:1px solid '+HK.line+';"><td style="padding:4px 3px;font-weight:600;">Images</td><td style="padding:4px 3px;">'+imgs+'</td></tr><tr style="border-bottom:1px solid '+HK.line+';"><td style="padding:4px 3px;font-weight:600;">Scripts</td><td style="padding:4px 3px;">'+scripts+'</td></tr><tr><td style="padding:4px 3px;font-weight:600;">Stylesheets/Links</td><td style="padding:4px 3px;">'+links+'</td></tr></table>';
        this.showHTML(html);
    },

    tPerformance:function(){
        var html='<div style="font-size:10px;font-weight:800;margin-bottom:6px;display:flex;align-items:center;gap:4px;color:'+HK.fg+';"><span class="material-icons" style="font-size:12px;">speed</span> PERFORMANCE & MEMORY</div>';
        html+='<table style="width:100%;border-collapse:collapse;font-size:9px;background:'+HK.bg2+';border-radius:6px;overflow:hidden;">';
        if(performance.memory){ html+='<tr style="border-bottom:1px solid '+HK.line+';"><td style="padding:4px 3px;font-weight:600;">JS Heap Used</td><td style="padding:4px 3px;">'+(performance.memory.usedJSHeapSize/1048576).toFixed(2)+' MB</td></tr><tr style="border-bottom:1px solid '+HK.line+';"><td style="padding:4px 3px;font-weight:600;">JS Heap Total</td><td style="padding:4px 3px;">'+(performance.memory.totalJSHeapSize/1048576).toFixed(2)+' MB</td></tr><tr style="border-bottom:1px solid '+HK.line+';"><td style="padding:4px 3px;font-weight:600;">JS Heap Limit</td><td style="padding:4px 3px;">'+(performance.memory.jsHeapSizeLimit/1048576).toFixed(2)+' MB</td></tr>'; }
        else { html+='<tr style="border-bottom:1px solid '+HK.line+';"><td colspan="2" style="padding:4px 3px;color:'+HK.fgDim+';">Memory API tidak tersedia</td></tr>'; }
        var nav=performance.getEntriesByType&&performance.getEntriesByType('navigation')[0];
        if(nav){ html+='<tr style="border-bottom:1px solid '+HK.line+';"><td style="padding:4px 3px;font-weight:600;">DOM Interactive</td><td style="padding:4px 3px;">'+nav.domInteractive.toFixed(0)+' ms</td></tr><tr style="border-bottom:1px solid '+HK.line+';"><td style="padding:4px 3px;font-weight:600;">DOM Complete</td><td style="padding:4px 3px;">'+nav.domComplete.toFixed(0)+' ms</td></tr><tr><td style="padding:4px 3px;font-weight:600;">Load Event</td><td style="padding:4px 3px;">'+(nav.loadEventEnd||0).toFixed(0)+' ms</td></tr>'; }
        html+='</table>';
        this.showHTML(html);
    },

    tColor:function(){
        this.showHTML('<div style="font-size:10px;font-weight:800;margin-bottom:6px;display:flex;align-items:center;gap:4px;color:'+HK.fg+';"><span class="material-icons" style="font-size:12px;">palette</span> COLOR PICKER</div><div style="display:flex;align-items:center;gap:10px;padding:8px;background:'+HK.bg2+';border-radius:6px;border:1px solid '+HK.line+';"><input type="color" id="dt-color-input" value="#00ff41" style="width:40px;height:40px;border:none;cursor:pointer;"><div><div style="font-size:12px;font-weight:700;color:'+HK.fg+';" id="dt-color-hex">#00ff41</div><div style="font-size:9px;color:'+HK.fgDim+';margin-top:2px;" id="dt-color-rgb">rgb(0, 255, 65)</div></div></div>');
        var input=document.getElementById('dt-color-input'),hexEl=document.getElementById('dt-color-hex'),rgbEl=document.getElementById('dt-color-rgb');
        input.addEventListener('input',function(e){ var hex=e.target.value; hexEl.textContent=hex; var r=parseInt(hex.slice(1,3),16),g=parseInt(hex.slice(3,5),16),b=parseInt(hex.slice(5,7),16); rgbEl.textContent='rgb('+r+', '+g+', '+b+')'; });
    },

    tA11y:function(){
        var imagesWithoutAlt=document.querySelectorAll('img:not([alt])').length;
        var buttonsWithoutAria=document.querySelectorAll('button:not([aria-label]):not([title])').length;
        var html='<div style="font-size:10px;font-weight:800;margin-bottom:6px;display:flex;align-items:center;gap:4px;color:'+HK.fg+';"><span class="material-icons" style="font-size:12px;">accessibility</span> ACCESSIBILITY CHECK</div>';
        html+='<table style="width:100%;border-collapse:collapse;font-size:9px;background:'+HK.bg2+';border-radius:6px;overflow:hidden;">';
        html+='<tr style="border-bottom:1px solid '+HK.line+';"><td style="padding:4px 3px;font-weight:600;">Images without alt</td><td style="padding:4px 3px;color:'+(imagesWithoutAlt>0?HK.bad:HK.accent)+';font-weight:700;">'+imagesWithoutAlt+'</td></tr><tr><td style="padding:4px 3px;font-weight:600;">Buttons without aria-label/title</td><td style="padding:4px 3px;color:'+(buttonsWithoutAria>0?HK.warn:HK.accent)+';font-weight:700;">'+buttonsWithoutAria+'</td></tr></table>';
        this.showHTML(html);
    },

    tScreen:function(){
        var html='<div style="font-size:10px;font-weight:800;margin-bottom:6px;display:flex;align-items:center;gap:4px;color:'+HK.fg+';"><span class="material-icons" style="font-size:12px;">devices</span> SCREEN INFO</div>';
        html+='<table style="width:100%;border-collapse:collapse;font-size:9px;background:'+HK.bg2+';border-radius:6px;overflow:hidden;">';
        html+='<tr style="border-bottom:1px solid '+HK.line+';"><td style="padding:4px 3px;font-weight:600;">Width</td><td style="padding:4px 3px;">'+window.screen.width+' px</td></tr>';
        html+='<tr style="border-bottom:1px solid '+HK.line+';"><td style="padding:4px 3px;font-weight:600;">Height</td><td style="padding:4px 3px;">'+window.screen.height+' px</td></tr>';
        html+='<tr style="border-bottom:1px solid '+HK.line+';"><td style="padding:4px 3px;font-weight:600;">Viewport W</td><td style="padding:4px 3px;">'+window.innerWidth+' px</td></tr>';
        html+='<tr style="border-bottom:1px solid '+HK.line+';"><td style="padding:4px 3px;font-weight:600;">Viewport H</td><td style="padding:4px 3px;">'+window.innerHeight+' px</td></tr>';
        html+='<tr><td style="padding:4px 3px;font-weight:600;">Device Pixel Ratio</td><td style="padding:4px 3px;">'+window.devicePixelRatio+'</td></tr>';
        html+='</table>';
        this.showHTML(html);
    }
};

window.DT = DT;

try{
    if(document.readyState==='loading'){ document.addEventListener('DOMContentLoaded',function(){ DT.init(); }); }
    else { DT.init(); }
} catch(e){
    var d=document.createElement('div');
    d.style.cssText='position:fixed;bottom:8px;right:8px;background:#dc2626;color:#fff;padding:8px 12px;border-radius:8px;z-index:2147483647;font:700 11px sans-serif;max-width:280px;box-shadow:0 4px 12px rgba(0,0,0,.3);';
    d.textContent='❌ DevTools error: '+(e.message||e);
    document.body.appendChild(d);
}
})();