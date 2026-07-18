/* ── GlbTOKEN — Shared Dashboard JS ── */
/* Token recovery, auth check, sidebar toggle, chat drag */

(function() {
  // ====== ATOMIC TOKEN RECOVERY ======
  var params = new URLSearchParams(window.location.search);
  var urlToken = params.get('token');
  var urlUser = params.get('user');

  if (urlToken) {
    localStorage.setItem('gt_token', urlToken);
    if (urlUser) {
      try { localStorage.setItem('gt_user', decodeURIComponent(urlUser)); } catch(e) {}
    }
    var clean = window.location.protocol + '//' + window.location.host + window.location.pathname;
    window.history.replaceState({}, document.title, clean);
  }

  // Auth check
  var token = localStorage.getItem('gt_token');
  if (!token) {
    window.location.replace('login.html');
    return;
  }
})();

function toggleDashSidebar() {
  var sb = document.getElementById('dashSidebar');
  var toggle = document.getElementById('dashSidebarToggle');
  var isOpen = sb.classList.toggle('open');
  if(toggle) toggle.classList.toggle('hidden', isOpen);
}

// Chat window drag — no-op on pages without #chatWindow
(function(){
  var cw = document.getElementById('chatWindow');
  if(!cw) return;
  var h = cw.querySelector('.chat-header');
  if(!h) return;
  var offX, offY, dragging = false;
  function startDrag(e){
    if(e.target.tagName === 'BUTTON') return;
    dragging = true; cw.classList.add('dragging');
    var r = cw.getBoundingClientRect();
    var cx = e.clientX || (e.touches && e.touches[0].clientX);
    var cy = e.clientY || (e.touches && e.touches[0].clientY);
    offX = cx - r.left; offY = cy - r.top;
    e.preventDefault();
  }
  function moveDrag(e){
    if(!dragging) return;
    var cx = e.clientX || (e.touches && e.touches[0].clientX);
    var cy = e.clientY || (e.touches && e.touches[0].clientY);
    cw.style.left = (cx - offX) + 'px';
    cw.style.top = (cy - offY) + 'px';
    cw.style.right = 'auto'; cw.style.bottom = 'auto';
  }
  function endDrag(){if(dragging){dragging=false;cw.classList.remove('dragging')}}
  h.addEventListener('mousedown', startDrag);
  h.addEventListener('touchstart', startDrag, {passive:false});
  document.addEventListener('mousemove', moveDrag);
  document.addEventListener('touchmove', moveDrag, {passive:false});
  document.addEventListener('mouseup', endDrag);
  document.addEventListener('touchend', endDrag);
})();

// Scroll-hint: hide gold arrow when user scrolls
document.addEventListener('DOMContentLoaded', function() {
  document.querySelectorAll('.dash-card div[style*="overflow-x:auto"], .dash-card .scroll-x').forEach(function(el) {
    el.addEventListener('scroll', function() {
      var card = this.closest('.dash-card');
      if(card) card.classList.add('is-scrolled');
    }, {passive:true});
  });
});
