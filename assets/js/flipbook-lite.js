// flipbook-lite.js — Self-contained, dependency-free flipbook
// Polished for robustness, uniform sizing, and proper 3D page-turn animation.
//
// Key guarantees:
// - Interior pages match the cover page width (per zoom & devicePixelRatio) for consistent scale.
// - True 3D flip overlay with front/back faces + shadow, anchored to the spine edge.
// - No stylesheet edits needed (injects its own tiny CSS).
// - Graceful handling of missing manifest/images; prevents overlay stacking.
// - Resize/DPR changes re-render cleanly; keyboard + touch work.
//
// Expected assets:
//   /assets/docs/guide-pages/manifest.json  -> { totalPages, imagePattern, outline?[] }
//   /assets/docs/guide-pages/page-001.webp ... page-NNN.webp

'use strict';

// ---------- DOM references ----------
const viewer     = document.getElementById('viewer');
const spreadEl   = document.getElementById('spread');
const outlineNav = document.getElementById('outline-nav');
const statusEl   = document.getElementById('status');

if (!viewer || !spreadEl || !statusEl) {
  console.error('[Flipbook] Required elements missing (viewer/spread/status).');
}

const MANIFEST_URL = '/assets/docs/guide-pages/manifest.json';

// ---------- Runtime state ----------
let manifest = null;
let total = 0;
let cursor = 1; // left page index in the current spread (1-based)
let zoom = 1;
let DPR = window.devicePixelRatio || 1; // recomputed on resize
let BASE_PAGE_WIDTH = null;             // computed from the cover

// Image cache to avoid reloading
const IMG_CACHE = new Map();

// ---------- CSS injection (no external stylesheet changes) ----------
(function injectFlipStyles(){
  if (document.getElementById('flipbook-3d-styles')) return;
  const css = `
    .viewer{ perspective:1600px; }
    .spread{ position:relative; display:flex; gap:.5rem; justify-content:center; align-items:flex-start; }
    .flip-layer{
      position:absolute; top:0; left:0;
      transform-style:preserve-3d;
      pointer-events:none; will-change:transform;
    }
    .flip-face{
      position:absolute; top:0; left:0;
      backface-visibility:hidden; transform-style:preserve-3d;
      overflow:hidden; border-radius:6px;
      box-shadow: var(--shadow, 0 10px 30px rgba(0,0,0,.45));
    }
    .flip-face.back{ transform: rotateY(180deg); }
    .flip-shadow{
      position:absolute; inset:0; pointer-events:none;
      background: linear-gradient(90deg, rgba(0,0,0,.25), rgba(0,0,0,0) 30%, rgba(0,0,0,0) 70%, rgba(0,0,0,.25));
      opacity:.0;
    }
    @media (prefers-reduced-motion: reduce){
      .flip-layer{ transition:none !important; animation:none !important }
    }
  `;
  const style = document.createElement('style');
  style.id = 'flipbook-3d-styles';
  style.textContent = css;
  document.head.appendChild(style);
})();

// ---------- Utilities ----------
function fmt(pattern, n){
  const num3 = String(n).padStart(3, '0');
  return pattern.replace('{num:03d}', num3).replace('{num}', n);
}

function spreadFor(n, total){
  if (n <= 1)      return [1];       // front cover alone
  if (n >= total)  return [total];   // back cover alone
  const left = n % 2 === 0 ? n : n - 1;
  return [left, left + 1];           // interior spread
}

function preload(n){
  if (!n || n < 1) return Promise.resolve(null);
  if (IMG_CACHE.has(n)) return Promise.resolve(IMG_CACHE.get(n));
  const src = fmt(manifest.imagePattern, n);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => { IMG_CACHE.set(n, img); resolve(img); };
    img.onerror = () => reject(new Error('Failed to load ' + src));
    img.src = src;
  });
}

function computeBaseWidthFromCover(coverImg){
  // Uniform page width = cover natural width corrected for DPR and zoom
  return Math.max(1, Math.round(coverImg.naturalWidth / DPR) * zoom);
}

function makePageWrap(n, img){
  const wrap = document.createElement('div');
  if (n === 1 || n === total) wrap.className = 'page-cover';
  const cloned = img.cloneNode(true);
  cloned.alt = `Page ${n}`;
  cloned.loading = 'eager';
  cloned.decoding = 'async';
  const w = BASE_PAGE_WIDTH ?? Math.round(img.naturalWidth / DPR) * zoom;
  cloned.style.width = w + 'px';
  cloned.style.height = 'auto';
  cloned.draggable = false;
  wrap.appendChild(cloned);
  return wrap;
}

function updateStatus(pages){
  if (!statusEl) return;
  statusEl.textContent = pages.length === 1
    ? `Page ${pages[0]} of ${total}`
    : `Pages ${pages[0]}–${pages[1]} of ${total}`;
}

// ---------- Core rendering ----------
async function renderSpread(){
  if (!manifest) return;

  if (BASE_PAGE_WIDTH == null) {
    const cover = await preload(1);
    if (!cover) return;
    BASE_PAGE_WIDTH = computeBaseWidthFromCover(cover);
  }

  const pages = spreadFor(cursor, total);
  updateStatus(pages);

  // Preload current + neighbors (deduped)
  const nextAfter = Math.min(total, pages[pages.length - 1] + 1);
  const prevBefore = Math.max(1, pages[0] - 1);
  const toLoad = Array.from(new Set([...pages, nextAfter, prevBefore])).filter(Boolean);
  await Promise.all(toLoad.map(preload));

  // Build DOM
  const frag = document.createDocumentFragment();
  for (const p of pages) frag.appendChild(makePageWrap(p, IMG_CACHE.get(p)));
  spreadEl.replaceChildren(frag);

  highlightNav();
}

// ---------- 3D Flip animation overlay ----------
function playFlip(direction){
  // direction: 'next' or 'prev'
  const pages = spreadFor(cursor, total);
  const isCover     = (pages.length === 1 && pages[0] === 1);
  const isBackCover = (pages.length === 1 && pages[0] === total);

  // Bounds check
  if (direction === 'next' && isBackCover) return;
  if (direction === 'prev' && isCover) return;

  // Which physical page flips and what's on its back?
  let frontNum, backNum, originSide, targetIndex;
  if (direction === 'next'){
    frontNum    = (pages.length === 1) ? 1 : pages[1];               // right page (or cover)
    backNum     = Math.min(total, frontNum + 1);                      // next left page
    originSide  = 'left';
    targetIndex = (pages.length === 1) ? 0 : 1;
  } else {
    frontNum    = (pages.length === 1) ? total : pages[0];            // left page (or back cover)
    backNum     = Math.max(1, frontNum - 1);                          // previous right page
    originSide  = 'right';
    targetIndex = 0;
  }

  const frontImg = IMG_CACHE.get(frontNum);
  const backImg  = IMG_CACHE.get(backNum);
  if (!frontImg || !backImg) return;

  const pageWidth  = BASE_PAGE_WIDTH;
  const frontH     = Math.round(frontImg.naturalHeight * (pageWidth / frontImg.naturalWidth));
  const backH      = Math.round(backImg.naturalHeight  * (pageWidth / backImg.naturalWidth));
  const pageHeight = Math.max(frontH, backH); // uniform overlay height

  // Prevent stacking if user spams controls
  const existing = spreadEl.querySelector('.flip-layer');
  if (existing) existing.remove();

  // Overlay layer
  const layer = document.createElement('div');
  layer.className = 'flip-layer';
  layer.style.width  = pageWidth + 'px';
  layer.style.height = pageHeight + 'px';
  layer.style.transformOrigin = originSide === 'left' ? 'left center' : 'right center';

  const faceFront = document.createElement('div');
  faceFront.className = 'flip-face front';
  faceFront.style.width  = pageWidth + 'px';
  faceFront.style.height = pageHeight + 'px';

  const faceBack = document.createElement('div');
  faceBack.className = 'flip-face back';
  faceBack.style.width  = pageWidth + 'px';
  faceBack.style.height = pageHeight + 'px';

  const fImg = frontImg.cloneNode(true);
  const bImg = backImg.cloneNode(true);
  [fImg, bImg].forEach(img => { img.style.width = pageWidth + 'px'; img.style.height = 'auto'; img.draggable = false; });
  faceFront.appendChild(fImg);
  faceBack.appendChild(bImg);

  const shadow = document.createElement('div');
  shadow.className = 'flip-shadow';

  layer.appendChild(faceFront);
  layer.appendChild(faceBack);
  layer.appendChild(shadow);

  // Position overlay exactly over the target page within the spread
  const spreadRect = spreadEl.getBoundingClientRect();
  const target = spreadEl.children[targetIndex];
  if (!target) return;
  const tRect = target.getBoundingClientRect();
  layer.style.left = (tRect.left - spreadRect.left) + 'px';
  layer.style.top  = (tRect.top  - spreadRect.top)  + 'px';

  spreadEl.appendChild(layer);

  // Animate rotation
  const dur  = 560;
  const ease = 'cubic-bezier(.2,.6,.15,1)';
  layer.style.transform  = 'rotateY(0deg)';
  layer.style.transition = `transform ${dur}ms ${ease}, opacity ${dur}ms linear`;
  shadow.animate([{opacity:.0},{opacity:.35, offset:.5},{opacity:.0}], {duration:dur, easing:'linear'});
  requestAnimationFrame(() => {
    layer.style.transform = (direction === 'next') ? 'rotateY(-180deg)' : 'rotateY(180deg)';
  });

  // Commit the logical page turn after the animation
  setTimeout(async () => {
    layer.remove();
    if (direction === 'next') {
      if (cursor < total) cursor = (cursor === 1) ? 2 : Math.min(total, cursor + 2);
    } else {
      if (cursor > 1) cursor = (cursor <= 2) ? 1 : cursor - 2;
    }
    await renderSpread();
  }, dur + 20);
}

// ---------- Outline / UI wiring ----------
function highlightNav(){
  if (!outlineNav || !manifest?.outline) return;
  const pages = spreadFor(cursor, total);
  let active = null;
  outlineNav.querySelectorAll('a[data-page]').forEach(a => {
    const n = parseInt(a.dataset.page, 10);
    if (pages.includes(n)) { a.setAttribute('aria-current', 'page'); active = a; }
    else a.removeAttribute('aria-current');
  });
  if (active) active.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

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
    const a = document.createElement('a');
    a.textContent = (item.title || 'Untitled').toUpperCase();
    a.href = '#'; a.dataset.page = String(item.page);
    a.addEventListener('click', e => { e.preventDefault(); cursor = item.page; renderSpread(); });
    li.appendChild(a); ul.appendChild(li);
  });
  outlineNav.appendChild(ul);
}

function updateZoomUI(){
  const btn = document.getElementById('zoom-reset');
  if (btn) btn.textContent = Math.round(zoom * 100) + '%';
}

function wireControls(){
  const byId = id => document.getElementById(id);
  const first = byId('first'), prev = byId('prev'), next = byId('next'), last = byId('last');
  const zin = byId('zoom-in'), zout = byId('zoom-out'), zreset = byId('zoom-reset'), dl = byId('download');

  if (first) first.addEventListener('click', () => { cursor = 1; renderSpread(); });
  if (last)  last.addEventListener('click',  () => { cursor = total; renderSpread(); });
  if (prev)  prev.addEventListener('click',  () => playFlip('prev'));
  if (next)  next.addEventListener('click',  () => playFlip('next'));

  if (zin)    zin.addEventListener('click',   () => { zoom = Math.min(2.5, +(zoom + 0.1).toFixed(2)); BASE_PAGE_WIDTH = null; updateZoomUI(); renderSpread(); });
  if (zout)   zout.addEventListener('click',  () => { zoom = Math.max(0.5, +(zoom - 0.1).toFixed(2)); BASE_PAGE_WIDTH = null; updateZoomUI(); renderSpread(); });
  if (zreset) zreset.addEventListener('click',() => { zoom = 1; BASE_PAGE_WIDTH = null; updateZoomUI(); renderSpread(); });
  if (dl)     dl.addEventListener('click',    () => window.open('/assets/docs/guide.pdf', '_blank'));

  // Keyboard
  window.addEventListener('keydown', (e) => {
    const tag = (e.target && e.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    if (e.key === 'ArrowLeft')  { e.preventDefault(); playFlip('prev'); }
    if (e.key === 'ArrowRight') { e.preventDefault(); playFlip('next'); }
    if (e.key === '+' || e.key === '=') { e.preventDefault(); zoom = Math.min(2.5, +(zoom + 0.1).toFixed(2)); BASE_PAGE_WIDTH = null; updateZoomUI(); renderSpread(); }
    if (e.key === '-' || e.key === '_') { e.preventDefault(); zoom = Math.max(0.5, +(zoom - 0.1).toFixed(2)); BASE_PAGE_WIDTH = null; updateZoomUI(); renderSpread(); }
    if (e.key === '0')          { e.preventDefault(); zoom = 1; BASE_PAGE_WIDTH = null; updateZoomUI(); renderSpread(); }
    if (e.key === 'Home')       { e.preventDefault(); cursor = 1; renderSpread(); }
    if (e.key === 'End')        { e.preventDefault(); cursor = total; renderSpread(); }
  });

  // Basic touch swipe (threshold)
  let touchStartX = null;
  viewer.addEventListener('touchstart', (e) => {
    if (e.touches.length === 1) touchStartX = e.touches[0].clientX;
  }, {passive:true});
  viewer.addEventListener('touchend', (e) => {
    if (touchStartX == null) return;
    const dx = (e.changedTouches && e.changedTouches[0].clientX) - touchStartX;
    if (Math.abs(dx) > 40) (dx < 0 ? playFlip('next') : playFlip('prev'));
    touchStartX = null;
  }, {passive:true});
}

// Debounced resize handling: account for DPR changes and container reflow
let resizeTimer = null;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(async () => {
    const newDPR = window.devicePixelRatio || 1;
    if (newDPR !== DPR) DPR = newDPR;
    BASE_PAGE_WIDTH = null; // recompute from cover with current zoom/DPR
    await renderSpread();
  }, 120);
});

// ---------- Init ----------
(async function init(){
  try{
    wireControls();
    const res = await fetch(MANIFEST_URL, { cache: 'no-store' });
    if (!res.ok) throw new Error('manifest not found');
    manifest = await res.json();
    if (!manifest.imagePattern || !manifest.totalPages) throw new Error('bad manifest');
    total = manifest.totalPages;
    buildOutlineNav();
    updateZoomUI();
    await renderSpread();
  }catch(err){
    if (statusEl) statusEl.textContent = 'Flipbook not configured (missing images/manifest).';
    const tip = document.createElement('p');
    tip.className = 'muted';
    tip.innerHTML = 'Expected images like <code>/assets/docs/guide-pages/page-001.webp</code> and a <code>manifest.json</code> file.';
    if (viewer) viewer.appendChild(tip);
    console.error('[Flipbook] Init failed:', err);
  }
})();
