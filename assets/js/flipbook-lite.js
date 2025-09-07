// flipbook-lite.js — Single-page viewer with multi-slice 3D curl (no external libraries)
//
// What changed vs earlier version?
// - SINGLE PAGE MODE: always shows one page (same width as cover).
// - IMPROVED FLIP: multi-slice 3D curl overlay (closer to Paginis feel) +
//   dynamic highlight/shadow. Still light & dependency-free.
//
// Expected assets (unchanged):
//   /assets/docs/guide-pages/manifest.json  -> { totalPages, imagePattern, outline?[] }
//   /assets/docs/guide-pages/page-001.webp … page-NNN.webp
'use strict';

// ---------- Config ----------
const MANIFEST_URL = '/assets/docs/guide-pages/manifest.json';
const SLICES   = 18;     // more = smoother curl (try 12–24)
const DURATION = 680;    // ms
const CURVE_Z  = 14;     // max "bulge" in px (depth) during curl
const EASE     = (t)=> 1-(1-t)*(1-t); // easeOutQuad

// ---------- DOM ----------
const viewer     = document.getElementById('viewer');
const spreadEl   = document.getElementById('spread');   // we still use this container
const outlineNav = document.getElementById('outline-nav');
const statusEl   = document.getElementById('status');

if (!viewer || !spreadEl || !statusEl) {
  console.error('[Flipbook] Required elements missing.');
}

// ---------- Runtime state ----------
let manifest = null;
let total    = 0;
let cursor   = 1;                       // current page (1..total)
let zoom     = 1;
let DPR      = window.devicePixelRatio || 1;
let BASE_PAGE_WIDTH = null;             // computed from cover
const IMG_CACHE = new Map();

// ---------- Inject minimal CSS required for curl ----------
(function injectFlipStyles(){
  if (document.getElementById('flipbook-3d-styles')) return;
  const css = `
    .viewer{ perspective:1600px; }
    .spread{ position:relative; display:flex; justify-content:center; }
    .flip-overlay{ position:absolute; top:0; left:0; transform-style:preserve-3d; pointer-events:none; }
    .slice{ position:absolute; top:0; transform-style:preserve-3d; will-change:transform; }
    .face{ position:absolute; inset:0; backface-visibility:hidden; overflow:hidden; }
    .face.back{ transform: rotateY(180deg); }
    .face > div{ position:absolute; top:0; left:0; right:0; bottom:0; background-repeat:no-repeat; background-size:var(--w) var(--h); }
    .gloss, .shadow{
      position:absolute; inset:0; pointer-events:none; opacity:0;
    }
    .gloss{
      background: linear-gradient(90deg, rgba(255,255,255,.22), rgba(255,255,255,0) 40%, rgba(255,255,255,0) 60%, rgba(255,255,255,.18));
      mix-blend-mode: screen;
    }
    .shadow{
      background: linear-gradient(90deg, rgba(0,0,0,.35), rgba(0,0,0,0) 40%, rgba(0,0,0,0) 60%, rgba(0,0,0,.35));
      mix-blend-mode: multiply;
    }
    @media (prefers-reduced-motion: reduce){
      .flip-overlay{ transition:none !important; animation:none !important }
    }
  `;
  const style = document.createElement('style');
  style.id = 'flipbook-3d-styles';
  style.textContent = css;
  document.head.appendChild(style);
})();

// ---------- Helpers ----------
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

// ---------- Render (single page) ----------
async function renderPageView(){
  if (!manifest) return;

  if (BASE_PAGE_WIDTH == null){
    const cover = await preload(1);
    BASE_PAGE_WIDTH = computeBaseWidthFromCover(cover);
  }

  const img = await preload(cursor);
  if (!img) return;

  // Build a standalone page element
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

  // Preload neighbors for snappy flips
  await Promise.all([preload(cursor+1), preload(cursor-1)]);
}

// ---------- Curl overlay (multi-slice) ----------
function playFlip(direction){
  // direction: 'next' or 'prev'
  if ((direction === 'next' && cursor >= total) ||
      (direction === 'prev' && cursor <= 1)) return;

  const frontNum   = cursor;
  const backNum    = direction === 'next' ? Math.min(total, cursor+1) : Math.max(1, cursor-1);
  const frontImg   = IMG_CACHE.get(frontNum);
  const backImg    = IMG_CACHE.get(backNum);
  if (!frontImg || !backImg) return;

  const pageWidth  = BASE_PAGE_WIDTH;
  const pageHeight = Math.round(frontImg.naturalHeight * (pageWidth / frontImg.naturalWidth));

  // Create overlay container
  const overlay = document.createElement('div');
  overlay.className = 'flip-overlay';
  overlay.style.width  = pageWidth + 'px';
  overlay.style.height = pageHeight + 'px';
  overlay.style.transformOrigin = (direction === 'next') ? 'left center' : 'right center';

  // Position overlay exactly over the displayed page
  const spreadRect = spreadEl.getBoundingClientRect();
  const target = spreadEl.children[0];
  if (!target) return;
  const tRect = target.getBoundingClientRect();
  overlay.style.left = (tRect.left - spreadRect.left) + 'px';
  overlay.style.top  = (tRect.top  - spreadRect.top)  + 'px';

  // Build slices
  const sliceW = Math.ceil(pageWidth / SLICES);
  const frontURL = frontImg.src, backURL = backImg.src;

  // shared overlays
  const gloss = document.createElement('div');  gloss.className = 'gloss';
  const shadow = document.createElement('div'); shadow.className = 'shadow';
  overlay.appendChild(gloss); overlay.appendChild(shadow);

  for (let i=0;i<SLICES;i++){
    const x = i * sliceW;
    const realW = Math.min(sliceW, pageWidth - x);

    const slice = document.createElement('div');
    slice.className = 'slice';
    slice.style.width  = realW + 'px';
    slice.style.height = pageHeight + 'px';
    slice.style.left   = x + 'px';
    slice.style.transformOrigin = (direction === 'next') ? 'left center' : 'right center';

    // front face
    const faceF = document.createElement('div');
    faceF.className = 'face front';
    const imgF = document.createElement('div');
    imgF.style.setProperty('--w', pageWidth+'px');
    imgF.style.setProperty('--h', pageHeight+'px');
    imgF.style.backgroundImage = `url("${frontURL}")`;
    imgF.style.backgroundPosition = `-${x}px 0`;
    faceF.appendChild(imgF);

    // back face
    const faceB = document.createElement('div');
    faceB.className = 'face back';
    const imgB = document.createElement('div');
    imgB.style.setProperty('--w', pageWidth+'px');
    imgB.style.setProperty('--h', pageHeight+'px');
    imgB.style.backgroundImage = `url("${backURL}")`;
    imgB.style.backgroundPosition = `-${x}px 0`;
    faceB.appendChild(imgB);

    slice.appendChild(faceF);
    slice.appendChild(faceB);
    overlay.appendChild(slice);
  }

  spreadEl.appendChild(overlay);

  // Animate with requestAnimationFrame for per-slice curvature
  const start = performance.now();
  (function frame(now){
    let t = (now - start) / DURATION;
    if (t > 1) t = 1;
    const eased = EASE(t);

    // base rotation from 0 -> ±180°
    const base = (direction === 'next' ? -180 : 180) * eased;

    // gloss/shadow timing
    const glossAlpha   = Math.sin(Math.PI * eased) * 0.65;
    const shadowAlpha  = Math.sin(Math.PI * eased) * 0.75;
    gloss.style.opacity  = glossAlpha.toFixed(3);
    shadow.style.opacity = shadowAlpha.toFixed(3);

    // Update each slice with slight offsets to simulate curling
    const children = overlay.querySelectorAll('.slice');
    const n = children.length;
    for (let i = 0; i < n; i++){
      const slice = children[i];
      // factor: 1 at spine → 0 at outer edge
      const spineFirst = (direction === 'next');
      const frac = spineFirst ? (i / (n-1)) : (1 - i / (n-1));
      const curve = (1 - frac); // near spine bends more
      const angle = base * (0.90 + 0.10 * curve); // slightly more rotation near spine
      const bulge = CURVE_Z * Math.sin(Math.PI * eased) * curve; // translateZ depth

      slice.style.transform =
        `translateZ(${bulge.toFixed(2)}px) rotateY(${angle.toFixed(2)}deg)`;
    }

    if (t < 1) {
      requestAnimationFrame(frame);
    } else {
      // Commit the logical turn
      overlay.remove();
      cursor = (direction === 'next') ? Math.min(total, cursor+1) : Math.max(1, cursor-1);
      renderPageView();
    }
  })(start);
}

// ---------- Outline & UI ----------
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
function updateZoomUI(){
  const btn = document.getElementById('zoom-reset');
  if (btn) btn.textContent = Math.round(zoom*100) + '%';
}
function wireControls(){
  const $ = id => document.getElementById(id);
  const first = $('first'), prev = $('prev'), next = $('next'), last = $('last');
  const zin = $('zoom-in'), zout = $('zoom-out'), zreset = $('zoom-reset'), dl = $('download');

  if (first) first.addEventListener('click', () => { cursor = 1; renderPageView(); });
  if (last)  last.addEventListener('click',  () => { cursor = total; renderPageView(); });
  if (prev)  prev.addEventListener('click',  () => playFlip('prev'));
  if (next)  next.addEventListener('click',  () => playFlip('next'));

  if (zin)    zin.addEventListener('click',   () => { zoom = Math.min(2.5, +(zoom+0.1).toFixed(2)); BASE_PAGE_WIDTH=null; updateZoomUI(); renderPageView(); });
  if (zout)   zout.addEventListener('click',  () => { zoom = Math.max(0.5, +(zoom-0.1).toFixed(2)); BASE_PAGE_WIDTH=null; updateZoomUI(); renderPageView(); });
  if (zreset) zreset.addEventListener('click',() => { zoom = 1; BASE_PAGE_WIDTH=null; updateZoomUI(); renderPageView(); });
  if (dl)     dl.addEventListener('click',    () => window.open('/assets/docs/guide.pdf', '_blank'));

  window.addEventListener('keydown', (e) => {
    const tag = (e.target && e.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    if (e.key === 'ArrowLeft')  { e.preventDefault(); playFlip('prev'); }
    if (e.key === 'ArrowRight') { e.preventDefault(); playFlip('next'); }
    if (e.key === '+' || e.key === '=') { e.preventDefault(); zoom = Math.min(2.5, +(zoom+0.1).toFixed(2)); BASE_PAGE_WIDTH=null; updateZoomUI(); renderPageView(); }
    if (e.key === '-' || e.key === '_') { e.preventDefault(); zoom = Math.max(0.5, +(zoom-0.1).toFixed(2)); BASE_PAGE_WIDTH=null; updateZoomUI(); renderPageView(); }
    if (e.key === '0')          { e.preventDefault(); zoom = 1; BASE_PAGE_WIDTH=null; updateZoomUI(); renderPageView(); }
    if (e.key === 'Home')       { e.preventDefault(); cursor = 1; renderPageView(); }
    if (e.key === 'End')        { e.preventDefault(); cursor = total; renderPageView(); }
  });

  // touch swipe
  let startX = null;
  viewer.addEventListener('touchstart', (e)=>{ if(e.touches.length===1) startX = e.touches[0].clientX; }, {passive:true});
  viewer.addEventListener('touchend', (e)=>{
    if (startX==null) return;
    const dx = (e.changedTouches && e.changedTouches[0].clientX) - startX;
    if (Math.abs(dx) > 40) (dx < 0 ? playFlip('next') : playFlip('prev'));
    startX = null;
  }, {passive:true});
}

// ---------- Resize / DPR ----------
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

// ---------- Init ----------
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
    await preload(1); // ensure cover available for width baseline
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
