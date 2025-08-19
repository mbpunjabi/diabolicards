/* ---------- Config & Setup ---------- */

// Use your new bookmarked PDF here.
// Put the file at: assets/the-guide-bookmarks.pdf
// (Fallbacks let you keep older name if needed.)
const PDF_URLS = [
  "assets/the-guide-bookmarks.pdf",
  "assets/the-guide.pdf",
  "the-guide.pdf"
];

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

let flip = null;      // StPageFlip instance
let pdfDoc = null;    // PDFDocumentProxy
let pageImages = [];  // data URLs (1-based indexing convenience)

/* ---------- Device / Layout ---------- */

function isMobile() {
  return /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || window.innerWidth <= 768;
}

// set mobile class early
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
  progressUI.hidden = false;
  statusText.textContent = msg || "Working…";
  if (typeof pct === "number") {
    progressBar.style.width = `${Math.max(0, Math.min(100, pct))}%`;
  }
}
function clearBusy(){
  progressBar.style.width = "0%";
  progressUI.hidden = true;
  statusText.textContent = "Ready";
}

/* ---------- PDF Loading & Rendering ---------- */

(async function init(){
  await loadFirstAvailable(PDF_URLS);
  bindControls();
  window.addEventListener("resize", handleResize, { passive: true });
})();

async function loadFirstAvailable(urls){
  for (const u of urls){
    try { await loadPdf(u); return; }
    catch (e) { /* try next path */ }
  }
  setBusy("Failed to find the PDF at expected paths.");
  setTimeout(clearBusy, 1800);
}

async function loadPdf(src){
  setBusy("Loading PDF…", 3);
  const task = pdfjsLib.getDocument({ url: src });
  pdfDoc = await task.promise;

  pageTotal.textContent = String(pdfDoc.numPages);

  // first page to compute ratio
  const first = await pdfDoc.getPage(1);

  // Height-driven scaling for a guaranteed single-page cover
  const viewport1 = first.getViewport({ scale: 1 });
  const baseTargetH = Math.min(1200, Math.max(560, Math.floor(window.innerHeight * 0.82)));
  const scale = baseTargetH / viewport1.height;

  // Render each page into a JPEG (sequential to keep memory stable)
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

  // Build/refresh the flipbook in fixed single-page mode.
  // This centers the cover and prevents a left blank page.
  if (flip) try { flip.destroy(); } catch(e){}
  bookEl.innerHTML = "";

  const baseH = Math.floor(viewport1.height * scale);
  const baseW = Math.floor(viewport1.width * scale);

  flip = new St.PageFlip(bookEl, {
    width:  baseW,
    height: baseH,
    size: "fixed",          // lock geometry → single page always
    minWidth: 320,
    maxWidth: 2200,
    minHeight: 420,
    maxHeight: 3200,
    maxShadowOpacity: 0.22,
    drawShadow: true,
    flippingTime: 900,
    showCover: true,        // first page acts as a hard cover
    mobileScrollSupport: true,
    usePortrait: true
  });

  flip.loadFromImages(pageImages);
  flip.on("flip", () => {
    updatePager();
    highlightActiveInNav(flip.getCurrentPageIndex());
  });
  flip.on("changeOrientation", updatePager);

  updatePager();

  // Build outline-based navigation (tabs)
  await buildOutlineNav();

  clearBusy();
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
  const idx   = flip.getCurrentPageIndex(); // 0-based
  const total = flip.getPageCount();
  pageNow.textContent   = String(idx + 1);
  pageTotal.textContent = String(total);
  prevBtn.disabled = idx <= 0;
  nextBtn.disabled = idx >= total - 1;
}

function handleResize(){
  if (!flip) return;
  // On mobile/desktop toggles, keep single-page and let PageFlip recompute.
  try { flip.update(); } catch(e){}
}

/* ---------- Outline → Navigation ---------- */

async function buildOutlineNav(){
  try {
    const outline = await pdfDoc.getOutline();
    if (!outline || !outline.length) {
      sidebar.style.display = "none"; // hide if no outline present
      return;
    }

    navList.innerHTML = "";
    const frag = document.createDocumentFragment();

    for (const item of outline) {
      const el = await makeNavEntry(item, /*depth*/0);
      if (el) frag.appendChild(el);
    }

    navList.appendChild(frag);
  } catch (err) {
    console.warn("No outline / bookmarks found or failed to parse.", err);
    sidebar.style.display = "none";
  }
}

async function makeNavEntry(item, depth){
  const pageNumber = await resolveOutlineItemToPage(item);
  const li = document.createElement("div");

  const a = document.createElement("button");
  a.className = "nav-item " + (depth === 0 ? "nav-title" : "nav-sub");
  a.type = "button";
  a.textContent = (item.title || "Untitled").trim();
  if (pageNumber) a.dataset.page = String(pageNumber - 1); // flip uses 0-based index

  a.addEventListener("click", () => {
    const idx = parseInt(a.dataset.page, 10);
    if (Number.isFinite(idx)) {
      turnTo(idx);
      if (document.body.classList.contains("is-mobile")) {
        sidebar.classList.remove("open");
        navToggle.setAttribute("aria-expanded", "false");
      }
    }
  });

  li.appendChild(a);

  if (item.items && item.items.length) {
    const group = document.createElement("div");
    for (const sub of item.items) {
      const subEl = await makeNavEntry(sub, depth + 1);
      if (subEl) group.appendChild(subEl);
    }
    li.appendChild(group);
  }

  return li;
}

async function resolveOutlineItemToPage(item){
  try {
    if (!item) return null;
    let dest = item.dest;

    // If the outline uses named destinations, resolve them first.
    if (typeof dest === "string") {
      dest = await pdfDoc.getDestination(dest);
    }

    if (Array.isArray(dest) && dest[0]) {
      const ref = dest[0]; // reference to a page
      const pageIndex = await pdfDoc.getPageIndex(ref);
      return pageIndex + 1; // convert to 1-based
    }
    // Some outlines may directly use a pageRef number:
    if (typeof dest === "number") {
      return dest + 1;
    }
  } catch (e) {
    // ignore and fall through
  }
  return null;
}

/* ---------- Helpers ---------- */

function turnTo(idx){
  // page index safety
  const clamped = Math.max(0, Math.min(idx, (flip?.getPageCount?.() || 1) - 1));
  if (typeof flip?.turnToPage === "function") {
    flip.turnToPage(clamped);
  } else if (typeof flip?.flip === "function") {
    flip.flip(clamped);
  }
}

function highlightActiveInNav(currentIdx){
  if (!navList) return;
  const items = navList.querySelectorAll(".nav-item");
  items.forEach(el => el.classList.remove("active"));
  const current = navList.querySelector(`.nav-item[data-page="${currentIdx}"]`);
  if (current) current.classList.add("active");
}
