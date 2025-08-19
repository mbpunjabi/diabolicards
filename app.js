/* ---------- Config ---------- */

// Single, bookmarked PDF path
const PDF_URL = "assets/the-guide-bookmarks.pdf";

// PDF.js worker
if (window.pdfjsLib) {
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
}

// UI
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
let pageImages = [];       // data URLs
let spreadEnabled = false; // cover → spreads (desktop only)
let pageW0 = 0, pageH0 = 0;

/* ---------- Device / Layout ---------- */

function isMobile() {
  return /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || window.innerWidth <= 768;
}
if (isMobile()) document.body.classList.add("is-mobile");

// Mobile nav toggle
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

  // Use first page for the pixel geometry (no aspect distortion)
  const first = await pdfDoc.getPage(1);
  const vp1   = first.getViewport({ scale: 1 });
  const targetH = Math.min(1200, Math.max(560, Math.floor(window.innerHeight * 0.82)));
  const scale   = targetH / vp1.height;
  pageW0 = Math.floor(vp1.width  * scale);
  pageH0 = Math.floor(vp1.height * scale);

  // Render each page to a JPEG
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

  // Start in COVER (single page) mode
  buildFlipbook({ mode: "cover", startIndex: 0 });

  // Build outline navigation
  await buildOutlineNav();

  // Progress UI—gone
  clearBusyAndRemove();
  setTimeout(() => document.getElementById("progressWrap")?.remove(), 1200); // safety
}

/* ---------- Flipbook Builders ---------- */

function buildFlipbook({ mode, startIndex = 0 }){
  if (flip) { try { flip.destroy(); } catch(e){} }
  bookEl.innerHTML = "";

  const baseOpts = {
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

  const options =
    (mode === "cover" || isMobile())
      ? { ...baseOpts, size: "fixed", width: pageW0, height: pageH0 }    // single page
      : { ...baseOpts, size: "stretch", width: pageW0, height: pageH0 }; // spread-capable

  flip = new St.PageFlip(bookEl, options);
  flip.loadFromImages(pageImages);

  // restore page
  try { flip.turnToPage(Math.max(0, Math.min(startIndex, pageImages.length - 1))); } catch(e){}

  // Events
  flip.on("flip", () => {
    const idx = flip.getCurrentPageIndex();
    updatePager();
    highlightActiveInNav(idx);

    // Leave cover → switch to spreads (desktop only, once)
    if (!isMobile() && mode === "cover" && idx > 0 && !spreadEnabled) {
      spreadEnabled = true;
      buildFlipbook({ mode: "spread", startIndex: idx });
    }
  });

  flip.on("changeOrientation", updatePager);

  updatePager();
}

/* ---------- Navigation + Controls ---------- */

function bindControls(){
  // Use index math to avoid any directional inversion
  prevBtn.addEventListener("click", goPrev);
  nextBtn.addEventListener("click", goNext);

  document.addEventListener("keydown", (e) => {
    if (!flip) return;
    if (e.key === "ArrowLeft")  goPrev();
    if (e.key === "ArrowRight") goNext();
  });
}

function goPrev(){
  if (!flip) return;
  const idx = Math.max(0, flip.getCurrentPageIndex() - 1);
  goTo(idx);
}
function goNext(){
  if (!flip) return;
  const idx = Math.min(flip.getPageCount() - 1, flip.getCurrentPageIndex() + 1);
  goTo(idx);
}

function goTo(targetIdx){
  // If we’re on the cover and jumping past it on desktop, switch to spreads first
  if (!isMobile() && !spreadEnabled && targetIdx > 0) {
    spreadEnabled = true;
    buildFlipbook({ mode: "spread", startIndex: targetIdx });
    return;
  }
  turnTo(targetIdx);
}

function turnTo(idx){
  const clamped = Math.max(0, Math.min(idx, (flip?.getPageCount?.() || 1) - 1));
  try {
    if (typeof flip?.turnToPage === "function") flip.turnToPage(clamped);
    else if (typeof flip?.flip === "function")  flip.flip(clamped);
  } catch(e){}
}

function updatePager(){
  if (!flip) return;
  const idx   = flip.getCurrentPageIndex();
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
      goTo(idx); // use robust goTo() (handles cover→spread safely)
      if (document.body.classList.contains("is-mobile")) {
        sidebar.classList.remove("open");
        navToggle.setAttribute("aria-expanded", "false");
      }
      // highlight immediately (also updated on flip)
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

    if (typeof dest === "string") dest = await pdfDoc.getDestination(dest);
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

/* ---------- Nav Highlighting ---------- */
/* Works for spreads: match current left page OR right page,
   otherwise pick the closest earlier section. */
function highlightActiveInNav(currentIdx){
  if (!navList) return;

  navList.querySelectorAll(".nav-item").forEach(el => el.classList.remove("active"));

  let el =
    navList.querySelector(`.nav-item[data-page="${currentIdx}"]`) ||
    navList.querySelector(`.nav-item[data-page="${currentIdx+1}"]`);

  if (!el) {
    const candidates = Array.from(navList.querySelectorAll(".nav-item[data-page]"))
      .map(n => ({ n, p: parseInt(n.dataset.page,10) }))
      .filter(x => Number.isFinite(x.p) && x.p <= currentIdx + 1)
      .sort((a,b) => b.p - a.p);
    el = candidates[0]?.n ?? null;
  }

  if (el) {
    el.classList.add("active");
    const rect = el.getBoundingClientRect();
    const srect = sidebar.getBoundingClientRect();
    if (rect.top < srect.top || rect.bottom > srect.bottom) {
      el.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }
}
