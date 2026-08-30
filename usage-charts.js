/* ══════════════════════════════════════════
   USAGE CHARTS — Usage analytics (dashboard and Usage pages)
   Extracted from filters.js — shared globals
   (usageDays, usageMode, usageModel,
   safeApi) come from shared.js
   ══════════════════════════════════════════ */
    function usageChartPalette(kind){
      var light=document.documentElement.classList.contains('light');
      if(kind==='cost'){
        return light
          ?{fill:'#007A54',border:'#005C3F',hover:'#009A69'}
          :{fill:'#00D68F',border:'#41E8B0',hover:'#28E2A2'};
      }
      var saved='gold';
      try{saved=localStorage.getItem('gt_accent')||'gold';}catch(e){}
      var accent=(window.ACCENTS&&window.ACCENTS[saved])||(window.ACCENTS&&window.ACCENTS.gold)||{h:44,s:'96%',l:'52%'};
      var sourceLight=parseInt(accent.l,10)||52;
      var fillLight=light?30:Math.max(sourceLight,58);
      var borderLight=light?Math.max(18,fillLight-8):Math.min(88,fillLight+12);
      var hoverLight=light?Math.min(42,fillLight+7):Math.min(82,fillLight+7);
      return {
        fill:'hsl('+accent.h+' '+accent.s+' '+fillLight+'%)',
        border:'hsl('+accent.h+' '+accent.s+' '+borderLight+'%)',
        hover:'hsl('+accent.h+' '+accent.s+' '+hoverLight+'%)'
      };
    }
    function applyUsageChartTheme(chart){
      if(!chart)return;
      var palette=usageChartPalette(chart.$usageKind||'tokens');
      var dataset=chart.data&&chart.data.datasets&&chart.data.datasets[0];
      if(dataset){
        dataset.backgroundColor=palette.fill;
        dataset.borderColor=palette.border;
        dataset.hoverBackgroundColor=palette.hover;
        dataset.hoverBorderColor=palette.border;
      }
      if(chart.options&&chart.options.scales){
        chart.options.scales.y.grid.color=cssVar('--chart-grid');
        chart.options.scales.y.ticks.color=cssVar('--chart-tick');
        chart.options.scales.x.ticks.color=cssVar('--chart-tick');
      }
      chart.update('none');
    }
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
        canvas.style.opacity=hasUsage?'1':'0.55';
        if(costCanvas)costCanvas.style.opacity=hasCost?'1':'0.55';
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
        function renderBarChart(target,values,label,kind,isCurrency){
          var palette=usageChartPalette(kind);
          var chart=new Chart(target,{
            type:'bar',
            data:{
              labels:(data.labels||[]).map(function(l){var p=String(l||'').split('-');return p[1]+'/'+p[2]}),
              datasets:[{label:label,data:values,backgroundColor:palette.fill,borderColor:palette.border,hoverBackgroundColor:palette.hover,hoverBorderColor:palette.border,borderWidth:1.5,borderRadius:4,borderSkipped:false}]
            },
            options:{
              responsive:true,maintainAspectRatio:false,
              plugins:{legend:{display:false}},
              scales:{
                y:{beginAtZero:true,grid:{color:cssVar('--chart-grid')},ticks:{color:cssVar('--chart-tick'),font:{size:10},callback:isCurrency?function(value){return '$'+Number(value).toLocaleString(undefined,{maximumFractionDigits:4})}:undefined}},
                x:{grid:{display:false},ticks:{color:cssVar('--chart-tick'),font:{size:10}}}
              }
            }
          });
          chart.$usageKind=kind;
          return chart;
        }
        if(window.dailyChartInst){window.dailyChartInst.destroy()}
        if(costCanvas){
          window.dailyChartInst=renderBarChart(canvas,tokenValues,'Tokens','tokens',false);
          if(window.usageCostChartInst){window.usageCostChartInst.destroy()}
          window.usageCostChartInst=renderBarChart(costCanvas,costValues,'Cost ($)','cost',true);
        }else{
          var isCost=mode==='cost';
          var values=isCost?costValues:tokenValues;
          var label=isCost?'Cost ($)':'Tokens';
          window.dailyChartInst=renderBarChart(canvas,values,label,isCost?'cost':'tokens',isCost);
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
    function refreshUsageChartTheme(){
      applyUsageChartTheme(window.dailyChartInst);
      applyUsageChartTheme(window.usageCostChartInst);
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
    if(typeof MutationObserver!=='undefined'){
      new MutationObserver(refreshUsageChartTheme).observe(document.documentElement,{attributes:true,attributeFilter:['class','style']});
    }
