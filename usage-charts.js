/* ══════════════════════════════════════════
   USAGE CHARTS — Usage analytics (dashboard.html)
   Extracted from filters.js — shared globals
   (usageDays, usageMode, usageModel, chartInst,
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
        var border=isCost?'#00D68F':'#FFB347';
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
        if(summaryLabel)summaryLabel.innerHTML='Total: <strong>'+(data.total_tokens||0).toLocaleString()+'</strong> '+(isCost?'cost ($)':'tokens');
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
    async function loadAvailableModels(){
      var container=document.getElementById('dashModelList');
      var countEl=document.getElementById('modelCountLabel');
      if(!container)return;
      var result=await safeApi('GET','/api/available-models',null,null,true); if(!result){container.innerHTML='<p style="color:var(--text-muted);font-size:0.85rem;text-align:center;padding:0.75rem">Failed to load models.</p>';return}
      var models=result.models||[];
        if(!models.length){
          countEl.textContent='0 models';
          container.innerHTML='<p style="color:var(--text-muted);font-size:0.85rem;text-align:center;padding:0.75rem">No models available yet. Configure New API.</p>';
          return;
        }
        countEl.textContent=models.length+' models';
        container.innerHTML=models.map(function(m){
          var name=m.name||m.model||m.model_id||m.id||'Unknown';
          var provider=m.provider||'';
          var icon='🧠';
          if(name.toLowerCase().includes('gpt')) icon='🤖';
          else if(name.toLowerCase().includes('claude')) icon='🟣';
          else if(name.toLowerCase().includes('deepseek')) icon='🔴';
          else if(name.toLowerCase().includes('llama')) icon='🦙';
          else if(name.toLowerCase().includes('gemini')) icon='🔵';
          var tags='';
          if(m.context_length) tags+='<span style="font-size:0.7rem;padding:1px 6px;border-radius:4px;background:var(--primary-subtle);color:var(--primary)">'+(m.context_length/1000).toFixed(0)+'K</span> ';
          if(m.prompt_price) tags+='<span style="font-size:0.7rem;padding:1px 6px;border-radius:4px;background:var(--success-subtle);color:var(--success)">$'+(m.prompt_price*1000).toFixed(4)+'/1K</span>';
          return '<div style="display:flex;align-items:center;gap:0.5rem;padding:0.3rem 0.5rem;font-size:0.8rem;border-bottom:1px solid var(--border);transition:background 0.2s" onmouseover="this.style.background=\'var(--card-hover)\'" onmouseout="this.style.background=\'\'">'+
            '<span>'+icon+'</span>'+
            '<span style="flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+escapeHtml(name)+'</span>'+
            (provider?'<span style="color:var(--text-muted);font-size:0.7rem">'+escapeHtml(provider)+'</span>':'')+
            tags+
          '</div>';
        }).join('');

    }
    function initCharts(usage){
      const canvas=document.getElementById('usageChart');
      if(!canvas)return;
      if(chartInst){chartInst.destroy();chartInst=null}
      const labels=usage&&usage.length?usage.map(u=>u.model):['GPT-4o','Claude','DeepSeek','Llama','Other'];
      const data=usage&&usage.length?usage.map(u=>u.tokens):[0,0,0,0,0];
      const colors=['#FFB347','#00D68F','#7C3AED','#FF6B6B','#00B4D8'];
      chartInst=new Chart(canvas,{
        type:'doughnut',
        data:{labels:labels,datasets:[{data:data,backgroundColor:colors,borderWidth:0}]},
        options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}}}
      });
    }
    function initDailyChart(dailyData){
      var canvas=document.getElementById('dailyChart');
      if(!canvas||!dailyData||!dailyData.labels)return;
      if(window.dailyChartInst){window.dailyChartInst.destroy()}
      window.dailyChartInst=new Chart(canvas,{
        type:'bar',
        data:{
          labels:dailyData.labels.map(function(l){var p=String(l||'').split('-');return p[1]+'/'+p[2]}),
          datasets:[{
            label:'Tokens',
            data:dailyData.values,
            backgroundColor:'rgba(255,179,71,0.6)',
            borderColor:'#FFB347',
            borderWidth:1,
            borderRadius:4
          }]
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
    }

    // Auto-init: render usage chart if canvas present
    document.addEventListener('DOMContentLoaded', function(){
      if(typeof refreshUsageChart==='function' && document.getElementById('dailyChart'))refreshUsageChart();
    });
