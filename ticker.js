/* ── Ticker: seamless loop, items re-enter from right ── */
(function(){
  var bar = document.getElementById('tickerBar');
  if (!bar) return;

  // Compute half-width before cloning (items already rendered in DOM)
  var items = Array.from(bar.children);
  var halfWidth = 0;
  var hasWidth = items.length > 0 && items[0].offsetWidth > 0;
  if (hasWidth) {
    items.forEach(function(item) { halfWidth += item.offsetWidth; });
  }

  // Duplicate for seamless play — the cloned set acts as a buffer
  items.forEach(function(item) {
    bar.appendChild(item.cloneNode(true));
  });

  // If widths weren't ready, compute after layout
  if (!hasWidth) {
    requestAnimationFrame(function(){
      var all = Array.from(bar.children);
      var half = Math.floor(all.length / 2);
      halfWidth = 0;
      for (var i = 0; i < half; i++) halfWidth += all[i].offsetWidth;
    });
  }

  var speed = 0.4; // px per frame

  function tick() {
    bar.scrollLeft += speed;

    // When the first set has fully scrolled past, snap back to start
    // The cloned second set is identical — no visible jump
    if (halfWidth > 0 && bar.scrollLeft >= halfWidth) {
      bar.scrollLeft -= halfWidth;
    }

    requestAnimationFrame(tick);
  }

  tick();
})();

/* ── Ticker Data Updater ── */
(function(){
  var tickerVals = {};

  var defaults = {
    balance: '0 GT',
    spent: '$0.00',
    models: '0',
    requests: '0',
    keys: '0',
    days: '0',
    consumed: '0',
    status: 'Offline'
  };

  function updateTicker(){
    var bar = document.getElementById('tickerBar');
    if (!bar) return;
    Array.from(bar.children).forEach(function(el){
      var key = el.getAttribute('data-ticker');
      if (!key) return;
      var val = tickerVals[key] || defaults[key] || '—';
      var vEl = el.querySelector('.ticker-value');
      if (vEl) vEl.textContent = val;
    });
  }

  function refreshTickerData(){
    var token = localStorage.getItem('gt_token');
    if (!token) return;

    if (typeof userData !== 'undefined' && userData){
      tickerVals['balance'] = (userData.token_balance || 0) + ' GT';
      tickerVals['spent'] = '$' + (userData.total_spent || 0).toFixed(2);
      updateTicker();
    }

    try {
      fetch('https://glbtoken-backend-production.up.railway.app/api/dashboard?days=1', {
        headers: {'Authorization': 'Bearer ' + token}
      }).then(function(r){ return r.json(); }).then(function(d){
        if (d && !d.error){
          tickerVals['balance'] = (d.token_balance || 0) + ' GT';
          tickerVals['spent'] = '$' + (d.total_spent || 0).toFixed(2);
          tickerVals['models'] = d.models_used || 0;
          tickerVals['requests'] = d.total_requests || 0;
          tickerVals['keys'] = d.api_keys_active || 0;
          tickerVals['days'] = d.days_active || 0;
          tickerVals['consumed'] = (d.total_tokens_consumed || 0).toLocaleString();
          tickerVals['status'] = d.newapi_connected ? '● Live' : '○ Standby';
          updateTicker();
        }
      }).catch(function(){});
    } catch(e){}

    setTimeout(refreshTickerData, 30000);
  }

  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', refreshTickerData);
  } else {
    refreshTickerData();
  }
})();
