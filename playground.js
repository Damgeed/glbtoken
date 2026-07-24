/* ══════════════════════════════════════════
   PLAYGROUND
   ══════════════════════════════════════════ */

let playgroundMessages=[];
let playgroundCurrentId=null;

function createNewChat() {
  playgroundMessages=[];
  playgroundCurrentId=null;
  const msgsEl=document.getElementById('playgroundMessages');
  if(msgsEl) msgsEl.innerHTML='';
  const inputEl=document.getElementById('playgroundInput');
  if(inputEl) inputEl.value='';
  const titleEl=document.getElementById('playgroundTitle');
  if(titleEl) titleEl.textContent='New Chat';
  const sidebar=document.querySelector('.playground-sidebar .conv-list');
  if(sidebar) sidebar.querySelectorAll('.conv-item').forEach(function(e){e.classList.remove('active');});
}

async function loadConversations() {
  if(!token)return;
  try {
    const d=await safeApi('GET','/api/playground/conversations');
    if(!d) return;
    const list=document.querySelector('.playground-sidebar .conv-list');
    if(!list)return;
    const convs=d.conversations||d||[];
    if(!convs.length){list.innerHTML='<p style="color:var(--text-muted);font-size:0.8rem;text-align:center;padding:1rem">No conversations yet</p>';return}
    list.innerHTML=convs.map(function(c){
      return '<div class="conv-item" data-id="'+escapeHtml(String(c.id))+'" onclick="loadConversation('+escapeHtml(String(c.id))+')"><span class="conv-title">'+escapeHtml(c.title||'Untitled')+'</span><button class="conv-delete" onclick="event.stopPropagation();deleteConversation('+escapeHtml(String(c.id))+')">✕</button></div>';
    }).join('');
  }catch(e){}
}

async function loadConversation(id) {
  if(!token)return;
  try {
    const d=await safeApi('GET','/api/playground/conversations/'+id);
    if(!d) return;
    playgroundCurrentId=id;
    playgroundMessages=d.messages||[];
    const msgsEl=document.getElementById('playgroundMessages');
    if(!msgsEl)return;
    msgsEl.innerHTML='';
    playgroundMessages.forEach(function(m){
      const cls=m.role==='user'?'message-bubble-user':'message-bubble-ai';
      msgsEl.innerHTML+='<div class="playground-msg"><div class="'+cls+'">'+escapeHtml(m.content)+'</div></div>';
    });
    msgsEl.scrollTop=msgsEl.scrollHeight;
    const titleEl=document.getElementById('playgroundTitle');
    if(titleEl) titleEl.textContent=d.title||'Chat';
    // Highlight in sidebar
    document.querySelectorAll('.conv-item').forEach(function(e){e.classList.toggle('active',String(e.dataset.id)===String(id));});
  }catch(e){}
}

async function deleteConversation(id) {
  if(!token)return;
  showConfirm('Delete conversation?','This cannot be undone.',async function(){
    const d=await safeApi('DELETE','/api/playground/conversations/'+id);
    if(!d) return;
    if(playgroundCurrentId===id) createNewChat();
    loadConversations();
    showToast('Conversation deleted','info');
  });
}

async function sendChatMessage() {
  const inputEl=document.getElementById('playgroundInput');
  const msg=(inputEl?inputEl.value:'').trim();
  if(!msg)return;
  if(inputEl) inputEl.value='';
  const msgsEl=document.getElementById('playgroundMessages');
  if(!msgsEl)return;
  // Add user message
  msgsEl.innerHTML+='<div class="playground-msg"><div class="message-bubble-user">'+escapeHtml(msg)+'</div></div>';
  playgroundMessages.push({role:'user',content:msg});
  msgsEl.scrollTop=msgsEl.scrollHeight;
  // Show typing
  const typingId='playgroundTyping';
  msgsEl.innerHTML+='<div class="playground-msg" id="'+typingId+'"><div class="message-bubble-ai"><div class="ai-typing"><span></span><span></span><span></span></div></div></div>';
  msgsEl.scrollTop=msgsEl.scrollHeight;
  // Get selected model + params
  const modelSel=document.getElementById('playgroundModelSelect');
  const model=modelSel?modelSel.value:'gpt-4o-mini';
  const tempEl=document.getElementById('paramTemp');
  const maxTokEl=document.getElementById('paramMaxTokens');
  try {
    const d=await api('POST','/api/playground/chat',{model:model,messages:playgroundMessages,temperature:tempEl?parseFloat(tempEl.value)||0.7:0.7,max_tokens:maxTokEl?parseInt(maxTokEl.value)||2048:2048},120000);
    const typingEl=document.getElementById(typingId);
    if(typingEl) typingEl.remove();
    const resp=d.response||d.choices?.[0]?.message?.content||'No response';
    msgsEl.innerHTML+='<div class="playground-msg"><div class="message-bubble-ai">'+escapeHtml(resp)+'</div></div>';
    playgroundMessages.push({role:'assistant',content:resp});
    msgsEl.scrollTop=msgsEl.scrollHeight;
  }catch(e){
    const typingEl2=document.getElementById(typingId);
    if(typingEl2) typingEl2.remove();
    msgsEl.innerHTML+='<div class="playground-msg"><div class="message-bubble-ai" style="color:var(--destructive)">Error: '+escapeHtml(e.message||'Connection failed')+'</div></div>';
    msgsEl.scrollTop=msgsEl.scrollHeight;
  }
}

async function saveConversation() {
  if(!token){showToast('Please sign in','error');return}
  if(!playgroundMessages.length){showToast('No messages to save','error');return}
  const titleEl=document.getElementById('playgroundTitle');
  const title=titleEl?titleEl.textContent:'Chat '+(new Date().toLocaleString());
  try {
    const d=await safeApi('POST','/api/playground/conversations',{title:title,messages:playgroundMessages});
    if(!d) return;
    playgroundCurrentId=d.id;
    loadConversations();
    showToast('Conversation saved','success');
  }catch(e){}
}

async function updateConversationTitle(id) {
  if(!token||!id)return;
  const titleEl=document.getElementById('playgroundTitle');
  if(!titleEl)return;
  const newTitle=titleEl.textContent.trim()||'Untitled';
  try {
    await safeApi('PUT','/api/playground/conversations/'+id,{title:newTitle});
    loadConversations();
  }catch(e){}
}

async function loadPlaygroundModels() {
  const d=await safeApi('GET','/api/playground/models');
  if(!d) return;
  const sel=document.getElementById('playgroundModelSelect');
  if(!sel)return;
  const models=d.models||d||[];
  if(!models.length){sel.innerHTML='<option value="">No models available</option>';return}
  sel.innerHTML=models.map(function(m){
    return '<option value="'+escapeHtml(m.id||m.model||m)+'">'+escapeHtml(m.name||m.id||m.model||m)+'</option>';
  }).join('');
}

function toggleParams() {
  const panel=document.getElementById('paramsPanel');
  if(panel) panel.classList.toggle('open');
}

function insertPromptSuggestion(text) {
  const inputEl=document.getElementById('playgroundInput');
  if(!inputEl)return;
  inputEl.value=text;
  inputEl.focus();
}

// ── Swipe/drag to open dash sidebar (mobile + desktop) ──
(function(){
  const THRESHOLD=40; // px to trigger open/close
  const EDGE_ZONE=40; // px from left edge for open gesture
  var startX=0,startY=0,swiping=false;
  var sb=null;
  function getSidebar(){return document.getElementById('dashSidebar')}
  function isOpen(){var s=getSidebar();return s&&s.classList.contains('open')}
  
  // Lock/unlock body scroll when sidebar opens/closes (covers both swipe & button click)
  function lockScroll(lock){
    document.body.style.overflow=lock?'hidden':'';
    if(lock) document.body.style.position='fixed';
    else document.body.style.position='';
  }
  // Watch for class changes on sidebar via MutationObserver (catches toggleDashSidebar clicks)
  var obs=new MutationObserver(function(){
    var s=getSidebar();
    if(!s)return;
    lockScroll(s.classList.contains('open'));
  });
  document.addEventListener('DOMContentLoaded',function(){
    var s=getSidebar();
    if(s){
      obs.observe(s,{attributes:true,attributeFilter:['class']});
      // Block browser back/forward swipe on dash pages
      document.body.style.touchAction='pan-y';
    }
  });
  
  // ── Touch events (mobile) ──
  document.addEventListener('touchstart',function(e){
    sb=getSidebar();
    if(!sb)return;
    var t=e.touches[0];
    startX=t.clientX;startY=t.clientY;
    swiping=true;
    if(startX<=EDGE_ZONE){e.preventDefault()}
  },{passive:false});
  document.addEventListener('touchmove',function(e){
    if(!swiping||!sb)return;
    var t=e.touches[0];
    var dx=t.clientX-startX;
    var dy=t.clientY-startY;
    if(Math.abs(dx)<Math.abs(dy))return;
    if(!isOpen()&&startX<=EDGE_ZONE&&dx>THRESHOLD){
      e.preventDefault();
      sb.classList.add('open');
      var toggle=document.getElementById('dashSidebarToggle');
      if(toggle)toggle.classList.add('hidden');
      swiping=false;
      return;
    }
    if(isOpen()&&dx<-THRESHOLD){
      e.preventDefault();
      sb.classList.remove('open');
      var toggle=document.getElementById('dashSidebarToggle');
      if(toggle)toggle.classList.remove('hidden');
      swiping=false;
      return;
    }
    if(isOpen()&&Math.abs(dx)>10){
      e.preventDefault();
    }
  },{passive:false});
  document.addEventListener('touchend',function(){
    swiping=false;
  },{passive:true});
  
  // ── Mouse events (desktop drag from left edge) ──
  document.addEventListener('mousedown',function(e){
    sb=getSidebar();
    if(!sb||e.button!==0)return;
    startX=e.clientX;startY=e.clientY;
    swiping=(startX<=EDGE_ZONE);
  });
  document.addEventListener('mousemove',function(e){
    if(!swiping||!sb)return;
    var dx=e.clientX-startX;
    if(!isOpen()&&startX<=EDGE_ZONE&&dx>THRESHOLD){
      sb.classList.add('open');
      var toggle=document.getElementById('dashSidebarToggle');
      if(toggle)toggle.classList.add('hidden');
      swiping=false;
      return;
    }
    if(isOpen()&&dx<-THRESHOLD){
      sb.classList.remove('open');
      var toggle=document.getElementById('dashSidebarToggle');
      if(toggle)toggle.classList.remove('hidden');
      swiping=false;
      return;
    }
  });
  document.addEventListener('mouseup',function(){
    swiping=false;
  });
})();

// ── Token recovery from URL (payment redirect) ──
(function(){
  var params = new URLSearchParams(window.location.search);
  var urlToken = params.get('token');
  var urlUser = params.get('user');
  if (urlToken) {
    localStorage.setItem('gt_token', urlToken);
    if (urlUser) {
      try { localStorage.setItem('gt_user', decodeURIComponent(urlUser)); } catch(e) {}
    }
    var clean = window.location.protocol + '//' + window.location.host + window.location.pathname;
    window.history.replaceState({}, document.title, clean);
  }
})();

// ── Dashboard sidebar toggle (called from onclick) ──
function toggleDashSidebar() {
  var sb = document.getElementById('dashSidebar');
  var toggle = document.getElementById('dashSidebarToggle');
  if(!sb) return;
  var isOpen = sb.classList.toggle('open');
  if(toggle) toggle.classList.toggle('hidden', isOpen);
}

// ── Scroll-hint: hide gold arrow when user scrolls ──
document.addEventListener('DOMContentLoaded', function() {
  document.querySelectorAll('.dash-card div[style*="overflow-x:auto"], .dash-card .scroll-x').forEach(function(el) {
    el.addEventListener('scroll', function() {
      var card = this.closest('.dash-card');
      if(card) card.classList.add('is-scrolled');
    }, {passive:true});
  });
});

