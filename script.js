const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const SESSION_KEY = 'atlas_session_realtime_final';
const DRAFT_KEY = 'atlas_message_draft_realtime_final';
const API_STATE_URL = '/api/state';
const SYNC_INTERVAL_MS = 1500;

let cloudReady = false;
let syncTimer = null;
let lastRemoteUpdatedAt = 0;
let isSaving = false;
let currentUser = null;
let state = null;
let firstLoadDone = false;
let saveTimer = null;

function uid(){ return Date.now().toString(36)+Math.random().toString(36).slice(2,8); }
function escapeHtml(str=''){ return String(str).replace(/[&<>'"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
function now(){ return new Date().toLocaleString('es-ES'); }
function todayText(){ return new Date().toLocaleDateString('es-ES',{day:'numeric',month:'long',year:'numeric'}); }
function toast(text){ const el=document.createElement('div'); el.className='toast'; el.textContent=text; document.body.appendChild(el); setTimeout(()=>el.remove(),2800); }
function showSaveState(text='Guardado en la nube'){
  let el=document.getElementById('autosaveStatus');
  if(!el){ el=document.createElement('div'); el.id='autosaveStatus'; el.className='autosave-status'; document.body.appendChild(el); }
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(saveTimer);
  saveTimer=setTimeout(()=>el.classList.remove('show'),1400);
}
function setCloudStatus(text, ok=true){
  let el=document.getElementById('cloudStatus');
  if(!el){ el=document.createElement('div'); el.id='cloudStatus'; el.className='cloud-status'; document.body.appendChild(el); }
  el.textContent=text;
  el.classList.toggle('error', !ok);
}
function emptyUser(name, username, password, email='', role='client'){
  return {name, username, password, role, email, company:'', projects:[], messages:[], invoices:[], files:[], tickets:[], activity:[]};
}
function defaultState(){
  return {
    users:{ atlas: emptyUser('Atlas Creative','atlas','AtlasCreative2026!','admin@atlascreative.es','admin') },
    settings:{ webhook:'' },
    audit:[{id:uid(), action:'Sistema iniciado', detail:'Estado compartido creado en el servidor', target:'global', user:'Sistema', date:now()}],
    updatedAt:Date.now(),
    updatedBy:'sistema'
  };
}
function normalizeState(raw){
  const base = defaultState();
  const out = raw && typeof raw === 'object' ? raw : {};
  out.users = out.users && typeof out.users === 'object' ? out.users : {};
  if(!out.users.atlas) out.users.atlas = base.users.atlas;
  Object.keys(out.users).forEach(k=>{
    const u=out.users[k]||{};
    out.users[k] = {
      name:u.name||k, username:u.username||k, password:u.password||'', role:u.role||'client', email:u.email||'', company:u.company||'',
      projects:Array.isArray(u.projects)?u.projects:[], messages:Array.isArray(u.messages)?u.messages:[], invoices:Array.isArray(u.invoices)?u.invoices:[], files:Array.isArray(u.files)?u.files:[], tickets:Array.isArray(u.tickets)?u.tickets:[], activity:Array.isArray(u.activity)?u.activity:[]
    };
  });
  out.users.atlas.role='admin'; out.users.atlas.username='atlas'; out.users.atlas.password=out.users.atlas.password||'AtlasCreative2026!';
  out.settings = out.settings && typeof out.settings==='object' ? out.settings : {webhook:''};
  out.settings.webhook = out.settings.webhook || '';
  out.audit = Array.isArray(out.audit) ? out.audit : [];
  out.updatedAt = out.updatedAt || Date.now();
  out.updatedBy = out.updatedBy || 'sistema';
  return out;
}
function isAdmin(){ return currentUser && currentUser.role==='admin'; }
function users(){ return state?.users || {}; }
function user(username){ return users()[username]; }
function clients(){ return Object.values(users()).filter(u=>u.role!=='admin'); }
function ownerName(owner){ const u=user(owner); return u ? (u.name||u.username) : owner; }
function allItems(key){ let arr=[]; Object.values(users()).forEach(u=>(u[key]||[]).forEach(x=>arr.push({...x, owner:x.owner||u.username, ownerName:u.name||u.username}))); return arr; }
function currentData(){ return currentUser ? users()[currentUser.username] : null; }
function findLogin(login){
  const q=String(login||'').trim().toLowerCase();
  if(users()[q]) return {username:q, user:users()[q]};
  const hit=Object.entries(users()).find(([k,u])=>String(u.email||'').toLowerCase()===q);
  return hit ? {username:hit[0], user:hit[1]} : null;
}
async function commit(action='Cambio guardado'){
  state.updatedAt = Date.now();
  state.updatedBy = currentUser ? currentUser.username : 'sistema';
  isSaving = true;
  setCloudStatus('Autoguardando...', true);
  try{
    const res = await fetch(API_STATE_URL, {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify(state)
    });
    if(!res.ok){
      const err = await res.json().catch(()=>({error:res.statusText}));
      throw new Error(err.error || res.statusText || 'Error API');
    }
    const data = await res.json();
    state = normalizeState(data.state || state);
    lastRemoteUpdatedAt = state.updatedAt || Date.now();
    cloudReady = true;
    showSaveState(action);
    setCloudStatus('Autoguardado y sincronizado', true);
    renderAll();
  }catch(e){
    console.error(e);
    setCloudStatus('Error autoguardado: '+(e.message||e), false);
    toast('No se guardó en el servidor. Revisa Vercel KV.');
  }finally{
    isSaving = false;
  }
}
async function audit(action, detail='', target=''){
  const entry={id:uid(), action, detail, target, user:currentUser ? (currentUser.name||currentUser.username) : 'Sistema', date:now()};
  state.audit = [entry, ...(state.audit||[])].slice(0,120);
  sendDiscordAudit(entry);
}
async function sendDiscordAudit(entry){
  const url=state?.settings?.webhook;
  if(!url) return;
  try{
    await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
      username:'Atlas Creative Auditoría',
      embeds:[{title:'Registro Atlas Creative',color:3447003,description:String(entry.detail||''),fields:[
        {name:'Acción',value:String(entry.action||'—'),inline:true},
        {name:'Usuario',value:String(entry.user||'—'),inline:true},
        {name:'Objetivo',value:String(entry.target||'—'),inline:true},
        {name:'Fecha',value:String(entry.date||'—'),inline:false}
      ]}]
    })});
  }catch(e){ console.warn('Webhook Discord falló', e); }
}
async function fetchRemoteState(silent=false){
  try{
    const res = await fetch(API_STATE_URL, {cache:'no-store'});
    if(!res.ok){
      const err = await res.json().catch(()=>({error:res.statusText}));
      throw new Error(err.error || res.statusText || 'Error API');
    }
    const data = await res.json();
    const remote = normalizeState(data.state);
    const changed = !state || (remote.updatedAt||0) !== lastRemoteUpdatedAt;
    state = remote;
    lastRemoteUpdatedAt = remote.updatedAt || Date.now();
    const session=localStorage.getItem(SESSION_KEY);
    currentUser = session && state.users[session] ? state.users[session] : null;
    firstLoadDone = true;
    cloudReady = true;
    setCloudStatus('Autoguardado activo · sincronizando', true);
    if(changed && !isSaving){ renderAll(); if(!silent) showSaveState('Cambios recibidos'); }
  }catch(e){
    console.error(e);
    setCloudStatus('Sin autoguardado: '+(e.message||e), false);
    if(!state){ state = normalizeState(JSON.parse(localStorage.getItem('atlas_emergency_cache')||'null')); firstLoadDone=true; renderAll(); }
  }
}
async function initRealtimeBackend(){
  setCloudStatus('Conectando al autoguardado...', true);
  await fetchRemoteState(true);
  if(syncTimer) clearInterval(syncTimer);
  syncTimer = setInterval(()=>{ if(!isSaving) fetchRemoteState(true); }, SYNC_INTERVAL_MS);
  window.addEventListener('beforeunload', ()=>{ try{ localStorage.setItem('atlas_emergency_cache', JSON.stringify(state)); }catch{} });
}
function setAuthMode(mode){
  $('#tabLogin').classList.toggle('active', mode==='login');
  $('#tabRegister').classList.toggle('active', mode==='register');
  $('#loginForm').classList.toggle('show', mode==='login');
  $('#registerForm').classList.toggle('show', mode==='register');
  $('#authMsg').textContent='';
}
$('#tabLogin').onclick=()=>setAuthMode('login');
$('#tabRegister').onclick=()=>setAuthMode('register');
$('#registerForm').addEventListener('submit', async e=>{
  e.preventDefault();
  if(!firstLoadDone) return toast('Espera a que conecte el autoguardado');
  const name=$('#regName').value.trim();
  const email=$('#regEmail').value.trim().toLowerCase();
  const username=$('#regUser').value.trim().toLowerCase().replace(/\s+/g,'_').replace(/[^a-z0-9_]/g,'');
  const password=$('#regPass').value;
  if(!email.includes('@')) return $('#authMsg').textContent='Pon un correo válido.';
  if(!username) return $('#authMsg').textContent='El usuario no puede estar vacío.';
  if(password.length<4) return $('#authMsg').textContent='La contraseña debe tener mínimo 4 caracteres.';
  if(state.users[username]) return $('#authMsg').textContent='Ese usuario ya existe.';
  if(Object.values(state.users).some(u=>String(u.email||'').toLowerCase()===email)) return $('#authMsg').textContent='Ese correo ya está registrado.';
  state.users[username]=emptyUser(name,username,password,email,'client');
  localStorage.setItem(SESSION_KEY, username); currentUser=state.users[username];
  await audit('Nuevo registro', `Usuario: ${username} · Email: ${email}`, username);
  await commit('Cuenta creada y autoguardada');
});
$('#loginForm').addEventListener('submit', e=>{
  e.preventDefault();
  if(!firstLoadDone) return toast('Espera a que conecte el autoguardado');
  const found=findLogin($('#loginUser').value);
  if(!found || found.user.password!==$('#loginPass').value) return $('#authMsg').textContent='Usuario/correo o contraseña incorrectos.';
  localStorage.setItem(SESSION_KEY, found.username); currentUser=state.users[found.username]; renderAll();
});
$('#logout').onclick=()=>{ localStorage.removeItem(SESSION_KEY); currentUser=null; renderAll(); setAuthMode('login'); };

const pages=$$('.page');
function openPage(id){ pages.forEach(p=>p.classList.remove('show')); const el=document.getElementById(id); if(el) el.classList.add('show'); $$('.nav').forEach(n=>n.classList.toggle('active',n.dataset.page===id)); const sb=$('.sidebar'); if(sb) sb.classList.remove('open'); }
$$('[data-page]').forEach(n=>n.addEventListener('click',()=>openPage(n.dataset.page)));
$('#menu').onclick=()=>$('.sidebar').classList.toggle('open');
function setCount(id,n){ const el=$(id); if(el) el.textContent=n; }
function avgProgress(projects){ return projects.length ? Math.round(projects.reduce((a,p)=>a+(Number(p.progress)||0),0)/projects.length) : 0; }
function activeProjects(u){ return (u.projects||[]).filter(p=>p.status!=='Finalizado'); }

function renderAll(){
  if(!firstLoadDone){ $('#auth').classList.remove('hidden'); $('#app').classList.add('hidden'); return; }
  if(!currentUser){ $('#auth').classList.remove('hidden'); $('#app').classList.add('hidden'); return; }
  currentUser = state.users[currentUser.username];
  $('#auth').classList.add('hidden'); $('#app').classList.remove('hidden');
  renderIdentity(); renderHome(); renderProjects(); renderMessages(); renderInvoices(); renderFiles(); renderTickets(); renderSettings();
}
function renderIdentity(){
  const u=currentUser, name=u.name||u.username;
  $('#sideName').textContent=name; $('#sideUser').textContent=isAdmin()?'Administrador':'@'+u.username;
  $('#heroName').textContent=name; $('#topName').textContent=(isAdmin()?'Atlas Creative':u.username)+'⌄';
  $('#avatar').textContent=(name[0]||'C').toUpperCase(); $('#today').textContent=todayText();
  const p=isAdmin()?allItems('projects'):(u.projects||[]), m=isAdmin()?allItems('messages'):(u.messages||[]), inv=isAdmin()?allItems('invoices'):(u.invoices||[]), f=isAdmin()?allItems('files'):(u.files||[]), t=isAdmin()?allItems('tickets'):(u.tickets||[]);
  setCount('#navProjects',p.length); setCount('#navMessages',m.length); setCount('#navInvoices',inv.length); setCount('#navFiles',f.length); setCount('#navTickets',t.length);
}
function renderHome(){
  const u=currentData(); const p=isAdmin()?allItems('projects'):(u.projects||[]), msgs=isAdmin()?allItems('messages'):(u.messages||[]), inv=isAdmin()?allItems('invoices'):(u.invoices||[]), files=isAdmin()?allItems('files'):(u.files||[]), activity=isAdmin()?allItems('activity'):(u.activity||[]);
  $('#statProjects').textContent=p.length; $('#statProgress').textContent=avgProgress(p)+'%'; $('#statMessages').textContent=msgs.length; $('#statInvoices').textContent=inv.length;
  const active=p.find(x=>x.status!=='Finalizado');
  $('#homeEmpty').classList.toggle('hidden', !!active || isAdmin());
  const card=$('#activeProjectCard');
  if(active){ card.classList.remove('hidden'); card.innerHTML=`<div><p>PROYECTO ACTIVO</p><h2>${escapeHtml(active.title)}</h2><div class="badges"><span>• ${escapeHtml(active.status)}</span><span>Entrega: ${escapeHtml(active.delivery||'Por definir')}</span><span>Próximo paso: ${escapeHtml(active.next||'Atlas Creative revisará la solicitud')}</span></div><h4>PROGRESO DEL PROYECTO</h4><div class="progress"><div style="width:${Number(active.progress)||0}%"></div></div><b>${Number(active.progress)||0}%</b></div><div class="mock"><span>Digital<br>experience<br>in progress</span></div>`; } else card.classList.add('hidden');
  $('#homeChecklist').innerHTML=active?['Brief recibido','Diseño aprobado','Desarrollo iniciado','SEO pendiente'].map((x,i)=>`<li class="${i<Math.ceil((active.progress||0)/30)?'done':''}">${x}</li>`).join(''):'';
  $('#homeActivity').innerHTML=activity.length?activity.slice(0,4).map(a=>`<div><b>${escapeHtml(a.text||a.title||'Actividad')}</b><span>${escapeHtml(a.date||'Ahora')}</span></div>`).join(''):'<p class="muted">Sin actividad reciente.</p>';
  $('#homeFiles').innerHTML=files.length?files.slice(0,3).map(f=>`<div><b>${escapeHtml(f.name)}</b><span>${escapeHtml(f.type||'Archivo')}</span></div>`).join(''):'<p class="muted">Sin archivos recientes.</p>';
}
function renderProjects(){
  const wrap=$('#projectsList'), empty=$('#projectsEmpty'); const items=isAdmin()?allItems('projects'):(currentData().projects||[]);
  empty.classList.toggle('hidden', items.length>0 || isAdmin());
  if(isAdmin()){
    wrap.innerHTML=`<article class="card admin-create"><h3>Crear proyecto</h3><div class="admin-actions"><select id="newProjectOwner">${clients().map(u=>`<option value="${u.username}">${escapeHtml(u.name)} (@${u.username})</option>`).join('')}</select><input id="newProjectTitle" placeholder="Nombre del proyecto"><input id="newProjectProgress" type="number" min="0" max="100" value="10"><button id="createProjectBtn">Crear</button></div></article>`;
    items.forEach(p=>{ const el=document.createElement('article'); el.className='project admin-project'; el.innerHTML=`<span>${escapeHtml(p.status)}</span><h2>${escapeHtml(p.title)}</h2><p><b>Cliente:</b> ${escapeHtml(p.ownerName)} (@${escapeHtml(p.owner)})</p><p>${escapeHtml(p.description||'')}</p><div class="progress"><div style="width:${Number(p.progress)||0}%"></div></div><b>${Number(p.progress)||0}%</b><div class="admin-actions"><input type="number" min="0" max="100" value="${Number(p.progress)||0}" data-progress="${p.id}"><select data-status="${p.id}">${['Solicitado','En diseño','En desarrollo','En revisión','Finalizado'].map(s=>`<option ${p.status===s?'selected':''}>${s}</option>`).join('')}</select><button data-save-project="${p.id}" data-owner="${p.owner}">Guardar</button><button data-complete-project="${p.id}" data-owner="${p.owner}">Completado</button><button class="danger" data-delete-project="${p.id}" data-owner="${p.owner}">Eliminar</button></div>`; wrap.appendChild(el); });
    $('#createProjectBtn').onclick=createProject;
    $$('[data-save-project]').forEach(b=>b.onclick=()=>saveProject(b.dataset.owner,b.dataset.saveProject));
    $$('[data-complete-project]').forEach(b=>b.onclick=()=>completeProject(b.dataset.owner,b.dataset.completeProject));
    $$('[data-delete-project]').forEach(b=>b.onclick=()=>deleteProject(b.dataset.owner,b.dataset.deleteProject));
  } else {
    wrap.innerHTML=items.map(p=>`<article class="project"><span>${escapeHtml(p.status)}</span><h2>${escapeHtml(p.title)}</h2><p>${escapeHtml(p.description||'')}</p><div class="progress"><div style="width:${Number(p.progress)||0}%"></div></div><b>${Number(p.progress)||0}%</b><button>Ver detalles</button></article>`).join('');
  }
}
async function createProject(){ const owner=$('#newProjectOwner').value, title=$('#newProjectTitle').value.trim()||'Nuevo proyecto', progress=Math.max(0,Math.min(100,Number($('#newProjectProgress').value)||0)); const u=state.users[owner]; u.projects.push({id:uid(),owner,title,description:'Proyecto creado por Atlas Creative.',status:'En diseño',progress,delivery:'Por definir',next:'Revisión inicial'}); u.activity.unshift({text:'Atlas Creative creó un proyecto',date:'Ahora'}); await audit('Proyecto creado',title,owner); await commit('Proyecto autoguardado'); }
async function saveProject(owner,id){ const p=state.users[owner].projects.find(x=>x.id===id); if(!p)return; p.progress=Math.max(0,Math.min(100,Number($(`[data-progress="${id}"]`).value)||0)); p.status=$(`[data-status="${id}"]`).value; if(p.status==='Finalizado')p.progress=100; state.users[owner].activity.unshift({text:`Proyecto actualizado: ${p.title}`,date:'Ahora'}); await audit('Proyecto actualizado',`${p.title} · ${p.progress}% · ${p.status}`,owner); await commit('Proyecto actualizado para todos'); }
async function completeProject(owner,id){ const p=state.users[owner].projects.find(x=>x.id===id); if(!p)return; p.progress=100;p.status='Finalizado'; await audit('Proyecto completado',p.title,owner); await commit('Proyecto completado'); }
async function deleteProject(owner,id){ if(!confirm('¿Eliminar proyecto para todos los navegadores?'))return; const u=state.users[owner]; const p=u.projects.find(x=>x.id===id); u.projects=u.projects.filter(x=>x.id!==id); await audit('Proyecto eliminado',p?.title||id,owner); await commit('Proyecto eliminado en la nube'); }
function renderMessages(){
  const box=$('#messagesList'), empty=$('#messagesEmpty'); const items=isAdmin()?allItems('messages'):(currentData().messages||[]);
  empty.classList.toggle('hidden', items.length>0);
  box.innerHTML=items.length?items.map(m=>`<article class="msg"><h3>${escapeHtml(m.from||m.ownerName||'Mensaje')}</h3><p>${escapeHtml(m.text)}</p><span>${escapeHtml(m.date||'Ahora')}</span>${isAdmin()?`<div class="admin-actions"><button data-reply="${m.id}" data-owner="${m.owner}">Responder</button><button class="danger" data-delmsg="${m.id}" data-owner="${m.owner}">Eliminar conversación</button></div>`:''}</article>`).join(''):'';
  $$('[data-reply]').forEach(b=>b.onclick=()=>{ $('#messageText').value=`Respuesta para @${b.dataset.owner}: `; $('#messageText').dataset.replyOwner=b.dataset.owner; $('#messageText').focus(); });
  $$('[data-delmsg]').forEach(b=>b.onclick=()=>deleteConversation(b.dataset.owner));
}
$('#messageForm').addEventListener('submit', async e=>{
  e.preventDefault(); const text=$('#messageText').value.trim(); if(!text)return;
  if(isAdmin()){
    const owner=$('#messageText').dataset.replyOwner; if(!owner) return toast('Selecciona un mensaje para responder');
    state.users[owner].messages.push({id:uid(),owner,from:'Atlas Creative',text,date:'Ahora'}); state.users[owner].activity.unshift({text:'Nueva respuesta de Atlas Creative',date:'Ahora'}); delete $('#messageText').dataset.replyOwner; await audit('Mensaje respondido',text,owner);
  } else {
    const u=state.users[currentUser.username]; u.messages.push({id:uid(),owner:u.username,from:'Tú',text,date:'Ahora'}); u.activity.unshift({text:'Mensaje enviado a Atlas Creative',date:'Ahora'}); await audit('Mensaje recibido de cliente',text,u.username);
  }
  $('#messageText').value=''; localStorage.removeItem(DRAFT_KEY); await commit('Mensaje sincronizado');
});
async function deleteConversation(owner){ if(!confirm('¿Eliminar todos los mensajes de este usuario?'))return; state.users[owner].messages=[]; await audit('Conversación eliminada','Mensajes eliminados',owner); await commit('Conversación eliminada para todos'); }
function renderInvoices(){
  const box=$('#invoiceTable'), empty=$('#invoiceEmpty'); const items=isAdmin()?allItems('invoices'):(currentData().invoices||[]);
  empty.classList.toggle('hidden', items.length>0 || isAdmin());
  let adminCreate=isAdmin()?`<article class="card admin-create"><h3>Crear factura</h3><div class="admin-actions"><select id="newInvoiceOwner">${clients().map(u=>`<option value="${u.username}">${escapeHtml(u.name)} (@${u.username})</option>`).join('')}</select><input id="newInvoiceName" placeholder="FACT N123"><input id="newInvoiceAmount" type="number" placeholder="450"><button id="createInvoiceBtn">Crear</button></div></article>`:'';
  box.innerHTML=adminCreate+(items.length?`<table><thead><tr><th>Factura</th><th>${isAdmin()?'Cliente':'Estado'}</th><th>Importe</th><th>Acción</th></tr></thead><tbody>${items.map(i=>`<tr><td>${escapeHtml(i.name)}</td><td>${isAdmin()?escapeHtml(i.ownerName)+' (@'+escapeHtml(i.owner)+')':`<span>${escapeHtml(i.status||'Pendiente')}</span>`}</td><td>${escapeHtml(i.amount)}€</td><td><button data-invoice="${i.id}" data-owner="${i.owner}">Ver</button>${isAdmin()?` <select data-invstatus="${i.id}">${['Pendiente','Pagada','No pagada'].map(s=>`<option ${i.status===s?'selected':''}>${s}</option>`).join('')}</select><button data-saveinv="${i.id}" data-owner="${i.owner}">Guardar</button><button class="danger" data-delinv="${i.id}" data-owner="${i.owner}">Eliminar</button>`:''}</td></tr>`).join('')}</tbody></table>`:'');
  if(isAdmin() && $('#createInvoiceBtn')) $('#createInvoiceBtn').onclick=createInvoice;
  $$('[data-saveinv]').forEach(b=>b.onclick=()=>saveInvoiceStatus(b.dataset.owner,b.dataset.saveinv));
  $$('[data-delinv]').forEach(b=>b.onclick=()=>deleteInvoice(b.dataset.owner,b.dataset.delinv));
  $$('[data-invoice]').forEach(b=>b.onclick=()=>showInvoiceDetail(b.dataset.owner,b.dataset.invoice));
}
async function createInvoice(){ const owner=$('#newInvoiceOwner').value; const name=$('#newInvoiceName').value.trim()||'FACT-'+uid().slice(-5).toUpperCase(); const amount=$('#newInvoiceAmount').value||'0'; state.users[owner].invoices.push({id:uid(),owner,name,amount,status:'Pendiente',date:'Ahora'}); await audit('Factura creada',`${name} · ${amount}€`,owner); await commit('Factura enviada'); }
async function saveInvoiceStatus(owner,id){ const inv=state.users[owner].invoices.find(x=>x.id===id); if(!inv)return; inv.status=$(`[data-invstatus="${id}"]`).value; await audit('Factura actualizada',`${inv.name} · ${inv.status}`,owner); await commit('Factura actualizada para todos'); }
async function deleteInvoice(owner,id){ if(!confirm('¿Eliminar factura?'))return; const u=state.users[owner]; const inv=u.invoices.find(x=>x.id===id); u.invoices=u.invoices.filter(x=>x.id!==id); await audit('Factura eliminada',inv?.name||id,owner); await commit('Factura eliminada'); }
function showInvoiceDetail(owner,id){ const inv=state.users[owner]?.invoices.find(x=>x.id===id); if(!inv)return; const modal=document.createElement('div'); modal.className='modal'; modal.innerHTML=`<div class="modal-card"><button class="close">×</button><h2>${escapeHtml(inv.name)}</h2><p><b>Importe:</b> ${escapeHtml(inv.amount)}€</p><p><b>Estado:</b> ${escapeHtml(inv.status)}</p><h3>Método disponible</h3><div class="paybox"><img src="paypal-qr.png" alt="PayPal QR"><div><h3>PayPal</h3><p>Escanea el QR para pagar esta factura.</p></div></div><h3>No disponibles</h3><p class="muted">Tarjeta, Bizum y transferencia no disponibles por ahora.</p></div>`; document.body.appendChild(modal); modal.querySelector('.close').onclick=()=>modal.remove(); }
function renderFiles(){
  const sel=$('#fileOwnerSelect'); if(sel){ sel.classList.toggle('hidden', !isAdmin()); sel.innerHTML=clients().map(u=>`<option value="${u.username}">${escapeHtml(u.name)} (@${u.username})</option>`).join(''); }
  const box=$('#fileGrid'), empty=$('#fileEmpty'); const items=isAdmin()?allItems('files'):(currentData().files||[]);
  empty.classList.toggle('hidden', items.length>0);
  box.innerHTML=items.map(f=>`<article class="file"><b>${escapeHtml(f.name)}</b><span>${escapeHtml(f.type||'Archivo')} · ${escapeHtml(f.size||'')}</span>${isAdmin()?`<small>${escapeHtml(f.ownerName)} (@${escapeHtml(f.owner)})</small>`:''}<div class="admin-actions"><a href="${f.data||'#'}" download="${escapeHtml(f.name)}"><button>Descargar</button></a><button class="danger" data-delfile="${f.id}" data-owner="${f.owner}">Eliminar</button></div></article>`).join('');
  $$('[data-delfile]').forEach(b=>b.onclick=()=>deleteFile(b.dataset.owner,b.dataset.delfile));
}
$('#fileUploadForm').addEventListener('submit', e=>{
  e.preventDefault(); const input=$('#fileInput'); const file=input.files[0]; if(!file)return; const owner=isAdmin()?($('#fileOwnerSelect').value):currentUser.username; const reader=new FileReader(); reader.onload=async()=>{ state.users[owner].files.push({id:uid(),owner,name:file.name,type:file.type||'Archivo',size:Math.round(file.size/1024)+' KB',data:reader.result,date:'Ahora'}); state.users[owner].activity.unshift({text:'Archivo subido: '+file.name,date:'Ahora'}); input.value=''; await audit('Archivo subido',file.name,owner); await commit('Archivo sincronizado'); }; reader.readAsDataURL(file);
});
async function deleteFile(owner,id){ if(!confirm('¿Eliminar archivo?'))return; const u=state.users[owner]; const f=u.files.find(x=>x.id===id); u.files=u.files.filter(x=>x.id!==id); await audit('Archivo eliminado',f?.name||id,owner); await commit('Archivo eliminado'); }
function renderTickets(){
  const box=$('#ticketsList'), empty=$('#ticketsEmpty'); const items=isAdmin()?allItems('tickets'):(currentData().tickets||[]);
  empty.classList.toggle('hidden', items.length>0);
  box.innerHTML=items.map(t=>`<div class="ticket"><b>${escapeHtml(t.title)}</b><span>${escapeHtml(t.type)} · ${escapeHtml(t.status)}</span><p>${escapeHtml(t.description)}</p>${isAdmin()?`<small>${escapeHtml(t.ownerName)} (@${escapeHtml(t.owner)})</small><div class="admin-actions"><button data-close="${t.id}" data-owner="${t.owner}">Cerrar</button><button class="danger" data-delticket="${t.id}" data-owner="${t.owner}">Eliminar</button></div>`:''}</div>`).join('');
  $$('[data-close]').forEach(b=>b.onclick=()=>closeTicket(b.dataset.owner,b.dataset.close));
  $$('[data-delticket]').forEach(b=>b.onclick=()=>deleteTicket(b.dataset.owner,b.dataset.delticket));
}
$('#requestForm').addEventListener('submit', async e=>{ e.preventDefault(); const title=$('#requestTitle').value.trim(), type=$('#requestType').value, description=$('#requestDescription').value.trim(); const u=state.users[currentUser.username]; u.tickets.push({id:uid(),owner:u.username,title,type,description,status:'Abierto',date:'Ahora'}); if(type==='Nuevo proyecto') u.projects.push({id:uid(),owner:u.username,title:title.toUpperCase(),description,status:'Solicitado',progress:10,delivery:'Por definir',next:'Atlas Creative revisará la solicitud'}); u.activity.unshift({text:'Solicitud enviada: '+title,date:'Ahora'}); e.target.reset(); await audit('Ticket creado',`${type} · ${title}`,u.username); await commit('Solicitud autoguardada'); });
async function closeTicket(owner,id){ const t=state.users[owner].tickets.find(x=>x.id===id); if(t)t.status='Cerrado'; await audit('Ticket cerrado',t?.title||id,owner); await commit('Ticket actualizado'); }
async function deleteTicket(owner,id){ if(!confirm('¿Eliminar ticket?'))return; const u=state.users[owner]; const t=u.tickets.find(x=>x.id===id); u.tickets=u.tickets.filter(x=>x.id!==id); await audit('Ticket eliminado',t?.title||id,owner); await commit('Ticket eliminado'); }
function renderSettings(){
  const u=currentData(); $('#setName').value=u.name||''; $('#setUser').value=u.username||''; $('#setEmail').value=u.email||''; $('#setCompany').value=u.company||'';
  $('#adminAuditSettings').classList.toggle('hidden', !isAdmin());
  if(isAdmin()){ $('#webhookUrl').value=state.settings.webhook||''; renderAuditPanel(); }
}
$('#settingsForm').addEventListener('submit', async e=>{ e.preventDefault(); const u=state.users[currentUser.username]; u.name=$('#setName').value.trim()||u.username; u.email=$('#setEmail').value.trim(); u.company=$('#setCompany').value.trim(); await audit('Perfil actualizado','Datos de perfil actualizados',u.username); await commit('Perfil autoguardado'); });
$('#webhookForm').addEventListener('submit', async e=>{ e.preventDefault(); state.settings.webhook=$('#webhookUrl').value.trim(); await audit('Webhook actualizado','URL de Discord guardada/actualizada','Discord'); await commit('Webhook autoguardado para todos'); });
$('#testWebhook').onclick=async()=>{ await audit('Prueba de webhook','Mensaje de prueba enviado desde Atlas Creative','Discord'); await commit('Prueba de webhook enviada'); };
$('#clearAudit').onclick=async()=>{ if(confirm('¿Vaciar registro de auditoría para todos?')){ state.audit=[]; await commit('Auditoría vaciada'); } };
function renderAuditPanel(){ const box=$('#auditList'); if(!box)return; box.innerHTML=(state.audit||[]).length?(state.audit||[]).slice(0,30).map(a=>`<div class="audit-item"><b>${escapeHtml(a.action)}</b><span>${escapeHtml(a.user)} → ${escapeHtml(a.target||'—')}</span><small>${escapeHtml(a.date)}</small><p>${escapeHtml(a.detail||'')}</p></div>`).join(''):'<p class="muted">No hay acciones registradas.</p>'; }
const msgInput=$('#messageText'); if(msgInput){ msgInput.addEventListener('input',()=>{ localStorage.setItem(DRAFT_KEY,msgInput.value); showSaveState('Borrador local guardado'); }); msgInput.value=localStorage.getItem(DRAFT_KEY)||''; }

initRealtimeBackend();
setTimeout(()=>{ if(!firstLoadDone) setCloudStatus('Esperando Firestore. Revisa reglas/API key.', false); }, 3500);
