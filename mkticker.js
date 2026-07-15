/* ── Ticker: flat text, no wrappers, scrollLeft recycling ── */
(function(){
  var bar = document.getElementById('tickerBar');
  if (!bar) return;

  var speed = 0.1; // px per frame (~6px/s)

  function tick() {
    bar.scrollLeft += speed;

    // Halfway = start of duplicate text — reset to 0 for seamless loop
    var half = bar.scrollWidth / 2;
    if (bar.scrollLeft >= half) {
      bar.scrollLeft = 0;
    }

    requestAnimationFrame(tick);
  }

  tick();
})();

/* ── Ticker Data Updater ── */
(function(){
  var items = {
    balance:  {label: 'Balance',  val: '0 GT'},
    spent:    {label: 'Spent',    val: '$0.00'},
    models:   {label: 'Models',   val: '0'},
    requests: {label: 'API Calls', val: '0'},
    keys:     {label: 'Active Keys', val: '0'},
    days:     {label: 'Days Active', val: '0'},
    consumed: {label: 'Tokens Used', val: '0'},
    status:   {label: 'New API',  val: '● Standby'},
  };

  function buildText(){
    var parts = [];
    for (var k in items) {
      parts.push(items[k].label + ' • ' + items[k].val);
    }
    return parts.join('    ') + '    ' + parts.join('    ');
  }

  function updateTicker(){
    var bar = document.getElementById('tickerBar');
    if (!bar) return;
    bar.textContent = buildText();
  }

  function refreshTickerData(){
    var token = localStorage.getItem('gt_token');
    if (!token) return;

    if (typeof userData !== 'undefined' && userData){
      items.balance.val = (userData.token_balance || 0) + ' GT';
      items.spent.val = '$' + (userData.total_spent || 0).toFixed(2);
      updateTicker();
    }

    try {
      fetch('https://glbtoken-backend-production.up.railway.app/api/dashboard?days=1', {
        headers: {'Authorization': 'Bearer ' + token}
      }).then(function(r){ return r.json(); }).then(function(d){
        if (d && !d.error){
          items.balance.val = (d.token_balance || 0) + ' GT';
          items.spent.val = '$' + (d.total_spent || 0).toFixed(2);
          items.models.val = String(d.models_used || 0);
          items.requests.val = String(d.total_requests || 0);
          items.keys.val = String(d.api_keys_active || 0);
          items.days.val = String(d.days_active || 0);
          items.consumed.val = (d.total_tokens_consumed || 0).toLocaleString();
          items.status.val = d.newapi_connected ? '● Live' : '○ Standby';
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
