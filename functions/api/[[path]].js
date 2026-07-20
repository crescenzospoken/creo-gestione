// CREO Positano - API v2 (Pages Functions + D1) con automazioni e cataloghi
const COLS = ['name','description','status','tags','rx','data','due_date','date_created','date_done','reparto','clientela','demografia','modello','stato_lav','sentiment','pagato','sellout','telefono','prezzo','spese','tax_refund','stile','lenti','upsell','eta','clickup_url','sort_order'];
const NUMC = new Set(['prezzo','spese','tax_refund','sort_order']);
const LBLC = new Set(['tags','stile','lenti','upsell','eta']);

const te = new TextEncoder();
async function hmacKey(secret){
  return crypto.subtle.importKey('raw', te.encode(secret + '|creo-v1'), {name:'HMAC', hash:'SHA-256'}, false, ['sign','verify']);
}
function b64url(buf){ return btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,''); }
async function makeToken(secret, exp){
  const key = await hmacKey(secret);
  const sig = await crypto.subtle.sign('HMAC', key, te.encode('creo|' + exp));
  return exp + '.' + b64url(sig);
}
async function checkToken(secret, token){
  if(!token) return false;
  const [exp] = token.split('.');
  if(!exp || parseInt(exp) < Date.now()/1000) return false;
  return (await makeToken(secret, exp)) === token;
}
function getCookie(req, name){
  const m = (req.headers.get('Cookie')||'').match(new RegExp('(?:^|;\\s*)' + name + '=([^;]+)'));
  return m ? m[1] : null;
}
function json(data, status=200, headers={}){
  return new Response(JSON.stringify(data), {status, headers:{'Content-Type':'application/json; charset=utf-8', ...headers}});
}
function todayISO(){ return new Date().toISOString().slice(0,10); }

async function logAct(db, order_id, order_name, action, field, oldv, newv){
  await db.prepare("INSERT INTO activity (order_id,order_name,action,field,old_value,new_value) VALUES (?,?,?,?,?,?)")
    .bind(order_id, order_name, action, field||'', oldv===undefined||oldv===null?null:String(oldv), newv===undefined||newv===null?null:String(newv)).run();
}
async function getMeta(db, key){
  const r = await db.prepare('SELECT value FROM meta WHERE key=?').bind(key).first();
  return r ? r.value : null;
}
async function setMeta(db, key, value){
  await db.prepare('INSERT OR REPLACE INTO meta (key,value) VALUES (?,?)').bind(key, value).run();
}
async function getAutomations(db){
  const v = await getMeta(db, 'automations');
  if(v) return JSON.parse(v);
  return [];
}
// applica le azioni a un oggetto patch
function applyActions(actions, patch){
  for(const a of (actions||[])){
    let v = a.value;
    if(v === '@oggi') v = todayISO();
    if(a.type === 'set_status') patch.status = v;
    else if(a.type === 'set_field'){
      if(LBLC.has(a.field)) patch[a.field] = JSON.stringify(String(v).split(',').map(s=>s.trim()).filter(Boolean));
      else if(NUMC.has(a.field)) patch[a.field] = v===''||v===null ? null : Number(v);
      else patch[a.field] = v;
    }
  }
}

export async function onRequest(context){
  try{ return await handle(context); }
  catch(e){ return new Response(JSON.stringify({ok:false, error:'server: '+(e&&e.message||e)}), {status:500, headers:{'Content-Type':'application/json'}}); }
}
async function handle(context){
  const {request, env} = context;
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api\/?/, '');
  const method = request.method;
  const PASS = env.APP_PASSWORD || 'creo';

  if(path === 'login' && method === 'POST'){
    let body = {}; try{ body = await request.json(); }catch(e){}
    await new Promise(r => setTimeout(r, 250));
    if((body.password||'') !== PASS) return json({ok:false, error:'Password errata'}, 401);
    const exp = Math.floor(Date.now()/1000) + 60*60*24*90;
    const tok = await makeToken(PASS, String(exp));
    return json({ok:true}, 200, {'Set-Cookie': `creo_sess=${tok}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${60*60*24*90}`});
  }
  if(path === 'logout' && method === 'POST'){
    return json({ok:true}, 200, {'Set-Cookie':'creo_sess=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0'});
  }
  const db = env.DB;

  // icona del tool (pubblica: serve per favicon/PWA anche prima del login)
  if(path === 'icon' && method === 'GET'){
    const v = await getMeta(db, 'icon_png');
    if(!v) return new Response('', {status: 404});
    const bin = Uint8Array.from(atob(v), ch => ch.charCodeAt(0));
    return new Response(bin, {headers: {'Content-Type':'image/png', 'Cache-Control':'public, max-age=86400'}});
  }

  // export CSV: cookie di sessione oppure chiave di backup
  if(path === 'export' && method === 'GET'){
    const key = url.searchParams.get('key')||'';
    const okKey = env.BACKUP_KEY && key === env.BACKUP_KEY;
    const okCookie = await checkToken(PASS, getCookie(request, 'creo_sess'));
    if(!okKey && !okCookie) return json({ok:false, error:'auth'}, 401);
    const year = url.searchParams.get('year')||'';
    const compact = url.searchParams.get('compact')==='1';
    let sql = 'SELECT * FROM orders', bind=[];
    if(year){ sql += " WHERE substr(data,1,4)=?"; bind.push(year); }
    sql += ' ORDER BY (data IS NULL), data DESC LIMIT 10000';
    const rs = await db.prepare(sql).bind(...bind).all();
    const rows = rs.results||[];
    const cols = ['id','name','status','data','due_date','prezzo','spese','guadagni','reparto','clientela','demografia','modello','stato_lav','pagato','sellout','telefono','tax_refund','stile','lenti','upsell','eta','tags','rx','description','date_created','updated_at'];
    const q = v => '"'+String(v??'').replace(/"/g,'""').replace(/\r?\n/g,' ')+'"';
    const lines = [cols.join(',')];
    for(const r of rows){
      lines.push(cols.map(c=>{
        if(c==='guadagni') return q(r.prezzo!==null||r.spese!==null ? (r.prezzo||0)-(r.spese||0) : '');
        let v = r[c];
        if(compact && c==='description') v = String(v||'').slice(0,120);
        return q(v);
      }).join(','));
    }
    return new Response(lines.join('\n'), {headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="creo-clienti-backup.csv"'}});
  }

  // webhook Shopify ordini
  if(path === 'shopify-hook' && method === 'POST'){
    const key = url.searchParams.get('key')||'';
    if(!env.HOOK_KEY || key !== env.HOOK_KEY) return json({ok:false}, 401);
    let o; try{ o = await request.json(); }catch(e){ return json({ok:false}, 400); }
    if(!o || !o.id) return json({ok:true, skipped:true});
    const id = 'shp' + o.id;
    const cust = o.customer ? [o.customer.first_name, o.customer.last_name].filter(Boolean).join(' ') : (o.shipping_address?.name || 'Cliente web');
    const items = (o.line_items||[]).map(li => (li.quantity>1?li.quantity+'x ':'') + li.title + (li.variant_title? ' ('+li.variant_title+')':'')).join(', ');
    const name = (cust + ' — ' + items).slice(0, 140);
    const descr = ['Ordine Shopify ' + (o.name||('#'+o.order_number||'')),
      'Articoli: ' + items,
      o.note ? 'Note: '+o.note : '',
      o.email ? 'Email: '+o.email : '',
      o.shipping_address ? 'Spedizione: '+[o.shipping_address.name,o.shipping_address.address1,o.shipping_address.city,o.shipping_address.zip,o.shipping_address.country].filter(Boolean).join(', ') : ''
    ].filter(Boolean).join('\n');
    const tel = o.phone || o.customer?.phone || o.shipping_address?.phone || '';
    const prezzo = parseFloat(o.current_total_price || o.total_price) || null;
    const pagato = (o.financial_status==='paid') ? 'Pagato' : 'Da pagare';
    const dataIso = (o.created_at||'').slice(0,10) || todayISO();
    const cols = ['id','name','description','status','tags','rx','data','due_date','date_created','date_done','reparto','clientela','demografia','modello','stato_lav','sentiment','pagato','sellout','telefono','prezzo','spese','tax_refund','stile','lenti','upsell','eta','clickup_url','sort_order'];
    const row = {id, name, description: descr, rx:'', status:'in corso', tags: JSON.stringify(['ecommerce','shopify']),
      data: dataIso, due_date: null, date_created: dataIso, date_done: null,
      reparto:'', clientela:'Web', demografia:'', modello:'', stato_lav:'', sentiment:'',
      pagato, sellout:'ordine', telefono: tel, prezzo, spese: null, tax_refund: 0,
      stile:'[]', lenti:'[]', upsell:'[]', eta:'[]', clickup_url: o.order_status_url||'', sort_order: 0};
    await db.prepare(`INSERT OR IGNORE INTO orders (${cols.join(',')}) VALUES (${cols.map(()=>'?').join(',')})`).bind(...cols.map(c=>row[c])).run();
    return json({ok:true});
  }

  if(!(await checkToken(PASS, getCookie(request, 'creo_sess')))) return json({ok:false, error:'auth'}, 401);

  if(path === 'boot' && method === 'GET'){
    const cat = await getMeta(db, 'catalogs');
    const prefs = await getMeta(db, 'uiprefs');
    const autos = await getAutomations(db);
    const b2b = await getMeta(db, 'b2b_clients');
    const yrs = await db.prepare("SELECT DISTINCT substr(data,1,4) AS y FROM orders WHERE data IS NOT NULL ORDER BY y DESC").all();
    return json({ok:true, catalogs: cat?JSON.parse(cat):null, automations: autos, prefs: prefs?JSON.parse(prefs):null,
      b2b: b2b?JSON.parse(b2b):[{name:'Hotel Poseidon',match:'poseidon'},{name:'Hotel San Pietro',match:'san pietro'}],
      years:(yrs.results||[]).map(r=>r.y).filter(Boolean)});
  }

  if(path === 'orders' && method === 'GET'){
    const year = url.searchParams.get('year') || 'all';
    const q = (url.searchParams.get('q')||'').trim();
    let sql = 'SELECT * FROM orders', wh = [], bind = [];
    if(year === 'senza') wh.push('data IS NULL');
    else if(year !== 'all'){ wh.push("substr(data,1,4)=?"); bind.push(year); }
    if(q){ wh.push('(name LIKE ? OR description LIKE ? OR telefono LIKE ? OR modello LIKE ?)'); const like='%'+q+'%'; bind.push(like,like,like,like); }
    if(wh.length) sql += ' WHERE ' + wh.join(' AND ');
    sql += ' ORDER BY (data IS NULL), data DESC, date_created DESC LIMIT 5000';
    const rs = await db.prepare(sql).bind(...bind).all();
    return json({ok:true, orders: rs.results||[]});
  }

  if(path === 'orders' && method === 'POST'){
    const b = await request.json();
    const id = 'c' + crypto.randomUUID().replace(/-/g,'').slice(0,12);
    const row = {id};
    for(const c of COLS) row[c] = b[c] !== undefined ? b[c] : null;
    // automazioni "create"
    const autos = await getAutomations(db);
    const patch = {};
    for(const a of autos) if(a.active && a.trigger.type === 'create') applyActions(a.actions, patch);
    for(const k in patch) if(row[k] === null || row[k] === undefined || row[k] === '') row[k] = patch[k];
    row.name = row.name || 'Nuovo ordine';
    row.status = row.status || 'in corso';
    row.date_created = row.date_created || todayISO();
    for(const c of LBLC) row[c] = row[c] || '[]';
    for(const c of ['description','reparto','clientela','demografia','modello','stato_lav','sentiment','pagato','sellout','telefono','clickup_url','rx']) row[c] = row[c] || '';
    row.tax_refund = row.tax_refund ? 1 : 0; row.sort_order = row.sort_order || 0;
    const cols = ['id', ...COLS];
    await db.prepare(`INSERT INTO orders (${cols.join(',')}) VALUES (${cols.map(()=>'?').join(',')})`).bind(...cols.map(c=>row[c])).run();
    const saved = await db.prepare('SELECT * FROM orders WHERE id=?').bind(id).first();
    await logAct(db, id, saved.name, 'crea', '', null, saved.name);
    return json({ok:true, order: saved});
  }

  const mOrder = path.match(/^orders\/([\w-]+)$/);
  if(mOrder && (method === 'PATCH' || method === 'PUT')){
    const b = await request.json();
    const prev = await db.prepare('SELECT * FROM orders WHERE id=?').bind(mOrder[1]).first();
    if(!prev) return json({ok:false, error:'not found'}, 404);
    // automazioni change-based
    const autos = await getAutomations(db);
    const patch = {};
    for(const a of autos){
      if(!a.active) continue;
      const t = a.trigger;
      if(t.type === 'status_change' && b.status !== undefined && b.status !== prev.status){
        if(!t.to || !t.to.length || t.to.includes(b.status)) applyActions(a.actions, patch);
      }
      if(t.type === 'field_change' && t.field && b[t.field] !== undefined && String(b[t.field]) !== String(prev[t.field]??'')){
        const target = t.to === undefined || t.to === null || t.to === '' ? null : t.to;
        const nv = LBLC.has(t.field) ? String(b[t.field]) : b[t.field];
        if(target === null || (LBLC.has(t.field) ? String(nv).includes(target) : String(nv) === String(target))) applyActions(a.actions, patch);
      }
    }
    const upd = {...patch, ...b}; // i valori espliciti dell'utente vincono
    const sets = [], bind = [];
    for(const c of COLS){
      if(upd[c] !== undefined){
        sets.push(c+'=?');
        bind.push(NUMC.has(c) ? (upd[c]===null||upd[c]===''?null:Number(upd[c])) : upd[c]);
      }
    }
    if(!sets.length) return json({ok:false, error:'no fields'}, 400);
    sets.push("updated_at=datetime('now')");
    bind.push(mOrder[1]);
    await db.prepare(`UPDATE orders SET ${sets.join(',')} WHERE id=?`).bind(...bind).run();
    const saved = await db.prepare('SELECT * FROM orders WHERE id=?').bind(mOrder[1]).first();
    for(const c of COLS){
      if(upd[c] !== undefined && String(prev[c]??'') !== String(saved[c]??''))
        await logAct(db, saved.id, saved.name, 'modifica', c, prev[c], saved[c]);
    }
    return json({ok:true, order: saved});
  }
  if(mOrder && method === 'DELETE'){
    const prev = await db.prepare('SELECT * FROM orders WHERE id=?').bind(mOrder[1]).first();
    await db.prepare('DELETE FROM orders WHERE id=?').bind(mOrder[1]).run();
    if(prev) await logAct(db, prev.id, prev.name, 'elimina', '', JSON.stringify(prev), null);
    return json({ok:true});
  }

  // registro attività
  if(path === 'activity' && method === 'GET'){
    const lim = Math.min(parseInt(url.searchParams.get('limit')||'120'), 300);
    const oid = url.searchParams.get('order');
    const rs = oid
      ? await db.prepare('SELECT * FROM activity WHERE order_id=? ORDER BY ts DESC, id DESC LIMIT ?').bind(oid, lim).all()
      : await db.prepare('SELECT * FROM activity ORDER BY ts DESC, id DESC LIMIT ?').bind(lim).all();
    await db.prepare('DELETE FROM activity WHERE id < (SELECT COALESCE(MAX(id),0) FROM activity) - 800').run();
    return json({ok:true, activity: rs.results||[]});
  }
  if(path === 'activity/undo' && method === 'POST'){
    const b = await request.json();
    const act = await db.prepare('SELECT * FROM activity WHERE id=?').bind(b.id).first();
    if(!act) return json({ok:false, error:'voce non trovata'}, 404);
    if(act.action === 'modifica'){
      const cur = await db.prepare('SELECT * FROM orders WHERE id=?').bind(act.order_id).first();
      if(!cur) return json({ok:false, error:'ordine non più esistente'}, 404);
      const f = act.field;
      if(!COLS.includes(f) && f!=='status') return json({ok:false, error:'campo non annullabile'}, 400);
      const v = act.old_value===null ? null : (NUMC.has(f) ? (act.old_value===''?null:Number(act.old_value)) : act.old_value);
      await db.prepare(`UPDATE orders SET ${f}=?, updated_at=datetime('now') WHERE id=?`).bind(v, act.order_id).run();
      await logAct(db, act.order_id, cur.name, 'modifica', f, act.new_value, act.old_value);
      return json({ok:true});
    }
    if(act.action === 'crea'){
      const cur = await db.prepare('SELECT * FROM orders WHERE id=?').bind(act.order_id).first();
      if(!cur) return json({ok:false, error:'ordine già eliminato'}, 404);
      await db.prepare('DELETE FROM orders WHERE id=?').bind(act.order_id).run();
      await logAct(db, act.order_id, cur.name, 'elimina', '', JSON.stringify(cur), null);
      return json({ok:true});
    }
    if(act.action === 'elimina'){
      let row; try{ row = JSON.parse(act.old_value); }catch(e){ return json({ok:false, error:'snapshot non valido'}, 400); }
      const cols = Object.keys(row).filter(k => k!=='updated_at');
      await db.prepare(`INSERT OR REPLACE INTO orders (${cols.join(',')}) VALUES (${cols.map(()=>'?').join(',')})`).bind(...cols.map(k=>row[k])).run();
      await logAct(db, row.id, row.name, 'crea', '', null, row.name);
      return json({ok:true});
    }
    return json({ok:false}, 400);
  }
  const mSingle = path.match(/^order\/([\w-]+)$/);
  if(mSingle && method === 'GET'){
    const r = await db.prepare('SELECT * FROM orders WHERE id=?').bind(mSingle[1]).first();
    return json({ok:!!r, order: r||null});
  }

  if(path === 'note' && method === 'GET'){
    const y = url.searchParams.get('year')||'';
    return json({ok:true, note: (await getMeta(db, 'note_'+y)) || ''});
  }
  if(path === 'note' && method === 'PUT'){
    const b = await request.json();
    await setMeta(db, 'note_'+(b.year||''), b.text||'');
    return json({ok:true});
  }

  // cataloghi: sostituzione completa (aggiungi/modifica colori/elimina opzioni)
  if(path === 'catalogs' && method === 'PUT'){
    const b = await request.json();
    if(!b.catalogs || !b.catalogs.fields) return json({ok:false, error:'catalogs mancante'}, 400);
    await setMeta(db, 'catalogs', JSON.stringify(b.catalogs));
    return json({ok:true});
  }
  // rinomina opzione: aggiorna anche gli ordini
  if(path === 'catalogs/rename' && method === 'POST'){
    const b = await request.json(); // {field, from, to} — field = colonna db o 'status'
    const {field, from, to} = b; // to vuoto = rimuovi il valore (solo campi labels)
    if(!field || !from || to === undefined || to === null) return json({ok:false}, 400);
    if(to === '' && !LBLC.has(field)) return json({ok:false, error:'solo per campi etichetta'}, 400);
    if(field === 'status'){
      await db.prepare('UPDATE orders SET status=? WHERE status=?').bind(to, from).run();
    } else if(LBLC.has(field)){
      const rs = await db.prepare(`SELECT id, ${field} AS v FROM orders WHERE ${field} LIKE ?`).bind('%'+JSON.stringify(from).slice(1,-1)+'%').all();
      for(const r of (rs.results||[])){
        try{
          const arr = JSON.parse(r.v||'[]');
          const na = to === '' ? arr.filter(x => x !== from) : arr.map(x => x === from ? to : x);
          if(JSON.stringify(arr) !== JSON.stringify(na))
            await db.prepare(`UPDATE orders SET ${field}=? WHERE id=?`).bind(JSON.stringify(na), r.id).run();
        }catch(e){}
      }
    } else if(COLS.includes(field)){
      await db.prepare(`UPDATE orders SET ${field}=? WHERE ${field}=?`).bind(to, from).run();
    }
    return json({ok:true});
  }

  // automazioni CRUD
  if(path === 'automations' && method === 'GET') return json({ok:true, automations: await getAutomations(db)});
  if(path === 'automations' && method === 'PUT'){
    const b = await request.json();
    await setMeta(db, 'automations', JSON.stringify(b.automations||[]));
    return json({ok:true});
  }
  if(path === 'prefs' && method === 'PUT'){
    const b = await request.json();
    await setMeta(db, 'uiprefs', JSON.stringify(b.prefs||{}));
    return json({ok:true});
  }
  if(path === 'icon' && method === 'PUT'){
    const b = await request.json();
    const m = (b.data||'').match(/^data:image\/png;base64,(.+)$/);
    if(!m) return json({ok:false, error:'serve un dataURL png'}, 400);
    await setMeta(db, 'icon_png', m[1]);
    return json({ok:true});
  }
  // b2b
  if(path === 'b2b' && method === 'PUT'){
    const b = await request.json();
    await setMeta(db, 'b2b_clients', JSON.stringify(b.clients||[]));
    return json({ok:true});
  }
  // AI: analizza testo libero -> proposte ordini
  if(path === 'ai-parse' && method === 'POST'){
    const b = await request.json();
    const text = (b.text||'').slice(0, 6000);
    if(!text.trim()) return json({ok:false, error:'testo vuoto'}, 400);
    if(!env.AI) return json({ok:false, error:'Workers AI non configurato'}, 500);
    const cat = JSON.parse((await getMeta(db,'catalogs'))||'{}');
    const opt = k => (cat.fields?.[k]?.options||[]).map(o=>o.n).join(' | ');
    const sys = `Sei l'assistente del negozio CREO Positano Glasses (occhiali in legno artigianali, Positano).
Analizza il testo che descrive uno o più ordini di clienti e restituisci SOLO un array JSON valido, senza testo prima o dopo.
Ogni elemento è un ordine con questi campi (ometti i campi che non riesci a dedurre):
- "name": stringa breve, formato tipico: nome cliente + modello + dettagli chiave (es. "Marco Rossi 322 ebano lenti verdi")
- "description": dettagli aggiuntivi non riassumibili nel nome (misure, richieste, note)
- "data": data ordine formato YYYY-MM-DD (oggi = ${todayISO()}), usa oggi se non specificata
- "due_date": eventuale scadenza/consegna YYYY-MM-DD
- "prezzo": numero (euro, prezzo di vendita)
- "spese": numero (costo sostenuto; NON inventarlo se non citato)
- "telefono": stringa
- "status": uno tra: ${ (cat.statuses||[]).map(s=>s.name).join(' | ') } (default "in corso")
- "reparto": uno tra: ${opt('reparto')}
- "clientela": uno tra: ${opt('clientela')}
- "demografia": uno tra: ${opt('demografia')}
- "eta": uno tra: ${opt('eta')}
- "pagato": uno tra: ${opt('pagato')}
- "sellout": uno tra: ${opt('sellout')}
- "modello": uno tra: ${opt('modello')}
- "stile": array di valori tra: ${opt('stile')}
- "lenti": array di valori tra: ${opt('lenti')}
- "upsell": array di valori tra: ${opt('upsell')}
- "tags": array di etichette brevi; usa "spedizione" se l'ordine va spedito, "buono regalo" per i buoni regalo, "ecommerce" per ordini dal sito, "problema" per riparazioni in garanzia o lamentele
Regole: usa SOLO valori delle liste (corrispondenza più vicina). NON includere mai il campo "stato_lav". Se il testo indica che più ordini appartengono allo stesso cliente, usa quel nome per tutti gli ordini. Se c'è una spedizione: aggiungi il tag "spedizione" e metti indirizzo e destinatario nella description. "vista" o "graduato" => reparto Vista o Vista 4%; "sole" => Sole; riparazioni => Riparazione; lenti a contatto => LAC. Se pagato/acconto è citato, imposta "pagato". Numeri a 3 cifre tipo 322 sono il modello. Rispondi SOLO con l'array JSON.`;
    let out = null, modelUsed = '';
    for(const model of ['@cf/meta/llama-3.3-70b-instruct-fp8-fast','@cf/meta/llama-3.1-8b-instruct']){
      try{
        const r = await env.AI.run(model, {messages:[{role:'system',content:sys},{role:'user',content:text}], max_tokens:2500, temperature:0.15});
        out = r.response || r.result || ''; modelUsed = model;
        if(out) break;
      }catch(e){ out = null; }
    }
    if(!out) return json({ok:false, error:'AI non disponibile in questo momento'}, 502);
    let orders = [];
    if(Array.isArray(out)) orders = out;
    else if(typeof out === 'object' && out !== null) orders = [out];
    else {
      try{
        const i1 = out.indexOf('['), i2 = out.lastIndexOf(']');
        const j1 = out.indexOf('{'), j2 = out.lastIndexOf('}');
        const txt = (i1 !== -1 && i2 > i1) ? out.slice(i1, i2+1) : out.slice(j1, j2+1);
        orders = JSON.parse(txt);
        if(!Array.isArray(orders)) orders = [orders];
      }catch(e){ return json({ok:false, error:'Non sono riuscito a interpretare la risposta AI', raw: String(out).slice(0,600)}, 422); }
    }
    const clean = orders.map(o=>{
      const c = {};
      for(const k of ['name','description','data','due_date','telefono','status','reparto','clientela','demografia','eta','pagato','sellout','modello']) if(o[k]!==undefined&&o[k]!==null&&o[k]!=='') c[k]=String(o[k]);
      for(const k of ['prezzo','spese']){ const n=parseFloat(o[k]); if(!isNaN(n)) c[k]=n; }
      for(const k of ['stile','lenti','upsell','tags']) if(Array.isArray(o[k])&&o[k].length) c[k]=o[k].map(String);
      if(typeof o.eta==='object'&&Array.isArray(o.eta)) c.eta=String(o.eta[0]||'');
      return c;
    }).filter(o=>o.name);
    return json({ok:true, orders: clean, model: modelUsed});
  }
  return json({ok:false, error:'not found: '+path}, 404);
}
