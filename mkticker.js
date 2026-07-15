/* ── Ticker: zero DOM reflow, each item wraps independently ── */
(function(){
  var bar = document.getElementById('tickerBar');
  if (!bar) return;

  var items = Array.from(bar.children);
  if (items.length === 0) return;

  var speed = 0.2; // px per frame

  // Measure each item
  var widths = items.map(function(item) { return item.offsetWidth || 80; });
  var scrollOffset = 0;

  // Pre-calc cumulative positions
  var cum = 0;
  var cumPos = widths.map(function(w) { var c = cum; cum += w; return c; });
  var totalWidth = cum;

  // Safety: if items are zero-width (not rendered yet), wait for layout
  if (totalWidth === 0) {
    requestAnimationFrame(function initLate() {
      widths = items.map(function(item) { return item.offsetWidth || 80; });
      cum = 0;
      cumPos = widths.map(function(w) { var c = cum; cum += w; return c; });
      totalWidth = cum;
      if (totalWidth > 0) start();
    });
    return;
  }

  function start() {
    function tick() {
      scrollOffset += speed;

      for (var i = 0; i < items.length; i++) {
        var pos = cumPos[i] - scrollOffset;
        // When this item fully exits left, wrap it to the right
        if (pos < -widths[i]) {
          pos += totalWidth;
        }
        items[i].style.left = pos + 'px';
      }

      requestAnimationFrame(tick);
    }
    tick();
  }

  // Initial positions
  items.forEach(function(item, i) {
    item.style.left = cumPos[i] + 'px';
  });

  start();
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
