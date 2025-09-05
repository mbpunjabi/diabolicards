
/* Diabolicards shared JS */
(function(){
  const nav = document.getElementById('primary-nav');
  const toggle = document.querySelector('.menu-toggle');
  if(toggle && nav){
    toggle.addEventListener('click', () => {
      const open = nav.classList.toggle('open');
      toggle.setAttribute('aria-expanded', String(open));
    });
  }
  // Mark current nav link
  const here = location.pathname.replace(/\/index\.html$/, '/');
  document.querySelectorAll('#primary-nav a').forEach(a => {
    const href = a.getAttribute('href');
    if(here === href){
      a.setAttribute('aria-current', 'page');
    }
  });
  // Year
  const y = document.getElementById('year');
  if(y){ y.textContent = new Date().getFullYear(); }
})();
