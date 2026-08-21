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
        if((!data.labels||!data.labels.length)&&(!data.tokens||!data.tokens.length)){
          if(window.dailyChartInst){window.dailyChartInst.destroy();window.dailyChartInst=null}
          canvas.parentNode.innerHTML+='<p style="color:var(--text-muted);text-align:center;padding:1rem;font-size:0.85rem">No usage data for this period.</p>';
          return;
        }
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
        if(summaryTotal)summaryTotal.textContent=(data.total_tokens||0).toLocaleString();
        if(summaryCost)summaryCost.textContent=fmtUSD(data.total_cost||0);
        if(summaryLabel)summaryLabel.innerHTML='Total: <strong>'+(data.total_tokens||0).toLocaleString()+'</strong> tokens';
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
      loadUsageAnalytics(usageDays,usageModel,usageMode);
    }
    async function populateModelFilter(){
      var sel=document.getElementById('usageModelFilter');
      if(!sel)return;
      try{
        var result=await safeApi('GET','/api/available-models');
        if(!result) return;
        var models=result.models||[];
        var seen={};
        models.forEach(function(m){
          var name=m.name||m.model||m.model_id;
          if(name&&!seen[name]){seen[name]=true;
            var opt=document.createElement('option');
            opt.value=name;opt.textContent=name;
            sel.appendChild(opt);
          }
        });
      }catch(e){}
    }
    // Auto-init: render usage chart if canvas present
    document.addEventListener('DOMContentLoaded', function(){
      if(typeof refreshUsageChart==='function' && document.getElementById('dailyChart'))refreshUsageChart();
    });
