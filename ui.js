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
      container.innerHTML='<div style="grid-column:1/-1;text-align:center;padding:1rem;color:var(--text-muted);font-size:0.8rem">Loading models...</div>';
      var all=await safeApi('GET','/api/models',null,8000,true); if(!all){container.innerHTML=fallbackHtml;return}
        if(!all||!all.length){container.innerHTML=fallbackHtml;return;}
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
    }
    function slideTopView(dir){
      var track=document.getElementById('tmTrack');
      if(!track)return;
      tmIndex=(tmIndex+dir+tmTotal)%tmTotal;
      track.style.transform='translateX(-'+(tmIndex*100)+'%)';
      const title=document.getElementById('tmTitle');
      if(title)title.textContent=tmTitles[tmIndex];
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
      if(navigator.clipboard){navigator.clipboard.writeText(text).then(function(){
        animateCopyBtn(btn);
        showToast('Copied!','success');
      }).catch(function(){})}
      else{var ta=document.createElement('textarea');ta.value=text;document.body.appendChild(ta);ta.select();document.execCommand('copy');document.body.removeChild(ta);animateCopyBtn(btn);showToast('Copied!','success')}
    }
    function animateCopyBtn(btn){
    btn.classList.add('copying');
    var orig = btn.innerHTML;
    btn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
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
  function showPageLoader(){
    var el = document.querySelector('.page-loader');
    if(!el){el=document.createElement('div');el.className='page-loader';el.innerHTML='<div class="loader-bar"></div>';document.body.appendChild(el)}
    el.classList.add('active');
    var bar = el.querySelector('.loader-bar');
    if(bar){bar.style.width='30%';setTimeout(function(){bar.style.width='70%'},200);setTimeout(function(){bar.style.width='95%'},800)}
  }
  function hidePageLoader(){
    var el = document.querySelector('.page-loader');
    if(!el) return;
    var bar = el.querySelector('.loader-bar');
    if(bar){bar.style.width='100%';setTimeout(function(){el.classList.remove('active');if(bar)bar.style.width='0%'},400)}
    else{el.classList.remove('active')}
  }
  // ── Empty State ──
  function showEmptyState(container, icon, title, desc){
    if(!container) return;
    container.innerHTML = '<div class="empty-state"><div class="empty-icon">' + icon + '</div><div class="empty-title">' + escapeHtml(title) + '</div><div class="empty-desc">' + escapeHtml(desc) + '</div></div>';
  }
  // ── Skeleton Loading ──
  function showSkeleton(container, count){
    if(!container) return;
    var html = '';
    for(var i=0;i<count;i++) html += '<div class="skeleton skeleton-card"></div>';
    container.innerHTML = html;
  }
  // ── Price Calculator ──
  function initPriceCalculator(){
    var container = document.getElementById('priceCalculator');
    if(!container) return;
    var fallbackRates = {USD:1,NGN:1540,GHS:15.2,KES:129,GBP:0.79};
    container.innerHTML = '<div class="calculator-card"><h3 style="font-size:1rem;font-weight:600;margin-bottom:0.5rem;color:var(--text)"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#FFB347" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;margin-right:6px"><circle cx="12" cy="12" r="10"/><path d="M16 8h-6a2 2 0 100 4h4a2 2 0 110 4H8"/><line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/></svg> Token Price Calculator</h3><p style="font-size:0.8rem;color:var(--text-muted);margin-bottom:1rem">How many tokens for your money?</p>' +
      '<div class="calc-row"><input type="number" id="calcAmount" placeholder="Enter amount" min="1" value="100" oninput="window.calcUpdate()">' +
      '<select id="calcCurrency" onchange="window.calcUpdate()" style="padding:0.7rem 1rem;border-radius:var(--radius-sm);background:var(--bg-alt);border:1px solid var(--border);color:var(--text);font-size:0.9rem">' +
      Object.keys(fallbackRates).map(function(c){return '<option value="' + c + '">' + c + '</option>'}).join('') + '</select>' +
      '<span style="font-size:0.85rem;color:var(--text-muted);white-space:nowrap">= <span id="calcTokenResult" style="font-weight:700;color:var(--primary)">—</span> tokens</span></div>' +
      '<div class="calc-result" id="calcResult"></div>' +
      '<div style="font-size:0.7rem;color:var(--text-muted);margin-top:0.5rem;text-align:center" id="calcRateSource">Loading live rates...</div></div>';
    // Fetch live exchange rates
    window.calcRates = JSON.parse(JSON.stringify(fallbackRates));
    var sourceEl = document.getElementById('calcRateSource');
    fetch('https://api.frankfurter.app/latest?from=USD')
      .then(function(r){return r.json()})
      .then(function(data){
        if(data && data.rates){
          window.calcRates.GBP = data.rates.GBP || fallbackRates.GBP;
          window.calcRates.USD = 1;
          // Fetch NGN from a free source
          return fetch('https://open.er-api.com/v6/latest/USD');
        }
      }).then(function(r){
        if(r) return r.json();
      }).then(function(data){
        if(data && data.rates){
          window.calcRates.NGN = data.rates.NGN || fallbackRates.NGN;
          window.calcRates.GHS = data.rates.GHS || fallbackRates.GHS;
          window.calcRates.KES = data.rates.KES || fallbackRates.KES;
        }
        if(sourceEl) sourceEl.textContent = '💰 Live rates • 1 GT = $0.001 USD';
        window.calcUpdate();
      }).catch(function(){
        // Fallback to hardcoded rates
        window.calcRates = fallbackRates;
        if(sourceEl) sourceEl.textContent = '💰 Rates updated periodically • 1 GT = $0.001 USD';
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
  // ── Auto-init auth UI on every page load ──
  (function(){
    var t = localStorage.getItem('gt_token');
    if(t){
      try{var ud = JSON.parse(localStorage.getItem('gt_user') || '{}');}catch(e){ud={};}
      token = t;
      userData = ud;
      if(typeof applyAuth === 'function') applyAuth();
    }
  })();
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
      // Initial load: refresh top model cards (replaces hardcoded HTML)
      refreshTopModels();
      // Delegate clicks on key action buttons (avoid inline onclick XSS)
      document.addEventListener('click',function(e){
        const btn=e.target.closest('[data-key-id]');
        if(!btn)return;
        const id=Number(btn.dataset.keyId);
        if(btn.dataset.action==='toggle')toggleKeyStatus(id);
        else if(btn.dataset.action==='delete')deleteKey(id);
      });
    });
/* ══════════════════════════════════════════
   UI — Language & Theme
   ══════════════════════════════════════════ */
function toggleLangMenu() {
  var m = document.getElementById('langMenu');
  if (m) m.classList.toggle('open');
}
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
        cw.style.height = 'calc(100dvh - ' + (diff + 80) + 'px)';
        cw.style.maxHeight = 'calc(100dvh - ' + (diff + 80) + 'px)';
        var msgs = cw.querySelector('.chat-msgs');
        if(msgs) setTimeout(function(){ msgs.scrollTop = msgs.scrollHeight; }, 100);
      }
      var focused = document.querySelector('.ai-chat-section.chat-focused');
      if(focused){
        focused.style.bottom = (diff + 10) + 'px';
        var inner = focused.querySelector('.ai-chat-inner');
        if(inner){
          inner.style.maxHeight = 'calc(100dvh - ' + (diff + 40) + 'px)';
          inner.style.height = 'calc(100dvh - ' + (diff + 40) + 'px)';
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

// ── Auto-init auth UI on every page load ──
(function(){
  var t = localStorage.getItem('gt_token');
  if(t){
    try{var ud = JSON.parse(localStorage.getItem('gt_user') || '{}');}catch(e){ud={};}
    // Re-initialize module-level vars
    token = t;
    userData = ud;
    if(typeof applyAuth === 'function') applyAuth();
  }
})();

