
// Flipbook viewer for /guide/ — renders assets/docs/guide.pdf and builds outline-based left navigation.
// Attempts to import local pdfjs; falls back to CDN if missing.

const PDF_URL = '/assets/docs/guide.pdf';
const LOCAL_MODULE_URL = '/vendor/pdfjs/pdf.mjs';
const LOCAL_WORKER_URL = '/vendor/pdfjs/pdf.worker.min.mjs';
const CDN_BASE = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.7.76/build/';
const CDN_MODULE_URL = CDN_BASE + 'pdf.mjs';
const CDN_WORKER_URL = CDN_BASE + 'pdf.worker.min.mjs';

async function loadPdfJs(){
  try{
    const mod = await import(LOCAL_MODULE_URL);
    mod.GlobalWorkerOptions.workerSrc = LOCAL_WORKER_URL;
    return mod;
  }catch(e){
    console.warn('[Flipbook] Local pdfjs not found, using CDN fallback.', e);
    const mod = await import(CDN_MODULE_URL);
    mod.GlobalWorkerOptions.workerSrc = CDN_WORKER_URL;
    return mod;
  }
}

const pdfjsLib = await loadPdfJs();

const DPR = window.devicePixelRatio || 1;
const viewer = document.getElementById('viewer');
const spreadEl = document.getElementById('spread');
const statusEl = document.getElementById('status');
const fallbackLink = document.getElementById('fallback-link');
const downloadBtn = document.getElementById('download');
const outlineNav = document.getElementById('outline-nav');

let pdf, numPages = 0;
let cursor = 1; // left page of spread (1 is cover)
let zoom = 1; // relative css zoom multiplier
let inflightTasks = [];

function spreadFor(n, total){
  if(n <= 1) return [1];
  if(n >= total) return [total];
  const left = n % 2 === 0 ? n : n - 1;
  return [left, left + 1];
}

function clearTasks(){
  inflightTasks.forEach(t => t.cancel?.());
  inflightTasks = [];
}

async function renderPage(n){
  const page = await pdf.getPage(n);
  const baseVp = page.getViewport({ scale: 1 });
  const maxCssWidth = Math.min(900, baseVp.width);
  const scale = (maxCssWidth / baseVp.width) * DPR * zoom;
  const vp = page.getViewport({ scale });

  const canvas = document.createElement('canvas');
  canvas.width = Math.floor(vp.width);
  canvas.height = Math.floor(vp.height);
  canvas.style.width = (vp.width / DPR) + 'px';
  canvas.style.height = (vp.height / DPR) + 'px';
  const ctx = canvas.getContext('2d', { alpha: false });
  const task = page.render({ canvasContext: ctx, viewport: vp });
  inflightTasks.push(task);
  await task.promise;
  page.cleanup?.();
  return canvas;
}

function highlightNav(){
  if(!outlineNav) return;
  const pages = spreadFor(cursor, numPages);
  outlineNav.querySelectorAll('a[data-page]').forEach(a => {
    const n = parseInt(a.getAttribute('data-page'), 10);
    if(pages.includes(n)){
      a.setAttribute('aria-current', 'page');
    }else{
      a.removeAttribute('aria-current');
    }
  });
}

async function renderSpread(){
  clearTasks();
  const pages = spreadFor(cursor, numPages);
  statusEl.textContent = pages.length === 1
    ? `Page ${pages[0]} of ${numPages}`
    : `Pages ${pages[0]}–${pages[1]} of ${numPages}`;

  const frag = document.createDocumentFragment();
  for(const p of pages){
    const wrap = document.createElement('div');
    if(p === 1 || p === numPages) wrap.className = 'page-cover';
    wrap.appendChild(await renderPage(p));
    frag.appendChild(wrap);
  }
  spreadEl.replaceChildren(frag);
  highlightNav();

  requestIdleCallback?.(() => {
    // optional: pre-render neighbors; omitted to keep memory modest
  }, { timeout: 300 });
}

// Buttons
function goFirst(){ cursor = 1; renderSpread(); }
function goLast(){ cursor = numPages; renderSpread(); }
function goPrev(){
  if(cursor === 1) return;
  if(cursor <= 2){ cursor = 1; } else { cursor -= 2; }
  renderSpread();
}
function goNext(){
  if(cursor >= numPages) return;
  if(cursor === 1){ cursor = 2; } else { cursor = Math.min(numPages, cursor + 2); }
  renderSpread();
}
function zoomIn(){ zoom = Math.min(2.5, Math.round((zoom + 0.1)*10)/10); renderSpread(); updateZoomUI(); }
function zoomOut(){ zoom = Math.max(0.5, Math.round((zoom - 0.1)*10)/10); renderSpread(); updateZoomUI(); }
function zoomReset(){ zoom = 1; renderSpread(); updateZoomUI(); }
function updateZoomUI(){
  const btn = document.getElementById('zoom-reset');
  btn.textContent = Math.round(zoom*100) + '%';
}

document.getElementById('first').addEventListener('click', goFirst);
document.getElementById('prev').addEventListener('click', goPrev);
document.getElementById('next').addEventListener('click', goNext);
document.getElementById('last').addEventListener('click', goLast);
document.getElementById('zoom-in').addEventListener('click', zoomIn);
document.getElementById('zoom-out').addEventListener('click', zoomOut);
document.getElementById('zoom-reset').addEventListener('click', zoomReset);
downloadBtn.addEventListener('click', () => { window.open(PDF_URL, '_blank'); });

window.addEventListener('keydown', (e) => {
  const tag = (e.target && e.target.tagName) || '';
  if(tag === 'INPUT' || tag === 'TEXTAREA') return;
  if(e.key === 'ArrowLeft') goPrev();
  if(e.key === 'ArrowRight') goNext();
  if(e.key === '+' || e.key === '=') { e.preventDefault(); zoomIn(); }
  if(e.key === '-' || e.key === '_') { e.preventDefault(); zoomOut(); }
  if(e.key === '0') { e.preventDefault(); zoomReset(); }
  if(e.key === 'Home') goFirst();
  if(e.key === 'End') goLast();
});

async function buildOutline(){
  if(!outlineNav) return;
  try{
    const outline = await pdf.getOutline();
    if(!outline || !outline.length){
      outlineNav.innerHTML = '<p class="muted">No bookmarks found in this PDF.</p>';
      return;
    }

    async function pageFromDest(dest){
      if(!dest) return null;
      try{
        const explicitDest = await pdf.getDestination(dest);
        if(!explicitDest) return null;
        const ref = explicitDest[0];
        const pageIndex = await pdf.getPageIndex(ref);
        return pageIndex + 1;
      }catch(e){ return null; }
    }

    async function renderItems(items){
      const ul = document.createElement('ul');
      for(const item of items){
        const li = document.createElement('li');
        const a = document.createElement('a');
        a.textContent = (item.title || 'Untitled').toUpperCase();
        a.href = '#';
        const pageNum = await pageFromDest(item.dest);
        if(pageNum){
          a.dataset.page = String(pageNum);
          a.addEventListener('click', (e)=>{
            e.preventDefault();
            cursor = pageNum;
            renderSpread();
          });
        }else if(item.url){
          a.href = item.url; a.target = '_blank'; a.rel = 'noopener';
        }else{
          a.removeAttribute('href');
          a.style.opacity = .6;
        }
        li.appendChild(a);
        if(item.items && item.items.length){
          li.appendChild(await renderItems(item.items));
        }
        ul.appendChild(li);
      }
      return ul;
    }

    outlineNav.innerHTML = '';
    outlineNav.appendChild(await renderItems(outline));
    highlightNav();
  }catch(err){
    console.error('[Flipbook] Failed to build outline', err);
    outlineNav.innerHTML = '<p class="muted">Could not load bookmarks.</p>';
  }
}

// Load PDF
(async function init(){
  try{
    fallbackLink?.setAttribute('href', PDF_URL);
    const loading = pdfjsLib.getDocument(PDF_URL);
    pdf = await loading.promise;
    numPages = pdf.numPages;
    await renderSpread();
    await buildOutline();
  }catch(err){
    console.error('[Flipbook] Failed to load PDF.', err);
    statusEl.textContent = 'Failed to load PDF. Make sure /assets/docs/guide.pdf exists.';
    const hint = document.createElement('p');
    hint.className = 'muted';
    hint.textContent = 'Common causes: (1) missing guide.pdf, (2) missing pdfjs files (we now fallback to CDN), (3) CORS if hosting elsewhere.';
    viewer.appendChild(hint);
  }
})();
