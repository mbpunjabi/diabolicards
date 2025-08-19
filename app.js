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
const sidebar = document.getElementById("sidebar");
const navToggle = document.getElementById("navToggle");
let flip = null;
let pdfDoc = null;
let pageImages = [];
let spreadEnabled = false;
let rebuilding = false;
let baseW = 0, baseH = 0;
let navReady = false;
function isMobile() {
  return /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || window.innerWidth <= 768;
}
if (isMobile()) document.body.classList.add("is-mobile");
if (navToggle) {
  navToggle.addEventListener("click", () => {
    const open = sidebar.classList.toggle("open");
    navToggle.setAttribute("aria-expanded", open ? "true" : "false");
  }, { passive: true });
}
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
(async function init(){
  await loadPdf(PDF_URL);
  bindControls();
  window.addEventListener("resize", handleResize, { passive: true });
})();
async function loadPdf(src){
  setBusy("Loading PDF…", 3);
  const task = pdfjsLib.getDocument({ url: src });
  pdfDoc = await task.promise;
  pageTotal.textContent = String(pdfDoc.numPages);
  const stage = document.querySelector(".stage");
  const stageH = Math.max(320, (stage?.clientHeight || 0) - 16);
  const targetH = Math.min(1200, Math.max(560, stageH || Math.floor(window.innerHeight * 0.82)));
  const first = await pdfDoc.getPage(1);
  const vp1 = first.getViewport({ scale: 1 });
  const scale = targetH / vp1.height;
  baseW = Math.floor(vp1.width * scale);
  baseH = Math.floor(vp1.height * scale);
  pageImages = [];
  for (let i = 1; i <= pdfDoc.numPages; i++) {
    setBusy(`Rendering page ${i} of ${pdfDoc.numPages}…`, ((i - 1) / pdfDoc.numPages) * 100);
    const page = i === 1 ? first : await pdfDoc.getPage(i);
    const vp = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    canvas.width = Math.floor(vp.width);
    canvas.height = Math.floor(vp.height);
    await page.render({ canvasContext: ctx, viewport: vp, intent: "display" }).promise;
    pageImages.push(canvas.toDataURL("image/jpeg", 0.92));
  }
  buildFlipbook({ mode: "cover", startIndex: 0 });
  await buildOutlineNav();
  navReady = true;
  clearBusyAndRemove();
}
function computePageSize(mode){
  const stage = document.querySelector(".stage");
  const maxW = Math.max(320, (stage?.clientWidth || window.innerWidth) - 16);
  const maxH = Math.max(320, (stage?.clientHeight || Math.floor(window.innerHeight * 0.82)) - 16);
  const pagesAcross = (!isMobile() && mode === "spread") ? 2 : 1;
  const s1 = maxH / baseH;
  const s2 = maxW / (pagesAcross * baseW);
  const s = Math.min(s1, s2, 1.0);
  return { w: Math.max(200, Math.floor(baseW * s)), h: Math.max(200, Math.floor(baseH * s)) };
}
function buildFlipbook({ mode, startIndex = 0 }){
  if (rebuilding) return;
  rebuilding = true;
  if (flip) { try { flip.destroy(); } catch(e){} }
  bookEl.innerHTML = "";
  const sz = computePageSize(mode);
  const opts = {
    minWidth: 320,
    maxWidth: 2400,
    minHeight: 420,
    maxHeight: 3200,
    maxShadowOpacity: 0.22,
    drawShadow: true,
    flippingTime: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 400 : 900,
    showCover: true,
    mobileScrollSupport: true,
    usePortrait: true,
    size: "fixed",
    width: sz.w,
    height: sz.h
  };
  flip = new St.PageFlip(bookEl, opts);
  flip.loadFromImages(pageImages);
  const ix = Math.max(0, Math.min(startIndex, pageImages.length - 1));
  try { flip.turnToPage(ix); } catch(e){}
  flip.on("flip", () => {
    const idx = flip.getCurrentPageIndex();
    updatePager();
    if (navReady) highlightActiveInNav(idx);
    if (!isMobile()) {
      if (idx > 0 && !spreadEnabled) {
        spreadEnabled = true;
        rebuilding = false;
        return buildFlipbook({ mode: "spread", startIndex: idx });
      }
      if (idx === 0 && spreadEnabled) {
        spreadEnabled = false;
        rebuilding = false;
        return buildFlipbook({ mode: "cover", startIndex: 0 });
      }
    }
  });
  flip.on("changeOrientation", () => {
    updatePager();
    if (navReady) highlightActiveInNav(flip.getCurrentPageIndex());
  });
  updatePager();
  if (navReady) highlightActiveInNav(ix);
  requestAnimationFrame(() => { rebuilding = false; });
}
function bindControls(){
  prevBtn.addEventListener("click", goPrev);
  nextBtn.addEventListener("click", goNext);
  document.addEventListener("keydown", (e) => {
    if (!flip) return;
    if (e.key === "ArrowLeft") { e.preventDefault(); goPrev(); }
    if (e.key === "ArrowRight") { e.preventDefault(); goNext(); }
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
  if (!isMobile()) {
    if (targetIdx > 0 && !spreadEnabled) {
      spreadEnabled = true;
      return buildFlipbook({ mode: "spread", startIndex: targetIdx });
    }
    if (targetIdx === 0 && spreadEnabled) {
      spreadEnabled = false;
      return buildFlipbook({ mode: "cover", startIndex: 0 });
    }
  }
  turnTo(targetIdx);
}
function turnTo(idx){
  const clamped = Math.max(0, Math.min(idx, (flip?.getPageCount?.() || 1) - 1));
  try {
    if (typeof flip?.turnToPage === "function") flip.turnToPage(clamped);
    else if (typeof flip?.flip === "function") flip.flip(clamped);
  } catch(e){}
}
function updatePager(){
  if (!flip) return;
  const idx = flip.getCurrentPageIndex();
  const total = flip.getPageCount();
  pageNow.textContent = String(idx + 1);
  pageTotal.textContent = String(total);
  prevBtn.disabled = idx <= 0;
  nextBtn.disabled = idx >= total - 1;
}
function handleResize(){
  if (!flip) return;
  try {
    const idx = flip.getCurrentPageIndex();
    const mode = !isMobile() && spreadEnabled ? "spread" : "cover";
    buildFlipbook({ mode, startIndex: idx });
  } catch(e){}
}
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
  }
}
async function makeNavEntry(item, depth){
  const pageNumber = await resolveOutlineItemToPage(item);
  const wrap = document.createElement("div");
  const btn = document.createElement("button");
  btn.className = "nav-item " + (depth === 0 ? "nav-title" : "nav-sub");
  btn.type = "button";
  btn.textContent = (item.title || "Untitled").trim();
  if (pageNumber) btn.dataset.page = String(pageNumber - 1);
  btn.addEventListener("click", () => {
    const idx = parseInt(btn.dataset.page, 10);
    if (Number.isFinite(idx)) {
      goTo(idx);
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
function highlightActiveInNav(currentIdx){
  if (!navList) return;
  navList.querySelectorAll(".nav-item").forEach(el => {
    el.classList.remove("active");
    el.removeAttribute("aria-current");
  });
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
    el.setAttribute("aria-current", "page");
    const rect = el.getBoundingClientRect();
    const srect = sidebar.getBoundingClientRect();
    if (rect.top < srect.top || rect.bottom > srect.bottom) {
      el.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }
}
