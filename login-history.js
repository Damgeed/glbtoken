/* ══════════════════════════════════════════
   LOGIN HISTORY
   ══════════════════════════════════════════ */

let loginHistoryOffset=0;
const LOGIN_PAGE_SIZE=20;

async function loadLoginHistory(offset) {
  if(!token)return;
  const off=offset!==undefined?offset:0;
  try {
    const d=await safeApi('GET','/api/auth/login-history?offset='+off+'&limit='+LOGIN_PAGE_SIZE);
    if(!d) return;
    const body=document.getElementById('loginHistoryBody');
    if(!body)return;
    const events=d.events||d||[];
    if(!events.length&&off===0){body.innerHTML='<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:2rem">No login history</td></tr>';return}
    if(off===0) body.innerHTML='';
    events.forEach(function(e){body.innerHTML+=renderLoginRow(e);});
    loginHistoryOffset=off+events.length;
    const loadMore=document.getElementById('loginLoadMore');
    if(loadMore) loadMore.style.display=events.length<LOGIN_PAGE_SIZE?'none':'block';
  }catch(e){}
}

function renderLoginRow(event) {
  const deviceIcon=event.device_type==='mobile'?'📱':event.device_type==='tablet'?'📲':'💻';
  const statusBadge=event.success?'<span class="badge-success">Success</span>':'<span class="badge-failed">Failed</span>';
  const ip=escapeHtml(event.ip_address||'—');
  const location=escapeHtml(event.location||'—');
  const date=event.created_at?new Date(event.created_at).toLocaleString():'—';
  const device=escapeHtml(event.device_name||event.device_type||'—');
  return '<tr class="history-row"><td><span class="device-icon">'+deviceIcon+'</span><span>'+device+'</span></td><td><span class="location-tag">'+location+'</span></td><td>'+ip+'</td><td>'+statusBadge+'</td><td>'+date+'</td></tr>';
}

function filterLoginHistory() {
  const dateFilter=document.getElementById('loginDateFilter');
  const deviceFilter=document.getElementById('loginDeviceFilter');
  const statusFilter=document.getElementById('loginStatusFilter');
  const rows=document.querySelectorAll('#loginHistoryBody .history-row');
  rows.forEach(function(row){
    let show=true;
    if(dateFilter&&dateFilter.value){
      if(!row.textContent.toLowerCase().includes(dateFilter.value.toLowerCase())) show=false;
    }
    if(deviceFilter&&deviceFilter.value&&deviceFilter.value!=='all'){
      const deviceIcon=row.querySelector('.device-icon');
      if(deviceIcon){
        const iconText=deviceIcon.textContent;
        if(deviceFilter.value==='mobile'&&iconText!=='📱'&&iconText!=='📲') show=false;
        if(deviceFilter.value==='desktop'&&iconText!=='💻') show=false;
      }
    }
    if(statusFilter&&statusFilter.value&&statusFilter.value!=='all'){
      const hasSuccess=row.querySelector('.badge-success');
      const hasFailed=row.querySelector('.badge-failed');
      if(statusFilter.value==='success'&&!hasSuccess) show=false;
      if(statusFilter.value==='failed'&&!hasFailed) show=false;
    }
    row.style.display=show?'':'none';
  });
}

