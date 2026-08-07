/* ══════════════════════════════════════════
   FILTERS — Saved filters, spending alerts, heatmap
   ══════════════════════════════════════════ */
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

    // Live CSV export — fetches REAL data, never localStorage stubs.
    async function exportData(type){
      try{
        if(type==='billing'){
          var data=await safeApi('GET','/api/billing/invoices',null,null,true);
          var inv=(data&&data.invoices)||[];
          if(!inv.length){showToast('No invoices to export','info');return;}
          var csv='Date,Amount,Currency,Method,Tokens,Status\n';
          inv.forEach(function(t){
            var d=String(t.date||t.created_at||'').replace('T',' ').replace('Z','').substring(0,19);
            var amt=t.amount!=null?t.amount:'';
            var cur=t.currency||'USD';
            var method=t.payment_method||t.method||t.provider||'';
            var tokens=t.tokens||t.tokens_added||0;
            var status=(t.status||'completed');
            [d,amt,cur,method,tokens,status].forEach(function(v){
              v=String(v);
              if(v.indexOf(',')>=0||v.indexOf('"')>=0||v.indexOf('\n')>=0){v='"'+v.replace(/"/g,'""')+'"';}
              csv+=v+',';
            });
            csv=csv.slice(0,-1)+'\n';
          });
          triggerDownload(csv,'billing-export.csv');
          showToast('Billing exported','success');
          return;
        }
        if(type==='usage'){
          var d=await safeApi('GET','/api/usage-analytics?days=30',null,null,true);
          if(!d||!d.labels||!d.labels.length){showToast('No data to export','info');return;}
          var csv2='Date,Tokens,Cost\n';
          for(var i=0;i<d.labels.length;i++){
            csv2+=d.labels[i]+','+(d.tokens[i]||0)+','+((d.costs&&d.costs[i])||0)+'\n';
          }
          triggerDownload(csv2,'usage-export.csv');
          showToast('Usage exported','success');
          return;
        }
        showToast('Unknown export type','error');
      }catch(e){
        showToast('Failed to export data: '+(e.message||e),'error');
      }
    }



    // ── Auth0 Social Login Callback ──
    async function handleAuth0Callback(){
      // Called on /auth/callback page — no nav/toast DOM elements here
      const hash = window.location.hash.substring(1);
      if(!hash) return;
      const params = new URLSearchParams(hash);
      const idToken = params.get('id_token');
      if(!idToken) return;
      // Verify CSRF state token — fail CLOSED (missing state = mismatch)
      const returnedState = params.get('state');
      const storedState = sessionStorage.getItem('gt_oauth_state');
      sessionStorage.removeItem('gt_oauth_state');
      if (!returnedState || !storedState || returnedState !== storedState) {
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
      token = data.token; // in-memory + per-tab cache (redirect to dashboard follows)
      try{ sessionStorage.setItem('gt_token', data.token); }catch(e){}
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
      if(pageId==='usage'&&token)loadTx();
      if(pageId==='models'){if(typeof loadModels==='function')loadModels();}
      if(pageId==='team'&&token){if(typeof loadOrgs==='function')loadOrgs();}
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
        document.getElementById('dashTotalSpent').textContent='$'+(d.total_spent||0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2});
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
        if(spendEl) spendEl.textContent = '$' + (d.total_spent || 0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2});
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
            return `<div class="dash-activity-item"><div class="icon ${isDeposit?'gold':'green'}" style="width:36px;height:36px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:1rem;flex-shrink:0;background:${isDeposit?'var(--primary-subtle)':'var(--success-subtle)'}">${isDeposit?'💰':'🤖'}</div><div class="info" style="flex:1"><div class="title" style="font-size:0.85rem;font-weight:500">${escapeHtml(a.model||a.payment_method||a.type)}</div><div class="time" style="font-size:0.75rem;color:var(--text-muted)">${escapeHtml(a.created_at?fmtDT(a.created_at):'')}</div></div><div class="val" style="font-size:0.85rem;font-weight:600;color:${isDeposit?'var(--primary)':'var(--destructive)'}">${isDeposit?'+':''}${a.tokens||0}</div></div>`
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
            <div class="key-name">${escapeHtml(key.name)}</div>
            <div class="key-val">${escapeHtml(key.key_prefix)}••••••••</div>
            <div class="meta">${escapeHtml(key.permissions)} · ${key.request_count} requests · ${key.is_active?'<span class="badge active">Active</span>':'<span class="badge inactive">Inactive</span>'}</div>
          </div>
          <div class="key-actions">
            <button class="sort-btn" data-key-id="${escapeAttr(String(key.id))}" data-action="toggle">${key.is_active?'Pause':'Activate'}</button>
            <button class="sort-btn" style="color:var(--destructive)" data-key-id="${escapeAttr(String(key.id))}" data-action="delete">Delete</button>
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
      body.innerHTML=d.items.map(t=>'<tr><td class="td-date">'+(t.created_at?fmtDTStack(t.created_at):'<div class="td-date-strong">—</div>')+'</td><td>'+escapeHtml(t.type)+'</td><td>'+escapeHtml(t.model_used||t.payment_method||'-')+'</td><td class="amount '+(t.type==='deposit'?'gold':'red')+'">'+(t.type==='deposit'?'+':'')+escapeHtml(String(t.tokens||0))+'</td><td class="tx-td-center"><span style="color:var(--success)">'+escapeHtml(t.status)+'</span></td></tr>').join('');
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
            case 'topup': icon='💰'; colorCls='var(--success-subtle)'; desc='Top-up '+fmtUSD(a.amount)+' · +'+parseInt(a.tokens||0).toLocaleString()+' tokens'; val='+'+parseInt(a.tokens||0); break;
            case 'key_created': icon='🔑'; colorCls='var(--border)'; desc='Created API key: '+escapeHtml(a.description||''); break;
            case 'key_deleted': icon='🗑️'; colorCls='var(--border)'; desc='Deleted API key: '+escapeHtml(a.description||''); break;
            case 'key_paused': icon='⏸️'; colorCls='var(--border)'; desc='Paused API key: '+escapeHtml(a.description||''); break;
            case 'consumption': icon='⚡'; colorCls='var(--success-subtle)'; desc=escapeHtml(a.model||'Consumption')+' · '+parseInt(a.tokens||0).toLocaleString()+' tokens'; val='-'+parseInt(a.tokens||0); break;
            default: icon='📋'; colorCls='var(--border)'; desc=escapeHtml(a.description||a.type||''); break;
          }
          var dt=a.created_at?new Date((typeof window.parseUTCDate==='function')?window.parseUTCDate(a.created_at):new Date(a.created_at).getTime()).toLocaleString():'';
          var expandId='act-expand-'+i;
          var hasLog=a.type==='api_call'&&a.log_id?' data-log-id="'+escapeAttr(String(a.log_id))+'" data-model="'+escapeAttr(a.model||'')+'" data-tokens="'+(a.tokens||0)+'" data-cost="'+(a.cost||0)+'"':'';
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
    function txDepositRow(t){
      return '<tr><td class="td-date">'+(t.created_at?fmtDTStack(t.created_at):'<div class="td-date-strong">—</div>')+'</td><td class="amount gold">'+escapeHtml(fmtUSD(t.amount))+'</td><td>'+escapeHtml(t.payment_method||'-')+'</td><td class="amount gold">+'+escapeHtml(String(t.tokens||0))+'</td><td class="tx-td-center"><span style="color:var(--success)">'+escapeHtml(t.status)+'</span></td></tr>';
    }
    function txConsumptionRow(t){
      return '<tr><td class="td-date">'+(t.created_at?fmtDTStack(t.created_at):'<div class="td-date-strong">—</div>')+'</td><td>'+escapeHtml(t.model_used||'-')+'</td><td class="amount red">-'+escapeHtml(String(t.tokens||0))+'</td><td>API</td></tr>';
    }
    // Render ALL rows — no 5-row cutoff, no Show More/Less button (Bud's rule:
    // only vertical hints; the table container scrolls to reach every row).
    function renderTxRows(firstBodyId, collapseBodyId, btnId, rows, rowFn, emptyHtml){
      var firstBody=document.getElementById(firstBodyId);
      var collapseBody=document.getElementById(collapseBodyId);
      var btn=document.getElementById(btnId);
      if(!rows.length){
        if(firstBody)firstBody.innerHTML=emptyHtml;
        if(collapseBody)collapseBody.innerHTML='';
        if(btn)btn.style.display='none';
        return;
      }
      if(firstBody)firstBody.innerHTML=rows.map(rowFn).join('');
      if(collapseBody)collapseBody.innerHTML='';
      if(btn)btn.style.display='none';
    }
    async function loadTx(){
      const d=await safeApi('GET','/api/transactions?limit=50',null,null,true); if(!d)return;
        const dep=d.items.filter(t=>t.type==='deposit');
        const con=d.items.filter(t=>t.type==='consumption');
        renderTxRows('txDepositBody','txDepositCollapse','txDepositMoreBtn',dep,txDepositRow,'<tr><td colspan="5" class="td-empty">No deposits</td></tr>');
        renderTxRows('txConsumptionBody','txConsumptionCollapse','txConsumptionMoreBtn',con,txConsumptionRow,'<tr><td colspan="4" class="td-empty">No consumption</td></tr>');
    }
    function switchTxTab(el,tab){
      document.querySelectorAll('.tx-tab').forEach(t=>t.classList.remove('active'));
      el.classList.add('active');
      var dep=document.getElementById('txDeposits');
      var con=document.getElementById('txConsumption');
      if(dep)dep.classList.toggle('d-none',tab!=='deposits');
      if(con)con.classList.toggle('d-none',tab!=='consumption');
      var dBtn=document.getElementById('txDepositMoreBtn');
      var cBtn=document.getElementById('txConsumptionMoreBtn');
      if(dBtn)dBtn.style.display=(tab==='deposits' && dBtn.getAttribute('data-count'))?'':'none';
      if(cBtn)cBtn.style.display=(tab==='consumption' && cBtn.getAttribute('data-count'))?'':'none';
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
      if(pageId==='team'&&token){if(typeof loadOrgs==='function')loadOrgs();}
    });
    // Parse URL error param (from Auth0 callback failure redirect)
    (function(){
      const params = new URLSearchParams(window.location.search);
      const err = params.get('error');
      if(err) { try { showToast(decodeURIComponent(err), 'error'); } catch(e) { showToast('Login error', 'error'); } }
    })();

