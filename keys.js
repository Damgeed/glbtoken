/* ══════════════════════════════════════════
   KEYS — API key management (manage-keys.html)
   Extracted from filters.js — shared globals
   (keys, token, safeApi, escapeHtml, showToast,
   showConfirm from ui.js) come from shared.js
   ══════════════════════════════════════════ */
    // ── API Keys ──
    async function loadKeys(){
      if(!token)return;
      keys=await safeApi('GET','/api/keys');
      if(keys) renderKeys(keys);
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
      if(!k||!k.length){list.innerHTML='<p style="color:var(--text-muted);text-align:center;padding:2rem;font-size:0.85rem">No API keys yet. Create one to get started.</p>';return}
      const ordered=orderKeys(k);
      list.innerHTML=ordered.map(key=>`
        <div class="key-swipe" data-swipe-id="${escapeHtml(String(key.id))}">
          <div class="key-swipe-actions">
            <button class="swipe-action swipe-toggle" data-key-id="${escapeHtml(String(key.id))}" data-action="toggle">${key.is_active?'Pause':'Activate'}</button>
            <button class="swipe-action swipe-delete" data-key-id="${escapeHtml(String(key.id))}" data-action="delete">Delete</button>
          </div>
          <div class="api-key-card">
            <div class="key-info">
              <div class="key-name">${escapeHtml(key.name)}</div>
              <div class="key-val">${escapeHtml(key.key_prefix)}••••••••</div>
              <div class="meta">${escapeHtml(key.permissions)} · ${key.request_count} requests · ${key.last_used?'Last used '+new Date(key.last_used).toLocaleDateString():'Never used'} · ${key.is_active?'<span class="badge active">Active</span>':'<span class="badge inactive">Inactive</span>'}</div>
            </div>
            <div class="key-actions">
              <button class="sort-btn" data-key-id="${escapeHtml(String(key.id))}" data-action="toggle">${key.is_active?'Pause':'Activate'}</button>
              <button class="sort-btn" style="color:var(--destructive)" data-key-id="${escapeHtml(String(key.id))}" data-action="delete">Delete</button>
            </div>
            <div class="key-drag" title="Drag to reorder" aria-label="Drag to reorder">⠿</div>
          </div>
        </div>
      `).join('');
      initKeySwipe();
      initKeyDrag();
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
      let dragEl=null,startY=0,pointerId=null;
      list.addEventListener('pointerdown',function(e){
        const handle=e.target.closest('.key-drag');
        if(!handle)return;
        const wrap=handle.closest('.key-swipe');
        if(!wrap)return;
        e.preventDefault();
        closeSwipe();
        dragEl=wrap;startY=e.clientY;pointerId=e.pointerId;
        dragEl.classList.add('dragging');
        dragEl.style.transition='none';
        dragEl.style.zIndex='50';
        dragEl.style.position='relative';
        try{handle.setPointerCapture(pointerId);}catch(err){}
      });
      list.addEventListener('pointermove',function(e){
        if(!dragEl||e.pointerId!==pointerId)return;
        e.preventDefault();
        dragEl.style.transform='translateY('+(e.clientY-startY)+'px)';
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
      function endDrag(e){
        if(!dragEl||e.pointerId!==pointerId)return;
        dragEl.style.transform='';dragEl.style.transition='';dragEl.style.zIndex='';dragEl.style.position='';
        dragEl.classList.remove('dragging');
        const ids=Array.prototype.slice.call(list.querySelectorAll('.key-swipe')).map(function(w){return w.getAttribute('data-swipe-id');});
        keyOrderSave(ids);
        dragEl=null;pointerId=null;
        renderKeys(keys); // normalize transforms with persisted order
      }
      list.addEventListener('pointerup',endDrag);
      list.addEventListener('pointercancel',endDrag);
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
        if(typeof loadDashKeys==='function')loadDashKeys();
        showToast('Key created! Copy it now.','success');
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
    function sortKeys(mode){
      const s=[...keys];
      if(mode==='newest')s.sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));
      if(mode==='oldest')s.sort((a,b)=>new Date(a.created_at)-new Date(b.created_at));
      if(mode==='name')s.sort((a,b)=>a.name.localeCompare(b.name));
      if(mode==='usage')s.sort((a,b)=>b.request_count-a.request_count);
      renderKeys(s);
    }

    // Auto-init on manage-keys.html
    document.addEventListener('DOMContentLoaded', function(){
      if(typeof loadKeys==='function')loadKeys();
      // Tap outside an open swipe row closes it
      document.addEventListener('click',function(e){
        if(openSwipe&&!openSwipe.contains(e.target))closeSwipe();
      });
    });
