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
      var container=document.getElementById('monthlySummary');
      if(!container)return;
      container.innerHTML='<p style="color:var(--text-muted);text-align:center;padding:1rem">Loading monthly comparison...</p>';
      var data=await safeApi('GET','/api/activity?months=2',null,null,true); if(!data){ container.innerHTML='<p style="color:var(--text-muted);text-align:center;padding:1rem">Failed to load monthly summary.</p>';return}
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

    }

    async function loadRecentActivity(){
      var container=document.getElementById('recentActivity');
      if(!container)return;
      container.innerHTML='<p style="color:var(--text-muted);text-align:center;padding:0.5rem;font-size:0.85rem">Loading...</p>';
      var act=await safeApi('GET','/api/activity',null,null,true); if(!act){ container.innerHTML='<p style="color:var(--text-muted);text-align:center;padding:0.5rem;font-size:0.85rem">Failed to load activity.</p>';return}
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
    }


    function startUsageTicker(){
      var tickerEl=document.getElementById('usageTicker');
      if(!tickerEl)return;
      if(window._tickerInterval)clearInterval(window._tickerInterval);
      async function updateTicker(){
        var data=await safeApi('GET','/api/dashboard',null,5000,true);
        if(!data)return;
        var todayCalls=data.today_requests||data.total_requests||0;
        var todayTokens=data.today_tokens||data.total_tokens_consumed||0;
        var balance=data.token_balance||0;
        tickerEl.innerHTML='<span class="ticker-item">📊 <strong>Today:</strong> '+todayCalls.toLocaleString()+' calls · '+todayTokens.toLocaleString()+' tokens</span><span class="ticker-item">💰 <strong>Balance:</strong> '+balance.toLocaleString()+' GT</span>';
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
      const data = await safeApi('POST','/api/auth/auth0/login', {token: idToken},null,true);
      if(!data) { window.location.href = '/login.html?error=' + encodeURIComponent('Auth login failed'); return; }
      localStorage.setItem('gt_token', data.token);
      localStorage.setItem('gt_user', JSON.stringify(data.user));
      // Don't call applyAuth() — callback page has no nav DOM elements
      // Don't call showToast() — callback page has no toast DOM elements
      window.location.href = '/dashboard.html';
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
      await safeApi('POST','/api/auth/forgot-password',{email:email});
      showToast('Reset link sent! Check your email.','success');
      setTimeout(function(){
        var m = document.querySelector('.modal-overlay');
        if(m)m.remove();
      },2000);
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
        const d=await safeApi('GET','/api/dashboard');
        if(!d) return;
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
      }catch(e){
        // Silently fail — safeApi already handles errors
      }
    }
    async function loadDashKeys(){
      if(!token)return;
      const k=await safeApi('GET','/api/keys',null,null,true); if(!k)return;
      renderDashKeys(k);
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
      const d=await safeApi('GET','/api/transactions?limit=5',null,null,true); if(!d)return;
      const body=document.getElementById('dashTxBody');
      if(!d.items||!d.items.length){
        body.innerHTML='<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:1.5rem;font-size:0.85rem">No transactions</td></tr>';
        return;
      }
      body.innerHTML=d.items.map(t=>'<tr><td>'+escapeHtml(t.created_at?new Date(t.created_at).toLocaleDateString():'')+'</td><td>'+escapeHtml(t.type)+'</td><td>'+escapeHtml(t.model_used||t.payment_method||'-')+'</td><td class="amount '+(t.type==='deposit'?'gold':'red')+'">'+(t.type==='deposit'?'+':'')+escapeHtml(String(t.tokens||0))+'</td><td><span style="color:var(--success)">'+escapeHtml(t.status)+'</span></td></tr>').join('');
    }
    async function loadActivity(){
      var container=document.getElementById('dashActivity');
      var countEl=document.getElementById('activityCount');
      if(!container)return;
      var act=await safeApi('GET','/api/activity',null,null,true); if(!act)return;
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
      var content=await safeApi('GET','/api/logs/content?log_id='+logId,null,null,true); if(!content){expand.innerHTML='<p style="color:var(--text-muted);text-align:center;padding:0.5rem">Failed to load log content.</p>';return}
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

    }
    async function loadUsageAnalytics(days,model,mode){
      var canvas=document.getElementById('dailyChart');
      if(!canvas)return;
      var summaryTotal=document.getElementById('usageTotalVal');
      var summaryCost=document.getElementById('usageCostVal');
      var summaryLabel=document.getElementById('usageTotalLabel');
      var params='?days='+(days||7);
        if(model)params+='&model='+encodeURIComponent(model);
        var data=await safeApi('GET','/api/usage-analytics'+params);
        if(!data) return;
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
        var result=await safeApi('GET','/api/available-models');
        if(!result) return;
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
      var result=await safeApi('GET','/api/available-models',null,null,true); if(!result){container.innerHTML='<p style="color:var(--text-muted);font-size:0.85rem;text-align:center;padding:0.75rem">Failed to load models.</p>';return}
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
      const d=await safeApi('POST','/api/topup',{amount:selectedAmount,currency:'USD',payment_method:selectedPayment});
      if(!d) return;
      userData.token_balance=d.new_balance;localStorage.setItem('gt_user',JSON.stringify(userData));updateBalance();
      document.getElementById('topupStep1').style.display='none';
      document.getElementById('topupSuccess').style.display='block';
      document.getElementById('topupSuccessMsg').textContent=d.tokens_added.toLocaleString()+' tokens added!';
      showToast('Payment successful!','success');
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
      const m=await safeApi('GET','/api/models',null,null,true); if(!m){grid.innerHTML='<p style="color:var(--text-muted);text-align:center;padding:2rem">Backend not connected. Start the API server.</p>';return}
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
      keys=await safeApi('GET','/api/keys');
      if(keys) renderKeys(keys);
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
        const d=await safeApi('POST','/api/keys',{name,permissions:perms});
        if(!d) return;
        document.getElementById('newKeyValue').textContent=d.key;
        document.getElementById('newKeyResult').style.display='block';
        loadKeys();
        loadDashKeys();
        showToast('Key created! Copy it now.','success');
      }catch(e){}
    }
    async function toggleKeyStatus(id){
      const key=keys.find(k=>k.id===id);if(!key)return;
      await safeApi('PUT',`/api/keys/${id}`,{is_active:!key.is_active});
      loadKeys();
    }
    async function deleteKey(id){
      showConfirm('Delete API Key?','This cannot be undone.',async function(){
        await safeApi('DELETE',`/api/keys/${id}`);
        loadKeys();
        showToast('Key deleted','info');
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
      const d=await safeApi('GET','/api/transactions?limit=50',null,null,true); if(!d)return;
        const dep=d.items.filter(t=>t.type==='deposit');
        const con=d.items.filter(t=>t.type==='consumption');
        document.getElementById('txDepositBody').innerHTML=dep.length?dep.map(t=>'<tr><td>'+escapeHtml(t.created_at?new Date(t.created_at).toLocaleDateString():'')+'</td><td>$'+escapeHtml(t.amount.toFixed(2))+'</td><td>'+escapeHtml(t.payment_method||'-')+'</td><td class="gold">+'+escapeHtml(String(t.tokens||0))+'</td><td><span style="color:var(--success)">'+escapeHtml(t.status)+'</span></td></tr>').join(''):'<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:1.5rem">No deposits</td></tr>';
        document.getElementById('txConsumptionBody').innerHTML=con.length?con.map(t=>'<tr><td>'+escapeHtml(t.created_at?new Date(t.created_at).toLocaleDateString():'')+'</td><td>'+escapeHtml(t.model_used||'-')+'</td><td class="red">-'+escapeHtml(String(t.tokens||0))+'</td><td>API</td></tr>').join(''):'<tr><td colspan="4" style="text-align:center;color:var(--text-muted);padding:1.5rem">No consumption</td></tr>';
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
      if(hide){
        var fab = document.querySelector('.chat-fab');
        if(fab) fab.style.display = 'none';
      } else {
        var fab = document.querySelector('.chat-fab');
        if(fab) fab.style.display = '';
      }
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

