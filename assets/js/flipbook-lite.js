// flipbook-lite.js — Single-page flipbook (NO animations, NO external libs)
// - All pages render at the cover's width (scaled by zoom & devicePixelRatio).
// - Single-page view only.
// - Prev/Next are instant (no page-turn animation).
// - Outline links jump to exact page numbers.
// - Keyboard: ← →  +  −  0  Home  End
// - Touch: swipe left/right
'use strict';

const MANIFEST_URL = '/assets/docs/guide-pages/manifest.json';

// DOM
const viewer     = document.getElementById('viewer');
const spreadEl   = document.getElementById('spread');   // reused as a simple container
const outlineNav = document.getElementById('outline-nav');
const statusEl   = document.getElementById('status');

if (!viewer || !spreadEl || !statusEl) {
  console.error('[Flipbook] Required elements missing (viewer/spread/status).');
}

// Minimal styles to center the page
(function injectBasicStyles () {
  if (document.getElementById('flipbook-basic-styles')) return;
  const css = `
    .spread{position:relative; display:flex; justify-content:center; align-items:flex-start;}
    .spread img{display:block;}
  `;
  const el = document.createElement('style');
  el.id = 'flipbook-basic-styles';
  el.textContent = css;
  document.head.appendChild(el);
})();

// State
let manifest = null;
let total    = 0;
let cursor   = 1;                       // current page (1..total)
let zoom     = 1;
let DPR      = window.devicePixelRatio || 1;
let BASE_PAGE_WIDTH = null;             // computed from cover
const IMG_CACHE = new Map();

// Helpers
function fmt(pattern, n){
  const num3 = String(n).padStart(3, '0');
  return pattern.replace('{num:03d}', num3).replace('{num}', n);
}
function preload(n){
  if (!n || n < 1) return Promise.resolve(null);
  if (IMG_CACHE.has(n)) return Promise.resolve(IMG_CACHE.get(n));
  const src = fmt(manifest.imagePattern, n);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => { IMG_CACHE.set(n, img); resolve(img); };
    img.onerror = () => reject(new Error('Failed to load '+src));
    img.src = src;
  });
}
function computeBaseWidthFromCover(coverImg){
  return Math.max(1, Math.round(coverImg.naturalWidth / DPR) * zoom);
}
function updateStatus(){
  statusEl.textContent = `Page ${cursor} of ${total}`;
}
function updateZoomUI(){
  const btn = document.getElementById('zoom-reset');
  if (btn) btn.textContent = Math.round(zoom*100) + '%';
}

// Render single page
async function renderPageView(){
  if (!manifest) return;

  if (BASE_PAGE_WIDTH == null){
    const cover = await preload(1);
    if (!cover) return;
    BASE_PAGE_WIDTH = computeBaseWidthFromCover(cover);
  }

  const img = await preload(cursor);
  if (!img) return;

  const page = document.createElement('div');
  const pageImg = img.cloneNode(true);
  pageImg.alt = `Page ${cursor}`;
  pageImg.decoding = 'async';
  pageImg.loading = 'eager';
  const w = BASE_PAGE_WIDTH;
  pageImg.style.width = w + 'px';
  pageImg.style.height = 'auto';
  page.appendChild(pageImg);

  spreadEl.replaceChildren(page);
  updateStatus();
  highlightNav();

  // Preload neighbors
  await Promise.all([preload(cursor+1), preload(cursor-1)]);
}

// Navigation (instant)
function goFirst(){ cursor = 1; renderPageView(); }
function goLast(){ cursor = total; renderPageView(); }
function goPrev(){ if (cursor>1) { cursor -= 1; renderPageView(); } }
function goNext(){ if (cursor<total) { cursor += 1; renderPageView(); } }

// Outline
function buildOutlineNav(){
  if (!outlineNav) return;
  outlineNav.innerHTML = '';
  if (!manifest.outline?.length) {
    outlineNav.innerHTML = '<p class="muted">No outline provided in manifest.json.</p>';
    return;
  }
  const ul = document.createElement('ul');
  manifest.outline.forEach(item => {
    const li = document.createElement('li');
    const a  = document.createElement('a');
    a.textContent = (item.title || 'Untitled').toUpperCase();
    a.href = '#'; a.dataset.page = String(item.page);
    a.addEventListener('click', e => { e.preventDefault(); cursor = item.page; renderPageView(); });
    li.appendChild(a); ul.appendChild(li);
  });
  outlineNav.appendChild(ul);
}
function highlightNav(){
  if (!outlineNav || !manifest?.outline) return;
  outlineNav.querySelectorAll('a[data-page]').forEach(a => {
    const n = parseInt(a.dataset.page, 10);
    if (n === cursor) a.setAttribute('aria-current','page');
    else a.removeAttribute('aria-current');
  });
}

// Controls
function wireControls(){
  const $ = id => document.getElementById(id);
  const first = $('first'), prev = $('prev'), next = $('next'), last = $('last');
  const zin = $('zoom-in'), zout = $('zoom-out'), zreset = $('zoom-reset'), dl = $('download');

  if (first) first.addEventListener('click', goFirst);
  if (last)  last.addEventListener('click',  goLast);
  if (prev)  prev.addEventListener('click',  goPrev);
  if (next)  next.addEventListener('click',  goNext);

  if (zin)    zin.addEventListener('click',   () => { zoom = Math.min(2.5, +(zoom+0.1).toFixed(2)); BASE_PAGE_WIDTH=null; updateZoomUI(); renderPageView(); });
  if (zout)   zout.addEventListener('click',  () => { zoom = Math.max(0.5, +(zoom-0.1).toFixed(2)); BASE_PAGE_WIDTH=null; updateZoomUI(); renderPageView(); });
  if (zreset) zreset.addEventListener('click',() => { zoom = 1; BASE_PAGE_WIDTH=null; updateZoomUI(); renderPageView(); });
  if (dl)     dl.addEventListener('click',    () => window.open('/assets/docs/guide.pdf', '_blank'));

  // Keyboard
  window.addEventListener('keydown', (e) => {
    const tag = (e.target && e.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    if (e.key === 'ArrowLeft')  { e.preventDefault(); goPrev(); }
    if (e.key === 'ArrowRight') { e.preventDefault(); goNext(); }
    if (e.key === '+' || e.key === '=') { e.preventDefault(); zoom = Math.min(2.5, +(zoom+0.1).toFixed(2)); BASE_PAGE_WIDTH=null; updateZoomUI(); renderPageView(); }
    if (e.key === '-' || e.key === '_') { e.preventDefault(); zoom = Math.max(0.5, +(zoom-0.1).toFixed(2)); BASE_PAGE_WIDTH=null; updateZoomUI(); renderPageView(); }
    if (e.key === '0')          { e.preventDefault(); zoom = 1; BASE_PAGE_WIDTH=null; updateZoomUI(); renderPageView(); }
    if (e.key === 'Home')       { e.preventDefault(); goFirst(); }
    if (e.key === 'End')        { e.preventDefault(); goLast(); }
  });

  // Touch swipe
  let startX = null;
  viewer.addEventListener('touchstart', (e)=>{ if(e.touches.length===1) startX = e.touches[0].clientX; }, {passive:true});
  viewer.addEventListener('touchend', (e)=>{
    if (startX==null) return;
    const dx = (e.changedTouches && e.changedTouches[0].clientX) - startX;
    if (Math.abs(dx) > 40) (dx < 0 ? goNext() : goPrev());
    startX = null;
  }, {passive:true});
}

// Resize / DPR
let resizeTimer = null;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(async () => {
    const newDPR = window.devicePixelRatio || 1;
    if (newDPR !== DPR) DPR = newDPR;
    BASE_PAGE_WIDTH = null;
    await renderPageView();
  }, 120);
});

// Init
(async function init(){
  try{
    wireControls();
    const res = await fetch(MANIFEST_URL, { cache:'no-store' });
    if (!res.ok) throw new Error('manifest not found');
    manifest = await res.json();
    if (!manifest.imagePattern || !manifest.totalPages) throw new Error('bad manifest');
    total = manifest.totalPages;
    buildOutlineNav();
    updateZoomUI();
    await preload(1); // ensure cover is cached for width baseline
    await renderPageView();
  }catch(err){
    statusEl.textContent = 'Flipbook not configured (missing images/manifest).';
    const tip = document.createElement('p');
    tip.className = 'muted';
    tip.innerHTML = 'Expected images like <code>/assets/docs/guide-pages/page-001.webp</code> and a valid <code>manifest.json</code>.';
    viewer.appendChild(tip);
    console.error('[Flipbook] Init failed:', err);
  }
})();
