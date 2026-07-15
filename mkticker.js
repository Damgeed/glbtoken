     1|/* ── Ticker: zero DOM reflow, each item wraps independently [1784098545] ── */
     2|(function(){
     3|  var bar = document.getElementById('tickerBar');
     4|  if (!bar) return;
     5|
     6|  var items = Array.from(bar.children);
     7|  if (items.length === 0) return;
     8|
     9|  var speed = 0.2; // px per frame
    10|
    11|  // Measure each item
    12|  var widths = items.map(function(item) { return item.offsetWidth || 80; });
    13|  var scrollOffset = 0;
    14|
    15|  // Pre-calc cumulative positions
    16|  var cum = 0;
    17|  var cumPos = widths.map(function(w) { var c = cum; cum += w; return c; });
    18|  var totalWidth = cum;
    19|
    20|  // Safety: if items are zero-width (not rendered yet), wait for layout
    21|  if (totalWidth === 0) {
    22|    requestAnimationFrame(function initLate() {
    23|      widths = items.map(function(item) { return item.offsetWidth || 80; });
    24|      cum = 0;
    25|      cumPos = widths.map(function(w) { var c = cum; cum += w; return c; });
    26|      totalWidth = cum;
    27|      if (totalWidth > 0) start();
    28|    });
    29|    return;
    30|  }
    31|
    32|  function start() {
    33|    function tick() {
    34|      scrollOffset += speed;
    35|
    36|      for (var i = 0; i < items.length; i++) {
    37|        var pos = cumPos[i] - scrollOffset;
    38|        // When this item fully exits left, wrap it to the right
    39|        if (pos < -widths[i]) {
    40|          pos += totalWidth;
    41|        }
    42|        items[i].style.left = pos + 'px';
    43|      }
    44|
    45|      requestAnimationFrame(tick);
    46|    }
    47|    tick();
    48|  }
    49|
    50|  // Initial positions
    51|  items.forEach(function(item, i) {
    52|    item.style.left = cumPos[i] + 'px';
    53|  });
    54|
    55|  start();
    56|})();
    57|
    58|/* ── Ticker Data Updater ── */
    59|(function(){
    60|  var tickerVals = {};
    61|
    62|  var defaults = {
    63|    balance: '0 GT',
    64|    spent: '$0.00',
    65|    models: '0',
    66|    requests: '0',
    67|    keys: '0',
    68|    days: '0',
    69|    consumed: '0',
    70|    status: 'Offline'
    71|  };
    72|
    73|  function updateTicker(){
    74|    var bar = document.getElementById('tickerBar');
    75|    if (!bar) return;
    76|    Array.from(bar.children).forEach(function(el){
    77|      var key = el.getAttribute('data-ticker');
    78|      if (!key) return;
    79|      var val = tickerVals[key] || defaults[key] || '—';
    80|      var vEl = el.querySelector('.ticker-value');
    81|      if (vEl) vEl.textContent = val;
    82|    });
    83|  }
    84|
    85|  function refreshTickerData(){
    86|    var token = localStorage.getItem('gt_token');
    87|    if (!token) return;
    88|
    89|    if (typeof userData !== 'undefined' && userData){
    90|      tickerVals['balance'] = (userData.token_balance || 0) + ' GT';
    91|      tickerVals['spent'] = '$' + (userData.total_spent || 0).toFixed(2);
    92|      updateTicker();
    93|    }
    94|
    95|    try {
    96|      fetch('https://glbtoken-backend-production.up.railway.app/api/dashboard?days=1', {
    97|        headers: {'Authorization': 'Bearer ' + token}
    98|      }).then(function(r){ return r.json(); }).then(function(d){
    99|        if (d && !d.error){
   100|          tickerVals['balance'] = (d.token_balance || 0) + ' GT';
   101|          tickerVals['spent'] = '$' + (d.total_spent || 0).toFixed(2);
   102|          tickerVals['models'] = d.models_used || 0;
   103|          tickerVals['requests'] = d.total_requests || 0;
   104|          tickerVals['keys'] = d.api_keys_active || 0;
   105|          tickerVals['days'] = d.days_active || 0;
   106|          tickerVals['consumed'] = (d.total_tokens_consumed || 0).toLocaleString();
   107|          tickerVals['status'] = d.newapi_connected ? '● Live' : '○ Standby';
   108|          updateTicker();
   109|        }
   110|      }).catch(function(){});
   111|    } catch(e){}
   112|
   113|    setTimeout(refreshTickerData, 30000);
   114|  }
   115|
   116|  if (document.readyState === 'loading'){
   117|    document.addEventListener('DOMContentLoaded', refreshTickerData);
   118|  } else {
   119|    refreshTickerData();
   120|  }
   121|})();
   122|