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
    status: '● Standby'
  };

  function updateTicker(){
    document.querySelectorAll('.ticker-item').forEach(function(el){
      var key = el.getAttribute('data-ticker');
      if(!key) return;
      var val = tickerVals[key] || defaults[key] || '—';
      var vEl = el.querySelector('.ticker-value');
      if(!vEl) return;
      
      // Special handling for status — use pulsing dot
      if(key === 'status') {
        var isLive = val.indexOf('Live') > -1 || val.indexOf('● Live') > -1;
        if(isLive) {
          vEl.innerHTML = '<span class="ticker-status-dot live"></span>● Live';
        } else {
          vEl.innerHTML = '<span class="ticker-status-dot standby"></span>○ Standby';
        }
        return;
      }
      
      vEl.textContent = val;
    });
  }

  function refreshTickerData(){
    var token = localStorage.getItem('gt_token');
    if(!token){
      setTimeout(refreshTickerData, 30000);
      return;
    }

    // Update from userData if available
    if(typeof userData !== 'undefined' && userData){
      tickerVals['balance'] = (userData.token_balance || 0) + ' GT';
      tickerVals['spent'] = '$' + (userData.total_spent || 0).toFixed(2);
      updateTicker();
    }

    // Fetch dashboard data for richer info
    try {
      fetch('https://glbtoken-backend-production.up.railway.app/api/dashboard?days=1', {
        headers: {'Authorization': 'Bearer ' + token}
      }).then(function(r){ return r.json(); }).then(function(d){
        if(d && !d.error){
          tickerVals['balance'] = (d.token_balance || 0) + ' GT';
          tickerVals['spent'] = '$' + (d.total_spent || 0).toFixed(2);
          tickerVals['models'] = d.models_used || 0;
          tickerVals['requests'] = d.total_requests || 0;
          tickerVals['keys'] = d.api_keys_active || 0;
          tickerVals['days'] = d.days_active || 0;
          tickerVals['consumed'] = (d.total_tokens_consumed || 0).toLocaleString();
          tickerVals['status'] = d.newapi_connected ? 'Live' : 'Standby';
          updateTicker();
        }
      }).catch(function(){});
    } catch(e){}

    setTimeout(refreshTickerData, 30000);
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', refreshTickerData);
  } else {
    refreshTickerData();
  }
})();
