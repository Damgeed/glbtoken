/* ══════════════════════════════════════════
   REFERRAL
   ══════════════════════════════════════════ */

async function loadReferralStats() {
  if(!token)return;
  const d=await safeApi('GET','/api/referral/stats');
  if(!d) return;
    const codeEl=document.getElementById('refCode');
    const countEl=document.getElementById('refCount');
    const earnEl=document.getElementById('refEarnings');
    if(codeEl) codeEl.textContent=d.code||'—';
    if(countEl) countEl.textContent=d.referral_count||0;
    if(earnEl) earnEl.textContent=(d.total_earnings||0).toFixed(2);
    const tableBody=document.getElementById('refTableBody');
    if(tableBody&&d.referrals&&d.referrals.length){
      tableBody.innerHTML=d.referrals.map(function(r){
        return '<tr><td>'+escapeHtml(r.email||r.name||'—')+'</td><td>'+escapeHtml(r.status||'joined')+'</td><td>'+(r.joined_at?new Date(r.joined_at).toLocaleDateString():'—')+'</td><td class="gold">+'+(r.reward||0)+'</td></tr>';
      }).join('');
    }else if(tableBody){
      tableBody.innerHTML='<tr><td colspan="4" style="text-align:center;color:var(--text-muted);padding:1.5rem">No referrals yet</td></tr>';
    }
    // Chart
    const chartEl=document.getElementById('refChart');
    if(chartEl&&d.history&&d.history.length&&typeof Chart!=='undefined'){
      if(window._refChartInst)window._refChartInst.destroy();
      window._refChartInst=new Chart(chartEl,{
        type:'line',
        data:{labels:d.history.map(function(h){return h.date}),datasets:[{label:'Referrals',data:d.history.map(function(h){return h.count}),borderColor:'#F4B400',backgroundColor:'rgba(244,180,0,0.1)',fill:true,tension:0.3}]},
        options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{labels:{color:'var(--text-muted)',font:{size:10}}}},scales:{y:{beginAtZero:true,grid:{color:'rgba(255,255,255,0.05)'},ticks:{color:'var(--text-muted)'}},x:{grid:{display:false},ticks:{color:'var(--text-muted)'}}}}
      });
    }
}

async function generateReferralCode() {
  if(!token){showToast('Please sign in','error');return}
  const d=await safeApi('POST','/api/referral/code');
  if(!d) return;
  const codeEl=document.getElementById('refCode');
  if(codeEl) codeEl.textContent=d.code;
  showToast('New referral code generated!','success');
}

function copyReferralCode() {
  const codeEl=document.getElementById('refCode');
  if(!codeEl||!codeEl.textContent||codeEl.textContent==='—'){showToast('No code to copy','error');return}
  const code=codeEl.textContent;
  if(navigator.clipboard){
    navigator.clipboard.writeText(code).then(function(){showToast('Referral code copied!','success')}).catch(function(){});
  }else{
    const ta=document.createElement('textarea');ta.value=code;document.body.appendChild(ta);ta.select();document.execCommand('copy');document.body.removeChild(ta);showToast('Referral code copied!','success');
  }
}

async function loadReferralRewards() {
  if(!token)return;
  const d=await safeApi('GET','/api/referral/rewards');
  if(!d) return;
  const body=document.getElementById('refRewardsBody');
  if(!body)return;
  if(!d||!d.length){body.innerHTML='<tr><td colspan="4" style="text-align:center;color:var(--text-muted);padding:1.5rem">No rewards yet</td></tr>';return}
  body.innerHTML=d.map(function(r){
    return '<tr><td>'+escapeHtml(r.from||'—')+'</td><td class="gold">+'+escapeHtml(String(r.amount||0))+'</td><td>'+escapeHtml(r.reason||'referral')+'</td><td>'+(r.created_at?new Date(r.created_at).toLocaleDateString():'—')+'</td></tr>';
  }).join('');
}

async function claimRewards() {
  if(!token){showToast('Please sign in','error');return}
  const d=await safeApi('POST','/api/referral/claim');
  if(!d) return;
  if(d.new_balance!==undefined){userData.token_balance=d.new_balance;localStorage.setItem('gt_user',JSON.stringify(userData));updateBalance()}
  loadReferralRewards();
  loadReferralStats();
  showToast('Rewards claimed!','success');
}

