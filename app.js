/* ---------- Config ---------- */

// Lock to the single, bookmarked PDF:
const PDF_URL = "assets/the-guide-bookmarks.pdf";

// PDF.js worker
if (window.pdfjsLib) {
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
}

// UI elements
const prevBtn     = document.getElementById("prev");
const nextBtn     = document.getElementById("next");
const pageNow     = document.getElementById("pageNow");
const pageTotal   = document.getElementById("pageTotal");
const bookEl      = document.getElementById("book");
const progressUI  = document.getElementById("progressWrap");
const progressBar = document.getElementById("progressBar");
const statusText  = document.getElementById("status");
const navList     = document.getElementById("navList");
const sidebar     = document.getElementById("sidebar");
const navToggle   = document.getElementById("navToggle");

let flip = null;           // StPageFlip instance
let pdfDoc = null;         // PDFDocumentProxy
let pageImages = [];       // array of data URLs
let spreadEnabled = false; // after cover → spreads (desktop only)
let pageAspect = 1;        // width / height of a single page

/* ---------- Device / Layout ---------- */

function isMobile() {
  return /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || window.innerWidth <= 768;
}
if (isMobile()) document.body.classList.add("is-mobile");

// mobile nav toggle
if (navToggle) {
  navToggle.addEventListener("click", () => {
    const open = sidebar.classList.toggle("open");
    navToggle.setAttribute("aria-expanded", open ? "true" : "false");
  });
}

/* ---------- Busy UI ---------- */

function setBusy(msg, pct){
  if (!progressUI) return;
  progressUI.hidden = false;
  statusText.textContent = msg || "Working…";
  if (typeof pct === "number") {
    progressBar.style.width = `${Math.max(0, Math.min(100, pct))}%`;
  }
}
function clearBusyAndRemove(){
  if (!progressUI) return;
  progressUI.classList.add("hide");
  setTimeout(() => progressUI.remove(), 220);
}

/* ---------- Boot ---------- */

(async function init(){
  await loadPdf(PDF_URL);
  bindControls();
  window.addEventListener("resize", handleResize, { passive: true });
})();

/* ---------- PDF Loading & Rendering ---------- */

async function loadPdf(src){
  setBusy("Loading PDF…", 3);
  const task = pdfjsLib.getDocument({ url: src });
  pdfDoc = await task.promise;

  pageTotal.textContent = String(pdfDoc.numPages);

  // first page → ratio (to keep correct aspect)
  const first = await pdfDoc.getPage(1);
  const vp1   = first.getViewport({ scale: 1 });
  pageAspect  = vp1.width / vp1.height;

  // Height-driven scaling (no distortion), but we NEVER force CSS height:100%
  const targetH = Math.min(1200, Math.max(560, Math.floor(window.innerHeight * 0.82)));
  const scale   = targetH / vp1.height;

  // Render pages sequentially to data URLs
  pageImages = [];
  for (let i = 1; i <= pdfDoc.numPages; i++) {
    setBusy(`Rendering page ${i} of ${pdfDoc.numPages}…`, ((i - 1) / pdfDoc.numPages) * 100);
    const page = i === 1 ? first : await pdfDoc.getPage(i);
    const vp   = page.getViewport({ scale });

    const canvas = document.createElement("canvas");
    const ctx    = canvas.getContext("2d");
    canvas.width  = Math.floor(vp.width);
    canvas.height = Math.floor(vp.height);

    await page.render({ canvasContext: ctx, viewport: vp, intent: "display" }).promise;
    pageImages.push(canvas.toDataURL("image/jpeg", 0.92));
  }

  // Build flipbook in COVER (single page) mode
  const baseW = Math.floor(vp1.width  * scale);
  const baseH = Math.floor(vp1.height * scale);
  buildFlipbook({ mode: "cover", pageW: baseW, pageH: baseH });

  // Build outline-based navigation (sidebar)
  await buildOutlineNav();

  // Remove progress UI once everything is ready
  clearBusyAndRemove();
}

/* ---------- Flipbook Builders ---------- */

function buildFlipbook({ mode, pageW, pageH, startIndex = 0 }){
  // Destroy existing instance
  if (flip) { try { flip.destroy(); } catch(e){} }
  bookEl.innerHTML = "";

  const optsBase = {
    minWidth: 320,
    maxWidth: 2200,
    minHeight: 420,
    maxHeight: 3200,
    maxShadowOpacity: 0.22,
    drawShadow: true,
    flippingTime: 900,
    showCover: true,
    mobileScrollSupport: true,
    usePortrait: true
  };

  // Keep the plugin's own pixel size (no CSS stretching)
  // COVER: always single page
  // SPREAD: allow spreads on wide screens; plugin handles it.
  const options =
    (mode === "cover" || isMobile())
      ? { ...optsBase, size: "fixed", width: pageW, height: pageH }
      : { ...optsBase, size: "stretch", width: pageW, height: pageH };

  flip = new St.PageFlip(bookEl, options);
  flip.loadFromImages(pageImages);

  // go to requested page after rebuild
  if (startIndex) {
    const ix = Math.max(0, Math.min(startIndex, pageImages.length - 1));
    try { flip.turnToPage(ix); } catch(e){}
  }

  // Events
  flip.on("flip", () => {
    const idx = flip.getCurrentPageIndex();
    updatePager();
    highlightActiveInNav(idx);

    // On desktop, as soon as we leave the cover, rebuild in SPREAD mode (once)
    if (!isMobile() && mode === "cover" && idx > 0 && !spreadEnabled) {
      spreadEnabled = true;
      buildFlipbook({ mode: "spread", pageW, pageH, startIndex: idx });
    }
  });

  flip.on("changeOrientation", updatePager);

  updatePager();
}

/* ---------- Controls / Pager ---------- */

function bindControls(){
  document.addEventListener("keydown", (e) => {
    if (!flip) return;
    if (e.key === "ArrowLeft")  flip.flipPrev();
    if (e.key === "ArrowRight") flip.flipNext();
  });
  prevBtn.addEventListener("click", () => flip && flip.flipPrev());
  nextBtn.addEventListener("click", () => flip && flip.flipNext());
}

function updatePager(){
  if (!flip) return;
  const idx   = flip.getCurrentPageIndex(); // 0-based (mostly left page in spreads)
  const total = flip.getPageCount();
  pageNow.textContent   = String(idx + 1);
  pageTotal.textContent = String(total);
  prevBtn.disabled = idx <= 0;
  nextBtn.disabled = idx >= total - 1;
}

function handleResize(){
  if (!flip) return;
  try { flip.update(); } catch(e){}
}

/* ---------- Outline → Navigation ---------- */

async function buildOutlineNav(){
  try {
    const outline = await pdfDoc.getOutline();
    navList.innerHTML = "";

    if (!outline || !outline.length) {
      const empty = document.createElement("div");
      empty.className = "status";
      empty.textContent = "No contents found.";
      navList.appendChild(empty);
      return;
    }

    const frag = document.createDocumentFragment();

    for (const item of outline) {
      const el = await makeNavEntry(item, 0);
      if (el) frag.appendChild(el);
    }
    navList.appendChild(frag);
  } catch (err) {
    navList.innerHTML = "<div class='status'>Contents unavailable.</div>";
    console.warn("Outline parse failed:", err);
  }
}

async function makeNavEntry(item, depth){
  const pageNumber = await resolveOutlineItemToPage(item);
  const wrap = document.createElement("div");

  const btn = document.createElement("button");
  btn.className = "nav-item " + (depth === 0 ? "nav-title" : "nav-sub");
  btn.type = "button";
  btn.textContent = (item.title || "Untitled").trim();
  if (pageNumber) btn.dataset.page = String(pageNumber - 1); // 0-based for flip

  btn.addEventListener("click", () => {
    const idx = parseInt(btn.dataset.page, 10);
    if (Number.isFinite(idx)) {
      turnTo(idx);
      // collapse mobile sidebar after navigation
      if (document.body.classList.contains("is-mobile")) {
        sidebar.classList.remove("open");
        navToggle.setAttribute("aria-expanded", "false");
      }
      highlightActiveInNav(idx);
    }
  });

  wrap.appendChild(btn);

  if (item.items && item.items.length) {
    for (const sub of item.items) {
      const subEl = await makeNavEntry(sub, depth + 1);
      if (subEl) wrap.appendChild(subEl);
    }
  }
  return wrap;
}

async function resolveOutlineItemToPage(item){
  try {
    if (!item) return null;
    let dest = item.dest;

    if (typeof dest === "string") {
      dest = await pdfDoc.getDestination(dest);
    }
    if (Array.isArray(dest) && dest[0]) {
      const ref = dest[0];
      const pageIndex = await pdfDoc.getPageIndex(ref);
      return pageIndex + 1;
    }
    if (typeof item.url === "string") {
      const m = item.url.match(/[#?]page=(\d+)/i);
      if (m) return parseInt(m[1], 10);
    }
  } catch (e) {}
  return null;
}

/* ---------- Helpers ---------- */

function turnTo(idx){
  const clamped = Math.max(0, Math.min(idx, (flip?.getPageCount?.() || 1) - 1));
  if (typeof flip?.turnToPage === "function") {
    flip.turnToPage(clamped);
  } else if (typeof flip?.flip === "function") {
    flip.flip(clamped);
  }
}

/* Highlight the active item.
   In spreads, the current index usually refers to the LEFT page.
   We consider either the left page (idx) OR the right page (idx+1) a match.
   If neither matches exactly, we highlight the nearest previous section. */
function highlightActiveInNav(currentIdx){
  if (!navList) return;

  // Clear previous
  navList.querySelectorAll(".nav-item").forEach(el => el.classList.remove("active"));

  // Try exact matches for left or right page of the spread
  let el =
    navList.querySelector(`.nav-item[data-page="${currentIdx}"]`) ||
    navList.querySelector(`.nav-item[data-page="${currentIdx+1}"]`);

  // Otherwise choose the last section whose page <= right page
  if (!el) {
    const candidates = Array.from(navList.querySelectorAll(".nav-item[data-page]"))
      .map(n => ({ n, p: parseInt(n.dataset.page,10) }))
      .filter(x => Number.isFinite(x.p) && x.p <= currentIdx + 1)
      .sort((a,b) => b.p - a.p);
    el = candidates.length ? candidates[0].n : null;
  }

  if (el) {
    el.classList.add("active");
    // Optional: keep it in view
    const rect = el.getBoundingClientRect();
    const srect = sidebar.getBoundingClientRect();
    if (rect.top < srect.top || rect.bottom > srect.bottom) {
      el.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }
}
