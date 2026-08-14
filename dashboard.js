/* ══════════════════════════════════════════
   DASHBOARD — Transactions, notifications, billing
   ══════════════════════════════════════════ */
    // ── Single-flight request dedupe ──
    // Multiple loaders (stats, api-calls chart, donut) need the same endpoints
    // on boot. Instead of firing /api/dashboard and /api/analytics/cost-by-model
    // 2-3× in parallel, share one in-flight promise per key.
    var _flightCache = {};
    function flight(key, fn){
      if(!_flightCache[key]){
        _flightCache[key] = Promise.resolve().then(fn).finally(function(){ delete _flightCache[key]; });
      }
      return _flightCache[key];
    }
    // ── Billing ──
    // (Payment method + invoice management live in billing.html — no dashboard stubs)

    // ── Advanced Analytics Dashboard Functions ──



/* ══════════════════════════════════════════
   DASHBOARD REAL-DATA WIRING (2026-08)
   Stat cards, API Calls per Model, Spending by Provider,
   Activity feed, Recent Transactions — real endpoints, 30s live refresh.
   Design preserved: generated DOM reuses existing CSS classes.
   ══════════════════════════════════════════ */

function fmtCompact(n){
  n = Number(n)||0;
  if(n >= 1000000) return (n/1000000).toFixed(1).replace(/\.0$/,'') + 'M';
  if(n >= 1000) return (n/1000).toFixed(1).replace(/\.0$/,'') + 'k';
  return String(n);
}
function timeAgo(iso){
  if(!iso) return '';
  var t = (typeof window.parseUTCDate === 'function') ? window.parseUTCDate(iso) : new Date(iso).getTime();
  if(isNaN(t)) return '';
  var s = Math.floor((Date.now() - t)/1000);
  if(s < 60) return 'Just now';
  if(s < 3600) return Math.floor(s/60) + t('min ago');
  if(s < 86400) return Math.floor(s/3600) + t('h ago');
  return Math.floor(s/86400) + t('d ago');
}

// ── Stat cards + quota bar (real /api/dashboard) ──
async function loadDashboardStats(){
  if(!token) return null;
  try{
    var d = await flight('dash', function(){ return safeApi('GET','/api/dashboard',null,null,true); });
    if(!d) return null;
    userData.token_balance = d.token_balance;
    if(typeof updateBalance === 'function') updateBalance();
    function set(id, v){ var el = document.getElementById(id); if(el) el.textContent = v; }
    set('dashTotalSpent', '$' + (d.total_spent||0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2}));
    set('dashModelsUsed', d.models_used||0);
    set('dashTotalRequests', (d.total_requests||0).toLocaleString());
    set('dashKeyCount', d.api_keys_active||0);
    set('dashKeyStatus', (d.api_keys_active||0)>0 ? 'Active' : 'No keys');
    set('dashDaysActive', d.days_active||0);
    set('dashNewapiStatus', d.newapi_connected ? 'New API Connected' : 'Offline');
    var totalConsumed = d.total_tokens_consumed||0, balance = d.token_balance||0, totalEver = totalConsumed + balance;
    set('usedTokens', totalConsumed.toLocaleString());
    set('remainingTokens', balance.toLocaleString() + ' remaining');
    set('dashTotalConsumed', totalConsumed.toLocaleString());
    var qb = document.getElementById('quotaBar');
    if(qb){ qb.style.width = (totalEver>0 ? Math.min(totalConsumed/totalEver*100, 100) : 0) + '%'; }
    var us = document.getElementById('usageSubtitle');
    if(us) us.textContent = totalConsumed.toLocaleString() + ' of ' + totalEver.toLocaleString() + ' tokens used';
    // ── Balance trend badge + sparkline (real, from daily_usage) ──
    var du = d.daily_usage || {};
    var vals = (du.values || []).map(Number);
    var reqs = (du.requests || []).map(Number);
    // ── Stat-card trend arrows (real progress: recent window vs previous) ──
    // Total Spent / API Requests / Tokens Consumed use the same recent-vs-prev
    // window as the balance badge; Models Used shows active-model count change.
    function trendMeta(arr, recentN){
      var n = arr.length;
      if(n < 2) return null;
      var rn = Math.min(recentN || 3, n);
      var recentArr = arr.slice(n - rn);
      var prevArr = arr.slice(0, n - rn);
      var recent = recentArr.reduce(function(a,b){return a+b;},0) / recentArr.length;
      var prev = prevArr.reduce(function(a,b){return a+b;},0) / prevArr.length;
      if(prev <= 0) return null; // no baseline — can't claim a trend
      var pct = (recent - prev) / prev * 100;
      return { up: pct >= 0, pct: Math.abs(pct), label: (pct >= 0 ? '↑ +' : '↓ ') + pct.toFixed(1) + '%' };
    }
    function renderTrend(id, meta, fallback){
      var el = document.getElementById(id);
      if(!el) return;
      if(!meta){ el.textContent = fallback || '—'; el.className = 'chg text-muted'; return; }
      el.textContent = meta.label + ' vs prev';
      el.className = 'chg ' + (meta.up ? 'up' : 'down');
    }
    renderTrend('dashSpentTrend', trendMeta(vals, 3), 'Lifetime');
    renderTrend('dashReqTrend', trendMeta(reqs, 3), 'Total calls');
    // Models Used: compare distinct models in recent window vs prev window
    var usageModels = (d.usage_by_model || []).length;
    var modelsTrend = null;
    if(usageModels > 0){
      // usage_by_model only covers the requested window (7d default); we don't
      // have a prev-window count here, so show active count in window instead.
      modelsTrend = null;
    }
    renderTrend('dashModelsTrend', modelsTrend, usageModels > 0 ? (usageModels + ' active') : 'No usage');
    var badge = document.getElementById('dashTrendBadge');
    if(badge){
      var n = vals.length;
      var recent = vals.slice(Math.max(0, n-3)).reduce(function(a,b){return a+b;},0);
      var prev = vals.slice(0, Math.max(1, n-3)).reduce(function(a,b){return a+b;},0);
      if(prev > 0 && n > 1){
        var pct = (recent - prev) / prev * 100;
        var up = pct >= 0;
        badge.style.display = '';
        badge.innerHTML = '<svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><polyline points="' + (up ? '18 15 12 9 6 15' : '6 9 12 15 18 9') + '"/></svg> ' + (up ? '+' : '') + pct.toFixed(1) + '%';
        badge.style.color = up ? '#00D68F' : '#FF6B6B';
      } else {
        badge.style.display = 'none';
      }
    }
    var spark = document.getElementById('sparkline');
    var sparkData = vals.filter(function(v){return v > 0;});
    if(spark && sparkData.length >= 2 && typeof Chart !== 'undefined'){
      try{
        if(window._sparkInst) window._sparkInst.destroy();
        window._sparkInst = new Chart(spark, {
          type:'line',
          data:{ labels: vals.map(function(_,i){return i;}), datasets:[{ data: vals, borderColor:'#00D68F', backgroundColor:'rgba(0,214,143,0.15)', fill:true, tension:0.4, pointRadius:0, borderWidth:1.5 }]},
          options:{ responsive:true, maintainAspectRatio:false, animation:false, plugins:{ legend:{display:false}, tooltip:{enabled:false} }, scales:{ x:{display:false}, y:{display:false} } }
        });
      }catch(e){}
    } else if(spark){
      // No meaningful trend data — hide the sparkline instead of drawing a flat green line
      spark.style.display = 'none';
    }
    return d;
  }catch(e){ return null; }
}

// ── API Calls per Model bars + stat tiles (real) ──
async function renderApiCallsChart(days){
  days = days||7;
  // Loading placeholder for stat tiles while the (now parallel) fetches run
  ['statTotalCalls','statAvgDay','statSuccess','statLatency'].forEach(function(id){
    var el = document.getElementById(id);
    if(el && (el.textContent === '' || el.textContent === '—' || el.textContent === '-')) el.textContent = '…';
  });
  // Fire all 4 fetches in parallel (was 4 sequential round-trips before),
  // and share /api/dashboard + cost-by-model with the other loaders.
  var results = await Promise.all([
    flight('cost:'+days, function(){ return safeApi('GET','/api/analytics/cost-by-model?days='+days,null,null,true); }),
    flight('dash', function(){ return safeApi('GET','/api/dashboard',null,null,true); }),
    flight('err:'+days, function(){ return safeApi('GET','/api/analytics/error-rate?days='+days,null,null,true); }),
    flight('rt:'+days, function(){ return safeApi('GET','/api/analytics/response-times?days='+days,null,null,true); })
  ]);
  var costByModel = results[0], dash = results[1], errRate = results[2], respTimes = results[3];
  // Bars: top 6 by calls — same structure as original demo
  var wrap = document.getElementById('apiModelBars');
  if(wrap){
    var models = (costByModel||[]).slice().sort(function(a,b){ return (b.calls||0)-(a.calls||0); }).slice(0,6);
    if(!models.length){
      wrap.innerHTML = '<div class="flex-col-center" style="width:100%"><span class="label-tiny" style="color:var(--text-muted)">No usage yet</span></div>';
    } else {
      var maxCalls = Math.max.apply(null, models.map(function(m){ return m.calls||0; })) || 1;
      var colors = ['bar-gold','bar-teal','bar-purple','bar-blue','bar-orange','bar-red'];
      wrap.innerHTML = models.map(function(m,i){
        var short = String(m.model||'').split('/').pop() || 'Model';
        var pct = Math.max(8, Math.round((m.calls||0)/maxCalls*100));
        return '<div class="flex-col-center"><span class="label-tiny">'+fmtCompact(m.calls||0)+'</span>'+
          '<div class="bar-chart-bar '+(colors[i%colors.length])+'" style="height:'+pct+'%"></div>'+
          '<span class="label-micro">'+escapeHtml(short)+'</span></div>';
      }).join('');
    }
  }
  function set(id, v){ var el = document.getElementById(id); if(el) el.textContent = v; }
  var totalCalls = (dash && dash.total_requests)||0;
  set('statTotalCalls', fmtCompact(totalCalls));
  set('statAvgDay', fmtCompact(Math.round(totalCalls/days)));
  var totalOk=0, totalErr=0;
  (errRate||[]).forEach(function(r){ totalOk += r.success_count||0; totalErr += r.error_count||0; });
  var succPct = (totalOk+totalErr)>0 ? (totalOk/(totalOk+totalErr)*100) : 0;
  set('statSuccess', succPct>=100 ? '100%' : (succPct>0 ? succPct.toFixed(1)+'%' : '—'));
  var lats = (respTimes||[]).map(function(r){ return r.avg_response_time_ms; }).filter(function(v){ return typeof v==='number'; });
  var avgLat = lats.length ? Math.round(lats.reduce(function(a,b){return a+b;},0)/lats.length) : 0;
  var latEst = (respTimes||[]).some(function(r){ return r.estimated; });
  set('statLatency', avgLat ? (latEst ? '~'+avgLat+'ms' : avgLat+'ms') : '—');
  set('statTotalCallsChg', days+t('d total')); set('statAvgDayChg', days+t('d avg')); set('statSuccessChg', days+t('d')); set('statLatencyChg', (latEst?t('est.')+' ':'')+days+t('d avg'));
}

// ── API Calls per Model range dropdown (7d / 30d / 90d) ──
window._apiModelDays = 7;
function toggleApiModelRange(ev){
  if(ev && ev.stopPropagation) ev.stopPropagation();
  var dd = document.getElementById('apiModelRange');
  if(dd) dd.classList.toggle('open');
}
function setApiModelRange(days){
  window._apiModelDays = days;
  var label = document.getElementById('apiModelRangeLabel');
  if(label) label.textContent = days + 'd ▼';
  var dd = document.getElementById('apiModelRange');
  if(dd) dd.classList.remove('open');
  var opts = document.querySelectorAll('#apiModelRangeMenu .range-dd-opt');
  opts.forEach(function(b){ b.classList.toggle('active', parseInt(b.getAttribute('data-days')) === days); });
  renderApiCallsChart(days);
}
document.addEventListener('click', function(ev){
  var dd = document.getElementById('apiModelRange');
  if(dd && !dd.contains(ev.target)) dd.classList.remove('open');
});

// ── Spending by Provider donut (real, grouped by provider) ──
async function renderSpendingDonut(days){
  days = days||7;
  var costByModel = await flight('cost:'+days, function(){ return safeApi('GET','/api/analytics/cost-by-model?days='+days,null,null,true); });
  var cv = document.getElementById('donutCenterVal');
  var sl = document.getElementById('spendingList');
  if(!costByModel || !costByModel.length){
    if(cv) cv.textContent = '$0.00';
    if(sl) sl.innerHTML = '<div class="provider-row" style="opacity:0.6"><span class="text-sm-secondary">No spending yet</span></div>';
    return;
  }
  var provMap = {};
  costByModel.forEach(function(m){
    var full = String(m.model||'');
    var prov = full.indexOf('/')>0 ? full.split('/')[0] : (full || 'Other');
    prov = prov.charAt(0).toUpperCase() + prov.slice(1);
    if(!provMap[prov]) provMap[prov] = 0;
    provMap[prov] += m.cost||0;
  });
  var entries = Object.keys(provMap).map(function(k){ return {provider:k, cost:provMap[k]}; })
    .sort(function(a,b){ return b.cost-a.cost; });
  var totalCost = entries.reduce(function(a,e){ return a+e.cost; },0);
  var colors = [cssVar('--primary'),'#00D68F','#7C4DFF','#4FC3F7','#FF6B6B',cssVar('--primary-hover'),'#39C6F4','#A78BFA'];
  if(sl){
    sl.innerHTML = entries.slice(0,5).map(function(e,i){
      var pct = totalCost>0 ? Math.round(e.cost/totalCost*100) : 0;
      var dotCls = ['legend-dot-gold','legend-dot-teal','legend-dot-purple','legend-dot-blue','legend-dot-red'][i%5];
      return '<div class="provider-row"><div class="flex-row-sm"><span class="legend-dot '+dotCls+'"></span><span class="text-sm-secondary">'+escapeHtml(e.provider)+'</span><span class="text-xs-muted">'+pct+'%</span></div><span class="text-sm-medium">$'+(e.cost||0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})+'</span></div>';
    }).join('') + (entries.length>5 ? '<div class="provider-row"><div class="flex-row-sm"><span class="text-xs-muted">+ '+(entries.length-5)+' more</span></div></div>' : '');
  }
  if(cv) cv.textContent = '$'+totalCost.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2});
  var canvas = document.getElementById('spendingDonut');
  if(canvas && typeof Chart !== 'undefined'){
    if(window._spendingDonutChart) window._spendingDonutChart.destroy();
    window._spendingDonutChart = new Chart(canvas, {
      type:'doughnut',
      data:{
        labels: entries.slice(0,6).map(function(e){ return e.provider; }),
        datasets:[{
          data: entries.slice(0,6).map(function(e){ return totalCost>0 ? Math.round(e.cost/totalCost*100) : 0; }),
          backgroundColor: colors.slice(0,6),
          borderColor: [cssVar('--primary-soft'),'rgba(0,214,143,0.3)','rgba(124,77,255,0.3)','rgba(79,195,247,0.3)','rgba(255,107,107,0.3)','rgba(255,179,71,0.3)'],
          borderWidth:2, hoverBorderWidth:3, hoverOffset:8
        }]
      },
      options:{
        responsive:true, maintainAspectRatio:false, cutout:'65%',
        plugins:{ legend:{display:false}, tooltip:{ position:'nearest', backgroundColor:'rgba(10,11,20,0.9)', titleColor:cssVar('--primary'), bodyColor:'#fff', borderColor:cssVar('--primary-soft'), borderWidth:1, padding:10, cornerRadius:8, callbacks:{ label:function(ctx){ return ctx.label+': '+ctx.parsed+'%'; } } } },
        animation:{ animateRotate:true, duration:1000 }
      }
    });
  }
}

// ── Activity feed (real — /api/dashboard recent_activity, keeps demo structure) ──
function fmtActivityTime(iso){
  if(!iso) return '<strong>—</strong>';
  var d = new Date(typeof window.parseUTCDate === 'function' ? window.parseUTCDate(iso) : new Date(iso).getTime());
  if(isNaN(d.getTime())) return '<strong>'+escapeHtml(String(iso).substring(0,16))+'</strong>';
  var months=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  var dateStr = months[d.getMonth()]+' '+d.getDate()+', '+d.getFullYear();
  var h = d.getHours()%12||12;
  var m = ('0'+d.getMinutes()).slice(-2);
  var ap = d.getHours()>=12?'PM':'AM';
  return '<strong>'+dateStr+'</strong> '+h+':'+m+' '+ap;
}
async function loadActivityFeed(){
  var container = document.getElementById('dashActivity');
  if(!container) return;
  var d = await flight('dash', function(){ return safeApi('GET','/api/dashboard',null,null,true); });
  if(!d) return;
  var items = d.recent_activity||[];
  var countEl = document.getElementById('activityCount');
  var SVGS = {
    code:'<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>',
    money:'<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M16 8h-6a2 2 0 100 4h4a2 2 0 110 4H8"/><line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/></svg>',
    key:'<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12V8H6a2 2 0 01-2-2c0-1.1.9-2 2-2h12v4"/><path d="M4 6v12c0 1.1.9 2 2 2h14v-4"/><path d="M18 12a2 2 0 100 4 2 2 0 000-4z"/></svg>',
    alert:'<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>'
  };
  function itemHtml(type, desc, time, amtHtml){
    var icon, iconCls;
    if(type==='topup' || type==='deposit'){ icon=SVGS.money; iconCls='activity-icon activity-icon-teal'; }
    else if(type==='key_created'||type==='key_deleted'||type==='key_paused'){ icon=SVGS.key; iconCls='activity-icon activity-icon-gold'; }
    else if(type==='consumption'){ icon=SVGS.alert; iconCls='activity-icon activity-icon-red'; }
    else { icon=SVGS.code; iconCls='color-dot-blue'; }
    return '<div class="activity-item activity-row"><div class="'+iconCls+'">'+icon+'</div><div class="flex-grow"><div class="text-desc">'+desc+'</div><div class="text-micro-top">'+time+'</div></div>'+(amtHtml?'<div class="activity-amt">'+amtHtml+'</div>':'')+'</div>';
  }
  if(!items.length){
    if(countEl) countEl.textContent = '0 events';
    container.innerHTML = '<div class="activity-item activity-row" style="opacity:0.6"><div class="flex-grow"><div class="text-desc">No activity yet</div><div class="text-micro-top">Buy tokens or use AI models to see activity here</div></div></div>';
    return;
  }
  if(countEl) countEl.textContent = items.length + ' events';
  var activityCards = items.slice(0,8).map(function(a){
    var type = a.type||'';
    var time = fmtActivityTime(a.created_at);
    var desc;
    if(type==='deposit'){ desc = (a.tokens||0).toLocaleString()+' tokens added via '+escapeHtml(a.payment_method||'payment'); }
    else if(type==='consumption'){ desc = escapeHtml(a.model||'AI model')+' call — '+(a.tokens||0).toLocaleString()+' tokens'; }
    else { desc = escapeHtml(a.model||a.payment_method||a.type||'Activity'); }
    var amtHtml = '';
    if(type==='deposit'){ amtHtml = '<span class="amt-pos">+$'+(Number(a.amount)||0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})+'</span>'; }
    else if(type==='consumption'){ amtHtml = '<span class="amt-neg">-'+(Number(a.tokens)||0).toLocaleString()+' tk</span>'; }
    return itemHtml(type, desc, time, amtHtml);
  });
  // Render ALL cards — the container's max-height + overflow-y handles
  // scrolling, so users can always reach every event (no 5-card cutoff, no
  // Show More/Less button — only vertical hints).
  container.innerHTML = activityCards.join('');
  var moreBtn = document.getElementById('activityMoreBtn');
  if(moreBtn) moreBtn.style.display = 'none';
}

// ── Recent Transactions (real, 5-col table) ──
async function loadRecentTx(){
  var body = document.getElementById('dashTxBody');
  if(!body) return;
  var countEl = document.getElementById('recentTxCount');
  var d = await safeApi('GET','/api/transactions?limit=5',null,null,true);
  if(!d || !d.items || !d.items.length){
    body.innerHTML = '<tr><td colspan="5" class="td-empty">No transactions yet</td></tr>';
    if(countEl) countEl.textContent = 'Last 0';
    return;
  }
  if(countEl) countEl.textContent = 'Last ' + d.items.length;
  body.innerHTML = d.items.map(function(t){
    var date = t.created_at ? fmtDTStack(t.created_at) : '<div class="td-date-strong">—</div>';
    var type = escapeHtml(t.type||'');
    var detail = escapeHtml(t.model_used || t.payment_method || '-');
    var amtCls = (t.type==='deposit'||t.type==='topup') ? 'gold' : 'red';
    var amt = ((t.type==='deposit'||t.type==='topup')?'+':'') + String(t.tokens||0);
    var st = String(t.status||'completed').toLowerCase();
    var stLabel = st.charAt(0).toUpperCase() + st.slice(1);
    // Sanitize before interpolating into class="" (attribute context) — the
    // sibling label is escapeHtml'd, the class suffix must be too.
    var stCls = (st==='completed'||st==='success') ? 'status-paid' : 'status-'+st.replace(/[^a-z0-9_-]/gi,'');
    if(st==='success') stLabel = 'Paid';
    var stHtml = '<span class="status-badge '+stCls+'">'+escapeHtml(stLabel)+'</span>';
    return '<tr><td class="td-date">'+date+'</td><td>'+type+'</td><td>'+detail+'</td><td class="amount '+amtCls+'">'+escapeHtml(amt)+'</td><td class="tx-td-center">'+stHtml+'</td></tr>';
  }).join('');
}

// ── Announcements (public banner + admin manager) ──
function _annDismissed(){
  try{ return JSON.parse(localStorage.getItem('gt_ann_dismissed')||'[]'); }catch(e){ return []; }
}
function _annDismiss(id){
  var list = _annDismissed();
  if(list.indexOf(id) === -1){ list.push(id); localStorage.setItem('gt_ann_dismissed', JSON.stringify(list)); }
}
function dismissAnnouncement(id){
  _annDismiss(id);
  var el = document.getElementById('annBanner_'+id);
  if(el) el.style.display = 'none';
}
async function loadAnnouncements(){
  var container = document.getElementById('announcementBanner');
  if(!container) return;
  var data = await safeApi('GET','/api/announcements',null,null,true);
  if(!data || !data.announcements || !data.announcements.length){
    container.style.display = 'none';
    container.innerHTML = '';
    return;
  }
  var dismissed = _annDismissed();
  var visible = data.announcements.filter(function(a){ return dismissed.indexOf(a.id) === -1; });
  if(!visible.length){ container.style.display = 'none'; container.innerHTML = ''; return; }
  var icons = {info:'ℹ️', warning:'⚠️', success:'✅'};
  container.innerHTML = visible.map(function(a){
    var icon = icons[a.priority] || 'ℹ️';
    var prioCls = /^(info|warning|success)$/.test(a.priority||'') ? a.priority : 'info';
    var cls = 'announcement-banner announcement-'+ prioCls;
    var titleHtml = a.title ? '<strong>'+escapeHtml(a.title)+'</strong> ' : '';
    return '<div class="'+cls+'" id="annBanner_'+safeJsId(a.id)+'">'
      + '<span class="ann-icon">'+icon+'</span>'
      + '<span class="ann-text">'+titleHtml+escapeHtml(a.message)+'</span>'
      + '<button type="button" class="ann-close" onclick="dismissAnnouncement('+safeJsId(a.id)+')" aria-label="Dismiss">✕</button>'
      + '</div>';
  }).join('');
  container.style.display = 'block';
}
async function refreshAnnouncements(force){
  var card = document.getElementById('adminAnnounceCard');
  if(!card) return;
  var list = document.getElementById('annList');
  if(!list) return;
  if(!force && list.dataset.loaded === '1') return;
  var data = await safeApi('GET','/api/admin/announcements',null,null,true);
  if(!data || !data.announcements){ return; }
  list.dataset.loaded = '1';
  if(!data.announcements.length){
    list.innerHTML = '<div class="text-sm-muted" style="padding:0.5rem 0">No announcements yet.</div>';
    return;
  }
  list.innerHTML = data.announcements.map(function(a){
    var stateCls = a.is_active ? 'ann-state-on' : 'ann-state-off';
    var stateTxt = a.is_active ? 'Live' : 'Off';
    var prio = /^(info|warning|success)$/.test(a.priority||'') ? a.priority : 'info';
    return '<div class="ann-admin-row">'
      + '<div class="ann-admin-main"><div class="ann-admin-title">'+escapeHtml(a.title||'(no title)')+'</div>'
      + '<div class="ann-admin-msg">'+escapeHtml(a.message)+'</div>'
      + '<div class="ann-admin-meta">'+escapeHtml(prio)+' · '+escapeHtml((a.created_at||'').replace('T',' ').slice(0,16))+'</div></div>'
      + '<div class="ann-admin-actions">'
      + '<span class="ann-state '+stateCls+'" onclick="toggleAnnouncement('+safeJsId(a.id)+','+(a.is_active?'false':'true')+')">'+stateTxt+'</span>'
      + '<button type="button" class="btn-ghost btn-sm" onclick="deleteAnnouncement('+safeJsId(a.id)+')">Delete</button>'
      + '</div></div>';
  }).join('');
}
async function createAnnouncement(){
  var title = (document.getElementById('annTitle').value||'').trim();
  var message = (document.getElementById('annMessage').value||'').trim();
  var priority = document.getElementById('annPriority').value;
  if(!message){ showToast(t('Message is required'),'error'); return; }
  var res = await safeApi('POST','/api/admin/announcements',{title:title,message:message,priority:priority});
  if(!res) return;
  document.getElementById('annTitle').value = '';
  document.getElementById('annMessage').value = '';
  showToast(t('Announcement published'),'success');
  refreshAnnouncements(false);
  loadAnnouncements();
}
async function toggleAnnouncement(id, isActive){
  var res = await safeApi('PATCH','/api/admin/announcements/'+id,{is_active:isActive});
  if(!res) return;
  showToast(isActive ? 'Announcement live' : 'Announcement hidden','success');
  refreshAnnouncements(true);
  loadAnnouncements();
}
async function deleteAnnouncement(id){
  showConfirm('Delete this announcement?','This cannot be undone.',function(){
    safeApi('DELETE','/api/admin/announcements/'+id).then(function(res){
      if(!res) return;
      showToast(t('Announcement deleted'),'success');
      refreshAnnouncements(true);
      loadAnnouncements();
    });
  });
}
function initAnnouncements(){
  loadAnnouncements();
  // Admin panel: show only for admins (is_admin surfaced in /api/auth/me + cached userData)
  var ud = {};
  try{ ud = JSON.parse((window.__secure ? window.__secure.getItem('gt_user') : localStorage.getItem('gt_user')) || '{}'); }catch(e){ ud = {}; }
  var card = document.getElementById('adminAnnounceCard');
  if(card && ud.is_admin){ card.style.display = ''; refreshAnnouncements(false); }
}

// ── Boot: load everything + 30s real-time refresh ──
(function(){
  function bootDashboard(){
    initAnnouncements();
    if(!token) return;
    loadDashboardStats();
    loadActivityFeed();
    loadRecentTx();
    renderApiCallsChart(window._apiModelDays || 7);
    renderSpendingDonut(30);
    if(typeof loadAvailableModels === 'function') loadAvailableModels();
  }
  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', bootDashboard);
  } else {
    bootDashboard();
  }
  if(!window._dashPoll){
    window._dashPoll = setInterval(function(){
      if(!token) return;
      loadDashboardStats();
      loadActivityFeed();
      loadRecentTx();
      renderApiCallsChart(window._apiModelDays || 7);
      renderSpendingDonut(30);
    }, 30000);
  }
})();
