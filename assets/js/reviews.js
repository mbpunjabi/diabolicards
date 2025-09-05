
(function(){
  const form = document.getElementById('review-form');
  const list = document.getElementById('reviews-list');
  const key = 'diabolicards-reviews';
  function load(){
    let data = [];
    try{ data = JSON.parse(localStorage.getItem(key) || '[]'); }catch(e){}
    list.innerHTML = '';
    if(!data.length){
      list.innerHTML = '<p class="muted">No reviews yet. Be the first!</p>';
      return;
    }
    data.slice().reverse().forEach(r => {
      const item = document.createElement('div');
      item.className = 'card';
      item.innerHTML = `<strong>${r.name}</strong> — <span aria-label="${r.rating} out of 5 stars">${'★'.repeat(r.rating)}${'☆'.repeat(5-r.rating)}</span>
      <p>${r.text}</p>`;
      list.appendChild(item);
    });
  }
  function save(entry){
    let data = [];
    try{ data = JSON.parse(localStorage.getItem(key) || '[]'); }catch(e){}
    data.push(entry);
    localStorage.setItem(key, JSON.stringify(data));
  }
  if(form){
    form.addEventListener('submit', e => {
      e.preventDefault();
      const fd = new FormData(form);
      const name = (fd.get('name') || 'Anonymous').toString().slice(0,64);
      const rating = parseInt(fd.get('rating') || '5', 10);
      const text = (fd.get('text') || '').toString().slice(0,1000);
      if(!text.trim()){ alert('Please add a short review.'); return; }
      save({ name, rating, text, at: Date.now() });
      form.reset();
      load();
      form.querySelector('output').textContent = 'Thanks—your review was saved on this device.';
    });
  }
  document.addEventListener('DOMContentLoaded', load);
})();
