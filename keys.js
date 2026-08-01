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
    function renderKeys(k){
      const list=document.getElementById('keyList');
      if(!k||!k.length){list.innerHTML='<p style="color:var(--text-muted);text-align:center;padding:2rem;font-size:0.85rem">No API keys yet. Create one to get started.</p>';return}
      list.innerHTML=k.map(key=>`
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
    });
