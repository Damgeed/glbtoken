
    const API_URL = (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
      ? 'http://localhost:8000' : 'https://glbtoken-backend.up.railway.app';
    let token = localStorage.getItem('gt_token') || '';
    let userData = JSON.parse(localStorage.getItem('gt_user') || '{}');
    let keys = JSON.parse(localStorage.getItem('gt_keys') || '[]');
    let newapiToken = localStorage.getItem('gt_newapi_token') || '';
    let newapiEndpoint = localStorage.getItem('gt_newapi_endpoint') || '';
    let demoMode = false;

    // ── Theme ──
    (function(){try{
      const t=localStorage.getItem('gt_theme')||'dark';
      document.documentElement.className=t;
      document.getElementById('themeBtn').textContent=t==='dark'?'🌙':'☀️';
    }catch(e){}})();

    function toggleTheme(){
      const h=document.documentElement;
      const isDark=h.className==='dark';
      h.className=isDark?'light':'dark';
      localStorage.setItem('gt_theme',h.className);
      document.getElementById('themeBtn').textContent=h.className==='dark'?'🌙':'☀️';
      // Mobile theme toggle now uses the navbar button — no overlay sync needed
    }

    // ── API Helper (with demo fallback) ──
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
        demoMode = false;
        return await resp.json();
      } catch(e) {
        if (e.message.includes('Failed to fetch') || e.message.includes('NetworkError') || e.message.includes('load')) {
          demoMode = true;
          return handleDemoAPI(method, path, body);
        }
        throw e;
      }
    }
    
    function handleDemoAPI(method, path, body){
      // Demo/localStorage fallback for when backend is offline
      const demoData = JSON.parse(localStorage.getItem('gt_demo') || '{"users":[],"txs":[]}');
      
      if (path === '/api/auth/register') {
        const existing = demoData.users.find(u => u.email === body.email);
        if (existing) throw new Error('Email already registered');
        const user = {id: demoData.users.length+1, name: body.name, email: body.email, country: body.country||'', token_balance: 25000, total_spent: 25, email_verified: false};
        demoData.users.push(user);
        userData = user; token = 'demo_token_'+user.id;
        localStorage.setItem('gt_demo', JSON.stringify(demoData));
        localStorage.setItem('gt_token', token);
        localStorage.setItem('gt_user', JSON.stringify(user));
        return {user, token};
      }
      if (path === '/api/auth/login') {
        const user = demoData.users.find(u => u.email === body.email);
        if (!user) throw new Error('Invalid credentials');
        userData = user; token = 'demo_token_'+user.id;
        localStorage.setItem('gt_token', token);
        localStorage.setItem('gt_user', JSON.stringify(user));
        return {user, token};
      }
      if (path === '/api/auth/me') {
        return userData;
      }
      if (path === '/api/dashboard') {
        return {
          token_balance: userData.token_balance||25000,
          total_spent: userData.total_spent||25,
          models_used: 12, api_keys_active: keys.length||2,
          days_active: 14,
          usage_by_model: [{model:'GPT-4o',tokens:4200},{model:'Claude 3.5',tokens:2500},{model:'DeepSeek V3',tokens:1200},{model:'Llama 3.1',tokens:800}],
          recent_activity: [
            {type:'deposit',payment_method:'Stripe',tokens:22000,created_at:new Date(Date.now()-7200000).toISOString()},
            {type:'consumption',model:'GPT-4o',tokens:-320,created_at:new Date(Date.now()-14400000).toISOString()},
            {type:'consumption',model:'Claude 3.5',tokens:-185,created_at:new Date(Date.now()-21600000).toISOString()},
            {type:'deposit',payment_method:'Paystack',tokens:5000,created_at:new Date(Date.now()-86400000).toISOString()},
          ]
        };
      }
      if (path === '/api/keys' && method === 'GET') {
        return keys.length ? keys : [
          {id:1,name:'Production API',key_prefix:'gtk_a1b2c3',permissions:'read_write',is_active:true,request_count:2340,last_used:new Date(Date.now()-7200000).toISOString(),created_at:new Date(Date.now()-172800000).toISOString()},
          {id:2,name:'Dev Testing',key_prefix:'gtk_d4e5f6',permissions:'read_only',is_active:true,request_count:890,last_used:new Date(Date.now()-86400000).toISOString(),created_at:new Date(Date.now()-259200000).toISOString()}
        ];
      }
      if (path === '/api/keys' && method === 'POST') {
        const key = {id:keys.length+3,name:body.name,key:'gtk_'+Math.random().toString(36).substring(2,18)+Math.random().toString(36).substring(2,18),key_prefix:'gtk_'+Math.random().toString(36).substring(2,10),permissions:body.permissions||'read_write',is_active:true,request_count:0,created_at:new Date().toISOString()};
        keys.push(key); localStorage.setItem('gt_keys', JSON.stringify(keys));
        return key;
      }
      if (path.match(/\/api\/keys\/\d+/) && method === 'DELETE') {
        const id = parseInt(path.split('/').pop());
        keys = keys.filter(k=>k.id!==id); localStorage.setItem('gt_keys', JSON.stringify(keys));
        return {status:'deleted'};
      }
      if (path.match(/\/api\/keys\/\d+/) && method === 'PUT') {
        const id = parseInt(path.split('/').pop());
        const k = keys.find(k=>k.id===id); if(k&&body.is_active!==undefined) k.is_active=body.is_active;
        localStorage.setItem('gt_keys', JSON.stringify(keys));
        return {status:'updated'};
      }
      if (path === '/api/topup') {
        userData.token_balance = (userData.token_balance||0) + Math.floor(body.amount*1000);
        userData.total_spent = (userData.total_spent||0) + body.amount;
        localStorage.setItem('gt_user', JSON.stringify(userData));
        return {status:'success',tokens_added:Math.floor(body.amount*1000),new_balance:userData.token_balance};
      }
      if (path === '/api/transactions') {
        return {total:4,items:[
          {type:'deposit',amount:20,payment_method:'Stripe',tokens:22000,status:'completed',created_at:new Date(Date.now()-7200000).toISOString()},
          {type:'consumption',model_used:'GPT-4o',tokens:-320,status:'completed',created_at:new Date(Date.now()-14400000).toISOString()},
          {type:'deposit',amount:5,payment_method:'Paystack',tokens:5000,status:'completed',created_at:new Date(Date.now()-86400000).toISOString()},
          {type:'deposit',amount:100,payment_method:'Crypto',tokens:120000,status:'completed',created_at:new Date(Date.now()-1209600000).toISOString()}
        ]};
      }
      if (path === '/api/models') return DEMO_MODELS;
      if (path === '/api/models/providers') return getDemoProviders();
      throw new Error('Demo mode: backend not connected');
    }
    
    const DEMO_MODELS = [
      {model_id:'openai/gpt-5.5-pro',name:'GPT-5.5 Pro',provider:'OpenAI',context_length:1050000,prompt_price:0.00003,completion_price:0.00012,category:'Flagship',version:'5.5',description:'Latest flagship model from OpenAI'},
      {model_id:'openai/gpt-4o',name:'GPT-4o',provider:'OpenAI',context_length:128000,prompt_price:0.0000025,completion_price:0.00001,category:'Vision',version:'4o',description:'Multimodal vision model'},
      {model_id:'openai/gpt-4o-mini',name:'GPT-4o Mini',provider:'OpenAI',context_length:128000,prompt_price:0.00000015,completion_price:0.0000006,category:'Small',version:'4o-mini',description:'Lightweight efficient model'},
      {model_id:'openai/o3',name:'o3',provider:'OpenAI',context_length:200000,prompt_price:0.00001,completion_price:0.00004,category:'Reasoning',version:'o3',description:'Advanced reasoning model'},
      {model_id:'anthropic/claude-sonnet-5',name:'Claude Sonnet 5',provider:'Anthropic',context_length:1000000,prompt_price:0.000002,completion_price:0.000008,category:'Flagship',version:'5',description:'Anthropic flagship model'},
      {model_id:'anthropic/claude-3.5-sonnet',name:'Claude 3.5 Sonnet',provider:'Anthropic',context_length:200000,prompt_price:0.000003,completion_price:0.000015,category:'Vision',version:'3.5',description:'Balanced performance model'},
      {model_id:'anthropic/claude-3-haiku',name:'Claude 3 Haiku',provider:'Anthropic',context_length:200000,prompt_price:0.00000025,completion_price:0.00000125,category:'Small',version:'3',description:'Fast efficient model'},
      {model_id:'google/gemini-3.5-flash',name:'Gemini 3.5 Flash',provider:'Google',context_length:1048576,prompt_price:0.0000015,completion_price:0.000006,category:'Flash',version:'3.5',description:'Fast flash model from Google'},
      {model_id:'google/gemini-3.1-flash',name:'Gemini 3.1 Flash',provider:'Google',context_length:1048576,prompt_price:0.00000025,completion_price:0.000001,category:'Flash',version:'3.1',description:'Budget flash model'},
      {model_id:'google/gemini-3-pro',name:'Gemini 3 Pro',provider:'Google',context_length:65536,prompt_price:0.000002,completion_price:0.000008,category:'Flagship',version:'3',description:'Premium Google model'},
      {model_id:'meta-llama/llama-4-maverick',name:'Llama 4 Maverick',provider:'Meta Llama',context_length:1048576,prompt_price:0.00000015,completion_price:0.0000006,category:'Flagship',version:'4',description:'Meta largest open model'},
      {model_id:'meta-llama/llama-4-scout',name:'Llama 4 Scout',provider:'Meta Llama',context_length:10000000,prompt_price:0.0000001,completion_price:0.0000004,category:'Small',version:'4',description:'Long context efficient model'},
      {model_id:'meta-llama/llama-3.3-70b',name:'Llama 3.3 70B',provider:'Meta Llama',context_length:131072,prompt_price:0.0000001,completion_price:0.0000004,category:'Large',version:'3.3',description:'Reliable large model'},
      {model_id:'deepseek/deepseek-v4-pro',name:'DeepSeek V4 Pro',provider:'DeepSeek',context_length:1048576,prompt_price:0.000000435,completion_price:0.00000174,category:'Flagship',version:'V4',description:'Best price-performance model'},
      {model_id:'deepseek/deepseek-v4-flash',name:'DeepSeek V4 Flash',provider:'DeepSeek',context_length:1048576,prompt_price:0.000000089,completion_price:0.000000356,category:'Flash',version:'V4',description:'Ultra-fast budget model'},
      {model_id:'deepseek/deepseek-v3.2',name:'DeepSeek V3.2',provider:'DeepSeek',context_length:131072,prompt_price:0.0000002288,completion_price:0.000000915,category:'Flagship',version:'V3.2',description:'Proven reliable model'},
      {model_id:'deepseek/deepseek-r1',name:'DeepSeek R1',provider:'DeepSeek',context_length:131072,prompt_price:0.00000055,completion_price:0.0000022,category:'Reasoning',version:'R1',description:'Advanced reasoning model'},
      {model_id:'mistralai/mistral-large-2',name:'Mistral Large 2',provider:'Mistral',context_length:131072,prompt_price:0.000002,completion_price:0.000006,category:'Flagship',version:'2',description:'Flagship Mistral model'},
      {model_id:'mistralai/mistral-small-2603',name:'Mistral Small',provider:'Mistral',context_length:262144,prompt_price:0.00000015,completion_price:0.0000006,category:'Small',version:'2603',description:'Efficient small model'},
      {model_id:'qwen/qwen3.7-plus',name:'Qwen 3.7 Plus',provider:'Qwen',context_length:1000000,prompt_price:0.00000032,completion_price:0.00000128,category:'Flagship',version:'3.7',description:'Top Qwen model'},
      {model_id:'qwen/qwen3.7-max',name:'Qwen 3.7 Max',provider:'Qwen',context_length:1000000,prompt_price:0.00000125,completion_price:0.000005,category:'Flagship',version:'3.7',description:'Maximum power Qwen'},
      {model_id:'qwen/qwen-2.5-72b',name:'Qwen 2.5 72B',provider:'Qwen',context_length:131072,prompt_price:0.00000035,completion_price:0.0000014,category:'Large',version:'2.5',description:'Reliable large model'},
      {model_id:'cohere/command-a',name:'Command A',provider:'Cohere',context_length:256000,prompt_price:0.0000025,completion_price:0.00001,category:'Flagship',version:'A',description:'Enterprise model'},
      {model_id:'perplexity/sonar-pro',name:'Sonar Pro',provider:'Perplexity',context_length:200000,prompt_price:0.000003,completion_price:0.000015,category:'Search',version:'Pro',description:'Search-optimized model'},
      {model_id:'x-ai/grok-4.20',name:'Grok 4.20',provider:'X AI',context_length:2000000,prompt_price:0.00000125,completion_price:0.000005,category:'Flagship',version:'4.20',description:'xAI flagship model'},
      {model_id:'amazon/nova-pro-v1',name:'Nova Pro',provider:'Amazon',context_length:300000,prompt_price:0.0000008,completion_price:0.0000032,category:'Flagship',version:'Pro',description:'Amazon flagship'},
      {model_id:'nvidia/nemotron-3-ultra',name:'Nemotron 3 Ultra',provider:'Nvidia',context_length:1000000,prompt_price:0.0000005,completion_price:0.000002,category:'Flagship',version:'3',description:'Nvidia flagship'},
      {model_id:'nousresearch/hermes-4-70b',name:'Hermes 4 70B',provider:'NousResearch',context_length:131072,prompt_price:0.00000013,completion_price:0.00000052,category:'Large',version:'4',description:'Open-source model'},
      {model_id:'microsoft/phi-4',name:'Phi-4',provider:'Microsoft',context_length:16384,prompt_price:0.00000007,completion_price:0.00000028,category:'Small',version:'4',description:'Tiny efficient model'},
    ];
    function getDemoProviders(){
      const counts = {}; DEMO_MODELS.forEach(m => { counts[m.provider] = (counts[m.provider]||0)+1; });
      return Object.entries(counts).map(([name,count]) => ({name,count,min_price:0.0000001,max_price:0.00005}));
    }

    // ── Page Routing ──
    function showPage(page){
      // Auth-based redirects for multi-page setup
      if (token && (page === 'login' || page === 'register')) { window.location='dashboard.html'; return; }
      if (!token && (page === 'dashboard' || page === 'history' || page === 'apikeys' || page === 'topup')) { window.location='register.html'; return; }
      if (page === 'home') { window.location='/'; return; }
      const pageMap = {pricing:'pricing.html',how:'how.html',models:'models.html',apikeys:'apikeys.html',dashboard:'dashboard.html',history:'history.html',topup:'topup.html',faq:'faq.html',about:'about.html',blog:'blog.html',terms:'terms.html',privacy:'privacy.html',refund:'refund.html',login:'login.html',register:'register.html'};
      if (pageMap[page]) { window.location=pageMap[page]; }
    }

    // ── Auth ──
    async function registerUser(){
      const name=document.getElementById('regName').value;
      const email=document.getElementById('regEmail').value;
      const pass=document.getElementById('regPassword').value;
      const confirm=document.getElementById('regConfirm').value;
      const country='';
      if(!name||!email||!pass){showToast('Fill all fields','error');return}
      if(pass!==confirm){showToast('Passwords dont match','error');return}
      try{
        const data=await api('POST','/api/auth/register',{name,email,password:pass,country});
        token=data.token;userData=data.user;
        localStorage.setItem('gt_token',token);localStorage.setItem('gt_user',JSON.stringify(userData));
        // Store New API token if returned
        if(data.newapi_token){
          newapiToken=data.newapi_token;
          newapiEndpoint=data.newapi_endpoint||'';
          localStorage.setItem('gt_newapi_token',newapiToken);
          localStorage.setItem('gt_newapi_endpoint',newapiEndpoint);
        }
        applyAuth();showToast('Account created! Welcome.','success');showPage('dashboard');
      }catch(e){showToast(e.message,'error')}
    }
    async function loginUser(){
      const email=document.getElementById('loginEmail').value;
      const pass=document.getElementById('loginPassword').value;
      if(!email||!pass){showToast('Enter email and password','error');return}
      try{
        const data=await api('POST','/api/auth/login',{email,password:pass});
        token=data.token;userData=data.user;
        localStorage.setItem('gt_token',token);localStorage.setItem('gt_user',JSON.stringify(userData));
        applyAuth();showToast('Welcome back!','success');showPage('dashboard');
      }catch(e){showToast(e.message,'error')}
    }
    function showOAuthModal(provider, isRegister){
      const overlay=document.createElement('div');
      overlay.className='modal-overlay';
      overlay.innerHTML='<div class="modal-box" style="text-align:center;padding:2.5rem">'+
        '<button class="modal-close" onclick="this.closest(\'.modal-overlay\').remove()">✕</button>'+
        '<div style="font-size:3rem;margin-bottom:1rem">'+(provider==='google'?'🔵':provider==='github'?'🐙':provider==='microsoft'?'🟦':'🍎')+'</div>'+
        '<h3 style="font-size:1.25rem;font-weight:700;margin-bottom:0.5rem">'+
          (isRegister?'Create Account with ':'Sign in with ')+
          provider.charAt(0).toUpperCase()+provider.slice(1)+
        '</h3>'+
        '<p style="color:var(--text-secondary);font-size:0.9rem;margin-bottom:1.5rem">'+
          'OAuth '+provider+' integration coming soon.<br>For now, use the demo mode below.'+
        '</p>'+
        '<button class="btn-primary" style="width:100%;margin-bottom:0.75rem" onclick="this.closest(\'.modal-overlay\').remove();'+(isRegister?'oauthRegisterFallback':'oauthLoginFallback')+'(\''+provider+'\')">'+
          'Continue with Demo →'+
        '</button>'+
        '<button class="btn-secondary" style="width:100%" onclick="this.closest(\'.modal-overlay\').remove()">Cancel</button>'+
      '</div>';
      document.body.appendChild(overlay);
      overlay.classList.add('open');
    }
    async function oauthLoginFallback(provider){
      try{
        const data=await api('POST','/api/auth/register',{name:provider==='google'?'Google User':provider==='github'?'GitHub User':provider==='microsoft'?'Microsoft User':'Apple User',email:provider+'_user@glbtoken.com',password:'oauth_demo_123',country:''});
        token=data.token;userData=data.user;
        localStorage.setItem('gt_token',token);localStorage.setItem('gt_user',JSON.stringify(userData));
        applyAuth();showToast('Signed in with '+provider,'success');window.location.href='dashboard.html';
      }catch(e){showToast(e.message,'error')}
    }
    async function oauthRegisterFallback(provider){
      try{
        const data=await api('POST','/api/auth/register',{name:provider==='google'?'Google User':'GitHub User',email:provider+'_user@glbtoken.com',password:'oauth_demo_123',country:''});
        token=data.token;userData=data.user;
        localStorage.setItem('gt_token',token);localStorage.setItem('gt_user',JSON.stringify(userData));
        applyAuth();showToast('Account created with '+provider,'success');window.location.href='dashboard.html';
      }catch(e){showToast(e.message,'error')}
    }
    function oauthLogin(provider){showOAuthModal(provider,false)}
    function oauthRegister(provider){showOAuthModal(provider,true)}
    function logoutUser(){
      token='';userData={};
      localStorage.removeItem('gt_token');localStorage.removeItem('gt_user');
      applyAuth();showToast('Signed out','info');showPage('home');
    }
    async function refreshMe(){
      if(!token)return;
      try{const d=await api('GET','/api/auth/me');userData=d;localStorage.setItem('gt_user',JSON.stringify(d));applyAuth()}catch(e){}
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
      if(loggedIn&&userData.name){
        document.getElementById('dashUserName').textContent=userData.name||'User';
        const initial=(userData.name||'U')[0].toUpperCase();
        // Update avatar initial without breaking dropdown structure
        const av=document.querySelector('.nav-avatar');
        const textNode = document.createTextNode(initial);
        const dropdown = av.querySelector('.dropdown');
        av.textContent = '';
        av.appendChild(textNode);
        if (dropdown) av.appendChild(dropdown);
        document.getElementById('ddAvatar').textContent=initial;document.getElementById('dropName').textContent=userData.name||'User';
        document.getElementById('dropEmail').textContent=userData.email||'';
        // Mobile sync
        document.getElementById('mAvatar').textContent=initial;
        document.getElementById('mName').textContent=userData.name||'User';
        document.getElementById('mEmail').textContent=userData.email||'';
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
    // ── Init auth ──
    if(token){refreshMe();applyAuth()}
    // ── Initial route from hash ──
    (function(){
      // Multi-page mode - active page is determined by the current file
      const pageId = location.pathname.split('/').pop().replace('.html','') || 'home';
      if (pageId === 'index' || pageId === '') window.location = '/';
      // Apply auth state on every page
      if(token){refreshMe();applyAuth()}
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
            <div class="key-name">${key.name}</div>
            <div class="key-val">${key.key_prefix}••••••••</div>
            <div class="meta">${key.permissions} · ${key.request_count} requests · ${key.is_active?'<span class="badge active">Active</span>':'<span class="badge inactive">Inactive</span>'}</div>
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
        body.innerHTML=d.items.map(t=>`<tr><td>${t.created_at?new Date(t.created_at).toLocaleDateString():''}</td><td>${t.type}</td><td>${t.model_used||t.payment_method||'-'}</td><td class="amount ${t.type==='deposit'?'gold':'red'}">${t.type==='deposit'?'+':''}${t.tokens||0}</td><td><span style="color:var(--success)">${t.status}</span></td></tr>`).join('');
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
        // Re-trigger translation for dynamically added content
        var savedLang = localStorage.getItem('gt_lang');
        if(savedLang && savedLang !== 'en'){
          setTimeout(function(){
            var sel = document.querySelector('.goog-te-combo');
            if(sel && sel.value !== savedLang){
              sel.value = savedLang;
              sel.dispatchEvent(new Event('change', {bubbles: true}));
            }
          }, 500);
        }
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
              <span title="Input price">⬇️ \\$${priceIn}/1K</span>
              <span title="Output price">⬆️ \\$${priceOut}/1K</span>
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
              <span title="Input price">⬇️ \\$${priceIn}/1K</span>
              <span title="Output price">⬆️ \\$${priceOut}/1K</span>
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
            <div class="key-name">${key.name}</div>
            <div class="key-val">${key.key_prefix}••••••••</div>
            <div class="meta">${key.permissions} · ${key.request_count} requests · ${key.last_used?'Last used '+new Date(key.last_used).toLocaleDateString():'Never used'} · ${key.is_active?'<span class="badge active">Active</span>':'<span class="badge inactive">Inactive</span>'}</div>
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
    const AI_RESPONSES = {
      'gpt4o-mini': ['Great question! GPT-4o Mini is our lightweight flagship — fast, capable, and cost-effective for everyday tasks.', 'I can help you write code, analyze data, draft emails, explain concepts, and more. What would you like to work on?', 'Here\'s a quick tip: GPT-4o Mini excels at tasks like summarization, code generation, and creative writing while being extremely efficient.'],
      'claude-haiku': ['Claude 3 Haiku is Anthropic\'s fastest model. Perfect for quick analysis, structured outputs, and tasks that need careful reasoning.', 'I take a thoughtful approach to your questions. Let me think this through carefully.', 'Claude Haiku is great for parsing documents, answering questions with citations, and following complex instructions.'],
'gemini-flash': ['Gemini Flash by Google is designed for speed and efficiency. It handles multimodal tasks and long context windows with ease.', 'Google\'s latest flash model here! I can process up to 1M tokens of context — that\'s like reading entire books at once.', 'With Gemini Flash, you get Google\'s search-grounded knowledge and fast response times.'],
      'llama-scout': ['Llama 4 Scout from Meta has a 10M token context window — the largest of any open model. Great for analyzing huge documents.', 'Meta\'s Llama 4 here! I\'m open-source and designed for long-context tasks. Ask me to analyze large codebases or documents.', 'Llama Scout excels at processing enormous amounts of text. It\'s the go-to for document-heavy workflows.'],
      'deepseek-flash': ['DeepSeek Flash is engineered for blazing-fast inference with top-tier performance. Best price-performance ratio in the market.', 'I\'m DeepSeek\'s fastest model. Check my math, reason through problems, or get quick code solutions. I\'m optimized for speed.', 'DeepSeek Flash delivers GPT-4 class performance at a fraction of the cost. Perfect for production workloads.'],
      'mistral-small': ['Mistral Small is our efficient model for everyday AI tasks. Fast, reliable, and open-source.', 'Bonjour! Mistral Small is perfect for classification, summarization, and lightweight chat applications.', 'Mistral models are known for their efficiency and strong performance on benchmarks. Small doesn\'t mean weak!'],
      'gpt4o': ['GPT-4o is OpenAI flagship multimodal model. It can analyze images, reason about code, and handle complex tasks with ease.', 'I am GPT-4o — OpenAI most capable model. I can see, read, and reason across text and images seamlessly.', 'GPT-4o delivers top-tier performance across coding, creative writing, and reasoning tasks.'],
      'gpt4': ['GPT-4 Turbo is OpenAI earlier flagship, still one of the most capable models for complex reasoning tasks.', 'I am GPT-4 Turbo — proven, reliable, and excellent at following complex instructions with precision.'],
      'claude-sonnet': ['Claude 3.5 Sonnet strikes the perfect balance between intelligence and speed. Anthropic most popular model.', 'Hello! Claude Sonnet here. I excel at nuanced analysis, thoughtful writing, and careful reasoning.'],
      'claude-opus': ['Claude 3 Opus is Anthropic most powerful model. Top of the leaderboards for reasoning, coding, and analysis.', 'I am Claude Opus — Anthropic frontier model. I handle the hardest problems with depth and precision.'],
      'gemini-pro': ['Gemini 2.0 Pro by Google excels at complex reasoning, coding, and multimodal understanding with a massive context window.', 'Google Gemini Pro here! I can handle multi-turn conversations, code generation, and long-context analysis up to 2M tokens.'],
      'llama-maverick': ['Llama 4 Maverick is Meta flagship open model. Combines massive context with strong reasoning capabilities.', 'Meta Llama 4 Maverick reporting! I am open-source, powerful, and designed for complex reasoning tasks.'],
      'deepseek-v4': ['DeepSeek V4 Pro is DeepSeek best model. Exceptional reasoning, math, and coding performance at competitive pricing.', 'DeepSeek V4 Pro here! I excel at technical tasks, mathematical reasoning, and complex problem-solving.'],
      'deepseek-r1': ['DeepSeek R1 is specialized for deep reasoning. Perfect for complex logic, math, and multi-step problem solving.', 'I am DeepSeek R1 — designed to reason step by step through complex problems. Chain-of-thought is my specialty.'],
      'mistral-large': ['Mistral Large 2 is our flagship model for enterprise-grade tasks. Strong reasoning, multilingual, and highly capable.', 'Mistral Large 2 at your service! I handle complex analysis, multilingual tasks, and enterprise workloads with ease.'],
      'qwen-plus': ['Qwen 3.7 Plus from Alibaba Cloud is a top-tier model with strong reasoning and a massive 1M context window.', 'Qwen 3.7 Plus here! I excel at long-context understanding, code generation, and multilingual tasks.'],
      'grok-4': ['Grok 4.20 from xAI brings real-time knowledge and a distinctive, direct communication style. Witty and sharp.', 'Grok here! Let me tackle your question with real-time knowledge and a bit of personality. Straight to the point.'],
      'command-a': ['Command A from Cohere is built for enterprise RAG and tool-use. Excellent at following instructions and structured outputs.', 'Cohere Command A here! I specialize in retrieval-augmented generation, tool calling, and enterprise workflows.'],
      'phi-4': ['Phi-4 by Microsoft punches way above its weight. Tiny, efficient, and surprisingly powerful for its size.', 'Phi-4 here! I may be small but I pack a punch — efficient, fast, and great for lightweight AI tasks.']
    };
    const AI_GENERIC = [
      'That\'s an interesting question! Here\'s what I think: The key is to break complex problems into smaller steps and tackle them one at a time.',
      'Great point! In the AI landscape, we\'re seeing rapid advances in reasoning capabilities, multimodal understanding, and context length. Models are getting smarter every quarter.',
      'I\'d recommend exploring this further by creating a GlbTOKEN account — you\'ll get access to 100+ models with a single API key and one token balance.',
      'That depends on your use case. For speed, try DeepSeek Flash or Gemini Flash. For deep reasoning, Claude Haiku or GPT-4o Mini. For long documents, Llama 4 Scout is unbeatable.',
      'Here\'s a practical perspective: start with the free tier, experiment with different models, and find what works best for your specific workflow. Each model has unique strengths.'
    ];
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
      // Don't reset height style — causes DOM reflow that closes keyboard on mobile
      // Keyboard refocus is handled by onmousedown on the send button
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
      // Simulate response
      setTimeout(() => {
        const typing = document.getElementById('aiTyping');
        if(typing) typing.remove();
        const aiDiv = document.createElement('div');
        aiDiv.className = 'chat-msg ai';
        const modelResponses = AI_RESPONSES[aiModel] || AI_GENERIC;
        const allResponses = [...modelResponses, ...AI_GENERIC];
        const response = allResponses[Math.floor(Math.random() * allResponses.length)];
        aiDiv.innerHTML = '<div class="av">🤖</div><div class="bubble">'+escapeHtml(response)+'</div>';
        msgs.appendChild(aiDiv);
        msgs.scrollTop = msgs.scrollHeight;
        btn.disabled = false;
        btn.textContent = '➤';
      }, 800 + Math.random() * 1200);
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
    function sendChatMsg(){
      const input=document.getElementById('chatInput');
      const msg=input.value.trim();if(!msg)return;
      const msgs=document.getElementById('chatMsgs');
      msgs.innerHTML+='<div class="chat-msg user"><div class="av">U</div><div class="bubble">'+escapeHtml(msg)+'</div></div>';input.value='';
      setTimeout(()=>{const rs=["Great question! Here's how it works...","We support 100+ models from 56 providers!","You can pay with Stripe, Paystack, or crypto.","Tokens never expire. Use across any model.","Check your Dashboard for usage analytics."];msgs.innerHTML+='<div class="chat-msg ai"><div class="av">🤖</div><div class="bubble">'+rs[Math.floor(Math.random()*rs.length)]+'</div></div>';msgs.scrollTop=msgs.scrollHeight},600+Math.random()*800);
      msgs.scrollTop=msgs.scrollHeight;
      setTimeout(()=>input.focus(),50);
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
    let tmIndex=0,tmInterval,tmTotal=2,tmTouchStartX=0,tmTouchStartY=0;
    const tmTitles=['🔥 Top Models This Week','💻 API Quick Start'];
    function slideTopView(dir){
      tmIndex=(tmIndex+dir+tmTotal)%tmTotal;
      document.getElementById('tmTrack').style.transform='translateX(-'+(tmIndex*100)+'%)';
      const title=document.getElementById('tmTitle');
      if(title)title.textContent=tmTitles[tmIndex];
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
      if(track){
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
      }
      tmInterval=setInterval(()=>slideTopView(1),5000);
      // Delegate clicks on key action buttons (avoid inline onclick XSS)
      document.addEventListener('click',function(e){
        const btn=e.target.closest('[data-key-id]');
        if(!btn)return;
        const id=Number(btn.dataset.keyId);
        if(btn.dataset.action==='toggle')toggleKeyStatus(id);
        else if(btn.dataset.action==='delete')deleteKey(id);
      });
    });
// ── Translation ──
function toggleLangMenu() {
  var m = document.getElementById('langMenu');
  if (m) m.classList.toggle('open');
}
function switchLanguage(lang) {
  if(lang === 'en'){
    document.querySelectorAll('[data-gt-old]').forEach(function(el){
      el.textContent = el.getAttribute('data-gt-old');
      el.removeAttribute('data-gt-old');
    });
    document.querySelectorAll('[data-gt-old-href]').forEach(function(el){
      el.href = el.getAttribute('data-gt-old-href');
      el.removeAttribute('data-gt-old-href');
    });
    document.querySelectorAll('[data-gt-old-placeholder]').forEach(function(el){
      el.placeholder = el.getAttribute('data-gt-old-placeholder');
      el.removeAttribute('data-gt-old-placeholder');
    });
    localStorage.setItem('gt_lang', 'en');
    updateLangUI('en');
    return;
  }
  var texts = [];
  var els = [];
  var walker = document.createTreeWalker(document.body, 4, null, false);
  while(walker.nextNode()){
    var n = walker.currentNode;
    if(n.parentNode && n.parentNode.closest && n.parentNode.closest('.lang-selector,.lang-menu,.lang-btn-mobile,.chat-window,.stars-bg,.footer-bottom,script,style,svg,code,pre')) continue;
    var t = n.textContent.trim();
    if(!t || t.length <= 1 || /^[\d\s\W]+$/.test(t) || n.parentNode.closest('[data-gt-old]')) continue;
    texts.push(t);
    els.push(n);
  }
  if(!texts.length){ updateLangUI(lang); return; }
  function doTranslate(start){
    var batch = [], batchEls = [], batchSize = 40;
    for(var i = start; i < texts.length && batch.length < batchSize; i++){
      batch.push(texts[i]); batchEls.push(els[i]);
    }
    if(!batch.length){ updateLangUI(lang); return; }
    var q = batch.join('\n---GT---\n');
    var url = 'https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=' + lang + '&dt=t&q=' + encodeURIComponent(q);
    fetch(url).then(function(r){ return r.json(); }).then(function(d){
      if(d && d[0]){
        for(var i = 0; i < d[0].length && i < batchEls.length; i++){
          if(d[0][i] && d[0][i][0]){
            var orig = batchEls[i].textContent;
            if(!batchEls[i].parentNode.hasAttribute('data-gt-old')){
              batchEls[i].parentNode.setAttribute('data-gt-old', orig);
            }
            var translated = d[0][i][0];
            if(/GlbTOKEN/i.test(orig) || /Glb[^a-z]/i.test(orig) || /TOKEN[^a-z]/i.test(orig)){
              translated = orig;
            }
            batchEls[i].textContent = translated;
          }
        }
      }
      doTranslate(start + batchSize);
    }).catch(function(){ doTranslate(start + batchSize); });
  }
  doTranslate(0);
  localStorage.setItem('gt_lang', lang);
}
function updateLangUI(lang){
  document.querySelectorAll('.lang-option').forEach(function(el) {
    el.classList.toggle('active', el.getAttribute('data-lang') === lang);
  });
  var lbl = document.getElementById('currentLangLabel');
  if(lbl) lbl.textContent = lang === 'zh-CN' ? '中文' : lang === 'en' ? 'EN' : lang === 'ru' ? 'RU' : lang === 'ja' ? '日' : 'DE';
  var lm = document.getElementById('langMenu');
  if(lm) lm.classList.remove('open');
}

document.addEventListener('click', function(e) {
  if (!e.target.closest('.lang-selector') && !e.target.closest('.lang-menu') && !e.target.closest('.lang-btn-mobile')) {
    var m = document.getElementById('langMenu');
    if (m) m.classList.remove('open');
  }
});

function restoreSavedLanguage(){
  var saved = localStorage.getItem('gt_lang');
  if(!saved || saved === 'en') return;
  setTimeout(function(){ switchLanguage(saved); }, 500);
}
