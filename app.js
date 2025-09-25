if (location.protocol === 'file:') alert('⚠️ Abre con http://localhost (python -m http.server o Live Server).');

const SUPABASE_URL = 'https://vupofyzkwyaejismuzfn.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ1cG9meXprd3lhZWppc211emZuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg2MjUyOTEsImV4cCI6MjA3NDIwMTI5MX0.ITQUUW5CxLROoUiZkO5Hx-u5xtBRSF1UsSJW7RWhLZA';
const R2_UPLOADER_URL = 'https://geoportal-r2-uploader.ilanbailonbruna.workers.dev';
const VIEW = { pitch: 0, yaw: 0, hfov: 108 };
const HIDE_POINTS_ZOOM = 14; // <= este zoom oculta vértices

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* ====== Busy / Progreso ====== */
const loading = document.getElementById('loading');
const loadingMsg = document.getElementById('loadingMsg');
const loadingTitle = document.getElementById('loadingTitle');
const progressBar = document.getElementById('progressBar');
const busyBadge = document.getElementById('busyBadge');
const busyText = document.getElementById('busyText');
const btnCancelBusy = document.getElementById('btnCancelBusy');
const btnHideBusy = document.getElementById('btnHideBusy');

let currentBusy = { active:false, label:'', cancel:false, total:0, done:0 };

function beginBusy(label, total=0){
  currentBusy = { active:true, label, cancel:false, total, done:0 };
  loadingTitle.textContent = label || 'Procesando…';
  loadingMsg.textContent = 'Inicializando…';
  progressBar.style.width = total>0 ? '0%' : '0%';
  busyText.textContent = 'Cargando…';
  busyBadge.style.display = 'inline-flex';
  showLoading();
}
function setBusyMsg(msg){ loadingMsg.textContent = msg||'Procesando…'; busyText.textContent = (currentBusy.label||'Cargando…'); }
function setBusyProgress(done, total, submsg){
  currentBusy.done = Math.max(0, done|0);
  currentBusy.total = Math.max(0, total|0);
  const pct = total>0 ? Math.min(100, Math.round((done/total)*100)) : 0;
  progressBar.style.width = pct+'%';
  loadingMsg.textContent = (submsg ? submsg+' · ' : '') + (total>0 ? `${pct}%` : '');
  busyText.textContent = `${currentBusy.label||'Cargando'} ${pct}%`;
}
function endBusy(){ currentBusy.active=false; busyBadge.style.display='none'; hideLoading(); }
btnCancelBusy.onclick = ()=>{ currentBusy.cancel=true; loadingMsg.textContent='Cancelando…'; };
btnHideBusy.onclick = ()=>{ hideLoading(); };
busyBadge.onclick = ()=>{ showLoading(); };

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
function detectField(obj,cands){ const ks=Object.keys(obj||{}); for(const c of cands){ const k=ks.find(k=>k.toLowerCase()===c.toLowerCase()); if(k) return k; } for(const c of cands){ const k=ks.find(k=>k.toLowerCase().includes(c.toLowerCase())); if(k) return k; } return null; }
function toNumberFlexible(v){ if(v==null) return NaN; if(typeof v==='number') return v; if(typeof v!=='string') return NaN; const n=parseFloat(v.trim().replace(/\s+/g,'').replace(',', '.')); return Number.isFinite(n)?n:NaN; }
function sanitizePath(s){ return String(s||'').normalize('NFKD').replace(/[^a-zA-Z0-9_\-\/\.]+/g,'-').replace(/--+/g,'-').replace(/^-+|-+$/g,''); }

/* ===== Mapa ===== */
const map = L.map('map', { zoomControl:true }).setView([-14.10,-70.44],13);
const hib = L.tileLayer('https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}',{maxZoom:21, attribution:'Map data &copy; Google'}).addTo(map);
const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:21, attribution:'&copy; OpenStreetMap'});
const sat = L.tileLayer('https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}',{maxZoom:21, attribution:'Imagery &copy; Google'});
const dark = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',{maxZoom:21, attribution:'&copy; OSM, &copy; CARTO'});

/* Dos controles de capas */
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

function buildSrc(row){
  const base = R2_UPLOADER_URL.replace(/\/$/,'');
  if (row?.foto_r2_key){
    const key = String(row.foto_r2_key).replace(/^fotos\//,''); // tolera claves antiguas
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
      const lat=Number(row.norte), lng=Number(row.este]);
      if(!Number.isFinite(lat)||!Number.isFinite(lng)) continue;

      latlngs.push([lat,lng]);
      const cm = L.circleMarker([lat,lng], {
        radius: 7, weight: 1.8, opacity:.95, fillOpacity:.95, className:'vtx-default'
      }).bindPopup(popupRec(row));
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
  const { data, error } = await supabase
    .from('marcaciones')
    .select('id,nombre,descripcion,lat,lng,tipo,foto_url,foto_r2_key,created_at')
    .order('id');
  if(error){ console.error(error); setStatus('Error cargando marcaciones'); return; }
  allMarcs = data||[];
  for(const row of allMarcs){ addMarcacionMarker(row); }
  setStatus(`Marcaciones: ${allMarcs.length}`);
  enhanceOverlayControlZoomButtons();
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
    document.getElementById('viewerTitle').textContent = `Marcación · ${row.nombre}`;
    if (row.tipo === '360' && (row.foto_r2_key || row.foto_url)){
      await open360ForMarcacion(row);
    } else if (row.foto_r2_key || row.foto_url){
      await openPhotoForMarcacion(row);
    } else {
      showPanoControlsOnly();
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
function highlightVertex(cm){
  if (lastHighlight && lastHighlight.setStyle){
    lastHighlight.setStyle({ radius:7, weight:1.8 });
    lastHighlight._path?.classList.remove('vtx-highlight');
  }
  cm.setStyle({ radius:9, weight:2.6 });
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

/* ===== Click recorrido ===== */
function onRecClick(row, cm){
  const groupName = row.grupo ?? 'Sin grupo';
  const sel = document.getElementById('selGrupo');
  if (sel.value !== groupName) { sel.value = groupName; drawRoute(); updateCountPts(); }
  const obj = groups.get(groupName) || { rows:[] };
  const idx = obj.rows.findIndex(r => r.id === row.id);
  if (idx !== -1) { playIdx = idx; updateNowInfo(row, idx, obj.rows.length); }
  map.panTo(cm.getLatLng());
  highlightVertex(cm);
  open360ForRow(row, /*fallbackToPhoto=*/true);
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
function hidePhoto(){ document.getElementById('photoContainer').classList.remove('show'); }
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

async function getObjUrl(row){
  const src = buildSrc(row); if(!src) return null;
  const resp = await fetch(src, { cache:'force-cache' });
  if (!resp.ok) throw new Error('HTTP '+resp.status);
  const blob = await resp.blob();
  return URL.createObjectURL(blob);
}

async function open360ForRow(row, fallbackToPhoto=false){
  try{
    showPanoControlsOnly();
    const v=ensurePanoViewer();
    const key='f:'+row.id;
    let objUrl = cacheGet(panoCache, key);
    if(!objUrl){ objUrl = await getObjUrl(row); cacheSet(panoCache, key, objUrl); }
    const sceneId='pf_'+row.id+'_'+Date.now();
    v.addScene(sceneId,{type:'equirectangular', panorama:objUrl, autoLoad:true, pitch:VIEW.pitch, yaw:VIEW.yaw, hfov:VIEW.hfov});
    v.loadScene(sceneId, VIEW.pitch, VIEW.yaw, VIEW.hfov);
    requestAnimationFrame(()=> v.resize());
  }catch(e){
    console.warn('[360 grupo] fallo, fallback a foto', e);
    if (fallbackToPhoto) { await openPhotoGeneric(row); }
  }
}

async function open360ForMarcacion(row){
  try{
    showPanoControlsOnly();
    const v=ensurePanoViewer();
    const key='m:'+row.id;
    let objUrl = cacheGet(panoCache, key);
    if(!objUrl){ objUrl = await getObjUrl(row); cacheSet(panoCache, key, objUrl); }
    const sceneId='pm_'+row.id+'_'+Date.now();
    v.addScene(sceneId,{type:'equirectangular', panorama:objUrl, autoLoad:true, pitch:VIEW.pitch, yaw:VIEW.yaw, hfov:VIEW.hfov});
    v.loadScene(sceneId, VIEW.pitch, VIEW.yaw, VIEW.hfov);
    requestAnimationFrame(()=> v.resize());
  }catch(e){
    console.error('[360 marcación] fallo', e);
    await openPhotoForMarcacion(row);
  }
}

async function openPhotoGeneric(row){
  try{
    const key='f:'+row.id;
    let objUrl = cacheGet(photoCache, key);
    if(!objUrl){ objUrl = await getObjUrl(row); cacheSet(photoCache, key, objUrl); }
    const img=document.getElementById('photoImg'); img.src=objUrl; img.style.transform='scale(1)';
    showPhotoControls();
  }catch(e){ console.error('[foto recorrido] fallo', e); }
}
async function openPhotoForMarcacion(row){
  try{
    const key='m:'+row.id;
    let objUrl = cacheGet(photoCache, key);
    if(!objUrl){ objUrl = await getObjUrl(row); cacheSet(photoCache, key, objUrl); }
    const img=document.getElementById('photoImg'); img.src=objUrl; img.style.transform='scale(1)';
    showPhotoControls();
  }catch(e){ console.error('[foto marcación] fallo', e); }
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
document.getElementById('btnPlay').onclick = async ()=>{
  if(playTimer){ stopPlay(); return; }
  const g=document.getElementById('selGrupo').value;
  setStatus('Precargando…'); await warmup(g, playIdx); setStatus('Listo');
  startPlay();
};

function startPlay(){
  if(playTimer) return;
  showAt(playIdx, true);
  const interval = Math.max(500, Number(document.getElementById('speed').value)*1000);
  playTimer = setInterval(()=>step(+1,false), interval);
  document.getElementById('btnPlay').textContent='⏸️';
}
function stopPlay(){
  if(playTimer){ clearInterval(playTimer); playTimer=null; document.getElementById('btnPlay').textContent='▶'; }
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
  if (row.foto_url || row.foto_r2_key){
    open360ForRow(row, /*fallbackToPhoto=*/true);
  } else {
    showPanoControlsOnly();
  }
}
function updateNowInfo(row,i,total){
  const el=document.getElementById('nowInfo');
  if(!row){ el.textContent='—'; return; }
  el.innerHTML = `#${row.numero ?? (i+1)} · ${esc(row.progresiva || row.codigo || '')} · <span class="muted">(${i+1}/${total})</span>`;
}

/* ===== Uploader (CSV+ZIP, clave = codigo) ===== */
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
async function updateFotoUrl(table,rowId,url,key){
  const endpoint=SUPABASE_URL.replace(/\/$/,'' ) + `/rest/v1/${table}?id=eq.`+encodeURIComponent(rowId);
  const res=await fetch(endpoint,{method:'PATCH',headers:{'apikey':SUPABASE_ANON_KEY,'Authorization':`Bearer ${SUPABASE_ANON_KEY}`,'Content-Type':'application/json','Prefer':'return=minimal'},body:JSON.stringify({foto_url:url,foto_r2_key:key})});
  if(!res.ok){ const t=await res.text(); throw new Error(`Update foto_url HTTP ${res.status}: ${t}`); }
}
function normKey(s){ return String(s||'').trim().toLowerCase().replace(/\.[^.]+$/, ''); }

/* ====== Núcleo: subir CSV + ZIP con progreso y cancelación ====== */
async function uploadGroupCsvAndZip(grupo, rowsCsv, zipFile){
  if (currentBusy.cancel) throw new Error('Cancelado por el usuario');

  const latKey=detectField(rowsCsv[0], ['y','norte','lat','latitude','latitud']);
  const lngKey=detectField(rowsCsv[0], ['x','este','lng','lon','long','longitud']);
  const progKey=detectField(rowsCsv[0], ['progresiva','pk','progr']);
  const codigoKey=detectField(rowsCsv[0], ['codigo']);
  const numKey =detectField(rowsCsv[0], ['numero','orden','order','seq','indice','index']);
  if(!latKey||!lngKey) throw new Error('No se detectaron columnas lat/lng.');
  if(!codigoKey) throw new Error('El CSV debe incluir la columna "codigo".');

  // 1) Preparar filas
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

  // 2) Leer ZIP (con progreso)
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

  // 3) Mapear IDs insertados por codigo (buscando por grupo recién insertado)
  const { data: insertedRows, error: insErr } = await supabase
    .from('fotos_recorrido')
    .select('id,codigo')
    .eq('grupo', grupo);
  if(insErr) throw insErr;

  const idsByCodigo=new Map();
  for(const row of insertedRows||[]){ const k=normKey(row.codigo); if(!k) continue; if(!idsByCodigo.has(k)) idsByCodigo.set(k, []); idsByCodigo.get(k).push(row.id); }

  const folder=`grupos/${sanitizePath(grupo)}`;
  let ok=0, skip=0, upErr=0; const used=new Map();

  // 4) Subir fotos (progreso por conteo)
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

/* ===== Nueva marcación (con progreso si hay imagen) ===== */
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
  const msg=document.getElementById('markMsg');
  if(!nombre || !Number.isFinite(lat) || !Number.isFinite(lng)){ msg.textContent='Complete nombre y coordenadas válidas.'; return; }
  try{
    if (file) beginBusy('Subiendo imagen', 100);

    let foto_url=null, foto_r2_key=null;
    if (file){
      setBusyMsg('Subiendo imagen…');
      const ext=(file.name.match(/\.[^.]+$/)?.[0]||'.jpg').toLowerCase();
      const keyPath=`marcaciones/${Date.now()}_${sanitizePath(file.name.replace(/\.[^.]+$/,''))}${ext}`;
      const up=await uploadToR2(R2_UPLOADER_URL, keyPath, file);
      foto_url=up.url; foto_r2_key=up.key;
      setBusyProgress(100, 100, 'Imagen subida');
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

    document.getElementById('viewerTitle').textContent = `Marcación · ${row.nombre}`;
    if (file){
      if (tipo==='360'){ await open360ForMarcacion(row); }
      else { await openPhotoForMarcacion(row); }
    } else {
      showPanoControlsOnly();
    }

    msg.textContent='✅ Marcación guardada';
    closeModal(markModal);
    markMode=false; document.getElementById('btnMark').textContent='➕ Marcar punto'; map._container.style.cursor='';
  }catch(err){ console.error(err); msg.textContent='Error: '+err.message; }
  finally{ if (busyBadge.style.display!=='none') endBusy(); }
});

/* ===== Editar marcación (con posible nueva imagen) ===== */
document.getElementById('editMarkForm').addEventListener('submit', async (e)=>{
  e.preventDefault();
  const id   = Number(document.getElementById('emId').value);
  const nombre = document.getElementById('emNombre').value.trim();
  const tipo   = document.getElementById('emTipo').value;
  const descripcion = document.getElementById('emDesc').value.trim();
  const file  = document.getElementById('emFile').files[0];
  const remove = document.getElementById('emRemove').checked;
  const msg  = document.getElementById('editMarkMsg');

  if(!nombre){ msg.textContent='Indica un nombre.'; return; }

  try{
    if (file) beginBusy('Subiendo imagen', 100); else beginBusy('Guardando cambios', 0);

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
        setBusyProgress(100, 100, 'Imagen subida');
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
    await loadMarcaciones();

    msg.textContent = '✅ Guardado';
    closeModal(document.getElementById('editMarkModal'));

    document.getElementById('viewerTitle').textContent = `Marcación · ${row.nombre}`;
    if (row.foto_r2_key || row.foto_url){
      if (row.tipo === '360'){ await open360ForMarcacion(row); }
      else { await openPhotoForMarcacion(row); }
    } else {
      showPanoControlsOnly();
    }

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
document.getElementById('btnZoomOut').onclick= ()=>{ photoScale=Math.max(0.2,photoScale-0.2); document.getElementById('photoImg').style.transform=`scale(${photoScale})`; };
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

/* ===== Modal helpers ===== */
function openModal(el){ el.classList.add('show'); }
function closeModal(el){ el.classList.remove('show'); }
