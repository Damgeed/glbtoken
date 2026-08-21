/* ══════════════════════════════════════════
   KEYS — API key management (manage-keys.html)
   Extracted from filters.js — shared globals
   (keys, token, safeApi, escapeHtml, showToast,
   showConfirm from ui.js) come from shared.js
   ══════════════════════════════════════════ */
    // ── API Keys ──
    async function doLoadKeys(){
      try{
        keys=await safeApi('GET','/api/keys');
        if(keys) renderKeys(keys);
      }catch(e){
        // Leave the placeholder visible; api() already toasted the real error
      }
    }
    async function loadKeys(){
      if(!token){
        // New tab / session restore: the access token is minted asynchronously
        // (refreshSession). Retry for ~3s; if still absent, fire the request
        // anyway — api() has built-in 401 → refresh → retry, so it can recover
        // without a cached token.
        var attempts = 0;
        (function tryLoad(){
          if(token){ doLoadKeys(); return; }
          if(attempts++ < 10){ setTimeout(tryLoad, 300); return; }
          doLoadKeys();
        })();
        return;
      }
      doLoadKeys();
    }

    // ── Drag-reorder persistence (client-side display order) ──
    function keyOrderGet(){
      try{
        const raw=(window.__secure?window.__secure.getItem('gt_key_order'):localStorage.getItem('gt_key_order'));
        const arr=raw?JSON.parse(raw):null;
        return Array.isArray(arr)?arr:null;
      }catch(e){return null}
    }
    function keyOrderSave(ids){
      try{
        const s=JSON.stringify(ids);
        if(window.__secure)window.__secure.setItem('gt_key_order',s);
        else localStorage.setItem('gt_key_order',s);
      }catch(e){}
    }
    function orderKeys(arr){
      const order=keyOrderGet();
      if(!order||!order.length)return arr;
      const byId={};arr.forEach(k=>{byId[String(k.id)]=k});
      const out=[];order.forEach(id=>{if(byId[id]){out.push(byId[id]);delete byId[id];}});
      Object.keys(byId).forEach(id=>out.push(byId[id]));
      return out;
    }

    function renderKeys(k){
      const list=document.getElementById('keyList');
      if(!k||!k.length){
        list.innerHTML='<div style="text-align:center;padding:2.5rem 1rem">'
          + '<div style="font-size:0.9rem;color:var(--text-muted);margin-bottom:1rem">'+t('No API keys yet. Create one to start building.')+'</div>'
          + '<button class="btn-primary" onclick="showCreateKeyModal()">'+t('+ Create your first key')+'</button>'
          + '</div>';
        return;
      }
      const ordered=orderKeys(k);
      const cards=ordered.map(key=>`
        <div class="key-swipe" data-swipe-id="${escapeAttr(String(key.id))}">
          <div class="key-swipe-actions">
            <button class="swipe-action swipe-edit" data-key-id="${escapeAttr(String(key.id))}" onclick="openEditKeyModal(${safeJsId(key.id)})">${t('Edit')}</button>
            <button class="swipe-action ${key.is_active?'swipe-pause':'swipe-activate'}" data-key-id="${escapeAttr(String(key.id))}" data-action="toggle">${key.is_active?t('Pause'):t('Activate')}</button>
            <button class="swipe-action swipe-delete" data-key-id="${escapeAttr(String(key.id))}" data-action="delete">${t('Delete')}</button>
          </div>
          <div class="api-key-card">
            <input type="checkbox" class="key-check" data-key-id="${escapeAttr(String(key.id))}" onchange="updateBulkCount()" style="display:none;flex-shrink:0;width:16px;height:16px;accent-color:var(--primary)" aria-label="${t('Select key')}" />
            <div class="key-info">
              <div class="key-name">${escapeHtml(key.name)} <button type="button" class="key-edit" onclick="openEditKeyModal(${safeJsId(key.id)})" title="${t('Edit key')}" aria-label="${t('Edit key')}">✎</button></div>
              <div class="key-val">${escapeHtml(key.key_prefix)}••••••••<button type="button" class="key-copy" data-copy="${escapeAttr(key.key_prefix)}" onclick="copyKeyPrefix(this)" title="${t('Copy key prefix')}" aria-label="${t('Copy key prefix')}">⧉</button></div>
              <div class="meta">${escapeHtml(key.permissions)}${key.total_spent?' · <span class="spent">'+fmtTokens(key.total_spent)+' '+t('used')+'</span>':''}${keyBudgetMeta(key)} · ${t('Created ')}${key.created_at?fmtDT(key.created_at):'—'} · ${escapeHtml(key.request_count)} ${t('requests')} · ${key.last_used?t('Last used ')+fmtDT(key.last_used):t('Never used')}${key.expires_at?' · '+fmtExpiry(key.expires_at):''}${key.rate_limit_rpm?' · '+escapeHtml(key.rate_limit_rpm)+' '+t('req/min'):''}${key.ip_allowlist?' · <span class="ip-allow" title="'+t('Allowed IPs')+'">'+t('IPs: ')+escapeHtml(key.ip_allowlist)+'</span>':''} · ${key.is_active?'<span class="badge active">'+t('Active')+'</span>':'<span class="badge inactive">'+t('Inactive')+'</span>'}</div>
              <div class="key-spark" id="spark-${safeJsId(key.id)}" data-key-id="${escapeAttr(String(key.id))}" title="${t('Token usage — last 7 days')}"><span class="spark-empty">—</span></div>
            </div>
            <div class="key-card-footer">
              <div class="key-actions">
                <a class="sort-btn btn-usage" href="logs.html">${t('Usage')}</a>
                <button class="sort-btn btn-edit" onclick="openEditKeyModal(${safeJsId(key.id)})">${t('Edit')}</button>
                <button class="sort-btn ${key.is_active?'btn-pause':'btn-activate'}" data-key-id="${escapeAttr(String(key.id))}" data-action="toggle">${key.is_active?t('Pause'):t('Activate')}</button>
                <button class="sort-btn btn-delete" data-key-id="${escapeAttr(String(key.id))}" data-action="delete">${t('Delete')}</button>
              </div>
              <div class="key-drag" title="${t('Drag to reorder')}" aria-label="${t('Drag to reorder')}">⠿</div>
            </div>
          </div>
        </div>
      `);
      // Render ALL cards — the list container scrolls (no 5-card cutoff, no
      // Show More/Less button — only vertical hints).
      list.innerHTML = cards.join('');
      var moreBtn = document.getElementById('keyMoreBtn');
      if(moreBtn) moreBtn.style.display = 'none';
      initKeySwipe();
      initKeyDrag();
      loadSparklines();
    }

    // ── 7-day usage sparkline per key (inline SVG, no Chart.js needed) ──
    function sparklineSvg(series){
      const W=120,H=28,P=2;
      if(!series||!series.length) return '';
      const max=Math.max.apply(null,series.concat([1]));
      const pts=series.map(function(v,i){
        const x=P+(i*(W-2*P)/(series.length-1||1));
        const y=H-P-(v/max)*(H-2*P);
        return [x.toFixed(1),y.toFixed(1)];
      });
      const line=pts.map(function(p,i){return (i?'L':'M')+p[0]+','+p[1];}).join(' ');
      const area=line+' L'+pts[pts.length-1][0]+','+(H-P)+' L'+pts[0][0]+','+(H-P)+' Z';
      return '<svg width="'+W+'" height="'+H+'" viewBox="0 0 '+W+' '+H+'" preserveAspectRatio="none" aria-hidden="true">'
        +'<path d="'+area+'" style="fill:var(--primary-subtle)" stroke="none"/>'
        +'<path d="'+line+'" fill="none" style="stroke:var(--primary)" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/>'
        +'<circle cx="'+pts[pts.length-1][0]+'" cy="'+pts[pts.length-1][1]+'" r="2.2" style="fill:var(--primary)"/>'
        +'</svg>';
    }
    function loadSparklines(){
      document.querySelectorAll('.key-spark[data-key-id]').forEach(function(el){
        var kid=el.getAttribute('data-key-id');
        if(el.__sparkLoaded)return; el.__sparkLoaded=true;
        safeApi('GET','/api/keys/'+encodeURIComponent(kid)+'/usage')
          .then(function(d){
            if(d&&Array.isArray(d.series)){
              var any=d.series.some(function(v){return v>0;});
              el.innerHTML = any ? sparklineSvg(d.series) : '<span class="spark-empty">No usage</span>';
            }
          })
          .catch(function(){});
      });
    }
    // ── Swipe-left to reveal Pause/Delete (mobile, iOS-mail style) ──
    let openSwipe=null;
    function closeSwipe(){
      if(openSwipe){openSwipe.classList.remove('open');openSwipe=null;}
    }
    function initKeySwipe(){
      const list=document.getElementById('keyList');
      if(!list)return;
      list.querySelectorAll('.key-swipe').forEach(function(wrap){
        if(wrap.__swipeInit)return;wrap.__swipeInit=true;
        let startX=0,startY=0,dx=0,dy=0,tracking=false,decided=false;
        wrap.addEventListener('touchstart',function(e){
          if(e.target.closest('.key-drag')||e.target.closest('.key-swipe-actions'))return;
          const t=e.touches[0];startX=t.clientX;startY=t.clientY;dx=0;dy=0;tracking=true;decided=false;
        },{passive:true});
        wrap.addEventListener('touchmove',function(e){
          if(!tracking)return;
          const t=e.touches[0];
          dx=t.clientX-startX;dy=t.clientY-startY;
          if(!decided){
            if(Math.abs(dx)<8&&Math.abs(dy)<8)return;
            decided=true;
            if(Math.abs(dx)<=Math.abs(dy)){tracking=false;return;} // vertical scroll wins
          }
          e.preventDefault();
          const card=wrap.querySelector('.api-key-card');
          const maxShift=160;
          const shift=Math.max(-maxShift,Math.min(0,dx));
          card.style.transform='translateX('+shift+'px)';
          if(openSwipe&&openSwipe!==wrap)openSwipe.classList.remove('open');
        },{passive:false});
        wrap.addEventListener('touchend',function(){
          if(!tracking)return;tracking=false;
          const card=wrap.querySelector('.api-key-card');
          card.style.transform='';
          if(dx<-45){closeSwipe();wrap.classList.add('open');openSwipe=wrap;}
          else if(dx>45){wrap.classList.remove('open');if(openSwipe===wrap)openSwipe=null;}
        },{passive:true});
      });
    }

    // ── Drag handle to reorder (pointer events: works on desktop + mobile) ──
    function initKeyDrag(){
      const list=document.getElementById('keyList');
      if(!list)return;
      if(list.__dragInit)return;list.__dragInit=true;
      let dragEl=null,startY=0,pointerId=null,lastY=0,rafId=null;
      list.addEventListener('pointerdown',function(e){
        const handle=e.target.closest('.key-drag');
        if(!handle)return;
        const wrap=handle.closest('.key-swipe');
        if(!wrap)return;
        e.preventDefault();
        closeSwipe();
        dragEl=wrap;startY=e.clientY;lastY=e.clientY;pointerId=e.pointerId;
        dragEl.classList.add('dragging');
        dragEl.style.transition='none';
        dragEl.style.willChange='transform';
        dragEl.style.zIndex='50';
        dragEl.style.position='relative';
        try{handle.setPointerCapture(pointerId);}catch(err){}
      });
      list.addEventListener('pointermove',function(e){
        if(!dragEl||e.pointerId!==pointerId)return;
        e.preventDefault();
        lastY=e.clientY;
        if(rafId)return;
        rafId=requestAnimationFrame(function(){
          rafId=null;
          if(!dragEl)return;
          dragEl.style.transform='translateY('+(lastY-startY)+'px)';
          const rect=dragEl.getBoundingClientRect();
          const mid=rect.top+rect.height/2;
          const wraps=Array.prototype.slice.call(list.querySelectorAll('.key-swipe')).filter(function(w){return w!==dragEl;});
          for(let i=0;i<wraps.length;i++){
            const r=wraps[i].getBoundingClientRect();
            if(mid<r.top+r.height/2){
              if(wraps[i].nextElementSibling!==dragEl){list.insertBefore(dragEl,wraps[i]);}
              return;
            }
          }
          if(dragEl.nextElementSibling)list.appendChild(dragEl);
        });
      });
      function endDrag(e){
        if(!dragEl||e.pointerId!==pointerId)return;
        const el=dragEl;
        dragEl=null;pointerId=null;
        if(rafId){cancelAnimationFrame(rafId);rafId=null;}
        // persist the new display order (DOM is already in final position)
        const ids=Array.prototype.slice.call(list.querySelectorAll('.key-swipe')).map(function(w){return w.getAttribute('data-swipe-id');});
        keyOrderSave(ids);
        // smooth settle: animate translateY -> 0, then clean up (no full re-render flash)
        el.style.transition='transform 0.2s cubic-bezier(0.2,0.8,0.2,1)';
        el.style.transform='';
        el.classList.remove('dragging');
        setTimeout(function(){
          el.style.transition='';el.style.willChange='';el.style.zIndex='';el.style.position='';
        },220);
      }
      list.addEventListener('pointerup',endDrag);
      list.addEventListener('pointercancel',endDrag);
    }

    function fmtTokens(n){
      if(n>=1e6)return (n/1e6).toFixed(1)+'M';
      if(n>=1e3)return (n/1e3).toFixed(1)+'k';
      return String(Math.round(n));
    }
    function keyBudgetMeta(key){
      const limit=Number(key.monthly_token_limit||0);
      if(!limit)return '';
      const used=Number(key.monthly_tokens_used||0);
      const pct=Math.min(100,Math.round(used/limit*100));
      return ' · <span class="spent" title="Calendar-month token budget">Monthly '+fmtTokens(used)+' / '+fmtTokens(limit)+' ('+pct+'%)</span>';
    }
    function fmtExpiry(iso){
      const d=new Date((typeof window.parseUTCDate==='function')?window.parseUTCDate(iso):new Date(iso).getTime());const now=Date.now();
      if(isNaN(d.getTime()))return '';
      if(d.getTime()<now)return '<span class="expiry-soon">Expired</span>';
      const days=Math.ceil((d.getTime()-now)/86400000);
      return 'Expires '+d.toLocaleDateString()+(days<=7?' <span class="expiry-soon">('+days+'d)</span>':'');
    }
    function flashCopyTick(btn, ms){
      if(!btn) return;
      var orig = btn.innerHTML;
      btn.classList.add('copied');
      btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#00D68F" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
      setTimeout(function(){ btn.innerHTML = orig; btn.classList.remove('copied'); }, ms || 1800);
    }
    function copyNewKey(btn){
      var v=document.getElementById('newKeyValue') ? document.getElementById('newKeyValue').textContent : '';
      function done(){ showToast('Copied!','success'); flashCopyTick(btn); }
      if(navigator.clipboard&&navigator.clipboard.writeText){ navigator.clipboard.writeText(v).then(done).catch(done); }
      else { done(); }
    }
    function copyKeyPrefix(btn){
      const v=btn.getAttribute('data-copy')||'';
      function done(){ showToast('Key prefix copied','success'); flashCopyTick(btn); }
      if(navigator.clipboard&&navigator.clipboard.writeText){
        navigator.clipboard.writeText(v).then(done).catch(done);
      }else{
        done();
      }
    }
    function showCreateKeyModal(){document.getElementById('createKeyModal').classList.add('open');document.getElementById('newKeyResult').style.display='none';document.getElementById('newKeyName').value=t('My API Key');document.getElementById('newKeyExpiry').value='90d';document.getElementById('newKeyRpm').value='60';document.getElementById('newKeyBudget').value='0';document.getElementById('newKeyIps').value='';document.getElementById('newKeyName').focus()}
    function closeCreateKeyModal(){document.getElementById('createKeyModal').classList.remove('open')}
    async function createApiKey(){
      const name=document.getElementById('newKeyName').value;
      const perms=document.getElementById('newKeyPerms').value;
      const expirySel=document.getElementById('newKeyExpiry').value;
      let expires_at='';
      if(expirySel==='30d')expires_at=new Date(Date.now()+30*86400000).toISOString();
      else if(expirySel==='90d')expires_at=new Date(Date.now()+90*86400000).toISOString();
      else if(expirySel==='1y')expires_at=new Date(Date.now()+365*86400000).toISOString();
      const rpm=parseInt(document.getElementById('newKeyRpm').value,10);
      const budget=Number(document.getElementById('newKeyBudget').value||0);
      const ips=document.getElementById('newKeyIps').value.trim();
      if(!Number.isFinite(budget)||budget<0||budget>1000000000){showToast(t('Monthly budget must be between 0 and 1,000,000,000 tokens'),'error');return;}
      try{
        const d=await safeApi('POST','/api/keys',{name,permissions:perms,expires_at,rate_limit_rpm:rpm>0?rpm:null,monthly_token_limit:budget,ip_allowlist:ips});
        if(!d) return;
        document.getElementById('newKeyValue').textContent=d.key;
        document.getElementById('newKeyResult').style.display='block';
        loadKeys();
        if(typeof loadDashKeys==='function')loadDashKeys();
        showToast(t('Key created! Copy it now.'),'success');
      }catch(e){}
    }
    async function toggleKeyStatus(id){
      const key=keys.find(k=>k.id===id);if(!key)return;
      const pausing=key.is_active;
      showConfirm(
        pausing?'Pause API Key?':'Activate API Key?',
        pausing?'Paused keys stop working immediately. You can activate it again anytime.':'This will re-enable the key and restore access.',
        async function(){
          await safeApi('PUT',`/api/keys/${id}`,{is_active:!key.is_active});
          loadKeys();
          showToast(pausing?'Key paused':'Key activated','success');
        }
      );
    }
    async function deleteKey(id){
      showConfirm('Delete API Key?','This cannot be undone.',async function(){
        await safeApi('DELETE',`/api/keys/${id}`);
        loadKeys();
        showToast('Key deleted','info');
      });
    }

    // ── Edit key (rename, permissions, expiry, rate limit, IP allowlist) ──
    let _editingKey=null;
    function openEditKeyModal(id){
      const key=keys.find(function(k){return k.id===id;}); if(!key) return;
      _editingKey=key;
      document.getElementById('editKeyTitle').textContent='Edit API Key';
      document.getElementById('editKeyName').value=key.name||'';
      document.getElementById('editKeyPerms').value=key.permissions||'read_write';
      var expSel=document.getElementById('editKeyExpiry');
      if(key.expires_at){
        var days=Math.ceil((new Date(key.expires_at)-Date.now())/86400000);
        expSel.value = days<=31?'30d':(days<=92?'90d':'1y');
      } else { expSel.value=''; }
      document.getElementById('editKeyRpm').value=key.rate_limit_rpm||'';
      document.getElementById('editKeyBudget').value=key.monthly_token_limit||0;
      document.getElementById('editKeyIps').value=key.ip_allowlist||'';
      document.getElementById('editKeyModal').classList.add('open');
    }
    function closeEditKeyModal(){document.getElementById('editKeyModal').classList.remove('open');_editingKey=null;}
    async function saveEditKey(){
      if(!_editingKey) return;
      const name=document.getElementById('editKeyName').value;
      const perms=document.getElementById('editKeyPerms').value;
      const expirySel=document.getElementById('editKeyExpiry').value;
      let expires_at='';
      if(expirySel==='30d')expires_at=new Date(Date.now()+30*86400000).toISOString();
      else if(expirySel==='90d')expires_at=new Date(Date.now()+90*86400000).toISOString();
      else if(expirySel==='1y')expires_at=new Date(Date.now()+365*86400000).toISOString();
      const rpm=parseInt(document.getElementById('editKeyRpm').value,10);
      const budget=Number(document.getElementById('editKeyBudget').value||0);
      const ips=document.getElementById('editKeyIps').value.trim();
      if(!Number.isFinite(budget)||budget<0||budget>1000000000){showToast(t('Monthly budget must be between 0 and 1,000,000,000 tokens'),'error');return;}
      try{
        const d=await safeApi('PUT','/api/keys/'+_editingKey.id,{name:name,permissions:perms,expires_at:expires_at,rate_limit_rpm:rpm>0?rpm:0,monthly_token_limit:budget,ip_allowlist:ips});
        if(!d) return;
        closeEditKeyModal();
        loadKeys();
        showToast(t('Key updated'),'success');
      }catch(e){}
    }

    // ── Search / filter keys by name or prefix ──
    function filterKeys(q){
      q=(q||'').toLowerCase().trim();
      if(!q){ renderKeys(keys); return; }
      var filtered=keys.filter(function(k){
        return (k.name||'').toLowerCase().indexOf(q)>-1
          || (k.key_prefix||'').toLowerCase().indexOf(q)>-1;
      });
      renderKeys(filtered);
    }

    // ── Bulk mode: multi-select pause / activate / delete ──
    // Entering bulk mode swaps the Select icon for a Done icon in the SAME slot
    // (io-group), keeps the Export button in place, and shows the bulk chip row
    // (count + Select All / Activate / Pause / Delete icons). The controls row
    // and + New Key never move.
    var _bulkMode=false;
    function enterBulkMode(){
      _bulkMode=true;
      document.querySelectorAll('.key-check').forEach(function(c){c.style.display='';});
      var sel=document.getElementById('bulkToggleBtn'); if(sel)sel.style.display='none';
      var done=document.getElementById('bulkDoneIconBtn'); if(done)done.style.display='';
      var bar=document.getElementById('bulkBar'); if(bar){bar.style.display='flex';bar.classList.remove('hidden');}
      updateBulkCount();
    }
    function exitBulkMode(){
      _bulkMode=false;
      document.querySelectorAll('.key-check').forEach(function(c){c.checked=false;c.style.display='none';});
      var sel=document.getElementById('bulkToggleBtn'); if(sel)sel.style.display='';
      var done=document.getElementById('bulkDoneIconBtn'); if(done)done.style.display='none';
      var bar=document.getElementById('bulkBar'); if(bar){bar.style.display='none';bar.classList.add('hidden');}
      updateBulkCount();
    }
    function updateBulkCount(){
      var n=document.querySelectorAll('.key-check:checked').length;
      var el=document.getElementById('bulkCount'); if(el)el.textContent=n+' '+t('selected');
    }
    function bulkToggleAll(){
      var boxes=document.querySelectorAll('.key-check');
      var allChecked=boxes.length>0&&Array.prototype.every.call(boxes,function(b){return b.checked;});
      boxes.forEach(function(b){b.checked=!allChecked;});
      updateBulkCount();
    }
    function selectedKeyIds(){
      return Array.prototype.slice.call(document.querySelectorAll('.key-check:checked'))
        .map(function(b){return parseInt(b.getAttribute('data-key-id'),10);});
    }
    async function bulkSetActive(active){
      var ids=selectedKeyIds();
      if(!ids.length){ showToast(t('Select at least one key'),'error'); return; }
      var label=active?'activate':'pause';
      showConfirm(active?'Activate keys?':'Pause keys?', active?'Re-enable access for '+ids.length+' key(s)?':'Stop '+ids.length+' key(s) immediately?', async function(){
        for(var i=0;i<ids.length;i++){
          await safeApi('PUT','/api/keys/'+ids[i],{is_active:active});
        }
        loadKeys();
        showToast(ids.length+' key(s) '+(active?'activated':'paused'),'success');
      });
    }
    async function bulkDelete(){
      var ids=selectedKeyIds();
      if(!ids.length){ showToast(t('Select at least one key'),'error'); return; }
      showConfirm('Delete keys?','Delete '+ids.length+' API key(s)? This cannot be undone.', async function(){
        for(var i=0;i<ids.length;i++){
          await safeApi('DELETE','/api/keys/'+ids[i]);
        }
        loadKeys();
        showToast(ids.length+' key(s) deleted','info');
      });
    }

    // ── Export keys as CSV (formula-injection guarded) ──
    function csvGuard(v){
      v=(v==null?'':String(v));
      return /^[=+\-@]/.test(v) ? "'"+v : v;
    }
    function exportKeysCsv(){
      if(!keys||!keys.length){ showToast(t('No keys to export'),'error'); return; }
      // Export ONLY selected keys when in bulk mode with a selection;
      // otherwise export all keys (matches "export everything" default).
      var ids = _bulkMode ? selectedKeyIds() : [];
      var toExport = keys;
      if(ids.length){
        var idSet = {};
        ids.forEach(function(id){ idSet[id] = true; });
        toExport = keys.filter(function(k){ return idSet[k.id]; });
        if(!toExport.length){ showToast(t('Select at least one key to export'),'error'); return; }
      }
      var header=['name','key_prefix','permissions','created_at','last_used','requests','tokens_spent','monthly_tokens_used','monthly_token_limit','expires_at','rate_limit_rpm','ip_allowlist','status'];
      var rows=[header];
      toExport.forEach(function(k){
        rows.push([
          csvGuard(k.name), csvGuard(k.key_prefix), csvGuard(k.permissions),
          k.created_at||'', k.last_used||'', k.request_count||0,
          k.total_spent||0, k.monthly_tokens_used||0, k.monthly_token_limit||'', k.expires_at||'', k.rate_limit_rpm||'', csvGuard(k.ip_allowlist||''),
          k.is_active?'active':'inactive'
        ]);
      });
      var csv=rows.map(function(r){return r.map(function(c){return '"'+String(c).replace(/"/g,'""')+'"';}).join(',');}).join('\n');
      var blob=new Blob([csv],{type:'text/csv;charset=utf-8;'});
      var a=document.createElement('a');
      a.href=URL.createObjectURL(blob);
      a.download=ids.length ? 'glbtoken-keys-selected-'+new Date().toISOString().slice(0,10)+'.csv' : 'glbtoken-keys-'+new Date().toISOString().slice(0,10)+'.csv';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(a.href);
      showToast((ids.length ? ids.length + ' key(s) exported' : 'All keys exported'),'success');
    }
    function sortKeys(mode){
      const s=[...keys];
      if(mode==='newest')s.sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));
      if(mode==='oldest')s.sort((a,b)=>new Date(a.created_at)-new Date(b.created_at));
      if(mode==='name')s.sort((a,b)=>a.name.localeCompare(b.name));
      if(mode==='usage')s.sort((a,b)=>b.request_count-a.request_count);
      // Persist the sorted order as the new display order, otherwise
      // renderKeys→orderKeys() re-applies the old drag order and overrides the sort.
      keyOrderSave(s.map(function(k){return String(k.id);}));
      renderKeys(s);
      // Active-state feedback on the sort buttons
      document.querySelectorAll('.sort-btn').forEach(function(b){b.classList.remove('active');});
      var activeBtn=document.querySelector('.sort-btn[onclick="sortKeys(\''+mode+'\')"]');
      if(activeBtn)activeBtn.classList.add('active');
    }

    // Auto-init on manage-keys.html
    document.addEventListener('DOMContentLoaded', function(){
      if(typeof loadKeys==='function')loadKeys();
      // Live search/filter by name or prefix
      var searchEl=document.getElementById('keySearch');
      if(searchEl){
        searchEl.addEventListener('input',function(){ filterKeys(this.value); });
      }
      // Tap outside an open swipe row closes it
      document.addEventListener('click',function(e){
        if(openSwipe&&!openSwipe.contains(e.target))closeSwipe();
      });
    });
