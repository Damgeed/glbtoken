
    const API_URL = (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
      ? 'http://localhost:8000' : 'https://glbtoken-backend-production.up.railway.app';
    let token = localStorage.getItem('gt_token') || '';
    let userData = JSON.parse(localStorage.getItem('gt_user') || '{}');
    let keys = JSON.parse(localStorage.getItem('gt_keys') || '[]');
    let newapiToken = localStorage.getItem('gt_newapi_token') || '';
    let newapiEndpoint = localStorage.getItem('gt_newapi_endpoint') || '';

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
    
    async function api(method, path, body){
      const opts={method,headers:{'Content-Type':'application/json'}};
      if(token) opts.headers['Authorization']='Bearer '+token;
      if(body) opts.body=JSON.stringify(body);
      try {
        const resp=await fetch(API_URL+path,opts);
        if (!resp.ok) {
          const errData = await resp.json().catch(()=>{});
          throw new Error(((errData&&errData.detail)||'API error').replace(/^\[?\d{3}\]?\s*/,''));
        }
        return await resp.json();
      } catch(e) {
        throw e;
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

    // ── Auth ──
    async function registerUser(){
      const name=document.getElementById('regName').value;
      const email=document.getElementById('regEmail').value;
      const pass=document.getElementById('regPassword').value;
      const confirm=document.getElementById('regConfirm').value;
      const country='';
      const errEl=document.getElementById('regError');
      if(errEl){errEl.style.display='none';errEl.textContent=''}
      // Per-field validation
      var fieldErrors = [];
      if(!name){fieldErrors.push('Name'); document.getElementById('regName').classList.add('field-error')}
      else document.getElementById('regName').classList.remove('field-error');
      if(!email){fieldErrors.push('Email'); document.getElementById('regEmail').classList.add('field-error')}
      else document.getElementById('regEmail').classList.remove('field-error');
      if(!pass){fieldErrors.push('Password'); document.getElementById('regPassword').classList.add('field-error')}
      else document.getElementById('regPassword').classList.remove('field-error');
      if(fieldErrors.length){const m='Please fill in: ' + fieldErrors.join(', ');showToast(m,'error');if(errEl){errEl.textContent=m;errEl.style.display='block'}return}
      if(pass!==confirm){const m='Passwords do not match';showToast(m,'error');if(errEl){errEl.textContent=m;errEl.style.display='block'}return}
      if(pass.length<6){const m='Password must be at least 6 characters';showToast(m,'error');if(errEl){errEl.textContent=m;errEl.style.display='block'}return}
      try{
        const data=await api('POST','/api/auth/register',{name,email,password:pass,country});
        token=data.token;userData=data.user;
        localStorage.setItem('gt_token',token);localStorage.setItem('gt_user',JSON.stringify(userData));
        if(data.newapi_token){
          newapiToken=data.newapi_token;
          newapiEndpoint=data.newapi_endpoint||'';
          localStorage.setItem('gt_newapi_token',newapiToken);
          localStorage.setItem('gt_newapi_endpoint',newapiEndpoint);
        }
        applyAuth();showToast('Account created! Welcome.','success');window.location.href='/dashboard.html';
      }catch(e){
        const msg=e.message||'Registration failed';
        showToast(msg,'error');
        if(errEl){errEl.textContent=msg;errEl.style.display='block'}
      }
    }
    async function loginUser(){
      const email=document.getElementById('loginEmail').value;
      const pass=document.getElementById('loginPassword').value;
      const errEl=document.getElementById('loginError');
      if(errEl){errEl.style.display='none';errEl.textContent=''}
      // Per-field validation
      var fieldErrors = [];
      if(!email){fieldErrors.push('Email'); document.getElementById('loginEmail').classList.add('field-error')}
      else document.getElementById('loginEmail').classList.remove('field-error');
      if(!pass){fieldErrors.push('Password'); document.getElementById('loginPassword').classList.add('field-error')}
      else document.getElementById('loginPassword').classList.remove('field-error');
      if(fieldErrors.length){const m='Please enter: ' + fieldErrors.join(', ');showToast(m,'error');if(errEl){errEl.textContent=m;errEl.style.display='block'}return}
      try{
        const data=await api('POST','/api/auth/login',{email,password:pass});
        token=data.token;userData=data.user;
        localStorage.setItem('gt_token',token);localStorage.setItem('gt_user',JSON.stringify(userData));
        applyAuth();showToast('Welcome back!','success');
        window.location.href = '/dashboard.html';
      }catch(e){
        const msg=e.message||'Login failed';
        showToast(msg,'error');
        if(errEl){errEl.textContent=msg;errEl.style.display='block'}
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
      overlay.innerHTML = '<div style="background:var(--card);border:1px solid var(--border);border-radius:16px;padding:2rem;max-width:400px;width:90%;box-shadow:0 20px 60px rgba(0,0,0,0.5)">' +
        '<h3 style="margin:0 0 0.5rem;color:var(--text)">Reset Password</h3>' +
        '<p style="color:var(--text-secondary);font-size:0.9rem;margin-bottom:1.5rem">Enter your email and we\'ll send a reset link.</p>' +
        '<div class="auth-field"><label>Email</label><input type="email" id="resetEmail" placeholder="you@example.com"></div>' +
        '<div id="resetError" style="color:#ff4444;font-size:0.85rem;margin-bottom:1rem;text-align:center;display:none"></div>' +
        '<div style="display:flex;gap:0.75rem;margin-top:1rem">' +
        '<button class="btn-primary" style="flex:1;font-size:0.8rem;white-space:nowrap" id="resetSendBtn" onclick="sendResetLink()">Send Reset Link</button>' +
        '<button class="btn-secondary" style="flex:1;font-size:0.8rem;text-align:center;justify-content:center;padding:0.75rem 1rem" onclick="this.closest(\'.modal-overlay\').remove()">Cancel</button>' +
        '</div></div>';
      document.body.appendChild(overlay);
    }
    async function sendResetLink(){
      var email = document.getElementById('resetEmail').value;
      var errEl = document.getElementById('resetError');
      if(errEl)errEl.style.display='none';
      if(!email){var m='Enter your email';showToast(m,'error');if(errEl){errEl.textContent=m;errEl.style.display='block'}return}
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
    document.addEventListener('touchend', function(e){
      var target = e.target;
      if(target && (target.id === 'chatSendBtn' || target.closest('#chatSendBtn'))){
        // Prevent default so button doesn't steal focus
        e.preventDefault();
        var input = document.getElementById('chatInput');
        if(input) {
          // Keep focus BEFORE calling sendChatMsg
          input.focus({preventScroll:true});
          setTimeout(function(){ sendChatMsg(); }, 50);
        } else {
          sendChatMsg();
        }
      }
    }, {passive:false});
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
body.innerHTML=d.items.map(t=>'<tr><td>'+escapeHtml(t.created_at?new Date(t.created_at).toLocaleDateString():'')+'</td><td>'+t.type+'</td><td>'+escapeHtml(t.model_used||t.payment_method||'-')+'</td><td class="amount '+(t.type==='deposit'?'gold':'red')+'">'+(t.type==='deposit'?'+':'')+(t.tokens||0)+'</td><td><span style="color:var(--success)">'+t.status+'</span></td></tr>').join('');
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
        filter.innerHTML='<option value="">All Providers</option>'+provs.map(p=>`<option value="${p}">${p}</option>`).join('');
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
        document.getElementById('txDepositBody').innerHTML=dep.length?dep.map(t=>`<tr><td>${t.created_at?new Date(t.created_at).toLocaleDateString():''}</td><td>$${t.amount.toFixed(2)}</td><td>${t.payment_method||'-'}</td><td class="gold">+${t.tokens||0}</td><td><span style="color:var(--success)">${t.status}</span></td></tr>`).join(''):'<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:1.5rem">No deposits</td></tr>';
        document.getElementById('txConsumptionBody').innerHTML=con.length?con.map(t=>`<tr><td>${t.created_at?new Date(t.created_at).toLocaleDateString():''}</td><td>${t.model_used||'-'}</td><td class="red">-${t.tokens||0}</td><td>API</td></tr>`).join(''):'<tr><td colspan="4" style="text-align:center;color:var(--text-muted);padding:1.5rem">No consumption</td></tr>';
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
    // Auto-resize textarea
    document.addEventListener('DOMContentLoaded',function(){
      const ta = document.getElementById('aiChatInput');
      if(ta){
        ta.addEventListener('input',function(){
          this.style.height = 'auto';
          this.style.height = Math.min(this.scrollHeight, 120) + 'px';
        });
        ta.addEventListener('focus',openMobileChat);
      }
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
    // ── Mobile Chat: floating popup on focus ──
    function openMobileChat(){
      if(window.innerWidth>768)return;
      const section=document.querySelector('.ai-chat-section');
      if(section){
        section.classList.add('chat-focused');
        // Force reflow so browser recomputes flex layout inside fixed container
        void section.offsetHeight;
        // Add close button if not exists
        if(!document.querySelector('.chat-focused-close')){
          const btn=document.createElement('button');
          btn.className='chat-focused-close';
          btn.innerHTML='✕';
          btn.onclick=closeMobileChat;
          section.querySelector('.chat-header').appendChild(btn);
        }
        // Prevent body scroll
        document.body.style.overflow='hidden';
        // Hide floating support chat
        const fab=document.querySelector('.chat-fab');const win=document.getElementById('chatWindow');
        if(fab)fab.style.display='none';if(win)win.style.display='none';
        // RAF: ensures layout is fully committed before scrolling
        requestAnimationFrame(()=>{
          const msgs=document.getElementById('aiChatMsgs');
          if(msgs)msgs.scrollTop=msgs.scrollHeight;
        });
      }
    }
    function closeMobileChat(){
      const section=document.querySelector('.ai-chat-section');
      if(section)section.classList.remove('chat-focused');
      document.body.style.overflow='';
      const btn=document.querySelector('.chat-focused-close');
      if(btn)btn.remove();
      // Restore floating support chat
      const fab=document.querySelector('.chat-fab');const win=document.getElementById('chatWindow');
      if(fab)fab.style.display='';if(win)win.style.display='';
    }
    // ── Support Chat (floating) ──
    function toggleChat(){document.getElementById('chatWindow').classList.toggle('open')}
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
      var history=[];
      msgs.querySelectorAll('.chat-msg').forEach(function(el){
        var role=el.classList.contains('user')?'user':'ai';
        var bubble=el.querySelector('.bubble');
        if(bubble) history.push({role:role,text:bubble.textContent});
      });
      try{localStorage.setItem('gt_chat_history',JSON.stringify(history))}catch(e){}
    }
    function loadChatHistory(){
      var msgs=document.getElementById('chatMsgs');
      if(!msgs)return;
      try{
        var data=localStorage.getItem('gt_chat_history');
        if(!data)return;
        var history=JSON.parse(data);
        if(!history||!history.length)return;
        msgs.innerHTML='';
        history.forEach(function(h){
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
      const t=document.getElementById('toast');
      t.textContent=msg;t.className='toast '+(type||'info');t.classList.add('show');
      clearTimeout(t._timeout);t._timeout=setTimeout(()=>t.classList.remove('show'),3000);
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
    const tmTitles=['🔥 Top Models This Week','💻 API Quick Start','💬 Chat','💬 Responses','🧠 Claude','🔮 Gemini'];

    async function refreshTopModels(){
      var container=document.getElementById('tmModelsView');
      if(!container)return;
      // Save current HTML to restore on API failure
      var fallbackHtml = container.innerHTML;
      container.innerHTML='<div style="grid-column:1/-1;text-align:center;padding:1rem;color:var(--text-muted);font-size:0.8rem">Loading models...</div>';
      try{
        var all=await api('GET','/api/models');
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
    document.addEventListener('DOMContentLoaded',()=>{
      const track=document.getElementById('tmTrack');
      if(!track)return;
      track.addEventListener('touchstart',e=>{tmTouchStartX=e.touches[0].clientX;tmTouchStartY=e.touches[0].clientY},{passive:true});
      track.addEventListener('touchmove',e=>{
        const dx=Math.abs(e.touches[0].clientX-tmTouchStartX);
        const dy=Math.abs(e.touches[0].clientY-tmTouchStartY);
        if(dx>dy&&dx>10)e.preventDefault();
      },{passive:false});
      track.addEventListener('touchend',e=>{
        const dx=e.changedTouches[0].clientX-tmTouchStartX;
        const dy=e.changedTouches[0].clientY-tmTouchStartY;
        if(Math.abs(dx)>40&&Math.abs(dx)>Math.abs(dy)*1.5)slideTopView(dx<0?1:-1);
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
// ── Translation (Google Translate Widget) ──
var GT_LANG = 'en';
var PROTECTED_WORDS = ['GPT','OpenAI','Claude','Gemini','Llama','Mistral','DeepSeek','Perplexity','Cohere','Stripe','Paystack','USDT','BTC','ETH','BNB','SOL','USDC','DAI','NGN','EUR','GBP','JPY','CNY','KRW','GHS','KES','ZAR','USD','API','VPN','SSL','CORS','JSON','ChatGPT','Anthropic','Starter','Professional','Enterprise','Pay-as-You-Go','Multi-Model','Local Payments','GlbTOKEN','Glb','TOKEN','AIEX','KAI','HTTP','GET','POST','PUT','DELETE','PATCH','curl','Bearer','Authorization','Content-Type','application/json','localhost','Base URL','base_url','endpoint','request','response','header','parameter','query','string','integer','boolean','object','array','token','api_key','model','stream','temperature','max_tokens','max_token','role','content','user','assistant','system','function','tools','messages','chat','completion','GPT-4o','GPT-5','gpt-4','gpt-5','claude-3','claude-4','gemini-2','gemini-3','openai','pip','install','import','client','chunk','print','response.','choices','delta','content','True','await','const','new','async'];

// ── Before GT loads: ensure cookie matches saved language ──
(function(){
  var saved = localStorage.getItem('gt_lang');
  if (!saved || saved === 'en') { 
    if (saved === 'en') { localStorage.removeItem('gt_lang'); }
    return; 
  }
  // Set the cookie with 1-year expiry BEFORE GT initializes
  // Overwrite directly — clearing before setting creates a race window
  var expiry = new Date(Date.now() + 365*24*60*60*1000).toUTCString();
  document.cookie = 'googtrans=/en/' + saved + '; path=/; expires=' + expiry;
  // Reload ONCE per session to force GT to read the fresh cookie
  if (!sessionStorage.getItem('gt_lang_ready')) {
    sessionStorage.setItem('gt_lang_ready', '1');
    location.reload();
  }
})();

function googleTranslateElementInit() {
  if (sessionStorage.getItem('gt_disable')) return;
  new google.translate.TranslateElement({
    pageLanguage: 'en',
    autoDisplay: false,
    includedLanguages: 'en,zh-CN,ru,ja,de'
  }, 'google_translate_element');
  // After GT loads, just protect brand names and update UI
  restoreAfterGTLoad();
}

// ── Load Google Translate JS on every page (unless disabled for EN) ──
(function(){
  if (sessionStorage.getItem('gt_disable')) return;
  var s = document.createElement('script');
  s.src = 'https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit';
  document.head.appendChild(s);
})();

function toggleLangMenu() {
  var m = document.getElementById('langMenu');
  if (m) m.classList.toggle('open');
}

// ── Bfcache: force reload on back/forward when non-EN ──
(function(){
  var saved = localStorage.getItem('gt_lang');
  if (saved && saved !== 'en') {
    window.addEventListener('pageshow', function(e) {
      if (e.persisted) location.reload();
    });
  }
})();

function switchLanguage(lang) {
  GT_LANG = lang;
  updateLangUI(lang);
  
  if (lang === 'en') {
    clearGoogTransCookie();
    localStorage.removeItem('gt_lang');
    sessionStorage.setItem('gt_disable', '1');
    sessionStorage.removeItem('gt_lang_ready');
  } else {
    var expiry = new Date(Date.now() + 365*24*60*60*1000).toUTCString();
    document.cookie = 'googtrans=/en/' + lang + '; path=/; expires=' + expiry;
    localStorage.setItem('gt_lang', lang);
    sessionStorage.removeItem('gt_disable');
    sessionStorage.removeItem('gt_lang_ready');
  }
  location.href = location.pathname + '?_=' + Date.now();
}

function updateLangUI(lang) {
  document.querySelectorAll('.lang-option').forEach(function(el) {
    el.classList.toggle('active', el.getAttribute('data-lang') === lang);
  });
  var lbl = document.getElementById('currentLangLabel');
  if (lbl) lbl.textContent = lang === 'zh-CN' ? '中文' : lang === 'en' ? 'EN' : lang === 'ru' ? 'RU' : lang === 'ja' ? '日' : 'DE';
  var lm = document.getElementById('langMenu');
  if (lm) lm.classList.remove('open');
}

document.addEventListener('click', function(e) {
  if (!e.target.closest('.lang-selector') && !e.target.closest('.lang-menu') && !e.target.closest('.lang-btn-mobile')) {
    var m = document.getElementById('langMenu');
    if (m) m.classList.remove('open');
  }
});

function restoreAfterGTLoad() {
  var saved = localStorage.getItem('gt_lang');
  if (!saved || saved === 'en') return;
  GT_LANG = saved;
  updateLangUI(saved);
  // Protect brand names from being translated
  setTimeout(protectTerms, 1000);
  setTimeout(protectTerms, 2500);
  setTimeout(protectTerms, 4000);
}

function clearGoogTransCookie(){
  var expiry = 'expires=Thu, 01 Jan 1970 00:00:00 UTC';
  document.cookie = 'googtrans=; path=/; ' + expiry;
  document.cookie = 'googtrans=; path=/; domain=.glbtoken.com; ' + expiry;
  document.cookie = 'googtrans=; path=/; domain=glbtoken.com; ' + expiry;
}

// ── Protect terms from translation ──
function protectTerms() {
  var body = document.body;
  if (!body || GT_LANG === 'en') return;
  var walker = document.createTreeWalker(body, 4, null, false);
  var nodes = [];
  while (walker.nextNode()) { nodes.push(walker.currentNode); }
  for (var i = 0; i < nodes.length; i++) {
    var n = nodes[i];
    if (!n.parentNode || n.parentNode.closest('.notranslate,[translate="no"],script,style,svg,code,pre,option')) continue;
    var orig = n.textContent;
    var lower = orig.toLowerCase();
    for (var w = 0; w < PROTECTED_WORDS.length; w++) {
      var word = PROTECTED_WORDS[w];
      var idx = lower.indexOf(word.toLowerCase());
      if (idx !== -1) {
        var before = orig.substring(0, idx);
        var after = orig.substring(idx + word.length);
        var actual = orig.substring(idx, idx + word.length);
        if (actual !== word) {
          n.textContent = before + word + after;
        }
      }
    }
  }
}

// ── Ongoing term protection (every 5s) ──
var termTimer = setInterval(protectTerms, 5000);

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

