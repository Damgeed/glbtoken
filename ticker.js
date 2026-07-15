/* ── Ticker: scrollLeft on bar, no wrapper ── */
(function(){
  'use strict';

  var vals = {};
  var defs = {
    balance: '0 GT', spent: '$0.00', models: '0',
    requests: '0', keys: '0', days: '0',
    consumed: '0', status: '○ Standby'
  };

  function update(){
    document.querySelectorAll('.ticker-item').forEach(function(el){
      var k = el.getAttribute('data-ticker');
      if(!k) return;
      var v = vals[k] || defs[k] || '—';
      var ve = el.querySelector('.ticker-value');
      if(!ve) return;
      if(k === 'status') {
        var live = v.indexOf('Live') > -1;
        ve.innerHTML = live
          ? '<span class="ticker-status-dot live"></span>● Live'
          : '<span class="ticker-status-dot standby"></span>○ Standby';
        return;
      }
      ve.textContent = v;
    });
  }

  // ─── scrollLeft-based loop (no wrapper div) ───
  var tick = (function(){
    var bar, speed = 0.6, running = false, raf = null;

    function setSpeed(){
      var w = window.innerWidth;
      speed = w > 768 ? 0.6 : (w > 480 ? 0.45 : 0.3);
    }

    function frame(){
      if(!running) return;
      bar.scrollLeft += speed;

      var first = bar.firstElementChild;
      if(first && bar.scrollLeft >= first.offsetWidth){
        bar.appendChild(first);
        bar.scrollLeft -= first.offsetWidth;
      }

      raf = requestAnimationFrame(frame);
    }

    function start(){
      if(running) return;
      bar = document.getElementById('tickerBar');
      if(!bar) return;
      bar.scrollLeft = 0;
      running = true;
      setSpeed();
      raf = requestAnimationFrame(frame);
    }

    function stop(){ running = false; if(raf) cancelAnimationFrame(raf); }
    function resize(){ setSpeed(); }

    return { start: start, stop: stop, resize: resize };
  })();

  // ─── Data ───
  function refresh(){
    var token = localStorage.getItem('gt_token');
    if(typeof userData !== 'undefined' && userData && userData.token_balance !== undefined){
      vals['balance'] = (userData.token_balance || 0) + ' GT';
      vals['spent'] = '$' + (userData.total_spent || 0).toFixed(2);
      update();
    }
    if(token){
      try {
        fetch('https://glbtoken-backend-production.up.railway.app/api/dashboard?days=1', {
          headers: {'Authorization': 'Bearer ' + token}
        }).then(function(r){ return r.json(); }).then(function(d){
          if(d && !d.error){
            vals['balance'] = (d.token_balance || 0) + ' GT';
            vals['spent'] = '$' + (d.total_spent || 0).toFixed(2);
            vals['models'] = d.models_used || 0;
            vals['requests'] = d.total_requests || 0;
            vals['keys'] = d.api_keys_active || 0;
            vals['days'] = d.days_active || 0;
            vals['consumed'] = (d.total_tokens_consumed || 0).toLocaleString();
            vals['status'] = d.newapi_connected ? 'Live' : 'Standby';
            update();
          }
        }).catch(function(){});
      } catch(e){}
    }
    setTimeout(refresh, 30000);
  }

  function init(){
    tick.start();
    refresh();
    window.addEventListener('resize', tick.resize);
    setTimeout(function(){ tick.resize(); }, 2000);
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
