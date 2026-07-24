/* ══════════════════════════════════════════
   DASHBOARD — Transactions, notifications, billing
   ══════════════════════════════════════════ */
    async function loadTransactions(){
      if(!token)return;
      var depBody=document.getElementById('depositBody'), conBody=document.getElementById('consumptionBody');
      if(!depBody||!conBody)return;
      var txns=await safeApi('GET','/api/transactions',null,null,true); if(!txns||!txns.length){depBody.innerHTML='<tr><td colspan="4" style="text-align:center;color:var(--text-muted);padding:2rem">No transactions yet</td></tr>';return}
        var depRows='', conRows='';
        txns.forEach(function(t){
          var date=t.created_at?new Date(t.created_at).toLocaleDateString() : '-';
          var amtClass=t.type==='deposit'?'green':'red';
          var amtSign=t.type==='deposit'?'+':'-';
          var amount='<span class="amount '+amtClass+'">'+amtSign+Math.abs(t.amount).toFixed(2)+'</span>';
          var row='<tr><td>'+date+'</td><td>'+escapeHtml(t.description||t.type)+'</td><td>'+amount+'</td><td>'+escapeHtml(t.status||'completed')+'</td></tr>';
          if(t.type==='deposit'||t.type==='topup') depRows+=row; else conRows+=row;
        });
        depBody.innerHTML=depRows||'<tr><td colspan="4" style="text-align:center;color:var(--text-muted);padding:2rem">No deposits yet</td></tr>';
        conBody.innerHTML=conRows||'<tr><td colspan="4" style="text-align:center;color:var(--text-muted);padding:2rem">No consumption yet</td></tr>';
    }
    // ── Notifications ──
    function dismissNotif(el){
      el.closest('.notif-item').remove();
    }
    function markAllRead(){
      var items=document.querySelectorAll('.notif-item .notif-dot');
      items.forEach(function(d){d.style.display='none'});
      showToast('All marked as read','info');
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
            plugins:{legend:{labels:{color:'var(--text-muted)',font:{size:10}}}},
            scales:{
              x:{beginAtZero:true,grid:{color:'rgba(255,255,255,0.05)'},ticks:{color:'var(--text-muted)',font:{size:10}}},
              y:{grid:{display:false},ticks:{color:'var(--text-muted)',font:{size:10}}}
            }
          }
        });
        var totalCostEl=document.getElementById('costBreakdownTotal');
        if(totalCostEl)totalCostEl.textContent='$'+(data.total_cost||0).toFixed(2);
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
            plugins:{legend:{labels:{color:'var(--text-muted)',font:{size:10}}}},
            scales:{
              y:{beginAtZero:true,grid:{color:'rgba(255,255,255,0.05)'},ticks:{color:'var(--text-muted)',font:{size:10}}},
              x:{grid:{display:false},ticks:{color:'var(--text-muted)',font:{size:10}}}
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
          return '<tr><td>'+escapeHtml(k.name||'Key '+k.id)+'</td><td>'+escapeHtml(k.key_prefix||'')+'...</td><td>'+(k.request_count||0).toLocaleString()+'</td><td>'+(k.tokens||0).toLocaleString()+'</td><td>'+escapeHtml(k.last_used?new Date(k.last_used).toLocaleDateString():'Never')+'</td></tr>';
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
      if(last30El)last30El.textContent='$'+(data.last_30_days||0).toFixed(2);
      if(monthlyEl)monthlyEl.textContent='$'+(data.projected_monthly||0).toFixed(2);
      if(dailyEl)dailyEl.textContent='$'+(data.daily_average||0).toFixed(2);
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


