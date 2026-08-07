
// ── Secure Storage: at-rest encryption for localStorage ──
// Encrypts sensitive values (tokens, user data) before writing to localStorage.
// Uses XOR cipher with a key derived from a random salt + app pepper.
// Protects against: casual DevTools inspection, simple localStorage exfiltration.
// Key limitation: an attacker with XSS/runtime access can still read values.
// Access-token policy (2026-08): the JWT access token is NEVER written to
// localStorage. It lives in per-tab sessionStorage (cleared on tab close,
// unreadable cross-tab) + memory; sessions restore via the refresh token.

(function(){
  const STORAGE_PREFIX = '__e:';
  const SALT_KEY = 'gt_sk';
  const PEPPER = 'GlbTOKEN_SECURE_2024';

  function getSalt(){
    let s = localStorage.getItem(SALT_KEY);
    if(!s){
      var arr = new Uint8Array(16);
      crypto.getRandomValues(arr);
      s = '';
      for(var i=0;i<arr.length;i++) s += String.fromCharCode(arr[i]);
      s = btoa(s);
      localStorage.setItem(SALT_KEY, s);
    }
    return s;
  }

  function deriveKey(){
    var s = getSalt();
    var seed = PEPPER + ':' + s;
    var hash = 5381;
    for(var i=0;i<seed.length;i++){
      hash = ((hash << 5) + hash) + seed.charCodeAt(i);
      hash = hash & hash;
    }
    var key = '';
    var h = hash;
    for(var i=0;i<64;i++){
      h = ((h << 5) - h) + (i * 31 + 7);
      h = h & h;
      key += String.fromCharCode(h & 0xFF);
    }
    return key;
  }

  function encrypt(plaintext){
    var key = deriveKey();
    // V2: UTF-8 encode first so btoa() never throws on non-Latin1 (emoji/CJK) data
    var enc = new TextEncoder();
    var bytes = enc.encode(String(plaintext));
    var result = '';
    for(var i=0;i<bytes.length;i++){
      var c = bytes[i] ^ key.charCodeAt(i % key.length);
      result += String.fromCharCode(c);
    }
    return btoa(result);
  }

  function decrypt(ciphertext){
    var key = deriveKey();
    var raw = atob(ciphertext);
    // XOR back to UTF-8 bytes, then decode to string
    var bytes = new Uint8Array(raw.length);
    for(var i=0;i<raw.length;i++){
      bytes[i] = raw.charCodeAt(i) ^ key.charCodeAt(i % key.length);
    }
    return new TextDecoder().decode(bytes);
  }

  // Legacy V1 decrypt (XOR on UTF-16 code units — only safe for Latin-1 data)
  function decryptV1(ciphertext){
    var key = deriveKey();
    var raw = atob(ciphertext);
    var result = '';
    for(var i=0;i<raw.length;i++){
      var c = raw.charCodeAt(i) ^ key.charCodeAt(i % key.length);
      result += String.fromCharCode(c);
    }
    return result;
  }

  window.__secure = {
    getItem: function(key){
      var raw = localStorage.getItem(key);
      if(!raw) return null;
      if(raw.indexOf('__e2:') === 0){
        try { return decrypt(raw.substring(5)); }
        catch(e){ return null; }
      }
      if(raw.indexOf(STORAGE_PREFIX) === 0){
        try { return decryptV1(raw.substring(STORAGE_PREFIX.length)); }
        catch(e){ return null; }
      }
      return raw;
    },
    setItem: function(key, value){
      localStorage.setItem(key, '__e2:' + encrypt(String(value)));
    },
    removeItem: function(key){
      localStorage.removeItem(key);
    },
    clear: function(){
      localStorage.removeItem(SALT_KEY);
    }
  };
})();

const API_URL = 'https://glbtoken-backend-production.up.railway.app';

// ── Safe token recovery from URL (auth/payment redirect) ──
// Validates JWT shape + expiry + freshness BEFORE persisting, so a crafted
// link can't overwrite an existing session (session-fixation) and tokens
// never linger in the address bar.
window.recoverTokenFromUrl = function recoverTokenFromUrl(){
  try{
    var params = new URLSearchParams(window.location.search);
    var urlToken = params.get('token');
    if(!urlToken) return false;
    var urlUser = params.get('user');
    var ts = params.get('_ts');
    // JWT shape: three dot-separated base64url segments
    var parts = String(urlToken).split('.');
    if(parts.length !== 3){ return false; }
    // Expiry check (JWT payload is base64url, not standard base64)
    try{
      var b64 = parts[1].replace(/-/g,'+').replace(/_/g,'/');
      while(b64.length % 4) b64 += '=';
      var payload = JSON.parse(decodeURIComponent(escape(atob(b64))));
      if(payload.exp && payload.exp * 1000 < Date.now()){ return false; }
    }catch(e){ return false; }
    // Freshness check: if the backend supplied _ts (ms), reject links older than 5 min
    if(ts){
      var tsNum = parseInt(ts, 10);
      if(!isNaN(tsNum) && (Date.now() - tsNum) > 300000){ return false; }
    }
    // All checks passed — persist
    var secure = window.__secure || {getItem:function(k){return localStorage.getItem(k)}, setItem:function(k,v){localStorage.setItem(k,v)}, removeItem:function(k){localStorage.removeItem(k)}};
    token = urlToken; // in-memory + per-tab cache (never localStorage)
    try{ sessionStorage.setItem('gt_token', urlToken); }catch(e){}
    if(urlUser){
      try{ secure.setItem('gt_user', decodeURIComponent(urlUser)); }catch(e){}
    }
    // Persist refresh token too (social-login redirects now include it) so the
    // 60-min access token can be renewed instead of force-logging-out the user.
    var urlRefresh = params.get('refresh');
    if(urlRefresh){ secure.setItem('gt_refresh_token', urlRefresh); }
    // Strip token from the address bar immediately (no back-button leak)
    var clean = window.location.protocol + '//' + window.location.host + window.location.pathname;
    window.history.replaceState({}, document.title, clean);
    return true;
  }catch(e){ return false; }
};
    let token = sessionStorage.getItem('gt_token') || '';  // Access token: per-tab sessionStorage cache (never localStorage)
    // Drop expired cached access tokens so the silent restore mints a fresh one
    if(token){
      try{
        var _p = token.split('.')[1];
        var _b64 = _p.replace(/-/g,'+').replace(/_/g,'/');
        while(_b64.length % 4) _b64 += '=';
        var _payload = JSON.parse(decodeURIComponent(escape(atob(_b64))));
        if(_payload.exp && _payload.exp * 1000 < Date.now()){
          token = ''; sessionStorage.removeItem('gt_token');
        }
      }catch(e){ token = ''; sessionStorage.removeItem('gt_token'); }
    }
    let userData = {};
    try{ userData = JSON.parse((window.__secure ? window.__secure.getItem('gt_user') : localStorage.getItem('gt_user')) || '{}'); }catch(e){ userData = {}; }
    let keys = [];
    try{ keys = JSON.parse((window.__secure ? window.__secure.getItem('gt_keys') : localStorage.getItem('gt_keys')) || '[]'); }catch(e){ keys = []; }
    let newapiToken = (window.__secure ? window.__secure.getItem('gt_newapi_token') : localStorage.getItem('gt_newapi_token')) || '';
    let newapiEndpoint = (window.__secure ? window.__secure.getItem('gt_newapi_endpoint') : localStorage.getItem('gt_newapi_endpoint')) || '';

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

    // ── Compact cards (persisted across all dash pages) ──
    (function(){try{
      if(localStorage.getItem('gt_compact')==='1'){
        document.body.classList.add('compact-cards');
      }
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

    // Whitelist for IDs interpolated into inline onclick handlers.
    // Server-assigned ids are numeric/alphanumeric — strip anything else so a
    // hostile value can never break out of the JS string/attribute context.
    function safeJsId(v){
      return String(v==null?'':v).replace(/[^A-Za-z0-9_-]/g,'');
    }

    // ── API Helper ──
    let models = [], selectedAmount = 5, selectedPayment = 'stripe';
    let chartInst = null, sparkInst = null, sortDir = 'price_asc';

    // Single-flight token refresh: when several API calls 401 at once (common on
    // dashboard load / chat send), they must share ONE /auth/refresh call.
    // The backend ROTATES refresh tokens, so parallel refreshes with the same
    // token race — the loser gets "Invalid or expired refresh token" and would
    // otherwise trigger a false "session expired" popup.
    let refreshPromise = null;
    async function refreshSession(){
      if(refreshPromise) return refreshPromise;
      refreshPromise = (async () => {
        const rt = (window.__secure ? window.__secure.getItem('gt_refresh_token') : localStorage.getItem('gt_refresh_token'));
        if(!rt) throw new Error('No refresh token');
        // 10s timeout so a hung refresh endpoint can't block all api() calls
        const rc = new AbortController();
        const rtimer = setTimeout(()=>rc.abort(), 10000);
        let refreshResp;
        try {
          refreshResp = await fetch(API_URL+'/auth/refresh', {
            method:'POST',
            headers:{'Content-Type':'application/json'},
            body:JSON.stringify({refresh_token: rt}),
            signal: rc.signal
          });
        } finally {
          clearTimeout(rtimer);
        }
        if(!refreshResp.ok) throw new Error('Refresh failed');
        const refreshData = await refreshResp.json();
        // Store new tokens — access token caches per-tab (sessionStorage), never localStorage
        token = refreshData.token;
        try{ sessionStorage.setItem('gt_token', refreshData.token); }catch(e){}
        userData = JSON.parse((window.__secure ? window.__secure.getItem('gt_user') : localStorage.getItem('gt_user')) || '{}');
        (window.__secure||{setItem:function(k,v){localStorage.setItem(k,v)}}).setItem('gt_refresh_token', refreshData.refresh_token);
        // Session restored asynchronously — re-sync nav/UI now that token is ready
        if(typeof window.applyAuth === 'function'){ window.applyAuth(); }
        return refreshData;
      })().finally(function(){ refreshPromise = null; });
      return refreshPromise;
    }

    // ── Silent session restore ──
    // Access token lives in per-tab sessionStorage (never localStorage). On page
    // load, if there's no cached access token but a refresh token exists, mint a
    // fresh one. Failure is silent — api() still handles 401 → refresh → retry.
    (function(){
      var cached = sessionStorage.getItem('gt_token');
      var rt = (window.__secure ? window.__secure.getItem('gt_refresh_token') : localStorage.getItem('gt_refresh_token'));
      if(!cached && rt){ refreshSession().catch(function(){}); }
    })();

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
          // Only 401 is a session problem — everything else is surfaced as-is
          if(resp.status === 401){
            const hasToken = !!token;
            const rt = (window.__secure ? window.__secure.getItem('gt_refresh_token') : localStorage.getItem('gt_refresh_token'));
            // hasSession: access token in memory (restored) OR refresh token present
            const hasSession = hasToken || !!rt;
            if(hasSession && rt){
              // Silently attempt token refresh before declaring session expired
              try {
                await refreshSession();
                // Retry the original request with the fresh token
                opts.headers['Authorization'] = 'Bearer '+token;
                const retryResp = await fetch(API_URL+path, opts);
                if(retryResp.ok) return await retryResp.json();
                // If retry also fails, surface the real error (not a session problem)
                const errData = await retryResp.json().catch(()=>{});
                const e2 = new Error(((errData&&errData.detail)||'API error').replace(/^\[?\d{3}\]?\s*/,''));
                e2._surfaced = true;
                throw e2;
              } catch(refreshError){
                // Refresh failed — before declaring session expired, check if
                // another tab rotated the token (multi-tab race). If storage now
                // holds a DIFFERENT refresh token, retry once with it.
                var rt2 = (window.__secure ? window.__secure.getItem('gt_refresh_token') : localStorage.getItem('gt_refresh_token'));
                if(rt2 && rt2 !== rt){
                  try {
                    await refreshSession();
                    opts.headers['Authorization'] = 'Bearer '+token;
                    const retryResp2 = await fetch(API_URL+path, opts);
                    if(retryResp2.ok) return await retryResp2.json();
                  } catch(e2){ /* fall through to session expired handling */ }
                }
                // Fall through to normal session expired handling
              }
            }
            // Anonymous visitor hitting a protected endpoint — not a session problem
            if(!hasSession){
              const e3 = new Error('Not authenticated');
              e3._surfaced = true;
              throw e3;
            }
            // Session genuinely expired (had a token but refresh failed):
            // show modal on dash pages, silently redirect elsewhere
            var page = window.location.pathname.split('/').pop();
            var isDashPage = page === '' || page === 'dashboard.html' || page === 'settings.html' || page === 'logs.html' || page === 'billing.html' || page === 'usage.html' || page === 'manage-keys.html' || page === 'team.html' || page === 'referrals.html';
            if(isDashPage){
              showSessionExpired();
            } else {
              clearSession();
              window.location.href = 'login.html';
            }
            throw new Error('Session expired');
          }
          // Non-401 error (402 insufficient balance, 4xx validation, 5xx): surface the real message
          var errBody = await resp.json().catch(function(){ return null; });
          var detail = (errBody && (errBody.detail || errBody.message)) || ('Request failed (' + resp.status + ')');
          if(detail && typeof detail === 'object'){ detail = JSON.stringify(detail); }
          const e4 = new Error(String(detail).replace(/^\[?\d{3}\]?\s*/,''));
          e4._surfaced = true;
          throw e4;
        }
        return await resp.json();
      } catch(e) {
        if (e.name === 'AbortError') throw new Error('Request timed out');
        if(e._surfaced || e.message === 'Session expired') throw e;
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
      const pageMap = {pricing:'pricing.html',how:'how.html',models:'models.html',apikeys:'manage-keys.html',dashboard:'dashboard.html',history:'usage.html',topup:'topup.html',faq:'faq.html',about:'about.html',blog:'blog.html',terms:'terms.html',privacy:'privacy.html',refund:'refund.html',login:'login.html',register:'register.html',settings:'settings.html',notifications:'settings.html',billing:'billing.html',referral:'referrals.html',team:'team.html',playground:'playground.html'};
      if (pageMap[page]) { window.location=pageMap[page]; }
    }

    // ── Auth Guard ──
    function requireAuth(){
      var hasSession = (window.__secure ? window.__secure.getItem('gt_refresh_token') : localStorage.getItem('gt_refresh_token'));
      if(!hasSession){
        window.location.replace('login.html');
        return false;
      }
      return true;
    }
    window.addEventListener('pageshow',function(e){
      if(e.persisted && !(window.__secure ? window.__secure.getItem('gt_refresh_token') : localStorage.getItem('gt_refresh_token'))){
        // Only force login on protected pages. Public pages (visuals, pricing,
        // how, models, etc.) must restore normally on back/swipe — otherwise
        // guests get hijacked to login.html every time they navigate back.
        var page = window.location.pathname.split('/').pop();
        var isProtected = ['dashboard.html','settings.html','logs.html','billing.html','usage.html','manage-keys.html','team.html','referrals.html','playground.html','apikeys.html','topup.html'].indexOf(page) !== -1;
        if(isProtected){ window.location.replace('login.html'); }
      }
    });

    // ── Hero Variants (reads the single I18N dictionary) ──
    function initHeroVariants(){
      var tagline = document.getElementById('heroTagline');
      if(tagline){
        var n = Math.floor(Math.random() * 6) + 1;
        var key = 'hero-variant-' + n;
        var lang = localStorage.getItem('gt_lang') || 'en';
        if(typeof I18N !== 'undefined' && I18N[key]){
          tagline.textContent = I18N[key][lang] || I18N[key]['en'] || '';
        }
      }
      var headline = document.getElementById('heroHeadline');
      if(headline){
        var n2 = Math.floor(Math.random() * 5) + 1;
        var key2 = 'hero-headline-' + n2;
        var lang2 = localStorage.getItem('gt_lang') || 'en';
        if(typeof I18N !== 'undefined' && I18N[key2]){
          headline.innerHTML = I18N[key2][lang2] || I18N[key2]['en'] || '';
        }
      }
    }

    // ── Chat Drag Handler ──
    (function(){
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
    })();

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

// ── Shared session teardown ──
// Single source of truth for clearing ALL auth-related storage keys.
// Used by logoutUser(), the 401 handler, and the session-expired modal.
function clearSession(){
  token=''; userData={};
  try{ sessionStorage.removeItem('gt_token'); }catch(e){}
  try{ (window.__secure||{removeItem:function(k){localStorage.removeItem(k)}}).removeItem('gt_token'); }catch(e){}
  try{ (window.__secure||{removeItem:function(k){localStorage.removeItem(k)}}).removeItem('gt_user'); }catch(e){}
  try{ localStorage.removeItem('gt_refresh_token'); }catch(e){}
  try{ localStorage.removeItem('gt_newapi_token'); }catch(e){}
  try{ localStorage.removeItem('gt_newapi_endpoint'); }catch(e){}
  try{ localStorage.removeItem('gt_keys'); }catch(e){}
  try{ if(window.__secure && window.__secure.clear) window.__secure.clear(); }catch(e){}
}

function logoutUser(){
      // Show confirmation dialog instead of immediate logout
      showConfirm('Sign out?','Are you sure you want to sign out?',function(){
    // Best-effort server-side revoke of refresh token (industry standard)
    try{
      var rt=(window.__secure ? window.__secure.getItem('gt_refresh_token') : localStorage.getItem('gt_refresh_token'));
      if(rt){fetch(API_URL+'/auth/logout',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({refresh_token:rt})}).catch(function(){});}
    }catch(e){}
    clearSession();
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
      setBtnLoading(btn, true, 'Sending');
      try {
        await safeApi('POST','/api/contact',{name:n,email:e,message:m});
        showToast('Message sent successfully','success');
      } finally {
        if(btn){btn.disabled=false;btn.textContent='Send Message'}
      }
    }
    async function refreshMe(){
      if(!token)return;
      const d=await safeApi('GET','/api/auth/me',null,null,true); if(!d)return;
      userData=d;window.__secure.setItem('gt_user',JSON.stringify(d));applyAuth();
    }

    // ── Notification Settings ──
    async function saveNotificationSettings(){
      if(!token){showToast('Please sign in first','error');return}
      var emailEl=document.getElementById('notifEmail');
      var balEl=document.getElementById('notifLowBalance');
      var loginEl=document.getElementById('notifLogin');
      if(!emailEl){showToast('Settings form not found','error');return}
      await safeApi('PUT','/api/user/settings',{
        email_notifications:emailEl.checked,
        low_balance_alert:balEl?balEl.checked:false,
        login_alerts:loginEl?loginEl.checked:false
      });
      showToast('Notification preferences saved','success');
    }
    // ── History / Transactions ──

// ── Auth UI sync (shared so it works on all pages, not just dashboard) ──
window.applyAuth = function applyAuth(){
  var loggedIn = !!token;
  var ng = document.getElementById('navGuest'); if(ng) ng.style.display = loggedIn ? 'none' : 'flex';
  var nu = document.getElementById('navUser');
  if(nu){ nu.style.display = loggedIn ? 'flex' : 'none'; nu.classList.toggle('d-none', !loggedIn); }
  var nb = document.getElementById('navBalance'); if(nb) nb.style.display = loggedIn ? 'inline-block' : 'none';
  // Mobile menu sync
  var mg = document.getElementById('mobileGuestSection'); if(mg) mg.style.display = loggedIn ? 'none' : 'block';
  var mu = document.getElementById('mobileUserSection');
  if(mu){ mu.style.display = loggedIn ? 'block' : 'none'; mu.classList.toggle('d-none', !loggedIn); }
  if(loggedIn){
    // Display name priority: saved profile name (when it's a real custom
    // name) > email prefix (example@mail.com → Example) > "User".
    var displayName = 'User';
    if(userData){
      var prefixName = '';
      if(userData.email && userData.email.indexOf('@') > 0){
        if(userData.email.endsWith('@privaterelay.appleid.com')){
          prefixName = 'Apple User';
        } else {
          var prefix = userData.email.split('@')[0];
          prefixName = prefix ? prefix.charAt(0).toUpperCase() + prefix.slice(1) : '';
        }
      }
      var storedName = (userData.name || '').trim();
      var rawPrefix = userData.email ? userData.email.split('@')[0].toLowerCase() : '';
      if(storedName && storedName.toLowerCase() !== rawPrefix){
        displayName = storedName;
      } else if(prefixName){
        displayName = prefixName;
      } else if(storedName){
        displayName = storedName;
      }
    }
    var initial = (displayName || 'U')[0].toUpperCase();
    var du = document.getElementById('dashUserName'); if(du) du.textContent = displayName;
    // API doc page: show Go to Dashboard button when logged in
    var goBtn = document.getElementById('apiGoToDashBtn');
    if(goBtn) goBtn.style.display = loggedIn ? 'inline-flex' : 'none';
    var av = document.querySelector('.nav-avatar');
    if(av){
      var textNode = document.createTextNode(initial);
      var dropdown = av.querySelector('.dropdown');
      av.textContent = '';
      av.appendChild(textNode);
      if(dropdown) av.appendChild(dropdown);
    }
    var da = document.getElementById('ddAvatar'); if(da) da.textContent = initial;
    var dn = document.getElementById('dropName'); if(dn) dn.textContent = displayName;
    var de = document.getElementById('dropEmail'); if(de) de.textContent = (userData && userData.email) || '';
    // Mobile sync
    var ma = document.getElementById('mAvatar'); if(ma) ma.textContent = initial;
    var mn = document.getElementById('mName'); if(mn) mn.textContent = displayName;
    var me = document.getElementById('mEmail'); if(me) me.textContent = (userData && userData.email) || '';
  }
  if(typeof updateBalance === 'function') updateBalance();
  applyTeamNavGate();
};

// ── Customer Tier (Enterprise+ gates Team features) ──
// Tier is derived from lifetime spend (total_spent) — same thresholds as the backend.
window.getUserTier = function getUserTier(){
  var spent = parseFloat((userData && userData.total_spent) || 0) || 0;
  if(spent >= 100) return 'enterprise';
  if(spent >= 20) return 'professional';
  return 'starter';
};
window.isEnterprise = function isEnterprise(){ return window.getUserTier() === 'enterprise'; };
window.applyTeamNavGate = function applyTeamNavGate(){
  // Hide the Team sidebar entry (and its section label) for non-Enterprise users.
  if(window.isEnterprise()) return;
  var hidden = 0;
  document.querySelectorAll('.dash-sidebar-item[href="team.html"]').forEach(function(a){
    var label = a.previousElementSibling;
    if(label && label.classList && label.classList.contains('dash-sidebar-label') &&
       (label.textContent || '').trim() === 'Team'){
      label.style.display = 'none'; hidden++;
    }
    a.style.display = 'none'; hidden++;
  });
  // Any other Team links (e.g. inline dashboard cards)
  document.querySelectorAll('a[href="team.html"]').forEach(function(a){
    if(a.style.display !== 'none'){ a.style.display = 'none'; hidden++; }
  });
  return hidden;
};

// ── Date+time formatter (YYYY-MM-DD HH:MM, 24h) — used by tables that
//    need a real timestamp (Recent Transactions, Reward History, keys…)
window.fmtDT = function fmtDT(iso){
  if(!iso) return '';
  var d = new Date((typeof window.parseUTCDate === 'function') ? window.parseUTCDate(iso) : new Date(iso).getTime());
  if(isNaN(d.getTime())) return '';
  function p(n){ return (n<10?'0':'')+n; }
  return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate())+' '+p(d.getHours())+':'+p(d.getMinutes());
};

// ── Two-line timestamp cell (bold date on top, time below) — matches the
//    Login Attempts / billing invoices tables (td-date-strong + td-time)
window.fmtDTStack = function fmtDTStack(iso){
  if(!iso) return '<div class="td-date-strong">—</div>';
  var d = new Date(parseUTCDate(iso));
  if(isNaN(d.getTime())) return '<div class="td-date-strong">—</div>';
  function p(n){ return (n<10?'0':'')+n; }
  var date = d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate());
  var time = p(d.getHours())+':'+p(d.getMinutes())+':'+p(d.getSeconds());
  return '<div class="td-date-strong">'+date+'</div><div class="td-time">'+time+'</div>';
};

// ── UTC-safe date parse ──
// Backend stores naive UTC (SQLite returns tz-less datetimes; isoformat() has no
// timezone suffix). new Date(iso) would parse those as LOCAL time, shifting every
// displayed timestamp by the UTC offset (e.g. +8h in Asia). Normalize to UTC first.
window.parseUTCDate = function parseUTCDate(iso){
  if(!iso) return NaN;
  var norm = String(iso).trim();
  if(!/Z$|[+-]\d{2}:?\d{2}$/.test(norm)){
    norm = norm.replace(' ', 'T') + 'Z';
  }
  return new Date(norm).getTime();
};

// ── Balance UI sync (shared so it works on all pages, not just usage) ──
window.updateBalance = function updateBalance(){
  const b=userData.token_balance||0;
  var nb=document.getElementById('navBalance');if(nb)nb.textContent=b.toLocaleString()+' Tokens';
  var db2=document.getElementById('ddBalance');if(db2)db2.textContent=b.toLocaleString()+' GT';
  var mb=document.getElementById('mBalance');if(mb)mb.textContent=b.toLocaleString();
  const db=document.getElementById('dashBalance');
  if(db)db.textContent=b.toLocaleString();
  const du=document.getElementById('dashUsd');
  if(du)du.textContent=fmtUSD(b/1000)+' USD';
  const hb=document.getElementById('heroBalance');
  if(hb)hb.textContent=b.toLocaleString();
};

// ── Unified USD formatting (OVERVIEW is the reference) ──
// "$1,234.56" — thousands separators + fixed decimals. Use everywhere a
// dollar amount is displayed so all pages show digits identically.
window.fmtUSD = function fmtUSD(n, dp){
  dp = (dp == null) ? 2 : dp;
  return '$' + (Number(n)||0).toLocaleString(undefined,{minimumFractionDigits:dp, maximumFractionDigits:dp});
};

// ── Mobile show-more collapse for TABLES (show 3 on mobile, all on desktop) ──
// Generic helpers used by logs/usage/billing/referrals. See skill
// static-html-maintenance refs/mobile-show-more-collapse.md (tbody variant).
window.renderTableWithCollapse = function renderTableWithCollapse(bodyId, rows, collapseId, btnId){
  var body=document.getElementById(bodyId);
  if(!body)return;
  var first=rows.slice(0,5).join('');
  var rest=rows.slice(5);
  body.innerHTML=first;
  var oldC=document.getElementById(collapseId);
  if(oldC)oldC.remove();
  var oldB=document.getElementById(btnId);
  if(oldB)oldB.remove();
  if(!rest.length)return;
  var table=body.closest('table');
  var tb=document.createElement('tbody');
  tb.id=collapseId;
  tb.className='tx-collapse';
  tb.setAttribute('data-count',rest.length);
  tb.innerHTML=rest.join('');
  table.appendChild(tb);
  var btn=document.createElement('button');
  btn.id=btnId;
  btn.type='button';
  btn.className='list-more-btn';
  btn.innerHTML='Show More ('+rest.length+') ▾';
  btn.onclick=function(){toggleTableMore(collapseId,btnId);};
  var wrap=table.parentNode;
  wrap.parentNode.insertBefore(btn,wrap.nextSibling);
  refreshTableMoreBtn(collapseId,btnId);
};
window.clearTableCollapse = function clearTableCollapse(collapseId,btnId){
  var c=document.getElementById(collapseId);if(c)c.remove();
  var b=document.getElementById(btnId);if(b)b.remove();
};
window.toggleTableMore = function toggleTableMore(collapseId,btnId){
  var collapse=document.getElementById(collapseId);
  if(!collapse)return;
  collapse.classList.toggle('open');
  refreshTableMoreBtn(collapseId,btnId);
};
window.refreshTableMoreBtn = function refreshTableMoreBtn(collapseId,btnId){
  var collapse=document.getElementById(collapseId);
  var btn=document.getElementById(btnId);
  if(!collapse||!btn)return;
  var count=collapse.querySelectorAll(':scope > tr').length;
  collapse.setAttribute('data-count',count);
  if(!count){btn.style.display='none';return;}
  btn.style.display='';
  btn.innerHTML=collapse.classList.contains('open')?'Show Less ▴':'Show More ('+count+') ▾';
};
