/* ══════════════════════════════════════════
   USAGE CHARTS — Usage analytics (dashboard.html)
   Extracted from filters.js — shared globals
   (usageDays, usageMode, usageModel,
   safeApi) come from shared.js
   ══════════════════════════════════════════ */
    async function loadUsageAnalytics(days,model,mode){
      var canvas=document.getElementById('dailyChart');
      if(!canvas)return;
      var summaryTotal=document.getElementById('usageTotalVal');
      var summaryCost=document.getElementById('usageCostVal');
      var summaryLabel=document.getElementById('usageTotalLabel');
      var params='?days='+(days||7);
        if(model)params+='&model='+encodeURIComponent(model);
        var data=await safeApi('GET','/api/usage-analytics'+params);
        if(!data) return;
        var requests=(data.requests||[]).reduce(function(sum,n){return sum+Number(n||0)},0);
        var totalTokens=Number(data.total_tokens||0);
        var totalCost=Number(data.total_cost||0);
        var top=(data.top_models&&data.top_models[0])||null;
        var empty=document.getElementById('usageChartEmpty');
        var hasUsage=totalTokens>0||requests>0;
        if(empty)empty.classList.toggle('show',!hasUsage);
        canvas.style.opacity=hasUsage?'1':'0.18';
        var requestStat=document.getElementById('usageRequestStat');
        var requestSub=document.getElementById('usageRequestSub');
        var tokenStat=document.getElementById('usageTokenStat');
        var tokenSub=document.getElementById('usageTokenSub');
        var spendStat=document.getElementById('usageSpendStat');
        var costMethod=document.getElementById('usageCostMethod');
        var topStat=document.getElementById('usageTopModelStat');
        var topSub=document.getElementById('usageTopModelSub');
        if(requestStat)requestStat.textContent=requests.toLocaleString();
        if(requestSub)requestSub.textContent=(days||7)+' day window';
        if(tokenStat)tokenStat.textContent=totalTokens.toLocaleString();
        if(tokenSub)tokenSub.textContent=requests?Math.round(totalTokens/requests).toLocaleString()+' avg / request':'No completed requests';
        if(spendStat)spendStat.textContent=fmtUSD(totalCost);
        if(costMethod)costMethod.textContent=hasUsage?(data.costs_estimated?'Includes catalog estimates':'Provider-reported cost'):'No billed usage';
        if(topStat)topStat.textContent=top?(top.model||'Unknown'):'—';
        if(topSub)topSub.textContent=top?Number(top.tokens||0).toLocaleString()+' charged tokens':'No model usage yet';
        if(window.dailyChartInst){window.dailyChartInst.destroy()}
        var isCost=mode==='cost';
        var values=isCost?(data.costs||data.tokens.map(function(){return 0})):data.tokens;
        var label=isCost?'Cost ($)':'Tokens';
        var color=isCost?'rgba(0,214,143,0.7)':'rgba(255,179,71,0.6)';
        var border=isCost?'#00D68F':cssVar('--primary-hover');
        window.dailyChartInst=new Chart(canvas,{
          type:'bar',
          data:{
            labels:(data.labels||[]).map(function(l){var p=String(l||'').split('-');return p[1]+'/'+p[2]}),
            datasets:[{label:label,data:values,backgroundColor:color,borderColor:border,borderWidth:1,borderRadius:4}]
          },
          options:{
            responsive:true,maintainAspectRatio:false,
            plugins:{legend:{display:false}},
            scales:{
              y:{beginAtZero:true,grid:{color:'rgba(255,255,255,0.05)'},ticks:{color:'#94A3B8',font:{size:10}}},
              x:{grid:{display:false},ticks:{color:'#94A3B8',font:{size:10}}}
            }
          }
        });
        if(summaryTotal)summaryTotal.textContent=totalTokens.toLocaleString();
        if(summaryCost)summaryCost.textContent=fmtUSD(totalCost)+(data.costs_estimated?' est.':'');
        if(summaryLabel)summaryLabel.innerHTML='Total: <strong>'+totalTokens.toLocaleString()+'</strong> tokens · '+requests.toLocaleString()+' requests';
    }
    function setUsageRange(days){
      usageDays=days;
      document.querySelectorAll('#usageRangeBtns .usage-range').forEach(function(b){b.classList.toggle('active',parseInt(b.getAttribute('data-days'))===days)});
      refreshUsageChart();
    }
    function setUsageMode(mode){
      usageMode=mode;
      document.querySelectorAll('#usageModeBtns .usage-mode').forEach(function(b){b.classList.toggle('active',b.getAttribute('data-mode')===mode)});
      refreshUsageChart();
    }
    function refreshUsageChart(){
      var modelSelect=document.getElementById('usageModelFilter');
      usageModel=modelSelect?modelSelect.value:'';
      loadUsageAnalytics(usageDays,usageModel,usageMode);
    }
    async function populateModelFilter(){
      var sel=document.getElementById('usageModelFilter');
      if(!sel)return;
      try{
        var models=await safeApi('GET','/api/playground/models',null,null,true);
        if(!Array.isArray(models)) return;
        while(sel.options.length>1)sel.remove(1);
        var seen={};
        models.forEach(function(m){
          var id=m.model_id||m.model||m.name;
          if(id&&!seen[id]){seen[id]=true;
            var opt=document.createElement('option');
            opt.value=id;opt.textContent=(m.name||id)+(m.provider?' · '+m.provider:'');
            sel.appendChild(opt);
          }
        });
      }catch(e){}
    }
    // Auto-init: render usage chart if canvas present
    document.addEventListener('DOMContentLoaded', function(){
      if(typeof refreshUsageChart==='function' && document.getElementById('dailyChart'))refreshUsageChart();
    });
