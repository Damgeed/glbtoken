
    const API_URL = (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
      ? 'http://localhost:8000' : 'https://glbtoken-backend-production.up.railway.app';
    let token = localStorage.getItem('gt_token') || '';
    let userData = JSON.parse(localStorage.getItem('gt_user') || '{}');
    let keys = JSON.parse(localStorage.getItem('gt_keys') || '[]');
    let newapiToken = localStorage.getItem('gt_newapi_token') || '';
    let newapiEndpoint = localStorage.getItem('gt_newapi_endpoint') || '';

    // ── Country Codes for Phone Registration ──
    const COUNTRY_CODES = [
      {flag:'🇺🇸',dial:'+1',name:'United States'},{flag:'🇨🇦',dial:'+1',name:'Canada'},
      {flag:'🇬🇧',dial:'+44',name:'United Kingdom'},{flag:'🇦🇺',dial:'+61',name:'Australia'},
      {flag:'🇩🇪',dial:'+49',name:'Germany'},{flag:'🇫🇷',dial:'+33',name:'France'},
      {flag:'🇮🇹',dial:'+39',name:'Italy'},{flag:'🇪🇸',dial:'+34',name:'Spain'},
      {flag:'🇵🇹',dial:'+351',name:'Portugal'},{flag:'🇳🇱',dial:'+31',name:'Netherlands'},
      {flag:'🇧🇪',dial:'+32',name:'Belgium'},{flag:'🇨🇭',dial:'+41',name:'Switzerland'},
      {flag:'🇦🇹',dial:'+43',name:'Austria'},{flag:'🇸🇪',dial:'+46',name:'Sweden'},
      {flag:'🇳🇴',dial:'+47',name:'Norway'},{flag:'🇩🇰',dial:'+45',name:'Denmark'},
      {flag:'🇫🇮',dial:'+358',name:'Finland'},{flag:'🇮🇸',dial:'+354',name:'Iceland'},
      {flag:'🇮🇪',dial:'+353',name:'Ireland'},{flag:'🇵🇱',dial:'+48',name:'Poland'},
      {flag:'🇨🇿',dial:'+420',name:'Czech Republic'},{flag:'🇸🇰',dial:'+421',name:'Slovakia'},
      {flag:'🇭🇺',dial:'+36',name:'Hungary'},{flag:'🇷🇴',dial:'+40',name:'Romania'},
      {flag:'🇧🇬',dial:'+359',name:'Bulgaria'},{flag:'🇬🇷',dial:'+30',name:'Greece'},
      {flag:'🇭🇷',dial:'+385',name:'Croatia'},{flag:'🇷🇸',dial:'+381',name:'Serbia'},
      {flag:'🇸🇮',dial:'+386',name:'Slovenia'},{flag:'🇱🇹',dial:'+370',name:'Lithuania'},
      {flag:'🇱🇻',dial:'+371',name:'Latvia'},{flag:'🇪🇪',dial:'+372',name:'Estonia'},
      {flag:'🇺🇦',dial:'+380',name:'Ukraine'},{flag:'🇷🇺',dial:'+7',name:'Russia'},
      {flag:'🇰🇿',dial:'+7',name:'Kazakhstan'},{flag:'🇹🇷',dial:'+90',name:'Turkey'},
      {flag:'🇮🇱',dial:'+972',name:'Israel'},{flag:'🇦🇪',dial:'+971',name:'UAE'},
      {flag:'🇸🇦',dial:'+966',name:'Saudi Arabia'},{flag:'🇶🇦',dial:'+974',name:'Qatar'},
      {flag:'🇴🇲',dial:'+968',name:'Oman'},{flag:'🇧🇭',dial:'+973',name:'Bahrain'},
      {flag:'🇰🇼',dial:'+965',name:'Kuwait'},{flag:'🇯🇴',dial:'+962',name:'Jordan'},
      {flag:'🇱🇧',dial:'+961',name:'Lebanon'},{flag:'🇮🇷',dial:'+98',name:'Iran'},
      {flag:'🇮🇶',dial:'+964',name:'Iraq'},{flag:'🇸🇾',dial:'+963',name:'Syria'},
      {flag:'🇾🇪',dial:'+967',name:'Yemen'},{flag:'🇨🇾',dial:'+357',name:'Cyprus'},
      {flag:'🇲🇹',dial:'+356',name:'Malta'},{flag:'🇨🇳',dial:'+86',name:'China'},
      {flag:'🇭🇰',dial:'+852',name:'Hong Kong'},{flag:'🇲🇴',dial:'+853',name:'Macau'},
      {flag:'🇹🇼',dial:'+886',name:'Taiwan'},{flag:'🇯🇵',dial:'+81',name:'Japan'},
      {flag:'🇰🇷',dial:'+82',name:'South Korea'},{flag:'🇲🇳',dial:'+976',name:'Mongolia'},
      {flag:'🇮🇳',dial:'+91',name:'India'},{flag:'🇵🇰',dial:'+92',name:'Pakistan'},
      {flag:'🇧🇩',dial:'+880',name:'Bangladesh'},{flag:'🇱🇰',dial:'+94',name:'Sri Lanka'},
      {flag:'🇳🇵',dial:'+977',name:'Nepal'},{flag:'🇧🇹',dial:'+975',name:'Bhutan'},
      {flag:'🇲🇻',dial:'+960',name:'Maldives'},{flag:'🇹🇭',dial:'+66',name:'Thailand'},
      {flag:'🇻🇳',dial:'+84',name:'Vietnam'},{flag:'🇮🇩',dial:'+62',name:'Indonesia'},
      {flag:'🇵🇭',dial:'+63',name:'Philippines'},{flag:'🇲🇾',dial:'+60',name:'Malaysia'},
      {flag:'🇸🇬',dial:'+65',name:'Singapore'},{flag:'🇧🇳',dial:'+673',name:'Brunei'},
      {flag:'🇰🇭',dial:'+855',name:'Cambodia'},{flag:'🇱🇦',dial:'+856',name:'Laos'},
      {flag:'🇲🇲',dial:'+95',name:'Myanmar'},{flag:'🇧🇷',dial:'+55',name:'Brazil'},
      {flag:'🇲🇽',dial:'+52',name:'Mexico'},{flag:'🇦🇷',dial:'+54',name:'Argentina'},
      {flag:'🇨🇴',dial:'+57',name:'Colombia'},{flag:'🇨🇱',dial:'+56',name:'Chile'},
      {flag:'🇵🇪',dial:'+51',name:'Peru'},{flag:'🇻🇪',dial:'+58',name:'Venezuela'},
      {flag:'🇪🇨',dial:'+593',name:'Ecuador'},{flag:'🇧🇴',dial:'+591',name:'Bolivia'},
      {flag:'🇵🇾',dial:'+595',name:'Paraguay'},{flag:'🇺🇾',dial:'+598',name:'Uruguay'},
      {flag:'🇨🇷',dial:'+506',name:'Costa Rica'},{flag:'🇸🇻',dial:'+503',name:'El Salvador'},
      {flag:'🇬🇹',dial:'+502',name:'Guatemala'},{flag:'🇭🇳',dial:'+504',name:'Honduras'},
      {flag:'🇳🇮',dial:'+505',name:'Nicaragua'},{flag:'🇵🇦',dial:'+507',name:'Panama'},
      {flag:'🇩🇴',dial:'+1-809',name:'Dominican Republic'},{flag:'🇵🇷',dial:'+1-787',name:'Puerto Rico'},
      {flag:'🇨🇺',dial:'+53',name:'Cuba'},{flag:'🇯🇲',dial:'+1-876',name:'Jamaica'},
      {flag:'🇹🇹',dial:'+1-868',name:'Trinidad and Tobago'},{flag:'🇧🇸',dial:'+1-242',name:'Bahamas'},
      {flag:'🇧🇧',dial:'+1-246',name:'Barbados'},{flag:'🇭🇹',dial:'+509',name:'Haiti'},
      {flag:'🇳🇬',dial:'+234',name:'Nigeria'},{flag:'🇿🇦',dial:'+27',name:'South Africa'},
      {flag:'🇪🇬',dial:'+20',name:'Egypt'},{flag:'🇰🇪',dial:'+254',name:'Kenya'},
      {flag:'🇬🇭',dial:'+233',name:'Ghana'},{flag:'🇪🇹',dial:'+251',name:'Ethiopia'},
      {flag:'🇹🇿',dial:'+255',name:'Tanzania'},{flag:'🇺🇬',dial:'+256',name:'Uganda'},
      {flag:'🇩🇿',dial:'+213',name:'Algeria'},{flag:'🇲🇦',dial:'+212',name:'Morocco'},
      {flag:'🇹🇳',dial:'+216',name:'Tunisia'},{flag:'🇱🇾',dial:'+218',name:'Libya'},
      {flag:'🇸🇩',dial:'+249',name:'Sudan'},{flag:'🇸🇸',dial:'+211',name:'South Sudan'},
      {flag:'🇸🇴',dial:'+252',name:'Somalia'},{flag:'🇩🇯',dial:'+253',name:'Djibouti'},
      {flag:'🇪🇷',dial:'+291',name:'Eritrea'},{flag:'🇦🇴',dial:'+244',name:'Angola'},
      {flag:'🇲🇿',dial:'+258',name:'Mozambique'},{flag:'🇿🇲',dial:'+260',name:'Zambia'},
      {flag:'🇿🇼',dial:'+263',name:'Zimbabwe'},{flag:'🇲🇼',dial:'+265',name:'Malawi'},
      {flag:'🇧🇼',dial:'+267',name:'Botswana'},{flag:'🇳🇦',dial:'+264',name:'Namibia'},
      {flag:'🇱🇸',dial:'+266',name:'Lesotho'},{flag:'🇸🇿',dial:'+268',name:'Eswatini'},
      {flag:'🇨🇩',dial:'+243',name:'DR Congo'},{flag:'🇨🇬',dial:'+242',name:'Congo'},
      {flag:'🇬🇦',dial:'+241',name:'Gabon'},{flag:'🇬🇶',dial:'+240',name:'Equatorial Guinea'},
      {flag:'🇨🇲',dial:'+237',name:'Cameroon'},{flag:'🇨🇫',dial:'+236',name:'CAR'},
      {flag:'🇹🇩',dial:'+235',name:'Chad'},{flag:'🇳🇪',dial:'+227',name:'Niger'},
      {flag:'🇲🇱',dial:'+223',name:'Mali'},{flag:'🇧🇫',dial:'+226',name:'Burkina Faso'},
      {flag:'🇸🇳',dial:'+221',name:'Senegal'},{flag:'🇧🇯',dial:'+229',name:'Benin'},
      {flag:'🇹🇬',dial:'+228',name:'Togo'},{flag:'🇨🇮',dial:'+225',name:"Côte d'Ivoire"},
      {flag:'🇬🇳',dial:'+224',name:'Guinea'},{flag:'🇬🇼',dial:'+245',name:'Guinea-Bissau'},
      {flag:'🇸🇱',dial:'+232',name:'Sierra Leone'},{flag:'🇱🇷',dial:'+231',name:'Liberia'},
      {flag:'🇷🇼',dial:'+250',name:'Rwanda'},{flag:'🇧🇮',dial:'+257',name:'Burundi'},
      {flag:'🇲🇬',dial:'+261',name:'Madagascar'},{flag:'🇲🇺',dial:'+230',name:'Mauritius'},
      {flag:'🇰🇲',dial:'+269',name:'Comoros'},{flag:'🇨🇻',dial:'+238',name:'Cape Verde'},
      {flag:'🇸🇹',dial:'+239',name:'São Tomé and Príncipe'},{flag:'🇸🇨',dial:'+248',name:'Seychelles'},
      {flag:'🇬🇲',dial:'+220',name:'Gambia'},{flag:'🇲🇷',dial:'+222',name:'Mauritania'},
      {flag:'🇫🇯',dial:'+679',name:'Fiji'},{flag:'🇵🇬',dial:'+675',name:'Papua New Guinea'},
      {flag:'🇸🇧',dial:'+677',name:'Solomon Islands'},{flag:'🇻🇺',dial:'+678',name:'Vanuatu'},
      {flag:'🇼🇸',dial:'+685',name:'Samoa'},{flag:'🇹🇴',dial:'+676',name:'Tonga'},
      {flag:'🇰🇮',dial:'+686',name:'Kiribati'},{flag:'🇫🇲',dial:'+691',name:'Micronesia'},
      {flag:'🇲🇭',dial:'+692',name:'Marshall Islands'},{flag:'🇵🇼',dial:'+680',name:'Palau'},
      {flag:'🇳🇷',dial:'+674',name:'Nauru'},{flag:'🇹🇻',dial:'+688',name:'Tuvalu'},
      {flag:'🇦🇿',dial:'+994',name:'Azerbaijan'},{flag:'🇬🇪',dial:'+995',name:'Georgia'},
      {flag:'🇦🇲',dial:'+374',name:'Armenia'},{flag:'🇦🇫',dial:'+93',name:'Afghanistan'},
      {flag:'🇹🇲',dial:'+993',name:'Turkmenistan'},{flag:'🇺🇿',dial:'+998',name:'Uzbekistan'},
      {flag:'🇰🇬',dial:'+996',name:'Kyrgyzstan'},{flag:'🇹🇯',dial:'+992',name:'Tajikistan'},
      {flag:'🇱🇮',dial:'+423',name:'Liechtenstein'},{flag:'🇸🇲',dial:'+378',name:'San Marino'},
      {flag:'🇦🇩',dial:'+376',name:'Andorra'},{flag:'🇲🇪',dial:'+382',name:'Montenegro'},
      {flag:'🇧🇦',dial:'+387',name:'Bosnia and Herzegovina'},{flag:'🇦🇱',dial:'+355',name:'Albania'},
      {flag:'🇲🇰',dial:'+389',name:'North Macedonia'},{flag:'🇱🇺',dial:'+352',name:'Luxembourg'},
      {flag:'🇧🇾',dial:'+375',name:'Belarus'},{flag:'🇲🇩',dial:'+373',name:'Moldova'},
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
          const errData = await resp.json().catch(()=>{});
          throw new Error(((errData&&errData.detail)||'API error').replace(/^\[?\d{3}\]?\s*/,''));
        }
        return await resp.json();
      } finally {
        if(timer) clearTimeout(timer);
      }
    }

    // ── Page Routing ──
    function showPage(page){
      // Auth-based redirects for multi-page setup
      if (token && (page === 'login' || page === 'register')) { window.location='dashboard.html'; return; }
      if (!token && (page === 'dashboard' || page === 'history' || page === 'apikeys' || page === 'topup')) { window.location='register.html'; return; }
      if (page === 'home') { window.location='/'; return; }
      const pageMap = {pricing:'pricing.html',how:'how.html',models:'models.html',apikeys:'apikeys.html',dashboard:'dashboard.html',history:'history.html',topup:'topup.html',faq:'faq.html',about:'about.html',blog:'blog.html',terms:'terms.html',privacy:'privacy.html',refund:'refund.html',login:'login.html',register:'register.html',settings:'settings.html',notifications:'notifications.html',billing:'billing.html'};
      if (pageMap[page]) { window.location=pageMap[page]; }
    }

    // ── Auth (Passwordless Email via Auth0) ──
    function validateEmailInput(prefix){
      const email=document.getElementById(prefix+'Email').value.trim();
      const warn=document.getElementById(prefix+'EmailWarning');
      if(!warn)return;
      if(!email){
        warn.style.display='none';
        return;
      }
      if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){
        warn.textContent='Please enter a valid email address';
        warn.style.display='block';
      }else{
        warn.style.display='none';
      }
    }
    async function sendLoginCode(){
      const email=document.getElementById('loginEmail').value.trim();
      const errEl=document.getElementById('loginError');
      const warn=document.getElementById('loginEmailWarning');
      if(errEl){errEl.style.display='none';errEl.textContent=''}
      if(!email||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){
        const m='Please enter a valid email address';
        showToast(m,'error');
        if(errEl){errEl.textContent=m;errEl.style.display='block'}
        if(warn){warn.textContent='Please enter a valid email address';warn.style.display='block'}
        return
      }else if(warn){warn.style.display='none'}
      const btn=document.getElementById('loginSendBtn');
      btn.disabled=true;btn.textContent='Sending...';
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
        if(errEl){errEl.textContent=msg;errEl.style.display='block'}
      }finally{
        btn.disabled=false;btn.textContent='Continue';
      }
    }
    async function verifyLoginCode(){
      const email=document.getElementById('loginEmail').value.trim();
      const code=document.getElementById('loginCode').value.trim();
      const errEl=document.getElementById('loginError');
      if(errEl){errEl.style.display='none';errEl.textContent=''}
      if(!code||code.length<4){
        const m='Please enter the verification code from your email';
        showToast(m,'error');
        if(errEl){errEl.textContent=m;errEl.style.display='block'}
        return
      }
      const btn=document.getElementById('loginVerifyBtn');
      btn.disabled=true;btn.textContent='Verifying...';
      try{
        var data=await api('POST','/api/auth/verify-code',{email:email,code:code});
        token=data.token;userData=data.user;
        localStorage.setItem('gt_token',token);localStorage.setItem('gt_user',JSON.stringify(userData));
        applyAuth();showToast('Welcome back!','success');
        window.location.href='/dashboard.html';
      }catch(e){
        const msg=e.message||'Invalid code';
        showToast(msg,'error');
        if(errEl){errEl.textContent=msg;errEl.style.display='block'}
      }finally{
        btn.disabled=false;btn.textContent='Verify & Sign In';
      }
    }
    async function sendRegisterCode(){
      const email=document.getElementById('regEmail').value.trim();
      const errEl=document.getElementById('regError');
      const warn=document.getElementById('regEmailWarning');
      if(errEl){errEl.style.display='none';errEl.textContent=''}
      if(!email||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){
        const m='Please enter a valid email address';
        showToast(m,'error');
        if(errEl){errEl.textContent=m;errEl.style.display='block'}
        if(warn){warn.textContent='Please enter a valid email address';warn.style.display='block'}
        return
      }else if(warn){warn.style.display='none'}
      const btn=document.getElementById('regSendBtn');
      btn.disabled=true;btn.textContent='Sending...';
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
        if(errEl){errEl.textContent=msg;errEl.style.display='block'}
      }finally{
        btn.disabled=false;btn.textContent='Continue';
      }
    }
    async function verifyRegisterCode(){
      const email=document.getElementById('regEmail').value.trim();
      const code=document.getElementById('regCode').value.trim();
      const errEl=document.getElementById('regError');
      if(errEl){errEl.style.display='none';errEl.textContent=''}
      if(!code||code.length<4){
        const m='Please enter the verification code from your email';
        showToast(m,'error');
        if(errEl){errEl.textContent=m;errEl.style.display='block'}
        return
      }
      const btn=document.getElementById('regVerifyBtn');
      btn.disabled=true;btn.textContent='Verifying...';
      try{
        var data=await api('POST','/api/auth/verify-code',{email:email,code:code});
        token=data.token;userData=data.user;
        localStorage.setItem('gt_token',token);localStorage.setItem('gt_user',JSON.stringify(userData));
        applyAuth();showToast('Account created! Welcome.','success');
        window.location.href='/dashboard.html';
      }catch(e){
        const msg=e.message||'Invalid code';
        showToast(msg,'error');
        if(errEl){errEl.textContent=msg;errEl.style.display='block'}
      }finally{
        btn.disabled=false;btn.textContent='Verify & Create Account';
      }
    }
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
        html += '<div' + sel + ' onclick="selectCountry(\'' + prefix + '\',\'' + c.dial + '\',\'' + c.flag + '\')"><span>' + c.flag + ' ' + c.name + '</span> <span class="country-dial">' + c.dial + '</span></div>';
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
      var errEl = document.getElementById(prefix === 'login' ? 'loginError' : 'regError');
      if(errEl){errEl.style.display='none';errEl.textContent=''}
      if(!phone || phone.length < 5){
        var m = 'Please enter a valid phone number';
        showToast(m,'error');
        if(errEl){errEl.textContent=m;errEl.style.display='block'}
        return;
      }
      var btn = document.getElementById(prefix + 'PhoneSendBtn');
      btn.disabled=true; btn.textContent='Sending...';
      try{
        await api('POST','/api/auth/send-sms-code',{phone:phone});
        document.getElementById(prefix + 'SmsCodeGroup').style.display='block';
        btn.style.display='none';
        document.getElementById(prefix + 'PhoneVerifyBtn').style.display='block';
        document.getElementById(prefix + 'SmsCode').focus();
        showToast('Code sent to ' + phone,'success');
      }catch(e){
        var msg = e.message || 'Failed to send code';
        showToast(msg,'error');
        if(errEl){errEl.textContent=msg;errEl.style.display='block'}
      }finally{
        btn.disabled=false; btn.textContent='Send Code';
      }
    }
    async function verifyPhoneCode(prefix){
      var dial = selectedDial[prefix] || '+1';
      var phoneRaw = document.getElementById(prefix + 'Phone').value.trim();
      phoneRaw = phoneRaw.replace(/\D/g,'');
      phoneRaw = phoneRaw.replace(/^0+/,'');
      var phone = dial + phoneRaw;
      var code = document.getElementById(prefix + 'SmsCode').value.trim();
      var errEl = document.getElementById(prefix === 'login' ? 'loginError' : 'regError');
      if(errEl){errEl.style.display='none';errEl.textContent=''}
      if(!code || code.length < 4){
        var m = 'Please enter the verification code from SMS';
        showToast(m,'error');
        if(errEl){errEl.textContent=m;errEl.style.display='block'}
        return;
      }
      var btn = document.getElementById(prefix + 'PhoneVerifyBtn');
      btn.disabled=true; btn.textContent='Verifying...';
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
        if(errEl){errEl.textContent=msg;errEl.style.display='block'}
      }finally{
        btn.disabled=false; btn.textContent= prefix === 'login' ? 'Verify & Sign In' : 'Verify & Create Account';
      }
    }
    function oauthLogin(provider){
      // Redirect to Auth0 social login
      api('GET','/api/auth/auth0/social-url?provider='+provider).then(function(cfg){
        if(cfg && cfg.url) window.location.href=cfg.url;
        else showToast('Social login unavailable. Try email/password.','error');
      }).catch(function(){
        showToast('Social login unavailable. Try email/password.','error');
      });
    }
    function oauthRegister(provider){
      // Redirect to Auth0 social signup
      api('GET','/api/auth/auth0/social-url?provider='+provider).then(function(cfg){
        if(cfg && cfg.url) window.location.href=cfg.url;
        else showToast('Social signup unavailable. Try email/password.','error');
      }).catch(function(){
        showToast('Social signup unavailable. Try email/password.','error');
      });
    }
    function logoutUser(){
      token='';userData={};
      localStorage.removeItem('gt_token');localStorage.removeItem('gt_user');
      localStorage.removeItem('gt_newapi_token');localStorage.removeItem('gt_newapi_endpoint');
      localStorage.removeItem('gt_keys');
      applyAuth();showToast('Signed out','info');showPage('home');
    }
    async function refreshMe(){
      if(!token)return;
      try{const d=await api('GET','/api/auth/me');userData=d;localStorage.setItem('gt_user',JSON.stringify(d));applyAuth()}catch(e){}
    }
    // ── Auth0 Social Login Callback ──
    async function handleAuth0Callback(){
      // Called on /auth/callback page — no nav/toast DOM elements here
      const hash = window.location.hash.substring(1);
      if(!hash) return;
      const params = new URLSearchParams(hash);
      const idToken = params.get('id_token');
      if(!idToken) return;
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
      var errEl = document.getElementById('resetError');
      if(errEl)errEl.style.display='none';
      if(!email){var m='Enter your email';showToast(m,'error');if(errEl){errEl.textContent=m;errEl.style.display='block'}return}
      if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){var m='Please enter a valid email address';showToast(m,'error');if(errEl){errEl.textContent=m;errEl.style.display='block'}return}
      var btn = document.getElementById('resetSendBtn');
      if(btn){btn.disabled=true;btn.textContent='Sending...'}
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
        if(errEl){errEl.textContent=msg;errEl.style.display='block'}
      }
      if(btn){btn.disabled=false;btn.textContent='Send Reset Link'}
    }
    function applyAuth(){
      const loggedIn=!!token;
      document.getElementById('navGuest').style.display=loggedIn?'none':'flex';
      document.getElementById('navUser').style.display=loggedIn?'flex':'none';
      document.getElementById('navBalance').style.display=loggedIn?'inline-block':'none';
      // Mobile menu sync
      document.getElementById('mGuest').style.display=loggedIn?'none':'block';
      document.getElementById('mUser').style.display=loggedIn?'block':'none';
      // Toggle Dashboard vs API/Dev in nav
      document.getElementById('navApiLink').style.display=loggedIn?'none':'inline-block';
      document.getElementById('navDashLink').style.display=loggedIn?'inline-block':'none';
      document.getElementById('mNavApiLink').style.display=loggedIn?'none':'block';
      document.getElementById('mNavDashLink').style.display=loggedIn?'block':'none';
      // API doc page: show Go to Dashboard button when logged in
      const goBtn=document.getElementById('apiGoToDashBtn');
      if(goBtn)goBtn.style.display=loggedIn?'inline-flex':'none';
      if(loggedIn){
        var displayName = userData.name || (userData.email ? userData.email.split('@')[0] : 'User');
        document.getElementById('dashUserName').textContent=displayName;
        const initial=(displayName||'U')[0].toUpperCase();
        // Update avatar initial without breaking dropdown structure
        const av=document.querySelector('.nav-avatar');
        const textNode = document.createTextNode(initial);
        const dropdown = av.querySelector('.dropdown');
        av.textContent = '';
        av.appendChild(textNode);
        if (dropdown) av.appendChild(dropdown);
        document.getElementById('ddAvatar').textContent=initial;document.getElementById('dropName').textContent=displayName;
        document.getElementById('dropEmail').textContent=userData.email||'';
        // Mobile sync
        document.getElementById('mAvatar').textContent=initial;
        document.getElementById('mName').textContent=displayName;
        document.getElementById('mEmail').textContent=userData.email||'';
        // ── "Sign Out [name]" in nav (dynamic, injects after navGuest) ──
        var so = document.getElementById('navSignedIn');
        if(!so){
          so = document.createElement('div');
          so.id = 'navSignedIn';
          so.style.cssText = 'display:none;align-items:center;gap:0.6rem;flex-shrink:0';
          var guest = document.getElementById('navGuest');
          if(guest && guest.parentNode) guest.parentNode.insertBefore(so, guest.nextSibling);
        }
        so.style.display = 'flex';
        so.innerHTML = '<a onclick="logoutUser()" style="display:flex;align-items:center;gap:0.35rem;cursor:pointer;color:var(--text,#e0e0e0);text-decoration:none;font-size:0.85rem;font-weight:500;white-space:nowrap;padding:0.35rem 0.6rem;border:1px solid var(--border,#3a3a4e);border-radius:8px;transition:all 0.2s">Sign Out ' + escapeHtml(displayName) + ' <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg></a>';
        var soMobile = document.getElementById('navSignedInMobile');
        if(!soMobile && document.querySelector('.mobile-right-group')){
          soMobile = document.createElement('div');
          soMobile.id = 'navSignedInMobile';
          soMobile.style.cssText = 'display:none;align-items:center;margin-left:0;flex-shrink:0';
          var mobileGroup = document.querySelector('.mobile-right-group');
          mobileGroup.insertBefore(soMobile, mobileGroup.firstChild);
        }
        if(soMobile && window.innerWidth <= 768){
          soMobile.style.display = 'flex';
          soMobile.innerHTML = '<span style="color:var(--text,#e0e0e0);font-size:0.75rem;font-weight:500;white-space:nowrap;max-width:60px;overflow:hidden;text-overflow:ellipsis">' + escapeHtml(displayName) + '</span>';
        } else if(soMobile) {
          soMobile.style.display = 'none';
        }
      } else {
        var so = document.getElementById('navSignedIn');
        if(so) so.style.display = 'none';
        var soMobile = document.getElementById('navSignedInMobile');
        if(soMobile) soMobile.style.display = 'none';
      }
      updateBalance();
    }
    function updateBalance(){
      const b=userData.token_balance||0;
      document.getElementById('navBalance').textContent=b.toLocaleString()+' Tokens';
      document.getElementById('ddBalance').textContent=b.toLocaleString()+' GT';
      document.getElementById('mBalance').textContent=b.toLocaleString();
      const db=document.getElementById('dashBalance');
      if(db)db.textContent=b.toLocaleString();
      const du=document.getElementById('dashUsd');
      if(du)du.textContent='$'+(b/1000).toFixed(2)+' USD';
      const hb=document.getElementById('heroBalance');
      if(hb)hb.textContent=b.toLocaleString();
    }
    function toggleDropdown(){document.getElementById('userDropdown').classList.toggle('open')}
    document.addEventListener('click',function(e){
      const dd=document.getElementById('userDropdown');
      if(dd&&dd.classList.contains('open')&&!e.target.closest('.nav-avatar'))dd.classList.remove('open');
    });

    // ── Hash-based routing (back/forward support) ──
    window.addEventListener('hashchange',function(){
      const page=location.hash.replace('#','')||'home';
      showPage(page);
    });
    // ── Handle Auth0 callback (redirect from /auth/callback.html) ──
    (function(){
      var h = window.location.hash.substring(1);
      if (h && !token) {
        var p = new URLSearchParams(h);
        var idToken = p.get('id_token');
        if (idToken) {
          fetch(API_URL + '/api/auth/auth0/login', {
            method:'POST', headers:{'Content-Type':'application/json'},
            body:JSON.stringify({token:idToken})
          }).then(function(r){return r.json()}).then(function(d){
            if(d.token){
              localStorage.setItem('gt_token',d.token);
              localStorage.setItem('gt_user',JSON.stringify(d.user));
              window.location.replace('/dashboard.html');
            }
          }).catch(function(){});
          return; // Stop further init, redirect is coming
        }
      }
    })();
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
        document.getElementById('dashKeyCount').textContent=d.api_keys_active;
        document.getElementById('dashKeyStatus').textContent=d.api_keys_active>0?'Active':'No keys';
        // Show real days active from New API or local DB
        var daysEl = document.getElementById('dashDaysActive');
        if(daysEl) daysEl.textContent = d.days_active;
        // Show New API connection status
        var newapiStatus = document.getElementById('dashNewapiStatus');
        if(newapiStatus) newapiStatus.textContent = d.newapi_connected ? 'New API Connected' : 'Offline';
        // Show total tokens consumed from New API data
        var newapiTotal = d.usage_from_newapi && d.usage_from_newapi.total;
        if(newapiTotal && d.newapi_connected){
          var consumedEl = document.getElementById('dashTotalConsumed');
          if(consumedEl) consumedEl.textContent = parseInt(newapiTotal).toLocaleString() + ' tokens today';
        }
        initCharts(d.usage_by_model);
        // Activity
        const act=document.getElementById('dashActivity');
        const actCount=document.getElementById('activityCount');
        if(d.recent_activity&&d.recent_activity.length){
          actCount.textContent=d.recent_activity.length+' items';
          act.innerHTML=d.recent_activity.map(a=>{
            const isDeposit=a.type==='deposit';
            return `<div class="dash-activity-item"><div class="icon ${isDeposit?'gold':'green'}" style="width:36px;height:36px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:1rem;flex-shrink:0;background:${isDeposit?'var(--primary-subtle)':'var(--success-subtle)'}">${isDeposit?'💰':'🤖'}</div><div class="info" style="flex:1"><div class="title" style="font-size:0.85rem;font-weight:500">${a.model||a.payment_method||a.type}</div><div class="time" style="font-size:0.75rem;color:var(--text-muted)">${a.created_at?new Date(a.created_at).toLocaleDateString():''}</div></div><div class="val" style="font-size:0.85rem;font-weight:600;color:${isDeposit?'var(--primary)':'var(--destructive)'}">${isDeposit?'+':''}${a.tokens||0}</div></div>`
          }).join('');
        }else{
          actCount.textContent='0 items';
          act.innerHTML='<p style="color:var(--text-muted);font-size:0.85rem;padding:1rem;text-align:center">No activity yet</p>';
        }
        // Transactions
        loadTxTable();
        // Dashboard API Keys
        loadDashKeys();
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
    function initCharts(usage){
      const canvas=document.getElementById('usageChart');
      if(!canvas)return;
      if(chartInst){chartInst.destroy();chartInst=null}
      const labels=usage&&usage.length?usage.map(u=>u.model):['GPT-4o','Claude','DeepSeek','Llama','Other'];
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
      // Group by category
      const groups = {};
      models.forEach(m => {
        const c = m.category || 'Other';
        if (!groups[c]) groups[c] = [];
        groups[c].push(m);
      });
      let html = '';
      CATEGORY_ORDER.forEach(clabel => {
        // Find matching internal key
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
          <span class="cat-name">${meta.label}</span>
          <span class="cat-count">${items.length}</span>
          ${meta.desc ? `<span class="cat-desc">${meta.desc}</span>` : ''}
        </div>`;
        html += `<div class="cat-body">`;
        html += items.map(m => {
          const pmeta = getCatMeta(m.category);
          const priceIn = (m.prompt_price * 1000).toFixed(4);
          const priceOut = (m.completion_price * 1000).toFixed(4);
          return `<div class="model-card">
            <div class="mc-top">
              <span class="mc-badge" style="background:${pmeta.bg};color:${pmeta.color};border-color:${pmeta.border}">${m.provider}</span>
              <span class="mc-cat-tag" style="background:${pmeta.bg};color:${pmeta.color}">${pmeta.icon} ${pmeta.label}</span>
            </div>
            <h4 class="mc-name">${m.name || m.model_id.split('/').pop()}</h4>
            <div class="mc-id">${m.model_id}</div>
            ${m.version ? `<span class="mc-version">v${m.version}</span>` : ''}
            ${m.description ? `<div class="mc-desc">${m.description}</div>` : ''}
            <div class="mc-meta">
              <span title="Context window">📐 ${(m.context_length/1000).toFixed(0)}K</span>
              <span title="Input price">⬇️ \$${priceIn}/1K</span>
              <span title="Output price">⬆️ \$${priceOut}/1K</span>
            </div>
          </div>`;
        }).join('');
        html += '</div>';
        delete groups[key];
      });
      // Remaining uncategorized
      Object.keys(groups).forEach(c => {
        const meta = getCatMeta(c);
        html += `<div class="cat-header" style="--cat-color:${meta.color};--cat-bg:${meta.bg};--cat-border:${meta.border}">
          <span class="cat-icon">${meta.icon}</span>
          <span class="cat-name">${meta.label}</span>
          <span class="cat-count">${groups[c].length}</span>
        </div>`;
        html += `<div class="cat-body">`;
        html += groups[c].map(m => {
          const priceIn = (m.prompt_price * 1000).toFixed(4);
          const priceOut = (m.completion_price * 1000).toFixed(4);
          return `<div class="model-card">
            <div class="mc-top">
              <span class="mc-badge" style="background:var(--primary-subtle);color:var(--primary);border-color:hsla(44,96%,52%,0.2)">${m.provider}</span>
            </div>
            <h4 class="mc-name">${m.name || m.model_id.split('/').pop()}</h4>
            <div class="mc-id">${m.model_id}</div>
            ${m.description ? `<div class="mc-desc">${m.description}</div>` : ''}
            <div class="mc-meta">
              <span title="Context window">📐 ${(m.context_length/1000).toFixed(0)}K</span>
              <span title="Input price">⬇️ \$${priceIn}/1K</span>
              <span title="Output price">⬆️ \$${priceOut}/1K</span>
            </div>
          </div>`;
        }).join('');
        html += '</div>';
      });
      grid.innerHTML = html;
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
      if(!confirm('Delete this API key? This cannot be undone.'))return;
      try{await api('DELETE',`/api/keys/${id}`);loadKeys();showToast('Key deleted','info')}catch(e){showToast(e.message,'error')}
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
          aiDiv.innerHTML = '<div class="av">🤖</div><div class="bubble" style="color:var(--error)">Connection error. Please try again.</div>';
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
    });
    // Parse URL error param (from Auth0 callback failure redirect)
    (function(){
      const params = new URLSearchParams(window.location.search);
      const err = params.get('error');
      if(err) showToast(decodeURIComponent(err), 'error');
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
      lockBodyScroll(false);
      removeCloseBtn(section.querySelector('.chat-header'));
    }
    // ── Support Chat ──
    function toggleChat(){
      const win = document.getElementById('chatWindow');
      if(!win) return;
      if(window.innerWidth > 768){
        win.classList.toggle('open');
        return;
      }
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
    function escapeHtml(t){const d=document.createElement('div');d.textContent=t;return d.innerHTML}
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
            +'<div style="font-size:0.7rem;text-transform:uppercase;letter-spacing:0.05em;color:var(--text-muted);margin-bottom:0.2rem;overflow-wrap:break-word;word-break:break-word">'+m.provider+'</div>'
            +'<div style="font-weight:600;font-size:0.85rem;overflow-wrap:break-word;word-break:break-word">'+m.name+'</div>'
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
      },1500);
    }
    function tmDragStart(clientX){
      clearInterval(tmInterval);
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

