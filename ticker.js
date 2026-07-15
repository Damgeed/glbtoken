/* ── Ticker: Continuous Loop (Item Recycling) ── */
(function(){
  'use strict';

  var tickerVals = {};
  var defaults = {
    balance: '0 GT',
    spent: '$0.00',
    models: '0',
    requests: '0',
    keys: '0',
    days: '0',
    consumed: '0',
    status: '○ Standby'
  };

  function updateTicker(){
    document.querySelectorAll('.ticker-item').forEach(function(el){
      var key = el.getAttribute('data-ticker');
      if(!key) return;
      var val = tickerVals[key] || defaults[key] || '—';
      var vEl = el.querySelector('.ticker-value');
      if(!vEl) return;
      if(key === 'status') {
        var isLive = val.indexOf('Live') > -1;
        vEl.innerHTML = isLive
          ? '<span class="ticker-status-dot live"></span>● Live'
          : '<span class="ticker-status-dot standby"></span>○ Standby';
        return;
      }
      vEl.textContent = val;
    });
  }

  // ─── Continuous Loop (no snap, no duplicate) ───
  var ticker = (function(){
    var track, bar, pos = 0, speed = 0, running = false, rafId = null;

    function setSpeed(){
      var w = window.innerWidth;
      speed = w > 768 ? 0.6 : (w > 480 ? 0.45 : 0.3);
    }

    function frame(){
      if(!running) return;
      pos += speed;

      // Recycle: when first item scrolls off the left edge,
      // move it to the end so content is always visible
      var first = track.firstElementChild;
      if(first && pos >= first.offsetWidth){
        track.appendChild(first);
        pos -= first.offsetWidth;
      }

      track.style.transform = 'translateX(' + (-pos) + 'px)';
      rafId = requestAnimationFrame(frame);
    }

    function start(){
      if(running) return;
      track = document.getElementById('tickerTrack');
      bar = document.querySelector('.ticker-bar');
      if(!track || !bar) return;
      running = true;
      setSpeed();
      frame();
    }

    function stop(){
      running = false;
      if(rafId) { cancelAnimationFrame(rafId); rafId = null; }
    }

    function resize(){
      setSpeed();
    }

    return { start: start, stop: stop, resize: resize };
  })();

  // ─── Data Refresh ───
  function refreshTickerData(){
    var token = localStorage.getItem('gt_token');

    if(typeof userData !== 'undefined' && userData && userData.token_balance !== undefined){
      tickerVals['balance'] = (userData.token_balance || 0) + ' GT';
      tickerVals['spent'] = '$' + (userData.total_spent || 0).toFixed(2);
      updateTicker();
    }

    if(token){
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
    }

    setTimeout(refreshTickerData, 30000);
  }

  // ─── Init ───
  function init(){
    ticker.start();
    refreshTickerData();
    window.addEventListener('resize', ticker.resize);
    var bar = document.querySelector('.ticker-bar');
    if(bar){
      bar.addEventListener('mouseenter', ticker.stop);
      bar.addEventListener('mouseleave', ticker.start);
      bar.addEventListener('touchstart', ticker.stop);
      bar.addEventListener('touchend', function(){ setTimeout(ticker.start, 500); });
    }
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
