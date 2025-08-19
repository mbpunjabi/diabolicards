// Configure PDF.js worker
if (window.pdfjsLib) {
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
}

const prevBtn     = document.getElementById("prev");
const nextBtn     = document.getElementById("next");
const pageNow     = document.getElementById("pageNow");
const pageTotal   = document.getElementById("pageTotal");
const bookEl      = document.getElementById("book");
const progressUI  = document.getElementById("progressWrap");
const progressBar = document.getElementById("progressBar");
const statusText  = document.getElementById("status");

let flip = null; // StPageFlip instance

// Auto-load your fixed PDF (place it at assets/the-guide.pdf)
const PDF_URLS = ["assets/the-guide.pdf", "the-guide.pdf"];
loadFirstAvailable(PDF_URLS);

// Controls
document.addEventListener("keydown", (e) => {
  if (!flip) return;
  if (e.key === "ArrowLeft")  flip.flipPrev();
  if (e.key === "ArrowRight") flip.flipNext();
});
prevBtn.addEventListener("click", () => flip && flip.flipPrev());
nextBtn.addEventListener("click", () => flip && flip.flipNext());
window.addEventListener("resize", () => flip && safe(() => flip.update()));

function safe(fn){ try { fn(); } catch(e){} }

async function loadFirstAvailable(urls){
  for (const u of urls){
    try { await loadPdf(u); return; }
    catch (e) { /* try next */ }
  }
  setBusy("Failed to find the PDF at expected paths.");
  setTimeout(clearBusy, 1800);
}

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

async function loadPdf(src){
  setBusy("Loading PDF…", 3);
  const task = pdfjsLib.getDocument({ url: src });
  const pdf = await task.promise;

  pageTotal.textContent = String(pdf.numPages);

  // First page for aspect ratio
  const first = await pdf.getPage(1);

  // Height-driven scale keeps single-page portrait & centers the cover
  const viewport1 = first.getViewport({ scale: 1 });
  const baseTargetH = Math.min(1200, Math.max(560, Math.floor(window.innerHeight * 0.82)));
  const scale = baseTargetH / viewport1.height;

  // Render each page to an image (sequentially for memory stability)
  const images = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    setBusy(`Rendering page ${i} of ${pdf.numPages}…`, ((i - 1) / pdf.numPages) * 100);
    const page = i === 1 ? first : await pdf.getPage(i);
    const vp   = page.getViewport({ scale });

    const canvas = document.createElement("canvas");
    const ctx    = canvas.getContext("2d");
    canvas.width  = Math.floor(vp.width);
    canvas.height = Math.floor(vp.height);

    await page.render({ canvasContext: ctx, viewport: vp, intent: "display" }).promise;
    images.push(canvas.toDataURL("image/jpeg", 0.92));
  }

  // (Re)create the flipbook in fixed single-page mode
  if (flip) safe(() => flip.destroy());
  bookEl.innerHTML = "";

  const baseH = Math.floor(viewport1.height * scale);
  const baseW = Math.floor(viewport1.width * scale);

  flip = new St.PageFlip(bookEl, {
    width:  baseW,
    height: baseH,
    size: "fixed",          // keeps single-page; cover centered
    minWidth: 320,
    maxWidth: 2200,
    minHeight: 420,
    maxHeight: 3200,
    maxShadowOpacity: 0.22,
    drawShadow: true,
    flippingTime: 900,
    showCover: true,        // first page is a hard, single cover
    mobileScrollSupport: true,
    usePortrait: true
  });

  flip.loadFromImages(images);
  flip.on("flip", updatePager);
  flip.on("changeOrientation", updatePager);

  updatePager();
  clearBusy();
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
