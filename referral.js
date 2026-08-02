/* ══════════════════════════════════════════
   REFERRAL
   ══════════════════════════════════════════ */

async function loadReferralStats() {
  if(!token)return;
  const d=await safeApi('GET','/api/referral/stats');
  if(!d) return;
    const codeEl=document.getElementById('refCode');
    const yourCodeEl=document.getElementById('refYourCode');
    const countEl=document.getElementById('refCount');
    const earnEl=document.getElementById('refEarnings');
    const totalRefsEl=document.getElementById('refTotalReferrals');
    const totalEarnEl=document.getElementById('refTotalEarned');
    const pendingEl=document.getElementById('refPendingRewards');
    const code=d.referral_code||'';
    if(codeEl) codeEl.textContent=code?('https://glbtoken.com/register.html?ref='+code):'—';
    if(yourCodeEl) yourCodeEl.textContent=code||'—';
    if(yourCodeEl&&yourCodeEl.setAttribute) yourCodeEl.setAttribute('data-code',code||'');
    if(countEl) countEl.textContent=d.total_referrals||0;
    if(earnEl) earnEl.textContent=(d.total_earned||0).toFixed(2);
    if(totalRefsEl) totalRefsEl.textContent=d.total_referrals||0;
    // Reward history (real, /api/referral/rewards) — lifetime earned + rows
    let lifetime=0, rewards=[];
    try{
      const rw=await safeApi('GET','/api/referral/rewards');
      if(rw){ rewards=rw.rewards||[]; lifetime=rw.total||0; }
    }catch(e){}
    if(totalEarnEl) totalEarnEl.textContent=lifetime.toFixed(0)+' GT';
    const valEl=document.getElementById('refTotalEarnedVal');
    if(valEl) valEl.textContent='↑ Value: $'+(lifetime*0.001).toFixed(2);
    if(pendingEl) pendingEl.textContent=(d.pending_earnings!=null?d.pending_earnings:(d.total_earned||0)).toFixed(0)+' GT';
    // Referrals table (recent_referrals — name/email/joined_at/reward)
    const tableBody=document.getElementById('refTableBody');
    if(tableBody){
      const refs=d.recent_referrals||[];
      if(refs.length){
        tableBody.innerHTML=refs.map(function(r){
          return '<tr><td>'+escapeHtml(r.name||'—')+'</td><td>'+escapeHtml(r.email||'—')+'</td><td class="td-date">'+(r.joined_at?fmtDTStack(r.joined_at):'<div class="td-date-strong">—</div>')+'</td><td><span class="text-success-color">● Active</span></td><td>'+(r.reward>0?(r.reward+' GT'):'—')+'</td></tr>';
        }).join('');
      }else{
        tableBody.innerHTML='<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:1.5rem">No referrals yet</td></tr>';
      }
    }
    // Reward History table (real, /api/referral/rewards — fmtDT timestamps)
    const rewardsBody=document.getElementById('refRewardsBody');
    if(rewardsBody){
      if(rewards.length){
        rewardsBody.innerHTML=rewards.map(function(r){
          return '<tr><td class="td-date">'+fmtDTStack(r.created_at)+'</td><td>Referral Reward</td><td>'+(r.amount||0)+' GT</td><td><span class="text-success-color">● Claimed</span></td></tr>';
        }).join('');
      }else{
        rewardsBody.innerHTML='<tr><td colspan="4" style="text-align:center;color:var(--text-muted);padding:1.5rem">No rewards yet</td></tr>';
      }
    }
    // Charts (real history — referrals + earnings over last 14 days)
    drawReferralCharts(d.history||[]);
}

function drawReferralCharts(history){
  var labels=history.map(function(h){ return String(h.date||'').slice(5); });
  var refData=history.map(function(h){ return h.referrals||0; });
  var earnData=history.map(function(h){ return h.earnings||0; });
  var ctx1=document.getElementById('referralsChart');
  if(ctx1&&typeof Chart!=='undefined'){
    if(window._refChartInst)window._refChartInst.destroy();
    window._refChartInst=new Chart(ctx1,{
      type:'line',
      data:{labels:labels,datasets:[{label:'Referrals',data:refData,borderColor:'#F4B400',backgroundColor:'rgba(244,180,0,0.1)',fill:true,tension:0.4,pointBackgroundColor:'#F4B400',pointBorderColor:'#F4B400'}]},
      options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{x:{grid:{color:'rgba(255,255,255,0.05)'},ticks:{color:'#6B7280',maxTicksLimit:5}},y:{grid:{color:'rgba(255,255,255,0.05)'},ticks:{color:'#6B7280',maxTicksLimit:5}}}}
    });
  }
  var ctx2=document.getElementById('earningsChart');
  if(ctx2&&typeof Chart!=='undefined'){
    if(window._earnChartInst)window._earnChartInst.destroy();
    window._earnChartInst=new Chart(ctx2,{
      type:'line',
      data:{labels:labels,datasets:[{label:'Earnings (GT)',data:earnData,borderColor:'#00D68F',backgroundColor:'rgba(0,214,143,0.1)',fill:true,tension:0.4,pointBackgroundColor:'#00D68F',pointBorderColor:'#00D68F'}]},
      options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{x:{grid:{color:'rgba(255,255,255,0.05)'},ticks:{color:'#6B7280',maxTicksLimit:5}},y:{grid:{color:'rgba(255,255,255,0.05)'},ticks:{color:'#6B7280',maxTicksLimit:5}}}}
    });
  }
}

// ── Boot: load real referral data on referral.html + referrals.html ──
(function(){
  function bootReferral(){
    if(!token) return;
    loadReferralStats();
  }
  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', bootReferral);
  } else {
    bootReferral();
  }
})();

// ── Copy + share (shared by referrals.html + referral.html) ──

function copyRefLink(){
  var el=document.getElementById('refCode');
  if(!el)return;
  navigator.clipboard.writeText(el.textContent).catch(function(){});
  var btn=el.parentElement.querySelector('button');
  if(!btn)return;
  var orig=btn.innerHTML;
  btn.classList.add('copied');
  btn.innerHTML='<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg><span class="copy-label">Copied</span>';
  setTimeout(function(){btn.innerHTML=orig;btn.classList.remove('copied');},2000);
}

function copyRefCode(btn){
  var el=document.getElementById('refYourCode');
  if(!el)return;
  var code=el.getAttribute('data-code')||el.textContent||'';
  code=code.trim();
  navigator.clipboard.writeText(code).catch(function(){});
  if(!btn)return;
  var orig=btn.innerHTML;
  btn.classList.add('copied');
  btn.innerHTML='<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
  setTimeout(function(){btn.innerHTML=orig;btn.classList.remove('copied');},2000);
}

function shareRef(platform){
  var el=document.getElementById('refCode');
  var link=(el&&el.textContent)?el.textContent:'https://glbtoken.com/register.html?ref=';
  var url=encodeURIComponent(link);
  var text=encodeURIComponent('Join me on GlbTOKEN and get access to 100+ AI models! Use my referral link:');
  var href='';
  switch(platform){
    case 'twitter': href='https://twitter.com/intent/tweet?text='+text+'&url='+url; break;
    case 'whatsapp': href='https://wa.me/?text='+text+'%20'+url; break;
    case 'telegram': href='https://t.me/share/url?url='+url+'&text='+text; break;
    case 'email': href='mailto:?subject=Join%20GlbTOKEN&body='+text+'%20'+url; break;
  }
  if(href) window.open(href,'_blank','noopener');
}
