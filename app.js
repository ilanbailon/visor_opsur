if (location.protocol === 'file:') alert('⚠️ Abre con http://localhost (python -m http.server o Live Server).');

const SUPABASE_URL = 'https://vupofyzkwyaejismuzfn.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ1cG9meXprd3lhZWppc211emZuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg2MjUyOTEsImV4cCI6MjA3NDIwMTI5MX0.ITQUUW5CxLROoUiZkO5Hx-u5xtBRSF1UsSJW7RWhLZA';
const R2_UPLOADER_URL = 'https://geoportal-r2-uploader.ilanbailonbruna.workers.dev';
const VIEW = { pitch: 0, yaw: 0, hfov: 108 };
const HIDE_POINTS_ZOOM = 14;

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* ====== Busy / Progreso (CSV/ZIP/imagenes) ====== */
const loading = document.getElementById('loading');
const loadingMsg = document.getElementById('loadingMsg');
const loadingTitle = document.getElementById('loadingTitle');
const progressBar = document.getElementById('progressBar');
const busyBadge = document.getElementById('busyBadge');
const busyText = document.getElementById('busyText');
const btnCancelBusy = document.getElementById('btnCancelBusy');
const btnHideBusy = document.getElementById('btnHideBusy');
const attachmentsPanel = document.getElementById('attachmentsPanel');
const attachmentsListEl = document.getElementById('attachmentsList');
const attachmentsEmptyEl = document.getElementById('attachmentsEmpty');
const emAttachListEl = document.getElementById('emAttachList');

let currentBusy = { active:false, label:'', cancel:false, total:0, done:0 };
let currentMarcacionId = null;
let attachmentsByMarcacion = new Map();

function beginBusy(label, total=0){
  currentBusy = { active:true, label, cancel:false, total, done:0 };
  if (loadingTitle) loadingTitle.textContent = label || 'Procesando…';
  loadingMsg.textContent = 'Inicializando…';
  if (progressBar) progressBar.style.width = '0%';
  if (busyText) busyText.textContent = 'Cargando…';
  if (busyBadge) busyBadge.style.display = 'inline-flex';
  showLoading();
}
function setBusyMsg(msg){ loadingMsg.textContent = msg||'Procesando…'; if (busyText) busyText.textContent = (currentBusy.label||'Cargando…'); }
function setBusyProgress(done, total, submsg){
  currentBusy.done = Math.max(0, done|0);
  currentBusy.total = Math.max(0, total|0);
  const pct = total>0 ? Math.min(100, Math.round((done/total)*100)) : 0;
  if (progressBar) progressBar.style.width = pct+'%';
  loadingMsg.textContent = (submsg ? submsg+' · ' : '') + (total>0 ? `${pct}%` : '');
  if (busyText) busyText.textContent = `${currentBusy.label||'Cargando'} ${pct}%`;
}
function endBusy(){ currentBusy.active=false; if (busyBadge) busyBadge.style.display='none'; hideLoading(); }
btnCancelBusy && (btnCancelBusy.onclick = ()=>{ currentBusy.cancel=true; loadingMsg.textContent='Cancelando…'; });
btnHideBusy && (btnHideBusy.onclick = ()=>{ hideLoading(); });
busyBadge && (busyBadge.onclick = ()=>{ showLoading(); });

function showLoading(){ loading.style.display='grid'; }
function hideLoading(){ loading.style.display='none'; }

/* ===== Split ===== */
(function(){
  const gutter = document.getElementById('gutter'); let dragging=false;
  gutter.addEventListener('mousedown', ()=> dragging=true);
  window.addEventListener('mouseup', ()=> dragging=false);
  window.addEventListener('mousemove', (e)=>{
    if(!dragging) return; const min=220, max=window.innerWidth-320;
    const x=Math.min(Math.max(e.clientX,min),max);
    document.documentElement.style.setProperty('--left-w', x+'px');
    localStorage.setItem('split-left', String(x));
    map.invalidateSize(); panoViewer?.resize?.();
  });
  const saved=Number(localStorage.getItem('split-left'));
  if(saved && saved>200 && saved<window.innerWidth-200){
    document.documentElement.style.setProperty('--left-w', saved+'px');
    setTimeout(()=>{ map.invalidateSize(); panoViewer?.resize?.(); }, 200);
  }
})();

/* ===== UI helpers ===== */
const statusEl = document.getElementById('status');
function setStatus(t){ statusEl.textContent=t; clearTimeout(setStatus._t); setStatus._t=setTimeout(()=>statusEl.textContent='Listo',3000); }
function esc(s){ return String(s??'').replace(/[&<>"']/g, c=>({"&":"&amp;","<":"&gt;","\"":"&quot;","'":"&#39;"}[c])); }
function xmlEscape(s){
  const map = { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&apos;' };
  return String(s ?? '').replace(/[&<>"']/g, c=>map[c]);
}
function detectField(obj,cands){ const ks=Object.keys(obj||{}); for(const c of cands){ const k=ks.find(k=>k.toLowerCase()===c.toLowerCase()); if(k) return k; } for(const c of cands){ const k=ks.find(k=>k.toLowerCase().includes(c.toLowerCase())); if(k) return k; } return null; }
function toNumberFlexible(v){ if(v==null) return NaN; if(typeof v==='number') return v; if(typeof v!=='string') return NaN; const n=parseFloat(v.trim().replace(/\s+/g,'').replace(',', '.')); return Number.isFinite(n)?n:NaN; }
function sanitizePath(s){ return String(s||'').normalize('NFKD').replace(/[^a-zA-Z0-9_\-\/\.]+/g,'-').replace(/--+/g,'-').replace(/^-+|-+$/g,''); }

/* ===== Loading del visor (por imagen) ===== */
const viewerLoading = document.getElementById('viewerLoading');
const viewerLoadingText = document.getElementById('viewerLoadingText');

function showViewerLoading(msg){
  if (!viewerLoading) return;
  viewerLoadingText.textContent = msg || 'Cargando imagen…';
  viewerLoading.classList.add('show');
}
function setViewerLoadingProgress(done, total){
  if (!viewerLoading) return;
  if (!total) return;
  const pct = Math.min(100, Math.round((done/total)*100));
  viewerLoadingText.textContent = `Cargando imagen… ${pct}%`;
}
function hideViewerLoading(){
  if (!viewerLoading) return;
  viewerLoading.classList.remove('show');
}

function getAttachmentName(att){
  if (!att) return 'Archivo';
  if (att.nombre && String(att.nombre).trim()) return att.nombre;
  if (att.archivo_r2_key) return String(att.archivo_r2_key).split('/').pop();
  if (att.archivo_url) return String(att.archivo_url).split('/').pop();
  return 'Archivo';
}

function buildAttachmentSrc(att){
  if (!att) return '';
  const base = R2_UPLOADER_URL.replace(/\/$/,'');
  if (att.archivo_r2_key){
    const key = String(att.archivo_r2_key);
    return `${base}/raw-public/${encodeURI(key)}`;
  }
  if (att.archivo_url){
    return `${base}/raw?url=${encodeURIComponent(att.archivo_url)}`;
  }
  return '';
}

function setAttachmentsCache(rows){
  attachmentsByMarcacion = new Map();
  for (const att of rows || []){
    const list = attachmentsByMarcacion.get(att.marcacion_id) || [];
    list.push(att);
    attachmentsByMarcacion.set(att.marcacion_id, list);
  }
  for (const list of attachmentsByMarcacion.values()){
    list.sort((a,b)=> new Date(a.created_at||0) - new Date(b.created_at||0));
  }
}

function appendAttachmentsToCache(rows){
  for (const att of rows || []){
    const list = attachmentsByMarcacion.get(att.marcacion_id) || [];
    list.push(att);
    list.sort((a,b)=> new Date(a.created_at||0) - new Date(b.created_at||0));
    attachmentsByMarcacion.set(att.marcacion_id, list);
  }
}

function removeAttachmentFromCache(attId, marcacionId){
  if (!attachmentsByMarcacion.has(marcacionId)) return;
  const list = (attachmentsByMarcacion.get(marcacionId) || []).filter(att => att.id !== attId);
  attachmentsByMarcacion.set(marcacionId, list);
}

function renderAttachmentsPanelFor(marcacionId){
  if (!attachmentsPanel) return;
  if (!marcacionId){
    attachmentsPanel.classList.remove('show');
    if (attachmentsListEl) attachmentsListEl.innerHTML = '';
    if (attachmentsEmptyEl) attachmentsEmptyEl.style.display = 'block';
    return;
  }
  const list = attachmentsByMarcacion.get(marcacionId) || [];
  attachmentsPanel.classList.add('show');
  if (attachmentsListEl){
    attachmentsListEl.innerHTML = '';
    for (const att of list){
      const li = document.createElement('li');
      li.className = 'attach-item';
      const url = buildAttachmentSrc(att);
      const name = esc(getAttachmentName(att));
      const meta = att.mime_type ? `<span class="attach-meta">${esc(att.mime_type)}</span>` : '';
      li.innerHTML = `${url ? `<a href="${url}" target="_blank" rel="noopener">📎 ${name}</a>` : `<span>${name}</span>`}${meta}`;
      attachmentsListEl.appendChild(li);
    }
  }
  if (attachmentsEmptyEl){
    attachmentsEmptyEl.style.display = list.length ? 'none' : 'block';
  }
}

function renderEditAttachments(marcacionId){
  if (!emAttachListEl) return;
  const list = attachmentsByMarcacion.get(marcacionId) || [];
  emAttachListEl.innerHTML = '';
  if (!list.length){
    const li = document.createElement('li');
    li.className = 'muted';
    li.textContent = 'Sin adjuntos';
    emAttachListEl.appendChild(li);
    return;
  }
  for (const att of list){
    const li = document.createElement('li');
    li.className = 'attach-item';
    const url = buildAttachmentSrc(att);
    const name = esc(getAttachmentName(att));
    const meta = att.mime_type ? `<span class="attach-meta">${esc(att.mime_type)}</span>` : '';
    li.innerHTML = `${url ? `<a href="${url}" target="_blank" rel="noopener">📎 ${name}</a>` : `<span>${name}</span>`}${meta}` +
      `<button type="button" class="attach-remove" data-attach-id="${att.id}" data-attach-mar="${att.marcacion_id}">Eliminar</button>`;
    emAttachListEl.appendChild(li);
  }
}

function setCurrentMarcacion(id){
  currentMarcacionId = id || null;
  renderAttachmentsPanelFor(currentMarcacionId);
}

emAttachListEl?.addEventListener('click', async (ev)=>{
  const btn = ev.target.closest('.attach-remove');
  if (!btn) return;
  const attId = Number(btn.dataset.attachId);
  const marcId = Number(btn.dataset.attachMar);
  if (!attId || !marcId) return;
  if (!confirm('¿Eliminar el adjunto seleccionado?')) return;
  const msg = document.getElementById('editMarkMsg');
  try{
    beginBusy('Eliminando adjunto', 0);
    await deleteAttachment(attId);
    removeAttachmentFromCache(attId, marcId);
    renderEditAttachments(marcId);
    if (currentMarcacionId === marcId) renderAttachmentsPanelFor(marcId);
    if (msg) msg.textContent = 'Adjunto eliminado';
  }catch(err){
    console.error(err);
    if (msg) msg.textContent = 'Error: ' + err.message;
  }finally{
    endBusy();
  }
});

/* Vista vacía (sin imagen) */
function showEmptyViewer(){
  document.getElementById('panoContainer').style.display = 'none';
  document.getElementById('photoContainer').classList.remove('show');
  document.getElementById('controlsPhoto').style.display = 'none';
  document.getElementById('controlsRun').style.display = 'none';
  hideViewerLoading();
}

/* Descarga con progreso (si hay Content-Length) */
async function fetchBlobWithProgress(url, onProgress){
  const resp = await fetch(url, { cache:'force-cache' });
  if (!resp.ok) throw new Error('HTTP '+resp.status);

  if (!resp.body || !resp.body.getReader) {
    const b = await resp.blob();
    onProgress?.(1,1);
    return b;
  }
  const reader = resp.body.getReader();
  const total = Number(resp.headers.get('Content-Length')) || 0;
  let received = 0;
  const chunks = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    if (total && onProgress) onProgress(received, total);
  }
  return new Blob(chunks, { type: resp.headers.get('Content-Type') || 'application/octet-stream' });
}

/* ===== Mapa ===== */
const map = L.map('map', { zoomControl:true }).setView([-14.10,-70.44],13);
const hib = L.tileLayer('https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}',{maxZoom:21, attribution:'Map data &copy; Google'}).addTo(map);
const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:21, attribution:'&copy; OpenStreetMap'});
const sat = L.tileLayer('https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}',{maxZoom:21, attribution:'Imagery &copy; Google'});
const dark = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',{maxZoom:21, attribution:'&copy; OSM, &copy; CARTO'});

/* Controles de capas */
const overlays = {};
const baseControl = L.control.layers({'Google Híbrido':hib,'Google Satélite':sat,'OSM':osm,'Carto Dark':dark}, null, {
  collapsed:true, position:'topright'
}).addTo(map);
const overlayControl = L.control.layers(null, overlays, { collapsed:false, position:'topright' }).addTo(map);

function enhanceOverlayControlZoomButtons(){
  const list = overlayControl._overlaysList; if(!list) return;
  Array.from(list.querySelectorAll('label')).forEach(label=>{
    if (label.querySelector('.zoomBtn')) return;
    const txt = label.textContent.trim();
    const btn = document.createElement('button');
    btn.className='zoomBtn'; btn.type='button'; btn.textContent='🔍';
    btn.title='Zoom a la capa';
    btn.onclick = ()=>{
      if (txt=== MARC_LABEL){
        if (marcacionesCluster.getLayers().length){
          map.fitBounds(marcacionesCluster.getBounds().pad(0.2));
        }
      } else {
        const s = groups.get(txt);
        if (s?.bounds) map.fitBounds(s.bounds.pad(0.2));
      }
    };
    label.appendChild(btn);
  });
}

/* ===== Estructuras de capas ===== */
const groups = new Map(); // nombre -> { parent, points, line, rows, bounds }
function ensureGroupStruct(name){
  const gname = name ?? 'Sin grupo';
  if (groups.has(gname)) return groups.get(gname);
  const parent = L.layerGroup();
  const points = L.layerGroup();
  parent.addLayer(points);
  parent.addTo(map);
  overlays[gname] = parent; overlayControl.addOverlay(parent, gname);
  const obj = { parent, points, line:null, rows:[], bounds:null };
  groups.set(gname, obj);
  setTimeout(enhanceOverlayControlZoomButtons, 50);
  return obj;
}

/* ===== Marcaciones (cluster) ===== */
function getMarcacionIcon(tipo){
  if (tipo === '360') {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28"><circle cx="14" cy="14" r="12" fill="#0ea5e9" stroke="#0c4a6e" stroke-width="2"/><text x="14" y="18" font-family="sans-serif" font-size="14" text-anchor="middle" fill="#001219">🕶️</text></svg>`;
    return L.divIcon({ html: svg, className: '', iconSize:[28,28], iconAnchor:[14,14] });
  } else if (tipo === 'foto') {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28"><circle cx="14" cy="14" r="12" fill="#f59e0b" stroke="#78350f" stroke-width="2"/><text x="14" y="18" font-family="sans-serif" font-size="14" text-anchor="middle" fill="#1f1300">📷</text></svg>`;
    return L.divIcon({ html: svg, className: '', iconSize:[28,28], iconAnchor:[14,14] });
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28"><circle cx="14" cy="14" r="12" fill="#e5e7eb" stroke="#6b7280" stroke-width="2"/></svg>`;
  return L.divIcon({ html: svg, className: '', iconSize:[28,28], iconAnchor:[14,14] });
}

const marcacionesCluster = L.markerClusterGroup({
  showCoverageOnHover:false,
  spiderfyOnMaxZoom:true,
  maxClusterRadius:50
}).addTo(map);
const MARC_LABEL = 'Puntos';
overlays[MARC_LABEL] = marcacionesCluster;
overlayControl.addOverlay(marcacionesCluster, MARC_LABEL);
setTimeout(enhanceOverlayControlZoomButtons, 50);

/* ===== Datos ===== */
let allRows = [];            // fotos_recorrido
let allMarcs = [];           // marcaciones
const markerById = new Map();// recorrido: id -> circleMarker
let routeLayerActive = null;

const BASE_VERTEX_STYLE = { radius:7, weight:1.8, opacity:.95, fillOpacity:.95 };
const HIGHLIGHT_VERTEX_STYLE = { radius:9, weight:2.6, opacity:1, fillOpacity:1 };

function buildSrc(row){
  const base = R2_UPLOADER_URL.replace(/\/$/,'');
  if (row?.foto_r2_key){
    const key = String(row.foto_r2_key).replace(/^fotos\//,'');
    return `${base}/raw-public/${encodeURI(key)}`;
  }
  if (row?.foto_url) return `${base}/raw?url=${encodeURIComponent(row.foto_url)}`;
  return '';
}

/* ===== Carga de recorridos ===== */
async function loadFotos(filterText){
  setStatus('Cargando recorridos…');
  for (const obj of groups.values()){
    obj.parent.clearLayers(); obj.points.clearLayers(); obj.line=null; obj.rows=[]; obj.bounds=null;
  }
  markerById.clear(); allRows = [];

  let q = supabase.from('fotos_recorrido')
    .select('id,numero,progresiva,codigo,este,norte,grupo,foto_url,foto_r2_key,descripcion')
    .order('id');
  if (filterText?.trim()) q = q.ilike('progresiva', `%${filterText.trim()}%`);
  const { data, error } = await q;
  if(error){ console.error(error); setStatus('Error'); return; }
  allRows = data||[];

  const bounds = L.latLngBounds(); let count=0;

  const byGroup = new Map();
  for (const r of allRows){
    const gname = r.grupo ?? 'Sin grupo';
    if(!byGroup.has(gname)) byGroup.set(gname, []);
    byGroup.get(gname).push(r);
  }

  for (const [gname, arr] of byGroup){
    arr.sort((a,b)=>{
      const na = (a.numero==null?Infinity:Number(a.numero));
      const nb = (b.numero==null?Infinity:Number(b.numero));
      if (Number.isFinite(na) && Number.isFinite(nb) && na!==nb) return na-nb;
      return a.id-b.id;
    });
    const grp = ensureGroupStruct(gname);
    grp.rows = arr;

    const latlngs = [];
    for (const row of arr){
      const lat=Number(row.norte), lng=Number(row.este);
      if(!Number.isFinite(lat)||!Number.isFinite(lng)) continue;

      latlngs.push([lat,lng]);
      const hasDesc = Boolean(String(row.descripcion || '').trim());
      const className = hasDesc ? 'vtx-point vtx-has-desc' : 'vtx-point';
      const cm = L.circleMarker([lat,lng], Object.assign({}, BASE_VERTEX_STYLE, { className }))
        .bindPopup(popupRec(row));
      cm.on('click', ()=> onRecClick(row, cm));
      cm.addTo(grp.points);
      markerById.set(row.id, cm);
      bounds.extend([lat,lng]); count++;
    }
    if (latlngs.length >= 2){
      grp.line = L.polyline(latlngs, { color:'#22d3ee', weight:3.5, opacity:.8 }).addTo(grp.parent);
      grp.bounds = grp.line.getBounds();
    } else if (latlngs.length === 1){
      grp.bounds = L.latLngBounds(latlngs[0], latlngs[0]);
    }
    grp.parent.addLayer(grp.points);
  }

  refillGroupSelector();
  updateCountPts();
  if (count>0) map.fitBounds(bounds.pad(0.2));
  setStatus(`Recorridos: ${count} punto(s)`);
  clearCaches();
  drawRoute();
  updatePointsVisibility();
  enhanceOverlayControlZoomButtons();
}

function popupRec(r){
  const name = esc(r.progresiva ?? r.codigo ?? 'Sin etiqueta');
  const desc = r.descripcion ? `<br><em>${esc(r.descripcion)}</em>` : '';
  return `<b>${name}</b>${desc}<br><small>#${r.numero ?? '-'} · Grupo: ${esc(r.grupo ?? 'Sin grupo')} · id:${r.id}</small>
          <div style="margin-top:6px">
            <button class="ghost" onclick="window.__editRec(${r.id});return false;">✎ Editar</button>
          </div>`;
}
window.__editRec = (id)=>{
  const row = allRows.find(x=>x.id===id); if(!row) return;
  document.getElementById('erId').value = row.id;
  document.getElementById('erProg').value = row.progresiva || '';
  document.getElementById('erDesc').value = row.descripcion || '';
  openModal(document.getElementById('editRecModal'));
};

/* ===== Carga de marcaciones ===== */
async function loadMarcaciones(){
  setStatus('Cargando marcaciones…');
  marcacionesCluster.clearLayers();
  const [marcsRes, attachRes] = await Promise.all([
    supabase
      .from('marcaciones')
      .select('id,nombre,descripcion,lat,lng,tipo,foto_url,foto_r2_key,created_at')
      .order('id'),
    supabase
      .from('marcaciones_adjuntos')
      .select('id,marcacion_id,nombre,archivo_url,archivo_r2_key,mime_type,created_at')
      .order('created_at')
  ]);
  if (marcsRes.error){
    console.error(marcsRes.error);
    setStatus('Error cargando marcaciones');
    return;
  }
  if (attachRes.error){
    console.error('Error cargando adjuntos', attachRes.error);
    setAttachmentsCache([]);
  } else {
    setAttachmentsCache(attachRes.data || []);
  }
  allMarcs = marcsRes.data || [];
  for(const row of allMarcs){ addMarcacionMarker(row); }
  setStatus(`Marcaciones: ${allMarcs.length}`);
  enhanceOverlayControlZoomButtons();
  if (currentMarcacionId && !allMarcs.some(x=>x.id===currentMarcacionId)){
    currentMarcacionId = null;
  }
  renderAttachmentsPanelFor(currentMarcacionId);
}

function addMarcacionMarker(row){
  const lat=Number(row.lat), lng=Number(row.lng); if(!Number.isFinite(lat)||!Number.isFinite(lng)) return;
  const icon=getMarcacionIcon(row.tipo);
  const html = `<b>${esc(row.nombre ?? 'Sin nombre')}</b>${row.descripcion? `<br><em>${esc(row.descripcion)}</em>`:''}
                <br><small>${esc(row.tipo||'sin imagen')}</small>
                <br><small>id: ${row.id} · ${lat.toFixed(6)}, ${lng.toFixed(6)}</small>
                <div style="margin-top:6px"><button class="ghost" onclick="window.__editMark(${row.id});return false;">✎ Editar</button></div>`;
  const m=L.marker([lat,lng],{icon}).bindPopup(html);
  m.on('click', async ()=>{
    setCurrentMarcacion(row.id);
    document.getElementById('viewerTitle').textContent = `Marcación · ${row.nombre}`;
    if (row.tipo === '360' && (row.foto_r2_key || row.foto_url)){
      await open360ForMarcacion(row);
    } else if (row.foto_r2_key || row.foto_url){
      await openPhotoForMarcacion(row);
    } else {
      showEmptyViewer(); // sin imagen: visor vacío
    }
  });
  marcacionesCluster.addLayer(m);
  return m;
}
window.__editMark = (id)=>{
  const r = allMarcs.find(x=>x.id===id); if(!r) return;
  document.getElementById('emId').value = r.id;
  document.getElementById('emNombre').value = r.nombre || '';
  document.getElementById('emTipo').value = r.tipo || '';
  document.getElementById('emDesc').value = r.descripcion || '';
  document.getElementById('emFile').value = '';
  document.getElementById('emRemove').checked = false;
  const emAttachments = document.getElementById('emAttachments');
  if (emAttachments) emAttachments.value = '';
  renderEditAttachments(r.id);
  const prev = document.getElementById('emPreview');
  if (r.foto_r2_key || r.foto_url){
    const src = buildSrc(r);
    prev.innerHTML = `<a href="${src}" target="_blank" rel="noopener">
        <img src="${src}" alt="preview" style="max-width:140px;max-height:90px;border:1px solid #334155;border-radius:6px">
      </a>`;
  } else { prev.textContent = '—'; }
  openModal(document.getElementById('editMarkModal'));
};

/* ===== Visibilidad puntos por zoom ===== */
function updatePointsVisibility(){
  const z = map.getZoom();
  for (const [name, obj] of groups){
    if (!obj.points) continue;
    if (z <= HIDE_POINTS_ZOOM){
      if (obj.parent.hasLayer(obj.points)) obj.parent.removeLayer(obj.points);
    } else {
      if (!obj.parent.hasLayer(obj.points)) obj.parent.addLayer(obj.points);
    }
  }
}
map.on('zoomend', updatePointsVisibility);

/* ===== Selector de grupo ===== */
function refillGroupSelector(){
  const sel=document.getElementById('selGrupo'); sel.innerHTML='';
  for (const name of groups.keys()){
    const opt=document.createElement('option'); opt.value=name; opt.textContent=name; sel.appendChild(opt);
  }
  if (sel.options.length) sel.value = sel.options[0].value;
}

/* ===== Highlight & ruta activa ===== */
let lastHighlight=null;
function applyVertexStyle(marker, style){
  if (!marker?.setStyle || !style) return;
  marker.setStyle({
    radius: style.radius,
    weight: style.weight,
    opacity: style.opacity,
    fillOpacity: style.fillOpacity
  });
}
function highlightVertex(cm){
  if (lastHighlight && lastHighlight.setStyle){
    applyVertexStyle(lastHighlight, BASE_VERTEX_STYLE);
    lastHighlight._path?.classList.remove('vtx-highlight');
  }
  applyVertexStyle(cm, HIGHLIGHT_VERTEX_STYLE);
  cm._path?.classList.add('vtx-highlight');
  lastHighlight=cm;
}
function drawRoute(){
  if(routeLayerActive){ routeLayerActive.remove(); routeLayerActive=null; }
  const g=document.getElementById('selGrupo').value; const obj=groups.get(g); if(!obj||!obj.rows.length) return;
  const latlngs=obj.rows.map(r=>[Number(r.norte), Number(r.este)]).filter(([a,b])=>Number.isFinite(a)&&Number.isFinite(b));
  if(latlngs.length>=2){ routeLayerActive=L.polyline(latlngs,{color:'#22d3ee',weight:3.5,opacity:.8}).addTo(map); }
}
function updateCountPts(){
  const g=document.getElementById('selGrupo').value;
  const obj=groups.get(g);
  document.getElementById('countPts').textContent = `${obj?.rows?.length || 0} pts`;
}

function toSheetName(name){
  const clean = String(name || 'Recorrido').replace(/[\\/:*?\[\]]/g, ' ').trim() || 'Recorrido';
  return clean.slice(0, 31);
}

function exportSelectedRecorrido(){
  const groupName = document.getElementById('selGrupo').value || 'Sin grupo';
  const obj = groups.get(groupName) || { rows: [] };
  const rows = obj.rows || [];
  if (!rows.length){
    setStatus('No hay puntos para exportar');
    return;
  }
  if (typeof XLSX === 'undefined' || !XLSX?.utils){
    console.error('Librería XLSX no disponible');
    setStatus('Error exportando: XLSX no cargado');
    return;
  }

  const data = rows.map((row, idx)=>{
    const lat = Number(row.norte);
    const lng = Number(row.este);
    const hasCoords = Number.isFinite(lat) && Number.isFinite(lng);
    return {
      '#': row.numero ?? (idx + 1),
      Progresiva: row.progresiva || row.codigo || '',
      'Coordenadas (lat, lng)': hasCoords ? `${lat.toFixed(6)}, ${lng.toFixed(6)}` : '',
      Descripción: row.descripcion || ''
    };
  });

  const sheet = XLSX.utils.json_to_sheet(data, { header: ['#','Progresiva','Coordenadas (lat, lng)','Descripción'] });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, toSheetName(groupName));
  const fileName = `recorrido_${sanitizePath(groupName || 'sin_grupo') || 'recorrido'}.xlsx`;
  XLSX.writeFile(wb, fileName);
  setStatus('Excel generado');
}

async function exportSelectedRecorridoKMZ(){
  const groupName = document.getElementById('selGrupo').value || 'Sin grupo';
  const obj = groups.get(groupName) || { rows: [] };
  const rows = (obj.rows || []).filter(row=>{
    const lat = Number(row.norte);
    const lng = Number(row.este);
    return Number.isFinite(lat) && Number.isFinite(lng);
  });
  if (!rows.length){
    setStatus('Sin coordenadas válidas para KMZ');
    return;
  }
  if (typeof JSZip === 'undefined'){
    console.error('Librería JSZip no disponible');
    setStatus('Error exportando KMZ: JSZip no cargado');
    return;
  }

  try{
    const placemarks = rows.map((row, idx)=>{
      const lat = Number(row.norte);
      const lng = Number(row.este);
      const label = row.progresiva || row.codigo || `Punto ${row.numero ?? (idx + 1)}`;
      const styleId = row.descripcion ? 'sHasDesc' : 'sDefault';
      const descParts = [];
      if (row.descripcion){
        descParts.push(`<p><strong>Descripción:</strong> ${esc(row.descripcion)}</p>`);
      }
      descParts.push(`<p><strong>Progresiva:</strong> ${esc(row.progresiva || row.codigo || '—')}</p>`);
      descParts.push(`<p><strong>Coordenadas:</strong> ${lng.toFixed(6)}, ${lat.toFixed(6)}</p>`);
      if (row.numero != null) descParts.push(`<p><strong>#:</strong> ${esc(row.numero)}</p>`);
      return `    <Placemark>
      <name>${xmlEscape(label)}</name>
      <styleUrl>#${styleId}</styleUrl>
      <description><![CDATA[${descParts.join('')}]]></description>
      <Point><coordinates>${lng.toFixed(6)},${lat.toFixed(6)},0</coordinates></Point>
    </Placemark>`;
    }).join('\n');

    let routePlacemark = '';
    if (rows.length >= 2){
      const coordStr = rows.map(row=>{
        const lat = Number(row.norte);
        const lng = Number(row.este);
        return `${lng.toFixed(6)},${lat.toFixed(6)},0`;
      }).join(' ');
      routePlacemark = `    <Placemark>
      <name>${xmlEscape(`Ruta ${groupName}`)}</name>
      <styleUrl>#sRoute</styleUrl>
      <LineString>
        <tessellate>1</tessellate>
        <coordinates>${coordStr}</coordinates>
      </LineString>
    </Placemark>\n`;
    }

    const kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${xmlEscape(groupName || 'Recorrido')}</name>
    <Style id="sDefault">
      <IconStyle>
        <scale>1.1</scale>
        <Icon>
          <href>http://maps.google.com/mapfiles/kml/paddle/ylw-circle.png</href>
        </Icon>
      </IconStyle>
    </Style>
    <Style id="sHasDesc">
      <IconStyle>
        <scale>1.15</scale>
        <Icon>
          <href>http://maps.google.com/mapfiles/kml/paddle/orange-stars.png</href>
        </Icon>
      </IconStyle>
    </Style>
    <Style id="sRoute">
      <LineStyle>
        <color>ffeed322</color>
        <width>3.2</width>
      </LineStyle>
    </Style>
${routePlacemark}${placemarks}
  </Document>
</kml>`;

    const zip = new JSZip();
    zip.file('doc.kml', kml);
    const blob = await zip.generateAsync({ type:'blob', compression:'DEFLATE' });
    const fileName = `recorrido_${sanitizePath(groupName || 'sin_grupo') || 'recorrido'}.kmz`;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(()=> URL.revokeObjectURL(url), 10_000);
    setStatus('KMZ generado');
  }catch(err){
    console.error('Falló exportación KMZ', err);
    setStatus('Error exportando KMZ');
  }
}

/* ===== Click recorrido (manual) ===== */
function onRecClick(row, cm){
  const groupName = row.grupo ?? 'Sin grupo';
  const sel = document.getElementById('selGrupo');
  if (sel.value !== groupName) { sel.value = groupName; drawRoute(); updateCountPts(); }
  const obj = groups.get(groupName) || { rows:[] };
  const idx = obj.rows.findIndex(r => r.id === row.id);
  if (idx !== -1) { playIdx = idx; updateNowInfo(row, idx, obj.rows.length); }
  map.panTo(cm.getLatLng());
  highlightVertex(cm);
  setCurrentMarcacion(null);
  if (row.foto_url || row.foto_r2_key) {
    open360ForRow(row, /*fallbackToPhoto=*/true, /*suppress=*/false);
  } else {
    showEmptyViewer(); // sin imagen → visor vacío
  }
  document.getElementById('viewerTitle').textContent = `Grupo · #${row.numero??''} ${row.progresiva||row.codigo||''}`;
}

/* ===== Pannellum / Foto ===== */
let panoViewer=null;

function showPanoControlsOnly(){
  document.getElementById('panoContainer').style.display='block';
  document.getElementById('photoContainer').classList.remove('show');
  document.getElementById('controlsPhoto').style.display='none';
  document.getElementById('controlsRun').style.display='flex';
}
function ensurePanoViewer(){
  if (panoViewer) return panoViewer;
  showPanoControlsOnly();
  panoViewer = pannellum.viewer('panoContainer', {
    default:{ firstScene:'boot', autoLoad:true, sceneFadeDuration:600, strings:{ loadingLabel:"", loadButtonLabel:"" } },
    scenes:{ boot:{ type:'equirectangular', panorama:'data:image/gif;base64,R0lGODlhAQABAAAAACw=', autoLoad:true, pitch:VIEW.pitch, yaw:VIEW.yaw, hfov:VIEW.hfov } },
    showZoomCtrl:true
  });
  return panoViewer;
}
function showPhotoControls(){
  document.getElementById('controlsPhoto').style.display='flex';
  document.getElementById('controlsRun').style.display='none';
  document.getElementById('panoContainer').style.display='none';
  document.getElementById('photoContainer').classList.add('show');
}

const CACHE_MAX = 120;
const panoCache = new Map(); // key -> blobURL
const photoCache = new Map();
function cacheGet(map, key){ if(!map.has(key)) return null; const v=map.get(key); map.delete(key); map.set(key,v); return v; }
function cacheSet(map, key, val){ if(map.has(key)) map.delete(key); map.set(key,val);
  while(map.size > CACHE_MAX){ const k=map.keys().next().value; const u=map.get(k); map.delete(k); try{ URL.revokeObjectURL(u); }catch{} } }
function clearCaches(){ for(const u of panoCache.values()) try{URL.revokeObjectURL(u)}catch{}; for(const u of photoCache.values()) try{URL.revokeObjectURL(u)}catch{}; panoCache.clear(); photoCache.clear(); }

/* getObjUrl con progreso */
async function getObjUrl(row, onProgress){
  const src = buildSrc(row); if(!src) return null;
  const blob = await fetchBlobWithProgress(src, onProgress);
  return URL.createObjectURL(blob);
}

/* ===== Flag para ocultar overlay durante recorrido ===== */
let suppressViewerLoading = false;

/* 360 de recorrido (respeta suppress) */
async function open360ForRow(row, fallbackToPhoto=false, suppress=false){
  try{
    showPanoControlsOnly();
    if (!suppress) showViewerLoading('Cargando 360…');

    const v=ensurePanoViewer();
    const key='f:'+row.id;
    let objUrl = cacheGet(panoCache, key);
    if(!objUrl){
      objUrl = await getObjUrl(row, (d,t)=> { if (!suppress) setViewerLoadingProgress(d,t); });
      cacheSet(panoCache, key, objUrl);
    }

    const sceneId='pf_'+row.id+'_'+Date.now();
    v.addScene(sceneId,{type:'equirectangular', panorama:objUrl, autoLoad:true, pitch:VIEW.pitch, yaw:VIEW.yaw, hfov:VIEW.hfov});

    const onLoad = ()=>{ if (!suppress) hideViewerLoading(); v.off('load', onLoad); };
    v.on('load', onLoad);

    v.loadScene(sceneId, VIEW.pitch, VIEW.yaw, VIEW.hfov);
    requestAnimationFrame(()=> v.resize());
  }catch(e){
    console.warn('[360 grupo] fallo, fallback a foto', e);
    if (!suppress) hideViewerLoading();
    if (fallbackToPhoto) { await openPhotoGeneric(row, suppress); }
  }
}

/* 360 para marcación (SI muestra overlay) */
async function open360ForMarcacion(row){
  try{
    showPanoControlsOnly();
    showViewerLoading('Cargando 360…');

    const v=ensurePanoViewer();
    const key='m:'+row.id;
    let objUrl = cacheGet(panoCache, key);
    if(!objUrl){
      objUrl = await getObjUrl(row, (d,t)=> setViewerLoadingProgress(d,t));
      cacheSet(panoCache, key, objUrl);
    }

    const sceneId='pm_'+row.id+'_'+Date.now();
    v.addScene(sceneId,{type:'equirectangular', panorama:objUrl, autoLoad:true, pitch:VIEW.pitch, yaw:VIEW.yaw, hfov:VIEW.hfov});

    const onLoad = ()=>{ hideViewerLoading(); v.off('load', onLoad); };
    v.on('load', onLoad);

    v.loadScene(sceneId, VIEW.pitch, VIEW.yaw, VIEW.hfov);
    requestAnimationFrame(()=> v.resize());
  }catch(e){
    console.error('[360 marcación] fallo', e);
    hideViewerLoading();
    await openPhotoForMarcacion(row);
  }
}

/* Fotos normales (respeta suppress) */
async function openPhotoGeneric(row, suppress=false){
  try{
    if (!suppress) showViewerLoading('Cargando foto…');
    const key='f:'+row.id;
    let objUrl = cacheGet(photoCache, key);
    if(!objUrl){
      objUrl = await getObjUrl(row, (d,t)=> { if (!suppress) setViewerLoadingProgress(d,t); });
      cacheSet(photoCache, key, objUrl);
    }
    const img=document.getElementById('photoImg');
    if (!suppress) {
      img.onload = ()=> hideViewerLoading();
      img.onerror = ()=> hideViewerLoading();
    }
    img.src=objUrl; img.style.transform='scale(1)';
    showPhotoControls();
  }catch(e){
    console.error('[foto recorrido] fallo', e);
    if (!suppress) hideViewerLoading();
  }
}
async function openPhotoForMarcacion(row){
  try{
    showViewerLoading('Cargando foto…');
    const key='m:'+row.id;
    let objUrl = cacheGet(photoCache, key);
    if(!objUrl){
      objUrl = await getObjUrl(row, (d,t)=> setViewerLoadingProgress(d,t));
      cacheSet(photoCache, key, objUrl);
    }
    const img=document.getElementById('photoImg');
    img.onload = ()=> hideViewerLoading();
    img.onerror = ()=> hideViewerLoading();
    img.src=objUrl; img.style.transform='scale(1)';
    showPhotoControls();
  }catch(e){
    console.error('[foto marcación] fallo', e);
    hideViewerLoading();
  }
}

/* ===== Precarga inteligente ===== */
function computeLookahead(){
  const sec = Math.max(0.5, Number(document.getElementById('speed').value)||2);
  if (sec <= 1) return 10;
  if (sec <= 2) return 8;
  if (sec <= 3) return 6;
  return 5;
}
async function preloadList(list, concurrency=3){
  let i=0;
  await Promise.all(Array.from({length:Math.min(concurrency,list.length)}, async function worker(){
    while(i<list.length){
      const idx=i++; const r=list[idx]; const key='f:'+r.id;
      if (panoCache.has(key)) continue;
      try{ const obj = await getObjUrl(r); cacheSet(panoCache, key, obj); }catch(e){}
    }
  }));
}
async function warmup(group, startIdx){
  const obj=groups.get(group)||{rows:[]}; const arr=obj.rows; const need=computeLookahead(); const toFetch=[];
  for(let i=0;i<need;i++){ const r=arr[startIdx+i]; if(!r) break; const key='f:'+r.id; if(!panoCache.has(key)) toFetch.push(r); }
  await preloadList(toFetch, 3);
}
function ensureLookahead(group, idx){
  const obj=groups.get(group)||{rows:[]}; const arr=obj.rows; const need=computeLookahead(); const toFetch=[];
  for(let i=1;i<=need;i++){ const r=arr[idx+i]; if(!r) break; const key='f:'+r.id; if(!panoCache.has(key)) toFetch.push(r); }
  preloadList(toFetch, 3);
}

/* ===== Recorrido (sin loop) ===== */
let playTimer=null, playIdx=0;

document.getElementById('btnRecorrido').onclick = async ()=>{
  if(playTimer){ stopPlay(); return; }
  const g=document.getElementById('selGrupo').value;
  setStatus('Precargando…'); await warmup(g, playIdx); setStatus('Listo');
  startPlay();
};

document.getElementById('selGrupo').addEventListener('change', ()=>{ stopPlay(); drawRoute(); updateCountPts(); playIdx=0; updateNowInfo(); clearCaches(); });
document.getElementById('btnPrev').onclick = ()=> step(-1, true);
document.getElementById('btnNext').onclick = ()=> step(+1, true);

const btnExportRecorrido = document.getElementById('btnExportRecorrido');
if (btnExportRecorrido) btnExportRecorrido.onclick = exportSelectedRecorrido;
const btnExportKMZ = document.getElementById('btnExportKMZ');
if (btnExportKMZ) btnExportKMZ.onclick = exportSelectedRecorridoKMZ;

document.getElementById('btnExportRecorrido').onclick = exportSelectedRecorrido;

document.getElementById('btnPlay').onclick = async ()=>{
  if(playTimer){ stopPlay(); return; }
  const g=document.getElementById('selGrupo').value;
  setStatus('Precargando…'); await warmup(g, playIdx); setStatus('Listo');
  startPlay();
};

function startPlay(){
  if(playTimer) return;

  // Mensaje ligero y suprimir overlay durante el run
  setStatus('Iniciando recorrido…');
  suppressViewerLoading = true;

  showAt(playIdx, true);
  const interval = Math.max(500, Number(document.getElementById('speed').value)*1000);
  playTimer = setInterval(()=>step(+1,false), interval);
  document.getElementById('btnPlay').textContent='⏸️';
}
function stopPlay(){
  if(playTimer){
    clearInterval(playTimer);
    playTimer=null;
    document.getElementById('btnPlay').textContent='▶';
  }
  suppressViewerLoading = false; // volver a mostrar overlay fuera del run
}
function step(delta, manual){
  const g=document.getElementById('selGrupo').value; const obj=groups.get(g)||{rows:[]}; const arr=obj.rows;
  if(!arr.length){ stopPlay(); return; }
  playIdx += delta;
  if (playIdx >= arr.length){ stopPlay(); playIdx = arr.length-1; }
  if (playIdx < 0) playIdx = 0;
  showAt(playIdx, manual);
  ensureLookahead(g, playIdx);
}
function showAt(i, openPopup){
  const g=document.getElementById('selGrupo').value; const obj=groups.get(g)||{rows:[]}; const arr=obj.rows; if(!arr.length) return;
  const row=arr[i]; if(!row) return;
  const m=markerById.get(row.id);
  if(m){ map.panTo(m.getLatLng()); if (openPopup) m.openPopup(); highlightVertex(m); }
  playIdx=i; updateNowInfo(row, i, arr.length);
  setCurrentMarcacion(null);
  if (row.foto_url || row.foto_r2_key){
    // Durante recorrido, suppressViewerLoading=true → no mostrar overlay por imagen
    open360ForRow(row, /*fallbackToPhoto=*/true, /*suppress=*/suppressViewerLoading);
  } else {
    showEmptyViewer(); // punto sin imagen → visor vacío
  }
}
function updateNowInfo(row,i,total){
  const el=document.getElementById('nowInfo');
  if(!row){ el.textContent='—'; return; }
  el.innerHTML = `#${row.numero ?? (i+1)} · ${esc(row.progresiva || row.codigo || '')} · <span class="muted">(${i+1}/${total})</span>`;
}

/* ===== Uploader (CSV+ZIP) ===== */
const modalUp=document.getElementById('uploaderModal');
const openModalUp = ()=> openModal(modalUp);
const closeModalUp = ()=> closeModal(modalUp);
document.getElementById('btnOpenUploader').onclick = openModalUp;
modalUp.querySelectorAll('[data-close]').forEach(el=>el.onclick=closeModalUp);

document.getElementById('groupForm').addEventListener('submit', async (e)=>{
  e.preventDefault();
  const grupo=document.getElementById('grupo').value.trim();
  const csvFile=document.getElementById('csvFile').files[0];
  const zipFile=document.getElementById('zipFile').files[0];
  const msg=document.getElementById('uploaderMsg');
  msg.textContent='';
  if(!grupo||!csvFile||!zipFile){ msg.textContent='Completa todos los campos.'; return; }
  try{
    beginBusy('Cargando grupo', 100);

    setBusyMsg('Leyendo CSV…');
    const parsed=await new Promise((res,rej)=>{
      Papa.parse(csvFile,{header:true,skipEmptyLines:'greedy',encoding:'UTF-8',complete:res,error:rej});
    });
    if(!parsed?.data?.length) throw new Error('CSV vacío o sin encabezados');

    setBusyMsg('Preparando…');
    await uploadGroupCsvAndZip(grupo, parsed.data, zipFile);

    setBusyMsg('Actualizando mapa…');
    await loadFotos();

    endBusy();
    msg.textContent='✅ Grupo cargado';
    closeModalUp();
    document.getElementById('grupo').value=''; document.getElementById('csvFile').value=''; document.getElementById('zipFile').value='';
  }catch(err){
    console.error(err);
    endBusy();
    msg.textContent='Error: '+err.message;
  }
});

async function insertCsvBatchReturn(rows){
  const url=SUPABASE_URL.replace(/\/$/,'') + '/rest/v1/fotos_recorrido?select=id,progresiva,codigo,numero';
  const res=await fetch(url,{method:'POST',headers:{'apikey':SUPABASE_ANON_KEY,'Authorization':`Bearer ${SUPABASE_ANON_KEY}`,'Content-Type':'application/json','Prefer':'return=representation'},body:JSON.stringify(rows)});
  if(!res.ok){ const t=await res.text(); throw new Error(`Insert CSV HTTP ${res.status}: ${t}`); }
  return res.json();
}
async function uploadToR2(workerUrl, keyPath, file){
  const form=new FormData(); form.append('key', keyPath); form.append('file', file, file.name||'file');
  const res=await fetch(workerUrl.replace(/\/$/,'') + '/upload', {method:'POST', body:form});
  if(!res.ok){ const t=await res.text(); throw new Error(`R2 upload HTTP ${res.status}: ${t}`); }
  return res.json(); // { url, key }
}
async function insertAttachmentRow(payload){
  const url = SUPABASE_URL.replace(/\/$/,'') + '/rest/v1/marcaciones_adjuntos?select=*';
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    },
    body: JSON.stringify([payload])
  });
  if (!res.ok){ const t = await res.text(); throw new Error(`Insert adjunto HTTP ${res.status}: ${t}`); }
  const data = await res.json();
  return data?.[0];
}
async function uploadAttachmentsForMarcacion(marcacionId, files, onProgress){
  const results = [];
  const total = files.length;
  for (let i=0; i<files.length; i++){
    if (currentBusy.cancel) throw new Error('Cancelado por el usuario');
    const file = files[i];
    const originalName = file.name || `adjunto_${i+1}`;
    const ext = (originalName.match(/\.[^.]+$/)?.[0] || '').toLowerCase();
    const baseNameRaw = originalName.replace(/\.[^.]+$/, '');
    const baseName = sanitizePath(baseNameRaw) || 'adjunto';
    const keyPath = `adjuntos/${marcacionId}/${Date.now()}_${i+1}_${baseName}${ext}`;
    const up = await uploadToR2(R2_UPLOADER_URL, keyPath, file);
    const row = await insertAttachmentRow({
      marcacion_id: marcacionId,
      nombre: originalName,
      archivo_url: up.url,
      archivo_r2_key: up.key,
      mime_type: file.type || null
    });
    if (row) results.push(row);
    onProgress?.(i+1, total, originalName);
  }
  return results;
}
async function deleteAttachment(attId){
  const url = SUPABASE_URL.replace(/\/$/,'') + `/rest/v1/marcaciones_adjuntos?id=eq.${encodeURIComponent(attId)}`;
  const res = await fetch(url, {
    method: 'DELETE',
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
    }
  });
  if (!res.ok){ const t = await res.text(); throw new Error(`Eliminar adjunto HTTP ${res.status}: ${t}`); }
}
async function updateFotoUrl(table,rowId,url,key){
  const endpoint=SUPABASE_URL.replace(/\/$/,'' ) + `/rest/v1/${table}?id=eq.`+encodeURIComponent(rowId);
  const res=await fetch(endpoint,{method:'PATCH',headers:{'apikey':SUPABASE_ANON_KEY,'Authorization':`Bearer ${SUPABASE_ANON_KEY}`,'Content-Type':'application/json','Prefer':'return=minimal'},body:JSON.stringify({foto_url:url,foto_r2_key:key})});
  if(!res.ok){ const t=await res.text(); throw new Error(`Update foto_url HTTP ${res.status}: ${t}`); }
}
function normKey(s){ return String(s||'').trim().toLowerCase().replace(/\.[^.]+$/, ''); }

/* ====== CSV + ZIP con progreso y cancelación ====== */
async function uploadGroupCsvAndZip(grupo, rowsCsv, zipFile){
  if (currentBusy.cancel) throw new Error('Cancelado por el usuario');

  const latKey=detectField(rowsCsv[0], ['y','norte','lat','latitude','latitud']);
  const lngKey=detectField(rowsCsv[0], ['x','este','lng','lon','long','longitud']);
  const progKey=detectField(rowsCsv[0], ['progresiva','pk','progr']);
  const codigoKey=detectField(rowsCsv[0], ['codigo']);
  const numKey =detectField(rowsCsv[0], ['numero','orden','order','seq','indice','index']);
  if(!latKey||!lngKey) throw new Error('No se detectaron columnas lat/lng.');
  if(!codigoKey) throw new Error('El CSV debe incluir la columna "codigo".');

  const toInsert=[];
  for (const r of rowsCsv){
    const lat=toNumberFlexible(r[latKey]); const lng=toNumberFlexible(r[lngKey]);
    if(!Number.isFinite(lat)||!Number.isFinite(lng)||lat<-90||lat>90||lng<-180||lng>180) continue;
    const item={ geom:`SRID=4326;POINT(${lng} ${lat})`, este:lng, norte:lat, grupo, codigo:String(r[codigoKey]||'') };
    if(!item.codigo) continue;
    if (progKey && r[progKey]!=null && r[progKey]!=='') item.progresiva=String(r[progKey]);
    if (numKey  && r[numKey] !=null && r[numKey] !=='') item.numero=Number(r[numKey]);
    toInsert.push(item);
  }
  if(!toInsert.length) throw new Error('No hay filas válidas para insertar.');

  setBusyMsg(`Insertando ${toInsert.length} puntos…`);
  await insertCsvBatchReturn(toInsert);
  if (currentBusy.cancel) throw new Error('Cancelado por el usuario');

  setBusyMsg('Leyendo ZIP de fotos…');
  let zipPercent = 0;
  const zip=await JSZip.loadAsync(zipFile, {
    onProgress: (meta)=>{
      zipPercent = Math.round(meta.percent||0);
      setBusyProgress(zipPercent, 100, 'Leyendo ZIP');
      if (currentBusy.cancel) throw new Error('Cancelado por el usuario');
    }
  });

  const entries=Object.values(zip.files).filter(f=>!f.dir);
  if(!entries.length) throw new Error('ZIP vacío');

  const { data: insertedRows, error: insErr } = await supabase
    .from('fotos_recorrido')
    .select('id,codigo')
    .eq('grupo', grupo);
  if(insErr) throw insErr;

  const idsByCodigo=new Map();
  for(const row of insertedRows||[]){ const k=normKey(row.codigo); if(!k) continue; if(!idsByCodigo.has(k)) idsByCodigo.set(k, []); idsByCodigo.get(k).push(row.id); }

  const folder=`grupos/${sanitizePath(grupo)}`;
  let ok=0, skip=0, upErr=0; const used=new Map();

  const total = entries.length;
  let done = 0;
  setBusyProgress(0, total, 'Subiendo fotos');

  for(let i=0;i<entries.length;i++){
    if (currentBusy.cancel) throw new Error('Cancelado por el usuario');

    const f=entries[i];
    const base=f.name.split('/').pop(); const keyNorm=normKey(base);
    const list=idsByCodigo.get(keyNorm)||[]; const u=used.get(keyNorm)||0; const rowId=list[u];

    if(!rowId){ skip++; done++; setBusyProgress(done, total, `Sin match: ${skip}`); continue; }

    try{
      const blob=await f.async('blob'); const ext=(base.match(/\.[^.]+$/)?.[0]||'.jpg').toLowerCase();
      const keyPath=`${folder}/${rowId}_${Date.now()}${ext}`;
      const fileForForm=new File([blob], base, { type: blob.type||'image/jpeg' });

      const { url, key } = await uploadToR2(R2_UPLOADER_URL, keyPath, fileForForm);
      await updateFotoUrl('fotos_recorrido', rowId, url, key);

      used.set(keyNorm, u+1); ok++;
    }catch(e){
      console.warn('Error subiendo', base, e);
      upErr++;
    }
    done++;
    setBusyProgress(done, total, `Subiendo ${i+1}/${total} · OK:${ok} · Err:${upErr} · Skip:${skip}`);
  }

  setBusyProgress(total, total, `Listo · OK:${ok} · Err:${upErr} · Skip:${skip}`);
}

/* ===== Modales genéricos ===== */
function openModal(mod){ mod.classList.add('show'); }
function closeModal(mod){ mod.classList.remove('show'); }
document.querySelectorAll('.modal .backdrop,[data-close]').forEach(el=> el.addEventListener('click', (e)=>{
  const m = e.target.closest('.modal'); if(m) closeModal(m);
}));

/* ===== Nueva marcación ===== */
const markModal=document.getElementById('markModal');
let markMode=false;
document.getElementById('btnMark').addEventListener('click', ()=>{
  markMode=!markMode;
  document.getElementById('btnMark').textContent = markMode ? '✔ Haga clic en el mapa…' : '➕ Marcar punto';
  map._container.style.cursor = markMode ? 'crosshair' : '';
  setStatus(markMode ? 'Clic en el mapa para capturar lat/lng' : 'Listo');
});
map.on('click', (e)=>{
  if(!markMode) return;
  document.getElementById('mLat').value = e.latlng.lat.toFixed(7);
  document.getElementById('mLng').value = e.latlng.lng.toFixed(7);
  document.getElementById('mNombre').value = 'Nueva marcación';
  document.getElementById('mDesc').value = 'Añadido desde el mapa';
  document.getElementById('mTipo').value = '';
  document.getElementById('mFile').value = '';
  const mAttachments = document.getElementById('mAttachments');
  if (mAttachments) mAttachments.value = '';
  document.getElementById('markMsg').textContent = '';
  openModal(markModal);
});
document.getElementById('markForm').addEventListener('submit', async (e)=>{
  e.preventDefault();
  const nombre=document.getElementById('mNombre').value.trim();
  const descripcion=document.getElementById('mDesc').value.trim();
  const tipo=document.getElementById('mTipo').value;
  const lat=Number(document.getElementById('mLat').value);
  const lng=Number(document.getElementById('mLng').value);
  const file=document.getElementById('mFile').files[0];
  const attachments = Array.from(document.getElementById('mAttachments')?.files || []);
  const msg=document.getElementById('markMsg');
  if(!nombre || !Number.isFinite(lat) || !Number.isFinite(lng)){ msg.textContent='Complete nombre y coordenadas válidas.'; return; }
  const uploadsTotal = attachments.length + (file ? 1 : 0);
  let busyStarted = false;
  try{
    if (uploadsTotal > 0){
      beginBusy('Guardando marcación', uploadsTotal);
      busyStarted = true;
    }

    let doneUploads = 0;
    let foto_url=null, foto_r2_key=null;
    if (file){
      if (busyStarted) setBusyMsg('Subiendo imagen…');
      const ext=(file.name.match(/\.[^.]+$/)?.[0]||'.jpg').toLowerCase();
      const baseNameRaw=file.name.replace(/\.[^.]+$/,'');
      const safeBase=sanitizePath(baseNameRaw)||'imagen';
      const keyPath=`marcaciones/${Date.now()}_${safeBase}${ext}`;
      const up=await uploadToR2(R2_UPLOADER_URL, keyPath, file);
      foto_url=up.url; foto_r2_key=up.key;
      doneUploads++;
      if (busyStarted && uploadsTotal){ setBusyProgress(doneUploads, uploadsTotal, 'Imagen subida'); }
    }

    const ewkt=`SRID=4326;POINT(${lng} ${lat})`;
    const body=[{ nombre, descripcion:descripcion||null, lat, lng, geom:ewkt, tipo:(file?tipo:null), foto_url, foto_r2_key }];
    const url=SUPABASE_URL.replace(/\/$/,'') + '/rest/v1/marcaciones?select=*';
    const res=await fetch(url,{method:'POST',headers:{'apikey':SUPABASE_ANON_KEY,'Authorization':`Bearer ${SUPABASE_ANON_KEY}`,'Content-Type':'application/json','Prefer':'return=representation'},body:JSON.stringify(body)});
    if(!res.ok){ const t=await res.text(); throw new Error(`HTTP ${res.status}: ${t}`); }
    const [row]=await res.json();
    allMarcs.push(row);
    const m=addMarcacionMarker(row);
    if(m){ map.panTo(m.getLatLng()); m.openPopup(); }

    if (attachments.length){
      const baseDone = doneUploads;
      const uploaded = await uploadAttachmentsForMarcacion(row.id, attachments, (done, total)=>{
        if (busyStarted){
          setBusyMsg(`Subiendo adjuntos (${done}/${total})…`);
          if (uploadsTotal) setBusyProgress(baseDone + done, uploadsTotal, `Adjuntos ${done}/${total}`);
        }
      });
      doneUploads += attachments.length;
      appendAttachmentsToCache(uploaded);
    }

    setCurrentMarcacion(row.id);
    document.getElementById('viewerTitle').textContent = `Marcación · ${row.nombre}`;
    if (row.foto_r2_key || row.foto_url){
      if (row.tipo === '360'){ await open360ForMarcacion(row); }
      else { await openPhotoForMarcacion(row); }
    } else {
      showEmptyViewer();
    }

    msg.textContent='✅ Marcación guardada';
    closeModal(markModal);
    markMode=false; document.getElementById('btnMark').textContent='➕ Marcar punto'; map._container.style.cursor='';
  }catch(err){ console.error(err); msg.textContent='Error: '+err.message; }
  finally{ if (busyStarted) endBusy(); }
});

/* ===== Editar marcación ===== */
document.getElementById('editMarkForm').addEventListener('submit', async (e)=>{
  e.preventDefault();
  const id   = Number(document.getElementById('emId').value);
  const nombre = document.getElementById('emNombre').value.trim();
  const tipo   = document.getElementById('emTipo').value;
  const descripcion = document.getElementById('emDesc').value.trim();
  const file  = document.getElementById('emFile').files[0];
  const remove = document.getElementById('emRemove').checked;
  const newAttachments = Array.from(document.getElementById('emAttachments')?.files || []);
  const msg  = document.getElementById('editMarkMsg');

  if(!nombre){ msg.textContent='Indica un nombre.'; return; }

  try{
    const totalUploads = (file ? 1 : 0) + newAttachments.length;
    beginBusy('Guardando cambios', totalUploads);
    let doneUploads = 0;

    const patch = { nombre, descripcion: descripcion || null };

    if (remove){
      patch.foto_url = null;
      patch.foto_r2_key = null;
      patch.tipo = null;
    } else {
      patch.tipo = tipo || null;
      if (file){
        setBusyMsg('Subiendo imagen…');
        const ext = (file.name.match(/\.[^.]+$/)?.[0] || '.jpg').toLowerCase();
        const keyPath = `marcaciones/${id}_${Date.now()}${ext}`;
        const up = await uploadToR2(R2_UPLOADER_URL, keyPath, file);
        patch.foto_url = up.url;
        patch.foto_r2_key = up.key;
        doneUploads++;
        if (totalUploads) setBusyProgress(doneUploads, totalUploads, 'Imagen subida');
      }
    }

    const url = SUPABASE_URL.replace(/\/$/,'') + `/rest/v1/marcaciones?id=eq.${encodeURIComponent(id)}`;
    const res = await fetch(url, {
      method:'PATCH',
      headers:{
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      body: JSON.stringify(patch)
    });
    if(!res.ok){ const t=await res.text(); throw new Error(`HTTP ${res.status}: ${t}`); }

    const [row] = await res.json();

    const i = allMarcs.findIndex(x=>x.id===id);
    if (i>=0) allMarcs[i] = row;

    if (newAttachments.length){
      const baseDone = doneUploads;
      const uploaded = await uploadAttachmentsForMarcacion(id, newAttachments, (done, total)=>{
        setBusyMsg(`Subiendo adjuntos (${done}/${total})…`);
        if (totalUploads) setBusyProgress(baseDone + done, totalUploads, `Adjuntos ${done}/${total}`);
      });
      doneUploads += newAttachments.length;
      appendAttachmentsToCache(uploaded);
    }

    await loadMarcaciones();

    msg.textContent = '✅ Guardado';
    closeModal(document.getElementById('editMarkModal'));

    const updated = allMarcs.find(x=>x.id===id) || row;
    document.getElementById('viewerTitle').textContent = `Marcación · ${updated.nombre}`;
    if (updated.foto_r2_key || updated.foto_url){
      if (updated.tipo === '360'){ await open360ForMarcacion(updated); }
      else { await openPhotoForMarcacion(updated); }
    } else {
      showEmptyViewer();
    }
    setCurrentMarcacion(updated.id);
    renderEditAttachments(updated.id);

  }catch(err){
    console.error(err);
    msg.textContent = 'Error: ' + err.message;
  }finally{
    endBusy();
  }
});

/* ===== Editar recorrido ===== */
document.getElementById('editRecForm').addEventListener('submit', async (e)=>{
  e.preventDefault();
  const id=Number(document.getElementById('erId').value);
  const progresiva=document.getElementById('erProg').value.trim();
  const descripcion=document.getElementById('erDesc').value.trim();
  const msg=document.getElementById('editRecMsg');
  try{
    const url=SUPABASE_URL.replace(/\/$/,'') + `/rest/v1/fotos_recorrido?id=eq.${encodeURIComponent(id)}`;
    const res=await fetch(url,{method:'PATCH',headers:{'apikey':SUPABASE_ANON_KEY,'Authorization':`Bearer ${SUPABASE_ANON_KEY}`,'Content-Type':'application/json','Prefer':'return=representation'},body:JSON.stringify({progresiva:progresiva||null, descripcion:descripcion||null})});
    if(!res.ok){ const t=await res.text(); throw new Error(`HTTP ${res.status}: ${t}`); }
    const [row]=await res.json();
    const i=allRows.findIndex(x=>x.id===id); if(i>=0) allRows[i]=row;
    const m = markerById.get(id);
    if (m){ m.setPopupContent(popupRec(row)); }
    msg.textContent='✅ Guardado';
    closeModal(document.getElementById('editRecModal'));
  }catch(err){ console.error(err); msg.textContent='Error: '+err.message; }
});

/* ===== Controles foto (zoom) ===== */
let photoScale = 1;
document.getElementById('btnZoomIn').onclick = ()=>{ photoScale=Math.min(5, photoScale+0.2); document.getElementById('photoImg').style.transform=`scale(${photoScale})`; };
document.getElementById('btnZoomOut').onclick= ()=>{ photoScale=Math.max(0.2,photoScale-0.2); document.getElementById('photoImg').style.transform=`scale(1)`; };
document.getElementById('btnFit').onclick   = ()=>{ photoScale=1; document.getElementById('photoImg').style.transform='scale(1)'; };
document.getElementById('btnOpen').onclick  = ()=>{ const src=document.getElementById('photoImg').src; if(src) window.open(src,'_blank'); };

/* ===== Búsqueda con sugerencias ===== */
const search = document.getElementById('search');
const suggest = document.getElementById('suggest');
function closeSuggest(){ suggest.style.display='none'; suggest.innerHTML=''; }
function openSuggest(){ suggest.style.display='block'; }
search.addEventListener('input', ()=>{
  const q = search.value.trim().toLowerCase();
  if (!q){ closeSuggest(); return; }
  const items = [];
  for (const r of allRows){
    const label = (r.progresiva||r.codigo||'').toLowerCase();
    if (label && label.includes(q)){
      items.push({ type:'recorrido', id:r.id, label:`${r.progresiva||r.codigo}`, aux:`Grupo ${r.grupo??'Sin grupo'}` });
      if (items.length>=10) break;
    }
  }
  if (items.length<10){
    for (const m of allMarcs){
      const label = (m.nombre||'').toLowerCase();
      if (label && label.includes(q)){
        items.push({ type:'marcacion', id:m.id, label:`${m.nombre}`, aux:'Marcación' });
        if (items.length>=10) break;
      }
    }
  }
  if (!items.length){ closeSuggest(); return; }
  suggest.innerHTML = items.map(it=>`<div class="item" data-type="${it.type}" data-id="${it.id}">
      <div>${esc(it.label)}</div><div class="tag">${esc(it.aux)}</div></div>`).join('');
  openSuggest();
});
suggest.addEventListener('click', (e)=>{
  const item = e.target.closest('.item'); if(!item) return;
  const type=item.dataset.type, id=Number(item.dataset.id);
  if (type==='recorrido'){
    const r = allRows.find(x=>x.id===id); if(!r) return;
    const cm = markerById.get(r.id); if(cm){ map.panTo(cm.getLatLng()); cm.openPopup(); }
    onRecClick(r, cm);
  } else {
    const m = allMarcs.find(x=>x.id===id); if(!m) return;
    const target = marcacionesCluster.getLayers().find(L=>{
      const ll=L.getLatLng?.(); return ll && Math.abs(ll.lat-m.lat)<1e-9 && Math.abs(ll.lng-m.lng)<1e-9;
    });
    if (target){ map.panTo(target.getLatLng()); marcacionesCluster.zoomToShowLayer(target, ()=> target.openPopup()); }
  }
  closeSuggest();
});
document.addEventListener('click', (e)=>{ if(!e.target.closest('#searchWrap')) closeSuggest(); });

/* ===== Inicio ===== */
(async ()=>{
  await loadFotos();
  await loadMarcaciones();
  ensurePanoViewer();
})();
