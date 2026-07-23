
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

/* ══════════════════════════════════════════
   AUTH — Email login/register (passwordless via Auth0)
   ══════════════════════════════════════════ */
    async function sendLoginCode(){
      const email=document.getElementById('loginEmail').value.trim();
      if(!email||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){
        const m='Please enter a valid email address';
        showToast(m,'error');
        return
      }
      const btn=document.getElementById('loginSendBtn');
      setBtnLoading(btn, true, 'Continue');
      try{
        await api('POST','/api/auth/send-code',{email:email});
        document.getElementById('loginEmailGroup').style.display='none';
        document.getElementById('loginCodeGroup').style.display='block';
        document.getElementById('loginSendBtn').style.display='none';
        document.getElementById('loginVerifyBtn').style.display='block';
        document.getElementById('loginCode').focus();
        showToast('Code sent to '+email,'success');
      }catch(e){
        const msg=e.message||'Failed to send code';
        showToast(msg,'error');
      }finally{
        btn.disabled=false;btn.textContent='Continue';
      }
    }
    async function verifyLoginCode(){
      const email=document.getElementById('loginEmail').value.trim();
      const code=document.getElementById('loginCode').value.trim();
      if(!code||code.length<4){
        showToast('Please enter the verification code from your email','error');
        return
      }
      const btn=document.getElementById('loginVerifyBtn');
      setBtnLoading(btn, true, 'Verifying');
      try{
        var data=await api('POST','/api/auth/verify-code',{email:email,code:code});
        token=data.token;userData=data.user;
        localStorage.setItem('gt_token',token);localStorage.setItem('gt_user',JSON.stringify(userData));
        applyAuth();showToast('Welcome back!','success');
        window.location.href='/dashboard.html';
      }catch(e){
        const msg=e.message||'Invalid code';
        showToast(msg,'error');
      }finally{
        btn.disabled=false;btn.textContent='Verify & Sign In';
      }
    }
    async function sendRegisterCode(){
      const email=document.getElementById('regEmail').value.trim();
      if(!email||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){
        const m='Please enter a valid email address';
        showToast(m,'error');
        return
      }
      const btn=document.getElementById('regSendBtn');
      setBtnLoading(btn, true, 'Continue');
      try{
        await api('POST','/api/auth/send-code',{email:email});
        document.getElementById('regEmailGroup').style.display='none';
        document.getElementById('regCodeGroup').style.display='block';
        document.getElementById('regSendBtn').style.display='none';
        document.getElementById('regVerifyBtn').style.display='block';
        document.getElementById('regCode').focus();
        showToast('Code sent to '+email,'success');
      }catch(e){
        const msg=e.message||'Failed to send code';
        showToast(msg,'error');
      }finally{
        btn.disabled=false;btn.textContent='Continue';
      }
    }
    async function verifyRegisterCode(){
      const email=document.getElementById('regEmail').value.trim();
      const code=document.getElementById('regCode').value.trim();
      if(!code||code.length<4){
        const m='Please enter the verification code from your email';
        showToast(m,'error');
        return
      }
      const btn=document.getElementById('regVerifyBtn');
      setBtnLoading(btn, true, 'Verifying');
      try{
        var data=await api('POST','/api/auth/verify-code',{email:email,code:code});
        token=data.token;userData=data.user;
        localStorage.setItem('gt_token',token);localStorage.setItem('gt_user',JSON.stringify(userData));
        applyAuth();showToast('Account created! Welcome.','success');
        window.location.href='/dashboard.html';
      }catch(e){
        const msg=e.message||'Invalid code';
        showToast(msg,'error');
      }finally{
        btn.disabled=false;btn.textContent='Verify & Create Account';
      }
    }

/* ══════════════════════════════════════════
   AUTH — Phone SMS verification
   ══════════════════════════════════════════ */
    function togglePhone(prefix){
      var section = document.getElementById(prefix + 'PhoneSection');
      if(!section) return;
      var isShow = section.style.display !== 'none';
      section.style.display = isShow ? 'none' : 'block';
      if(!isShow) setTimeout(function(){
        renderCountryOptions(prefix);
        var inp = document.getElementById(prefix + 'Phone');
        if(inp) inp.focus();
      }, 150);
    }
    function toggleCountryList(prefix){
      var list = document.getElementById(prefix + 'CountryList');
      if(!list) return;
      var isOpen = list.style.display === 'block';
      // Close all other dropdowns first
      var allLists = document.querySelectorAll('.phone-dropdown');
      for(var i=0;i<allLists.length;i++) allLists[i].style.display = 'none';
      if(isOpen) return;
      // Position fixed relative to trigger button
      var btn = document.querySelector('#' + prefix + 'PhoneSection .phone-country');
      if(!btn) return;
      var rect = btn.getBoundingClientRect();
      var ddW = Math.min(340, window.innerWidth - 24);
      var ddH = Math.min(300, window.innerHeight - 80);
      // Check if dropdown would go off-screen bottom → open upward
      var spaceBelow = window.innerHeight - rect.bottom;
      var topPos;
      if(spaceBelow < ddH + 10 && rect.top > ddH + 10){
        topPos = rect.top - ddH - 4;
      } else {
        topPos = rect.bottom + 4;
      }
      list.style.position = 'fixed';
      list.style.top = topPos + 'px';
      list.style.left = Math.max(12, Math.min(rect.left, window.innerWidth - ddW - 12)) + 'px';
      list.style.width = ddW + 'px';
      list.style.maxHeight = ddH + 'px';
      list.style.display = 'block';
    }
    function selectCountry(prefix, dial, flag){
      document.getElementById(prefix + 'CountryFlag').textContent = flag;
      document.getElementById(prefix + 'CountryDial').textContent = dial;
      selectedDial[prefix] = dial;
      var list = document.getElementById(prefix + 'CountryList');
      if(list) list.style.display = 'none';
    }
    function renderCountryOptions(prefix){
      var list = document.getElementById(prefix + 'CountryList');
      if(!list) return;
      var html = '';
      for(var i=0;i<COUNTRY_CODES.length;i++){
        var c = COUNTRY_CODES[i];
        var sel = c.dial === selectedDial[prefix] ? ' class="country-opt active"' : ' class="country-opt"';
        var safePrefix = prefix.replace(/[^a-zA-Z0-9_-]/g, '');
        html += '<div' + sel + ' onclick="selectCountry(\'' + safePrefix + '\',\'' + escapeHtml(c.dial) + '\',\'' + escapeHtml(c.flag) + '\')"><span>' + c.flag + ' ' + escapeHtml(c.name) + '</span> <span class="country-dial">' + escapeHtml(c.dial) + '</span></div>';
      }
      list.innerHTML = html;
    }
    // Close country dropdown on click outside
    document.addEventListener('click',function(e){
      var cp = e.target.closest('.phone-wrap');
      if(!cp){
        var lists = document.querySelectorAll('.phone-dropdown');
        for(var i=0;i<lists.length;i++) lists[i].style.display = 'none';
      }
    });
    async function sendPhoneCode(prefix){
      var dial = selectedDial[prefix] || '+1';
      var phoneRaw = document.getElementById(prefix + 'Phone').value.trim();
      // Strip non-digits from the local number (handles spaces, dashes, parens)
      phoneRaw = phoneRaw.replace(/\D/g,'');
      // Remove leading zero if present (country code is the prefix)
      phoneRaw = phoneRaw.replace(/^0+/,'');
      var phone = dial + phoneRaw;
      if(!phone || phone.length < 5){
        var m = 'Please enter a valid phone number';
        showToast(m,'error');
        return;
      }
      var btn = document.getElementById(prefix + 'PhoneSendBtn');
      setBtnLoading(btn, true, 'Send Message');
      try{
        await api('POST','/api/auth/send-sms-code',{phone:phone});
        document.getElementById(prefix + 'SmsCodeGroup').style.display='block';
        btn.style.display='none';
        document.getElementById(prefix + 'PhoneVerifyBtn').style.display='block';
        document.getElementById(prefix + 'SmsCode').focus();
        showToast('Code sent to ' + phone,'success');
        // Start 3-min resend countdown
        startResendTimer(prefix);
      }catch(e){
        var msg = e.message || 'Failed to send code';
        showToast(msg,'error');
      }finally{
        btn.disabled=false; btn.textContent='Send Code';
      }
    }
    function startResendTimer(prefix){
      var existing = document.getElementById(prefix + 'ResendTimer');
      if(existing) existing.remove();
      var label = document.createElement('div');
      label.id = prefix + 'ResendTimer';
      label.style.cssText = 'text-align:center;font-size:0.8rem;margin-top:0.5rem;color:var(--text-muted)';
      var codeGroup = document.getElementById(prefix + 'SmsCodeGroup');
      if (!codeGroup) return;
      codeGroup.appendChild(label);
      var seconds = 180;
      function tick(){
        if (seconds <= 0) {
          var safePrefix = prefix.replace(/[^a-zA-Z0-9_-]/g, '');
          label.innerHTML = '<a style="color:var(--primary);cursor:pointer;text-decoration:underline" onclick="sendPhoneCode(\'' + safePrefix + '\')">Resend code</a>';
          return;
        }
        var m = Math.floor(seconds / 60);
        var s = seconds % 60;
        label.textContent = 'Resend code in ' + m + ':' + (s < 10 ? '0' : '') + s;
        seconds--;
        setTimeout(tick, 1000);
      }
      tick();
    }
    async function verifyPhoneCode(prefix){
      var dial = selectedDial[prefix] || '+1';
      var phoneRaw = document.getElementById(prefix + 'Phone').value.trim();
      phoneRaw = phoneRaw.replace(/\D/g,'');
      phoneRaw = phoneRaw.replace(/^0+/,'');
      var phone = dial + phoneRaw;
      var code = document.getElementById(prefix + 'SmsCode').value.trim();
      if(!code || code.length < 4){
        var m = 'Please enter the verification code from SMS';
        showToast(m,'error');
        return;
      }
      var btn = document.getElementById(prefix + 'PhoneVerifyBtn');
      setBtnLoading(btn, true, 'Verifying');
      try{
        var data = await api('POST','/api/auth/verify-sms-code',{phone:phone,code:code});
        token=data.token;userData=data.user;
        localStorage.setItem('gt_token',token);localStorage.setItem('gt_user',JSON.stringify(userData));
        applyAuth();
        showToast(prefix === 'login' ? 'Welcome back!' : 'Account created! Welcome.','success');
        window.location.href='/dashboard.html';
      }catch(e){
        var msg = e.message || 'Invalid code';
        showToast(msg,'error');
      }finally{
        setBtnLoading(btn, false);
      }
    }

/* ══════════════════════════════════════════
   AUTH — OAuth (Google/GitHub)
   ══════════════════════════════════════════ */
    function oauthLogin(provider, btn){ startOAuth(provider, btn); }
    function oauthRegister(provider, btn){ startOAuth(provider, btn); }
    function startOAuth(provider, btn){
      if (oauthTimeout) clearTimeout(oauthTimeout);
      setBtnLoading(btn, true, 'Connecting...');
      // Get Auth0 config from Railway (client ID stays hidden server-side)
      api('GET', '/api/auth/auth0/config').then(function(cfg){
        if (!cfg || !cfg.configured) {
          setBtnLoading(btn, false);
          showToast('Auth0 not configured', 'error');
          return;
        }
        // Generate PKCE code verifier and challenge
        function dec2hex(dec) { return ('0' + dec.toString(16)).substr(-2); }
        function generateCodeVerifier() {
          var arr = new Uint8Array(32);
          crypto.getRandomValues(arr);
          return btoa(String.fromCharCode.apply(null, arr))
            .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
        }
        function sha256(plain) {
          var encoder = new TextEncoder();
          return crypto.subtle.digest('SHA-256', encoder.encode(plain));
        }
        function base64url(arr) {
          return btoa(String.fromCharCode.apply(null, new Uint8Array(arr)))
            .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
        }
        var verifier = generateCodeVerifier();
        sha256(verifier).then(function(hash) {
          var challenge = base64url(hash);
          // Store state and verifier
          sessionStorage.setItem('gt_code_verifier', verifier);
          var csrfState = Array.from(new Uint8Array(32), function(b){ return b.toString(36)[2] || '0'; }).join('').substring(0, 32);
          sessionStorage.setItem('gt_oauth_state', csrfState);
          
          // Build Auth0 authorize URL directly (PKCE code flow)
          var connectionMap = {
            google: 'google-oauth2',
            github: 'github',
            microsoft: 'windowslive',
            apple: 'apple'
          };
          var connection = connectionMap[provider] || provider;
          var redirectUri = window.location.origin + '/auth/callback.html';
          var authUrl = 'https://' + cfg.domain + '/authorize?' +
            'response_type=code' +
            '&client_id=' + encodeURIComponent(cfg.client_id) +
            '&redirect_uri=' + encodeURIComponent(redirectUri) +
            '&scope=openid%20email%20profile' +
            '&connection=' + encodeURIComponent(connection) +
            '&state=' + encodeURIComponent(csrfState) +
            '&code_challenge=' + challenge +
            '&code_challenge_method=S256';
          
          sessionStorage.setItem('gt_oauth_cancel', '1');
          window.location.href = authUrl;
          oauthTimeout = setTimeout(function(){ oauthTimeout=null; setBtnLoading(btn, false); }, 6000);
        });
      }).catch(function(){
        setBtnLoading(btn, false);
      });
    }

/* ══════════════════════════════════════════
   USER — Profile, logout, contact
   ══════════════════════════════════════════ */
    function logoutUser(){
      // Show confirmation dialog instead of immediate logout
      showConfirm('Sign out?','Are you sure you want to sign out?',function(){
        token='';userData={};
        localStorage.removeItem('gt_token');localStorage.removeItem('gt_user');
        localStorage.removeItem('gt_newapi_token');localStorage.removeItem('gt_newapi_endpoint');
        localStorage.removeItem('gt_keys');
        applyAuth();
        window.location.href='/';
      });
    }
    // ── Contact Form ──
    async function sendContact(){
      var contactName=document.getElementById('contactName');
      var email=document.getElementById('contactEmail');
      var msg=document.getElementById('contactMsg');
      if(!contactName||!email||!msg){showToast('Contact form not found','error');return}
      var n=contactName.value.trim(), e=email.value.trim(), m=msg.value.trim();
      if(!n){showToast('Please enter your name','error');contactName.focus();return}
      if(!e||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)){showToast('Please enter a valid email','error');email.focus();return}
      if(!m||m.length<10){showToast('Message must be at least 10 characters','error');msg.focus();return}
      var btn=document.querySelector('.info-card button.btn-primary');
      setBtnLoading(btn, true, 'Send Message');
      try{
        await api('POST','/api/contact',{name:n,email:e,message:m});
        showToast('Message sent! We\'ll get back to you soon.','success');
        name.value='';email.value='';msg.value='';
      }catch(err){showToast(err.message||'Failed to send message','error')}
      finally{if(btn){btn.disabled=false;btn.textContent='Send Message'}}
    }
    async function refreshMe(){
      if(!token)return;
      try{const d=await api('GET','/api/auth/me');userData=d;localStorage.setItem('gt_user',JSON.stringify(d));applyAuth()}catch(e){}
    }

    // ── Settings Profile ──
    async function loadProfile(){
      if(!token)return;
      try{
        const d=await api('GET','/api/user/profile');
        var nameInp=document.getElementById('settingsName');
        var emailInp=document.getElementById('settingsEmail');
        var tzInp=document.getElementById('settingsTz');
        if(nameInp) nameInp.value=d.name||userData.name||'User';
        if(emailInp) emailInp.value=d.email||userData.email||'';
        if(tzInp&&d.timezone) tzInp.value=d.timezone;
      }catch(e){}
    }
    async function saveProfile(){
      if(!token){showToast('Please sign in first','error');return}
      var settingsName=document.getElementById('settingsName');
      var tz=document.getElementById('settingsTz');
      if(!settingsName){showToast('Settings form not found','error');return}
      try{
        await api('PUT','/api/user/profile',{name:settingsName.value.trim(),timezone:tz?tz.value:''});
        userData.name=settingsName.value.trim();
        localStorage.setItem('gt_user',JSON.stringify(userData));
        applyAuth();
        showToast('Profile saved','success');
      }catch(e){showToast(e.message||'Failed to save profile','error')}
    }
    async function updatePassword(){
      if(!token){showToast('Please sign in first','error');return}
      var cur=document.getElementById('settingsCurPw');
      var nw=document.getElementById('settingsNewPw');
      if(!cur||!nw||!cur.value||!nw.value){showToast('Fill in both password fields','error');return}
      if(nw.value.length<6){showToast('New password must be at least 6 characters','error');return}
      try{
        await api('PUT','/api/user/password',{current_password:cur.value,new_password:nw.value});
        cur.value='';nw.value='';
        showToast('Password updated','success');
      }catch(e){showToast(e.message||'Failed to update password','error')}
    }
    // ── Notification Settings ──
    async function loadSettings(){
      if(!token)return;
      try{
        const d=await api('GET','/api/user/settings');
        var el=document.getElementById('notifEmail');
        if(el&&typeof d.email_notifications==='boolean') el.checked=d.email_notifications;
        var el2=document.getElementById('notifLowBalance');
        if(el2&&typeof d.low_balance_alert==='boolean') el2.checked=d.low_balance_alert;
        var el3=document.getElementById('notifLogin');
        if(el3&&typeof d.login_alerts==='boolean') el3.checked=d.login_alerts;
      }catch(e){}
    }
    async function saveNotificationSettings(){
      if(!token){showToast('Please sign in first','error');return}
      var emailEl=document.getElementById('notifEmail');
      var balEl=document.getElementById('notifLowBalance');
      var loginEl=document.getElementById('notifLogin');
      if(!emailEl){showToast('Settings form not found','error');return}
      try{
        await api('PUT','/api/user/settings',{
          email_notifications:emailEl.checked,
          low_balance_alert:balEl?balEl.checked:false,
          login_alerts:loginEl?loginEl.checked:false
        });
        showToast('Notification preferences saved','success');
      }catch(e){showToast(e.message||'Failed to save notification settings','error')}
    }
    // ── History / Transactions ──

/* ══════════════════════════════════════════
   DASHBOARD — Transactions, notifications, billing
   ══════════════════════════════════════════ */
    async function loadTransactions(){
      if(!token)return;
      var depBody=document.getElementById('txDepositBody');
      var conBody=document.getElementById('txConsumptionBody');
      if(!depBody&&!conBody)return;
      try{
        var txns=await api('GET','/api/transactions');
        if(!txns||!txns.length){depBody.innerHTML='<tr><td colspan="4" style="text-align:center;color:var(--text-muted);padding:2rem">No transactions yet</td></tr>';return}
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
      }catch(e){
        depBody.innerHTML='<tr><td colspan="4" style="text-align:center;color:var(--text-muted);padding:2rem">Failed to load transactions</td></tr>';
      }
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
        var data=await api('GET','/api/analytics/cost-by-model?days='+(days||7));
        if(!data||!data.models||!data.models.length){
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
      }catch(e){
        showToast('Failed to load cost breakdown','error');
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
        var data=await api('GET','/api/analytics/error-rate?days='+(days||7));
        if(!data||!data.labels||!data.labels.length){
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
        showToast('Failed to load error rates','error');
      }
    }

    async function loadResponseTimes(days){
      try{
        var body=document.getElementById('responseTimeBody');
        if(!body)return;
        body.innerHTML='<tr><td colspan="4" style="text-align:center;padding:1rem;color:var(--text-muted)">Loading...</td></tr>';
        var data=await api('GET','/api/analytics/response-times?days='+(days||7));
        if(!data||!data.items||!data.items.length){
          body.innerHTML='<tr><td colspan="4" style="text-align:center;padding:1.5rem;color:var(--text-muted)">No response time data available.</td></tr>';
          return;
        }
        body.innerHTML=data.items.map(function(item){
          var ms=item.response_time_ms||0;
          var cls=ms<500?'speed-fast':ms<2000?'speed-medium':'speed-slow';
          return '<tr><td>'+escapeHtml(item.model||'-')+'</td><td>'+escapeHtml(item.provider||'-')+'</td><td class="'+cls+'">'+ms.toFixed(0)+' ms</td><td>'+escapeHtml(item.date||'')+'</td></tr>';
        }).join('');
      }catch(e){
        var b2=document.getElementById('responseTimeBody');
        if(b2)b2.innerHTML='<tr><td colspan="4" style="text-align:center;padding:1.5rem;color:var(--text-muted)">Failed to load response times.</td></tr>';
      }
    }

    async function loadKeyUsage(days){
      try{
        var body=document.getElementById('keyUsageBody');
        if(!body)return;
        body.innerHTML='<tr><td colspan="5" style="text-align:center;padding:1rem;color:var(--text-muted)">Loading...</td></tr>';
        var data=await api('GET','/api/analytics/key-usage?days='+(days||7));
        if(!data||!data.keys||!data.keys.length){
          body.innerHTML='<tr><td colspan="5" style="text-align:center;padding:1.5rem;color:var(--text-muted)">No key usage data available.</td></tr>';
          return;
        }
        body.innerHTML=data.keys.map(function(k){
          return '<tr><td>'+escapeHtml(k.name||'Key '+k.id)+'</td><td>'+escapeHtml(k.key_prefix||'')+'...</td><td>'+(k.request_count||0).toLocaleString()+'</td><td>'+(k.tokens||0).toLocaleString()+'</td><td>'+escapeHtml(k.last_used?new Date(k.last_used).toLocaleDateString():'Never')+'</td></tr>';
        }).join('');
      }catch(e){
        var b2=document.getElementById('keyUsageBody');
        if(b2)b2.innerHTML='<tr><td colspan="5" style="text-align:center;padding:1.5rem;color:var(--text-muted)">Failed to load key usage.</td></tr>';
      }
    }

    async function loadCostProjection(){
      try{
        var last30El=document.getElementById('projLast30');
        var monthlyEl=document.getElementById('projMonthly');
        var dailyEl=document.getElementById('projDailyAvg');
        if(!last30El&&!monthlyEl&&!dailyEl)return;
        var data=await api('GET','/api/analytics/cost-projection');
        if(!data||data.error){
          if(last30El)last30El.textContent='$0.00';
          if(monthlyEl)monthlyEl.textContent='$0.00';
          if(dailyEl)dailyEl.textContent='$0.00';
          return;
        }
        if(last30El)last30El.textContent='$'+(data.last_30_days||0).toFixed(2);
        if(monthlyEl)monthlyEl.textContent='$'+(data.projected_monthly||0).toFixed(2);
        if(dailyEl)dailyEl.textContent='$'+(data.daily_average||0).toFixed(2);
      }catch(e){
        // Silently fail for cost projection
      }
    }

    async function loadSpeedComparison(){
      try{
        var body=document.getElementById('speedComparisonBody');
        if(!body)return;
        body.innerHTML='<tr><td colspan="4" style="text-align:center;padding:1rem;color:var(--text-muted)">Loading...</td></tr>';
        var result=await api('GET','/api/available-models',null,8000);
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
      }catch(e){
        var b2=document.getElementById('speedComparisonBody');
        if(b2)b2.innerHTML='<tr><td colspan="4" style="text-align:center;padding:1.5rem;color:var(--text-muted)">Failed to load speed comparison.</td></tr>';
      }
    }


/* ══════════════════════════════════════════
   FILTERS — Saved filters, spending alerts, heatmap
   ══════════════════════════════════════════ */
    function renderHeatmap(){
      try{
        var container=document.getElementById('usageHeatmap');
        if(!container)return;
        // Generate a 7x24 grid (days x hours) with mock intensity or use real data
        var days=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
        var html='<div class="heatmap-grid">';
        // Header row for hours
        html+='<div class="heatmap-label" style="grid-column:1"></div>';
        for(var h=0;h<24;h++){
          html+='<div class="heatmap-label" style="grid-column:'+(h+2)+';text-align:center">'+h+'</div>';
        }
        for(var d=0;d<7;d++){
          html+='<div class="heatmap-label" style="grid-row:'+(d+2)+'">'+days[d]+'</div>';
          for(var h=0;h<24;h++){
            // Use random-ish intensity based on hour and day
            var intensity=Math.random();
            var colorVal=Math.floor(intensity*200+55);
            var bg='rgba(244,180,0,'+(intensity*0.8+0.1).toFixed(2)+')';
            html+='<div class="heatmap-cell" style="background:'+bg+';grid-row:'+(d+2)+';grid-column:'+(h+2)+'" title="'+days[d]+' '+(h<10?'0':'')+h+':00 - '+(intensity*100).toFixed(0)+'%"></div>';
          }
        }
        html+='</div>';
        container.innerHTML=html;
      }catch(e){
        // Silently fail for heatmap
      }
    }

    function saveSpendingAlerts(){
      try{
        var enabledEl=document.getElementById('alertEnabled');
        var thresholdEl=document.getElementById('alertThreshold');
        var emailEl=document.getElementById('alertEmail');
        var alerts={
          enabled:enabledEl?enabledEl.checked:false,
          threshold:thresholdEl?parseFloat(thresholdEl.value)||50:50,
          email:emailEl?emailEl.value.trim():''
        };
        localStorage.setItem('gt_spending_alerts',JSON.stringify(alerts));
        showToast('Spending alerts saved','success');
        // Restore UI state
        if(enabledEl){
          var toggleRow=enabledEl.closest('.alert-row');
          if(toggleRow&&thresholdEl){
            thresholdEl.disabled=!enabledEl.checked;
            if(emailEl)emailEl.disabled=!enabledEl.checked;
          }
        }
      }catch(e){
        showToast('Failed to save spending alerts','error');
      }
    }

    function loadSavedFilters(){
      try{
        var container=document.getElementById('savedFiltersList');
        if(!container)return;
        var filters=JSON.parse(localStorage.getItem('gt_saved_filters')||'[]');
        if(!filters||!filters.length){
          container.innerHTML='<p style="color:var(--text-muted);font-size:0.85rem;text-align:center;padding:0.75rem">No saved filters yet.</p>';
          return;
        }
        container.innerHTML=filters.map(function(f,i){
          return '<span class="saved-filter-chip" onclick="applySavedFilter('+i+')" title="'+escapeHtml(JSON.stringify(f.settings||{}))+'">'+escapeHtml(f.name)+' <span class="filter-chip-remove" onclick="event.stopPropagation();deleteSavedFilter('+i+')" style="cursor:pointer;opacity:0.5;margin-left:4px">&times;</span></span>';
        }).join('');
      }catch(e){}
    }

    function saveCurrentFilter(){
      try{
        var name=prompt('Name this filter preset:');
        if(!name||!name.trim())return;
        name=name.trim();
        var filters=JSON.parse(localStorage.getItem('gt_saved_filters')||'[]');
        var settings={
          days:usageDays||7,
          model:usageModel||'',
          mode:usageMode||'tokens'
        };
        filters.push({name:name,settings:settings});
        localStorage.setItem('gt_saved_filters',JSON.stringify(filters));
        loadSavedFilters();
        showToast('Filter "'+name+'" saved','success');
      }catch(e){
        showToast('Failed to save filter','error');
      }
    }

    function applySavedFilter(index){
      try{
        var filters=JSON.parse(localStorage.getItem('gt_saved_filters')||'[]');
        if(!filters[index]){showToast('Filter not found','error');return;}
        var f=filters[index];
        var settings=f.settings||{};
        if(settings.days)setUsageRange(settings.days);
        if(settings.model){
          usageModel=settings.model;
          var sel=document.getElementById('usageModelFilter');
          if(sel)sel.value=settings.model;
        }
        if(settings.mode)setUsageMode(settings.mode);
        refreshUsageChart();
        showToast('Applied filter: '+escapeHtml(f.name),'info');
      }catch(e){
        showToast('Failed to apply filter','error');
      }
    }

    function deleteSavedFilter(index){
      try{
        var filters=JSON.parse(localStorage.getItem('gt_saved_filters')||'[]');
        if(!filters[index])return;
        filters.splice(index,1);
        localStorage.setItem('gt_saved_filters',JSON.stringify(filters));
        loadSavedFilters();
        showToast('Filter deleted','info');
      }catch(e){
        showToast('Failed to delete filter','error');
      }
    }

    function exportData(type){
      try{
        var data, filename, headers;
        if(type==='usage'){
          data=JSON.parse(localStorage.getItem('gt_usage_data')||'[]');
          headers='Date,Model,Tokens,Cost\n';
          filename='usage-export.csv';
        }else if(type==='logs'){
          data=JSON.parse(localStorage.getItem('gt_logs_data')||'[]');
          headers='Timestamp,Model,Tokens,Cost,Status\n';
          filename='logs-export.csv';
        }else if(type==='billing'){
          data=JSON.parse(localStorage.getItem('gt_billing_data')||'[]');
          headers='Date,Description,Amount,Status\n';
          filename='billing-export.csv';
        }else{
          showToast('Unknown export type','error');
          return;
        }
        if(!data||!data.length){
          // Try fetching live data instead
          if(type==='usage'){
            api('GET','/api/usage-analytics?days=30').then(function(d){
              if(d&&d.labels&&d.tokens){
                var csv='Date,Tokens,Cost\n';
                for(var i=0;i<d.labels.length;i++){
                  csv+=escapeHtml(d.labels[i])+','+(d.tokens[i]||0)+','+(d.costs?d.costs[i]:0)+'\n';
                }
                triggerDownload(csv,'usage-export.csv');
              }else{
                showToast('No data to export','info');
              }
            }).catch(function(){showToast('Failed to fetch export data','error');});
            return;
          }
          showToast('No data available to export','info');
          return;
        }
        var csv=headers;
        data.forEach(function(row){
          var vals=Object.values(row).map(function(v){return typeof v==='string'?'"'+v.replace(/"/g,'""')+'"':v;});
          csv+=vals.join(',')+'\n';
        });
        triggerDownload(csv,filename);
        showToast('Data exported','success');
      }catch(e){
        showToast('Failed to export data: '+e.message,'error');
      }
    }

    function triggerDownload(content,filename){
      var blob=new Blob([content],{type:'text/csv;charset=utf-8;'});
      var link=document.createElement('a');
      link.href=URL.createObjectURL(blob);
      link.download=filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href);
    }

    async function loadMonthlySummary(){
      try{
        var container=document.getElementById('monthlySummary');
        if(!container)return;
        container.innerHTML='<p style="color:var(--text-muted);text-align:center;padding:1rem">Loading monthly comparison...</p>';
        var data=await api('GET','/api/activity?months=2');
        var items=(data&&data.items)||[];
        if(!items.length){
          container.innerHTML='<p style="color:var(--text-muted);text-align:center;padding:1rem">Not enough data for monthly comparison.</p>';
          return;
        }
        var now=new Date();
        var thisMonth=now.getMonth();
        var thisYear=now.getFullYear();
        var lastMonth=thisMonth===0?11:thisMonth-1;
        var lastMonthYear=thisMonth===0?thisYear-1:thisYear;
        var thisMonthItems=[], lastMonthItems=[];
        items.forEach(function(item){
          if(!item.created_at)return;
          var d=new Date(item.created_at);
          if(d.getMonth()===thisMonth&&d.getFullYear()===thisYear)thisMonthItems.push(item);
          else if(d.getMonth()===lastMonth&&d.getFullYear()===lastMonthYear)lastMonthItems.push(item);
        });
        function summarize(arr){
          var spend=0,calls=0,tokens=0,modelCounts={};
          arr.forEach(function(item){
            if(item.type==='api_call'||item.type==='consumption'){
              calls++;
              tokens+=item.tokens||0;
              if(item.cost)spend+=item.cost;
              var mdl=item.model||'unknown';
              modelCounts[mdl]=(modelCounts[mdl]||0)+1;
            }
          });
          var topModel=Object.keys(modelCounts).sort(function(a,b){return modelCounts[b]-modelCounts[a];})[0]||'N/A';
          return {spend:spend,calls:calls,tokens:tokens,avgCost:calls>0?spend/calls:0,topModel:topModel};
        }
        var thisSumm=summarize(thisMonthItems);
        var lastSumm=summarize(lastMonthItems);
        var monthNames=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        var thisLabel=monthNames[thisMonth]+' '+thisYear;
        var lastLabel=monthNames[lastMonth]+' '+lastMonthYear;
        var html='<div class="monthly-compare">';
        html+='<div class="monthly-card"><div class="mc-label">'+escapeHtml(lastLabel)+'</div><div class="mc-val">$'+lastSumm.spend.toFixed(2)+'</div><div class="mc-sub">'+lastSumm.calls+' calls · '+lastSumm.tokens.toLocaleString()+' tok</div></div>';
        html+='<div class="monthly-card current"><div class="mc-label">'+escapeHtml(thisLabel)+'</div><div class="mc-val">$'+thisSumm.spend.toFixed(2)+'</div><div class="mc-sub">'+thisSumm.calls+' calls · '+thisSumm.tokens.toLocaleString()+' tok</div></div>';
        html+='</div>';
        html+='<div style="margin-top:0.75rem;font-size:0.8rem;color:var(--text-muted)">Most used model: <strong>'+escapeHtml(thisSumm.topModel)+'</strong> · Avg cost/call: $'+thisSumm.avgCost.toFixed(6)+'</div>';
        container.innerHTML=html;
      }catch(e){
        var c2=document.getElementById('monthlySummary');
        if(c2)c2.innerHTML='<p style="color:var(--text-muted);text-align:center;padding:1rem">Failed to load monthly summary.</p>';
      }
    }

    async function loadRecentActivity(){
      try{
        var container=document.getElementById('recentActivity');
        if(!container)return;
        container.innerHTML='<p style="color:var(--text-muted);text-align:center;padding:0.5rem;font-size:0.85rem">Loading...</p>';
        var act=await api('GET','/api/activity');
        var items=(act&&act.items)||[];
        if(!items.length){
          container.innerHTML='<p style="color:var(--text-muted);text-align:center;padding:0.5rem;font-size:0.85rem">No recent activity.</p>';
          return;
        }
        var recent=items.slice(0,5);
        container.innerHTML=recent.map(function(a){
          var icon,colorCls,desc;
          switch(a.type){
            case 'api_call': icon='🤖'; colorCls='var(--primary-subtle)'; desc=escapeHtml(a.model||'API call')+' · '+parseInt(a.tokens||0).toLocaleString()+' tok'; break;
            case 'topup': icon='💰'; colorCls='var(--success-subtle)'; desc='Top-up '+(a.amount?'$'+a.amount.toFixed(2):'')+' · +'+parseInt(a.tokens||0).toLocaleString()+' tokens'; break;
            default: icon='📋'; colorCls='var(--border)'; desc=escapeHtml(a.description||a.type||''); break;
          }
          var dt=a.created_at?new Date(a.created_at).toLocaleString():'';
          return '<div class="dash-activity-item" style="padding:0.5rem 0.75rem"><div class="icon" style="width:30px;height:30px;border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:0.85rem;flex-shrink:0;background:'+colorCls+'">'+icon+'</div><div class="info" style="flex:1;min-width:0"><div class="title" style="font-size:0.8rem;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+desc+'</div><div class="time" style="font-size:0.7rem;color:var(--text-muted)">'+escapeHtml(dt)+'</div></div></div>';
        }).join('');
      }catch(e){
        var c2=document.getElementById('recentActivity');
        if(c2)c2.innerHTML='<p style="color:var(--text-muted);text-align:center;padding:0.5rem;font-size:0.85rem">Failed to load activity.</p>';
      }
    }

    function startUsageTicker(){
      var tickerEl=document.getElementById('usageTicker');
      if(!tickerEl)return;
      if(window._tickerInterval)clearInterval(window._tickerInterval);
      async function updateTicker(){
        try{
          var data=await api('GET','/api/dashboard',null,5000);
          if(!data)return;
          var todayCalls=data.today_requests||data.total_requests||0;
          var todayTokens=data.today_tokens||data.total_tokens_consumed||0;
          var balance=data.token_balance||0;
          tickerEl.innerHTML='<span class="ticker-item">📊 <strong>Today:</strong> '+todayCalls.toLocaleString()+' calls · '+todayTokens.toLocaleString()+' tokens</span><span class="ticker-item">💰 <strong>Balance:</strong> '+balance.toLocaleString()+' GT</span>';
        }catch(e){
          // Silently retry next cycle
        }
      }
      updateTicker();
      window._tickerInterval=setInterval(updateTicker,30000);
    }

    // ── Auth0 Social Login Callback ──
    async function handleAuth0Callback(){
      // Called on /auth/callback page — no nav/toast DOM elements here
      const hash = window.location.hash.substring(1);
      if(!hash) return;
      const params = new URLSearchParams(hash);
      const idToken = params.get('id_token');
      if(!idToken) return;
      // Verify CSRF state token
      const returnedState = params.get('state');
      const storedState = sessionStorage.getItem('gt_oauth_state');
      sessionStorage.removeItem('gt_oauth_state');
      if (returnedState && storedState && returnedState !== storedState) {
        window.location.href = '/login.html?error=Security+check+failed:+invalid+state';
        return;
      }
      // Clear the hash from URL — removes id_token from browser history
      if (window.history && window.history.replaceState) {
        var cleanUrl = window.location.protocol + '//' + window.location.host + window.location.pathname;
        window.history.replaceState({}, document.title, cleanUrl);
      }
      try{
        const data = await api('POST','/api/auth/auth0/login', {token: idToken});
        localStorage.setItem('gt_token', data.token);
        localStorage.setItem('gt_user', JSON.stringify(data.user));
        // Don't call applyAuth() — callback page has no nav DOM elements
        // Don't call showToast() — callback page has no toast DOM elements
        window.location.href = '/dashboard.html';
      }catch(e){
        window.location.href = '/login.html?error=' + encodeURIComponent(e.message || 'Auth0 login failed');
      }
    }
    // Auto-run on callback page
    if (window.location.pathname.indexOf('/auth/callback.html') !== -1) {
      handleAuth0Callback();
    }

    // ── Forgot Password ──
    function showForgotPassword(){
      // Create modal overlay
      var overlay = document.createElement('div');
      overlay.className = 'modal-overlay';
      overlay.style.cssText = 'display:flex;align-items:center;justify-content:center;position:fixed;inset:0;z-index:9999';
      var t = function(key, fallback) { return (typeof TRANS !== 'undefined' && TRANS[key] && TRANS[key][curLang]) ? TRANS[key][curLang] : fallback; };
      overlay.innerHTML = '<div style="background:var(--card);border:1px solid var(--border);border-radius:16px;padding:2rem;max-width:400px;width:90%;box-shadow:0 20px 60px rgba(0,0,0,0.5)">' +
        '<h3 style="margin:0 0 0.5rem;color:var(--text)">' + t("Reset Password","Reset Password") + '</h3>' +
        '<p style="color:var(--text-secondary);font-size:0.9rem;margin-bottom:1.5rem">' + t("Enter your email and we'll send a reset link.","Enter your email and we'll send a reset link.") + '</p>' +
        '<div class="auth-field"><label>' + t("Email","Email") + '</label><input type="email" id="resetEmail" placeholder="you@example.com"></div>' +
        '<div id="resetError" style="color:#ff4444;font-size:0.85rem;margin-bottom:1rem;text-align:center;display:none"></div>' +
        '<div style="display:flex;gap:0.75rem;margin-top:1rem">' +
        '<button class="btn-primary" style="flex:1;font-size:0.8rem;white-space:nowrap" id="resetSendBtn" onclick="sendResetLink()">' + t("Send Reset Link","Send Reset Link") + '</button>' +
        '<button class="btn-secondary" style="flex:1;font-size:0.8rem;text-align:center;justify-content:center;padding:0.75rem 1rem" onclick="this.closest(\'.modal-overlay\').remove()">' + t("Cancel","Cancel") + '</button>' +
        '</div></div>';
      document.body.appendChild(overlay);
    }
    async function sendResetLink(){
      var email = document.getElementById('resetEmail').value;
      var btn = document.getElementById('resetSendBtn');
      setBtnLoading(btn, true, 'Send Reset Link');
      try{
        await api('POST','/api/auth/forgot-password',{email:email});
        showToast('Reset link sent! Check your email.','success');
        // Close modal after 2 seconds
        setTimeout(function(){
          var m = document.querySelector('.modal-overlay');
          if(m)m.remove();
        },2000);
      }catch(e){
        var msg = e.message || 'Failed to send reset link';
        showToast(msg,'error');
      }
      if(btn){btn.disabled=false;btn.textContent='Send Reset Link'}
    }
    function applyAuth(){
      var sbName=document.getElementById('sbUserName');
      var sbAv=document.getElementById('sbAvatar');
      if(sbName&&userData&&userData.name)sbName.textContent=userData.name;
      if(sbAv&&userData&&userData.name)sbAv.textContent=userData.name.charAt(0).toUpperCase();
      const loggedIn=!!token;
      var ng=document.getElementById('navGuest');if(ng)ng.style.display=loggedIn?'none':'flex';
      var nu=document.getElementById('navUser');
      if(nu){
        nu.style.display=loggedIn?'flex':'none';
        nu.classList.toggle('d-none',!loggedIn);
      }
      var nb=document.getElementById('navBalance');if(nb)nb.style.display=loggedIn?'inline-block':'none';
      // Mobile menu sync
      var mg=document.getElementById('mobileGuestSection');
      var mu=document.getElementById('mobileUserSection');
      if(mg)mg.style.display=loggedIn?'none':'block';
      if(mu){
        mu.style.display=loggedIn?'block':'none';
        mu.classList.toggle('d-none',!loggedIn);
      }
      // Toggle Dashboard vs API/Dev in nav
      var nal=document.getElementById('navApiLink');if(nal)nal.style.display=loggedIn?'none':'inline-block';
      var mal=document.getElementById('mNavApiLink');
      if(mal)mal.style.display=loggedIn?'none':'block';
      // Toggle Buy Tokens link in nav
      var nrl=document.getElementById('navReferralLink');if(nrl)nrl.style.display=loggedIn?'inline-block':'none';
      var ntl=document.getElementById('navTeamLink');if(ntl)ntl.style.display=loggedIn?'inline-block':'none';
      var npl=document.getElementById('navPlaygroundLink');if(npl)npl.style.display=loggedIn?'inline-block':'none';
      var nhl=document.getElementById('navHistoryLink');if(nhl)nhl.style.display='inline-block';
      // Mobile
      var mnrl=document.getElementById('mNavReferralLink');if(mnrl)mnrl.style.display=loggedIn?'block':'none';
      var mntl=document.getElementById('mNavTeamLink');if(mntl)mntl.style.display=loggedIn?'block':'none';
      var mnpl=document.getElementById('mNavPlaygroundLink');if(mnpl)mnpl.style.display=loggedIn?'block':'none';
      var mnhl=document.getElementById('mNavHistoryLink');if(mnhl)mnhl.style.display='block';
      // API doc page: show Go to Dashboard button when logged in
      const goBtn=document.getElementById('apiGoToDashBtn');
      if(goBtn)goBtn.style.display=loggedIn?'inline-flex':'none';
      if(loggedIn){
        var displayName = userData.name;
        if (!displayName) {
          if (userData.email) {
            if (userData.email.endsWith('@privaterelay.appleid.com')) {
              displayName = 'Apple User';
            } else {
              displayName = userData.email.split('@')[0];
            }
          } else {
            displayName = 'User';
          }
        }
        var du=document.getElementById('dashUserName');if(du)du.textContent=displayName;
        const initial=(displayName||'U')[0].toUpperCase();
        // Update avatar initial without breaking dropdown structure
        const av=document.querySelector('.nav-avatar');
        if(av){
          const textNode = document.createTextNode(initial);
          const dropdown = av.querySelector('.dropdown');
          av.textContent = '';
          av.appendChild(textNode);
          if (dropdown) av.appendChild(dropdown);
        }
        var da=document.getElementById('ddAvatar');if(da)da.textContent=initial;
        var dn=document.getElementById('dropName');if(dn)dn.textContent=displayName;
        var de=document.getElementById('dropEmail');if(de)de.textContent=userData.email||'';
        // Mobile sync
        var ma=document.getElementById('mAvatar');if(ma)ma.textContent=initial;
        var mn=document.getElementById('mName');if(mn)mn.textContent=displayName;
        var me=document.getElementById('mEmail');if(me)me.textContent=userData.email||'';
      } else {
      }
      updateBalance();
    }
    function updateBalance(){
      const b=userData.token_balance||0;
      var nb=document.getElementById('navBalance');if(nb)nb.textContent=b.toLocaleString()+' Tokens';
      var db2=document.getElementById('ddBalance');if(db2)db2.textContent=b.toLocaleString()+' GT';
      var mb=document.getElementById('mBalance');if(mb)mb.textContent=b.toLocaleString();
      const db=document.getElementById('dashBalance');
      if(db)db.textContent=b.toLocaleString();
      const du=document.getElementById('dashUsd');
      if(du)du.textContent='$'+(b/1000).toFixed(2)+' USD';
      const hb=document.getElementById('heroBalance');
      if(hb)hb.textContent=b.toLocaleString();
    }
    function toggleDropdown(){var ud=document.getElementById('userDropdown');if(ud)ud.classList.toggle('open')}
    document.addEventListener('click',function(e){
      const dd=document.getElementById('userDropdown');
      if(dd&&dd.classList.contains('open')&&!e.target.closest('.nav-avatar'))dd.classList.remove('open');
    });

    // ── Hash-based routing (back/forward support) ──
    window.addEventListener('hashchange',function(){
      const page=location.hash.replace('#','')||'home';
      showPage(page);
    });
    // ── Mobile keyboard retention for chat send button ──
    // Handled via onmousedown="event.preventDefault()" + type="button" in HTML
    // ── Init auth ──
    if(token){refreshMe();applyAuth()}
    // ── Initial route from hash ──
    (function(){
      // Multi-page mode - active page is determined by the current file
      const pageId = location.pathname.split('/').pop().replace('.html','') || 'home';
      if (pageId === 'index' || pageId === '') window.location = '/';
      // Load page-specific data
      if(pageId==='dashboard'){loadDashboard();refreshMe()}
      if(pageId==='apikeys'&&token)loadKeys();
      if(pageId==='history'&&token)loadTx();
      if(pageId==='models')loadModels();
      if(pageId==='referral'&&token){if(typeof loadReferralStats==='function')loadReferralStats();}
      if(pageId==='team'&&token){if(typeof loadOrgs==='function')loadOrgs();}
      if(pageId==='playground'&&token){if(typeof loadConversations==='function')loadConversations();if(typeof loadPlaygroundModels==='function')loadPlaygroundModels();}
      if(pageId==='history'&&token){if(typeof loadLoginHistory==='function')loadLoginHistory();}
    })();

    // ── Dashboard ──
    async function loadDashboard(){
      if(!token)return;
      try{
        const d=await api('GET','/api/dashboard');
        userData.token_balance=d.token_balance;
        updateBalance();
        document.getElementById('dashTotalSpent').textContent='$'+d.total_spent.toFixed(2);
        document.getElementById('dashModelsUsed').textContent=d.models_used;
        // Total API requests
        var reqEl = document.getElementById('dashTotalRequests');
        if(reqEl) reqEl.textContent = (d.total_requests || 0).toLocaleString();
        document.getElementById('dashKeyCount').textContent=d.api_keys_active;
        document.getElementById('dashKeyStatus').textContent=d.api_keys_active>0?'Active':'No keys';
        // Show real days active from New API or local DB
        var daysEl = document.getElementById('dashDaysActive');
        if(daysEl) daysEl.textContent = d.days_active;
        // Show New API connection status
        var newapiStatus = document.getElementById('dashNewapiStatus');
        if(newapiStatus) newapiStatus.textContent = d.newapi_connected ? 'New API Connected' : 'Offline';
        // ── Quota bar (tokens used vs balance) ──
        var totalConsumed = d.total_tokens_consumed || 0;
        var balance = d.token_balance || 0;
        var totalEver = totalConsumed + balance;
        var usedEl = document.getElementById('usedTokens');
        var remainEl = document.getElementById('remainingTokens');
        var quotaBar = document.getElementById('quotaBar');
        var usageSub = document.getElementById('usageSubtitle');
        if(usedEl) usedEl.textContent = totalConsumed.toLocaleString();
        if(remainEl) remainEl.textContent = balance.toLocaleString() + ' remaining';
        if(quotaBar){
          var pct = totalEver > 0 ? Math.min(totalConsumed / totalEver * 100, 100) : 0;
          quotaBar.style.width = pct + '%';
        }
        if(usageSub) usageSub.textContent = totalConsumed + ' of ' + totalEver + ' tokens used';
        // Show total tokens consumed (simplified)
        var consumedEl = document.getElementById('dashTotalConsumed');
        if(consumedEl) consumedEl.textContent = totalConsumed.toLocaleString();
        // Lifetime spend
        var spendEl = document.getElementById('dashTotalSpentLifetime');
        if(spendEl) spendEl.textContent = '$' + (d.total_spent || 0).toFixed(2);
        // Show New API today's usage as stat prompt
        var newapiTotal = d.usage_from_newapi && d.usage_from_newapi.total;
        if(newapiTotal && d.newapi_connected){
          // Show today's New API usage in the stats area
          var todayEl = document.getElementById('dashTotalConsumed');
          if(todayEl) todayEl.textContent = parseInt(newapiTotal).toLocaleString();
        }
        initCharts(d.usage_by_model);
        initDailyChart(d.daily_usage);
        // ── Model ranking list ──
        var rankEl = document.getElementById('modelRanking');
        if(rankEl && d.usage_by_model && d.usage_by_model.length){
          var sorted = d.usage_by_model.slice().sort(function(a,b){return b.tokens - a.tokens});
          var top = sorted.slice(0,5);
          rankEl.innerHTML = '<div style="font-size:0.8rem;font-weight:600;color:var(--text-muted);margin-bottom:0.4rem">Top Models</div>' +
            top.map(function(m,i){
              var pct = sorted[0].tokens > 0 ? (m.tokens / sorted[0].tokens * 100) : 0;
              return '<div style="display:flex;align-items:center;gap:0.5rem;padding:0.25rem 0;font-size:0.8rem"><span style="width:16px;text-align:right;color:var(--text-muted)">' + (i+1) + '.</span><span style="flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + escapeHtml(m.model) + '</span><span style="color:var(--primary);font-weight:600">' + parseInt(m.tokens).toLocaleString() + '</span></div>';
            }).join('');
        } else if(rankEl) {
          rankEl.innerHTML = '<div style="font-size:0.75rem;color:var(--text-muted);text-align:center;padding:0.5rem 0">No model usage data yet</div>';
        }
        // Activity
        const act=document.getElementById('dashActivity');
        const actCount=document.getElementById('activityCount');
        if(d.recent_activity&&d.recent_activity.length){
          actCount.textContent=d.recent_activity.length+' items';
          act.innerHTML=d.recent_activity.map(a=>{
            const isDeposit=a.type==='deposit';
            return `<div class="dash-activity-item"><div class="icon ${isDeposit?'gold':'green'}" style="width:36px;height:36px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:1rem;flex-shrink:0;background:${isDeposit?'var(--primary-subtle)':'var(--success-subtle)'}">${isDeposit?'💰':'🤖'}</div><div class="info" style="flex:1"><div class="title" style="font-size:0.85rem;font-weight:500">${escapeHtml(a.model||a.payment_method||a.type)}</div><div class="time" style="font-size:0.75rem;color:var(--text-muted)">${escapeHtml(a.created_at?new Date(a.created_at).toLocaleDateString():'')}</div></div><div class="val" style="font-size:0.85rem;font-weight:600;color:${isDeposit?'var(--primary)':'var(--destructive)'}">${isDeposit?'+':''}${a.tokens||0}</div></div>`
          }).join('');
        }else{
          actCount.textContent='0 items';
          act.innerHTML='<div class="empty-state" style="padding:1.5rem 1rem"><div class="empty-icon" style="font-size:2rem;opacity:0.35">📭</div><div class="empty-title" style="font-size:0.85rem">No activity yet</div><div class="empty-desc" style="font-size:0.75rem">Buy tokens or use AI models to see activity here.</div></div>';
        }
        // Transactions
        loadTxTable();
        // Dashboard API Keys
        loadDashKeys();
        // Activity Timeline (unified feed)
        loadActivity();
        // Available Models from New API
        loadAvailableModels();
        // Usage Analytics with filters
        loadUsageAnalytics(usageDays, usageModel, usageMode);
        populateModelFilter();
      }catch(e){showToast('Failed to load dashboard','error')}
    }
    async function loadDashKeys(){
      if(!token)return;
      try{
        const k=await api('GET','/api/keys');
        renderDashKeys(k);
      }catch(e){}
    }
    function renderDashKeys(k){
      const list=document.getElementById('dashKeyList');
      if(!list)return;
      if(!k||!k.length){list.innerHTML='<p style="color:var(--text-muted);text-align:center;padding:1.5rem;font-size:0.85rem">No API keys yet. <a onclick="showCreateKeyModal()" style="color:var(--primary);cursor:pointer">Create one</a>.</p>';return}
      keys=k;
      list.innerHTML=k.map(key=>`
        <div class="api-key-card" style="padding:0.75rem 1rem">
          <div class="key-info">
            <div class="key-name">'+escapeHtml(key.name)+'</div>
            <div class="key-val">'+escapeHtml(key.key_prefix)+'••••••••</div>
            <div class="meta">'+escapeHtml(key.permissions)+' · '+key.request_count+' requests · '+(key.is_active?'<span class="badge active">Active</span>':'<span class="badge inactive">Inactive</span>')+'</div>
          </div>
          <div class="key-actions">
            <button class="sort-btn" data-key-id="${key.id}" data-action="toggle">${key.is_active?'Pause':'Activate'}</button>
            <button class="sort-btn" style="color:var(--destructive)" data-key-id="${key.id}" data-action="delete">Delete</button>
          </div>
        </div>
      `).join('');
    }
    async function loadTxTable(){
      try{
        const d=await api('GET','/api/transactions?limit=5');
        const body=document.getElementById('dashTxBody');
        if(!d.items||!d.items.length){
          body.innerHTML='<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:1.5rem;font-size:0.85rem">No transactions</td></tr>';
          return;
        }
body.innerHTML=d.items.map(t=>'<tr><td>'+escapeHtml(t.created_at?new Date(t.created_at).toLocaleDateString():'')+'</td><td>'+escapeHtml(t.type)+'</td><td>'+escapeHtml(t.model_used||t.payment_method||'-')+'</td><td class="amount '+(t.type==='deposit'?'gold':'red')+'">'+(t.type==='deposit'?'+':'')+escapeHtml(String(t.tokens||0))+'</td><td><span style="color:var(--success)">'+escapeHtml(t.status)+'</span></td></tr>').join('');
      }catch(e){}
    }
    async function loadActivity(){
      var container=document.getElementById('dashActivity');
      var countEl=document.getElementById('activityCount');
      if(!container)return;
      try{
        var act=await api('GET','/api/activity');
        var items=act.items||[];
        if(!items.length){
          if(countEl)countEl.textContent='0 events';
          container.innerHTML='<div class="empty-state" style="padding:1.5rem 1rem"><div class="empty-icon" style="font-size:2rem;opacity:0.35">📭</div><div class="empty-title" style="font-size:0.85rem">No activity yet</div><div class="empty-desc" style="font-size:0.75rem">Buy tokens or make API calls to see activity here.</div></div>';
          return;
        }
        if(countEl)countEl.textContent=items.length+' events';
        container.innerHTML=items.map(function(a,i){
          var icon,colorCls,desc,val='';
          switch(a.type){
            case 'api_call': icon='🤖'; colorCls='var(--primary-subtle)'; desc=escapeHtml(a.model||'API call')+' · '+parseInt(a.tokens||0).toLocaleString()+' tok'+(a.cost?' · $'+a.cost.toFixed(6):''); break;
            case 'topup': icon='💰'; colorCls='var(--success-subtle)'; desc='Top-up '+(a.amount?'$'+a.amount.toFixed(2):'')+' · +'+parseInt(a.tokens||0).toLocaleString()+' tokens'; val='+'+parseInt(a.tokens||0); break;
            case 'key_created': icon='🔑'; colorCls='var(--border)'; desc='Created API key: '+escapeHtml(a.description||''); break;
            case 'key_deleted': icon='🗑️'; colorCls='var(--border)'; desc='Deleted API key: '+escapeHtml(a.description||''); break;
            case 'key_paused': icon='⏸️'; colorCls='var(--border)'; desc='Paused API key: '+escapeHtml(a.description||''); break;
            case 'consumption': icon='⚡'; colorCls='var(--success-subtle)'; desc=escapeHtml(a.model||'Consumption')+' · '+parseInt(a.tokens||0).toLocaleString()+' tokens'; val='-'+parseInt(a.tokens||0); break;
            default: icon='📋'; colorCls='var(--border)'; desc=escapeHtml(a.description||a.type||''); break;
          }
          var dt=a.created_at?new Date(a.created_at).toLocaleString():'';
          var expandId='act-expand-'+i;
          var hasLog=a.type==='api_call'&&a.log_id?' data-log-id="'+escapeHtml(String(a.log_id))+'" data-model="'+escapeHtml(a.model||'')+'" data-tokens="'+(a.tokens||0)+'" data-cost="'+(a.cost||0)+'"':'';
          return '<div class="dash-activity-item" style="cursor:'+(hasLog?'pointer':'default')+'"'+(hasLog?' onclick="toggleLogContent(this,'+"'"+expandId+"'"+')"':'')+'>'+
            '<div class="icon" style="width:36px;height:36px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:1rem;flex-shrink:0;background:'+colorCls+'">'+icon+'</div>'+
            '<div class="info" style="flex:1;min-width:0"><div class="title" style="font-size:0.85rem;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+desc+'</div><div class="time" style="font-size:0.75rem;color:var(--text-muted)">'+escapeHtml(dt)+'</div></div>'+
            (val?'<div class="val" style="font-size:0.85rem;font-weight:600;color:'+(a.type==='topup'?'var(--primary)':'var(--destructive)')+'">'+val+'</div>':'')+
            (hasLog?'<span style="font-size:0.7rem;color:var(--text-muted);margin-left:0.25rem">▶</span>':'')+
            '</div>'+
            (hasLog?'<div id="'+expandId+'" class="log-content" style="display:none;padding:0.5rem 0.75rem;margin:0 0.5rem 0.5rem 3.5rem;background:var(--bg-alt);border-radius:var(--radius-sm);font-size:0.75rem;max-height:200px;overflow-y:auto"><p style="color:var(--text-muted);text-align:center;padding:0.5rem">Loading...</p></div>':'');
        }).join('');
      }catch(e){
        container.innerHTML='<p style="color:var(--text-muted);font-size:0.85rem;text-align:center;padding:1rem">Failed to load activity.</p>';
      }
    }
    async function toggleLogContent(el,expandId){
      var expand=document.getElementById(expandId);
      if(!expand)return;
      if(expand.style.display!=='none'){
        expand.style.display='none';
        var arrow=el.querySelector('span:last-child');
        if(arrow)arrow.textContent='▶';
        return;
      }
      expand.style.display='block';
      var arrow=el.querySelector('span:last-child');
      if(arrow)arrow.textContent='▼';
      if(expand.getAttribute('data-loaded'))return;
      expand.setAttribute('data-loaded','true');
      var logId=el.getAttribute('data-log-id');
      if(!logId){expand.innerHTML='<p style="color:var(--text-muted);text-align:center;padding:0.5rem">No log data available</p>';return}
      try{
        var content=await api('GET','/api/logs/content?log_id='+logId);
        if(content.error||(!content.prompt&&!content.completion)){
          expand.innerHTML='<p style="color:var(--text-muted);text-align:center;padding:0.5rem">Log content not available</p>';
          return;
        }
        var model=el.getAttribute('data-model')||'';
        var tokens=el.getAttribute('data-tokens')||'0';
        var cost=el.getAttribute('data-cost')||'0';
        expand.innerHTML='<div style="margin-bottom:0.5rem;color:var(--text-muted);font-size:0.7rem">'+
          escapeHtml(model)+' · '+parseInt(tokens).toLocaleString()+' tok · $'+parseFloat(cost).toFixed(6)+
          '</div>'+
          (content.prompt?'<div style="margin-bottom:0.5rem"><div style="font-weight:600;margin-bottom:0.25rem;color:var(--primary);font-size:0.7rem">📤 Prompt</div><div style="background:var(--bg);padding:0.5rem;border-radius:4px;white-space:pre-wrap;word-break:break-word">'+escapeHtml(content.prompt.substring(0,2000))+(content.prompt.length>2000?'...':'')+'</div></div>':'')+
          (content.completion?'<div><div style="font-weight:600;margin-bottom:0.25rem;color:var(--success);font-size:0.7rem">📥 Completion</div><div style="background:var(--bg);padding:0.5rem;border-radius:4px;white-space:pre-wrap;word-break:break-word">'+escapeHtml(content.completion.substring(0,2000))+(content.completion.length>2000?'...':'')+'</div></div>':'');
      }catch(e){
        expand.innerHTML='<p style="color:var(--text-muted);text-align:center;padding:0.5rem">Failed to load content.</p>';
      }
    }
    async function loadUsageAnalytics(days,model,mode){
      var canvas=document.getElementById('dailyChart');
      if(!canvas)return;
      var summaryTotal=document.getElementById('usageTotalVal');
      var summaryCost=document.getElementById('usageCostVal');
      var summaryLabel=document.getElementById('usageTotalLabel');
      try{
        var params='?days='+(days||7);
        if(model)params+='&model='+encodeURIComponent(model);
        var data=await api('GET','/api/usage-analytics'+params);
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
            labels:(data.labels||[]).map(function(l){var p=l.split('-');return p[1]+'/'+p[2]}),
            datasets:[{label:label,data:values,backgroundColor:color,borderColor:border,borderWidth:1,borderRadius:4}]
          },
          options:{
            responsive:true,maintainAspectRatio:false,
            plugins:{legend:{display:false}},
            scales:{
              y:{beginAtZero:true,grid:{color:'rgba(255,255,255,0.05)'},ticks:{color:'var(--text-muted)',font:{size:10}}},
              x:{grid:{display:false},ticks:{color:'var(--text-muted)',font:{size:10}}}
            }
          }
        });
        if(summaryTotal)summaryTotal.textContent=(data.total_tokens||0).toLocaleString();
        if(summaryCost)summaryCost.textContent='$'+(data.total_cost||0).toFixed(2);
        if(summaryLabel)summaryLabel.innerHTML='Total: <strong>'+(data.total_tokens||0).toLocaleString()+'</strong> '+(isCost?'cost ($)':'tokens');
      }catch(e){
        if(summaryTotal)summaryTotal.textContent='0';
        if(summaryCost)summaryCost.textContent='$0.00';
      }
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
        var result=await api('GET','/api/available-models');
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
      try{
        var result=await api('GET','/api/available-models');
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
      }catch(e){
        container.innerHTML='<p style="color:var(--text-muted);font-size:0.85rem;text-align:center;padding:0.75rem">Failed to load models.</p>';
      }
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
          labels:dailyData.labels.map(function(l){var p=l.split('-');return p[1]+'/'+p[2]}),
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
            y:{beginAtZero:true,grid:{color:'rgba(255,255,255,0.05)'},ticks:{color:'var(--text-muted)',font:{size:10}}},
            x:{grid:{display:false},ticks:{color:'var(--text-muted)',font:{size:10}}}
          }
        }
      });
    }
    function updateCustomPricing(){
      var slider=document.getElementById('customSlider');
      if(!slider)return;
      var val=parseInt(slider.value)||50;
      var el1=document.getElementById('customPriceLabel')||document.getElementById('customPriceDisplay');
      var el2=document.getElementById('customTokensLabel')||document.getElementById('customTokensDisplay');
      var el3=document.getElementById('customBuyBtn');
      var el4=document.getElementById('topupTotal');
      if(el1)el1.textContent='$'+val;
      if(el2)el2.textContent=(val*1100).toLocaleString()+' Tokens';
      if(el3)el3.textContent='Buy $'+val;
      if(el4)el4.textContent='$'+val+'.00';
      selectedAmount=val;
    }
    function customCheckout(){
      const amt=parseInt(document.getElementById('customSlider').value||2);
      if(amt<2){showToast('Minimum $2','error');return}
      if(!token){showPage('register');return}
      selectedAmount=amt;showPage('topup');
    }
    function selectPackage(el,amount){
      document.querySelectorAll('.pricing-card').forEach(c=>c.classList.remove('selected'));
      el.classList.add('selected');
      selectedAmount=amount;
      document.getElementById('topupTotal').textContent='$'+amount.toFixed(2);
    }
    function selectCustomTopup(){
      document.querySelectorAll('.pricing-card').forEach(c=>c.classList.remove('selected'));
      var card=document.getElementById('customCard');card.classList.add('selected');
      updateCustomPricing();
    }
    function selectPayment(el,method){
      document.querySelectorAll('.payment-opt,.payment-card').forEach(p=>p.classList.remove('selected'));
      el.classList.add('selected');selectedPayment=method;
    }
    async function processTopup(){
      if(!token){showToast('Please login first','error');return}
      try{
        const d=await api('POST','/api/topup',{amount:selectedAmount,currency:'USD',payment_method:selectedPayment});
        userData.token_balance=d.new_balance;localStorage.setItem('gt_user',JSON.stringify(userData));updateBalance();
        document.getElementById('topupStep1').style.display='none';
        document.getElementById('topupSuccess').style.display='block';
        document.getElementById('topupSuccessMsg').textContent=d.tokens_added.toLocaleString()+' tokens added!';
        showToast('Payment successful!','success');
      }catch(e){showToast(e.message,'error')}
    }
    function showPaymentModal(amount){
      if(!token){showToast('Please login first','error');showPage('register');return}
      selectedAmount=amount==='custom'?parseInt(document.getElementById('customSlider').value||50):amount;
      document.getElementById('modalAmount').textContent='$'+selectedAmount.toFixed(2);
      document.getElementById('paymentModal').classList.add('open');
    }
    function closePaymentModal(e){
      if(e&&e.target!==e.currentTarget)return;
      document.getElementById('paymentModal').classList.remove('open');
    }
    function processModalPayment(){
      if(!selectedPayment){showToast('Select a payment method','error');return}
      document.getElementById('paymentModal').classList.remove('open');
      processTopup();
    }
    function startCheckout(amount){
      if(!token){showPage('register');return}
      selectedAmount=amount;showPage('topup');
    }

    // ── Models Grid ──
    let activeCategory = '';

    async function loadModels(){
      const grid=document.getElementById('modelGrid');
      const filter=document.getElementById('providerFilter');
      if(!grid)return;
      try{
        const m=await api('GET','/api/models');
        models=m;
        document.getElementById('modelCount').textContent=`${m.length} models loaded`;
        // Populate provider filter
        const provs=[...new Set(m.map(x=>x.provider))].sort();
        filter.innerHTML='<option value="">All Providers</option>'+provs.map(p=>`<option value="${escapeHtml(p)}">${escapeHtml(p)}</option>`).join('');
        // Populate category pills
        const cats = [...new Set(m.map(x => x.category).filter(Boolean))];
        const cpills = document.getElementById('catPills');
        if(cpills){
          let pillsHtml = '<span class="cat-pill active" data-cat="" onclick="filterByCategory(this)">All</span>';
          CATEGORY_ORDER.forEach(cl => {
            let key = null;
            for (const [k,v] of Object.entries(CATEGORY_META)) {
              if (v.label === cl) { key = k; break; }
            }
            if (key && cats.includes(key)) {
              const meta = getCatMeta(key);
              pillsHtml += `<span class="cat-pill" data-cat="${key}" onclick="filterByCategory(this)" style="--pill-color:${meta.color}">${meta.icon} ${meta.label}</span>`;
            }
          });
          cpills.innerHTML = pillsHtml;
        }
        renderModelCards(m);
        // No need to re-trigger translation — Google Translate widget handles dynamic content
      }catch(e){
        grid.innerHTML='<p style="color:var(--text-muted);text-align:center;padding:2rem">Backend not connected. Start the API server.</p>';
      }
    }
    const CATEGORY_META = {
      'Flagship':   { icon: '🚀', label: 'Flagship',   color: '#F4B400', bg: 'rgba(244,180,0,0.10)', border: 'rgba(244,180,0,0.25)', desc: 'Best all-around flagship models' },
      'Vision':     { icon: '👁️', label: 'Vision',     color: '#3B82F6', bg: 'rgba(59,130,246,0.10)', border: 'rgba(59,130,246,0.25)', desc: 'Multimodal & image understanding' },
      'Small':      { icon: '⚡', label: 'Fast & Cheap', color: '#22C55E', bg: 'rgba(34,197,94,0.10)', border: 'rgba(34,197,94,0.25)', desc: 'Budget-friendly workhorses' },
      'Reasoning':  { icon: '🧠', label: 'Reasoning',   color: '#A855F7', bg: 'rgba(168,85,247,0.10)', border: 'rgba(168,85,247,0.25)', desc: 'Deep thinking & logical reasoning' },
      'Flash':      { icon: '⚡', label: 'Flash',       color: '#06B6D4', bg: 'rgba(6,182,212,0.10)', border: 'rgba(6,182,212,0.25)', desc: 'Ultra-fast response models' },
      'Large':      { icon: '🏗️', label: 'Large Models', color: '#F97316', bg: 'rgba(249,115,22,0.10)', border: 'rgba(249,115,22,0.25)', desc: 'Large-scale open models' },
      'Search':     { icon: '🔍', label: 'Search',      color: '#6366F1', bg: 'rgba(99,102,241,0.10)', border: 'rgba(99,102,241,0.25)', desc: 'Web-connected search models' },
    };
    const CATEGORY_ORDER = ['Flagship','Fast & Cheap','Reasoning','Vision','Flash','Large Models','Search'];

    function getCatMeta(cat) {
      // Map display labels back to internal keys
      for (const [k, v] of Object.entries(CATEGORY_META)) {
        if (v.label === cat || k === cat) return v;
      }
      return { icon: '📦', label: cat || 'Other', color: 'var(--text-muted)', bg: 'var(--card)', border: 'var(--border)', desc: '' };
    }

    function renderModelCards(models){
      const grid=document.getElementById('modelGrid');
      if(!grid)return;
      const isMobile = window.innerWidth < 768;
      const showCount = isMobile ? 6 : 15; // 3 rows × cols
      // Group by category
      const groups = {};
      models.forEach(m => {
        const c = m.category || 'Other';
        if (!groups[c]) groups[c] = [];
        groups[c].push(m);
      });
      function buildCard(m, pmeta){
        const priceIn = (m.prompt_price * 1000).toFixed(4);
        const priceOut = (m.completion_price * 1000).toFixed(4);
        const name = escapeHtml(m.name || m.model_id.split('/').pop());
        const id = escapeHtml(m.model_id);
        const prov = escapeHtml(m.provider);
        const desc = m.description ? escapeHtml(m.description) : '';
        const ver = m.version ? `<span class="mc-version">v${escapeHtml(m.version)}</span>` : '';
        const bg = pmeta ? pmeta.bg : 'var(--primary-subtle)';
        const clr = pmeta ? pmeta.color : 'var(--primary)';
        const brd = pmeta ? pmeta.border : 'hsla(44,96%,52%,0.2)';
        const clrIcon = pmeta ? pmeta.color : 'var(--primary)';
        const catTag = pmeta ? `<span class="mc-cat-tag" style="background:${bg};color:${clr}">${pmeta.icon} ${escapeHtml(pmeta.label)}</span>` : '';
        return `<div class="model-card">
          <div class="mc-top">
            <span class="mc-badge" style="background:${bg};color:${clr};border-color:${brd}">${prov}</span>
            ${catTag}
          </div>
          <h4 class="mc-name">${name}</h4>
          <div class="mc-id">${id}</div>
          ${ver}
          ${desc ? `<div class="mc-desc">${desc}</div>` : ''}
          <div class="mc-meta">
            <span title="Context window">📐 ${(m.context_length/1000).toFixed(0)}K</span>
            <span title="Input price">⬇️ $${priceIn}/1K</span>
            <span title="Output price">⬆️ $${priceOut}/1K</span>
          </div>
        </div>`;
      }
      let html = '';
      // Render in predefined order
      CATEGORY_ORDER.forEach(clabel => {
        let key = null;
        for (const [k, v] of Object.entries(CATEGORY_META)) {
          if (v.label === clabel) { key = k; break; }
        }
        if (!key) key = clabel;
        const items = groups[key];
        if (!items) return;
        const meta = getCatMeta(key);
        html += `<div class="cat-header" style="--cat-color:${meta.color};--cat-bg:${meta.bg};--cat-border:${meta.border}">
          <span class="cat-icon">${meta.icon}</span>
          <span class="cat-name">${escapeHtml(meta.label)}</span>
          <span class="cat-count">${items.length}</span>
          ${meta.desc ? `<span class="cat-desc">${escapeHtml(meta.desc)}</span>` : ''}
        </div>`;
        html += '<div class="cat-body">';
        if (items.length > showCount) {
          html += items.slice(0, showCount).map(m => buildCard(m, getCatMeta(m.category))).join('');
          html += `<div class="cat-more-wrap" style="display:none">${items.slice(showCount).map(m => buildCard(m, getCatMeta(m.category))).join('')}</div>`;
          html += `<button class="cat-more-btn" onclick="toggleCatMore(this)" data-expanded="false">Show ${items.length - showCount} more ▾</button>`;
        } else {
          html += items.map(m => buildCard(m, getCatMeta(m.category))).join('');
        }
        html += '</div>';
        delete groups[key];
      });
      // Remaining uncategorized
      Object.keys(groups).forEach(c => {
        const meta = getCatMeta(c);
        html += `<div class="cat-header" style="--cat-color:${meta.color};--cat-bg:${meta.bg};--cat-border:${meta.border}">
          <span class="cat-icon">${meta.icon}</span>
          <span class="cat-name">${escapeHtml(meta.label)}</span>
          <span class="cat-count">${groups[c].length}</span>
        </div>`;
        html += '<div class="cat-body">';
        const items = groups[c];
        if (items.length > showCount) {
          html += items.slice(0, showCount).map(m => buildCard(m, null)).join('');
          html += `<div class="cat-more-wrap" style="display:none">${items.slice(showCount).map(m => buildCard(m, null)).join('')}</div>`;
          html += `<button class="cat-more-btn" onclick="toggleCatMore(this)" data-expanded="false">Show ${items.length - showCount} more ▾</button>`;
        } else {
          html += items.map(m => buildCard(m, null)).join('');
        }
        html += '</div>';
      });
      grid.innerHTML = html;
    }
    function toggleCatMore(btn){
      const wrap = btn.previousElementSibling;
      const exp = btn.getAttribute('data-expanded') === 'true';
      if (exp) {
        wrap.style.display = 'none';
        btn.textContent = btn.textContent.replace(/^Show less/, 'Show ' + (wrap.children.length) + ' more') + ' ▾';
        btn.setAttribute('data-expanded', 'false');
      } else {
        wrap.style.display = '';
        btn.textContent = 'Show less ▴';
        btn.setAttribute('data-expanded', 'true');
      }
    }
    function filterByCategory(el) {
      activeCategory = el.getAttribute('data-cat') || '';
      document.querySelectorAll('.cat-pill').forEach(p => p.classList.toggle('active', p === el));
      filterModelCards();
    }
    function filterModelCards(){
      const q=document.getElementById('modelSearch').value.toLowerCase();
      const p=document.getElementById('providerFilter').value;
      const filtered=models.filter(m=>{
        const matchName=m.model_id.toLowerCase().includes(q)||m.name.toLowerCase().includes(q)||m.provider.toLowerCase().includes(q);
        const matchCat=!activeCategory||(m.category===activeCategory);
        return matchName&&matchCat&&(!p||m.provider===p);
      });
      renderModelCards(filtered);
      document.getElementById('modelCount').textContent=`${filtered.length} of ${models.length} models`;
    }
    function toggleModelSort(){
      sortDir=sortDir==='price_asc'?'price_desc':'price_asc';
      document.getElementById('sortBtn').textContent=sortDir==='price_asc'?'↑ Price':'↓ Price';
      models.sort((a,b)=>sortDir==='price_asc'?a.prompt_price-b.prompt_price:b.prompt_price-a.prompt_price);
      filterModelCards();
    }

    // ── API Keys ──
    async function loadKeys(){
      if(!token)return;
      try{
        keys=await api('GET','/api/keys');
        renderKeys(keys);
      }catch(e){showToast('Failed to load keys','error')}
    }
    function renderKeys(k){
      const list=document.getElementById('keyList');
      if(!k||!k.length){list.innerHTML='<p style="color:var(--text-muted);text-align:center;padding:2rem;font-size:0.85rem">No API keys yet. Create one to get started.</p>';return}
      list.innerHTML=k.map(key=>`
        <div class="api-key-card">
          <div class="key-info">
            <div class="key-name">'+escapeHtml(key.name)+'</div>
            <div class="key-val">'+escapeHtml(key.key_prefix)+'••••••••</div>
            <div class="meta">'+escapeHtml(key.permissions)+' · ${key.request_count} requests · ${key.last_used?'Last used '+new Date(key.last_used).toLocaleDateString():'Never used'} · ${key.is_active?'<span class="badge active">Active</span>':'<span class="badge inactive">Inactive</span>'}</div>
          </div>
          <div class="key-actions">
            <button class="sort-btn" data-key-id="${key.id}" data-action="toggle">${key.is_active?'Pause':'Activate'}</button>
            <button class="sort-btn" style="color:var(--destructive)" data-key-id="${key.id}" data-action="delete">Delete</button>
          </div>
        </div>
      `).join('');
    }
    function showCreateKeyModal(){document.getElementById('createKeyModal').classList.add('open');document.getElementById('newKeyResult').style.display='none';document.getElementById('newKeyName').value='My API Key'}
    function closeCreateKeyModal(){document.getElementById('createKeyModal').classList.remove('open')}
    async function createApiKey(){
      const name=document.getElementById('newKeyName').value;
      const perms=document.getElementById('newKeyPerms').value;
      try{
        const d=await api('POST','/api/keys',{name,permissions:perms});
        document.getElementById('newKeyValue').textContent=d.key;
        document.getElementById('newKeyResult').style.display='block';
        loadKeys();
        loadDashKeys();
        showToast('Key created! Copy it now.','success');
      }catch(e){showToast(e.message,'error')}
    }
    async function toggleKeyStatus(id){
      const key=keys.find(k=>k.id===id);if(!key)return;
      try{await api('PUT',`/api/keys/${id}`,{is_active:!key.is_active});loadKeys()}catch(e){showToast(e.message,'error')}
    }
    async function deleteKey(id){
      showConfirm('Delete API Key?','This cannot be undone.',async function(){
        try{await api('DELETE',`/api/keys/${id}`);loadKeys();showToast('Key deleted','info')}catch(e){showToast(e.message,'error')}
      });
    }
    function sortKeys(mode){
      const s=[...keys];
      if(mode==='newest')s.sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));
      if(mode==='oldest')s.sort((a,b)=>new Date(a.created_at)-new Date(b.created_at));
      if(mode==='name')s.sort((a,b)=>a.name.localeCompare(b.name));
      if(mode==='usage')s.sort((a,b)=>b.request_count-a.request_count);
      renderKeys(s);
    }

    // ── Transactions ──
    async function loadTx(){
      if(!token)return;
      try{
        const d=await api('GET','/api/transactions?limit=50');
        const dep=d.items.filter(t=>t.type==='deposit');
        const con=d.items.filter(t=>t.type==='consumption');
        document.getElementById('txDepositBody').innerHTML=dep.length?dep.map(t=>'<tr><td>'+escapeHtml(t.created_at?new Date(t.created_at).toLocaleDateString():'')+'</td><td>$'+escapeHtml(t.amount.toFixed(2))+'</td><td>'+escapeHtml(t.payment_method||'-')+'</td><td class="gold">+'+escapeHtml(String(t.tokens||0))+'</td><td><span style="color:var(--success)">'+escapeHtml(t.status)+'</span></td></tr>').join(''):'<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:1.5rem">No deposits</td></tr>';
        document.getElementById('txConsumptionBody').innerHTML=con.length?con.map(t=>'<tr><td>'+escapeHtml(t.created_at?new Date(t.created_at).toLocaleDateString():'')+'</td><td>'+escapeHtml(t.model_used||'-')+'</td><td class="red">-'+escapeHtml(String(t.tokens||0))+'</td><td>API</td></tr>').join(''):'<tr><td colspan="4" style="text-align:center;color:var(--text-muted);padding:1.5rem">No consumption</td></tr>';
      }catch(e){}
    }
    function switchTxTab(el,tab){
      document.querySelectorAll('.tx-tab').forEach(t=>t.classList.remove('active'));
      el.classList.add('active');
      document.getElementById('txDeposits').style.display=tab==='deposits'?'block':'none';
      document.getElementById('txConsumption').style.display=tab==='consumption'?'block':'none';
    }

    // ── AI Chat (Homepage) ──
    let aiModel = 'gpt4o-mini';
    // ── Demo chat responses (removed for production) ──
    // AI chat now calls the backend proxy. See sendAIChatMsg below.
    function selectAIModelDropdown(model){
      aiModel = model;
      const badge = document.getElementById('aiModelBadge');
      const names = {'gpt4o-mini':'GPT-4o Mini','gpt4o':'GPT-4o','gpt4':'GPT-4 Turbo','claude-haiku':'Claude 3 Haiku','claude-sonnet':'Claude 3.5 Sonnet','claude-opus':'Claude 3 Opus','gemini-flash':'Gemini 2.0 Flash','gemini-pro':'Gemini 2.0 Pro','llama-scout':'Llama 4 Scout','llama-maverick':'Llama 4 Maverick','deepseek-flash':'DeepSeek V3 Flash','deepseek-v4':'DeepSeek V4 Pro','deepseek-r1':'DeepSeek R1','mistral-small':'Mistral Small','mistral-large':'Mistral Large 2','qwen-plus':'Qwen 3.7 Plus','grok-4':'Grok 4.20','command-a':'Command A','phi-4':'Phi-4'};
      if(badge) badge.textContent = names[model] || model;
      const welcome = document.getElementById('aiWelcome');
      if(welcome) welcome.style.display='flex';
    }
    function sendAIChatMsg(){
      const input = document.getElementById('aiChatInput');
      const msg = input.value.trim();
      if(!msg) return;
      const msgs = document.getElementById('aiChatMsgs');
      // Hide welcome
      const welcome = document.getElementById('aiWelcome');
      if(welcome) welcome.style.display='none';
      // Add user message
      const userDiv = document.createElement('div');
      userDiv.className = 'chat-msg user';
      userDiv.innerHTML = '<div class="av">U</div><div class="bubble">'+escapeHtml(msg)+'</div>';
      msgs.appendChild(userDiv);
      input.value = '';
      // Keep keyboard open on mobile — immediate focus + RAF chain
      input.focus();
      requestAnimationFrame(function(){ input.focus(); requestAnimationFrame(function(){ input.focus(); }); });
      msgs.scrollTop = msgs.scrollHeight;
      // Disable button
      const btn = document.getElementById('aiSendBtn');
      btn.disabled = true;
      btn.textContent = '⋯';
      // Add typing indicator
      const typingDiv = document.createElement('div');
      typingDiv.className = 'chat-msg ai';
      typingDiv.id = 'aiTyping';
      typingDiv.innerHTML = '<div class="av">🤖</div><div class="bubble"><div class="ai-typing"><span></span><span></span><span></span></div></div>';
      msgs.appendChild(typingDiv);
      msgs.scrollTop = msgs.scrollHeight;
      // Call backend proxy
      (async () => {
        try {
          const data = await api('POST','/api/proxy/chat',{model: aiModel, message: msg});
          document.getElementById('aiTyping').remove();
          const aiDiv = document.createElement('div');
          aiDiv.className = 'chat-msg ai';
          aiDiv.innerHTML = '<div class="av">🤖</div><div class="bubble">'+escapeHtml(data.response || data.choices?.[0]?.message?.content || 'No response')+'</div>';
          msgs.appendChild(aiDiv);
          msgs.scrollTop = msgs.scrollHeight;
        } catch(e){
          const typing = document.getElementById('aiTyping');
          if(typing) typing.remove();
          const aiDiv = document.createElement('div');
          aiDiv.className = 'chat-msg ai';
          aiDiv.innerHTML = '<div class="av">🤖</div><div class="bubble" style="color:var(--destructive)">Connection error. Please try again.</div>';
          msgs.appendChild(aiDiv);
          msgs.scrollTop = msgs.scrollHeight;
        }
        btn.disabled = false;
        btn.textContent = '➤';
      })();
    }
    // ── Shared helpers ──
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
      document.body.style.overflow = hide ? 'hidden' : '';
      const fab = document.querySelector('.chat-fab');
      if(fab) fab.style.display = hide ? 'none' : '';
    }
    // Auto-resize textareas
    document.addEventListener('DOMContentLoaded',function(){
      setupTextareaResize('aiChatInput');
      setupTextareaResize('chatInput');
      const ta = document.getElementById('aiChatInput');
      if(ta) ta.addEventListener('focus',openMobileChat);
      // Auto-init for this page
      const pageId = location.pathname.split('/').pop().replace('.html','') || 'home';
      if(token){refreshMe();applyAuth()}
      if(pageId==='dashboard'&&token){loadDashboard();refreshMe()}
      if(pageId==='apikeys'&&token)loadKeys();
      if(pageId==='history'&&token)loadTx();
      if(pageId==='models')loadModels();
      if(pageId==='referral'&&token){if(typeof loadReferralStats==='function')loadReferralStats();}
      if(pageId==='team'&&token){if(typeof loadOrgs==='function')loadOrgs();}
      if(pageId==='playground'&&token){if(typeof loadConversations==='function')loadConversations();if(typeof loadPlaygroundModels==='function')loadPlaygroundModels();}
    });
    // Parse URL error param (from Auth0 callback failure redirect)
    (function(){
      const params = new URLSearchParams(window.location.search);
      const err = params.get('error');
      if(err) { try { showToast(decodeURIComponent(err), 'error'); } catch(e) { showToast('Login error', 'error'); } }
    })();
    // ── Mobile AI Chat popup ──
    function openMobileChat(){
      if(window.innerWidth>768)return;
      // Close support chat first if open
      if(document.getElementById('chatWindow').classList.contains('chat-focused')){
        closeMobileSupportChat();
      }
      const section=document.querySelector('.ai-chat-section');
      if(!section) return;
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
    }
    // ── Support Chat ──
    function toggleChat(){
      const win = document.getElementById('chatWindow');
      if(!win) return;
      if(window.innerWidth > 768){
        win.classList.toggle('open');
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
    }
    function closeMobileSupportChat(){
      const win = document.getElementById('chatWindow');
      if(!win) return;
      win.classList.remove('chat-focused');
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
    }
    // ── Draggable Chat FAB (mobile touch) ──
    (function(){
      var fab = document.querySelector('.chat-fab');
      if(!fab) return;
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
    function sendChatMsg(inputOverride){
      if(_sendingMsg) return;
      const input=inputOverride||document.getElementById('chatInput');
      const btn=document.getElementById('chatSendBtn');
      const msg=(input&&input.value?input.value:'').trim();if(!msg)return;
      _sendingMsg = true;
      if(btn){btn.disabled=true;btn.style.opacity='0.5'}
      const msgs=document.getElementById('chatMsgs');
      const userHtml='<div class="chat-msg user"><div class="av">U</div><div class="bubble">'+escapeHtml(msg)+'</div></div>';
      msgs.innerHTML+=userHtml;
      // Clear input WITHOUT losing focus — set value directly, don't blur
      if(input) { var oldVal=input.value; input.value=''; }
      saveChatHistory();
      // Keep keyboard open on mobile — immediate + RAF + setTimeout cascade
      if(window.innerWidth <= 768 && input){
        // Use onmousedown-style prevention: refocus before browser blur completes
        input.focus({preventScroll:true});
        requestAnimationFrame(function(){ if(input) input.focus({preventScroll:true}); });
      }
      // Acknowledge receipt
      setTimeout(()=>{
        const aiHtml='<div class="chat-msg ai"><div class="av">🤖</div><div class="bubble">Thanks for your message. Our support team will get back to you at the email on file. For urgent issues, contact support@glbtoken.com</div></div>';
        msgs.innerHTML+=aiHtml;msgs.scrollTop=msgs.scrollHeight;
        saveChatHistory();
        _sendingMsg = false;
        if(btn){btn.disabled=false;btn.style.opacity='1'}
        // Refocus input on mobile after lockout release
        if(window.innerWidth <= 768 && input) {
          input.focus({preventScroll:true});
          requestAnimationFrame(function(){ if(input) input.focus({preventScroll:true}); });
        }
      },1000);
      msgs.scrollTop=msgs.scrollHeight;
    }

    // ── Chat History Persistence (localStorage) ──
    function saveChatHistory(){
      var msgs=document.getElementById('chatMsgs');
      if(!msgs)return;
      var chatHistory=[];
      msgs.querySelectorAll('.chat-msg').forEach(function(el){
        var role=el.classList.contains('user')?'user':'ai';
        var bubble=el.querySelector('.bubble');
        if(bubble) chatHistory.push({role:role,text:bubble.textContent});
      });
      try{localStorage.setItem('gt_chat_history',JSON.stringify(chatHistory))}catch(e){}
    }
    function loadChatHistory(){
      var msgs=document.getElementById('chatMsgs');
      if(!msgs)return;
      try{
        var data=localStorage.getItem('gt_chat_history');
        if(!data)return;
        var chatHistory=JSON.parse(data);
        if(!chatHistory||!chatHistory.length)return;
        msgs.innerHTML='';
        chatHistory.forEach(function(h){
          var cls=h.role==='user'?'user':'ai';
          var av=h.role==='user'?'U':'🤖';
          msgs.innerHTML+='<div class="chat-msg '+cls+'"><div class="av">'+av+'</div><div class="bubble">'+escapeHtml(h.text)+'</div></div>';
        });
        msgs.scrollTop=msgs.scrollHeight;
      }catch(e){}
    }
    // Load history on page load
    if(document.readyState==='loading'){
      document.addEventListener('DOMContentLoaded',loadChatHistory);
    } else {
      loadChatHistory();
    }

    // ── Toast ──
    function showToast(msg,type){
      var t=document.getElementById('toast');
      if(!t){t=document.createElement('div');t.id='toast';document.body.appendChild(t)}
      t.textContent=msg;t.className='toast '+(type||'info');t.classList.add('show');
      clearTimeout(t._timeout);t._timeout=setTimeout(function(){t.classList.remove('show')},3000);
    }

    // ── Themed confirmation dialog ──
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
        +'<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#F4B400" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="margin-bottom:0.75rem"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>'
        +'<h3 style="color:'+textClr+';font-size:1.1rem;font-weight:700;margin:0 0 0.5rem">'+escapeHtml(title)+'</h3>'
        +'<p style="color:'+muted+';font-size:0.85rem;margin:0 0 1.5rem;line-height:1.5">'+escapeHtml(msg)+'</p>'
        +'<div style="display:flex;gap:0.75rem">'
        +'<button id="confirmCancelBtn" style="flex:1;padding:0.65rem;border-radius:10px;border:1px solid '+border+';background:transparent;color:'+textClr+';font-size:0.85rem;font-weight:500;cursor:pointer">Cancel</button>'
        +'<button id="confirmOkBtn" style="flex:1;padding:0.65rem;border-radius:10px;border:none;background:#F4B400;color:#0A0B14;font-size:0.85rem;font-weight:600;cursor:pointer">'+escapeHtml(confirmText)+'</button>'
        +'</div></div>';
      document.body.appendChild(m);
      // Style keyframes if not present
      if(!document.getElementById('confirmModalStyle')){
        var s=document.createElement('style');s.id='confirmModalStyle';
        s.textContent='@keyframes fadeIn{from{opacity:0}to{opacity:1}}@keyframes slideUp{from{transform:translateY(20px);opacity:0}to{transform:translateY(0);opacity:1}}';
        document.head.appendChild(s);
      }
      document.getElementById('confirmCancelBtn').onclick=function(){m.remove()};
      document.getElementById('confirmOkBtn').onclick=function(){m.remove();if(onConfirm)onConfirm()};
      // Close on backdrop click
      m.onclick=function(e){if(e.target===m)m.remove()};
    }
    // ── Themed alert dialog ──
    function showAlert(title, msg){
      var existing=document.getElementById('alertModal');
      if(existing)existing.remove();
      var m=document.createElement('div');
      m.id='alertModal';
      m.style.cssText='position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.5);animation:fadeIn 0.15s ease';
      var theme=document.documentElement.className;
      var isDark=theme==='dark';
      var cardBg=isDark?'#1e1f29':'#ffffff';
      var textClr=isDark?'#f8f8f2':'#1a1a2e';
      var muted=isDark?'#6272a4':'#666';
      var border=isDark?'#3a3a4e':'#ddd';
      m.innerHTML='<div style="background:'+cardBg+';border:1px solid '+border+';border-radius:16px;padding:2rem;max-width:360px;width:90%;box-shadow:0 16px 48px rgba(0,0,0,0.3);text-align:center;animation:slideUp 0.2s ease">'
        +'<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#00D68F" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="margin-bottom:0.75rem"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>'
        +'<h3 style="color:'+textClr+';font-size:1.1rem;font-weight:700;margin:0 0 0.5rem">'+escapeHtml(title)+'</h3>'
        +'<p style="color:'+muted+';font-size:0.85rem;margin:0 0 1.25rem;line-height:1.5">'+escapeHtml(msg)+'</p>'
        +'<button id="alertOkBtn" style="width:100%;padding:0.65rem;border-radius:10px;border:none;background:#F4B400;color:#0A0B14;font-size:0.85rem;font-weight:600;cursor:pointer">OK</button>'
        +'</div></div>';
      document.body.appendChild(m);
      document.getElementById('alertOkBtn').onclick=function(){m.remove()};
      m.onclick=function(e){if(e.target===m)m.remove()};
    }
    // ── Session Expired gentle modal ──
    var _sessionExpiredShown = false;
    function showSessionExpired(){
      if(_sessionExpiredShown) return;
      _sessionExpiredShown = true;
      var existing=document.getElementById('sessionExpiredModal');
      if(existing)return;
      document.body.style.overflow = 'hidden';
      var m=document.createElement('div');
      m.id='sessionExpiredModal';
      m.style.cssText='position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.6);animation:fadeIn 0.15s ease';
      var theme=document.documentElement.className;
      var isDark=theme==='dark';
      var cardBg=isDark?'#1e1f29':'#ffffff';
      var textClr=isDark?'#f8f8f2':'#1a1a2e';
      var muted=isDark?'#6272a4':'#666';
      var border=isDark?'#3a3a4e':'#ddd';
      m.innerHTML='<div style="background:'+cardBg+';border:1px solid '+border+';border-radius:16px;padding:2rem;max-width:360px;width:90%;box-shadow:0 16px 48px rgba(0,0,0,0.3);text-align:center;animation:slideUp 0.2s ease">'
        +'<svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#F4B400" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="margin-bottom:0.75rem"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>'
        +'<h3 style="color:'+textClr+';font-size:1.1rem;font-weight:700;margin:0 0 0.5rem">Session Expired</h3>'
        +'<p style="color:'+muted+';font-size:0.85rem;margin:0 0 1.5rem;line-height:1.5">Your session has expired. Please log in again to continue using GlbTOKEN.</p>'
        +'<button id="sessionLoginBtn" style="width:100%;padding:0.65rem;border-radius:10px;border:none;background:#F4B400;color:#0A0B14;font-size:0.85rem;font-weight:600;cursor:pointer">Log In</button>'
        +'<a href="#" id="sessionDismissBtn" style="display:inline-block;margin-top:1rem;color:'+muted+';font-size:0.85rem;text-decoration:none;cursor:pointer">Continue browsing →</a>'
        +'</div></div>';
      document.body.appendChild(m);
      document.getElementById('sessionLoginBtn').onclick=function(){
        m.remove();
        document.body.style.overflow = '';
        _sessionExpiredShown=false;
        token='';userData={};
        localStorage.removeItem('gt_token');localStorage.removeItem('gt_user');
        window.location.href='login.html';
      };
      // Modal cannot be dismissed by clicking outside — only Log In works
      // Industry standard: intercept back/forward navigation → redirect to login
      function _onPopState(){ window.location.href='login.html'; }
      window.addEventListener('popstate',_onPopState);
      // Clean up the listener when user clicks Log In
      var _origBtn=m.querySelector('#sessionLoginBtn').onclick;
      m.querySelector('#sessionLoginBtn').onclick=function(){
        window.removeEventListener('popstate',_onPopState);
        _origBtn.call(this);
      };
      // Continue browsing — clears session, goes to homepage in guest mode
      document.getElementById('sessionDismissBtn').onclick=function(e){
        e.preventDefault();
        window.removeEventListener('popstate',_onPopState);
        token='';userData={};
        localStorage.removeItem('gt_token');localStorage.removeItem('gt_user');
        localStorage.removeItem('gt_newapi_token');localStorage.removeItem('gt_newapi_endpoint');
        localStorage.removeItem('gt_keys');
        applyAuth();
        m.remove();
        document.body.style.overflow = '';
        _sessionExpiredShown=false;
        window.location.href='/';
      };
    }
    // ── Dash sidebar: close sidebar first when tapping any item ──
    document.addEventListener('click',function(e){
      var item=e.target.closest('.dash-sidebar-item');
      if(!item)return;
      var sb=document.getElementById('dashSidebar');
      if(!sb)return;
      // Close sidebar immediately
      sb.classList.remove('open');
      var toggle=document.getElementById('dashSidebarToggle');
      if(toggle)toggle.classList.remove('hidden');
      // If the link points to the current page, prevent reload
      var href=item.getAttribute('href');
      if(href){
        var curPage=window.location.pathname.split('/').pop()||'dashboard.html';
        var targetPage=href.split('#')[0].split('?')[0]||'dashboard.html';
        if(targetPage===curPage||(targetPage==='dashboard.html'&&curPage==='')){
          e.preventDefault();
        }
      }
    });
    // ── Themed prompt dialog ──
    function showPrompt(title, placeholder, onSubmit){
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
        +'<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#F4B400" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="margin-bottom:0.75rem"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>'
        +'<h3 style="color:'+textClr+';font-size:1.1rem;font-weight:700;margin:0 0 0.5rem">'+escapeHtml(title)+'</h3>'
        +'<input id="promptInput" type="text" placeholder="'+escapeHtml(placeholder||'')+'" style="width:100%;padding:0.65rem 0.75rem;border-radius:10px;border:1px solid '+border+';background:'+cardBg+';color:'+textClr+';font-size:0.9rem;margin:.75rem 0 1rem;box-sizing:border-box;outline:none" />'
        +'<div style="display:flex;gap:0.75rem">'
        +'<button id="promptCancelBtn" style="flex:1;padding:0.65rem;border-radius:10px;border:1px solid '+border+';background:transparent;color:'+textClr+';font-size:0.85rem;font-weight:500;cursor:pointer">Cancel</button>'
        +'<button id="promptOkBtn" style="flex:1;padding:0.65rem;border-radius:10px;border:none;background:#F4B400;color:#0A0B14;font-size:0.85rem;font-weight:600;cursor:pointer">Create</button>'
        +'</div></div>';
      document.body.appendChild(m);
      var input = document.getElementById('promptInput');
      input.focus();
      document.getElementById('promptCancelBtn').onclick=function(){m.remove()};
      document.getElementById('promptOkBtn').onclick=function(){m.remove(); var v=input.value.trim(); if(v)onSubmit(v);};
      m.onclick=function(e){if(e.target===m)m.remove()};
      input.addEventListener('keydown',function(e){if(e.key==='Enter'){m.remove();var v=input.value.trim();if(v)onSubmit(v);}});
    }

/* ══════════════════════════════════════════
   UI — Mobile menu, chat, referral, copy, toast
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
      try{
        var all=await api('GET','/api/models',null,8000);
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
        container.innerHTML=html;
      }catch(e){
        // API failed (backend down) — restore original HTML so carousel doesn't go blank
        container.innerHTML=fallbackHtml;
      }
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
// ── Lang menu toggle ──
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

// ── Referral System Functions ──

async function loadReferralStats() {
  if(!token)return;
  try {
    const d=await api('GET','/api/referral/stats');
    const codeEl=document.getElementById('refCode');
    const countEl=document.getElementById('refCount');
    const earnEl=document.getElementById('refEarnings');
    if(codeEl) codeEl.textContent=d.code||'—';
    if(countEl) countEl.textContent=d.referral_count||0;
    if(earnEl) earnEl.textContent=(d.total_earnings||0).toFixed(2);
    const tableBody=document.getElementById('refTableBody');
    if(tableBody&&d.referrals&&d.referrals.length){
      tableBody.innerHTML=d.referrals.map(function(r){
        return '<tr><td>'+escapeHtml(r.email||r.name||'—')+'</td><td>'+escapeHtml(r.status||'joined')+'</td><td>'+(r.joined_at?new Date(r.joined_at).toLocaleDateString():'—')+'</td><td class="gold">+'+(r.reward||0)+'</td></tr>';
      }).join('');
    }else if(tableBody){
      tableBody.innerHTML='<tr><td colspan="4" style="text-align:center;color:var(--text-muted);padding:1.5rem">No referrals yet</td></tr>';
    }
    // Chart
    const chartEl=document.getElementById('refChart');
    if(chartEl&&d.history&&d.history.length&&typeof Chart!=='undefined'){
      if(window._refChartInst)window._refChartInst.destroy();
      window._refChartInst=new Chart(chartEl,{
        type:'line',
        data:{labels:d.history.map(function(h){return h.date}),datasets:[{label:'Referrals',data:d.history.map(function(h){return h.count}),borderColor:'#F4B400',backgroundColor:'rgba(244,180,0,0.1)',fill:true,tension:0.3}]},
        options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{labels:{color:'var(--text-muted)',font:{size:10}}}},scales:{y:{beginAtZero:true,grid:{color:'rgba(255,255,255,0.05)'},ticks:{color:'var(--text-muted)'}},x:{grid:{display:false},ticks:{color:'var(--text-muted)'}}}}
      });
    }
  }catch(e){showToast('Failed to load referral stats','error')}
}

async function generateReferralCode() {
  if(!token){showToast('Please sign in','error');return}
  try {
    const d=await api('POST','/api/referral/code');
    const codeEl=document.getElementById('refCode');
    if(codeEl) codeEl.textContent=d.code;
    showToast('New referral code generated!','success');
  }catch(e){showToast(e.message||'Failed to generate code','error')}
}

function copyReferralCode() {
  const codeEl=document.getElementById('refCode');
  if(!codeEl||!codeEl.textContent||codeEl.textContent==='—'){showToast('No code to copy','error');return}
  const code=codeEl.textContent;
  if(navigator.clipboard){
    navigator.clipboard.writeText(code).then(function(){showToast('Referral code copied!','success')}).catch(function(){});
  }else{
    const ta=document.createElement('textarea');ta.value=code;document.body.appendChild(ta);ta.select();document.execCommand('copy');document.body.removeChild(ta);showToast('Referral code copied!','success');
  }
}

async function loadReferralRewards() {
  if(!token)return;
  try {
    const d=await api('GET','/api/referral/rewards');
    const body=document.getElementById('refRewardsBody');
    if(!body)return;
    if(!d||!d.length){body.innerHTML='<tr><td colspan="4" style="text-align:center;color:var(--text-muted);padding:1.5rem">No rewards yet</td></tr>';return}
    body.innerHTML=d.map(function(r){
      return '<tr><td>'+escapeHtml(r.from||'—')+'</td><td class="gold">+'+escapeHtml(String(r.amount||0))+'</td><td>'+escapeHtml(r.reason||'referral')+'</td><td>'+(r.created_at?new Date(r.created_at).toLocaleDateString():'—')+'</td></tr>';
    }).join('');
  }catch(e){showToast('Failed to load rewards','error')}
}

async function claimRewards() {
  if(!token){showToast('Please sign in','error');return}
  try {
    const d=await api('POST','/api/referral/claim');
    if(d.new_balance!==undefined){userData.token_balance=d.new_balance;localStorage.setItem('gt_user',JSON.stringify(userData));updateBalance()}
    loadReferralRewards();
    loadReferralStats();
    showToast('Rewards claimed!','success');
  }catch(e){showToast(e.message||'Failed to claim rewards','error')}
}

// ── Team / Org Functions ──

async function loadOrgs() {
  if(!token)return;
  try {
    const d=await api('GET','/api/orgs');
    const selector=document.getElementById('orgSelector');
    if(!selector)return;
    const orgs=d.orgs||d||[];
    if(!orgs.length){
      // API returned no orgs — keep demo data visible instead of replacing
      return;
    }
    selector.innerHTML='<option value="">Select organization</option>'+orgs.map(function(o){return '<option value="'+escapeHtml(String(o.id))+'">'+escapeHtml(o.name||'Org '+o.id)+'</option>';}).join('');
    if(orgs.length===1){selector.value=orgs[0].id;switchOrg(orgs[0].id)}
  }catch(e){showToast('Failed to load organizations','error')}
}

async function switchOrg(orgId) {
  if(!orgId){document.getElementById('orgDetails').innerHTML='<div class="empty-state"><div class="empty-icon">🏢</div><div class="empty-title">Select an organization</div></div>';return}
  await loadOrgDetails(orgId);
}

async function loadOrgDetails(orgId) {
  if(!token||!orgId)return;
  try {
    const d=await api('GET','/api/orgs/'+orgId);
    const container=document.getElementById('orgDetails');
    if(!container)return;
    if(d.error){container.innerHTML='<p style="color:var(--destructive);text-align:center;padding:1rem">'+escapeHtml(d.error)+'</p>';return}
    let html='<div class="org-header"><h3>'+escapeHtml(d.name||'Organization')+'</h3><span style="color:var(--text-muted);font-size:0.85rem">'+(d.member_count||0)+' members</span></div>';
    html+='<div class="member-list">';
    if(d.members&&d.members.length){
      d.members.forEach(function(m){
        const roleCls=m.role==='owner'?'badge-role-owner':m.role==='admin'?'badge-role-admin':'badge-role-member';
        html+='<div class="member-row"><span class="member-avatar">'+(m.name?m.name[0].toUpperCase():'?')+'</span><span class="member-name">'+escapeHtml(m.name||m.email||'User')+'</span><span class="role-badge '+roleCls+'">'+escapeHtml(m.role||'member')+'</span></div>';
      });
    }else{
      html+='<p style="color:var(--text-muted);text-align:center;padding:1rem;font-size:0.85rem">No members found</p>';
    }
    html+='</div>';
    container.innerHTML=html;
  }catch(e){showToast('Failed to load organization details','error')}
}

async function createOrg() {
  if(!token){showToast('Please sign in','error');return}
  const nameEl=document.getElementById('orgNameInput');
  if(!nameEl||!nameEl.value.trim()){showToast('Enter an organization name','error');return}
  try {
    const d=await api('POST','/api/orgs',{name:nameEl.value.trim()});
    nameEl.value='';
    document.getElementById('createOrgModal').classList.remove('open');
    loadOrgs();
    showToast('Organization created!','success');
  }catch(e){showToast(e.message||'Failed to create organization','error')}
}

async function inviteMember(orgId) {
  if(!token||!orgId){showToast('Select an organization first','error');return}
  const emailEl=document.getElementById('inviteEmail');
  const roleEl=document.getElementById('inviteRole');
  if(!emailEl||!emailEl.value.trim()){showToast('Enter an email address','error');return}
  try {
    await api('POST','/api/orgs/'+orgId+'/invite',{email:emailEl.value.trim(),role:roleEl?roleEl.value:'member'});
    emailEl.value='';
    showToast('Invitation sent!','success');
    loadOrgDetails(orgId);
  }catch(e){showToast(e.message||'Failed to send invitation','error')}
}

async function updateMemberRole(orgId, userId, role) {
  if(!token)return;
  try {
    await api('PUT','/api/orgs/'+orgId+'/members/'+userId+'/role',{role:role});
    loadOrgDetails(orgId);
    showToast('Member role updated','success');
  }catch(e){showToast(e.message||'Failed to update role','error')}
}

async function removeMember(orgId, userId) {
  if(!token)return;
  showConfirm('Remove member?','This action cannot be undone.',async function(){
    try {
      await api('DELETE','/api/orgs/'+orgId+'/members/'+userId);
      loadOrgDetails(orgId);
      showToast('Member removed','info');
    }catch(e){showToast(e.message||'Failed to remove member','error')}
  });
}

async function leaveOrg(orgId) {
  if(!token||!orgId)return;
  showConfirm('Leave organization?','You will lose access to this organization.',async function(){
    try {
      await api('DELETE','/api/orgs/'+orgId+'/members/me');
      loadOrgs();
      document.getElementById('orgDetails').innerHTML='<div class="empty-state"><div class="empty-icon">👋</div><div class="empty-title">You left the organization</div></div>';
      showToast('Left organization','info');
    }catch(e){showToast(e.message||'Failed to leave organization','error')}
  });
}

async function joinOrg(inviteToken) {
  if(!token){showToast('Please sign in','error');return}
  try {
    const d=await api('POST','/api/orgs/join',{invite_token:inviteToken});
    loadOrgs();
    showToast('Joined organization!','success');
  }catch(e){showToast(e.message||'Failed to join organization','error')}
}

// ── Login History Functions ──

let loginHistoryOffset=0;
const LOGIN_PAGE_SIZE=20;

async function loadLoginHistory(offset) {
  if(!token)return;
  const off=offset!==undefined?offset:0;
  try {
    const d=await api('GET','/api/auth/login-history?offset='+off+'&limit='+LOGIN_PAGE_SIZE);
    const body=document.getElementById('loginHistoryBody');
    if(!body)return;
    const events=d.events||d||[];
    if(!events.length&&off===0){body.innerHTML='<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:2rem">No login history</td></tr>';return}
    if(off===0) body.innerHTML='';
    events.forEach(function(e){body.innerHTML+=renderLoginRow(e);});
    loginHistoryOffset=off+events.length;
    const loadMore=document.getElementById('loginLoadMore');
    if(loadMore) loadMore.style.display=events.length<LOGIN_PAGE_SIZE?'none':'block';
  }catch(e){showToast('Failed to load login history','error')}
}

function renderLoginRow(event) {
  const deviceIcon=event.device_type==='mobile'?'📱':event.device_type==='tablet'?'📲':'💻';
  const statusBadge=event.success?'<span class="badge-success">Success</span>':'<span class="badge-failed">Failed</span>';
  const ip=escapeHtml(event.ip_address||'—');
  const location=escapeHtml(event.location||'—');
  const date=event.created_at?new Date(event.created_at).toLocaleString():'—';
  const device=escapeHtml(event.device_name||event.device_type||'—');
  return '<tr class="history-row"><td><span class="device-icon">'+deviceIcon+'</span><span>'+device+'</span></td><td><span class="location-tag">'+location+'</span></td><td>'+ip+'</td><td>'+statusBadge+'</td><td>'+date+'</td></tr>';
}

function filterLoginHistory() {
  const dateFilter=document.getElementById('loginDateFilter');
  const deviceFilter=document.getElementById('loginDeviceFilter');
  const statusFilter=document.getElementById('loginStatusFilter');
  const rows=document.querySelectorAll('#loginHistoryBody .history-row');
  rows.forEach(function(row){
    let show=true;
    if(dateFilter&&dateFilter.value){
      if(!row.textContent.toLowerCase().includes(dateFilter.value.toLowerCase())) show=false;
    }
    if(deviceFilter&&deviceFilter.value&&deviceFilter.value!=='all'){
      const deviceIcon=row.querySelector('.device-icon');
      if(deviceIcon){
        const iconText=deviceIcon.textContent;
        if(deviceFilter.value==='mobile'&&iconText!=='📱'&&iconText!=='📲') show=false;
        if(deviceFilter.value==='desktop'&&iconText!=='💻') show=false;
      }
    }
    if(statusFilter&&statusFilter.value&&statusFilter.value!=='all'){
      const hasSuccess=row.querySelector('.badge-success');
      const hasFailed=row.querySelector('.badge-failed');
      if(statusFilter.value==='success'&&!hasSuccess) show=false;
      if(statusFilter.value==='failed'&&!hasFailed) show=false;
    }
    row.style.display=show?'':'none';
  });
}

// ── Playground Functions ──

let playgroundMessages=[];
let playgroundCurrentId=null;

function createNewChat() {
  playgroundMessages=[];
  playgroundCurrentId=null;
  const msgsEl=document.getElementById('playgroundMessages');
  if(msgsEl) msgsEl.innerHTML='';
  const inputEl=document.getElementById('playgroundInput');
  if(inputEl) inputEl.value='';
  const titleEl=document.getElementById('playgroundTitle');
  if(titleEl) titleEl.textContent='New Chat';
  const sidebar=document.querySelector('.playground-sidebar .conv-list');
  if(sidebar) sidebar.querySelectorAll('.conv-item').forEach(function(e){e.classList.remove('active');});
}

async function loadConversations() {
  if(!token)return;
  try {
    const d=await api('GET','/api/playground/conversations');
    const list=document.querySelector('.playground-sidebar .conv-list');
    if(!list)return;
    const convs=d.conversations||d||[];
    if(!convs.length){list.innerHTML='<p style="color:var(--text-muted);font-size:0.8rem;text-align:center;padding:1rem">No conversations yet</p>';return}
    list.innerHTML=convs.map(function(c){
      return '<div class="conv-item" data-id="'+escapeHtml(String(c.id))+'" onclick="loadConversation('+escapeHtml(String(c.id))+')"><span class="conv-title">'+escapeHtml(c.title||'Untitled')+'</span><button class="conv-delete" onclick="event.stopPropagation();deleteConversation('+escapeHtml(String(c.id))+')">✕</button></div>';
    }).join('');
  }catch(e){showToast('Failed to load conversations','error')}
}

async function loadConversation(id) {
  if(!token)return;
  try {
    const d=await api('GET','/api/playground/conversations/'+id);
    playgroundCurrentId=id;
    playgroundMessages=d.messages||[];
    const msgsEl=document.getElementById('playgroundMessages');
    if(!msgsEl)return;
    msgsEl.innerHTML='';
    playgroundMessages.forEach(function(m){
      const cls=m.role==='user'?'message-bubble-user':'message-bubble-ai';
      msgsEl.innerHTML+='<div class="playground-msg"><div class="'+cls+'">'+escapeHtml(m.content)+'</div></div>';
    });
    msgsEl.scrollTop=msgsEl.scrollHeight;
    const titleEl=document.getElementById('playgroundTitle');
    if(titleEl) titleEl.textContent=d.title||'Chat';
    // Highlight in sidebar
    document.querySelectorAll('.conv-item').forEach(function(e){e.classList.toggle('active',String(e.dataset.id)===String(id));});
  }catch(e){showToast('Failed to load conversation','error')}
}

async function deleteConversation(id) {
  if(!token)return;
  showConfirm('Delete conversation?','This cannot be undone.',async function(){
    try {
      await api('DELETE','/api/playground/conversations/'+id);
      if(playgroundCurrentId===id) createNewChat();
      loadConversations();
      showToast('Conversation deleted','info');
    }catch(e){showToast(e.message||'Failed to delete conversation','error')}
  });
}

async function sendChatMessage() {
  const inputEl=document.getElementById('playgroundInput');
  const msg=(inputEl?inputEl.value:'').trim();
  if(!msg)return;
  if(inputEl) inputEl.value='';
  const msgsEl=document.getElementById('playgroundMessages');
  if(!msgsEl)return;
  // Add user message
  msgsEl.innerHTML+='<div class="playground-msg"><div class="message-bubble-user">'+escapeHtml(msg)+'</div></div>';
  playgroundMessages.push({role:'user',content:msg});
  msgsEl.scrollTop=msgsEl.scrollHeight;
  // Show typing
  const typingId='playgroundTyping';
  msgsEl.innerHTML+='<div class="playground-msg" id="'+typingId+'"><div class="message-bubble-ai"><div class="ai-typing"><span></span><span></span><span></span></div></div></div>';
  msgsEl.scrollTop=msgsEl.scrollHeight;
  // Get selected model + params
  const modelSel=document.getElementById('playgroundModelSelect');
  const model=modelSel?modelSel.value:'gpt-4o-mini';
  const tempEl=document.getElementById('paramTemp');
  const maxTokEl=document.getElementById('paramMaxTokens');
  try {
    const d=await api('POST','/api/playground/chat',{model:model,messages:playgroundMessages,temperature:tempEl?parseFloat(tempEl.value)||0.7:0.7,max_tokens:maxTokEl?parseInt(maxTokEl.value)||2048:2048},120000);
    const typingEl=document.getElementById(typingId);
    if(typingEl) typingEl.remove();
    const resp=d.response||d.choices?.[0]?.message?.content||'No response';
    msgsEl.innerHTML+='<div class="playground-msg"><div class="message-bubble-ai">'+escapeHtml(resp)+'</div></div>';
    playgroundMessages.push({role:'assistant',content:resp});
    msgsEl.scrollTop=msgsEl.scrollHeight;
  }catch(e){
    const typingEl2=document.getElementById(typingId);
    if(typingEl2) typingEl2.remove();
    msgsEl.innerHTML+='<div class="playground-msg"><div class="message-bubble-ai" style="color:var(--destructive)">Error: '+escapeHtml(e.message||'Connection failed')+'</div></div>';
    msgsEl.scrollTop=msgsEl.scrollHeight;
  }
}

async function saveConversation() {
  if(!token){showToast('Please sign in','error');return}
  if(!playgroundMessages.length){showToast('No messages to save','error');return}
  const titleEl=document.getElementById('playgroundTitle');
  const title=titleEl?titleEl.textContent:'Chat '+(new Date().toLocaleString());
  try {
    const d=await api('POST','/api/playground/conversations',{title:title,messages:playgroundMessages});
    playgroundCurrentId=d.id;
    loadConversations();
    showToast('Conversation saved','success');
  }catch(e){showToast(e.message||'Failed to save conversation','error')}
}

async function updateConversationTitle(id) {
  if(!token||!id)return;
  const titleEl=document.getElementById('playgroundTitle');
  if(!titleEl)return;
  const newTitle=titleEl.textContent.trim()||'Untitled';
  try {
    await api('PUT','/api/playground/conversations/'+id,{title:newTitle});
    loadConversations();
  }catch(e){showToast(e.message||'Failed to update title','error')}
}

async function loadPlaygroundModels() {
  try {
    const d=await api('GET','/api/playground/models');
    const sel=document.getElementById('playgroundModelSelect');
    if(!sel)return;
    const models=d.models||d||[];
    if(!models.length){sel.innerHTML='<option value="">No models available</option>';return}
    sel.innerHTML=models.map(function(m){
      return '<option value="'+escapeHtml(m.id||m.model||m)+'">'+escapeHtml(m.name||m.id||m.model||m)+'</option>';
    }).join('');
  }catch(e){showToast('Failed to load models','error')}
}

function toggleParams() {
  const panel=document.getElementById('paramsPanel');
  if(panel) panel.classList.toggle('open');
}

function insertPromptSuggestion(text) {
  const inputEl=document.getElementById('playgroundInput');
  if(!inputEl)return;
  inputEl.value=text;
  inputEl.focus();
}

// ── Swipe/drag to open dash sidebar (mobile + desktop) ──
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
    if(startX<=EDGE_ZONE){e.preventDefault()}
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

// ── Token recovery from URL (payment redirect) ──
(function(){
  var params = new URLSearchParams(window.location.search);
  var urlToken = params.get('token');
  var urlUser = params.get('user');
  if (urlToken) {
    localStorage.setItem('gt_token', urlToken);
    if (urlUser) {
      try { localStorage.setItem('gt_user', decodeURIComponent(urlUser)); } catch(e) {}
    }
    var clean = window.location.protocol + '//' + window.location.host + window.location.pathname;
    window.history.replaceState({}, document.title, clean);
  }
})();

// ── Dashboard sidebar toggle (called from onclick) ──
function toggleDashSidebar() {
  var sb = document.getElementById('dashSidebar');
  var toggle = document.getElementById('dashSidebarToggle');
  if(!sb) return;
  var isOpen = sb.classList.toggle('open');
  if(toggle) toggle.classList.toggle('hidden', isOpen);
}

// ── Scroll-hint: hide gold arrow when user scrolls ──
document.addEventListener('DOMContentLoaded', function() {
  document.querySelectorAll('.dash-card div[style*="overflow-x:auto"], .dash-card .scroll-x').forEach(function(el) {
    el.addEventListener('scroll', function() {
      var card = this.closest('.dash-card');
      if(card) card.classList.add('is-scrolled');
    }, {passive:true});
  });
});

