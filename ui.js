/* ══════════════════════════════════════════
   UI — Mobile menu & carousel
   ══════════════════════════════════════════ */
    function toggleMobile(){
      const overlay = document.getElementById('mobileOverlay');
      const backdrop = document.getElementById('mobileBackdrop');
      const btn = document.getElementById('hamburgerBtn');
      overlay.classList.toggle('open');
      if(backdrop)backdrop.classList.toggle('open');
      btn.classList.toggle('active');
      document.body.style.overflow=overlay.classList.contains('open')?'hidden':'';
    }
    function closeMobile(){
      const overlay = document.getElementById('mobileOverlay');
      const backdrop = document.getElementById('mobileBackdrop');
      overlay.classList.remove('open');
      if(backdrop)backdrop.classList.remove('open');
      document.getElementById('hamburgerBtn').classList.remove('active');
      document.body.style.overflow='';
    }
    let tmIndex=0,tmInterval,tmTotal=6,tmTouchStartX=0,tmTouchStartY=0;
    let tmDragStartX=0,tmDragOffset=0,tmIsDragging=false,tmTrackWidth=0;
    const tmTitles=['🔥 Top Models This Week','💻 API Quick Start','💬 Chat','💬 Responses','🧠 Claude','🔮 Gemini'];

    async function refreshTopModels(){
      var container=document.getElementById('tmModelsView');
      if(!container)return;
      // Save current HTML to restore on API failure
      var fallbackHtml = container.innerHTML;
      container.innerHTML='<div style="grid-column:1/-1;text-align:center;padding:1rem;color:var(--text-muted);font-size:0.8rem">'+t('Loading models...')+'</div>';
      var all=await safeApi('GET','/api/models',null,8000,true); if(!all){container.innerHTML=fallbackHtml;return}
        if(!all||!all.length){container.innerHTML=fallbackHtml;return;}
        // The homepage carousel and chat share the same live catalog request.
        // Hydrating the selector here also makes chat resilient if the catalog
        // event fired before ui.js finished attaching its listener.
        hydrateAIModelSelect(all);
        var featured=all.filter(function(m){return m.category==='Flagship'||m.category==='Flash';});
        var top4=featured.length>=4?featured.slice(0,4):all.slice(0,4);
        var html='';
        top4.forEach(function(m){
          var price='$'+(m.prompt_price*1000).toFixed(4).replace(/0+$/,'').replace(/\\.$/,'')+'/1k';
          var ctx=m.context_length>=1000000?(m.context_length/1000000).toFixed(0)+'M':m.context_length>=1000?(m.context_length/1000).toFixed(0)+'K':m.context_length;
          html+='<div style="background:var(--bg-alt);border:1px solid var(--border-light);border-radius:var(--radius-sm);padding:0.75rem;overflow-wrap:break-word;word-break:break-word;overflow:hidden;width:100%;box-sizing:border-box">'
            +'<div style="font-size:0.7rem;text-transform:uppercase;letter-spacing:0.05em;color:var(--text-muted);margin-bottom:0.2rem;overflow-wrap:break-word;word-break:break-word">'+escapeHtml(m.provider)+'</div>'
            +'<div style="font-weight:600;font-size:0.85rem;overflow-wrap:break-word;word-break:break-word">'+escapeHtml(m.name)+'</div>'
            +'<div style="font-size:0.75rem;color:var(--text-secondary);overflow-wrap:break-word;word-break:break-word">'+ctx+' ctx · '+price+'</div>'
            +'</div>';
        });
        container.innerHTML = html;
    }
    function slideTopView(dir){
      var track=document.getElementById('tmTrack');
      if(!track)return;
      tmIndex=(tmIndex+dir+tmTotal)%tmTotal;
      track.style.transform='translateX(-'+(tmIndex*100)+'%)';
      const title=document.getElementById('tmTitle');
      if(title)title.textContent=t(tmTitles[tmIndex],tmTitles[tmIndex]);
      // Auto-refresh models when sliding to slide 0
      if(tmIndex===0)refreshTopModels();
      document.querySelectorAll('.tm-dot').forEach((d,i)=>{
        d.style.background=i===tmIndex?'var(--primary)':'var(--text-muted)';
        d.style.width=i===tmIndex?'10px':'8px';
        d.style.height=i===tmIndex?'10px':'8px';
      });
      clearInterval(tmInterval);tmInterval=setInterval(()=>slideTopView(1),5000);
    }
    function goToSlide(i){tmIndex=i-1;slideTopView(1)}
    function resumeAutoSlide(){clearInterval(tmInterval);tmInterval=setInterval(()=>slideTopView(1),5000);}
    function copyCode(btn){
      var container = btn.closest('[data-copy]');
      if(!container) return;
      var text = container.textContent || container.innerText;
      text = text.replace(/^# .+\n/mg,'').replace(/^REQUEST\n|^RESPONSE\n/gm,'').trim();
      function copied(){animateCopyBtn(btn);showToast('Copied!','success')}
      function legacyCopy(){
        var ta=document.createElement('textarea');
        ta.value=text;ta.setAttribute('readonly','');ta.style.position='fixed';ta.style.opacity='0';
        document.body.appendChild(ta);ta.select();
        var ok=false;
        try{ok=document.execCommand('copy')}catch(e){ok=false}
        document.body.removeChild(ta);
        if(ok)copied();else showToast('Copy failed — select the code manually.','error');
      }
      if(navigator.clipboard&&window.isSecureContext){navigator.clipboard.writeText(text).then(copied).catch(legacyCopy)}
      else{legacyCopy()}
    }
    function animateCopyBtn(btn){
    btn.classList.add('copying');
    var orig = btn.innerHTML;
    btn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#00D68F" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
    setTimeout(function(){
      btn.innerHTML = orig;
      btn.classList.remove('copying');
    },1000);
  }
  // ── Back to Top ──
  function initBackToTop(){
    if(document.querySelector('.back-to-top')) return;
    var btn = document.createElement('button');
    btn.className = 'back-to-top';
    btn.innerHTML = '↑';
    btn.onclick = function(){
      window.scrollTo({top:0,behavior:'smooth'});
      var dc = document.querySelector('.dash-content');
      if(dc) dc.scrollTo({top:0,behavior:'smooth'});
    };
    document.body.appendChild(btn);
    // Listen on the scrollable container (window or .dash-content)
    function onScroll(){
      var scrollY = window.scrollY || (document.querySelector('.dash-content') || {}).scrollTop || 0;
      btn.classList.toggle('visible', scrollY > 400);
    }
    window.addEventListener('scroll', onScroll);
    // Also listen on dash-content for dashboard pages
    var dc = document.querySelector('.dash-content');
    if(dc) dc.addEventListener('scroll', onScroll);
  }
  // ── Page Loading Progress ──
  function hidePageLoader(){
    var el = document.querySelector('.page-loader');
    if(!el) return;
    var bar = el.querySelector('.loader-bar');
    if(bar){bar.style.width='100%';setTimeout(function(){el.classList.remove('active');if(bar)bar.style.width='0%'},400)}
    else{el.classList.remove('active')}
  }
  // ── Skeleton Loading ──
  // ── Price Calculator ──
  function initPriceCalculator(){
    var container = document.getElementById('priceCalculator');
    if(!container) return;
    var fallbackRates = {USD:1,NGN:1540,GHS:15.2,KES:129,GBP:0.79};
    container.innerHTML = '<div class="calculator-card"><h3 style="font-size:1rem;font-weight:600;margin-bottom:0.5rem;color:var(--text)"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="stroke:var(--primary-hover);vertical-align:middle;margin-right:6px"><circle cx="12" cy="12" r="10"/><path d="M16 8h-6a2 2 0 100 4h4a2 2 0 110 4H8"/><line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/></svg> '+t('Token Price Calculator')+'</h3><p style="font-size:0.8rem;color:var(--text-muted);margin-bottom:1rem">'+t('How many tokens for your money?')+'</p>' +
      '<div class="calc-row"><input type="number" id="calcAmount" placeholder="'+t('Enter amount')+'" min="1" value="100" oninput="window.calcUpdate()">' +
      '<select id="calcCurrency" onchange="window.calcUpdate()" style="padding:0.7rem 1rem;border-radius:var(--radius-sm);background:var(--bg-alt);border:1px solid var(--border);color:var(--text);font-size:0.9rem">' +
      Object.keys(fallbackRates).map(function(c){return '<option value="' + c + '">' + c + '</option>'}).join('') + '</select>' +
      '<span style="font-size:0.85rem;color:var(--text-muted);white-space:nowrap">= <span id="calcTokenResult" style="font-weight:700;color:var(--primary)">—</span> '+t('tokens')+'</span></div>' +
      '<div class="calc-result" id="calcResult"></div>' +
      '<div style="font-size:0.7rem;color:var(--text-muted);margin-top:0.5rem;text-align:center" id="calcRateSource">'+t('Loading live rates...')+'</div></div>';
    // Fetch live exchange rates with timeout; fall back to hardcoded rates on any failure
    window.calcRates = JSON.parse(JSON.stringify(fallbackRates));
    var sourceEl = document.getElementById('calcRateSource');
    function fetchWithTimeout(url, ms){
      var ctrl = new AbortController();
      var t = setTimeout(function(){ ctrl.abort(); }, ms || 8000);
      return fetch(url, {signal: ctrl.signal}).then(function(r){
        clearTimeout(t); return r;
      }, function(e){ clearTimeout(t); throw e; });
    }
    fetchWithTimeout('https://api.frankfurter.app/latest?from=USD')
      .then(function(r){ return r.json(); })
      .then(function(data){
        if(data && data.rates){
          window.calcRates.GBP = data.rates.GBP || fallbackRates.GBP;
          window.calcRates.USD = 1;
          // Fetch NGN from a free source
          return fetchWithTimeout('https://open.er-api.com/v6/latest/USD').then(function(r){ return r.json(); });
        }
        return null;
      }).then(function(data){
        if(data && data.rates){
          window.calcRates.NGN = data.rates.NGN || fallbackRates.NGN;
          window.calcRates.GHS = data.rates.GHS || fallbackRates.GHS;
          window.calcRates.KES = data.rates.KES || fallbackRates.KES;
        }
        if(sourceEl) sourceEl.textContent = t('💰 Live rates • 1 GT = $0.001 USD');
        window.calcUpdate();
      }).catch(function(){
        // Fallback to hardcoded rates (timeout, abort, or any fetch error)
        window.calcRates = fallbackRates;
        if(sourceEl) sourceEl.textContent = t('💰 Rates updated periodically • 1 GT = $0.001 USD');
        window.calcUpdate();
      });
    window.calcUpdate = function(){
      var amount = parseFloat(document.getElementById('calcAmount').value) || 0;
      var curr = document.getElementById('calcCurrency').value;
      var rate = window.calcRates[curr] || 1;
      var tokenPriceUSD = 0.001; // 1 token = $0.001
      var tokens = Math.floor(amount / rate / tokenPriceUSD);
      var tokenEl = document.getElementById('calcTokenResult');
      if(tokenEl) tokenEl.textContent = tokens.toLocaleString();
      var resultDiv = document.getElementById('calcResult');
      var html = '';
      Object.keys(window.calcRates).forEach(function(c){
        var displayAmt = (amount / rate * window.calcRates[c]).toFixed(c === 'USD' ? 2 : 2);
        html += '<div class="calc-currency"><div class="curr-label">' + c + '</div><div class="curr-value">' + (c === 'USD' ? '$' : '') + parseFloat(displayAmt).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2}) + '</div></div>';
      });
      resultDiv.innerHTML = html;
    };
    window.calcUpdate();
  }
  // ── Init all UI enhancements ──
  document.addEventListener('DOMContentLoaded',function(){
    initBackToTop();
    if(document.getElementById('priceCalculator')) initPriceCalculator();
    hidePageLoader();
  });
      // ── AI Chat (Homepage) ──
    let aiModel = '';
    let aiMessages = [];
    let aiCatalog = [];

    function updateAIChatControls(){
      const input=document.getElementById('aiChatInput');
      const button=document.getElementById('aiSendBtn');
      if(button) button.disabled=!!window.__aiSending||!aiModel||!input||!input.value.trim();
    }
    function aiModelRecord(modelId){
      return aiCatalog.find(function(model){return model.model_id===modelId;})||null;
    }
    function hydrateAIModelSelect(models){
      aiCatalog=Array.isArray(models)?models.filter(function(model){return model&&model.model_id;}):[];
      const select=document.getElementById('aiModelSelect');
      if(!select)return;
      const previous=select.value;
      select.textContent='';
      aiCatalog.forEach(function(model){
        const option=document.createElement('option');
        option.value=model.model_id;
        option.textContent=(model.name||model.model_id)+(model.provider?' — '+model.provider:'');
        select.appendChild(option);
      });
      if(previous&&aiCatalog.some(function(model){return model.model_id===previous;}))select.value=previous;
      select.disabled=!aiCatalog.length;
      selectAIModelDropdown(select.disabled?'':select.value);
    }
    function selectAIModelDropdown(model){
      aiModel=model||'';
      const record=aiModelRecord(aiModel);
      const badge=document.getElementById('aiModelBadge');
      if(badge) badge.textContent=record?(record.name||record.model_id):(aiModel||'Live catalog');
      updateAIChatControls();
    }
    function appendAIChatMessage(role,text,meta){
      const msgs=document.getElementById('aiChatMsgs');
      if(!msgs)return null;
      const row=document.createElement('div');
      row.className='chat-msg '+(role==='user'?'user':'ai');
      const avatar=document.createElement('div');
      avatar.className='av';
      avatar.textContent=role==='user'?'U':'GT';
      const body=document.createElement('div');
      body.className='ai-message-body';
      const bubble=document.createElement('div');
      bubble.className='bubble'+(meta&&meta.error?' ai-error':'');
      bubble.textContent=String(text||'');
      body.appendChild(bubble);
      if(meta&&meta.auth){
        const link=document.createElement('a');
        link.href='login.html?next=index.html%23ai-chat';
        link.className='ai-chat-login-link';
        link.textContent='Sign in to continue →';
        bubble.appendChild(document.createElement('br'));
        bubble.appendChild(link);
      }
      if(meta&&(meta.model||meta.tokens!=null||meta.balance!=null)){
        const details=document.createElement('div');
        details.className='ai-message-meta';
        [meta.model,meta.tokens!=null?Number(meta.tokens).toLocaleString()+' tokens':'',meta.balance!=null?Number(meta.balance).toLocaleString()+' GT left':''].filter(Boolean).forEach(function(value){
          const chip=document.createElement('span');chip.textContent=value;details.appendChild(chip);
        });
        body.appendChild(details);
      }
      row.appendChild(avatar);
      row.appendChild(body);
      msgs.appendChild(row);
      msgs.scrollTop=msgs.scrollHeight;
      return row;
    }
    function resetAIChat(){
      if(window.__aiSending)return;
      aiMessages=[];
      const msgs=document.getElementById('aiChatMsgs');
      if(!msgs)return;
      msgs.querySelectorAll('.chat-msg').forEach(function(message){message.remove();});
      const welcome=document.getElementById('aiWelcome');
      if(welcome)welcome.style.display='flex';
      const input=document.getElementById('aiChatInput');
      if(input){input.value='';input.style.height='';}
      updateAIChatControls();
    }
    async function sendAIChatMsg(){
      if(window.__aiSending)return;
      const input=document.getElementById('aiChatInput');
      const msg=input&&input.value?input.value.trim():'';
      if(!msg||!aiModel)return;
      window.__aiSending=true;
      updateAIChatControls();
      const msgs=document.getElementById('aiChatMsgs');
      const welcome=document.getElementById('aiWelcome');
      if(welcome)welcome.style.display='none';
      appendAIChatMessage('user',msg);
      aiMessages.push({role:'user',content:msg});
      input.value='';
      input.style.height='';
      if(msgs)msgs.setAttribute('aria-busy','true');
      const typing=appendAIChatMessage('assistant','Routing through the live gateway…');
      if(typing)typing.classList.add('ai-chat-pending');
      try{
        const data=await api('POST','/api/proxy/chat',{
          model:aiModel,
          messages:aiMessages.slice(-20),
          max_tokens:1024,
          temperature:0.7
        },120000);
        if(typing)typing.remove();
        const content=data&&data.choices&&data.choices[0]&&data.choices[0].message?data.choices[0].message.content:data&&data.response;
        const response=Array.isArray(content)?content.map(function(part){return typeof part==='string'?part:(part&&part.text)||'';}).join('\n'):String(content||'The gateway returned an empty response.');
        aiMessages.push({role:'assistant',content:response});
        appendAIChatMessage('assistant',response,{model:data.selected_model||data.model||aiModel,tokens:data.tokens_used,balance:data.balance_remaining});
      }catch(error){
        if(typing)typing.remove();
        aiMessages.pop();
        const message=error&&error.message?error.message:'The gateway could not complete this request.';
        const auth=/not authenticated|session expired|unauthorized/i.test(message);
        appendAIChatMessage('assistant',auth?'Sign in to chat with live models. Requests use your GlbTOKEN balance.':message,{error:true,auth:auth});
      }finally{
        window.__aiSending=false;
        if(msgs)msgs.setAttribute('aria-busy','false');
        updateAIChatControls();
        if(window.innerWidth<=768&&input)requestAnimationFrame(function(){input.focus({preventScroll:true});});
      }
    }
    window.selectAIModelDropdown=selectAIModelDropdown;
    window.sendAIChatMsg=sendAIChatMsg;
    window.resetAIChat=resetAIChat;
    document.addEventListener('glbtoken:catalog',function(event){
      hydrateAIModelSelect(event.detail&&event.detail.models);
    });

    function tmDragStart(clientX){
      tmDragStartX=clientX;
      tmDragOffset=0;
      tmIsDragging=true;
      var track=document.getElementById('tmTrack');
      if(track) track.style.transition='none';
    }
    function tmDragMove(clientX){
      if(!tmIsDragging)return;
      tmDragOffset=clientX-tmDragStartX;
      var track=document.getElementById('tmTrack');
      if(!track)return;
      // Only block text selection once actual drag movement starts
      if(Math.abs(tmDragOffset)>3){document.body.style.userSelect='none';document.body.style.webkitUserSelect='none'}
      track.style.transform='translateX(calc(-'+(tmIndex*100)+'% + '+tmDragOffset+'px))';
    }
    function tmDragEnd(clientX){
      if(!tmIsDragging){tmIsDragging=false;return}
      tmIsDragging=false;
      document.body.style.userSelect='';
      document.body.style.webkitUserSelect='';
      var track=document.getElementById('tmTrack');
      if(track) track.style.transition='';
      if(Math.abs(tmDragOffset)>40) slideTopView(tmDragOffset<0?1:-1);
      else slideTopView(0); // snap back
      tmDragOffset=0;
      resumeAutoSlide();
    }
    document.addEventListener('DOMContentLoaded',()=>{
      const track=document.getElementById('tmTrack');
      if(!track)return;
      // Touch events
      track.addEventListener('touchstart',e=>{
        tmTouchStartX=e.touches[0].clientX;tmTouchStartY=e.touches[0].clientY;
        tmDragStart(e.touches[0].clientX);
      },{passive:true});
      track.addEventListener('touchmove',e=>{
        const dy=Math.abs(e.touches[0].clientY-tmTouchStartY);
        const dx=Math.abs(e.touches[0].clientX-tmTouchStartX);
        if(dx>dy&&dx>10){e.preventDefault();tmDragMove(e.touches[0].clientX)}
      },{passive:false});
      track.addEventListener('touchend',e=>{
        tmDragEnd(e.changedTouches[0].clientX);
      });
      // Mouse events (desktop drag)
      track.addEventListener('mousedown',e=>{
        tmTouchStartX=e.clientX;tmTouchStartY=e.clientY;
        tmDragStart(e.clientX);
      });
      document.addEventListener('mousemove',e=>{
        if(!tmIsDragging)return;
        tmDragMove(e.clientX);
      });
      document.addEventListener('mouseup',e=>{
        if(!tmIsDragging)return;
        tmDragEnd(e.clientX);
      });
      // Safety: release drag if window loses focus (prevents stuck drag)
      window.addEventListener('blur',function(){
        if(tmIsDragging){tmIsDragging=false;document.body.style.userSelect='';document.body.style.webkitUserSelect=''}
      });
      tmInterval=setInterval(()=>slideTopView(1),5000);
      // Initial title via t() — tmTitle is .notranslate so translatePage skips it;
      // set it once here (carousel slides re-set it in slideTopView).
      var t0=document.getElementById('tmTitle');
      if(t0)t0.textContent=t(tmTitles[0],tmTitles[0]);
      // Initial load: refresh top model cards (replaces hardcoded HTML)
      refreshTopModels();
    });
    // Delegate clicks on key action buttons (avoid inline onclick XSS).
    // Attached OUTSIDE the #tmTrack-gated block above so Pause/Delete work
    // on every page (manage-keys.html has no #tmTrack).
    document.addEventListener('click',function(e){
      const btn=e.target.closest('[data-key-id]');
      if(!btn)return;
      const id=Number(btn.dataset.keyId);
      if(btn.dataset.action==='toggle')toggleKeyStatus(id);
      else if(btn.dataset.action==='delete')deleteKey(id);
    });
/* ══════════════════════════════════════════
   UI — Language & Theme
   ══════════════════════════════════════════ */
function toggleLangMenu() {
  var m = document.getElementById('langMenu');
  if (m) m.classList.toggle('open');
}
function toggleDropdown(){
  var ud = document.getElementById('userDropdown');
  if (ud) ud.classList.toggle('open');
}
document.addEventListener('click', function(e) {
  var dd = document.getElementById('userDropdown');
  if (dd && dd.classList.contains('open') && !e.target.closest('.nav-avatar')) dd.classList.remove('open');
});
document.addEventListener('click', function(e) {
  if (!e.target.closest('.lang-selector') && !e.target.closest('.lang-menu') && !e.target.closest('.lang-btn-mobile')) {
    var m = document.getElementById('langMenu');
    if (m) m.classList.remove('open');
  }
});

// ── Mobile Keyboard Fix: keep chat input visible above keyboard ──
(function(){
  if(!window.visualViewport) return;
  var kbdPadding = 0;
  var chatBottomDefault = null;
  function adjustForKeyboard(){
    var vh = window.visualViewport.height;
    var winH = window.innerHeight;
    var diff = winH - vh;
    if(diff > 80){
      kbdPadding = diff;
      // Bring input above keyboard by adjusting bottom position
      // (Chrome/Safari don't push fixed elements above keyboard like Firefox does)
      var cw = document.getElementById('chatWindow');
      if(cw){
        if(chatBottomDefault === null) chatBottomDefault = cw.style.bottom || '';
        cw.style.bottom = (diff + 10) + 'px';
        // Use measured visual height (layout - keyboard), NOT 100dvh: dvh already
        // shrinks with the keyboard on mobile → calc(100dvh - diff) double-shrinks
        // and makes the chat box tiny with a huge gap below it.
        var cwH = Math.max(160, (window.innerHeight - diff) - 80);
        cw.style.height = cwH + 'px';
        cw.style.maxHeight = cwH + 'px';
        var msgs = cw.querySelector('.chat-msgs');
        if(msgs) setTimeout(function(){ msgs.scrollTop = msgs.scrollHeight; }, 100);
      }
      var focused = document.querySelector('.ai-chat-section.chat-focused');
      if(focused){
        focused.style.bottom = (diff + 10) + 'px';
        var inner = focused.querySelector('.ai-chat-inner');
        if(inner){
          // Pixel-based, same reason as above: 100dvh already excludes the
          // keyboard on mobile so subtracting diff again leaves a wide gap
          // below the input (was ~170px on a 390px phone).
          var visH = window.innerHeight - diff;
          var h = Math.max(200, visH - 40);
          inner.style.maxHeight = h + 'px';
          inner.style.height = h + 'px';
        }
        var chatMsgs = focused.querySelector('.chat-msgs');
        if(chatMsgs) setTimeout(function(){ chatMsgs.scrollTop = chatMsgs.scrollHeight; }, 100);
      }
      // Ensure input is scrolled into view
      setTimeout(function(){
        var input = document.getElementById('chatInput') || document.getElementById('aiChatInput');
        if(input && document.activeElement === input) input.scrollIntoView({block:'nearest'});
      }, 200);
    } else if(kbdPadding > 0){
      kbdPadding = 0;
      var cw2 = document.getElementById('chatWindow');
      if(cw2){
        cw2.style.bottom = chatBottomDefault || '';
        cw2.style.maxHeight = ''; cw2.style.height = '';
        chatBottomDefault = null;
      }
      var focused2 = document.querySelector('.ai-chat-section.chat-focused');
      if(focused2){
        focused2.style.bottom = '';
        var inner2 = focused2.querySelector('.ai-chat-inner');
        if(inner2){ inner2.style.maxHeight = ''; inner2.style.height = ''; }
      }
    }
  }
  window.visualViewport.addEventListener('resize', adjustForKeyboard);
  // Also handle on focus — double-tap input to scroll it into view
  document.addEventListener('focusin', function(e){
    var tag = e.target && e.target.tagName;
    if((tag === 'INPUT' || tag === 'TEXTAREA') && window.innerWidth <= 768){
      if(e.target.id === 'chatInput' || e.target.id === 'aiChatInput'){
        // Re-measure in case keyboard just opened
        setTimeout(adjustForKeyboard, 50);
        setTimeout(function(){
          e.target.scrollIntoView({block:'nearest'});
          var msgs = e.target.closest('.chat-msgs') || e.target.closest('.ai-chat-main');
          if(msgs) msgs.scrollTop = msgs.scrollHeight;
        }, 350);
      }
    }
  });
})();

// ── Auto-init auth UI on every page load (deferred so nav.js has injected HTML) ──
document.addEventListener('DOMContentLoaded', function(){
  // Access token is memory-only (shared.js restores it via silent refresh).
  // Here we restore only the USER PROFILE for nav/UI; `token` is owned by shared.js.
  var rt = window.__secure ? window.__secure.getItem('gt_refresh_token') : localStorage.getItem('gt_refresh_token');
  if(rt){
    try{var ud = JSON.parse((window.__secure ? window.__secure.getItem('gt_user') : localStorage.getItem('gt_user')) || '{}');}catch(e){ud={};}
    userData = ud;
    if(typeof applyAuth === 'function') applyAuth();
  }
});

/* ══════════════════════════════════════════
   Chat — Support & AI (shared across all pages)
   ══════════════════════════════════════════ */
function setupTextareaResize(id){
  const ta = document.getElementById(id);
  if(!ta) return;
  ta.addEventListener('input', function(){
    this.style.height = 'auto';
    this.style.height = Math.min(this.scrollHeight, 120) + 'px';
  });
}
function addCloseBtn(container, onClose){
  if(container.querySelector('.chat-focused-close')) return;
  const btn = document.createElement('button');
  btn.className = 'chat-focused-close';
  btn.innerHTML = '✕';
  btn.onclick = onClose;
  container.appendChild(btn);
}
function removeCloseBtn(container){
  const btn = container.querySelector('.chat-focused-close');
  if(btn) btn.remove();
}
function lockBodyScroll(hide){
  if(hide){
    var fab = document.querySelector('.chat-fab');
    if(fab) fab.style.display = 'none';
    // Lock page scroll while the chat overlay is open so the content behind
    // can't scroll into view and create a "pushed down / big gap" look.
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
  } else {
    var fab = document.querySelector('.chat-fab');
    if(fab) fab.style.display = '';
    document.body.style.overflow = '';
    document.documentElement.style.overflow = '';
  }
}
// ── Mobile AI Chat popup ──
function openMobileChat(){
  if(window.innerWidth>768)return;
  const section=document.querySelector('.ai-chat-section');
  if(!section) return;
  // ⚠️ Idempotency guard — CRITICAL for keyboard retention on iOS.
  // focus() on the textarea fires this handler again (sendAIChatMsg refocuses
  // after send). Re-adding .chat-focused / lockBodyScroll / forcing reflow
  // dismisses the soft keyboard. If we're already in popup mode, do nothing.
  if(section.classList.contains('chat-focused')) return;
  // Close support chat first if open
  if(document.getElementById('chatWindow').classList.contains('chat-focused')){
    closeMobileSupportChat();
  }
  section.classList.add('chat-focused');
  // Hide back-to-top while AI chat is open
  var btt = document.querySelector('.back-to-top');
  if(btt) btt.style.display = 'none';
  void section.offsetHeight;
  addCloseBtn(section.querySelector('.chat-header'), closeMobileChat);
  lockBodyScroll(true);
  // CSS rule handles hiding support chat: .ai-chat-section.chat-focused ~ .chat-window
  requestAnimationFrame(()=>{
    const msgs=document.getElementById('aiChatMsgs');
    if(msgs) msgs.scrollTop=msgs.scrollHeight;
  });
  // VisualViewport: keep AI chat section filling visible area
  if(window.visualViewport && !window._aiChatVpHandler){
    window._aiChatVpHandler = function(){
      var sec = document.querySelector('.ai-chat-section.chat-focused');
      if(sec) sec.style.minHeight = window.visualViewport.height + 'px';
    };
    window.visualViewport.addEventListener('resize', window._aiChatVpHandler);
  }
}
function closeMobileChat(){
  const section=document.querySelector('.ai-chat-section');
  if(!section) return;
  section.classList.remove('chat-focused');
  // Restore back-to-top visibility
  var btt = document.querySelector('.back-to-top');
  if(btt) btt.style.display = '';
  lockBodyScroll(false);
  removeCloseBtn(section.querySelector('.chat-header'));
  // Clean up VisualViewport handler for AI chat
  if(window.visualViewport && window._aiChatVpHandler){
    window.visualViewport.removeEventListener('resize', window._aiChatVpHandler);
    window._aiChatVpHandler = null;
  }
}
// ── Support Chat ──
function toggleChat(){
  const win = document.getElementById('chatWindow');
  if(!win) return;
  if(window.innerWidth > 768){
    win.classList.toggle('open');
    win.setAttribute('aria-hidden',win.classList.contains('open')?'false':'true');
    // Hide back-to-top when chat is open on desktop
    var btt = document.querySelector('.back-to-top');
    if(btt) btt.style.display = win.classList.contains('open') ? 'none' : '';
    return;
  }
  // Mobile: use chat-focused (not 'open')
  if(win.classList.contains('chat-focused')){
    closeMobileSupportChat();
  } else {
    openMobileSupportChat();
  }
}
function openMobileSupportChat(){
  const win = document.getElementById('chatWindow');
  // Close AI chat first if open
  const aiSection=document.querySelector('.ai-chat-section.chat-focused');
  if(aiSection) closeMobileChat();
  win.classList.add('chat-focused');
  win.setAttribute('aria-hidden','false');
  // Hide back-to-top while chat is open
  var btt = document.querySelector('.back-to-top');
  if(btt) btt.style.display = 'none';
  // Backdrop wraps the window (same flexbox centering as AI chat)
  const backdrop = document.createElement('div');
  backdrop.className = 'support-chat-backdrop';
  backdrop.onclick = function(e){ if(e.target===backdrop) closeMobileSupportChat(); };
  win.parentNode.insertBefore(backdrop, win);
  backdrop.appendChild(win);
  addCloseBtn(win.querySelector('.chat-header'), closeMobileSupportChat);
  lockBodyScroll(true);
  // Auto-focus textarea so keyboard pops up
  setTimeout(()=>{
    const input = document.getElementById('chatInput');
    if(input) input.focus();
  }, 200);
  requestAnimationFrame(()=>{
    const msgs = document.getElementById('chatMsgs');
    if(msgs) msgs.scrollTop = msgs.scrollHeight;
  });
  // VisualViewport: keep backdrop filling visible area (no overflow change)
  if(window.visualViewport && !window._supportChatVpHandler){
    window._supportChatVpHandler = function(){
      var bd = document.querySelector('.support-chat-backdrop');
      if(bd) bd.style.minHeight = window.visualViewport.height + 'px';
    };
    window.visualViewport.addEventListener('resize', window._supportChatVpHandler);
  }
}
function closeMobileSupportChat(){
  const win = document.getElementById('chatWindow');
  if(!win) return;
  win.classList.remove('chat-focused');
  win.setAttribute('aria-hidden','true');
  // Restore back-to-top visibility
  var btt = document.querySelector('.back-to-top');
  if(btt) btt.style.display = '';
  const backdrop = document.querySelector('.support-chat-backdrop');
  if(backdrop){
    backdrop.parentNode.insertBefore(win, backdrop);
    backdrop.remove();
  }
  removeCloseBtn(win.querySelector('.chat-header'));
  lockBodyScroll(false);
  // Clean up VisualViewport handler for support chat
  if(window.visualViewport && window._supportChatVpHandler){
    window.visualViewport.removeEventListener('resize', window._supportChatVpHandler);
    window._supportChatVpHandler = null;
  }
}
// ── Draggable Chat FAB (mobile touch) ──
(function(){
  var fab = document.querySelector('.chat-fab');
  if(!fab) return;
  // Initialize inline position from CSS so first touch doesn't snap to right
  if(!fab.style.left || fab.style.left === 'auto' || fab.style.left === ''){
    var cs = window.getComputedStyle(fab);
    if(cs.left && cs.left !== 'auto') fab.style.left = cs.left;
    if(cs.top && cs.top !== 'auto') fab.style.top = cs.top;
  }
  var stored = localStorage.getItem('fab_pos');
  if(stored){var p = stored.split(',');fab.style.bottom='auto';fab.style.right='auto';fab.style.left=p[0]+'px';fab.style.top=p[1]+'px'}
  var startX, startY, startL, startT, moved = false, THRESHOLD = 10;
  function onStart(e){
    var t = e.touches[0];
    startX = t.clientX; startY = t.clientY;
    startL = parseInt(fab.style.left) || window.innerWidth - fab.offsetWidth - 24;
    startT = parseInt(fab.style.top) || window.innerHeight - fab.offsetHeight - 24;
    moved = false;
    fab.style.transition = 'none';
    fab.style.bottom = 'auto'; fab.style.right = 'auto';
    fab.style.left = startL + 'px'; fab.style.top = startT + 'px';
  }
  function onMove(e){
    var t = e.touches[0];
    var dx = t.clientX - startX, dy = t.clientY - startY;
    if(Math.abs(dx) < THRESHOLD && Math.abs(dy) < THRESHOLD) return;
    moved = true;
    e.preventDefault();
    fab.style.left = Math.max(0, Math.min(window.innerWidth - fab.offsetWidth, startL + dx)) + 'px';
    fab.style.top = Math.max(0, Math.min(window.innerHeight - fab.offsetHeight, startT + dy)) + 'px';
  }
  function onEnd(){
    fab.style.transition = '';
    if(moved){
      var l = parseInt(fab.style.left) || 0;
      var w = window.innerWidth;
      var snap = l < w / 2 ? 16 : w - fab.offsetWidth - 16;
      fab.style.left = snap + 'px';
      localStorage.setItem('fab_pos', snap + ',' + (parseInt(fab.style.top) || window.innerHeight - fab.offsetHeight - 24));
    }
  }
  fab.addEventListener('touchstart', onStart, {passive:true});
  fab.addEventListener('touchmove', onMove, {passive:false});
  fab.addEventListener('touchend', onEnd);
})();
var _sendingMsg = false;
function supportAnswer(message){
  var text=String(message||'').toLowerCase();
  if(/api.?key|secret|credential|rotate|revoke/.test(text))return {text:'Create, label, copy, rotate, and revoke keys from API Keys. A secret is shown only once, so store it securely and never place it in browser code.',label:'Open API Keys',href:'manage-keys.html'};
  if(/model|provider|catalog|openai|claude|gemini|deepseek/.test(text))return {text:'The Models page is the source of truth for active model IDs, providers, context limits, and prices. The Playground loads that same live catalog.',label:'Browse live models',href:'models.html'};
  if(/bill|payment|paystack|stripe|crypto|token|balance|top.?up|refund/.test(text))return {text:'Buy Tokens shows the available packages and payment methods. Billing records completed and pending transactions. If a payment completed but your balance did not update, contact support with the payment reference—never send a card number or API key.',label:'Open Billing',href:'billing.html'};
  if(/playground|prompt|temperature|fallback|route|test/.test(text))return {text:'Use the Playground to choose a live model, tune parameters, add ordered fallbacks, inspect the generated request, and save successful runs. Playground requests use your balance and appear in logs.',label:'Open Playground',href:'playground.html'};
  if(/usage|log|request|latency|error|failed|status/.test(text))return {text:'Usage shows spend and model trends; Logs is the best place to inspect request status, latency, token counts, cost, and errors. Start with the newest failed request and confirm its model ID is still active.',label:'Inspect Logs',href:'logs.html'};
  if(/login|register|sign.?in|password|account|security|2fa|verification/.test(text))return {text:'Use Login or Account Settings for access and security. Never share passwords, verification codes, API secrets, or full payment details in this chat.',label:'Account Settings',href:'settings.html'};
  if(/human|agent|email|contact|support|help/.test(text))return {text:'For account-specific help, use the contact form or email support@glbtoken.com. This assistant does not create a ticket or send your message automatically.',label:'Contact support',href:'contact.html'};
  return {text:'I can guide you through API keys, live models, Playground routes, billing, usage, logs, and account access. For account-specific help, use the contact form; this chat does not submit a support ticket.',label:'View help center',href:'faq.html'};
}
function appendSupportMessage(role,text,action){
  var msgs=document.getElementById('chatMsgs');if(!msgs)return null;
  var row=document.createElement('div');row.className='chat-msg '+(role==='user'?'user':'ai');
  var av=document.createElement('div');av.className='av';av.textContent=role==='user'?'U':'GT';
  var bubble=document.createElement('div');bubble.className='bubble';bubble.textContent=text;
  if(action&&action.href){
    var link=document.createElement('a');link.className='support-chat-link';link.href=action.href;link.textContent=action.label||'Learn more';bubble.appendChild(link);
  }
  row.appendChild(av);row.appendChild(bubble);msgs.appendChild(row);msgs.scrollTop=msgs.scrollHeight;return row;
}
function updateSupportSendButton(){
  var input=document.getElementById('chatInput');var button=document.getElementById('chatSendBtn');
  if(button)button.disabled=_sendingMsg||!input||!input.value.trim();
}
function sendChatMsg(inputOverride){
  if(_sendingMsg)return;
  var input=inputOverride||document.getElementById('chatInput');
  var msg=input&&input.value?input.value.trim():'';if(!msg)return;
  _sendingMsg=true;updateSupportSendButton();appendSupportMessage('user',msg);
  input.value='';input.style.height='';saveChatHistory();
  var pending=appendSupportMessage('ai','Finding the best place to help…');if(pending)pending.classList.add('support-chat-pending');
  setTimeout(function(){
    if(pending)pending.remove();
    var answer=supportAnswer(msg);appendSupportMessage('ai',answer.text,answer);saveChatHistory();
    _sendingMsg=false;updateSupportSendButton();
    if(window.innerWidth<=768&&input)requestAnimationFrame(function(){input.focus({preventScroll:true});});
  },320);
}
// ── Chat History Persistence (localStorage) ──
function saveChatHistory(){
  var msgs=document.getElementById('chatMsgs');
  if(!msgs)return;
  var chatHistory=[];
  msgs.querySelectorAll('.chat-msg').forEach(function(el){
    var role=el.classList.contains('user')?'user':'ai';
    var bubble=el.querySelector('.bubble');
    if(bubble){
      var first=bubble.firstChild;
      chatHistory.push({role:role,text:first&&first.nodeType===3?first.nodeValue:bubble.textContent});
    }
  });
  try{localStorage.setItem('gt_support_history_v2',JSON.stringify(chatHistory))}catch(e){}
}
function loadChatHistory(){
  var msgs=document.getElementById('chatMsgs');
  if(!msgs)return;
  try{
    var data=localStorage.getItem('gt_support_history_v2');
    if(!data)return;
    var chatHistory=JSON.parse(data);
    if(!chatHistory||!chatHistory.length)return;
    msgs.innerHTML='';
    chatHistory.forEach(function(h){
      var cls=h.role==='user'?'user':'ai';
      var av=h.role==='user'?'U':'GT';
      msgs.innerHTML+='<div class="chat-msg '+cls+'"><div class="av">'+av+'</div><div class="bubble">'+escapeHtml(h.text)+'</div></div>';
    });
    msgs.scrollTop=msgs.scrollHeight;
  }catch(e){}
}
function enhanceSupportChat(){
  var win=document.getElementById('chatWindow');
  if(!win)return;
  win.setAttribute('role','dialog');
  win.setAttribute('aria-label','GlbTOKEN support assistant');
  win.setAttribute('aria-hidden',win.classList.contains('open')||win.classList.contains('chat-focused')?'false':'true');
  var fab=document.querySelector('.chat-fab');
  if(fab){fab.setAttribute('aria-label','Open GlbTOKEN support');fab.title='Support';fab.innerHTML='<span aria-hidden="true">?</span>';}
  var header=win.querySelector('.chat-header');
  if(header&&!header.querySelector('.support-chat-status')){
    var heading=header.querySelector('h3');
    if(heading){
      heading.textContent='GlbTOKEN Support';
      var group=document.createElement('div');
      heading.parentNode.insertBefore(group,heading);group.appendChild(heading);
      var status=document.createElement('span');status.className='support-chat-status';status.innerHTML='<i></i> Self-service assistant';group.appendChild(status);
    }
  }
  var close=win.querySelector('#chatStaticClose');if(close)close.setAttribute('aria-label','Close support');
  var msgs=document.getElementById('chatMsgs');if(msgs)msgs.setAttribute('aria-live','polite');
  var input=document.getElementById('chatInput');if(input){input.placeholder='Ask about keys, models, billing…';input.setAttribute('aria-label','Support question');}
  var send=document.getElementById('chatSendBtn');if(send)send.setAttribute('aria-label','Send support question');
  if(!win.querySelector('.support-chat-quick')){
    var quick=document.createElement('div');quick.className='support-chat-quick';quick.setAttribute('aria-label','Common support topics');
    [['API keys','How do API keys work?'],['Models','Which models are available?'],['Billing','Help with billing'],['Request errors','How do I debug a failed request?']].forEach(function(item){
      var button=document.createElement('button');button.type='button';button.textContent=item[0];
      button.addEventListener('click',function(){if(input){input.value=item[1];updateSupportSendButton();sendChatMsg(input);}});quick.appendChild(button);
    });
    var composer=win.querySelector('.chat-input');if(composer)win.insertBefore(quick,composer);
  }
}
// Load chat history on page load
if(document.readyState==='loading'){
  document.addEventListener('DOMContentLoaded',loadChatHistory);
} else {
  loadChatHistory();
}

// ── Dashboard Sidebar Toggle ──
function toggleDashSidebar() {
  var sb = document.getElementById('dashSidebar');
  var toggle = document.getElementById('dashSidebarToggle');
  if(!sb) return;
  var isOpen = sb.classList.toggle('open');
  if(toggle) toggle.classList.toggle('hidden', isOpen);
}

// ── Auto-init chat textarea resize / focus listeners ──
document.addEventListener('DOMContentLoaded',function(){
  setupTextareaResize('aiChatInput');
  setupTextareaResize('chatInput');
  const ta = document.getElementById('aiChatInput');
  if(ta){
    ta.addEventListener('focus',openMobileChat);
    ta.addEventListener('input',updateAIChatControls);
  }
  var supportInput=document.getElementById('chatInput');
  if(supportInput)supportInput.addEventListener('input',updateSupportSendButton);
  enhanceSupportChat();
  updateAIChatControls();
  updateSupportSendButton();
});

/* ══════════════════════════════════════════
   Swipe — dash sidebar open/close (mobile + desktop)
   ══════════════════════════════════════════ */
(function(){
  const THRESHOLD=40; // px to trigger open/close
  const EDGE_ZONE=40; // px from left edge for open gesture
  var startX=0,startY=0,swiping=false;
  var sb=null;
  function getSidebar(){return document.getElementById('dashSidebar')}
  function isOpen(){var s=getSidebar();return s&&s.classList.contains('open')}
  
  // Lock/unlock body scroll when sidebar opens/closes (covers both swipe & button click)
  function lockScroll(lock){
    document.body.style.overflow=lock?'hidden':'';
    if(lock) document.body.style.position='fixed';
    else document.body.style.position='';
  }
  // Watch for class changes on sidebar via MutationObserver (catches toggleDashSidebar clicks)
  var obs=new MutationObserver(function(){
    var s=getSidebar();
    if(!s)return;
    lockScroll(s.classList.contains('open'));
  });
  document.addEventListener('DOMContentLoaded',function(){
    var s=getSidebar();
    if(s){
      obs.observe(s,{attributes:true,attributeFilter:['class']});
      // Block browser back/forward swipe on dash pages
      document.documentElement.style.touchAction='pan-y';
      document.body.style.touchAction='pan-y';
    }
  });
  
  // ── Touch events (mobile) ──
  document.addEventListener('touchstart',function(e){
    sb=getSidebar();
    if(!sb)return;
    var t=e.touches[0];
    startX=t.clientX;startY=t.clientY;
    swiping=true;
    if(startX<=EDGE_ZONE){
      e.preventDefault();
      // If touching the toggle button, toggle sidebar directly
      if(e.target.closest('#dashSidebarToggle')){
        toggleDashSidebar();
        swiping=false;
        return;
      }
    }
  },{passive:false});
  document.addEventListener('touchmove',function(e){
    if(!swiping||!sb)return;
    var t=e.touches[0];
    var dx=t.clientX-startX;
    var dy=t.clientY-startY;
    if(Math.abs(dx)<Math.abs(dy))return;
    if(!isOpen()&&startX<=EDGE_ZONE&&dx>THRESHOLD){
      e.preventDefault();
      sb.classList.add('open');
      var toggle=document.getElementById('dashSidebarToggle');
      if(toggle)toggle.classList.add('hidden');
      swiping=false;
      return;
    }
    if(isOpen()&&dx<-THRESHOLD){
      e.preventDefault();
      sb.classList.remove('open');
      var toggle=document.getElementById('dashSidebarToggle');
      if(toggle)toggle.classList.remove('hidden');
      swiping=false;
      return;
    }
    if(isOpen()&&Math.abs(dx)>10){
      e.preventDefault();
    }
  },{passive:false});
  document.addEventListener('touchend',function(){
    swiping=false;
  },{passive:true});
  
  // ── Mouse events (desktop drag from left edge) ──
  document.addEventListener('mousedown',function(e){
    sb=getSidebar();
    if(!sb||e.button!==0)return;
    startX=e.clientX;startY=e.clientY;
    swiping=(startX<=EDGE_ZONE);
  });
  document.addEventListener('mousemove',function(e){
    if(!swiping||!sb)return;
    var dx=e.clientX-startX;
    if(!isOpen()&&startX<=EDGE_ZONE&&dx>THRESHOLD){
      sb.classList.add('open');
      var toggle=document.getElementById('dashSidebarToggle');
      if(toggle)toggle.classList.add('hidden');
      swiping=false;
      return;
    }
    if(isOpen()&&dx<-THRESHOLD){
      sb.classList.remove('open');
      var toggle=document.getElementById('dashSidebarToggle');
      if(toggle)toggle.classList.remove('hidden');
      swiping=false;
      return;
    }
  });
  document.addEventListener('mouseup',function(){
    swiping=false;
  });
})();

/* ══════════════════════════════════════════
   UI Dialogs — Toast, Confirm, Alert, Prompt, Session Expired
   ══════════════════════════════════════════ */
function showToast(msg,type){
  var t=document.getElementById('toast');
  if(!t){t=document.createElement('div');t.id='toast';document.body.appendChild(t)}
  t.textContent=msg;t.className='toast '+(type||'info');t.classList.add('show');
  clearTimeout(t._timeout);t._timeout=setTimeout(function(){t.classList.remove('show')},3000);
}
function showConfirm(title, msg, onConfirm, confirmText){
  confirmText = confirmText || 'Confirm';
  var existing=document.getElementById('confirmModal');
  if(existing)existing.remove();
  var m=document.createElement('div');
  m.id='confirmModal';
  m.style.cssText='position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.5);animation:fadeIn 0.15s ease';
  var theme=document.documentElement.className;
  var isDark=theme==='dark';
  var cardBg=isDark?'#1e1f29':'#ffffff';
  var textClr=isDark?'#f8f8f2':'#1a1a2e';
  var muted=isDark?'#6272a4':'#666';
  var border=isDark?'#3a3a4e':'#ddd';
  m.innerHTML='<div style="background:'+cardBg+';border:1px solid '+border+';border-radius:16px;padding:2rem;max-width:360px;width:90%;box-shadow:0 16px 48px rgba(0,0,0,0.3);text-align:center;animation:slideUp 0.2s ease">'
    +'<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="stroke:var(--primary);margin-bottom:0.75rem"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>'
    +'<h3 style="color:'+textClr+';font-size:1.1rem;font-weight:700;margin:0 0 0.5rem">'+escapeHtml(title)+'</h3>'
    +'<p style="color:'+muted+';font-size:0.85rem;margin:0 0 1.5rem;line-height:1.5">'+escapeHtml(msg)+'</p>'
    +'<div style="display:flex;gap:0.75rem">'
    +'<button id="confirmCancelBtn" style="flex:1;padding:0.65rem;border-radius:10px;border:1px solid '+border+';background:transparent;color:'+textClr+';font-size:0.85rem;font-weight:500;cursor:pointer">Cancel</button>'
    +'<button id="confirmOkBtn" style="flex:1;padding:0.65rem;border-radius:10px;border:none;background:var(--primary);color:#0A0B14;font-size:0.85rem;font-weight:600;cursor:pointer">'+escapeHtml(confirmText)+'</button>'
    +'</div></div>';
  document.body.appendChild(m);
  if(!document.getElementById('confirmModalStyle')){
    var s=document.createElement('style');s.id='confirmModalStyle';
    s.textContent='@keyframes fadeIn{from{opacity:0}to{opacity:1}}@keyframes slideUp{from{transform:translateY(20px);opacity:0}to{transform:translateY(0);opacity:1}}';
    document.head.appendChild(s);
  }
  document.getElementById('confirmCancelBtn').onclick=function(){m.remove()};
  document.getElementById('confirmOkBtn').onclick=function(){m.remove();if(onConfirm)onConfirm()};
  m.onclick=function(e){if(e.target===m)m.remove()};
}
function showPrompt(title, placeholder, onSubmit, initialValue){
  var existing=document.getElementById('promptModal');
  if(existing)existing.remove();
  var m=document.createElement('div');
  m.id='promptModal';
  m.style.cssText='position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.5);animation:fadeIn 0.15s ease';
  var theme=document.documentElement.className;
  var isDark=theme==='dark';
  var cardBg=isDark?'#1e1f29':'#ffffff';
  var textClr=isDark?'#f8f8f2':'#1a1a2e';
  var muted=isDark?'#6272a4':'#666';
  var border=isDark?'#3a3a4e':'#ddd';
  m.innerHTML='<div style="background:'+cardBg+';border:1px solid '+border+';border-radius:16px;padding:2rem;max-width:380px;width:90%;box-shadow:0 16px 48px rgba(0,0,0,0.3);text-align:center;animation:slideUp 0.2s ease">'
    +'<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="stroke:var(--primary);margin-bottom:0.75rem"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>'
    +'<h3 style="color:'+textClr+';font-size:1.1rem;font-weight:700;margin:0 0 0.5rem">'+escapeHtml(title)+'</h3>'
    +'<input id="promptInput" type="text" placeholder="'+escapeAttr(placeholder||'')+'" style="width:100%;padding:0.65rem 0.75rem;border-radius:10px;border:1px solid '+border+';background:'+cardBg+';color:'+textClr+';font-size:0.9rem;margin:.75rem 0 1rem;box-sizing:border-box;outline:none" />'
    +'<div style="display:flex;gap:0.75rem">'
    +'<button id="promptCancelBtn" style="flex:1;padding:0.65rem;border-radius:10px;border:1px solid '+border+';background:transparent;color:'+textClr+';font-size:0.85rem;font-weight:500;cursor:pointer">Cancel</button>'
    +'<button id="promptOkBtn" style="flex:1;padding:0.65rem;border-radius:10px;border:none;background:var(--primary);color:#0A0B14;font-size:0.85rem;font-weight:600;cursor:pointer">Create</button>'
    +'</div></div>';
  document.body.appendChild(m);
  var input = document.getElementById('promptInput');
  if(initialValue){ input.value = initialValue; }
  input.focus();
  document.getElementById('promptCancelBtn').onclick=function(){m.remove()};
  document.getElementById('promptOkBtn').onclick=function(){m.remove(); var v=input.value.trim(); if(v)onSubmit(v);};
  m.onclick=function(e){if(e.target===m)m.remove()};
  input.addEventListener('keydown',function(e){if(e.key==='Enter'){m.remove();var v=input.value.trim();if(v)onSubmit(v);}});
}

// ── Dash sidebar: close sidebar first when tapping any item ──
document.addEventListener('click',function(e){
  var item=e.target.closest('.dash-sidebar-item');
  if(!item)return;
  var sb=document.getElementById('dashSidebar');
  if(!sb)return;
  sb.classList.remove('open');
  var toggle=document.getElementById('dashSidebarToggle');
  if(toggle)toggle.classList.remove('hidden');
  var href=item.getAttribute('href');
  if(href){
    var curPage=window.location.pathname.split('/').pop()||'dashboard.html';
    var targetPage=href.split('#')[0].split('?')[0]||'dashboard.html';
    if(targetPage===curPage||(targetPage==='dashboard.html'&&curPage==='')){
      e.preventDefault();
    }
  }
});


    // ── Notifications (settings.html owns the handlers: window.dismissNotif /
    // window.markAllRead are defined inline there; these ui.js copies were
    // dead code — no page loaded them after settings.html overrode them) ──

// ── Mobile support chat FAB: auto-hide on scroll down, reappear on scroll up ──
(function(){
  var lastY = window.pageYOffset || document.documentElement.scrollTop || 0;
  var ticking = false;
  function onScroll(){
    ticking = false;
    if(window.innerWidth > 768) return;
    var fab = document.querySelector('.chat-fab');
    if(!fab) return;
    var y = window.pageYOffset || document.documentElement.scrollTop || 0;
    if(y > lastY && y > 120){
      fab.classList.add('fab-scroll-hidden');
    } else {
      fab.classList.remove('fab-scroll-hidden');
    }
    lastY = y;
  }
  window.addEventListener('scroll', function(){
    if(!ticking){ ticking = true; requestAnimationFrame(onScroll); }
  }, {passive: true});
})();
