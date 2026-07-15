/* ── Ticker: per-item recycling ── */
(function(){
  var bar = document.querySelector('.ticker-bar');
  if (!bar) return;

  var speed = 0.1; // px per frame (slower on desktop)

  function tick() {
    bar.scrollLeft += speed;

    // As soon as the first item fully exits left, move it to the end
    // It immediately pops up on the right
    var first = bar.children[0];
    if (first && bar.scrollLeft >= first.offsetWidth) {
      bar.scrollLeft -= first.offsetWidth;
      bar.appendChild(first);
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
    var bar = document.querySelector('.ticker-bar');
    if (!bar) return;
    var labelMap = {balance:'Balance',spent:'Spent',models:'Models',requests:'API Calls',keys:'Active Keys',days:'Days Active',consumed:'Tokens Used',status:'New API'};
    Array.from(bar.children).forEach(function(el){
      var key = el.getAttribute('data-ticker');
      if (!key) return;
      var val = tickerVals[key] || defaults[key] || '—';
      el.textContent = (labelMap[key] || key) + ' • ' + val;
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
