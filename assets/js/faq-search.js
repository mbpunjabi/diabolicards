
(function(){
  const input = document.getElementById('faq-search');
  const list = document.getElementById('faq-list');
  const count = document.getElementById('faq-count');
  if(!input || !list) return;
  const items = Array.from(list.querySelectorAll('details'));
  function update(){
    const q = input.value.trim().toLowerCase();
    let visible = 0;
    items.forEach(d => {
      const text = d.textContent.toLowerCase();
      const hit = !q || text.indexOf(q) !== -1;
      d.style.display = hit ? "" : "none";
      if(hit) visible++;
      // collapse non-matching
      if(!hit && d.open){ d.open = false; }
    });
    if(count){ count.textContent = visible + " shown"; }
  }
  input.addEventListener('input', update);
  update();
})();
