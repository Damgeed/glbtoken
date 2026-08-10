/* ══════════════════════════════════════════
   AUTH — Email login/register (passwordless via Auth0)
   ══════════════════════════════════════════ */
    // After login/register: resume a pending org invite if one exists
    function afterLoginRedirect(){
      try{
        if(sessionStorage.getItem('gt_pending_org') && sessionStorage.getItem('gt_pending_token')){
          window.location.href='/join.html'; return;
        }
      }catch(e){}
      window.location.href='/dashboard.html';
    }
    async function sendLoginCode(){
      const email=document.getElementById('loginEmail').value.trim();
      if(!email||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){
        const m=t('Please enter a valid email address');
        showToast(m,'error');
        return
      }
      const btn=document.getElementById('loginSendBtn');
      setBtnLoading(btn, true, t('Continue'));
      try{
        if(!await safeApi('POST','/api/auth/send-code',{email:email})) return;
        document.getElementById('loginEmailGroup').style.display='none';
        document.getElementById('loginCodeGroup').style.display='block';
        document.getElementById('loginSendBtn').style.display='none';
        document.getElementById('loginVerifyBtn').style.display='block';
        document.getElementById('loginCode').focus();
        showToast(t('Code sent to ')+email,'success');
      }finally{
        btn.disabled=false;btn.textContent=t('Continue');
      }
    }
    var _login2faPreToken = null;
    async function verifyLoginCode(){
      if(_login2faPreToken) return verifyTwoFA();
      const email=document.getElementById('loginEmail').value.trim();
      const code=document.getElementById('loginCode').value.trim();
      if(!code||code.length<4){
        showToast(t('Please enter the verification code from your email'),'error');
        return
      }
      const btn=document.getElementById('loginVerifyBtn');
      setBtnLoading(btn, true, t('Verifying'));
      try{
        var data=await safeApi('POST','/api/auth/verify-code',{email:email,code:code});
        if(!data) return;
        if(data.requires_2fa){
          _login2faPreToken = data.pre_token;
          var lbl=document.querySelector('#loginCodeGroup label');
          if(lbl) lbl.textContent=t('Authenticator Code');
          var inp=document.getElementById('loginCode');
          if(inp){ inp.value=''; inp.placeholder=t('Enter 6-digit code from your app'); inp.focus(); }
          setBtnLoading(btn, false, t('Verify 2FA'));
          showToast(t('Enter your authenticator code'),'info');
          return;
        }
        token=data.token;userData=data.user;
        try{sessionStorage.setItem('gt_token',data.token);}catch(e){}
        if(data&&data.refresh_token)(window.__secure||{setItem:function(k,v){localStorage.setItem(k,v)}}).setItem('gt_refresh_token',data.refresh_token);(window.__secure||{setItem:function(k,v){localStorage.setItem(k,v)}}).setItem('gt_user',JSON.stringify(userData));
        applyAuth();showToast(t('Welcome back!'),'success');
        afterLoginRedirect();
      } catch(e){
        showToast(t('Login failed'),'error');
      }
    }
    async function verifyTwoFA(){
      const code=document.getElementById('loginCode').value.trim();
      if(!code||code.length<6){
        showToast(t('Enter the 6-digit code from your authenticator app'),'error');
        return
      }
      const btn=document.getElementById('loginVerifyBtn');
      setBtnLoading(btn, true, t('Verifying'));
      try{
        var data=await safeApi('POST','/api/auth/2fa/confirm',{pre_token:_login2faPreToken,code:code});
        if(!data) return;
        _login2faPreToken=null;
        token=data.token;userData=data.user;
        try{sessionStorage.setItem('gt_token',data.token);}catch(e){}
        if(data&&data.refresh_token)(window.__secure||{setItem:function(k,v){localStorage.setItem(k,v)}}).setItem('gt_refresh_token',data.refresh_token);(window.__secure||{setItem:function(k,v){localStorage.setItem(k,v)}}).setItem('gt_user',JSON.stringify(userData));
        applyAuth();showToast(t('Welcome back!'),'success');
        afterLoginRedirect();
      } catch(e){
        showToast(t('2FA verification failed'),'error');
      }
    }
    async function sendRegisterCode(){
      const email=document.getElementById('regEmail').value.trim();
      if(!email||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){
        const m=t('Please enter a valid email address');
        showToast(m,'error');
        return
      }
      const btn=document.getElementById('regSendBtn');
      setBtnLoading(btn, true, t('Continue'));
      try{
        if(!await safeApi('POST','/api/auth/send-code',{email:email})) return;
        document.getElementById('regEmailGroup').style.display='none';
        document.getElementById('regCodeGroup').style.display='block';
        document.getElementById('regSendBtn').style.display='none';
        document.getElementById('regVerifyBtn').style.display='block';
        document.getElementById('regCode').focus();
        showToast(t('Code sent to ')+email,'success');
      }finally{
        btn.disabled=false;btn.textContent=t('Continue');
      }
    }
    function _getReferralAttribution(){
      /* P0-2 attribution window: persist ?ref= in localStorage for 30 days so
         a click → register days later still credits the referrer. URL wins;
         otherwise fall back to stored ref if within window. */
      var ref='', src='';
      try{
        var qs=new URLSearchParams(window.location.search);
        ref=qs.get('ref')||'';
        src=qs.get('src')||'';
      }catch(e){}
      if(ref){
        try{
          localStorage.setItem('gt_ref',ref);
          localStorage.setItem('gt_ref_ts',String(Date.now()));
          if(src)localStorage.setItem('gt_ref_src',src);
          else localStorage.removeItem('gt_ref_src');
        }catch(e){}
      }else{
        try{
          var ts=parseInt(localStorage.getItem('gt_ref_ts')||'0',10);
          if(ts && (Date.now()-ts) < 30*24*3600*1000){
            ref=localStorage.getItem('gt_ref')||'';
            src=localStorage.getItem('gt_ref_src')||'';
          }
        }catch(e){}
      }
      return {ref:ref, src:src};
    }
    function _clearReferralAttribution(){
      try{
        localStorage.removeItem('gt_ref');
        localStorage.removeItem('gt_ref_ts');
        localStorage.removeItem('gt_ref_src');
      }catch(e){}
    }
    async function verifyRegisterCode(){
      const email=document.getElementById('regEmail').value.trim();
      const code=document.getElementById('regCode').value.trim();
      if(!code||code.length<4){
        const m=t('Please enter the verification code from your email');
        showToast(m,'error');
        return
      }
      const btn=document.getElementById('regVerifyBtn');
      setBtnLoading(btn, true, t('Verifying'));
      try{
        var att=_getReferralAttribution();
        var data=await safeApi('POST','/api/auth/verify-code',{email:email,code:code,ref:att.ref,src:att.src});
        if(!data) return;
        _clearReferralAttribution();
        token=data.token;userData=data.user;
        try{sessionStorage.setItem('gt_token',data.token);}catch(e){}
        if(data&&data.refresh_token)(window.__secure||{setItem:function(k,v){localStorage.setItem(k,v)}}).setItem('gt_refresh_token',data.refresh_token);(window.__secure||{setItem:function(k,v){localStorage.setItem(k,v)}}).setItem('gt_user',JSON.stringify(userData));
        applyAuth();showToast(t('Account created! Welcome.'),'success');
        afterLoginRedirect();
      }finally{
        btn.disabled=false;btn.textContent=t('Verify & Create Account');
      }
    }

/* ══════════════════════════════════════════
   AUTH — Phone SMS verification
   ══════════════════════════════════════════ */
    function togglePhone(prefix){
      var section = document.getElementById(prefix + 'PhoneSection');
      if(!section) return;
      var isShow = section.style.display === 'block';
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
      var isOpen = list.style.display === 'block' && !list.classList.contains('d-none');
      // Close all other dropdowns first
      var allLists = document.querySelectorAll('.phone-dropdown');
      for(var i=0;i<allLists.length;i++){ allLists[i].style.display = 'none'; allLists[i].classList.add('d-none'); }
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
      list.classList.remove('d-none');
    }
    function selectCountry(prefix, dial, flag){
      document.getElementById(prefix + 'CountryFlag').textContent = flag;
      document.getElementById(prefix + 'CountryDial').textContent = dial;
      selectedDial[prefix] = dial;
      var list = document.getElementById(prefix + 'CountryList');
      if(list){ list.style.display = 'none'; list.classList.add('d-none'); }
    }
    function renderCountryOptions(prefix){
      var list = document.getElementById(prefix + 'CountryList');
      if(!list) return;
      var html = '';
      for(var i=0;i<COUNTRY_CODES.length;i++){
        var c = COUNTRY_CODES[i];
        var sel = c.dial === selectedDial[prefix] ? ' class="country-opt active"' : ' class="country-opt"';
        var safePrefix = prefix.replace(/[^a-zA-Z0-9_-]/g, '');
        html += '<div' + sel + ' onclick="selectCountry(\'' + safePrefix + '\',\'' + escapeAttr(c.dial) + '\',\'' + escapeAttr(c.flag) + '\')"><span>' + c.flag + ' ' + escapeHtml(c.name) + '</span> <span class="country-dial">' + escapeHtml(c.dial) + '</span></div>';
      }
      list.innerHTML = html;
    }
    // Close country dropdown on click outside
    document.addEventListener('click',function(e){
      var cp = e.target.closest('.phone-wrap');
      if(!cp){
        var lists = document.querySelectorAll('.phone-dropdown');
        for(var i=0;i<lists.length;i++){ lists[i].style.display = 'none'; lists[i].classList.add('d-none'); }
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
        var m = t('Please enter a valid phone number');
        showToast(m,'error');
        return;
      }
      var btn = document.getElementById(prefix + 'PhoneSendBtn');
      setBtnLoading(btn, true, t('Send Message'));
      try{
        if(!await safeApi('POST','/api/auth/send-sms-code',{phone:phone})) return;
        document.getElementById(prefix + 'SmsCodeGroup').style.display='block';
        btn.style.display='none';
        document.getElementById(prefix + 'PhoneVerifyBtn').style.display='block';
        document.getElementById(prefix + 'SmsCode').focus();
        showToast(t('Code sent to ') + phone,'success');
        startResendTimer(prefix);
      }finally{
        btn.disabled=false; btn.textContent=t('Send Code');
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
        label.textContent = t('Resend code in ') + m + ':' + (s < 10 ? '0' : '') + s;
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
        var m = t('Please enter the verification code from SMS');
        showToast(m,'error');
        return;
      }
      var btn = document.getElementById(prefix + 'PhoneVerifyBtn');
      setBtnLoading(btn, true, t('Verifying'));
      try{
        var data = await safeApi('POST','/api/auth/verify-sms-code',{phone:phone,code:code});
        if(!data) return;
        token=data.token;userData=data.user;
        try{sessionStorage.setItem('gt_token',data.token);}catch(e){}
        if(data&&data.refresh_token)(window.__secure||{setItem:function(k,v){localStorage.setItem(k,v)}}).setItem('gt_refresh_token',data.refresh_token);(window.__secure||{setItem:function(k,v){localStorage.setItem(k,v)}}).setItem('gt_user',JSON.stringify(userData));
        applyAuth();
        showToast(prefix === 'login' ? t('Welcome back!') : t('Account created! Welcome.'),'success');
        afterLoginRedirect();
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
      setBtnLoading(btn, true, t('Connecting...'));
      // Get Auth0 config from Railway (client ID stays hidden server-side)
      api('GET', '/api/auth/auth0/config').then(function(cfg){
        if (!cfg || !cfg.configured) {
          setBtnLoading(btn, false);
          showToast('Auth0 not configured', 'error');
          return;
        }
        // Generate PKCE code verifier and challenge
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

