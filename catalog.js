/* Keep public catalog claims synchronized with the active gateway catalog. */
(function () {
  'use strict';
  function esc(v) { var e=document.createElement('div'); e.textContent=v==null?'':String(v); return e.innerHTML; }
  function ctx(v) { var n=Number(v)||0; return n>=1000000?(n/1000000).toFixed(n%1000000?1:0)+'M':n>=1000?Math.round(n/1000)+'K':(n||'—'); }
  function ppm(v) { return (Number(v||0)*1000000).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:4}); }
  function counts(ms) {
    var ps=new Set(ms.map(function(m){return m.provider;}).filter(Boolean));
    document.querySelectorAll('[data-catalog-model-count]').forEach(function(e){e.textContent=ms.length.toLocaleString();});
    document.querySelectorAll('[data-catalog-provider-count]').forEach(function(e){e.textContent=ps.size.toLocaleString();});
  }
  function featured(ms) {
    var e=document.getElementById('tmModelsView'); if(!e||!ms.length)return;
    e.innerHTML=ms.slice(0,4).map(function(m){return '<div class="model-grid-cell"><div class="model-grid-provider">'+esc(m.provider||'Provider')+'</div><div class="model-grid-name">'+esc(m.name||m.model_id)+'</div><div class="model-grid-desc">'+ctx(m.context_length)+' ctx · $'+ppm(m.prompt_price)+'/1M input</div></div>';}).join('');
  }
  function pricing(ms) {
    var e=document.getElementById('livePricingBody'); if(!e)return;
    e.innerHTML=ms.length?ms.map(function(m){return '<tr><td class="cell-first"><code>'+esc(m.model_id)+'</code></td><td>'+esc(m.provider||'—')+'</td><td class="cell-num">$'+ppm(m.prompt_price)+'</td><td class="cell-num">$'+ppm(m.completion_price)+'</td></tr>';}).join(''):'<tr><td colspan="4">No models are currently published.</td></tr>';
  }
  function chatModels(ms) {
    var select=document.getElementById('aiModelSelect');
    if(!select)return;
    var previous=select.value;
    select.textContent='';
    ms.forEach(function(m){
      var option=document.createElement('option');
      option.value=m.model_id;
      option.textContent=(m.name||m.model_id)+(m.provider?' — '+m.provider:'');
      option.dataset.modelName=m.name||m.model_id;
      select.appendChild(option);
    });
    if(previous&&ms.some(function(m){return m.model_id===previous;}))select.value=previous;
    select.disabled=!ms.length;
    document.dispatchEvent(new CustomEvent('glbtoken:catalog',{detail:{models:ms}}));
    if(ms.length&&typeof window.selectAIModelDropdown==='function')window.selectAIModelDropdown(select.value);
  }
  document.addEventListener('DOMContentLoaded',function(){
    var p=typeof safeApi==='function'?safeApi('GET','/api/models',null,null,true):fetch('https://api.glbtoken.com/api/models').then(function(r){if(!r.ok)throw Error();return r.json();});
    Promise.resolve(p).then(function(ms){if(Array.isArray(ms)){counts(ms);featured(ms);pricing(ms);chatModels(ms);}}).catch(function(){var e=document.getElementById('catalogLoadState');if(e)e.textContent='Live pricing is temporarily unavailable. Check the Models page before sending a request.';var select=document.getElementById('aiModelSelect');if(select){select.innerHTML='<option value="">Catalog unavailable</option>';select.disabled=true;}document.dispatchEvent(new CustomEvent('glbtoken:catalog',{detail:{models:[]}}));});
  });
})();
