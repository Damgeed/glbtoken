/* ── Ticker Data Updater + Smooth Infinite Scroll ── */
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

  // ─── Update DOM values ───
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

  // ─── Smooth Infinite Scroll (no snap) ───
  var ticker = (function(){
    var track, bar, pos = 0, speed = 0, running = false, rafId = null, halfW = 0;

    function measure(){
      if(!track || !bar) return;
      // Width of ONE full set of items (half the track since content is duplicated)
      halfW = track.scrollWidth / 2;
      if(halfW <= 0) halfW = 1000; // fallback
      // Speed: ~35px/s on desktop, ~25px/s on tablet, ~18px/s on phone
      var w = window.innerWidth;
      speed = w > 768 ? 0.58 : (w > 480 ? 0.42 : 0.3);
    }

    function frame(){
      if(!running) return;
      pos += speed;
      if(pos >= halfW) pos = 0;
      track.style.transform = 'translateX(' + (-pos) + 'px)';
      track.style.willChange = 'transform';
      rafId = requestAnimationFrame(frame);
    }

    function start(){
      if(running) return;
      track = document.getElementById('tickerTrack');
      bar = document.querySelector('.ticker-bar');
      if(!track || !bar) return;
      // Init: reset transform for clean start
      track.style.transform = 'translateX(0)';
      track.style.transition = 'none';
      running = true;
      measure();
      frame();
    }

    function stop(){
      running = false;
      if(rafId) { cancelAnimationFrame(rafId); rafId = null; }
    }

    function handleResize(){
      measure();
    }

    // Public
    return {
      start: start,
      stop: stop,
      resize: handleResize
    };
  })();

  // ─── Data Refresh ───
  function refreshTickerData(){
    var token = localStorage.getItem('gt_token');

    // Update from userData if available (inline data from page)
    if(typeof userData !== 'undefined' && userData && userData.token_balance !== undefined){
      tickerVals['balance'] = (userData.token_balance || 0) + ' GT';
      tickerVals['spent'] = '$' + (userData.total_spent || 0).toFixed(2);
      updateTicker();
    }

    // Fetch from API
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
    // Pause/resume on hover
    var bar = document.querySelector('.ticker-bar');
    if(bar){
      bar.addEventListener('mouseenter', ticker.stop);
      bar.addEventListener('mouseleave', ticker.start);
      // Touch pause for mobile
      bar.addEventListener('touchstart', ticker.stop);
      bar.addEventListener('touchend', function(){ setTimeout(ticker.start, 500); });
    }
    // Re-measure after fonts/images load
    setTimeout(ticker.resize, 1000);
    setTimeout(ticker.resize, 3000);
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
