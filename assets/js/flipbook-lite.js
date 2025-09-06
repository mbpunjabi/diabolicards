
// Self-contained image-based flipbook (no external libraries).
// Uses /assets/docs/guide-pages/manifest.json for total pages, outline, and filename pattern.
const MANIFEST_URL = '/assets/docs/guide-pages/manifest.json';

const viewer = document.getElementById('viewer');
const spreadEl = document.getElementById('spread');
const outlineNav = document.getElementById('outline-nav');
const statusEl = document.getElementById('status');
const DPR = window.devicePixelRatio || 1;

let manifest = null;
let total = 0;
let cursor = 1; // left page number in current spread
let zoom = 1;

function fmt(pattern, n){
  const num3 = String(n).padStart(3, '0');
  return pattern.replace('{num:03d}', num3).replace('{num}', n);
}
function spreadFor(n, total){
  if(n <= 1) return [1];
  if(n >= total) return [total];
  const left = n % 2 === 0 ? n : n - 1;
  return [left, left + 1];
}
function preload(src){
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load ' + src));
    img.src = src;
  });
}
async function renderPage(n){
  const src = fmt(manifest.imagePattern, n);
  const img = await preload(src);
  const wrap = document.createElement('div');
  if(n === 1 || n === total) wrap.className = 'page-cover';
  img.style.width = Math.round(img.naturalWidth / DPR) * zoom + 'px';
  img.style.height = 'auto';
  img.alt = `Page ${n}`;
  img.loading = 'eager';
  img.decoding = 'async';
  wrap.appendChild(img);
  return wrap;
}
function animateTurn(dir){
  spreadEl.classList.remove('turn-next','turn-prev');
  void spreadEl.offsetWidth; // reflow to restart animation
  spreadEl.classList.add(dir);
  setTimeout(()=> spreadEl.classList.remove(dir), 420);
}
async function renderSpread(dir){
  const pages = spreadFor(cursor, total);
  statusEl.textContent = pages.length === 1 ? `Page ${pages[0]} of ${total}` : `Pages ${pages[0]}–${pages[1]} of ${total}`;
  const frag = document.createDocumentFragment();
  for(const p of pages){ frag.appendChild(await renderPage(p)); }
  spreadEl.replaceChildren(frag);
  if(dir) animateTurn(dir);
  highlightNav();
  // preload neighbors (lightweight)
  const ahead = Math.min(total, pages[pages.length-1] + 1);
  const behind = Math.max(1, pages[0] - 1);
  [ahead, behind].forEach(n => { if(n>=1 && n<=total) preload(fmt(manifest.imagePattern, n)); });
}
function goFirst(){ cursor = 1; renderSpread(); }
function goLast(){ cursor = total; renderSpread(); }
function goPrev(){ if(cursor>1){ cursor = cursor<=2 ? 1 : cursor-2; renderSpread('turn-prev'); } }
function goNext(){ if(cursor<total){ cursor = cursor===1 ? 2 : Math.min(total, cursor+2); renderSpread('turn-next'); } }
function zoomIn(){ zoom = Math.min(2.5, Math.round((zoom+0.1)*10)/10); updateZoomUI(); renderSpread(); }
function zoomOut(){ zoom = Math.max(0.5, Math.round((zoom-0.1)*10)/10); updateZoomUI(); renderSpread(); }
function zoomReset(){ zoom = 1; updateZoomUI(); renderSpread(); }
function updateZoomUI(){ document.getElementById('zoom-reset').textContent = Math.round(zoom*100)+'%'; }
function highlightNav(){
  if(!outlineNav || !manifest?.outline) return;
  const pages = spreadFor(cursor, total);
  let active = null;
  outlineNav.querySelectorAll('a[data-page]').forEach(a => {
    const n = parseInt(a.dataset.page,10);
    if(pages.includes(n)){ a.setAttribute('aria-current','page'); active = a; }
    else a.removeAttribute('aria-current');
  });
  if(active) active.scrollIntoView({ block:'nearest', inline:'nearest' });
}
function buildOutlineNav(){
  if(!outlineNav) return;
  outlineNav.innerHTML = '';
  if(!manifest.outline?.length){
    outlineNav.innerHTML = '<p class="muted">No outline provided in manifest.json.</p>';
    return;
  }
  const ul = document.createElement('ul');
  manifest.outline.forEach(item => {
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.textContent = (item.title || 'Untitled').toUpperCase();
    a.href = '#'; a.dataset.page = String(item.page);
    a.addEventListener('click', e => { e.preventDefault(); cursor = item.page; renderSpread(); });
    li.appendChild(a); ul.appendChild(li);
  });
  outlineNav.appendChild(ul);
}
function wireControls(){
  document.getElementById('first').addEventListener('click', goFirst);
  document.getElementById('prev').addEventListener('click', goPrev);
  document.getElementById('next').addEventListener('click', goNext);
  document.getElementById('last').addEventListener('click', goLast);
  document.getElementById('zoom-in').addEventListener('click', zoomIn);
  document.getElementById('zoom-out').addEventListener('click', zoomOut);
  document.getElementById('zoom-reset').addEventListener('click', zoomReset);
  document.getElementById('download').addEventListener('click', () => window.open('/assets/docs/guide.pdf', '_blank'));
  window.addEventListener('keydown', (e)=>{
    const tag = (e.target && e.target.tagName) || '';
    if(tag==='INPUT'||tag==='TEXTAREA') return;
    if(e.key==='ArrowLeft') goPrev();
    if(e.key==='ArrowRight') goNext();
    if(e.key==='+'||e.key==='='){ e.preventDefault(); zoomIn(); }
    if(e.key==='-'||e.key==='_'){ e.preventDefault(); zoomOut(); }
    if(e.key==='0'){ e.preventDefault(); zoomReset(); }
    if(e.key==='Home') goFirst();
    if(e.key==='End') goLast();
  });
}
(async function init(){
  try{
    wireControls();
    const res = await fetch(MANIFEST_URL, { cache:'no-store' });
    if(!res.ok) throw new Error('manifest not found');
    manifest = await res.json();
    total = manifest.totalPages;
    buildOutlineNav();
    await renderSpread();
  }catch(err){
    statusEl.textContent = 'Flipbook not configured (missing images/manifest).';
    const tip = document.createElement('p');
    tip.className = 'muted';
    tip.innerHTML = 'Expected images like <code>/assets/docs/guide-pages/page-001.webp</code> and a <code>manifest.json</code> file.';
    viewer.appendChild(tip);
    console.error(err);
  }
})();
