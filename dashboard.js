/* ── Shared Dashboard JS ── */
(function() {
  // ====== ATOMIC TOKEN RECOVERY ======
  // Path A: Read token from URL query params (Railway redirect)
  var params = new URLSearchParams(window.location.search);
  var urlToken = params.get('token');
  var urlUser = params.get('user');

  if (urlToken) {
    localStorage.setItem('gt_token', urlToken);
    if (urlUser) {
      try { localStorage.setItem('gt_user', decodeURIComponent(urlUser)); } catch(e) {}
    }
    // Clean URL immediately — remove token from address bar
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

/* ── Utility Helpers ── */
if(typeof escapeHtml !== 'function') {
  function escapeHtml(text){
    if(typeof text !== 'string') return text||'';
    var d=document.createElement('div');
    d.appendChild(document.createTextNode(text));
    return d.innerHTML;
  }
}

if(typeof showToast !== 'function') {
  function showToast(msg,type){if(typeof window.showToast==='function'){window.showToast(msg,type)}}
}

if(typeof api !== 'function') {
  function api(method,url,body,timeout){
    return fetch(url,{method:method||'GET',headers:{'Authorization':'Bearer '+(localStorage.getItem('gt_token')||''),'Content-Type':'application/json'},body:body?JSON.stringify(body):null,signal:timeout?AbortSignal.timeout(timeout):void 0}).then(function(r){if(!r.ok)throw new Error('API error '+r.status);return r.json()}).catch(function(e){console.error('API call failed:',e);throw e});
  }
}
