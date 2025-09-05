
// Flipbook viewer for /guide/ — renders assets/docs/guide.pdf
// Requires pdfjs-dist files at /vendor/pdfjs/pdf.mjs and /vendor/pdfjs/pdf.worker.min.mjs

const PDF_URL = '/assets/docs/guide.pdf';
const WORKER_URL = '/vendor/pdfjs/pdf.worker.min.mjs';
const MODULE_URL = '/vendor/pdfjs/pdf.mjs';

// Dynamically import pdf.js module
const pdfjsLib = await import(MODULE_URL);
pdfjsLib.GlobalWorkerOptions.workerSrc = WORKER_URL;

const DPR = window.devicePixelRatio || 1;
const viewer = document.getElementById('viewer');
const spreadEl = document.getElementById('spread');
const statusEl = document.getElementById('status');
const fallbackLink = document.getElementById('fallback-link');
const downloadBtn = document.getElementById('download');

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
  const maxCssWidth = Math.min(900, baseVp.width); // cap a single page width
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

  // Pre-render neighbors in the background (idle)
  requestIdleCallback?.(async () => {
    const ahead = Math.min(numPages, pages[pages.length-1] + 2);
    const behind = Math.max(1, pages[0] - 2);
    // Simple cache by forcing browser to decode images
    try {
      await Promise.all([ahead, behind].map(async n => {
        if(n <= 0 || n > numPages) return;
        const c = await renderPage(n);
        // Drop immediately to keep memory low
      }));
    } catch {}
  }, { timeout: 300 });
}

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

// Wire buttons
document.getElementById('first').addEventListener('click', goFirst);
document.getElementById('prev').addEventListener('click', goPrev);
document.getElementById('next').addEventListener('click', goNext);
document.getElementById('last').addEventListener('click', goLast);
document.getElementById('zoom-in').addEventListener('click', zoomIn);
document.getElementById('zoom-out').addEventListener('click', zoomOut);
document.getElementById('zoom-reset').addEventListener('click', zoomReset);
downloadBtn.addEventListener('click', () => { window.open(PDF_URL, '_blank'); });

// Keyboard shortcuts
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

// Load PDF
(async function init(){
  try{
    fallbackLink?.setAttribute('href', PDF_URL);
    const loading = pdfjsLib.getDocument(PDF_URL);
    pdf = await loading.promise;
    numPages = pdf.numPages;
    await renderSpread();
  }catch(err){
    statusEl.textContent = 'Failed to load PDF';
    console.error(err);
  }
})();
