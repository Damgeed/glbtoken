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
      window.__secure.setItem('gt_token', data.token);
      if(data.refresh_token) (window.__secure||{setItem:function(k,v){localStorage.setItem(k,v)}}).setItem('gt_refresh_token', data.refresh_token);
      window.__secure.setItem('gt_user', JSON.stringify(data.user));
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
      if(pageId==='apikeys'&&token){if(typeof loadKeys==='function')loadKeys();}
      if(pageId==='history'&&token)loadTx();
      if(pageId==='models'){if(typeof loadModels==='function')loadModels();}
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
            <button class="sort-btn" data-key-id="${escapeHtml(String(key.id))}" data-action="toggle">${key.is_active?'Pause':'Activate'}</button>
            <button class="sort-btn" style="color:var(--destructive)" data-key-id="${escapeHtml(String(key.id))}" data-action="delete">Delete</button>
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

    // ── Shared helpers ──
    // Page-specific init for usage/filters page
    document.addEventListener('DOMContentLoaded',function(){
      const pageId = location.pathname.split('/').pop().replace('.html','') || 'home';
      if(token){refreshMe();applyAuth()}
      if(pageId==='dashboard'&&token){loadDashboard();refreshMe()}
      if(pageId==='apikeys'&&token){if(typeof loadKeys==='function')loadKeys();}
      if(pageId==='history'&&token)loadTx();
      if(pageId==='models'){if(typeof loadModels==='function')loadModels();}
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

