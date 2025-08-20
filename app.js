const PDF_URL = "assets/the-guide-bookmarks.pdf";
if (window.pdfjsLib) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
}
const prevBtn = document.getElementById("prev");
const nextBtn = document.getElementById("next");
const pageNow = document.getElementById("pageNow");
const pageTotal = document.getElementById("pageTotal");
const bookEl = document.getElementById("book");
const progressUI = document.getElementById("progressWrap");
const progressBar = document.getElementById("progressBar");
const statusText = document.getElementById("status");
const navList = document.getElementById("navList");
const navStrip = document.getElementById("navStrip");
const sidebar = document.getElementById("sidebar");
const toolbar = document.querySelector(".toolbar");

let flip = null;
let pdfDoc = null;
let pageImages = [];
let baseW = 0, baseH = 0;
let pdfPageCount = 0;
let resizeToken = 0;

function isMobile() {
  return /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || window.innerWidth <= 768;
}
if (isMobile()) document.body.classList.add("is-mobile");

function setBusy(msg, pct){
  if (!progressUI) return;
  progressUI.hidden = false;
  statusText.textContent = msg || "Working…";
  if (typeof pct === "number") {
    progressBar.style.width = `${Math.max(0, Math.min(100, pct))}%`;
    progressUI.querySelector(".progress")?.setAttribute("aria-valuenow", String(Math.floor(pct)));
  }
}
function clearBusyAndRemove(){
  if (!progressUI) return;
  progressUI.classList.add("hide");
  setTimeout(() => progressUI?.remove(), 220);
  setTimeout(() => document.getElementById("progressWrap")?.remove(), 1200);
}
function updateToolbarVar(){
  const h = toolbar?.offsetHeight || 64;
  document.documentElement.style.setProperty("--toolbar-h", `${h}px`);
}
function updateMobileNavHeight(){
  if (!document.body.classList.contains("is-mobile")) return;
  const h = document.getElementById("navStrip")?.offsetHeight || 0;
  document.documentElement.style.setProperty("--mobile-nav-h", `${Math.max(40, h)}px`);
}
function bust(u){ return u.includes("?") ? `${u}&t=${Date.now()}` : `${u}?t=${Date.now()}`; }
function safeRect(el){
  const r = el?.getBoundingClientRect?.() || { width: 0, height: 0 };
  return { w: Math.max(1, Math.floor(r.width)), h: Math.max(1, Math.floor(r.height)) };
}

(async function init(){
  updateToolbarVar();
  await loadPdfWithRetry(PDF_URL, 3, 300);
  bindControls();
  window.addEventListener("resize", handleResize, { passive: true });
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", handleResize, { passive: true });
  }
  window.addEventListener("orientationchange", () => setTimeout(handleResize, 200), { passive: true });
  window.addEventListener("pageshow", (e) => { if (e.persisted && flip) buildFlipbook(flip.getCurrentPageIndex()); });
})();

async function loadPdfWithRetry(url, tries = 3, delay = 300){
  for (let i = 0; i < tries; i++) {
    try { await loadPdf(i ? bust(url) : url); return; }
    catch (e) { if (i === tries - 1) throw e; await new Promise(r => setTimeout(r, delay * (i + 1))); }
  }
}

async function loadPdf(src){
  setBusy("Loading PDF…", 3);
  const task = pdfjsLib.getDocument({ url: src });
  pdfDoc = await task.promise;
  pdfPageCount = pdfDoc.numPages;
  pageTotal.textContent = String(pdfPageCount);

  const first = await pdfDoc.getPage(1);
  const vp1 = first.getViewport({ scale: 1 });

  const stage = document.querySelector(".stage");
  const r = safeRect(stage);
  const targetH = Math.max(360, r.h - 16);
  const displayScale = targetH / vp1.height;

  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  const qualityBoost = isMobile() ? Math.min(Math.max(1.75, dpr * 1.25), 2.5) : Math.min(Math.max(1.25, dpr), 1.75);
  const renderScale = displayScale * qualityBoost;

  baseW = Math.floor(vp1.width * displayScale);
  baseH = Math.floor(vp1.height * displayScale);

  pageImages = [];

  const blank = document.createElement("canvas");
  blank.width = Math.floor(vp1.width * displayScale);
  blank.height = Math.floor(vp1.height * displayScale);
  pageImages.push(blank.toDataURL("image/png"));

  for (let i = 1; i <= pdfDoc.numPages; i++) {
    setBusy(`Rendering page ${i} of ${pdfDoc.numPages}…`, (i / pdfDoc.numPages) * 100);
    const page = i === 1 ? first : await pdfDoc.getPage(i);
    const vp = page.getViewport({ scale: renderScale });
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    canvas.width = Math.floor(vp.width);
    canvas.height = Math.floor(vp.height);
    await page.render({ canvasContext: ctx, viewport: vp, intent: "display" }).promise;
    pageImages.push(canvas.toDataURL("image/jpeg", 0.92));
  }

  buildFlipbook(1);
  await buildOutlineNav();
  clearBusyAndRemove();
  updateMobileNavHeight();
}

function computePageSize(pagesAcross){
  const r = safeRect(document.querySelector(".stage"));
  const maxW = Math.max(320, r.w - 16);
  const maxH = Math.max(320, r.h - 16);
  const s1 = maxH / baseH;
  const s2 = maxW / (pagesAcross * baseW);
  const s = Math.min(s1, s2, 1.0);
  const w = Math.max(260, Math.floor(baseW * s));
  const h = Math.max(260, Math.floor(baseH * s));
  return (w < 260 || h < 260) ? null : { w, h };
}

function buildFlipbook(startIndex){
  requestAnimationFrame(() => {
    const pagesAcross = isMobile() ? 1 : 2;
    const sz = computePageSize(pagesAcross);
    if (!sz) return requestAnimationFrame(() => buildFlipbook(startIndex));

    if (flip) { try { flip.destroy(); } catch(e){} }
    bookEl.innerHTML = "";

    const opts = {
      minWidth: 320,
      maxWidth: 2600,
      minHeight: 420,
      maxHeight: 3400,
      maxShadowOpacity: 0.22,
      drawShadow: true,
      flippingTime: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 400 : 900,
      showCover: false,
      mobileScrollSupport: true,
      usePortrait: isMobile(),
      size: "fixed",
      width: sz.w,
      height: sz.h
    };

    flip = new St.PageFlip(bookEl, opts);
    flip.loadFromImages(pageImages);

    const ix = Math.max(0, Math.min(startIndex, pageImages.length - 1));
    try { flip.turnToPage(ix); } catch(e){}

    flip.on("flip", () => {
      updatePager();
      highlightActiveInNav(flip.getCurrentPageIndex());
    });

    updatePager();
    highlightActiveInNav(ix);
  });
}

function bindControls(){
  prevBtn.addEventListener("click", () => {
    if (flip?.flipPrev) flip.flipPrev();
    else goTo(Math.max(0, (flip?.getCurrentPageIndex?.()||0) - 1));
  });
  nextBtn.addEventListener("click", () => {
    if (flip?.flipNext) flip.flipNext();
    else {
      const total = flip?.getPageCount?.() || 1;
      goTo(Math.min(total - 1, (flip?.getCurrentPageIndex?.()||0) + 1));
    }
  });
  document.addEventListener("keydown", (e) => {
    if (!flip) return;
    if (e.key === "ArrowLeft") { e.preventDefault(); if (flip.flipPrev) flip.flipPrev(); else goTo(Math.max(0, flip.getCurrentPageIndex()-1)); }
    if (e.key === "ArrowRight") { e.preventDefault(); if (flip.flipNext) flip.flipNext(); else { const t=flip.getPageCount(); goTo(Math.min(t-1, flip.getCurrentPageIndex()+1)); } }
  });
}

function goTo(idx){
  const clamped = Math.max(0, Math.min(idx, (flip?.getPageCount?.() || 1) - 1));
  try { flip.turnToPage(clamped); } catch(e){}
}

function updatePager(){
  if (!flip) return;
  const idx = flip.getCurrentPageIndex();
  const logical = Math.max(1, idx);
  pageNow.textContent = String(logical);
  pageTotal.textContent = String(pdfPageCount);
  prevBtn.disabled = idx <= 0;
  nextBtn.disabled = idx >= (flip.getPageCount() - 1);
}

function handleResize(){
  updateToolbarVar();
  const id = ++resizeToken;
  setTimeout(() => {
    if (id === resizeToken && flip) {
      buildFlipbook(flip.getCurrentPageIndex());
      updateMobileNavHeight();
    }
  }, 140);
}

/* ----- Outline / Navigation ----- */

async function buildOutlineNav(){
  try {
    const outline = await pdfDoc.getOutline();
    navList.innerHTML = "";
    navStrip.innerHTML = "";

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

    const flat = await flattenOutline(outline);
    for (const it of flat) {
      if (!Number.isFinite(it.page)) continue;
      const chip = document.createElement("button");
      chip.className = "nav-chip";
      chip.type = "button";
      chip.textContent = it.title;
      chip.dataset.page = String(it.page);
      chip.addEventListener("click", () => {
        const idx = parseInt(chip.dataset.page, 10);
        if (Number.isFinite(idx)) {
          goTo(idx);
          highlightActiveInNav(idx);
        }
      });
      navStrip.appendChild(chip);
    }
  } catch (err) {
    navList.innerHTML = "<div class='status'>Contents unavailable.</div>";
  }
}

async function makeNavEntry(item, depth){
  const pageNumber = await resolveOutlineItemToPage(item);
  const wrap = document.createElement("div");
  const btn = document.createElement("button");
  btn.className = "nav-item " + (depth === 0 ? "nav-title" : "nav-sub");
  btn.type = "button";
  btn.textContent = (item.title || "Untitled").trim();
  if (pageNumber) btn.dataset.page = String(pageNumber);
  btn.addEventListener("click", () => {
    const idx = parseInt(btn.dataset.page, 10);
    if (Number.isFinite(idx)) {
      goTo(idx);
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

async function flattenOutline(items, depth = 0, acc = []){
  for (const it of items) {
    const page = await resolveOutlineItemToPage(it);
    const title = (it.title || "Untitled").trim();
    if (page) acc.push({ title, page });
    if (it.items && it.items.length) await flattenOutline(it.items, depth + 1, acc);
  }
  return acc;
}

async function resolveOutlineItemToPage(item){
  try {
    if (!item) return null;
    let dest = item.dest;
    if (typeof dest === "string") dest = await pdfDoc.getDestination(dest);
    if (Array.isArray(dest) && dest[0]) {
      const ref = dest[0];
      const pageIndex = await pdfDoc.getPageIndex(ref);
      return pageIndex + 1; // accounts for inserted blank at index 0
    }
    if (typeof item.url === "string") {
      const m = item.url.match(/[#?]page=(\d+)/i);
      if (m) return parseInt(m[1], 10);
    }
  } catch (e) {}
  return null;
}

function highlightActiveInNav(currentIdx){
  const logical = Math.max(1, currentIdx);

  if (navList) {
    navList.querySelectorAll(".nav-item").forEach(el => {
      el.classList.remove("active");
      el.removeAttribute("aria-current");
    });
    let el =
      navList.querySelector(`.nav-item[data-page="${logical}"]`) ||
      navList.querySelector(`.nav-item[data-page="${logical+1}"]`);
    if (!el) {
      const candidates = Array.from(navList.querySelectorAll(".nav-item[data-page]"))
        .map(n => ({ n, p: parseInt(n.dataset.page,10) }))
        .filter(x => Number.isFinite(x.p) && x.p <= logical + 1)
        .sort((a,b) => b.p - a.p);
      el = candidates[0]?.n ?? null;
    }
    if (el) {
      el.classList.add("active");
      el.setAttribute("aria-current", "page");
    }
  }

  if (navStrip) {
    navStrip.querySelectorAll(".nav-chip").forEach(c => c.classList.remove("active"));
    const chip =
      navStrip.querySelector(`.nav-chip[data-page="${logical}"]`) ||
      navStrip.querySelector(`.nav-chip[data-page="${logical+1}"]`);
    if (chip) {
      chip.classList.add("active");
      chip.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
    }
  }
}