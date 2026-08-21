/* ══════════════════════════════════════════
   USAGE CHARTS — Usage analytics (dashboard and Usage pages)
   Extracted from filters.js — shared globals
   (usageDays, usageMode, usageModel,
   safeApi) come from shared.js
   ══════════════════════════════════════════ */
    async function loadUsageAnalytics(days,model,mode){
      var canvas=document.getElementById('dailyChart');
      if(!canvas)return;
      var costCanvas=document.getElementById('usageCostChart');
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
        var empty=document.getElementById('usageChartEmpty')||document.getElementById('usageTokenChartEmpty');
        var costEmpty=document.getElementById('usageCostChartEmpty');
        var hasUsage=totalTokens>0||requests>0;
        var tokenValues=Array.isArray(data.tokens)?data.tokens:[];
        var costValues=Array.isArray(data.costs)?data.costs:tokenValues.map(function(){return 0});
        var hasCost=totalCost>0||costValues.some(function(value){return Number(value)>0});
        if(empty)empty.classList.toggle('show',!hasUsage);
        if(costEmpty)costEmpty.classList.toggle('show',!hasCost);
        canvas.style.opacity=hasUsage?'1':'0.18';
        if(costCanvas)costCanvas.style.opacity=hasCost?'1':'0.18';
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
        function renderBarChart(target,values,label,color,border,isCurrency){
          return new Chart(target,{
            type:'bar',
            data:{
              labels:(data.labels||[]).map(function(l){var p=String(l||'').split('-');return p[1]+'/'+p[2]}),
              datasets:[{label:label,data:values,backgroundColor:color,borderColor:border,borderWidth:1,borderRadius:4}]
            },
            options:{
              responsive:true,maintainAspectRatio:false,
              plugins:{legend:{display:false}},
              scales:{
                y:{beginAtZero:true,grid:{color:cssVar('--border-light')},ticks:{color:cssVar('--text-muted'),font:{size:10},callback:isCurrency?function(value){return '$'+Number(value).toLocaleString(undefined,{maximumFractionDigits:4})}:undefined}},
                x:{grid:{display:false},ticks:{color:cssVar('--text-muted'),font:{size:10}}}
              }
            }
          });
        }
        if(window.dailyChartInst){window.dailyChartInst.destroy()}
        if(costCanvas){
          window.dailyChartInst=renderBarChart(canvas,tokenValues,'Tokens',cssVar('--primary-soft'),cssVar('--primary-hover'),false);
          if(window.usageCostChartInst){window.usageCostChartInst.destroy()}
          window.usageCostChartInst=renderBarChart(costCanvas,costValues,'Cost ($)','rgba(0,214,143,0.28)','#00D68F',true);
        }else{
          var isCost=mode==='cost';
          var values=isCost?costValues:tokenValues;
          var label=isCost?'Cost ($)':'Tokens';
          var color=isCost?'rgba(0,214,143,0.28)':cssVar('--primary-soft');
          var border=isCost?'#00D68F':cssVar('--primary-hover');
          window.dailyChartInst=renderBarChart(canvas,values,label,color,border,isCost);
        }
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
