/* app.js — desktop: spreads with single cover; mobile: single; no rebuild on flip */

const PDF_URL = "assets/the-guide-bookmarks.pdf";
if (window.pdfjsLib) {
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
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
let pdfPageCount = 0;
let baseW = 0, baseH = 0;
let resizeToken = 0;
let lastWidth = window.innerWidth;

const isMobile = () =>
  /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
  window.innerWidth <= 768;
if (isMobile()) document.body.classList.add("is-mobile");

const supportsWebP = (() => {
  try { return document.createElement("canvas").toDataURL("image/webp").startsWith("data:image/webp"); }
  catch { return false; }
})();
const IMG_MIME = supportsWebP ? "image/webp" : "image/jpeg";
const QUALITY_PREVIEW = 0.62;
const QUALITY_FINAL = 0.92;
const CONCURRENCY = isMobile() ? 2 : 4;

let pageSrc = [];
const haveLow = new Set();
const haveHigh = new Set();

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
function safeRect(el){
  const r = el?.getBoundingClientRect?.() || { width: 0, height: 0 };
  return { w: Math.max(1, Math.floor(r.width)), h: Math.max(1, Math.floor(r.height)) };
}
function bust(u){ return u.includes("?") ? `${u}&t=${Date.now()}` : `${u}?t=${Date.now()}`; }

(async function init(){
  updateToolbarVar();
  await loadPdfWithRetry(PDF_URL, 3, 300);
  bindControls();

  window.addEventListener("resize", () => {
    const w = window.innerWidth;
    if (Math.abs(w - lastWidth) < 2) return;
    lastWidth = w;
    const id = ++resizeToken;
    setTimeout(() => { if (id === resizeToken) handleResizeWidthChange(); }, 120);
  }, { passive: true });

  window.addEventListener("orientationchange", () => setTimeout(handleResizeWidthChange, 250), { passive: true });
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
  const task = pdfjsLib.getDocument({ url: src, disableRange: false, disableStream: false, disableAutoFetch: false });
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
  const scalePreview = displayScale * (isMobile() ? 1.15 : 1.0);
  const scaleFinal = displayScale * qualityBoost;

  baseW = Math.floor(vp1.width * displayScale);
  baseH = Math.floor(vp1.height * displayScale);

  pageSrc = new Array(pdfPageCount).fill("");

  setBusy("Rendering previews…", 5);
  await renderAllPreviews(scalePreview, (done) => {
    setBusy("Rendering previews…", 5 + (done / pdfPageCount) * 45);
  });

  try {
    const hi1 = await renderPageURL(1, scaleFinal, true);
    pageSrc[0] = hi1; haveHigh.add(1);
  } catch {}

  buildFlipbook(0);
  await buildOutlineNav();
  clearBusyAndRemove();
  updateMobileNavHeight();

  hydrateAround(0, scaleFinal);

  (async () => {
    for (let i = 2; i <= pdfPageCount; i++) {
      if (haveHigh.has(i)) continue;
      try {
        const hi = await renderPageURL(i, scaleFinal, true);
        haveHigh.add(i);
        swapPage(i - 1, hi);
      } catch {}
    }
  })();

  async function renderAllPreviews(scale, onEach){
    let next = 1, done = 0;
    const workers = Array.from({length: CONCURRENCY}, () => (async function worker(){
      while (true) {
        const idx = next++;
        if (idx > pdfPageCount) break;
        try {
          const url = await renderPageURL(idx, scale, false);
          pageSrc[idx - 1] = url;
          haveLow.add(idx);
          done++; onEach && onEach(done);
        } catch { done++; onEach && onEach(done); }
      }
    })());
    await Promise.all(workers);
  }
}

async function renderPageURL(pageNum, scale, high){
  const page = await pdfDoc.getPage(pageNum);
  const vp = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  canvas.width = Math.floor(vp.width);
  canvas.height = Math.floor(vp.height);
  await page.render({ canvasContext: ctx, viewport: vp, intent: "display" }).promise;
  return canvas.toDataURL(IMG_MIME, high ? QUALITY_FINAL : QUALITY_PREVIEW);
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

function currentMode(){
  const mobile = isMobile();
  return {
    isSingle: mobile,
    pagesAcross: mobile ? 1 : 2,
    usePortrait: mobile,
    showCover: !mobile   // desktop: true -> single cover then spreads
  };
}

function buildFlipbook(startIndex){
  requestAnimationFrame(() => {
    const mode = currentMode();
    const sz = computePageSize(mode.pagesAcross);
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
      usePortrait: mode.usePortrait,
      showCover: mode.showCover,
      mobileScrollSupport: true,
      size: "fixed",
      width: sz.w,
      height: sz.h
    };

    flip = new St.PageFlip(bookEl, opts);

    flip.on("init", () => {
      const ix = Math.max(0, Math.min(startIndex, pageSrc.length - 1));
      try { flip.turnToPage(ix); } catch(e){}
      updatePager();
      highlightActiveInNav(ix);
    });

    flip.loadFromImages(pageSrc);

    requestAnimationFrame(tagImagesThrottled);

    flip.on("flip", () => {
      updatePager();
      const idx = flip.getCurrentPageIndex();
      highlightActiveInNav(idx);

      const dpr = Math.min(window.devicePixelRatio || 1, 3);
      const boost = isMobile() ? Math.min(Math.max(1.75, dpr * 1.25), 2.5) : Math.min(Math.max(1.25, dpr), 1.75);
      const stage = document.querySelector(".stage");
      const r = safeRect(stage);
      const targetH = Math.max(360, r.h - 16);
      const displayScale = baseH ? (targetH / baseH) : 1;
      const scaleFinal = displayScale * boost;
      hydrateAround(idx, scaleFinal);
    });
  });
}

function swapPage(pageIndex0, url){
  pageSrc[pageIndex0] = url;
  const img = bookEl.querySelector(`img[data-page-index="${pageIndex0}"]`);
  if (img && img.src !== url) img.src = url;
}

function hydrateAround(centerIdx0, scaleFinal){
  const targets = new Set([centerIdx0-2, centerIdx0-1, centerIdx0, centerIdx0+1, centerIdx0+2]);
  targets.forEach(async (i0) => {
    if (i0 < 0 || i0 >= pdfPageCount) return;
    const pdfPage = i0 + 1;
    if (haveHigh.has(pdfPage)) return;
    try {
      const hi = await renderPageURL(pdfPage, scaleFinal, true);
      haveHigh.add(pdfPage);
      swapPage(i0, hi);
    } catch {}
  });
}

function bindControls(){
  prevBtn.addEventListener("click", () => { if (flip) flip.flipPrev(); });
  nextBtn.addEventListener("click", () => { if (flip) flip.flipNext(); });
  document.addEventListener("keydown", (e) => {
    if (!flip) return;
    if (e.key === "ArrowLeft") { e.preventDefault(); flip.flipPrev(); }
    if (e.key === "ArrowRight") { e.preventDefault(); flip.flipNext(); }
  });
}

function updatePager(){
  if (!flip) return;
  const idx0 = flip.getCurrentPageIndex();
  pageNow.textContent = String(idx0 + 1);
  pageTotal.textContent = String(pdfPageCount);
  prevBtn.disabled = idx0 <= 0;
  nextBtn.disabled = idx0 >= (flip.getPageCount() - 1);
}

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
        const pdfPage = parseInt(chip.dataset.page, 10);
        if (Number.isFinite(pdfPage)) {
          try { flip.turnToPage(pdfPage - 1); } catch(e){}
          highlightActiveInNav(pdfPage - 1);
        }
      });
      navStrip.appendChild(chip);
    }
  } catch {
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
    const pdfPage = parseInt(btn.dataset.page, 10);
    if (Number.isFinite(pdfPage)) {
      try { flip.turnToPage(pdfPage - 1); } catch(e){}
      highlightActiveInNav(pdfPage - 1);
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
      return pageIndex + 1;
    }
    if (typeof item.url === "string") {
      const m = item.url.match(/[#?]page=(\d+)/i);
      if (m) return parseInt(m[1], 10);
    }
  } catch {}
  return null;
}

function highlightActiveInNav(currentIdx0){
  const pdfPage = currentIdx0 + 1;

  if (navList) {
    navList.querySelectorAll(".nav-item").forEach(el => {
      el.classList.remove("active");
      el.removeAttribute("aria-current");
    });
    let el =
      navList.querySelector(`.nav-item[data-page="${pdfPage}"]`) ||
      navList.querySelector(`.nav-item[data-page="${pdfPage+1}"]`);
    if (!el) {
      const candidates = Array.from(navList.querySelectorAll(".nav-item[data-page]"))
        .map(n => ({ n, p: parseInt(n.dataset.page,10) }))
        .filter(x => Number.isFinite(x.p) && x.p <= pdfPage + 1)
        .sort((a,b) => b.p - a.p);
      el = candidates[0]?.n ?? null;
    }
    if (el) {
      el.classList.add("active");
      el.setAttribute("aria-current", "page");
      const rect = el.getBoundingClientRect();
      const srect = sidebar.getBoundingClientRect();
      if (rect.top < srect.top || rect.bottom > srect.bottom) {
        el.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }
    }
  }

  if (navStrip) {
    navStrip.querySelectorAll(".nav-chip").forEach(c => c.classList.remove("active"));
    const chip =
      navStrip.querySelector(`.nav-chip[data-page="${pdfPage}"]`) ||
      navStrip.querySelector(`.nav-chip[data-page="${pdfPage+1}"]`);
    if (chip) {
      chip.classList.add("active");
      chip.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
    }
  }
}

function handleResizeWidthChange(){
  updateToolbarVar();
  const id = ++resizeToken;
  setTimeout(() => {
    if (id === resizeToken && flip) {
      buildFlipbook(flip.getCurrentPageIndex());
      updateMobileNavHeight();
    }
  }, 120);
}

/* --- image tagging --- */
let tagTimer = null;
function tagImages(){
  const imgs = bookEl.querySelectorAll(".stf__item img, .stf__page img, img");
  imgs.forEach((img, i) => {
    if (!img.dataset.pageIndex) img.dataset.pageIndex = String(i);
    img.decoding = "async";
    img.loading = "eager";
  });
}
function tagImagesThrottled(){
  if (tagTimer) return;
  tagTimer = requestAnimationFrame(() => {
    tagTimer = null;
    tagImages();
  });
}
const mo = new MutationObserver(tagImagesThrottled);
mo.observe(bookEl, { childList: true, subtree: true });
