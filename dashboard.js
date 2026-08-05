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
    async function loadTransactions(){
      if(!token)return;
      var depBody=document.getElementById('depositBody'), conBody=document.getElementById('consumptionBody');
      if(!depBody||!conBody)return;
      var txns=await safeApi('GET','/api/transactions',null,null,true); if(!txns||!txns.length){depBody.innerHTML='<tr><td colspan="4" style="text-align:center;color:var(--text-muted);padding:2rem">No transactions yet</td></tr>';return}
        var depRows='', conRows='';
        txns.forEach(function(t){
          var date=t.created_at?fmtDT(t.created_at) : '-';
          var amtClass=t.type==='deposit'?'green':'red';
          var amtSign=t.type==='deposit'?'+':'-';
          var amount='<span class="amount '+amtClass+'">'+amtSign+Math.abs(t.amount).toFixed(2)+'</span>';
          var row='<tr><td>'+date+'</td><td>'+escapeHtml(t.description||t.type)+'</td><td>'+amount+'</td><td>'+escapeHtml(t.status||'completed')+'</td></tr>';
          if(t.type==='deposit'||t.type==='topup') depRows+=row; else conRows+=row;
        });
        depBody.innerHTML=depRows||'<tr><td colspan="4" style="text-align:center;color:var(--text-muted);padding:2rem">No deposits yet</td></tr>';
        conBody.innerHTML=conRows||'<tr><td colspan="4" style="text-align:center;color:var(--text-muted);padding:2rem">No consumption yet</td></tr>';
    }
    // ── Billing ──
    function addPaymentMethod(){
      showToast('Payment method management coming soon','info');
    }
    function viewAllInvoices(){
      showToast('Invoice history coming soon','info');
    }

    // ── Advanced Analytics Dashboard Functions ──


/* ══════════════════════════════════════════
   CHARTS — Cost breakdown, error rate, response times
   ══════════════════════════════════════════ */
    async function loadCostBreakdown(days){
      try{
        var container=document.getElementById('costBreakdownSection');
        if(container){
          var s=container.querySelector('.loading-indicator');
          if(s)s.style.display='flex';
        }
        var el=document.getElementById('costByModelChart');
        if(!el)return;
        var data=await safeApi('GET','/api/analytics/cost-by-model?days='+(days||7));
        if(!data) return;
        if(!data.models||!data.models.length){
          if(window.costChartInst){window.costChartInst.destroy();window.costChartInst=null}
          el.parentNode.innerHTML+='<p style="color:var(--text-muted);text-align:center;padding:1rem;font-size:0.85rem">No cost data available.</p>';
          return;
        }
        if(window.costChartInst){window.costChartInst.destroy()}
        var labels=data.models.map(function(m){return m.model||'Unknown'});
        var costs=data.models.map(function(m){return m.cost||0});
        var tokens=data.models.map(function(m){return m.tokens||0});
        window.costChartInst=new Chart(el,{
          type:'bar',
          data:{
            labels:labels,
            datasets:[
              {label:'Cost ($)',data:costs,backgroundColor:'rgba(244,180,0,0.7)',borderColor:'#F4B400',borderWidth:1,borderRadius:4},
              {label:'Tokens',data:tokens,backgroundColor:'rgba(0,214,143,0.5)',borderColor:'#00D68F',borderWidth:1,borderRadius:4}
            ]
          },
          options:{
            indexAxis:'y',responsive:true,maintainAspectRatio:false,
            plugins:{legend:{labels:{color:'#94A3B8',font:{size:10}}}},
            scales:{
              x:{beginAtZero:true,grid:{color:'rgba(255,255,255,0.05)'},ticks:{color:'#94A3B8',font:{size:10}}},
              y:{grid:{display:false},ticks:{color:'#94A3B8',font:{size:10}}}
            }
          }
        });
        var totalCostEl=document.getElementById('costBreakdownTotal');
        if(totalCostEl)totalCostEl.textContent='$'+(data.total_cost||0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2});
        var modelCountEl=document.getElementById('costBreakdownModels');
        if(modelCountEl)modelCountEl.textContent=data.models.length+' models';
      }finally{
        if(container){
          var s2=container.querySelector('.loading-indicator');
          if(s2)s2.style.display='none';
        }
      }
    }

    async function loadErrorRate(days){
      try{
        var el=document.getElementById('errorRateChart');
        if(!el)return;
        var data=await safeApi('GET','/api/analytics/error-rate?days='+(days||7));
        if(!data) return;
        if(!data.labels||!data.labels.length){
          if(window.errorChartInst){window.errorChartInst.destroy();window.errorChartInst=null}
          el.parentNode.innerHTML+='<p style="color:var(--text-muted);text-align:center;padding:1rem;font-size:0.85rem">No error rate data available.</p>';
          return;
        }
        if(window.errorChartInst){window.errorChartInst.destroy()}
        window.errorChartInst=new Chart(el,{
          type:'line',
          data:{
            labels:data.labels,
            datasets:[
              {label:'Success',data:data.success||[],borderColor:'#22C55E',backgroundColor:'rgba(34,197,94,0.1)',fill:true,tension:0.3,pointRadius:3},
              {label:'Errors',data:data.errors||[],borderColor:'#EF4444',backgroundColor:'rgba(239,68,68,0.1)',fill:true,tension:0.3,pointRadius:3}
            ]
          },
          options:{
            responsive:true,maintainAspectRatio:false,
            plugins:{legend:{labels:{color:'#94A3B8',font:{size:10}}}},
            scales:{
              y:{beginAtZero:true,grid:{color:'rgba(255,255,255,0.05)'},ticks:{color:'#94A3B8',font:{size:10}}},
              x:{grid:{display:false},ticks:{color:'#94A3B8',font:{size:10}}}
            }
          }
        });
        var errRateEl=document.getElementById('errorRatePct');
        if(errRateEl)errRateEl.textContent=((data.error_rate||0)*100).toFixed(1)+'%';
        var totalErrEl=document.getElementById('errorTotal');
        if(totalErrEl)totalErrEl.textContent=(data.total_errors||0).toLocaleString();
      }catch(e){
        // Silently fail for error rate
      }
    }

    async function loadResponseTimes(days){
      var body=document.getElementById('responseTimeBody');
      if(!body)return;
      body.innerHTML='<tr><td colspan="4" style="text-align:center;padding:1rem;color:var(--text-muted)">Loading...</td></tr>';
      var data=await safeApi('GET','/api/analytics/response-times?days='+(days||7),null,null,true); if(!data){ body.innerHTML='<tr><td colspan="4" style="text-align:center;padding:1.5rem;color:var(--text-muted)">Failed to load response times.</td></tr>';return}
        if(!data||!data.items||!data.items.length){
          body.innerHTML='<tr><td colspan="4" style="text-align:center;padding:1.5rem;color:var(--text-muted)">No response time data available.</td></tr>';
          return;
        }
        body.innerHTML=data.items.map(function(item){
          var ms=item.response_time_ms||0;
          var cls=ms<500?'speed-fast':ms<2000?'speed-medium':'speed-slow';
          return '<tr><td>'+escapeHtml(item.model||'-')+'</td><td>'+escapeHtml(item.provider||'-')+'</td><td class="'+cls+'">'+ms.toFixed(0)+' ms</td><td>'+escapeHtml(item.date||'')+'</td></tr>';
        }).join('');

    }

    async function loadKeyUsage(days){
      var body=document.getElementById('keyUsageBody');
      if(!body)return;
      body.innerHTML='<tr><td colspan="5" style="text-align:center;padding:1rem;color:var(--text-muted)">Loading...</td></tr>';
      var data=await safeApi('GET','/api/analytics/key-usage?days='+(days||7),null,null,true); if(!data){ body.innerHTML='<tr><td colspan="5" style="text-align:center;padding:1.5rem;color:var(--text-muted)">Failed to load key usage.</td></tr>';return}
        if(!data||!data.keys||!data.keys.length){
          body.innerHTML='<tr><td colspan="5" style="text-align:center;padding:1.5rem;color:var(--text-muted)">No key usage data available.</td></tr>';
          return;
        }
        body.innerHTML=data.keys.map(function(k){
          return '<tr><td>'+escapeHtml(k.name||'Key '+k.id)+'</td><td>'+escapeHtml(k.key_prefix||'')+'...</td><td>'+(k.request_count||0).toLocaleString()+'</td><td>'+(k.tokens||0).toLocaleString()+'</td><td class="td-date">'+(k.last_used?fmtDTStack(k.last_used):'<div class="td-date-strong">Never</div>')+'</td></tr>';
        }).join('');

    }

    async function loadCostProjection(){
      var last30El=document.getElementById('projLast30');
      var monthlyEl=document.getElementById('projMonthly');
      var dailyEl=document.getElementById('projDailyAvg');
      if(!last30El&&!monthlyEl&&!dailyEl)return;
      var data=await safeApi('GET','/api/analytics/cost-projection',null,null,true); if(!data||data.error){
        if(last30El)last30El.textContent='$0.00';
        if(monthlyEl)monthlyEl.textContent='$0.00';
        if(dailyEl)dailyEl.textContent='$0.00';
        return;
      }
      if(last30El)last30El.textContent='$'+(data.last_30_days||0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2});
      if(monthlyEl)monthlyEl.textContent='$'+(data.projected_monthly||0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2});
      if(dailyEl)dailyEl.textContent='$'+(data.daily_average||0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2});
    }

    async function loadSpeedComparison(){
      var body=document.getElementById('speedComparisonBody');
      if(!body)return;
      body.innerHTML='<tr><td colspan="4" style="text-align:center;padding:1rem;color:var(--text-muted)">Loading...</td></tr>';
      var result=await safeApi('GET','/api/available-models',null,8000,true); if(!result){ body.innerHTML='<tr><td colspan="4" style="text-align:center;padding:1.5rem;color:var(--text-muted)">Failed to load speed comparison.</td></tr>';return}
        var models=(result&&result.models)||[];
        if(!models.length){
          body.innerHTML='<tr><td colspan="4" style="text-align:center;padding:1.5rem;color:var(--text-muted)">No speed comparison data available.</td></tr>';
          return;
        }
        var sorted=models.filter(function(m){return m.prompt_price>0;}).sort(function(a,b){return (a.prompt_price||0)-(b.prompt_price||0);}).slice(0,20);
        body.innerHTML=sorted.map(function(m){
          var name=m.name||m.model||m.model_id||'Unknown';
          var provider=m.provider||'-';
          var price=m.prompt_price||0;
          var speedCls=price<0.0000005?'speed-fast':price<0.000002?'speed-medium':'speed-slow';
          var speedLabel=price<0.0000005?'Fast':price<0.000002?'Medium':'Slower';
          return '<tr><td>'+escapeHtml(name)+'</td><td>'+escapeHtml(provider)+'</td><td class="'+speedCls+'">'+speedLabel+'</td><td>$'+(price*1000).toFixed(4)+'/1K</td></tr>';
        }).join('');

    }



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
  var t = new Date(iso).getTime();
  if(isNaN(t)) return '';
  var s = Math.floor((Date.now() - t)/1000);
  if(s < 60) return 'Just now';
  if(s < 3600) return Math.floor(s/60) + ' min ago';
  if(s < 86400) return Math.floor(s/3600) + 'h ago';
  return Math.floor(s/86400) + 'd ago';
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
  set('statTotalCallsChg', days+'d total'); set('statAvgDayChg', days+'d avg'); set('statSuccessChg', days+'d'); set('statLatencyChg', (latEst?'est. ':'')+days+'d avg');
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
  var colors = ['#F4B400','#00D68F','#7C4DFF','#4FC3F7','#FF6B6B','#FFB347','#39C6F4','#A78BFA'];
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
          borderColor: ['rgba(244,180,0,0.3)','rgba(0,214,143,0.3)','rgba(124,77,255,0.3)','rgba(79,195,247,0.3)','rgba(255,107,107,0.3)','rgba(255,179,71,0.3)'],
          borderWidth:2, hoverBorderWidth:3, hoverOffset:8
        }]
      },
      options:{
        responsive:true, maintainAspectRatio:false, cutout:'65%',
        plugins:{ legend:{display:false}, tooltip:{ position:'nearest', backgroundColor:'rgba(10,11,20,0.9)', titleColor:'#F4B400', bodyColor:'#fff', borderColor:'rgba(244,180,0,0.2)', borderWidth:1, padding:10, cornerRadius:8, callbacks:{ label:function(ctx){ return ctx.label+': '+ctx.parsed+'%'; } } } },
        animation:{ animateRotate:true, duration:1000 }
      }
    });
  }
}

// ── Activity feed (real — /api/dashboard recent_activity, keeps demo structure) ──
function fmtActivityTime(iso){
  if(!iso) return '<strong>—</strong>';
  var d = new Date(iso);
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
  // Mobile: first 3 visible, rest behind a Show-More toggle (desktop shows all 8)
  var actFirst = activityCards.slice(0,3).join('');
  var actRest = activityCards.slice(3);
  container.innerHTML = actFirst
    + (actRest.length
        ? '<div id="activityCollapse" class="activity-collapse" data-count="'+actRest.length+'">'+actRest.join('')+'</div>'
          + '<button id="activityMoreBtn" class="list-more-btn" onclick="toggleActivityMore()">Show More ('+actRest.length+') ▼</button>'
        : '');
  refreshActivityMoreBtn();
}
function toggleActivityMore(){
  var collapse = document.getElementById('activityCollapse');
  if(!collapse) return;
  collapse.classList.toggle('open');
  refreshActivityMoreBtn();
}
function refreshActivityMoreBtn(){
  var collapse = document.getElementById('activityCollapse');
  var btn = document.getElementById('activityMoreBtn');
  if(!collapse || !btn) return;
  var count = collapse.querySelectorAll('.activity-item').length;
  collapse.setAttribute('data-count', count);
  if(!count){ btn.style.display = 'none'; return; }
  btn.style.display = '';
  btn.innerHTML = collapse.classList.contains('open')
    ? 'Show Less ▲'
    : 'Show More ('+count+') ▼';
}

// ── Recent Transactions (real, 5-col table) ──
async function loadRecentTx(){
  var body = document.getElementById('dashTxBody');
  if(!body) return;
  var d = await safeApi('GET','/api/transactions?limit=5',null,null,true);
  if(!d || !d.items || !d.items.length){
    body.innerHTML = '<tr><td colspan="5" class="td-empty">No transactions yet</td></tr>';
    return;
  }
  body.innerHTML = d.items.map(function(t){
    var date = t.created_at ? fmtDTStack(t.created_at) : '<div class="td-date-strong">—</div>';
    var type = escapeHtml(t.type||'');
    var detail = escapeHtml(t.model_used || t.payment_method || '-');
    var amtCls = (t.type==='deposit'||t.type==='topup') ? 'gold' : 'red';
    var amt = ((t.type==='deposit'||t.type==='topup')?'+':'') + String(t.tokens||0);
    return '<tr><td class="td-date">'+date+'</td><td>'+type+'</td><td>'+detail+'</td><td class="amount '+amtCls+'">'+amt+'</td><td><span style="color:var(--success)">'+escapeHtml(t.status||'completed')+'</span></td></tr>';
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
    var cls = 'announcement-banner announcement-'+ (a.priority||'info');
    var titleHtml = a.title ? '<strong>'+escapeHtml(a.title)+'</strong> ' : '';
    return '<div class="'+cls+'" id="annBanner_'+a.id+'">'
      + '<span class="ann-icon">'+icon+'</span>'
      + '<span class="ann-text">'+titleHtml+escapeHtml(a.message)+'</span>'
      + '<button type="button" class="ann-close" onclick="dismissAnnouncement('+a.id+')" aria-label="Dismiss">✕</button>'
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
    var prio = a.priority || 'info';
    return '<div class="ann-admin-row">'
      + '<div class="ann-admin-main"><div class="ann-admin-title">'+escapeHtml(a.title||'(no title)')+'</div>'
      + '<div class="ann-admin-msg">'+escapeHtml(a.message)+'</div>'
      + '<div class="ann-admin-meta">'+prio+' · '+escapeHtml((a.created_at||'').replace('T',' ').slice(0,16))+'</div></div>'
      + '<div class="ann-admin-actions">'
      + '<span class="ann-state '+stateCls+'" onclick="toggleAnnouncement('+a.id+','+(a.is_active?'false':'true')+')">'+stateTxt+'</span>'
      + '<button type="button" class="btn-ghost btn-sm" onclick="deleteAnnouncement('+a.id+')">Delete</button>'
      + '</div></div>';
  }).join('');
}
async function createAnnouncement(){
  var title = (document.getElementById('annTitle').value||'').trim();
  var message = (document.getElementById('annMessage').value||'').trim();
  var priority = document.getElementById('annPriority').value;
  if(!message){ showToast('Message is required','error'); return; }
  var res = await safeApi('POST','/api/admin/announcements',{title:title,message:message,priority:priority});
  if(!res) return;
  document.getElementById('annTitle').value = '';
  document.getElementById('annMessage').value = '';
  showToast('Announcement published','success');
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
  if(typeof confirmModal === 'function'){
    confirmModal('Delete this announcement?', function(){
      safeApi('DELETE','/api/admin/announcements/'+id).then(function(res){
        if(!res) return;
        showToast('Announcement deleted','success');
        refreshAnnouncements(true);
        loadAnnouncements();
      });
    });
  } else {
    if(!window.confirm('Delete this announcement?')) return;
    var res = await safeApi('DELETE','/api/admin/announcements/'+id);
    if(!res) return;
    showToast('Announcement deleted','success');
    refreshAnnouncements(true);
    loadAnnouncements();
  }
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
