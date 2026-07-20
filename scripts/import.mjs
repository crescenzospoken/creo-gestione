// Import ClickUp CSV export(s) + JSON extras -> D1 seed SQL
import fs from 'fs';
import path from 'path';

const OUT = process.argv[2] || './seed';
const csvFiles = (process.env.CSV_FILES||'').split('|').filter(Boolean);
const basicJson = process.env.BASIC_JSON || '';
const fetchedJson = (process.env.FETCHED_JSON||'').split('|').filter(Boolean);
const catalogsPath = process.env.CATALOGS || '';

function parseCSV(text){
  const rows=[]; let row=[], cur='', inQ=false;
  for(let i=0;i<text.length;i++){
    const ch=text[i];
    if(inQ){
      if(ch==='"'){ if(text[i+1]==='"'){cur+='"';i++;} else inQ=false; }
      else cur+=ch;
    } else {
      if(ch==='"') inQ=true;
      else if(ch===','){ row.push(cur); cur=''; }
      else if(ch==='\n'){ row.push(cur); cur=''; rows.push(row); row=[]; }
      else if(ch==='\r'){ /*skip*/ }
      else cur+=ch;
    }
  }
  if(cur.length||row.length){ row.push(cur); rows.push(row); }
  return rows;
}
const MONTHS={january:1,february:2,march:3,april:4,may:5,june:6,july:7,august:8,september:9,october:10,november:11,december:12};
function parseDate(s){
  if(!s) return null;
  const m=/(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})\w*\s+(\d{4})/i.exec(s);
  if(!m) return null;
  const mm=String(MONTHS[m[1].toLowerCase()]).padStart(2,'0');
  return `${m[3]}-${mm}-${String(parseInt(m[2])).padStart(2,'0')}`;
}
function tsToISO(ms){ if(!ms) return null; const d=new Date(parseInt(ms)); if(isNaN(d)) return null; return d.toISOString().slice(0,10); }
function parseLabels(s){
  s=(s||'').trim(); if(!s||s==='[]') return [];
  if(s.startsWith('[')&&s.endsWith(']')) s=s.slice(1,-1);
  return s.split(',').map(x=>x.trim()).filter(Boolean);
}
function num(s){ if(s===undefined||s===null) return null; s=String(s).replace(/[€\s]/g,'').replace(',','.'); if(s==='') return null; const f=parseFloat(s); return isNaN(f)?null:f; }
function esc(s){ return String(s).replace(/'/g,"''"); }
function sqlVal(v){ if(v===null||v===undefined) return 'NULL'; if(typeof v==='number') return String(v); return `'${esc(v)}'`; }

const orders=new Map();
function put(row){ orders.set(row.id,{...(orders.get(row.id)||{}),...row}); }

// 1) basic json (all tasks, minimal fields) - lowest priority
if(basicJson){
  const arr=JSON.parse(fs.readFileSync(basicJson,'utf8'));
  for(const t of arr){
    put({ id:t.id, name:t.name||'', status:(t.status||'in corso').trim().toLowerCase(),
      tags:JSON.stringify((t.tags||[]).map(x=>x.name||x)),
      due_date:tsToISO(t.due_date), data:tsToISO(t.due_date),
      clickup_url:t.url||`https://app.clickup.com/t/${t.id}` });
  }
  console.log('basic:',arr.length);
}
// 2) CSV exports (rich) - override
let csvCount=0;
for(const f of csvFiles){
  const rows=parseCSV(fs.readFileSync(f,'utf8').replace(/^﻿/,''));
  const H=rows[0]; const idx={}; H.forEach((h,i)=>idx[h.trim()]=i);
  const col=(r,n)=>{const i=idx[n]; return i===undefined?'':(r[i]||'');};
  for(const r of rows.slice(1)){
    if(r.length<5) continue;
    const id=col(r,'Task ID').trim(); if(!id) continue;
    csvCount++;
    put({
      id, name:col(r,'Task Name').trim(), description:col(r,'Task Content'),
      status:col(r,'Status').trim().toLowerCase(),
      tags:JSON.stringify(parseLabels(col(r,'tags'))),
      due_date:parseDate(col(r,'Due Date')),
      date_created:parseDate(col(r,'Date Created')),
      date_done:parseDate(col(r,'Date Done'))||parseDate(col(r,'Date Closed')),
      data:parseDate(col(r,'Data (date)'))||parseDate(col(r,'Due Date'))||parseDate(col(r,'Date Created')),
      reparto:col(r,'Reparto (drop down)').trim(), clientela:col(r,'Clientela (drop down)').trim(),
      demografia:col(r,'Demografia (drop down)').trim(), modello:col(r,'Modello (drop down)').trim(),
      stato_lav:col(r,'Stato (drop down)').trim(), sentiment:col(r,'Sentiment (drop down)').trim(),
      pagato:col(r,'pagato (drop down)').trim(), sellout:col(r,'sellout (drop down)').trim(),
      telefono:col(r,'Telefono (phone)').trim(),
      prezzo:num(col(r,'Prezzo (currency)')), spese:num(col(r,'Spese (currency)')),
      tax_refund:/true|1|checked|yes/i.test(col(r,'TAX REFUND (checkbox)'))?1:0,
      stile:JSON.stringify(parseLabels(col(r,'Stile (labels)'))),
      lenti:JSON.stringify(parseLabels(col(r,'Lenti (labels)'))),
      upsell:JSON.stringify(parseLabels(col(r,'UpSell (labels)'))),
      eta:JSON.stringify(parseLabels(col(r,'età (labels)'))),
      clickup_url:`https://app.clickup.com/t/${id}`
    });
  }
}
console.log('csv rows:',csvCount);
// 3) fetched json extras (custom format) - override
for(const f of fetchedJson){
  const arr=JSON.parse(fs.readFileSync(f,'utf8'));
  for(const t of arr){
    const cf=t.cf||{};
    put({ id:t.id, name:t.name||'', status:(t.status||'').trim().toLowerCase(),
      description:t.description||'',
      tags:JSON.stringify((t.tags||[]).map(x=>x.name||x)),
      due_date:tsToISO(t.due_date), date_created:tsToISO(t.date_created),
      data:tsToISO(cf.Data)||tsToISO(t.due_date)||tsToISO(t.date_created),
      reparto:(cf.Reparto||'').trim(), clientela:(cf.Clientela||'').trim(),
      demografia:(cf.Demografia||'').trim(), modello:(cf.Modello||'').trim(),
      stato_lav:(cf.Stato||'').trim(), sentiment:(cf.Sentiment||'').trim(),
      pagato:(cf.pagato||'').trim(), sellout:(cf.sellout||'').trim(),
      telefono:(cf.Telefono||'').trim(),
      prezzo:num(cf.Prezzo), spese:num(cf.Spese),
      tax_refund:cf['TAX REFUND']?1:0,
      stile:JSON.stringify(cf.Stile||[]), lenti:JSON.stringify(cf.Lenti||[]),
      upsell:JSON.stringify(cf.UpSell||[]), eta:JSON.stringify(cf['età']||[]),
      clickup_url:`https://app.clickup.com/t/${t.id}` });
  }
  console.log('fetched:',arr.length,f);
}
// normalize
for(const o of orders.values()){
  if(o.clientela) o.clientela=o.clientela.replace(/\s+$/,'');
  if(o.modello) o.modello=o.modello.trim();
  if(!o.status) o.status='in corso';
}
// emit SQL
fs.mkdirSync(OUT,{recursive:true});
const cols=['id','name','description','status','tags','data','due_date','date_created','date_done','reparto','clientela','demografia','modello','stato_lav','sentiment','pagato','sellout','telefono','prezzo','spese','tax_refund','stile','lenti','upsell','eta','clickup_url','sort_order'];
const all=[...orders.values()];
const CHUNK=400; let fileN=0;
for(let i=0;i<all.length;i+=CHUNK){
  const chunk=all.slice(i,i+CHUNK);
  const lines=chunk.map(o=>{
    const vals=cols.map(c=>{
      if(c==='sort_order') return '0';
      let v=o[c];
      if(c==='tags'||c==='stile'||c==='lenti'||c==='upsell'||c==='eta') v=v||'[]';
      if(c==='description'||c==='name'||c==='clickup_url') v=v||'';
      if(c==='tax_refund') return String(v||0);
      return sqlVal(v===''?'':(v??null));
    });
    return `INSERT OR REPLACE INTO orders (${cols.join(',')}) VALUES (${vals.join(',')});`;
  });
  fileN++;
  fs.writeFileSync(path.join(OUT,`seed_orders_${String(fileN).padStart(2,'0')}.sql`),lines.join('\n')+'\n');
}
if(catalogsPath){
  const cat=fs.readFileSync(catalogsPath,'utf8');
  fs.writeFileSync(path.join(OUT,'seed_meta.sql'),`INSERT OR REPLACE INTO meta (key,value) VALUES ('catalogs','${esc(cat)}');\n`);
}
// verify
const by=(fn)=>{const m={};for(const o of all){const k=fn(o)||'(vuoto)';m[k]=(m[k]||0)+1;}return m;};
const yearOf=o=>o.data?o.data.slice(0,4):'senza';
const sums={};
for(const o of all){ const y=yearOf(o); sums[y]=sums[y]||{prezzo:0,spese:0,n:0}; sums[y].prezzo+=o.prezzo||0; sums[y].spese+=o.spese||0; sums[y].n++; }
const verify={total:all.length, byStatus:by(o=>o.status), byYear:by(yearOf), sums};
fs.writeFileSync(path.join(OUT,'verify.json'),JSON.stringify(verify,null,1));
console.log(JSON.stringify(verify.byStatus),'\ntot:',all.length,'files:',fileN);
