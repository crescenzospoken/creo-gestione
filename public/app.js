/* CREO Positano - app */
'use strict';
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
let CAT=null, YEARS=[], ORDERS=[], VIEW='list', YEARSEL='all', DASHYEAR=null, SHOWN={}, DASHCACHE={}, CHARTS=[];
let AUTOS=[];
let FILTERS={};
let SELECTED=new Set();
let SELMODE=false;
let SORT=null;
const FILTERABLE=new Set(['reparto','modello','stile','lenti','pagato','stato_lav','clientela','demografia','eta','upsell','sellout','tags','tax_refund']);
let COLW=JSON.parse(localStorage.getItem('creo_colw')||'{}');
let COLHIDE=new Set(JSON.parse(localStorage.getItem('creo_colhide')||'["tags"]'));
let COLORD=JSON.parse(localStorage.getItem('creo_colord')||'null');
let GRAN=localStorage.getItem('creo_gran')||'W';
let CLOSED=JSON.parse(localStorage.getItem('creo_closed')||'{}');
let _pt=null;
function savePrefs(){
  clearTimeout(_pt);
  _pt=setTimeout(()=>{api('prefs',{method:'PUT',body:JSON.stringify({prefs:{colw:COLW,colord:COLORD,colhide:[...COLHIDE],closed:CLOSED,gran:GRAN,sort:SORT}})}).catch(()=>{});},600);
}
const MESI=['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic'];
const PALETTE=['#35a7ff','#f4a832','#6bc950','#e05252','#bf55ec','#1bbc9c','#ff7800','#f900ea','#81B1FF','#FCDC51','#9b59b6','#04A9F4','#2ecd6f','#e50000','#667684'];

async function api(path,opts={}){
  const r=await fetch('/api/'+path,{headers:{'Content-Type':'application/json'},...opts});
  if(r.status===401){showLogin();throw new Error('auth');}
  return r.json();
}
function toast(msg){const t=$('#toast');t.textContent=msg;t.classList.add('show');clearTimeout(t._h);t._h=setTimeout(()=>t.classList.remove('show'),1400);}
function fmtEUR(v,dec=0){if(v===null||v===undefined||isNaN(v))return '€ 0';return '€ '+Number(v).toLocaleString('it-IT',{minimumFractionDigits:dec,maximumFractionDigits:dec});}
function esc(s){return String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));}
function jarr(v){try{const a=JSON.parse(v||'[]');return Array.isArray(a)?a:[];}catch(e){return[];}}
function optColor(cat,name){if(!cat||!CAT.fields[cat])return null;const o=CAT.fields[cat].options.find(o=>o.n===name);return o&&o.c?o.c:null;}
function chipHtml(txt,color){const c=color||'#3e454d';const dark=lum(c)>.6;return `<span class="cellchip" style="background:${c};color:${dark?'#15181b':'#fff'}">${esc(txt)}</span>`;}
function lum(hex){if(!hex||hex[0]!=='#')return 0;let h=hex.slice(1);if(h.length===3)h=h.split('').map(x=>x+x).join('');const n=parseInt(h,16);const r=(n>>16&255)/255,g=(n>>8&255)/255,b=(n&255)/255;return .2126*r+.7152*g+.0722*b;}
function tagOptions(){
  const cat=(CAT.fields.tags&&CAT.fields.tags.options)||[];
  const known=new Set(cat.map(o=>o.n));
  const extra=[...new Set(ORDERS.flatMap(x=>jarr(x.tags)))].filter(n=>!known.has(n)).map(n=>({n}));
  return [...cat,...extra];
}
function valOf(o,c){
  if(c.type==='labels'){const a=jarr(o[c.k]);return a.length?a:['(vuoto)'];}
  if(c.type==='check')return [o[c.k]?'Sì':'No'];
  const v=o[c.k];return [(v===null||v===undefined||v==='')?'(vuoto)':String(v)];
}
function cmpVal(o,c){
  if(c.type==='money')return o[c.k]==null?null:Number(o[c.k]);
  if(c.type==='calc'){const g=guad(o);return g==null?null:g;}
  if(c.type==='check')return o[c.k]?1:0;
  if(c.type==='labels'){const a=jarr(o[c.k]);return a.length?a[0].toLowerCase():null;}
  const v=o[c.k];return v==null||v===''?null:String(v).toLowerCase();
}
function sortRows(rows){
  if(!SORT||!SORT.k)return rows;
  const c=SORT.k==='name'?{k:'name',type:'text'}:LCOLS.find(x=>x.k===SORT.k);
  if(!c)return rows;
  return [...rows].sort((a,b)=>{
    const va=cmpVal(a,c),vb=cmpVal(b,c);
    if(va===null&&vb===null)return 0;
    if(va===null)return 1;
    if(vb===null)return -1;
    return (va<vb?-1:va>vb?1:0)*SORT.dir;
  });
}
function applyFilters(rows){
  const keys=Object.keys(FILTERS).filter(k=>FILTERS[k]&&FILTERS[k].size);
  if(!keys.length)return rows;
  return rows.filter(o=>keys.every(k=>{
    const c=LCOLS.find(x=>x.k===k);if(!c)return true;
    return valOf(o,c).some(v=>FILTERS[k].has(v));
  }));
}
function statusInfo(name){return (CAT.statuses.find(s=>s.name===name))||{name,color:'#888'};}
function today(){return new Date().toISOString().slice(0,10);}
function fmtDate(v){if(!v)return '';const[y,m,d]=v.split('-');return `${d}/${m}/${y.slice(2)}`;}
function waNum(t){let d=String(t||'').replace(/\D/g,'');if(!d)return'';if(d.startsWith('00'))d=d.slice(2);if(d.length===10&&d.startsWith('3'))d='39'+d;return d;}
function waLink(v){const n=waNum(v);return n?` <a class="wa" href="https://wa.me/${n}" target="_blank" title="Scrivi su WhatsApp" onclick="event.stopPropagation()">💬</a>`:'';}
function guad(o){const p=o.prezzo,s=o.spese;if(p===null&&s===null)return null;return (p||0)-(s||0);}

/* ---------- LOGIN ---------- */
function showLogin(){$('#app').classList.add('hidden');$('#login').classList.remove('hidden');setTimeout(()=>$('#pw').focus(),50);}
$('#loginbtn').addEventListener('click',doLogin);
$('#pw').addEventListener('keydown',e=>{if(e.key==='Enter')doLogin();});
async function doLogin(){
  $('#loginerr').textContent='';
  const r=await fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:$('#pw').value})});
  if(r.ok){$('#pw').value='';boot();}else $('#loginerr').textContent='Password errata';
}
$('#logoutbtn').addEventListener('click',async()=>{await fetch('/api/logout',{method:'POST'});location.reload();});

/* ---------- BOOT ---------- */
async function boot(){
  let b;
  try{b=await api('boot');}catch(e){return;}
  if(!b.ok)return showLogin();
  CAT=b.catalogs;YEARS=b.years;AUTOS=b.automations||[];
  if(b.prefs){
    COLW=b.prefs.colw||COLW;COLORD=b.prefs.colord??COLORD;
    COLHIDE=new Set(b.prefs.colhide||[...COLHIDE]);
    CLOSED=b.prefs.closed||CLOSED;GRAN=b.prefs.gran||GRAN;SORT=b.prefs.sort||null;
  } else savePrefs();
  const cy=String(new Date().getFullYear());
  if(!YEARS.includes(cy))YEARS.unshift(cy);
  YEARS.sort((a,b2)=>b2.localeCompare(a));
  $('#login').classList.add('hidden');$('#app').classList.remove('hidden');
  renderYearbar();await loadOrders();
  DASHYEAR=YEARS.includes(cy)?cy:YEARS[0];
  setView(localStorage.getItem('creo_view')||'list');
}
function setView(v){
  VIEW=v;localStorage.setItem('creo_view',v);
  $('#tab-list').classList.toggle('active',v==='list');
  $('#tab-dash').classList.toggle('active',v==='dash');
  $('#view-list').classList.toggle('hidden',v!=='list');
  $('#view-dash').classList.toggle('hidden',v!=='dash');
  if(v==='dash')renderDash();
}
$('#tab-list').addEventListener('click',()=>setView('list'));
$('#tab-dash').addEventListener('click',()=>setView('dash'));

/* ---------- LISTA ---------- */
function renderYearbar(){
  const b=$('#yearbtn');
  b.textContent='📅 '+(YEARSEL==='all'?'Tutti':YEARSEL==='senza'?'Senza data':YEARSEL)+' ▾';
}
$('#actbtn').addEventListener('click',()=>openActivity());
const FLAB={name:'Nome',description:'Descrizione',status:'Stato lista',rx:'Prescrizione',data:'Data',due_date:'Scadenza',tags:'Tag',reparto:'Reparto',clientela:'Clientela',demografia:'Demografia',modello:'Modello',stato_lav:'Stato',pagato:'Pagato',sellout:'Sellout',telefono:'Telefono',prezzo:'Prezzo',spese:'Spese',tax_refund:'Tax Refund',stile:'Stile',lenti:'Lenti',upsell:'UpSell',eta:'Età',clickup_url:'Link',sort_order:'Ordine'};
function fmtVal(f,v){
  if(v===null||v===undefined||v==='')return '—';
  let s2=String(v);
  try{const a=JSON.parse(s2);if(Array.isArray(a))s2=a.join(', ')||'—';}catch(e){}
  if(f==='rx')return 'aggiornata';
  if((f==='data'||f==='due_date')&&/^\d{4}-\d{2}-\d{2}/.test(s2))return fmtDate(s2.slice(0,10));
  return s2.length>44?s2.slice(0,44)+'…':s2;
}
function actTime(ts){
  const d=new Date(ts.replace(' ','T')+'Z');
  return d.toLocaleDateString('it-IT',{day:'2-digit',month:'2-digit'})+' '+d.toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit'});
}
async function openActivity(){
  const m=$('#modal');m.classList.remove('hidden');
  m.innerHTML=`<div class="mbox"><div class="mhead"><b>🕘 Attività recenti</b><button class="btn small" id="mclose">✕</button></div><div class="mbody" id="mbody"><div class="aiwait"><span class="spin"></span></div></div></div>`;
  m.querySelector('#mclose').onclick=()=>m.classList.add('hidden');
  m.addEventListener('mousedown',e=>{if(e.target===m)m.classList.add('hidden');},{once:true});
  const r=await api('activity?limit=150');
  const body=$('#mbody');
  if(!r.ok||!r.activity.length){body.innerHTML='<div class="mut" style="padding:20px">Nessuna attività registrata (da ora in poi registro tutto).</div>';return;}
  body.innerHTML=r.activity.map(a=>{
    let desc='',btn='';
    if(a.action==='crea'){desc='<span style="color:var(--ok)">creato</span>';btn=`<button class="btn small aundo" data-id="${a.id}">Annulla creazione</button>`;}
    else if(a.action==='elimina'){desc='<span style="color:var(--danger)">eliminato</span>';btn=`<button class="btn small primary aundo" data-id="${a.id}">Ripristina</button>`;}
    else{desc=`${FLAB[a.field]||a.field}: <span class="mut">${esc(fmtVal(a.field,a.old_value))}</span> → <b>${esc(fmtVal(a.field,a.new_value))}</b>`;btn=`<button class="btn small aundo" data-id="${a.id}">Annulla</button>`;}
    return `<div class="actrow"><span class="mut" style="flex-shrink:0">${actTime(a.ts)}</span>
      <a class="aopen" data-oid="${esc(a.order_id||'')}" title="Apri ordine">${esc((a.order_name||'—').slice(0,32))}</a>
      <span class="actdesc">${desc}</span>${btn}</div>`;
  }).join('');
  body.querySelectorAll('.aundo').forEach(b=>b.addEventListener('click',async()=>{
    b.disabled=true;
    const r2=await api('activity/undo',{method:'POST',body:JSON.stringify({id:+b.dataset.id})});
    if(r2.ok){toast('Annullato ✓');DASHCACHE={};await loadOrders();openActivity();}
    else{toast(r2.error||'Impossibile annullare');b.disabled=false;}
  }));
  body.querySelectorAll('.aopen').forEach(el=>el.addEventListener('click',async()=>{
    const r2=await api('order/'+el.dataset.oid);
    if(r2.ok&&r2.order){m.classList.add('hidden');openDrawer(r2.order);}
    else toast('Ordine non più esistente');
  }));
}
$('#selbtn').addEventListener('click',()=>{
  SELMODE=!SELMODE;
  document.body.classList.toggle('selmode',SELMODE);
  $('#selbtn').classList.toggle('primary',SELMODE);
  if(!SELMODE){SELECTED.clear();renderList();renderBulkbar();}
});
$('#yearbtn').addEventListener('click',()=>{
  closePop();const p=$('#pop');
  const mk=(id,lab)=>`<div class="opt ${YEARSEL===id?'sel':''}" data-y="${id}"><span class="sw" style="background:${YEARSEL===id?'var(--sea)':'#556'}"></span>${lab}</div>`;
  p.innerHTML='<div class="plist">'+mk('all','Tutti gli anni')+YEARS.map(y=>mk(y,y)).join('')+mk('senza','Senza data')+'</div>';
  p.querySelectorAll('.opt').forEach(c=>c.addEventListener('click',async()=>{
    YEARSEL=c.dataset.y;renderYearbar();closePop();await loadOrders();
  }));
  placePop($('#yearbtn'));
});
async function loadOrders(){
  const q=$('#search').value.trim();
  const r=await api('orders?year='+encodeURIComponent(YEARSEL)+(q?'&q='+encodeURIComponent(q):''));
  ORDERS=r.orders||[];renderList();
}
let _st;$('#search').addEventListener('input',()=>{clearTimeout(_st);_st=setTimeout(loadOrders,350);});

const LCOLS=[
 {k:'data',label:'Data',type:'date',w:''},
 {k:'reparto',label:'Reparto',type:'select',cat:'reparto'},
 {k:'modello',label:'Modello',type:'select',cat:'modello'},
 {k:'stile',label:'Stile',type:'labels',cat:'stile'},
 {k:'lenti',label:'Lenti',type:'labels',cat:'lenti'},
 {k:'prezzo',label:'Prezzo',type:'money'},
 {k:'spese',label:'Spese',type:'money'},
 {k:'guadagni',label:'Guadagni',type:'calc'},
 {k:'pagato',label:'Pagato',type:'select',cat:'pagato'},
 {k:'stato_lav',label:'Stato',type:'select',cat:'stato_lav'},
 {k:'clientela',label:'Clientela',type:'select',cat:'clientela'},
 {k:'demografia',label:'Demografia',type:'select',cat:'demografia'},
 {k:'eta',label:'Età',type:'labels',cat:'eta',single:true},
 {k:'upsell',label:'UpSell',type:'labels',cat:'upsell'},
 {k:'sellout',label:'Sellout',type:'select',cat:'sellout'},
 {k:'tax_refund',label:'Tax Ref.',type:'check'},
 {k:'telefono',label:'Telefono',type:'text'},
 {k:'tags',label:'Tag',type:'labels',cat:'tags'},
 {k:'due_date',label:'Scadenza',type:'date'},
];
function defW(c){if(c.k==='data'||c.k==='due_date')return 108;if(c.type==='money'||c.type==='calc')return 100;if(c.type==='labels')return 170;if(c.type==='select')return 135;if(c.type==='check')return 80;return 140;}
function effCols(){
  if(!COLORD)return LCOLS.filter(c=>!COLHIDE.has(c.k));
  const map=Object.fromEntries(LCOLS.map(c=>[c.k,c]));
  const out=COLORD.map(k=>map[k]).filter(Boolean);
  for(const c of LCOLS)if(!out.includes(c))out.push(c);
  return out.filter(c=>!COLHIDE.has(c.k));
}
function saveCols(){savePrefs();}
function cellHtml(o,col){
  const v=o[col.k];
  if(col.type==='date')return v?fmtDate(v):'<span style="color:var(--mut)">—</span>';
  if(col.type==='money')return v===null||v===undefined?'':fmtEUR(v);
  if(col.type==='calc'){const g=guad(o);if(g===null)return'';return fmtEUR(g);}
  if(col.type==='check')return v?'✅':'<span style="color:var(--mut)">☐</span>';
  if(col.type==='select')return v?chipHtml(v,optColor(col.cat,v)):'';
  if(col.type==='labels'){const a=jarr(v);if(!a.length)return'';return `<span class="lblwrap">${a.map(x=>chipHtml(x,col.cat?optColor(col.cat,x):null)).join('')}</span>`;}
  if(col.k==='telefono'&&v)return esc(v)+waLink(v);
  return esc(v||'');
}
function rowHtml(o){
  const cells=effCols().map(c=>{
    const cls=['c_'+c.k];
    if(c.type==='money'||c.type==='calc')cls.push('num');
    if(c.type==='calc'){const g=guad(o);if(g!==null)cls.push(g>=0?'pos':'neg');}
    const ed=c.type!=='calc'?' editable':'';
    return `<td class="${cls.join(' ')}${ed}" data-k="${c.k}">${cellHtml(o,c)}</td>`;
  }).join('');
  const tg=jarr(o.tags);
  const tghtml=tg.length?tg.map(t=>{const c=optColor('tags',t);return `<span class="tagchip" style="${c?`background:${c};color:${lum(c)>.6?'#15181b':'#fff'}`:''}">${esc(t)}</span>`;}).join(''):'';
  return `<tr data-id="${o.id}" class="${SELECTED.has(o.id)?'selrow':''}"><td class="cname" title="${esc(o.name)}${tg.length?' · '+tg.map(esc).join(', '):''}"><div class="nmwrap"><input type="checkbox" class="rowck"${SELECTED.has(o.id)?' checked':''}><span class="stdot" style="background:${statusInfo(o.status).color}" title="${esc(o.status)} — clicca per cambiare stato"></span><span class="nm">${esc(o.name)}</span>${tghtml}</div></td>${cells}</tr>`;
}
function renderList(){
  const el=$('#list');el.innerHTML='';
  const BASE=applyFilters(ORDERS);
  const closed=CLOSED;
  for(const st of CAT.statuses){
    const rows=sortRows(BASE.filter(o=>o.status===st.name));
    if(!rows.length&&!['in corso','potenziali'].includes(st.name))continue;
    const isClosed=closed[st.name]!==undefined?closed[st.name]:(st.name==='completato'||st.name==='archiviato');
    const shown=SHOWN[st.name]||200;
    const g=document.createElement('div');
    g.className='group'+(isClosed?' closed':'');
    g.innerHTML=`<div class="ghead"><span class="dot" style="background:${st.color}"></span>
      <span class="gname" style="color:${st.color}">${esc(st.name)}</span>
      <span class="count">${rows.length}</span>
      <input type="checkbox" class="gck" title="Seleziona tutto il gruppo">
      <button class="gadd" title="Aggiungi in «${esc(st.name)}»">＋</button>
      <input class="gaddin hidden" placeholder="Nome cliente e ordine… (Invio per creare)">
      <span class="chev" style="margin-left:auto">▾</span></div>
      <div class="gbody"><table class="grid" style="width:${290+(COLW.name?COLW.name-290:0)+effCols().reduce((t,c)=>t+(COLW[c.k]||defW(c)),0)}px"><colgroup><col style="width:${COLW.name||290}px">${effCols().map(c=>`<col style="width:${COLW[c.k]||defW(c)}px">`).join('')}</colgroup><thead><tr><th class="cname">Nome<span class="srt${SORT&&SORT.k==='name'?' on':''}" data-k="name">${SORT&&SORT.k==='name'?(SORT.dir===1?'▲':'▼'):'↕'}</span><span class="rz" data-k="name"></span></th>${effCols().map(c=>`<th draggable="true" data-k="${c.k}" class="${FILTERABLE.has(c.k)?'fth':''}${FILTERS[c.k]&&FILTERS[c.k].size?' factive':''}">${c.label}${FILTERS[c.k]&&FILTERS[c.k].size?` <span class="fon">⏷${FILTERS[c.k].size}</span>`:''}<span class="srt${SORT&&SORT.k===c.k?' on':''}" data-k="${c.k}">${SORT&&SORT.k===c.k?(SORT.dir===1?'▲':'▼'):'↕'}</span><span class="rz" data-k="${c.k}"></span></th>`).join('')}</tr></thead>
      <tbody>${rows.slice(0,shown).map(rowHtml).join('')}</tbody></table>
      ${rows.length>shown?`<button class="morebtn" data-st="${esc(st.name)}">Mostra altri ${Math.min(200,rows.length-shown)} (${rows.length-shown} rimanenti)</button>`:''}</div>`;
    g.querySelector('.ghead').addEventListener('click',e=>{
      if(e.target.classList.contains('gadd')||e.target.classList.contains('gaddin')||e.target.classList.contains('gck'))return;
      g.classList.toggle('closed');closed[st.name]=g.classList.contains('closed');
      savePrefs();
    });
    const gab=g.querySelector('.gadd'),gai=g.querySelector('.gaddin');
    gab.addEventListener('click',e=>{e.stopPropagation();gai.classList.toggle('hidden');if(!gai.classList.contains('hidden'))gai.focus();});
    gai.addEventListener('keydown',async e=>{
      e.stopPropagation();
      if(e.key==='Escape'){gai.classList.add('hidden');gai.value='';return;}
      if(e.key==='Enter'&&gai.value.trim()){
        const r=await api('orders',{method:'POST',body:JSON.stringify({name:gai.value.trim(),status:st.name,data:today()})});
        if(r.ok){ORDERS.unshift(r.order);renderList();toast('Ordine creato');DASHCACHE={};
          const ng=[...document.querySelectorAll('.ghead')].find(h=>h.textContent.includes(st.name));
          if(ng){const ni=ng.querySelector('.gaddin');ni.classList.remove('hidden');ni.focus();}
        }
      }
    });
    gai.addEventListener('blur',()=>{if(!gai.value.trim())gai.classList.add('hidden');});
    const gck=g.querySelector('.gck');
    gck.checked=rows.length>0&&rows.every(o=>SELECTED.has(o.id));
    gck.addEventListener('click',e=>e.stopPropagation());
    gck.addEventListener('change',()=>{
      for(const o of rows){if(gck.checked)SELECTED.add(o.id);else SELECTED.delete(o.id);}
      renderList();renderBulkbar();
    });
    const mb=g.querySelector('.morebtn');
    if(mb)mb.addEventListener('click',()=>{SHOWN[st.name]=shown+200;renderList();});
    el.appendChild(g);
  }
  bindHeader(el);
  el.querySelectorAll('.rowck').forEach(ck=>{
    ck.addEventListener('click',e=>e.stopPropagation());
    ck.addEventListener('change',()=>{
      const id=ck.closest('tr').dataset.id;
      if(ck.checked)SELECTED.add(id);else SELECTED.delete(id);
      ck.closest('tr').classList.toggle('selrow',ck.checked);
      renderBulkbar();
    });
  });
  el.querySelectorAll('td.editable').forEach(td=>td.addEventListener('click',e=>{
    const tr=td.closest('tr'),id=tr.dataset.id,k=td.dataset.k;
    const o=ORDERS.find(x=>x.id===id);const col=LCOLS.find(c=>c.k===k);
    openEditor(td,o,col);e.stopPropagation();
  }));
  el.querySelectorAll('td.cname').forEach(td=>td.addEventListener('click',e=>{
    const o=ORDERS.find(x=>x.id===td.closest('tr').dataset.id);
    if(e.target.classList.contains('stdot')){e.stopPropagation();openStatusEditor(e.target,o);return;}
    openDrawer(o);
  }));
}
async function saveField(o,k,v){
  const r=await api('orders/'+o.id,{method:'PATCH',body:JSON.stringify({[k]:v})});
  if(r.ok){Object.assign(o,r.order);toast('Salvato ✓');DASHCACHE={};refreshRow(o);if($('#drawer').classList.contains('open')&&$('#drawer').dataset.id===o.id&&!['description','rx','name'].includes(k))openDrawer(o,true);}
  return r;
}
function refreshRow(o){
  const tr=document.querySelector(`tr[data-id="${o.id}"]`);
  if(!tr)return;
  const tmp=document.createElement('tbody');tmp.innerHTML=rowHtml(o);
  const nt=tmp.firstElementChild;tr.replaceWith(nt);
  nt.querySelectorAll('td.editable').forEach(td=>td.addEventListener('click',e=>{
    const col=LCOLS.find(c=>c.k===td.dataset.k);openEditor(td,o,col);e.stopPropagation();
  }));
  nt.querySelector('td.cname').addEventListener('click',e=>{
    if(e.target.classList.contains('stdot')){e.stopPropagation();openStatusEditor(e.target,o);return;}
    openDrawer(o);
  });
}

/* ---------- POPOVER EDITOR ---------- */
let popFlush=null;
function closePop(){
  if(popFlush){try{popFlush();}catch(e){}popFlush=null;}
  $('#pop').classList.add('hidden');$('#pop').innerHTML='';document.removeEventListener('mousedown',_pc);
}
function _pc(e){if(!$('#pop').contains(e.target))closePop();}
function placePop(anchor){
  const p=$('#pop');const r=anchor.getBoundingClientRect();
  p.classList.remove('hidden');
  const top=Math.min(r.bottom+4+window.scrollY,window.scrollY+window.innerHeight-360);
  const left=Math.min(r.left+window.scrollX,window.scrollX+window.innerWidth-320);
  p.style.top=top+'px';p.style.left=left+'px';
  setTimeout(()=>document.addEventListener('mousedown',_pc),10);
}
function openEditor(anchor,o,col){
  closePop();const p=$('#pop');
  if(col.type==='check'){saveField(o,col.k,o[col.k]?0:1);return;}
  if(col.type==='date'){
    p.innerHTML=`<input type="date" value="${o[col.k]||''}"><div class="pactions"><span style="color:var(--mut);font-size:11.5px;align-self:center">salva quando chiudi</span><button class="btn small" id="pclear">Svuota</button></div>`;
    placePop(anchor);
    const inp=p.querySelector('input');inp.focus();
    const orig=o[col.k]||'';
    popFlush=()=>{const v=inp.value||'';if(v!==orig)saveField(o,col.k,v||null);};
    inp.addEventListener('keydown',e=>{if(e.key==='Enter')closePop();});
    p.querySelector('#pclear').onclick=()=>{popFlush=null;saveField(o,col.k,null);closePop();};
    return;
  }
  if(col.type==='money'){
    p.innerHTML=`<input type="number" step="0.01" value="${o[col.k]??''}" placeholder="€ — si salva da solo"><div class="pactions"><button class="btn small" id="pclear">Svuota</button></div>`;
    placePop(anchor);const inp=p.querySelector('input');inp.focus();inp.select();
    let t,last=o[col.k]??'';
    const doSave=()=>{const v=inp.value===''?null:Number(inp.value);if(String(v??'')===String(last??''))return;last=v??'';saveField(o,col.k,v);};
    inp.addEventListener('input',()=>{clearTimeout(t);t=setTimeout(doSave,700);});
    inp.addEventListener('blur',()=>{clearTimeout(t);doSave();});
    inp.addEventListener('keydown',e=>{if(e.key==='Enter'){clearTimeout(t);doSave();closePop();}});
    p.querySelector('#pclear').onclick=()=>{clearTimeout(t);last=null;saveField(o,col.k,null);closePop();};
    return;
  }
  if(col.type==='text'){
    p.innerHTML=`<input type="text" class="free" value="${esc(o[col.k]||'')}" placeholder="si salva da solo">`;
    placePop(anchor);const inp=p.querySelector('input');inp.focus();
    let t,last=o[col.k]||'';
    const doSave=()=>{if(inp.value===last)return;last=inp.value;saveField(o,col.k,inp.value);};
    inp.addEventListener('input',()=>{clearTimeout(t);t=setTimeout(doSave,700);});
    inp.addEventListener('blur',()=>{clearTimeout(t);doSave();});
    inp.addEventListener('keydown',e=>{if(e.key==='Enter'){clearTimeout(t);doSave();closePop();}});
    return;
  }
  // select / labels
  const multi=col.type==='labels';
  const opts=col.k==='tags'?tagOptions():(col.cat?CAT.fields[col.cat].options:[]);
  const cur=multi?jarr(o[col.k]):(o[col.k]||'');
  p.innerHTML=`<input class="psearch" placeholder="Cerca…"><div class="plist"></div>
    ${multi&&!col.single?'<div class="pactions"><button class="btn small" id="pok">Chiudi</button></div>':''}
    <button class="addnew hidden" id="paddnew"></button>`;
  const list=p.querySelector('.plist');const search=p.querySelector('.psearch');const addBtn=p.querySelector('#paddnew');
  let sel=multi?[...cur]:cur;
  function draw(){
    const f=search.value.toLowerCase();
    const shown=opts.filter(op=>op.n.toLowerCase().includes(f));
    list.innerHTML=(multi&&!col.single?'':`<div class="opt" data-n=""><span class="sw" style="background:#555"></span>— Nessuno —</div>`)+
      shown.slice(0,220).map(op=>{
        const on=multi?sel.includes(op.n):sel===op.n;
        return `<div class="opt ${on?'sel':''}" data-n="${esc(op.n)}"><span class="sw" style="background:${op.c||'#556'}"></span>${multi?(on?'☑ ':'☐ '):''}${esc(op.n)}</div>`;
      }).join('');
    if(f&&!opts.some(op=>op.n.toLowerCase()===f)){addBtn.classList.remove('hidden');addBtn.textContent=`+ Aggiungi «${search.value}»`;}
    else addBtn.classList.add('hidden');
    list.querySelectorAll('.opt').forEach(el=>el.addEventListener('click',async()=>{
      const n=el.dataset.n;
      if(col.single){await saveField(o,col.k,JSON.stringify(n?[n]:[]));closePop();}
      else if(multi){if(sel.includes(n))sel=sel.filter(x=>x!==n);else sel.push(n);saveField(o,col.k,JSON.stringify(sel));draw();}
      else{await saveField(o,col.k,n);closePop();}
    }));
  }
  addBtn.addEventListener('click',async()=>{
    const name=search.value.trim();if(!name)return;
    if(col.cat){const r=await api('catalogs/option',{method:'POST',body:JSON.stringify({field:col.cat,name})});if(r.ok)CAT=r.catalogs;}
    opts.push({n:name});
    if(col.single){await saveField(o,col.k,JSON.stringify([name]));closePop();}
    else if(multi){sel.push(name);saveField(o,col.k,JSON.stringify(sel));search.value='';draw();}
    else{await saveField(o,col.k,name);closePop();}
  });
  if(multi&&!col.single)p.querySelector('#pok').onclick=()=>closePop();
  search.addEventListener('input',draw);
  placePop(anchor);draw();search.focus();
}

/* ---------- DRAWER ---------- */
const DFIELDS=[
 {k:'status',label:'Stato lista',type:'status'},
 {k:'data',label:'Data',type:'date'},
 {k:'reparto',label:'Reparto',type:'select',cat:'reparto'},
 {k:'modello',label:'Modello',type:'select',cat:'modello'},
 {k:'stile',label:'Stile',type:'labels',cat:'stile'},
 {k:'lenti',label:'Lenti',type:'labels',cat:'lenti'},
 {k:'prezzo',label:'Prezzo',type:'money'},
 {k:'spese',label:'Spese',type:'money'},
 {k:'guadagni',label:'Guadagni',type:'calc'},
 {k:'pagato',label:'Pagato',type:'select',cat:'pagato'},
 {k:'stato_lav',label:'Stato',type:'select',cat:'stato_lav'},
 {k:'clientela',label:'Clientela',type:'select',cat:'clientela'},
 {k:'demografia',label:'Demografia',type:'select',cat:'demografia'},
 {k:'eta',label:'Età',type:'labels',cat:'eta',single:true},
 {k:'upsell',label:'UpSell',type:'labels',cat:'upsell'},
 {k:'sellout',label:'Sellout',type:'select',cat:'sellout'},
 {k:'tax_refund',label:'Tax Refund',type:'check'},
 {k:'telefono',label:'Telefono',type:'text'},
 {k:'tags',label:'Tag',type:'labels',cat:'tags'},
 {k:'due_date',label:'Scadenza',type:'date'},
];
function openDrawer(o,keep){
  const d=$('#drawer');d.dataset.id=o.id;
  let rx={};try{rx=JSON.parse(o.rx||'{}')||{};}catch(e){}
  const rxrow=(eye,lab)=>{const r=rx[eye]||{};const f=(k,ph)=>`<input class="rxin" data-eye="${eye}" data-k="${k}" value="${esc(r[k]||'')}" placeholder="${ph}">`;
    return `<tr><td class="rxeye">${lab}</td><td>${f('sf','+0.00')}</td><td>${f('cil','−0.00')}</td><td>${f('ax','°')}</td><td>${f('add','')}</td><td>${f('dp','mm')}</td><td>${f('h','mm')}</td></tr>`;};
  d.innerHTML=`<div class="dbox"><div class="dhead"><input id="dname" value="${esc(o.name)}"><button class="btn small" id="dclose">✕</button></div>
  <div class="dbody">
    <div class="dgrid">
    ${DFIELDS.map(f=>{
      let val='';
      if(f.type==='calc'){const g=guad(o);val=g===null?'—':fmtEUR(g);}
      else if(f.type==='status')val=chipHtml(o.status,statusInfo(o.status).color);
      else if(f.type==='check')val=o[f.k]?'✅ Sì':'☐ No';
      else if(f.type==='date')val=o[f.k]?fmtDate(o[f.k]):'—';
      else if(f.type==='money')val=o[f.k]===null||o[f.k]===undefined?'—':fmtEUR(o[f.k]);
      else if(f.type==='select')val=o[f.k]?chipHtml(o[f.k],optColor(f.cat,o[f.k])):'—';
      else if(f.type==='labels'){const a=jarr(o[f.k]);val=a.length?a.map(x=>chipHtml(x,f.cat?optColor(f.cat,x):null)).join(' '):'—';}
      else{val=esc(o[f.k]||'—');if(f.k==='telefono'&&o[f.k])val=esc(o[f.k])+waLink(o[f.k]);}
      return `<div class="frow"><label>${f.label}</label><div class="fval" data-k="${f.k}">${val}</div></div>`;
    }).join('')}
    </div>
    <h4>👓 Prescrizione</h4>
    <table class="rxtable"><thead><tr><th></th><th>Sfera</th><th>Cilindro</th><th>Asse</th><th>Add</th><th>DP</th><th>Alt.</th></tr></thead>
    <tbody>${rxrow('od','OD dx')}${rxrow('os','OS sx')}</tbody></table>
    <input id="rxnote" placeholder="Note ricetta (trattamenti, transition, antiriflesso…)" value="${esc(rx.note||'')}">
    <h4>Descrizione</h4>
    <textarea id="ddesc" placeholder="Note, dettagli lavorazione, misure…">${esc(o.description||'')}</textarea>
    <div class="dmeta">Creato: ${o.date_created?fmtDate(o.date_created):'—'} · Aggiornato: ${(o.updated_at||'').slice(0,10)?fmtDate((o.updated_at||'').slice(0,10)):'—'}${o.clickup_url?` · <a href="${esc(o.clickup_url)}" target="_blank">Origine ↗</a>`:''}</div>
    <div id="dhist"></div>
    <div id="dcron"></div>
  </div>
  <div class="dfoot"><button class="btn danger" id="ddel">Elimina</button><div style="flex:1"></div><button class="btn" id="dclose2">Chiudi</button></div></div>`;
  d.classList.add('open');
  const close=()=>{d.classList.remove('open');};
  d.querySelector('#dclose').onclick=close;d.querySelector('#dclose2').onclick=close;
  d.addEventListener('mousedown',e=>{if(e.target===d)close();},{once:true});
  const nm=d.querySelector('#dname');
  nm.addEventListener('change',()=>saveField(o,'name',nm.value));
  const ds=d.querySelector('#ddesc');let _dt;
  ds.addEventListener('input',()=>{clearTimeout(_dt);_dt=setTimeout(()=>saveField(o,'description',ds.value),700);});
  let _rt;const saveRx=()=>{clearTimeout(_rt);_rt=setTimeout(()=>{
    const nrx={od:{},os:{},note:d.querySelector('#rxnote').value.trim()};
    d.querySelectorAll('.rxin').forEach(i=>{if(i.value.trim())nrx[i.dataset.eye][i.dataset.k]=i.value.trim();});
    saveField(o,'rx',JSON.stringify(nrx));
  },700);};
  d.querySelectorAll('.rxin,#rxnote').forEach(i=>i.addEventListener('input',saveRx));
  d.querySelector('#ddel').onclick=async()=>{
    if(!confirm('Eliminare definitivamente questo ordine?'))return;
    const r=await api('orders/'+o.id,{method:'DELETE'});
    if(r.ok){ORDERS=ORDERS.filter(x=>x.id!==o.id);close();renderList();toast('Eliminato');DASHCACHE={};}
  };
  d.querySelectorAll('.fval').forEach(el=>{
    const f=DFIELDS.find(x=>x.k===el.dataset.k);
    if(f.type==='calc')return;
    el.addEventListener('click',()=>{
      if(f.type==='status')openStatusEditor(el,o);
      else openEditor(el,o,f);
    });
  });
  loadHistory(o);loadCron(o);
}
async function loadCron(o){
  const box=document.querySelector('#dcron');if(!box)return;
  let rows=[];
  try{rows=(await api('activity?order='+o.id+'&limit=60')).activity||[];}catch(e){}
  const stat=[];
  if(o.date_created)stat.push([o.date_created,'📌 Creato'+(o.clickup_url?' (ClickUp)':'')]);
  if(o.cu_updated)stat.push([o.cu_updated,'✏️ Ultimo ritocco su ClickUp']);
  if(o.date_done)stat.push([o.date_done,'✅ Completato']);
  const evrows=rows.map(a=>{
    let d='';
    if(a.action==='crea')d='<span style="color:var(--ok)">creato qui</span>';
    else if(a.action==='elimina')d='<span style="color:var(--danger)">eliminato</span>';
    else d=`${FLAB[a.field]||a.field}: <span class="mut">${esc(fmtVal(a.field,a.old_value))}</span> → <b>${esc(fmtVal(a.field,a.new_value))}</b>`;
    return `<div class="cronrow"><span class="mut">${actTime(a.ts)}</span><span class="actdesc">${d}</span></div>`;
  }).join('');
  const strows=stat.sort((x,y)=>String(y[0]).localeCompare(String(x[0]))).map(([d,l])=>`<div class="cronrow"><span class="mut">${fmtDate(String(d).slice(0,10))}</span><span>${l}</span></div>`).join('');
  if(!strows&&!evrows){box.innerHTML='';return;}
  box.innerHTML=`<h4>🕘 Cronologia</h4>${evrows}${strows}`;
}
async function loadHistory(o){
  const box=document.querySelector('#dhist');if(!box)return;
  const words=(o.name||'').split(/\s+/).filter(w=>/^[a-zA-Zà-ÿ]{3,}$/.test(w)).slice(0,2);
  if(!words.length){box.innerHTML='';return;}
  let r;try{r=await api('orders?q='+encodeURIComponent(words[0]));}catch(e){return;}
  let rows=(r.orders||[]).filter(x=>x.id!==o.id);
  if(words[1])rows=rows.filter(x=>x.name.toLowerCase().includes(words[1].toLowerCase()));
  rows=rows.slice(0,8);
  if(!rows.length){box.innerHTML='';return;}
  box.innerHTML=`<h4>🧑 Storico cliente · «${esc(words.join(' '))}» (${rows.length})</h4>`+
    rows.map(x=>`<div class="histrow" data-id="${x.id}"><span class="mut">${x.data?fmtDate(x.data):'—'}</span><b>${esc(x.name)}</b>${chipHtml(x.status,statusInfo(x.status).color)}<span>${x.prezzo!=null?fmtEUR(x.prezzo):''}</span></div>`).join('');
  box.querySelectorAll('.histrow').forEach(el=>el.addEventListener('click',()=>{
    const f=(r.orders||[]).find(z=>z.id===el.dataset.id);if(f)openDrawer(f);
  }));
}
function openStatusEditor(anchor,o){
  closePop();const p=$('#pop');
  p.innerHTML=`<div class="plist"></div>`;
  const list=p.querySelector('.plist');
  list.innerHTML=CAT.statuses.map(s=>`<div class="opt ${o.status===s.name?'sel':''}" data-n="${esc(s.name)}"><span class="sw" style="background:${s.color}"></span>${esc(s.name)}</div>`).join('');
  list.querySelectorAll('.opt').forEach(el=>el.addEventListener('click',async()=>{
    await saveField(o,'status',el.dataset.n);closePop();renderList();
  }));
  placePop(anchor);
}
$('#newbtn').addEventListener('click',async()=>{
  const r=await api('orders',{method:'POST',body:JSON.stringify({name:'Nuovo ordine',status:'in corso',data:today()})});
  if(r.ok){ORDERS.unshift(r.order);renderList();openDrawer(r.order);DASHCACHE={};}
});

/* ---------- DASHBOARD ---------- */
function renderDash(){
  const yb=$('#dashyears');
  yb.innerHTML=`<button class="chip ${DASHYEAR==='gen'?'active':''}" data-y="gen">📊 Generale</button>`+YEARS.map(y=>`<button class="chip ${DASHYEAR===y?'active':''}" data-y="${y}">Dashboard ${y}</button>`).join('');
  yb.querySelectorAll('.chip').forEach(c=>c.addEventListener('click',()=>{DASHYEAR=c.dataset.y;renderDash();}));
  buildDash(DASHYEAR);
}
async function dashRows(y){
  if(DASHCACHE[y])return DASHCACHE[y];
  const r=await api('orders?year='+y);
  DASHCACHE[y]=r.orders||[];return DASHCACHE[y];
}
const SALE=o=>o.status!=='potenziali'&&o.status!=='in corso';
function groupSum(rows,keyFn,valFn){
  const m=new Map();
  for(const r of rows){let k=keyFn(r);if(k===''||k===null||k===undefined)k='(vuoto)';
    if(Array.isArray(k)){for(const kk of (k.length?k:['(vuoto)']))m.set(kk,(m.get(kk)||0)+valFn(r));}
    else m.set(k,(m.get(k)||0)+valFn(r));}
  return [...m.entries()].sort((a,b)=>b[1]-a[1]).filter(([k,v])=>v!==0);
}
function colorsFor(cat,names){
  return names.map((n,i)=>{const c=cat?optColor(cat,n):null;return c||PALETTE[i%PALETTE.length];});
}
function addChart(id,cfg){const ctx=document.getElementById(id);if(!ctx)return;CHARTS.push(new Chart(ctx,cfg));}
function killCharts(){CHARTS.forEach(c=>c.destroy());CHARTS=[];}
const CHOPT={plugins:{legend:{position:'bottom',labels:{color:'#98a1aa',boxWidth:11,font:{size:11}}}},maintainAspectRatio:false};
function pieCfg(entries,colors){return {type:'doughnut',data:{labels:entries.map(e=>e[0]),datasets:[{data:entries.map(e=>Math.round(e[1]*100)/100),backgroundColor:colors,borderWidth:0}]},options:{...CHOPT,cutout:'55%'}};}
async function buildDash(y){
  killCharts();
  if(y==='gen')return buildDashGen();
  const rows=await dashRows(y);
  const sale=rows.filter(SALE);
  const cy=String(new Date().getFullYear());const isCur=y===cy;
  const now=new Date();
  const incassi=sale.reduce((s,o)=>s+(o.prezzo||0),0);
  const spese=rows.reduce((s,o)=>s+(o.spese||0),0);
  const conPrezzo=sale.filter(o=>o.prezzo!==null&&o.prezzo!==undefined);
  const pm=conPrezzo.length?incassi/conPrezzo.length:0;
  const completati=rows.filter(o=>o.status==='completato').length;
  const proiezione=rows.filter(o=>o.status==='in corso'&&o.pagato!=='Pagato').reduce((s,o)=>s+(o.prezzo||0),0);
  const mIdx=now.getMonth();
  const mese=o=>o.data?parseInt(o.data.slice(5,7))-1:null;
  const meseCur=sale.filter(o=>mese(o)===mIdx);
  const oggi=sale.filter(o=>o.data===today());
  const inCorso=rows.filter(o=>o.status==='in corso');
  const daPagare=rows.filter(o=>o.pagato==='Da pagare'&&o.status!=='potenziali');

  const kpis=[
    ['Incassi '+y,fmtEUR(incassi),''],
    ['Stima spese',fmtEUR(spese),''],
    ['Guadagni',fmtEUR(incassi-spese),''],
    ['Prezzo medio '+y,fmtEUR(pm,2),conPrezzo.length+' ordini con prezzo'],
    ['Ordini completati',String(completati),''],
    ['Proiezione incassi',fmtEUR(proiezione),'lavori in corso non ancora pagati'],
  ];
  const kpis2=isCur?[
    ['Incassi '+MESI[mIdx],fmtEUR(meseCur.reduce((s,o)=>s+(o.prezzo||0),0)),''],
    ['Ordini '+MESI[mIdx],String(meseCur.length),''],
    ['Prezzo medio '+MESI[mIdx],fmtEUR(meseCur.length?meseCur.reduce((s,o)=>s+(o.prezzo||0),0)/Math.max(meseCur.filter(o=>o.prezzo!=null).length,1):0,2),''],
    ['Spese '+MESI[mIdx],fmtEUR(meseCur.reduce((s,o)=>s+(o.spese||0),0)),''],
    ['Incassi di oggi',fmtEUR(oggi.reduce((s,o)=>s+(o.prezzo||0),0)),oggi.length+' ordini'],
    ['In corso ora',String(inCorso.length),daPagare.length+' da pagare'],
  ]:[];

  const body=$('#dashbody');
  body.innerHTML=`
    ${kpis.map(k=>`<div class="card kpi"><h3>${k[0]}</h3><div class="big">${k[1]}</div><div class="sub">${k[2]}</div></div>`).join('')}
    ${kpis2.map(k=>`<div class="card kpi"><h3>${k[0]}</h3><div class="big" style="font-size:21px">${k[1]}</div><div class="sub">${k[2]}</div></div>`).join('')}
    <div class="card w4" id="notecard"><h3>Note ${y}</h3><textarea id="noteta" placeholder="Appunti dell'anno…"></textarea></div>
    <div class="card w4"><h3>Demografia</h3><div class="chartbox"><canvas id="ch_demo"></canvas></div></div>
    <div class="card w4"><h3>Reparti</h3><div class="chartbox"><canvas id="ch_rep"></canvas></div></div>
    <div class="card w4"><h3>Lenti</h3><div class="chartbox"><canvas id="ch_lenti"></canvas></div></div>
    <div class="card w4"><h3>Ordini per clientela</h3><div class="chartbox"><canvas id="ch_cli"></canvas></div></div>
    <div class="card w4"><h3>Ordini vs Esposto (sellout)</h3><div class="chartbox"><canvas id="ch_sell"></canvas></div></div>
    <div class="card w6"><h3>Spesa per età</h3><div class="chartbox"><canvas id="ch_eta"></canvas></div></div>
    <div class="card w6"><h3>Vendite per reparto (per demografia)</h3><div class="chartbox"><canvas id="ch_repdemo"></canvas></div></div>
    <div class="card w12"><h3 style="display:flex;align-items:center;gap:10px">Incassi nel tempo per reparto
      <span class="granbtns"><button class="chip ${GRAN==='D'?'active':''}" data-g="D">Giorno</button><button class="chip ${GRAN==='W'?'active':''}" data-g="W">Settimana</button><button class="chip ${GRAN==='M'?'active':''}" data-g="M">Mese</button></span></h3>
      <div class="chartbox"><canvas id="ch_mesrep"></canvas></div></div>
    <div class="card w6"><h3>Riepilogo mensile</h3><table class="mtable" id="mtable"></table></div>
    <div class="card w6"><h3>Ordini per età nel tempo</h3><div class="chartbox"><canvas id="ch_etames"></canvas></div></div>
    <div class="card w6"><h3>Incassi per clientela per reparto</h3><div class="chartbox"><canvas id="ch_clirep"></canvas></div></div>
    <div class="card w6"><h3>UpSell</h3><div class="chartbox"><canvas id="ch_upsell"></canvas></div></div>`;

  // note
  const ta=$('#noteta');
  api('note?year='+y).then(r=>{ta.value=r.note||'';});
  let _nt;ta.addEventListener('input',()=>{clearTimeout(_nt);_nt=setTimeout(async()=>{await api('note',{method:'PUT',body:JSON.stringify({year:y,text:ta.value})});toast('Note salvate ✓');},800);});

  // pies
  const demo=groupSum(sale,o=>o.demografia,o=>1);
  addChart('ch_demo',pieCfg(demo,colorsFor('demografia',demo.map(e=>e[0]))));
  const rep=groupSum(sale,o=>o.reparto,o=>1);
  addChart('ch_rep',pieCfg(rep,colorsFor('reparto',rep.map(e=>e[0]))));
  const len=groupSum(sale,o=>jarr(o.lenti),o=>1);
  addChart('ch_lenti',pieCfg(len,colorsFor('lenti',len.map(e=>e[0]))));
  const cli=groupSum(sale,o=>o.clientela,o=>1);
  addChart('ch_cli',pieCfg(cli,colorsFor('clientela',cli.map(e=>e[0]))));
  const sell=groupSum(sale,o=>o.sellout,o=>1);
  addChart('ch_sell',pieCfg(sell,colorsFor('sellout',sell.map(e=>e[0]))));
  // spesa per età
  const eta=groupSum(sale,o=>jarr(o.eta),o=>o.prezzo||0);
  addChart('ch_eta',{type:'bar',data:{labels:eta.map(e=>e[0]),datasets:[{label:'Prezzo €',data:eta.map(e=>Math.round(e[1])),backgroundColor:colorsFor('eta',eta.map(e=>e[0]))}]},options:{...CHOPT,plugins:{legend:{display:false}},scales:{x:{ticks:{color:'#98a1aa'},grid:{color:'#2a2f36'}},y:{ticks:{color:'#98a1aa'},grid:{color:'#2a2f36'}}}}});
  // vendite per reparto stacked demografia
  const reps=[...new Set(sale.map(o=>o.reparto||'(vuoto)'))];
  const demos=[...new Set(sale.map(o=>o.demografia||'(vuoto)'))];
  addChart('ch_repdemo',{type:'bar',data:{labels:reps,datasets:demos.map((d,i)=>({label:d,backgroundColor:optColor('demografia',d)||PALETTE[i%PALETTE.length],data:reps.map(r=>sale.filter(o=>(o.reparto||'(vuoto)')===r&&(o.demografia||'(vuoto)')===d).length)}))},options:{...CHOPT,scales:{x:{stacked:true,ticks:{color:'#98a1aa'},grid:{color:'#2a2f36'}},y:{stacked:true,ticks:{color:'#98a1aa'},grid:{color:'#2a2f36'}}}}});
  // incassi nel tempo per reparto (granularità variabile)
  const repAll=[...new Set(sale.map(o=>o.reparto||'(vuoto)'))];
  renderRepTime(sale,repAll,y);
  body.querySelectorAll('.granbtns .chip').forEach(b=>b.addEventListener('click',()=>{
    GRAN=b.dataset.g;savePrefs();
    body.querySelectorAll('.granbtns .chip').forEach(x=>x.classList.toggle('active',x.dataset.g===GRAN));
    renderRepTime(sale,repAll,y);
  }));
  // tabella mensile
  let tot={n:0,inc:0};
  $('#mtable').innerHTML=`<tr><th>Mese</th><th>Ordini</th><th>Incassi</th><th>Prezzo medio</th></tr>`+
    MESI.map((m,i)=>{
      const mm=sale.filter(o=>mese(o)===i);const inc=mm.reduce((s,o)=>s+(o.prezzo||0),0);
      const np=mm.filter(o=>o.prezzo!=null).length;
      tot.n+=mm.length;tot.inc+=inc;
      return `<tr><td>${m}</td><td>${mm.length}</td><td>${fmtEUR(inc)}</td><td>${np?fmtEUR(inc/np,2):'—'}</td></tr>`;
    }).join('')+`<tr><td>Totale</td><td>${tot.n}</td><td>${fmtEUR(tot.inc)}</td><td></td></tr>`;
  // ordini per età nel tempo
  const etas=[...new Set(sale.flatMap(o=>jarr(o.eta)))];
  addChart('ch_etames',{type:'bar',data:{labels:MESI,datasets:etas.map((e,i)=>({label:e,backgroundColor:optColor('eta',e)||PALETTE[i%PALETTE.length],data:MESI.map((_,m)=>sale.filter(o=>mese(o)===m&&jarr(o.eta).includes(e)).length)}))},options:{...CHOPT,scales:{x:{stacked:true,ticks:{color:'#98a1aa'},grid:{color:'#2a2f36'}},y:{stacked:true,ticks:{color:'#98a1aa'},grid:{color:'#2a2f36'}}}}});
  // incassi per clientela per reparto
  const clis=[...new Set(sale.map(o=>o.clientela||'(vuoto)'))];
  addChart('ch_clirep',{type:'bar',data:{labels:clis,datasets:repAll.map((r,i)=>({label:r,backgroundColor:optColor('reparto',r)||PALETTE[i%PALETTE.length],data:clis.map(c=>Math.round(sale.filter(o=>(o.clientela||'(vuoto)')===c&&(o.reparto||'(vuoto)')===r).reduce((s,o)=>s+(o.prezzo||0),0)))}))},options:{...CHOPT,scales:{x:{stacked:true,ticks:{color:'#98a1aa'},grid:{color:'#2a2f36'}},y:{stacked:true,ticks:{color:'#98a1aa'},grid:{color:'#2a2f36'}}}}});
  // upsell
  const ups=groupSum(sale,o=>jarr(o.upsell).filter(x=>x!=='No'),o=>1).filter(e=>e[0]!=='(vuoto)');
  addChart('ch_upsell',{type:'bar',data:{labels:ups.map(e=>e[0]),datasets:[{label:'Ordini',data:ups.map(e=>e[1]),backgroundColor:colorsFor('upsell',ups.map(e=>e[0]))}]},options:{...CHOPT,plugins:{legend:{display:false}},scales:{x:{ticks:{color:'#98a1aa'},grid:{color:'#2a2f36'}},y:{ticks:{color:'#98a1aa'},grid:{color:'#2a2f36'}}}}});
}

boot();


/* ---------- COLONNE: resize + drag ---------- */
function bindHeader(root){
  root.querySelectorAll('th .rz').forEach(h=>{
    h.addEventListener('mousedown',e=>{
      e.preventDefault();e.stopPropagation();
      const k=h.dataset.k;const startX=e.clientX;
      const col=LCOLS.find(c=>c.k===k);
      const startW=COLW[k]||(k==='name'?290:defW(col));
      function mv(ev){COLW[k]=Math.max(60,startW+ev.clientX-startX);
        document.querySelectorAll('table.grid').forEach(t=>{
          const idx=k==='name'?0:effCols().findIndex(c=>c.k===k)+1;
          const cg=t.querySelectorAll('colgroup col');if(cg[idx])cg[idx].style.width=COLW[k]+'px';
        });}
      function up(){document.removeEventListener('mousemove',mv);document.removeEventListener('mouseup',up);saveCols();renderList();}
      document.addEventListener('mousemove',mv);document.addEventListener('mouseup',up);
    });
    h.addEventListener('click',e=>e.stopPropagation());
  });
  root.querySelectorAll('.srt').forEach(sb=>{
    sb.addEventListener('click',e=>{
      e.stopPropagation();
      const k=sb.dataset.k;
      if(!SORT||SORT.k!==k)SORT={k,dir:1};
      else if(SORT.dir===1)SORT={k,dir:-1};
      else SORT=null;
      savePrefs();renderList();
    });
  });
  root.querySelectorAll('th.fth').forEach(th=>{
    th.addEventListener('click',e=>{
      if(e.target.classList.contains('rz'))return;
      const c=LCOLS.find(x=>x.k===th.dataset.k);
      if(c)openHeaderFilter(th,c);
    });
  });
  let dragK=null;
  root.querySelectorAll('th[draggable]').forEach(th=>{
    th.addEventListener('dragstart',e=>{dragK=th.dataset.k;e.dataTransfer.effectAllowed='move';});
    th.addEventListener('dragover',e=>{e.preventDefault();th.classList.add('dragover');});
    th.addEventListener('dragleave',()=>th.classList.remove('dragover'));
    th.addEventListener('drop',e=>{
      e.preventDefault();th.classList.remove('dragover');
      const target=th.dataset.k;if(!dragK||dragK===target)return;
      const ord=(COLORD||effCols().map(c=>c.k)).filter(k=>k!==dragK);
      ord.splice(ord.indexOf(target),0,dragK);
      COLORD=ord;saveCols();renderList();
    });
  });
}

/* ---------- AZIONI MULTIPLE ---------- */
function renderBulkbar(){
  const b=$('#bulkbar');
  if(!SELECTED.size){b.classList.add('hidden');return;}
  b.classList.remove('hidden');
  b.innerHTML=`<b>${SELECTED.size} selezionat${SELECTED.size===1?'o':'i'}</b>
    <button class="btn small" id="bstato">Stato ▾</button>
    <button class="btn small" id="bcampo">Modifica campo ▾</button>
    <button class="btn small danger" id="bdel">🗑 Elimina</button>
    <button class="btn small" id="bclear">✕</button>`;
  $('#bclear').onclick=()=>{SELECTED.clear();renderList();renderBulkbar();};
  $('#bdel').onclick=async()=>{
    if(!confirm(`Eliminare definitivamente ${SELECTED.size} ordini?`))return;
    const ids=[...SELECTED];let n=0;
    toast('Elimino…');
    for(const id of ids){try{const r=await api('orders/'+id,{method:'DELETE'});if(r.ok)n++;}catch(e){}}
    SELECTED.clear();DASHCACHE={};await loadOrders();renderBulkbar();toast(`${n} eliminati ✓`);
  };
  $('#bstato').onclick=()=>{
    closePop();const p=$('#pop');
    p.innerHTML='<div class="plist">'+CAT.statuses.map(st=>`<div class="opt" data-n="${esc(st.name)}"><span class="sw" style="background:${st.color}"></span>${esc(st.name)}</div>`).join('')+'</div>';
    p.querySelectorAll('.opt').forEach(el=>el.addEventListener('click',()=>bulkApply({status:el.dataset.n})));
    placePop($('#bstato'));
  };
  $('#bcampo').onclick=()=>{
    closePop();const p=$('#pop');
    p.innerHTML='<div class="plist">'+LCOLS.filter(c=>c.type!=='calc').map(c=>`<div class="opt" data-k="${c.k}"><span class="sw" style="background:#556"></span>${c.label}</div>`).join('')+'</div>';
    p.querySelectorAll('.opt').forEach(el=>el.addEventListener('click',()=>bulkFieldEditor(LCOLS.find(c=>c.k===el.dataset.k))));
    placePop($('#bcampo'));
  };
}
function bulkFieldEditor(col){
  closePop();const p=$('#pop');const anchor=$('#bcampo');
  if(col.type==='check'){
    p.innerHTML='<div class="plist"><div class="opt" data-v="1"><span class="sw" style="background:#2ecd6f"></span>✅ Sì</div><div class="opt" data-v="0"><span class="sw" style="background:#556"></span>☐ No</div></div>';
    p.querySelectorAll('.opt').forEach(el=>el.addEventListener('click',()=>bulkApply({[col.k]:+el.dataset.v})));
    placePop(anchor);return;
  }
  if(col.type==='date'){
    p.innerHTML=`<input type="date"><div class="pactions"><button class="btn small" id="bvuoto">Svuota</button><button class="btn small primary" id="bok">Applica a tutti</button></div>`;
    placePop(anchor);
    p.querySelector('#bok').onclick=()=>bulkApply({[col.k]:p.querySelector('input').value||null});
    p.querySelector('#bvuoto').onclick=()=>bulkApply({[col.k]:null});
    return;
  }
  if(col.type==='money'||col.type==='text'){
    p.innerHTML=`<input type="${col.type==='money'?'number':'text'}" step="0.01" class="free" placeholder="${col.label}"><div class="pactions"><button class="btn small" id="bvuoto">Svuota</button><button class="btn small primary" id="bok">Applica a tutti</button></div>`;
    placePop(anchor);const inp=p.querySelector('input');inp.focus();
    p.querySelector('#bok').onclick=()=>bulkApply({[col.k]:col.type==='money'?(inp.value===''?null:Number(inp.value)):inp.value});
    p.querySelector('#bvuoto').onclick=()=>bulkApply({[col.k]:col.type==='money'?null:''});
    return;
  }
  // select o labels
  const opts=col.k==='tags'?tagOptions():(col.cat?CAT.fields[col.cat].options:[]);
  const multi=col.type==='labels';
  let sel=[];
  p.innerHTML=`<input class="psearch" placeholder="Cerca…"><div class="plist"></div>
    <div class="pactions"><button class="btn small" id="bvuoto">Svuota campo</button>${multi?'<button class="btn small primary" id="bok">Applica a tutti</button>':''}</div>`;
  const list=p.querySelector('.plist'),search=p.querySelector('.psearch');
  function draw(){
    const f=search.value.toLowerCase();
    list.innerHTML=opts.filter(op=>op.n.toLowerCase().includes(f)).slice(0,200).map(op=>{
      const on=sel.includes(op.n);
      return `<div class="opt ${on?'sel':''}" data-n="${esc(op.n)}"><span class="sw" style="background:${op.c||'#556'}"></span>${multi?(on?'☑ ':'☐ '):''}${esc(op.n)}</div>`;
    }).join('');
    list.querySelectorAll('.opt').forEach(el=>el.addEventListener('click',()=>{
      const n=el.dataset.n;
      if(!multi)return bulkApply({[col.k]:n});
      if(sel.includes(n))sel=sel.filter(x=>x!==n);else sel.push(n);draw();
    }));
  }
  if(multi)p.querySelector('#bok').onclick=()=>bulkApply({[col.k]:JSON.stringify(sel)});
  p.querySelector('#bvuoto').onclick=()=>bulkApply({[col.k]:multi?'[]':''});
  search.addEventListener('input',draw);placePop(anchor);draw();search.focus();
}
async function bulkApply(patch){
  closePop();
  const ids=[...SELECTED];let n=0;
  toast('Applico a '+ids.length+' ordini…');
  for(const id of ids){
    try{const r=await api('orders/'+id,{method:'PATCH',body:JSON.stringify(patch)});if(r.ok){n++;const o=ORDERS.find(x=>x.id===id);if(o)Object.assign(o,r.order);}}catch(e){}
  }
  DASHCACHE={};renderList();renderBulkbar();toast(`${n} ordini aggiornati ✓`);
}
/* ---------- FILTRI DI COLONNA ---------- */
function openHeaderFilter(anchor,c){
  closePop();const p=$('#pop');
  const base=ORDERS;
  const counts=new Map();
  for(const o of base)for(const v of valOf(o,c))counts.set(v,(counts.get(v)||0)+1);
  const vals=[...counts.entries()].sort((a,b)=>b[1]-a[1]);
  const cur=FILTERS[c.k]||new Set();
  p.innerHTML=`<input class="psearch" placeholder="Filtra ${esc(c.label)}…"><div class="plist"></div>
    <div class="pactions"><button class="btn small" id="fclear">Pulisci</button><button class="btn small primary" id="fok">Fatto</button></div>`;
  const list=p.querySelector('.plist'),search=p.querySelector('.psearch');
  function draw(){
    const f=search.value.toLowerCase();
    list.innerHTML=vals.filter(([v])=>v.toLowerCase().includes(f)).slice(0,250).map(([v,n])=>{
      const on=cur.has(v);
      const col=c.cat?optColor(c.cat,v):null;
      return `<div class="opt ${on?'sel':''}" data-v="${esc(v)}"><span class="sw" style="background:${col||'#556'}"></span>${on?'☑':'☐'} ${esc(v)} <span style="margin-left:auto;color:var(--mut);font-size:11.5px">${n}</span></div>`;
    }).join('')||'<div class="opt">Nessun valore</div>';
    list.querySelectorAll('.opt[data-v]').forEach(el=>el.addEventListener('click',()=>{
      const v=el.dataset.v;
      if(cur.has(v))cur.delete(v);else cur.add(v);
      FILTERS[c.k]=cur;renderList();draw();
    }));
  }
  p.querySelector('#fclear').onclick=()=>{delete FILTERS[c.k];renderList();closePop();};
  p.querySelector('#fok').onclick=()=>closePop();
  search.addEventListener('input',draw);
  placePop(anchor);draw();search.focus();
}

/* ---------- IMPOSTAZIONI (cataloghi + automazioni) ---------- */
const PALCOLORS=['#e50000','#E65100','#ff7800','#f9d900','#FCDC51','#f4a832','#AF7E2E','#2ecd6f','#6bc950','#1bbc9c','#10E742','#24B873','#02BCD4','#04A9F4','#35a7ff','#0231E8','#3082B7','#81B1FF','#5f55ee','#7C4DFF','#8E01FC','#9b59b6','#bf55ec','#EA80FC','#f900ea','#FF4081','#FF7FAB','#7f1a35','#800000','#334a34','#667684','#b5bcc2','#98a1aa','#3e454d'];
function openSettings(tab){
  const m=$('#modal');m.classList.remove('hidden');
  m.innerHTML=`<div class="mbox"><div class="mhead">
    <div class="tabs"><button data-t="campi" class="${!tab||tab==='campi'?'active':''}">Campi e opzioni</button><button data-t="auto" class="${tab==='auto'?'active':''}">Automazioni</button><button data-t="colonne" class="${tab==='colonne'?'active':''}">Colonne</button><button data-t="backup" class="${tab==='backup'?'active':''}">Backup</button></div>
    <button class="btn small" id="mclose">✕</button></div><div class="mbody" id="mbody"></div></div>`;
  m.querySelector('#mclose').onclick=()=>{closePop();m.classList.add('hidden');};
  m.addEventListener('mousedown',e=>{if(e.target===m)m.classList.add('hidden');},{once:true});
  m.querySelectorAll('.mhead .tabs button').forEach(b=>b.addEventListener('click',()=>openSettings(b.dataset.t)));
  if(tab==='auto')renderAutoTab();else if(tab==='backup')renderBackupTab();else if(tab==='colonne')renderColsTab();else renderFieldsTab();
}
$('#setbtn').addEventListener('click',()=>openSettings());

function renderFieldsTab(){
  const body=$('#mbody');
  const fields=[['status','Stati lista'],...Object.entries(CAT.fields).map(([k,v])=>[k,v.label])];
  if(!renderFieldsTab.sel)renderFieldsTab.sel='status';
  const sel=renderFieldsTab.sel;
  const opts=sel==='status'?CAT.statuses.map(s=>({n:s.name,c:s.color,_st:true})):(sel==='tags'?tagOptions():CAT.fields[sel].options);
  body.innerHTML=`<div class="fieldchips">${fields.map(([k,l])=>`<button class="chip ${sel===k?'active':''}" data-k="${k}">${l}</button>`).join('')}</div>
    <div class="optlist" id="optlist">${opts.map((o,i)=>`
      <div class="optrow" data-i="${i}">
        <button class="sw big" data-i="${i}" style="background:${o.c||'#556'}"></button>
        <input class="oname" data-i="${i}" value="${esc(o.n)}">
        <button class="btn small odel" data-i="${i}" title="Elimina">🗑</button>
      </div>`).join('')}
    </div>
    <div class="optadd"><input id="newopt" placeholder="Nuova opzione…"><button class="btn small primary" id="addopt">Aggiungi</button></div>
    <div class="mnote">Il colore si cambia cliccando il quadratino. Rinominando un'opzione, tutti gli ordini vengono aggiornati.</div>`;
  body.querySelectorAll('.fieldchips .chip').forEach(c=>c.addEventListener('click',()=>{renderFieldsTab.sel=c.dataset.k;renderFieldsTab();}));
  async function saveCat(){await api('catalogs',{method:'PUT',body:JSON.stringify({catalogs:CAT})});toast('Salvato ✓');renderList();}
  body.querySelectorAll('.sw.big').forEach(swb=>swb.addEventListener('click',()=>{
    const i=+swb.dataset.i;
    closePop();const p=$('#pop');
    p.innerHTML=`<div class="palette">${PALCOLORS.map(c=>`<button class="sw big" data-c="${c}" style="background:${c}"></button>`).join('')}</div>
      <div class="pactions"><input id="hexin" placeholder="#esadecimale" style="width:110px">${'sel'==='status'?'':''}<button class="btn small primary" id="hexok">Ok</button></div>`;
    placePop(swb);
    p.querySelectorAll('.palette .sw').forEach(b=>b.addEventListener('click',async()=>{
      if(sel==='status')CAT.statuses[i].color=b.dataset.c;
      else{let co=CAT.fields[sel].options.find(o=>o.n===opts[i].n);if(!co){co={n:opts[i].n};CAT.fields[sel].options.push(co);}co.c=b.dataset.c;}
      closePop();await saveCat();renderFieldsTab();
    }));
    p.querySelector('#hexok').onclick=async()=>{
      const v=p.querySelector('#hexin').value.trim();
      if(/^#[0-9a-fA-F]{3,8}$/.test(v)){if(sel==='status')CAT.statuses[i].color=v;else{let co=CAT.fields[sel].options.find(o=>o.n===opts[i].n);if(!co){co={n:opts[i].n};CAT.fields[sel].options.push(co);}co.c=v;}closePop();await saveCat();renderFieldsTab();}
    };
  }));
  body.querySelectorAll('.oname').forEach(inp=>inp.addEventListener('change',async()=>{
    const i=+inp.dataset.i;const from=sel==='status'?CAT.statuses[i].name:opts[i].n;const to=inp.value.trim();
    if(!to||to===from)return;
    await api('catalogs/rename',{method:'POST',body:JSON.stringify({field:sel,from,to})});
    if(sel==='status')CAT.statuses[i].name=to;
    else{const co=CAT.fields[sel].options.find(o=>o.n===from);if(co)co.n=to;else if(sel!=='tags')CAT.fields[sel].options[i].n=to;}
    await saveCat();await loadOrders();toast('Rinominato ovunque ✓');
  }));
  body.querySelectorAll('.odel').forEach(b=>b.addEventListener('click',async()=>{
    const i=+b.dataset.i;const nm=sel==='status'?CAT.statuses[i].name:opts[i].n;
    if(sel==='status'&&CAT.statuses.length<=2)return alert('Servono almeno 2 stati.');
    if(sel==='tags'){
      const n=ORDERS.filter(o=>jarr(o.tags).includes(nm)).length;
      if(!confirm(`Eliminare il tag «${nm}»? Verrà rimosso da tutti gli ordini che lo usano${n?` (almeno ${n} visibili)`:''}.`))return;
      await api('catalogs/rename',{method:'POST',body:JSON.stringify({field:'tags',from:nm,to:''})});
      CAT.fields.tags.options=CAT.fields.tags.options.filter(o=>o.n!==nm);
      await saveCat();await loadOrders();renderFieldsTab();return;
    }
    if(!confirm(`Eliminare l'opzione «${nm}» dal catalogo? Gli ordini che la usano manterranno il valore.`))return;
    if(sel==='status')CAT.statuses.splice(i,1);else CAT.fields[sel].options.splice(i,1);
    await saveCat();renderFieldsTab();
  }));
  body.querySelector('#addopt').onclick=async()=>{
    const v=body.querySelector('#newopt').value.trim();if(!v)return;
    if(sel==='status')CAT.statuses.splice(CAT.statuses.length-2,0,{name:v,color:'#98a1aa',type:'custom'});
    else CAT.fields[sel].options.push({n:v});
    await saveCat();renderFieldsTab();
  };
}

/* ---------- AUTOMAZIONI ---------- */
const AFIELDS=()=>[['status','Stato lista'],['due_date','Scadenza'],['data','Data'],...Object.entries(CAT.fields).map(([k,v])=>[k,v.label]),['prezzo','Prezzo'],['spese','Spese'],['telefono','Telefono']];
function autoSummary(a){
  const t=a.trigger;
  const tt=t.type==='create'?'alla creazione':t.type==='status_change'?`stato → ${(t.to||[]).join(', ')||'qualsiasi'}`:`${(CAT.fields[t.field]||{label:t.field}).label} → ${t.to||'qualsiasi'}`;
  const ac=(a.actions||[]).map(x=>`${x.type==='set_status'?'Stato lista':(CAT.fields[x.field]||{label:x.field}).label} = ${x.value==='@oggi'?'oggi':x.value}`).join(' · ');
  return `Quando ${tt} ⇒ ${ac}`;
}
function renderAutoTab(){
  const body=$('#mbody');
  body.innerHTML=`<div id="autolist">${AUTOS.map((a,i)=>`
    <div class="autorow">
      <label class="switch"><input type="checkbox" data-i="${i}" ${a.active?'checked':''}><span></span></label>
      <div class="autoinfo"><b>${esc(a.name)}</b><div class="mut">${esc(autoSummary(a))}</div></div>
      <button class="btn small aedit" data-i="${i}">Modifica</button>
      <button class="btn small adel" data-i="${i}">🗑</button>
    </div>`).join('')||'<div class="mut" style="padding:20px">Nessuna automazione.</div>'}</div>
    <button class="btn primary" id="addauto" style="margin:14px">+ Nuova automazione</button>`;
  async function save(){await api('automations',{method:'PUT',body:JSON.stringify({automations:AUTOS})});toast('Automazioni salvate ✓');}
  body.querySelectorAll('.switch input').forEach(c=>c.addEventListener('change',async()=>{AUTOS[+c.dataset.i].active=c.checked;await save();}));
  body.querySelectorAll('.adel').forEach(b=>b.addEventListener('click',async()=>{
    if(!confirm('Eliminare questa automazione?'))return;AUTOS.splice(+b.dataset.i,1);await save();renderAutoTab();
  }));
  body.querySelectorAll('.aedit').forEach(b=>b.addEventListener('click',()=>editAuto(+b.dataset.i)));
  body.querySelector('#addauto').onclick=()=>{
    AUTOS.push({id:'a'+Date.now(),name:'Nuova automazione',active:true,trigger:{type:'create'},actions:[{type:'set_field',field:'pagato',value:'Da pagare'}]});
    editAuto(AUTOS.length-1);
  };
}
function editAuto(i){
  const a=AUTOS[i];const body=$('#mbody');const t=a.trigger;
  const fieldOpts=(selK)=>AFIELDS().map(([k,l])=>`<option value="${k}" ${selK===k?'selected':''}>${l}</option>`).join('');
  body.innerHTML=`<div class="aedit-form">
    <div class="frow"><label>Nome</label><input id="aname" value="${esc(a.name)}" style="flex:1"></div>
    <div class="frow"><label>Quando</label>
      <select id="atype">
        <option value="create" ${t.type==='create'?'selected':''}>Viene creato un ordine</option>
        <option value="status_change" ${t.type==='status_change'?'selected':''}>Lo stato lista cambia in…</option>
        <option value="field_change" ${t.type==='field_change'?'selected':''}>Un campo cambia in…</option>
      </select></div>
    <div class="frow ${t.type!=='status_change'?'hidden':''}" id="rowStati"><label>Stati destinazione</label>
      <div id="astati">${CAT.statuses.map(s=>`<label class="ck"><input type="checkbox" value="${esc(s.name)}" ${(t.to||[]).includes(s.name)?'checked':''}> ${esc(s.name)}</label>`).join('')}</div></div>
    <div class="frow ${t.type!=='field_change'?'hidden':''}" id="rowCampo"><label>Campo</label>
      <select id="afield">${Object.entries(CAT.fields).map(([k,v])=>`<option value="${k}" ${t.field===k?'selected':''}>${v.label}</option>`).join('')}</select>
      <label style="width:auto">diventa</label><input id="afval" value="${esc(t.to||'')}" placeholder="valore (vuoto = qualsiasi)" style="flex:1"></div>
    <h3 style="margin:16px 0 8px;color:var(--mut)">Allora imposta:</h3>
    <div id="aactions">${(a.actions||[]).map((x,j)=>`
      <div class="frow arow" data-j="${j}">
        <select class="af">${fieldOpts(x.type==='set_status'?'status':x.field)}</select>
        <input class="av" value="${esc(x.value)}" placeholder="valore, oppure @oggi" style="flex:1">
        <button class="btn small ardel">✕</button>
      </div>`).join('')}</div>
    <button class="btn small" id="addact">+ azione</button>
    <div class="mnote">Suggerimento: usa <b>@oggi</b> come valore per inserire la data di attivazione.</div>
    <div class="pactions"><button class="btn" id="aback">Annulla</button><button class="btn primary" id="asave">Salva</button></div>
  </div>`;
  body.querySelector('#atype').addEventListener('change',e=>{
    body.querySelector('#rowStati').classList.toggle('hidden',e.target.value!=='status_change');
    body.querySelector('#rowCampo').classList.toggle('hidden',e.target.value!=='field_change');
  });
  body.querySelector('#addact').onclick=()=>{
    const div=document.createElement('div');div.className='frow arow';
    div.innerHTML=`<select class="af">${fieldOpts('pagato')}</select><input class="av" placeholder="valore, oppure @oggi" style="flex:1"><button class="btn small ardel">✕</button>`;
    body.querySelector('#aactions').appendChild(div);
    div.querySelector('.ardel').onclick=()=>div.remove();
  };
  body.querySelectorAll('.ardel').forEach(b=>b.onclick=()=>b.closest('.arow').remove());
  body.querySelector('#aback').onclick=()=>renderAutoTab();
  body.querySelector('#asave').onclick=async()=>{
    a.name=body.querySelector('#aname').value.trim()||'Automazione';
    const type=body.querySelector('#atype').value;
    if(type==='create')a.trigger={type:'create'};
    else if(type==='status_change')a.trigger={type:'status_change',to:[...body.querySelectorAll('#astati input:checked')].map(c=>c.value)};
    else a.trigger={type:'field_change',field:body.querySelector('#afield').value,to:body.querySelector('#afval').value.trim()};
    a.actions=[...body.querySelectorAll('.arow')].map(r=>{
      const f=r.querySelector('.af').value,v=r.querySelector('.av').value.trim();
      return f==='status'?{type:'set_status',value:v}:{type:'set_field',field:f,value:v};
    }).filter(x=>x.value!=='');
    await api('automations',{method:'PUT',body:JSON.stringify({automations:AUTOS})});
    toast('Automazione salvata ✓');renderAutoTab();
  };
}


/* ---------- incassi nel tempo per reparto (giorno/settimana/mese) ---------- */
let REPCHART=null;
function bucketKey(dstr){
  if(GRAN==='M')return dstr.slice(0,7);
  if(GRAN==='D')return dstr;
  const d=new Date(dstr+'T00:00');
  const day=(d.getDay()+6)%7; d.setDate(d.getDate()-day);
  return d.toISOString().slice(0,10);
}
function bucketLabel(k){
  if(GRAN==='M')return MESI[parseInt(k.slice(5,7))-1];
  const d=new Date(k+'T00:00');
  return d.getDate()+' '+MESI[d.getMonth()].toLowerCase();
}
function renderRepTime(sale,repAll,year){
  const withD=sale.filter(o=>o.data);
  const keys=[...new Set(withD.map(o=>bucketKey(o.data)))].sort();
  const data={};
  for(const o of withD){
    const k=bucketKey(o.data);const r=o.reparto||'(vuoto)';
    (data[r]=data[r]||{})[k]=(data[r][k]||0)+(o.prezzo||0);
  }
  const cfg={type:'bar',data:{labels:keys.map(bucketLabel),datasets:repAll.map((r,i)=>({label:r,backgroundColor:optColor('reparto',r)||PALETTE[i%PALETTE.length],data:keys.map(k=>Math.round((data[r]||{})[k]||0))}))},
    options:{...CHOPT,scales:{x:{stacked:true,ticks:{color:'#98a1aa',maxTicksLimit:GRAN==='D'?24:26,autoSkip:true},grid:{color:'#2a2f36'}},y:{stacked:true,ticks:{color:'#98a1aa'},grid:{color:'#2a2f36'}}}}};
  if(REPCHART){REPCHART.destroy();CHARTS=CHARTS.filter(c=>c!==REPCHART);}
  const ctx=document.getElementById('ch_mesrep');if(!ctx)return;
  REPCHART=new Chart(ctx,cfg);CHARTS.push(REPCHART);
}

/* ---------- DASHBOARD GENERALE ---------- */
async function buildDashGen(){
  const rows=await dashRows('all');
  const sale=rows.filter(SALE);
  const wd=sale.filter(o=>o.data);
  const incassi=sale.reduce((s,o)=>s+(o.prezzo||0),0);
  const spese=rows.reduce((s,o)=>s+(o.spese||0),0);
  const np=sale.filter(o=>o.prezzo!=null).length;
  // per mese assoluto
  const per={};
  for(const o of wd){const k=o.data.slice(0,7);per[k]=per[k]||{inc:0,n:0};per[k].inc+=(o.prezzo||0);per[k].n++;}
  const mk=Object.keys(per).sort();
  const best=mk.reduce((b,k)=>per[k].inc>(per[b]?.inc??-1)?k:b,mk[0]);
  // per anno
  const perY={};
  for(const o of wd){const y2=o.data.slice(0,4);perY[y2]=perY[y2]||{inc:0,n:0};perY[y2].inc+=(o.prezzo||0);perY[y2].n++;}
  const yk=Object.keys(perY).sort();
  const bestY=yk.reduce((b,k)=>perY[k].inc>(perY[b]?.inc??-1)?k:b,yk[0]);
  // stagionalità media
  const seas=Array.from({length:12},()=>({tot:0,anni:new Set()}));
  for(const o of wd){const m=parseInt(o.data.slice(5,7))-1;seas[m].tot+=(o.prezzo||0);seas[m].anni.add(o.data.slice(0,4));}
  // top modelli / stili
  const topMod=groupSum(sale.filter(o=>o.modello),o=>o.modello,o=>o.prezzo||0).slice(0,10);
  const topSti=groupSum(sale,o=>jarr(o.stile),o=>1).filter(e=>e[0]!=='(vuoto)').slice(0,10);
  const mesiLab=mk.map(k=>MESI[parseInt(k.slice(5,7))-1].toLowerCase()+' '+k.slice(2,4));
  const body=$('#dashbody');
  const kpis=[
    ['Incassi totali (dall\'apertura)',fmtEUR(incassi),wd.length?`${mk[0].slice(0,4)} → oggi`:''],
    ['Ordini totali',String(sale.length),''],
    ['Guadagni totali',fmtEUR(incassi-spese),'incassi − spese'],
    ['Prezzo medio storico',fmtEUR(np?incassi/np:0,2),np+' ordini con prezzo'],
    ['Mese record',best?`${MESI[parseInt(best.slice(5,7))-1]} ${best.slice(0,4)}`:'—',best?fmtEUR(per[best].inc):''],
    ['Anno migliore',bestY||'—',bestY?fmtEUR(perY[bestY].inc):''],
  ];
  body.innerHTML=`
    ${kpis.map(k=>`<div class="card kpi"><h3>${k[0]}</h3><div class="big" style="font-size:22px">${k[1]}</div><div class="sub">${k[2]}</div></div>`).join('')}
    <div class="card w12"><h3>Fatturato mensile dall'apertura a oggi</h3><div class="chartbox"><canvas id="g_mens"></canvas></div></div>
    <div class="card w6"><h3>Incassi per anno</h3><div class="chartbox"><canvas id="g_anni"></canvas></div></div>
    <div class="card w6"><h3>Stagionalità: media incassi per mese</h3><div class="chartbox"><canvas id="g_seas"></canvas></div></div>
    <div class="card w6"><h3>Top 10 modelli per incassi</h3><div class="chartbox"><canvas id="g_mod"></canvas></div></div>
    <div class="card w6"><h3>Top 10 stili più venduti</h3><div class="chartbox"><canvas id="g_sti"></canvas></div></div>
    <div class="card w4"><h3>Clientela storica</h3><div class="chartbox"><canvas id="g_cli"></canvas></div></div>
    <div class="card w4"><h3>Demografia storica</h3><div class="chartbox"><canvas id="g_demo"></canvas></div></div>
    <div class="card w4"><h3>Ordini per anno</h3><div class="chartbox"><canvas id="g_nord"></canvas></div></div>`;
  addChart('g_mens',{type:'bar',data:{labels:mesiLab,datasets:[{label:'Incassi €',data:mk.map(k=>Math.round(per[k].inc)),backgroundColor:'#f4a832'}]},options:{...CHOPT,plugins:{legend:{display:false}},scales:{x:{ticks:{color:'#98a1aa',maxTicksLimit:30,autoSkip:true},grid:{color:'#2a2f36'}},y:{ticks:{color:'#98a1aa'},grid:{color:'#2a2f36'}}}}});
  addChart('g_anni',{type:'bar',data:{labels:yk,datasets:[{label:'Incassi €',data:yk.map(k=>Math.round(perY[k].inc)),backgroundColor:'#35a7ff'}]},options:{...CHOPT,plugins:{legend:{display:false}},scales:{x:{ticks:{color:'#98a1aa'},grid:{color:'#2a2f36'}},y:{ticks:{color:'#98a1aa'},grid:{color:'#2a2f36'}}}}});
  addChart('g_seas',{type:'bar',data:{labels:MESI,datasets:[{label:'Media €',data:seas.map(x=>Math.round(x.tot/Math.max(x.anni.size,1))),backgroundColor:'#6bc950'}]},options:{...CHOPT,plugins:{legend:{display:false}},scales:{x:{ticks:{color:'#98a1aa'},grid:{color:'#2a2f36'}},y:{ticks:{color:'#98a1aa'},grid:{color:'#2a2f36'}}}}});
  addChart('g_mod',{type:'bar',data:{labels:topMod.map(e=>e[0]),datasets:[{label:'Incassi €',data:topMod.map(e=>Math.round(e[1])),backgroundColor:'#bf55ec'}]},options:{...CHOPT,indexAxis:'y',plugins:{legend:{display:false}},scales:{x:{ticks:{color:'#98a1aa'},grid:{color:'#2a2f36'}},y:{ticks:{color:'#98a1aa'},grid:{color:'#2a2f36'}}}}});
  addChart('g_sti',{type:'bar',data:{labels:topSti.map(e=>e[0]),datasets:[{label:'Ordini',data:topSti.map(e=>e[1]),backgroundColor:topSti.map((e,i)=>optColor('stile',e[0])||PALETTE[i%PALETTE.length])}]},options:{...CHOPT,indexAxis:'y',plugins:{legend:{display:false}},scales:{x:{ticks:{color:'#98a1aa'},grid:{color:'#2a2f36'}},y:{ticks:{color:'#98a1aa'},grid:{color:'#2a2f36'}}}}});
  const cli=groupSum(sale,o=>o.clientela,o=>1);
  addChart('g_cli',pieCfg(cli,colorsFor('clientela',cli.map(e=>e[0]))));
  const demo=groupSum(sale,o=>o.demografia,o=>1);
  addChart('g_demo',pieCfg(demo,colorsFor('demografia',demo.map(e=>e[0]))));
  addChart('g_nord',{type:'bar',data:{labels:yk,datasets:[{label:'Ordini',data:yk.map(k=>perY[k].n),backgroundColor:'#04A9F4'}]},options:{...CHOPT,plugins:{legend:{display:false}},scales:{x:{ticks:{color:'#98a1aa'},grid:{color:'#2a2f36'}},y:{ticks:{color:'#98a1aa'},grid:{color:'#2a2f36'}}}}});
}


function renderColsTab(){
  $('#mbody').innerHTML=`<p class="mnote" style="margin-bottom:12px">Spunta le colonne da mostrare nella lista. L'ordine si cambia trascinando le intestazioni, la larghezza trascinandone il bordo.</p>
    <div class="optlist">${LCOLS.map(c=>`<label class="optrow" style="cursor:pointer"><input type="checkbox" data-k="${c.k}" ${COLHIDE.has(c.k)?'':'checked'}> ${c.label}</label>`).join('')}</div>`;
  $('#mbody').querySelectorAll('input').forEach(ch=>ch.addEventListener('change',()=>{
    if(ch.checked)COLHIDE.delete(ch.dataset.k);else COLHIDE.add(ch.dataset.k);
    savePrefs();renderList();
  }));
}
function renderBackupTab(){
  $('#mbody').innerHTML=`
    <p style="margin-bottom:14px">Ogni <b>lunedì mattina</b> lo script Google collegato al tuo account salva un backup CSV completo su <b>Google Drive → CREO → CLIENTI</b> e cancella i backup più vecchi di 60 giorni.</p>
    <button class="btn primary" onclick="location.href='/api/export'">⬇ Scarica adesso il backup CSV completo</button>
    <p class="mnote" style="margin-top:16px">Gli ordini del sito positanoglasses.com entrano da soli nella lista (stato «in corso», tag ecommerce+shopify, clientela Web) appena un cliente compra.</p>`;
}
/* ---------- AI: crea ordini da testo libero ---------- */
$('#aibtn').addEventListener('click',()=>openAiModal());
function openAiModal(keepText){
  const m=$('#modal');m.classList.remove('hidden');
  m.innerHTML=`<div class="mbox aibox"><div class="mhead"><b>✨ Nuovi ordini con l'AI</b><button class="btn small" id="mclose">✕</button></div>
    <div class="mbody">
      <textarea id="aitext" placeholder="Scrivi qui uno o più ordini, in libertà. Esempio:

Marco Rossi, 322 ebano con lenti polarizzate verdi, 260 euro, pagato, turista, uomo boomer. Consegna venerdì.
Riparazione occhiale di Anna di Positano, 40 euro, da pagare, telefono 333 1234567.">${keepText?esc(keepText):''}</textarea>
      <div class="pactions"><button class="btn primary" id="aigo">Analizza ✨</button></div>
      <div class="mnote">L'AI compila i campi (reparto, modello, stile, prezzo, pagato…) e prima di creare gli ordini ti faccio controllare e modificare tutto.</div>
    </div></div>`;
  m.querySelector('#mclose').onclick=()=>m.classList.add('hidden');
  m.addEventListener('mousedown',e=>{if(e.target===m)m.classList.add('hidden');},{once:true});
  m.querySelector('#aigo').onclick=async()=>{
    const text=m.querySelector('#aitext').value.trim();if(!text)return;
    const body=m.querySelector('.mbody');
    body.innerHTML='<div class="aiwait"><span class="spin"></span> Sto leggendo gli ordini…</div>';
    let r;
    try{r=await api('ai-parse',{method:'POST',body:JSON.stringify({text})});}catch(e){r={ok:false,error:'errore di rete'};}
    if(!r.ok){body.innerHTML=`<div class="mnote" style="color:var(--danger)">${esc(r.error||'Errore')}</div><div class="pactions"><button class="btn" id="aiback">◀ Riprova</button></div>`;body.querySelector('#aiback').onclick=()=>openAiModal(text);return;}
    renderAiPreview(r.orders,text);
  };
}
function aiSel(k,cur,extra){
  const opts=k==='status'?CAT.statuses.map(s=>s.name):(CAT.fields[k]?.options||[]).map(o=>o.n);
  return `<select data-k="${k}"><option value=""></option>${opts.map(n=>`<option ${cur===n?'selected':''}>${esc(n)}</option>`).join('')}</select>`;
}
function renderAiPreview(orders,text){
  const body=$('#modal .mbody');
  if(!orders.length){body.innerHTML='<div class="mnote">Nessun ordine riconosciuto.</div><div class="pactions"><button class="btn" id="aiback">◀ Riscrivi</button></div>';body.querySelector('#aiback').onclick=()=>openAiModal(text);return;}
  body.innerHTML=orders.map((o,i)=>`<div class="aiprev" data-i="${i}">
    <div class="ahead"><input data-k="name" value="${esc(o.name||'')}" placeholder="Nome ordine"><button class="btn small aidel" title="Scarta">🗑</button></div>
    <div class="agrid">
      <div><label>Data</label><input type="date" data-k="data" value="${esc(o.data||today())}"></div>
      <div><label>Stato lista</label>${aiSel('status',o.status||'in corso')}</div>
      <div><label>Reparto</label>${aiSel('reparto',o.reparto||'')}</div>
      <div><label>Modello</label>${aiSel('modello',o.modello||'')}</div>
      <div><label>Prezzo €</label><input type="number" step="0.01" data-k="prezzo" value="${o.prezzo??''}"></div>
      <div><label>Spese €</label><input type="number" step="0.01" data-k="spese" value="${o.spese??''}"></div>
      <div><label>Pagato</label>${aiSel('pagato',o.pagato||'')}</div>
      <div><label>Clientela</label>${aiSel('clientela',o.clientela||'')}</div>
      <div><label>Demografia</label>${aiSel('demografia',o.demografia||'')}</div>
      <div><label>Età</label>${aiSel('eta',Array.isArray(o.eta)?o.eta[0]:(o.eta||''))}</div>
      <div><label>Sellout</label>${aiSel('sellout',o.sellout||'')}</div>
      <div><label>Stato lavorazione</label>${aiSel('stato_lav',o.stato_lav||'')}</div>
      <div><label>Stile (virgole)</label><input data-k="stile" value="${esc((o.stile||[]).join(', '))}"></div>
      <div><label>Lenti (virgole)</label><input data-k="lenti" value="${esc((o.lenti||[]).join(', '))}"></div>
      <div><label>UpSell (virgole)</label><input data-k="upsell" value="${esc((o.upsell||[]).join(', '))}"></div>
      <div><label>Tag (virgole)</label><input data-k="tags" value="${esc((o.tags||[]).join(', '))}"></div>
      <div><label>Telefono</label><input data-k="telefono" value="${esc(o.telefono||'')}"></div>
      <div><label>Scadenza</label><input type="date" data-k="due_date" value="${esc(o.due_date||'')}"></div>
      <div style="grid-column:1/-1"><label>Descrizione / note</label><input data-k="description" value="${esc(o.description||'')}"></div>
    </div></div>`).join('')+
    `<div class="pactions"><button class="btn" id="aiback">◀ Riscrivi</button><button class="btn primary" id="aicreate">Crea ${orders.length} ordini ✓</button></div>`;
  body.querySelectorAll('.aidel').forEach(b=>b.addEventListener('click',()=>{
    b.closest('.aiprev').remove();
    const left=body.querySelectorAll('.aiprev').length;
    const cb=body.querySelector('#aicreate');
    if(cb)cb.textContent=`Crea ${left} ordini ✓`;
  }));
  body.querySelector('#aiback').onclick=()=>openAiModal(text);
  body.querySelector('#aicreate').onclick=async()=>{
    const cards=[...body.querySelectorAll('.aiprev')];
    if(!cards.length)return;
    body.innerHTML='<div class="aiwait"><span class="spin"></span> Creo gli ordini…</div>';
    let n=0,fail=0;
    for(const card of cards){
      const g=k=>card.querySelector(`[data-k="${k}"]`)?.value?.trim()||'';
      const arr=k=>JSON.stringify(g(k).split(',').map(x=>x.trim()).filter(Boolean));
      const payload={name:g('name')||'Nuovo ordine',data:g('data')||null,due_date:g('due_date')||null,
        status:g('status')||'in corso',reparto:g('reparto'),modello:g('modello'),pagato:g('pagato'),
        clientela:g('clientela'),demografia:g('demografia'),sellout:g('sellout'),stato_lav:g('stato_lav'),
        eta:JSON.stringify(g('eta')?[g('eta')]:[]),stile:arr('stile'),lenti:arr('lenti'),upsell:arr('upsell'),tags:arr('tags'),
        telefono:g('telefono'),description:g('description'),
        prezzo:g('prezzo')===''?null:Number(g('prezzo')),spese:g('spese')===''?null:Number(g('spese'))};
      try{
        const r=await api('orders',{method:'POST',body:JSON.stringify(payload)});
        if(r.ok)n++;else fail++;
      }catch(e){fail++;}
    }
    $('#modal').classList.add('hidden');
    toast(fail?`${n} creati, ${fail} falliti — riprova`:`${n} ordini creati ✓`);DASHCACHE={};
    await loadOrders();
  };
}

if('serviceWorker' in navigator)navigator.serviceWorker.register('/sw.js').catch(()=>{});
