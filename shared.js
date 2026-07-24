
    const API_URL = (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
      ? 'https://glbtoken-backend-production.up.railway.app' : 'https://glbtoken-backend-production.up.railway.app';
    let token = localStorage.getItem('gt_token') || '';
    let userData = JSON.parse(localStorage.getItem('gt_user') || '{}');
    let keys = JSON.parse(localStorage.getItem('gt_keys') || '[]');
    let newapiToken = localStorage.getItem('gt_newapi_token') || '';
    let newapiEndpoint = localStorage.getItem('gt_newapi_endpoint') || '';

    // ── Usage Analytics State ──
    let usageDays = 7;
    let usageModel = '';
    let usageMode = 'tokens';

    let oauthTimeout = null; // tracks iOS safety timeout

    // Clear any stuck spinners from bfcache / cancelled OAuth
    (function(){
      document.querySelectorAll('.btn-loading').forEach(function(el){
        el.classList.remove('btn-loading'); el.disabled = false;
        if (el.dataset.originalHtml) el.innerHTML = el.dataset.originalHtml;
      });
      sessionStorage.removeItem('gt_oauth_cancel');
    })();

    // ── Country Codes for Phone Registration ──
    const COUNTRY_CODES = [
      {flag:'🇦🇫',dial:'+93',name:'Afghanistan'},
      {flag:'🇦🇱',dial:'+355',name:'Albania'},
      {flag:'🇩🇿',dial:'+213',name:'Algeria'},
      {flag:'🇦🇩',dial:'+376',name:'Andorra'},
      {flag:'🇦🇴',dial:'+244',name:'Angola'},
      {flag:'🇦🇷',dial:'+54',name:'Argentina'},
      {flag:'🇦🇲',dial:'+374',name:'Armenia'},
      {flag:'🇦🇺',dial:'+61',name:'Australia'},
      {flag:'🇦🇹',dial:'+43',name:'Austria'},
      {flag:'🇦🇿',dial:'+994',name:'Azerbaijan'},
      {flag:'🇧🇸',dial:'+1-242',name:'Bahamas'},
      {flag:'🇧🇭',dial:'+973',name:'Bahrain'},
      {flag:'🇧🇩',dial:'+880',name:'Bangladesh'},
      {flag:'🇧🇧',dial:'+1-246',name:'Barbados'},
      {flag:'🇧🇾',dial:'+375',name:'Belarus'},
      {flag:'🇧🇪',dial:'+32',name:'Belgium'},
      {flag:'🇧🇯',dial:'+229',name:'Benin'},
      {flag:'🇧🇹',dial:'+975',name:'Bhutan'},
      {flag:'🇧🇴',dial:'+591',name:'Bolivia'},
      {flag:'🇧🇦',dial:'+387',name:'Bosnia and Herzegovina'},
      {flag:'🇧🇼',dial:'+267',name:'Botswana'},
      {flag:'🇧🇷',dial:'+55',name:'Brazil'},
      {flag:'🇧🇳',dial:'+673',name:'Brunei'},
      {flag:'🇧🇬',dial:'+359',name:'Bulgaria'},
      {flag:'🇧🇫',dial:'+226',name:'Burkina Faso'},
      {flag:'🇧🇮',dial:'+257',name:'Burundi'},
      {flag:'🇰🇭',dial:'+855',name:'Cambodia'},
      {flag:'🇨🇲',dial:'+237',name:'Cameroon'},
      {flag:'🇨🇦',dial:'+1',name:'Canada'},
      {flag:'🇨🇻',dial:'+238',name:'Cape Verde'},
      {flag:'🇨🇫',dial:'+236',name:'CAR'},
      {flag:'🇹🇩',dial:'+235',name:'Chad'},
      {flag:'🇨🇱',dial:'+56',name:'Chile'},
      {flag:'🇨🇳',dial:'+86',name:'China'},
      {flag:'🇨🇴',dial:'+57',name:'Colombia'},
      {flag:'🇰🇲',dial:'+269',name:'Comoros'},
      {flag:'🇨🇬',dial:'+242',name:'Congo'},
      {flag:'🇨🇷',dial:'+506',name:'Costa Rica'},
      {flag:'🇭🇷',dial:'+385',name:'Croatia'},
      {flag:'🇨🇺',dial:'+53',name:'Cuba'},
      {flag:'🇨🇾',dial:'+357',name:'Cyprus'},
      {flag:'🇨🇿',dial:'+420',name:'Czech Republic'},
      {flag:'🇩🇰',dial:'+45',name:'Denmark'},
      {flag:'🇩🇯',dial:'+253',name:'Djibouti'},
      {flag:'🇩🇴',dial:'+1-809',name:'Dominican Republic'},
      {flag:'🇨🇩',dial:'+243',name:'DR Congo'},
      {flag:'🇪🇨',dial:'+593',name:'Ecuador'},
      {flag:'🇪🇬',dial:'+20',name:'Egypt'},
      {flag:'🇸🇻',dial:'+503',name:'El Salvador'},
      {flag:'🇬🇶',dial:'+240',name:'Equatorial Guinea'},
      {flag:'🇪🇷',dial:'+291',name:'Eritrea'},
      {flag:'🇪🇪',dial:'+372',name:'Estonia'},
      {flag:'🇸🇿',dial:'+268',name:'Eswatini'},
      {flag:'🇪🇹',dial:'+251',name:'Ethiopia'},
      {flag:'🇫🇯',dial:'+679',name:'Fiji'},
      {flag:'🇫🇮',dial:'+358',name:'Finland'},
      {flag:'🇫🇷',dial:'+33',name:'France'},
      {flag:'🇬🇦',dial:'+241',name:'Gabon'},
      {flag:'🇬🇲',dial:'+220',name:'Gambia'},
      {flag:'🇬🇪',dial:'+995',name:'Georgia'},
      {flag:'🇩🇪',dial:'+49',name:'Germany'},
      {flag:'🇬🇭',dial:'+233',name:'Ghana'},
      {flag:'🇬🇷',dial:'+30',name:'Greece'},
      {flag:'🇬🇹',dial:'+502',name:'Guatemala'},
      {flag:'🇬🇳',dial:'+224',name:'Guinea'},
      {flag:'🇬🇼',dial:'+245',name:'Guinea-Bissau'},
      {flag:'🇭🇹',dial:'+509',name:'Haiti'},
      {flag:'🇭🇳',dial:'+504',name:'Honduras'},
      {flag:'🇭🇰',dial:'+852',name:'Hong Kong'},
      {flag:'🇭🇺',dial:'+36',name:'Hungary'},
      {flag:'🇮🇸',dial:'+354',name:'Iceland'},
      {flag:'🇮🇳',dial:'+91',name:'India'},
      {flag:'🇮🇩',dial:'+62',name:'Indonesia'},
      {flag:'🇮🇷',dial:'+98',name:'Iran'},
      {flag:'🇮🇶',dial:'+964',name:'Iraq'},
      {flag:'🇮🇪',dial:'+353',name:'Ireland'},
      {flag:'🇮🇱',dial:'+972',name:'Israel'},
      {flag:'🇮🇹',dial:'+39',name:'Italy'},
      {flag:'🇯🇲',dial:'+1-876',name:'Jamaica'},
      {flag:'🇯🇵',dial:'+81',name:'Japan'},
      {flag:'🇯🇴',dial:'+962',name:'Jordan'},
      {flag:'🇰🇿',dial:'+7',name:'Kazakhstan'},
      {flag:'🇰🇪',dial:'+254',name:'Kenya'},
      {flag:'🇰🇮',dial:'+686',name:'Kiribati'},
      {flag:'🇰🇼',dial:'+965',name:'Kuwait'},
      {flag:'🇰🇬',dial:'+996',name:'Kyrgyzstan'},
      {flag:'🇱🇦',dial:'+856',name:'Laos'},
      {flag:'🇱🇻',dial:'+371',name:'Latvia'},
      {flag:'🇱🇧',dial:'+961',name:'Lebanon'},
      {flag:'🇱🇸',dial:'+266',name:'Lesotho'},
      {flag:'🇱🇷',dial:'+231',name:'Liberia'},
      {flag:'🇱🇾',dial:'+218',name:'Libya'},
      {flag:'🇱🇮',dial:'+423',name:'Liechtenstein'},
      {flag:'🇱🇹',dial:'+370',name:'Lithuania'},
      {flag:'🇱🇺',dial:'+352',name:'Luxembourg'},
      {flag:'🇲🇴',dial:'+853',name:'Macau'},
      {flag:'🇲🇬',dial:'+261',name:'Madagascar'},
      {flag:'🇲🇼',dial:'+265',name:'Malawi'},
      {flag:'🇲🇾',dial:'+60',name:'Malaysia'},
      {flag:'🇲🇻',dial:'+960',name:'Maldives'},
      {flag:'🇲🇱',dial:'+223',name:'Mali'},
      {flag:'🇲🇹',dial:'+356',name:'Malta'},
      {flag:'🇲🇭',dial:'+692',name:'Marshall Islands'},
      {flag:'🇲🇷',dial:'+222',name:'Mauritania'},
      {flag:'🇲🇺',dial:'+230',name:'Mauritius'},
      {flag:'🇲🇽',dial:'+52',name:'Mexico'},
      {flag:'🇫🇲',dial:'+691',name:'Micronesia'},
      {flag:'🇲🇩',dial:'+373',name:'Moldova'},
      {flag:'🇲🇳',dial:'+976',name:'Mongolia'},
      {flag:'🇲🇪',dial:'+382',name:'Montenegro'},
      {flag:'🇲🇦',dial:'+212',name:'Morocco'},
      {flag:'🇲🇿',dial:'+258',name:'Mozambique'},
      {flag:'🇲🇲',dial:'+95',name:'Myanmar'},
      {flag:'🇳🇦',dial:'+264',name:'Namibia'},
      {flag:'🇳🇷',dial:'+674',name:'Nauru'},
      {flag:'🇳🇵',dial:'+977',name:'Nepal'},
      {flag:'🇳🇱',dial:'+31',name:'Netherlands'},
      {flag:'🇳🇮',dial:'+505',name:'Nicaragua'},
      {flag:'🇳🇪',dial:'+227',name:'Niger'},
      {flag:'🇳🇬',dial:'+234',name:'Nigeria'},
      {flag:'🇲🇰',dial:'+389',name:'North Macedonia'},
      {flag:'🇳🇴',dial:'+47',name:'Norway'},
      {flag:'🇴🇲',dial:'+968',name:'Oman'},
      {flag:'🇵🇰',dial:'+92',name:'Pakistan'},
      {flag:'🇵🇼',dial:'+680',name:'Palau'},
      {flag:'🇵🇦',dial:'+507',name:'Panama'},
      {flag:'🇵🇬',dial:'+675',name:'Papua New Guinea'},
      {flag:'🇵🇾',dial:'+595',name:'Paraguay'},
      {flag:'🇵🇪',dial:'+51',name:'Peru'},
      {flag:'🇵🇭',dial:'+63',name:'Philippines'},
      {flag:'🇵🇱',dial:'+48',name:'Poland'},
      {flag:'🇵🇹',dial:'+351',name:'Portugal'},
      {flag:'🇵🇷',dial:'+1-787',name:'Puerto Rico'},
      {flag:'🇶🇦',dial:'+974',name:'Qatar'},
      {flag:'🇷🇴',dial:'+40',name:'Romania'},
      {flag:'🇷🇺',dial:'+7',name:'Russia'},
      {flag:'🇷🇼',dial:'+250',name:'Rwanda'},
      {flag:'🇼🇸',dial:'+685',name:'Samoa'},
      {flag:'🇸🇲',dial:'+378',name:'San Marino'},
      {flag:'🇸🇦',dial:'+966',name:'Saudi Arabia'},
      {flag:'🇸🇳',dial:'+221',name:'Senegal'},
      {flag:'🇷🇸',dial:'+381',name:'Serbia'},
      {flag:'🇸🇨',dial:'+248',name:'Seychelles'},
      {flag:'🇸🇱',dial:'+232',name:'Sierra Leone'},
      {flag:'🇸🇬',dial:'+65',name:'Singapore'},
      {flag:'🇸🇰',dial:'+421',name:'Slovakia'},
      {flag:'🇸🇮',dial:'+386',name:'Slovenia'},
      {flag:'🇸🇧',dial:'+677',name:'Solomon Islands'},
      {flag:'🇸🇴',dial:'+252',name:'Somalia'},
      {flag:'🇿🇦',dial:'+27',name:'South Africa'},
      {flag:'🇰🇷',dial:'+82',name:'South Korea'},
      {flag:'🇸🇸',dial:'+211',name:'South Sudan'},
      {flag:'🇪🇸',dial:'+34',name:'Spain'},
      {flag:'🇱🇰',dial:'+94',name:'Sri Lanka'},
      {flag:'🇸🇩',dial:'+249',name:'Sudan'},
      {flag:'🇸🇪',dial:'+46',name:'Sweden'},
      {flag:'🇨🇭',dial:'+41',name:'Switzerland'},
      {flag:'🇸🇾',dial:'+963',name:'Syria'},
      {flag:'🇸🇹',dial:'+239',name:'São Tomé and Príncipe'},
      {flag:'🇹🇼',dial:'+886',name:'Taiwan'},
      {flag:'🇹🇯',dial:'+992',name:'Tajikistan'},
      {flag:'🇹🇿',dial:'+255',name:'Tanzania'},
      {flag:'🇹🇭',dial:'+66',name:'Thailand'},
      {flag:'🇹🇬',dial:'+228',name:'Togo'},
      {flag:'🇹🇴',dial:'+676',name:'Tonga'},
      {flag:'🇹🇹',dial:'+1-868',name:'Trinidad and Tobago'},
      {flag:'🇹🇳',dial:'+216',name:'Tunisia'},
      {flag:'🇹🇷',dial:'+90',name:'Turkey'},
      {flag:'🇹🇲',dial:'+993',name:'Turkmenistan'},
      {flag:'🇹🇻',dial:'+688',name:'Tuvalu'},
      {flag:'🇦🇪',dial:'+971',name:'UAE'},
      {flag:'🇺🇬',dial:'+256',name:'Uganda'},
      {flag:'🇺🇦',dial:'+380',name:'Ukraine'},
      {flag:'🇬🇧',dial:'+44',name:'United Kingdom'},
      {flag:'🇺🇸',dial:'+1',name:'United States'},
      {flag:'🇺🇾',dial:'+598',name:'Uruguay'},
      {flag:'🇺🇿',dial:'+998',name:'Uzbekistan'},
      {flag:'🇻🇺',dial:'+678',name:'Vanuatu'},
      {flag:'🇻🇪',dial:'+58',name:'Venezuela'},
      {flag:'🇻🇳',dial:'+84',name:'Vietnam'},
      {flag:'🇾🇪',dial:'+967',name:'Yemen'},
      {flag:'🇿🇲',dial:'+260',name:'Zambia'},
      {flag:'🇿🇼',dial:'+263',name:'Zimbabwe'},
    ];
    var selectedDial = {'login':'+1','reg':'+1'};

    // ── Theme ──
    (function(){try{
      const t=localStorage.getItem('gt_theme')||'dark';
      document.documentElement.className=t;
      document.getElementById('themeBtn').textContent=t==='dark'?'🌙':'☀️';
    }catch(e){}})();

    function toggleTheme(){
      const h=document.documentElement;
      const isDark=h.classList.contains('dark');
      h.classList.remove('dark','light');
      h.classList.add(isDark?'light':'dark');
      localStorage.setItem('gt_theme',h.className);
      document.getElementById('themeBtn').textContent=h.classList.contains('dark')?'🌙':'☀️';
      var m=document.getElementById('themeBtnMobile');
      if(m)m.textContent=h.classList.contains('dark')?'🌙':'☀️';
    }
    
    // ── Escape HTML (XSS prevention) ──

/* ══════════════════════════════════════════
   UTILITY — escapeHtml, API helper, page routing
   ══════════════════════════════════════════ */
    function escapeHtml(str){
      if(typeof str !== 'string'){
        if(str==null||str===false) return '';
        if(typeof str==='number'||typeof str==='boolean') return String(str);
        if(Array.isArray(str)) str=str.join('');
        else str=String(str);
      }
      var d = document.createElement('div');
      d.appendChild(document.createTextNode(str));
      return d.innerHTML;
    }

    // ── API Helper ──
    let models = [], selectedAmount = 5, selectedPayment = 'stripe';
    let chartInst = null, sparkInst = null, sortDir = 'price_asc';
    
    async function api(method, path, body, timeoutMs){
      const controller=new AbortController();
      const ms=timeoutMs||25000;
      const timer=setTimeout(()=>controller.abort(),ms);
      const opts={method,headers:{'Content-Type':'application/json'},signal:controller.signal};
      if(token) opts.headers['Authorization']='Bearer '+token;
      if(body) opts.body=JSON.stringify(body);
      try {
        const resp=await fetch(API_URL+path,opts);
        if (!resp.ok) {
          if(resp.status === 401){
            // Show modal on dash pages; silently redirect elsewhere
            var page = window.location.pathname.split('/').pop();
            var isDashPage = page === '' || page === 'dashboard.html' || page === 'settings.html' || page === 'logs.html' || page === 'billing.html' || page === 'usage.html' || page === 'manage-keys.html' || page === 'team.html' || page === 'referrals.html';
            if(isDashPage){
              showSessionExpired();
            } else {
              localStorage.removeItem('gt_token');localStorage.removeItem('gt_user');
              window.location.href = 'login.html';
            }
            throw new Error('Session expired');
          }
          const errData = await resp.json().catch(()=>{});
          throw new Error(((errData&&errData.detail)||'API error').replace(/^\[?\d{3}\]?\s*/,''));
        }
        return await resp.json();
      } catch(e) {
        if (e.name === 'AbortError') throw new Error('Request timed out');
        if(e.message === 'Session expired') throw e;
        throw new Error('Network error. Check your connection.');
      } finally {
        if(timer) clearTimeout(timer);
      }
    }
    // ── Safe API (auto-toast on error) ──
    async function safeApi(method, path, body, timeoutMs, silent){
      try { return await api(method, path, body, timeoutMs); }
      catch(e){ if(!silent) showToast(e.message, 'error'); return null; }
    }
    // ── Page Routing ──
    function showPage(page){
      // Auth-based redirects for multi-page setup
      if (token && (page === 'login' || page === 'register')) { window.location='dashboard.html'; return; }
      if (!token && (page === 'dashboard' || page === 'history' || page === 'apikeys' || page === 'topup' || page === 'referral' || page === 'team' || page === 'playground')) { window.location='register.html'; return; }
      if (page === 'home') { window.location='/'; return; }
      const pageMap = {pricing:'pricing.html',how:'how.html',models:'models.html',apikeys:'apikeys.html',dashboard:'dashboard.html',history:'history.html',topup:'topup.html',faq:'faq.html',about:'about.html',blog:'blog.html',terms:'terms.html',privacy:'privacy.html',refund:'refund.html',login:'login.html',register:'register.html',settings:'settings.html',notifications:'notifications.html',billing:'billing.html',referral:'referral.html',team:'team.html',playground:'playground.html'};
      if (pageMap[page]) { window.location=pageMap[page]; }
    }

    // ── Auth Guard ──
    function requireAuth(){
      if(!localStorage.getItem('gt_token')){
        window.location.replace('login.html');
        return false;
      }
      return true;
    }
    window.addEventListener('pageshow',function(e){
      if(e.persisted && !localStorage.getItem('gt_token')){
        window.location.replace('login.html');
      }
    });

    // ── Hero Variants ──
    function initHeroVariants(){
      var tagline = document.getElementById('heroTagline');
      if(tagline){
        var n = Math.floor(Math.random() * 6) + 1;
        var key = 'hero-variant-' + n;
        var lang = localStorage.getItem('gt_lang') || 'en';
        if(typeof TRANS !== 'undefined' && TRANS[key] && TRANS[key][lang]){
          tagline.textContent = TRANS[key][lang];
        } else if(typeof TRANS !== 'undefined' && TRANS[key] && TRANS[key]['en']){
          tagline.textContent = TRANS[key]['en'];
        }
      }
      var headline = document.getElementById('heroHeadline');
      if(headline){
        var n2 = Math.floor(Math.random() * 5) + 1;
        var key2 = 'hero-headline-' + n2;
        var lang2 = localStorage.getItem('gt_lang') || 'en';
        if(typeof TRANS !== 'undefined' && TRANS[key2] && TRANS[key2][lang2]){
          headline.innerHTML = TRANS[key2][lang2];
        } else if(typeof TRANS !== 'undefined' && TRANS[key2] && TRANS[key2]['en']){
          headline.innerHTML = TRANS[key2]['en'];
        }
      }
    }

    // ── Chat Drag Handler ──
    function initChatDrag(){
      var cw = document.getElementById('chatWindow');
      if(!cw) return;
      var h = cw.querySelector('.chat-header');
      if(!h) return;
      var offX, offY, dragging = false;
      function startDrag(e){
        if(e.target.tagName === 'BUTTON') return;
        dragging = true; cw.classList.add('dragging');
        var r = cw.getBoundingClientRect();
        var cx = e.clientX || (e.touches && e.touches[0].clientX);
        var cy = e.clientY || (e.touches && e.touches[0].clientY);
        offX = cx - r.left; offY = cy - r.top;
        e.preventDefault();
      }
      function moveDrag(e){
        if(!dragging) return;
        var cx = e.clientX || (e.touches && e.touches[0].clientX);
        var cy = e.clientY || (e.touches && e.touches[0].clientY);
        cw.style.left = (cx - offX) + 'px';
        cw.style.top = (cy - offY) + 'px';
        cw.style.right = 'auto'; cw.style.bottom = 'auto';
      }
      function endDrag(){if(dragging){dragging=false;cw.classList.remove('dragging')}}
      h.addEventListener('mousedown', startDrag);
      h.addEventListener('touchstart', startDrag, {passive:false});
      document.addEventListener('mousemove', moveDrag);
      document.addEventListener('touchmove', moveDrag, {passive:false});
      document.addEventListener('mouseup', endDrag);
      document.addEventListener('touchend', endDrag);
    }

    // ── Auth (Passwordless Email via Auth0) ──
    function setBtnLoading(btn, loading, originalText) {
      if (!btn) return;
      // Demote other loading buttons first (one spinner at a time)
      document.querySelectorAll('.btn-loading').forEach(function(el) {
        if (el !== btn) {
          el.classList.remove('btn-loading'); el.disabled = false;
          if (el.dataset.originalHtml) el.innerHTML = el.dataset.originalHtml;
        }
      });
      if (loading) {
        if (!btn.dataset.originalHtml) btn.dataset.originalHtml = btn.innerHTML;
        btn.classList.add('btn-loading');
        btn.disabled = true;
        btn.innerHTML = '<span class="btn-spinner"></span>' + (originalText || 'Loading...');
      } else {
        btn.classList.remove('btn-loading');
        btn.disabled = false;
        btn.innerHTML = btn.dataset.originalHtml || originalText || '';
      }
    }
    // Bfcache / tab-switch — clear stuck spinners
    (function(){
      function resetStuckButtons() {
        document.querySelectorAll('.btn-loading').forEach(function(el) {
          el.classList.remove('btn-loading');
          el.disabled = false;
          if (el.dataset.originalHtml) el.innerHTML = el.dataset.originalHtml;
        });
      }
      window.addEventListener('pageshow', function(e) { resetStuckButtons(); });
      document.addEventListener('visibilitychange', function() { if (!document.hidden) resetStuckButtons(); });
      // Kill pending OAuth timeout on page unload (prevents stale timers after navigation)
      window.addEventListener('beforeunload', function() {
        if (oauthTimeout) { clearTimeout(oauthTimeout); oauthTimeout = null; }
      });
    })();

