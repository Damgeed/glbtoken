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
    const hasCode=!!code;
    if(codeEl) codeEl.textContent=code?('https://glbtoken.com/register.html?ref='+code):'—';
    if(yourCodeEl){
      var cpBtn=yourCodeEl.querySelector('.code-copy-btn');  // capture BEFORE wiping children
      yourCodeEl.innerHTML='';
      yourCodeEl.appendChild(document.createTextNode(code||'—'));
      if(cpBtn) yourCodeEl.appendChild(cpBtn);
      yourCodeEl.setAttribute('data-code',code||'');
      if(cpBtn) cpBtn.style.display=hasCode?'':'none';
    }
    // Toggle no-code CTA vs share UI (both referral.html + referrals.html)
    document.querySelectorAll('#refNoCode').forEach(function(el){el.style.display=hasCode?'none':'';});
    document.querySelectorAll('.ref-link-box, .refs-link-box, .ref-share-row, .refs-share-row, .ref-share-btn-row, .refs-share-btn-row, #share-socials').forEach(function(el){el.style.display=hasCode?'':'none';});
    const monthEl=document.getElementById('refMonthChg');
    if(monthEl){
      var monthCount=(d.history||[]).reduce(function(s,h){return s+(h.referrals||0);},0);
      monthEl.textContent=monthCount>0?('↑ '+monthCount+' this month'):'No referrals yet';
    }
    const hintEl=document.getElementById('refShareHint');
    if(hintEl) hintEl.textContent=hasCode?'Share this code':'Generate to start earning';
    if(countEl) countEl.textContent=d.total_referrals||0;
    if(earnEl) earnEl.textContent=fmtUSD(d.total_earned||0);
    if(totalRefsEl) totalRefsEl.textContent=d.total_referrals||0;
    // Reward history (merged into /api/referral/stats since v1127 — single
    // request instead of serializing stats → rewards on every load)
    let lifetime=0, rewards=[];
    try{
      const rw=d.rewards||null;
      if(rw){ rewards=rw; lifetime=d.rewards_total||0; }
      else{ // fallback for stale backend: keep old path
        const r2=await safeApi('GET','/api/referral/rewards');
        if(r2){ rewards=r2.rewards||[]; lifetime=r2.total||0; }
      }
    }catch(e){}
    if(totalEarnEl) totalEarnEl.textContent=lifetime.toFixed(0)+' GT';
    const valEl=document.getElementById('refTotalEarnedVal');
    if(valEl) valEl.textContent='↑ Value: '+fmtUSD(lifetime*0.001);
    const pendingAmt=(d.pending_earnings!=null?d.pending_earnings:(d.total_earned||0));
    if(pendingEl) pendingEl.textContent=pendingAmt.toFixed(0)+' GT';
    const claimBtn=document.getElementById('refClaimBtn');
    if(claimBtn) claimBtn.style.display=(pendingAmt>=1.0)?'':'none';
    // Claim threshold progress (P0-3): show how close to the 1 GT minimum
    const thrWrap=document.getElementById('refThresholdWrap');
    const thrFill=document.getElementById('refThresholdFill');
    const thrTxt=document.getElementById('refThresholdTxt');
    if(thrWrap&&thrFill&&thrTxt){
      var threshold=(d.claim_threshold!=null?d.claim_threshold:1.0);
      if(pendingAmt>=threshold){
        thrWrap.style.display='';
        thrFill.style.width='100%';
        thrTxt.textContent='Ready to claim!';
      }else if(pendingAmt>0){
        thrWrap.style.display='';
        thrFill.style.width=Math.min(100,Math.round(100*pendingAmt/threshold))+'%';
        thrTxt.textContent='Earn '+(threshold-pendingAmt).toFixed(1)+' more GT to reach the '+threshold.toFixed(1)+' GT claim minimum';
      }else{
        thrWrap.style.display='none';
      }
    }
    // Top channels (P1-4): which share source drove the most signups
    const srcCard=document.getElementById('refSourcesCard');
    const srcBody=document.getElementById('refSourcesBody');
    if(srcCard&&srcBody){
      var sources=d.sources||[];
      if(sources.length){
        srcCard.style.display='';
        srcBody.innerHTML=sources.map(function(s){
          var label=s.source.charAt(0).toUpperCase()+s.source.slice(1);
          return '<div class="refs-source-row"><div class="refs-source-name">'+escapeHtml(label)+'</div>'+
            '<div class="refs-source-bar"><div class="refs-source-fill" style="width:'+s.pct+'%"></div></div>'+
            '<div class="refs-source-count">'+s.count+' · '+s.pct+'%</div></div>';
        }).join('');
      }else{
        srcCard.style.display='none';
      }
    }
    // Conversion funnel (v1131): invited → consumed → rewarded, with idle risk
    const funnelCard=document.getElementById('refFunnelCard');
    const funnelBody=document.getElementById('refFunnelBody');
    if(funnelCard&&funnelBody){
      var f=d.funnel||{};
      var total=f.total||0;
      if(total>0){
        funnelCard.style.display='';
        var activeN=f.active||0, rewardedN=f.rewarded||0, pendingN=f.pending||0, idleN=f.idle||0;
        var consumedN=activeN+rewardedN;
        function pct(n){ return Math.round(100*n/total); }
        function row(label,n,sub,barCls){
          return '<div class="refs-funnel-row"><div class="refs-funnel-label">'+label+'<span class="refs-funnel-sub">'+sub+'</span></div>'+
            '<div class="refs-funnel-bar"><div class="refs-funnel-fill '+barCls+'" style="width:'+pct(n)+'%"></div></div>'+
            '<div class="refs-funnel-count">'+n+' <em>'+pct(n)+'%</em></div></div>';
        }
        var convPct = total>0 ? Math.round(100*consumedN/total) : 0;
        funnelBody.innerHTML =
          row('Invited', total, 'signed up via your link', 'f-teal') +
          row('Activated', consumedN, 'made first paid call', 'f-gold') +
          row('Rewarded', rewardedN, 'earned you GT', 'f-green') +
          '<div class="refs-funnel-note">'+
            (pendingN>0 ? '<span class="refs-funnel-chip ch-pending">'+pendingN+' pending</span> ' : '')+
            (idleN>0 ? '<span class="refs-funnel-chip ch-idle">'+idleN+' idle 30d+</span> ' : '')+
            '<span class="refs-funnel-conv"><strong>'+convPct+'%</strong> activation rate</span>'+
          '</div>';
      }else{
        funnelCard.style.display='none';
      }
    }
    // Referrals table (recent_referrals — name/email/joined_at/reward + status)
    const tableBody=document.getElementById('refTableBody');
    if(tableBody){
      const refs=d.recent_referrals||[];
      if(refs.length){
        renderTableWithCollapse('refTableBody', refs.map(function(r){
          var st=r.status||'pending';
          var stLabel=st.charAt(0).toUpperCase()+st.slice(1);
          var stCls='refs-st-'+st;
          return '<tr><td>'+escapeHtml(r.name||'—')+'</td><td>'+escapeHtml(r.email||'—')+'</td><td class="td-date">'+(r.joined_at?fmtDTStack(r.joined_at):'<div class="td-date-strong">—</div>')+'</td><td><span class="refs-status-badge '+stCls+'">'+stLabel+'</span></td><td>'+(r.reward>0?(r.reward+' GT'):'—')+'</td></tr>';
        }), 'refCollapse', 'refMoreBtn');
      }else{
        clearTableCollapse('refCollapse','refMoreBtn');
        tableBody.innerHTML='<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:1.5rem">No referrals yet</td></tr>';
      }
    }
    // Reward History table (real, /api/referral/rewards — fmtDT timestamps)
    const rewardsBody=document.getElementById('refRewardsBody');
    if(rewardsBody){
      if(rewards.length){
        renderTableWithCollapse('refRewardsBody', rewards.map(function(r){
          return '<tr><td class="td-date">'+fmtDTStack(r.created_at)+'</td><td>Referral Reward</td><td>'+(r.amount||0)+' GT</td><td><span class="text-success-color">● Claimed</span></td></tr>';
        }), 'refRewardsCollapse', 'refRewardsMoreBtn');
      }else{
        clearTableCollapse('refRewardsCollapse','refRewardsMoreBtn');
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

// ── Generate code (POST /api/referral/code) ──
async function generateRefCode(){
  if(!token) return;
  var btn=document.querySelector('.ref-generate-btn');
  if(btn){ btn.disabled=true; btn.innerHTML='<span class="btn-spinner"></span> Generating…'; }
  var d=await safeApi('POST','/api/referral/code',null,25000);
  if(btn){ btn.disabled=false; btn.innerHTML='Generate My Referral Code'; }
  if(d&&d.referral_code){
    showToast('Referral code created: '+d.referral_code,'success');
    loadReferralStats();
  }
}

// ── Claim rewards (POST /api/referral/claim) ──
async function claimRefRewards(){
  if(!token) return;
  var btn=document.getElementById('refClaimBtn');
  if(btn){ btn.disabled=true; btn.innerHTML='<span class="btn-spinner"></span> Claiming…'; }
  var d=await safeApi('POST','/api/referral/claim',null,25000);
  if(btn){ btn.disabled=false; btn.innerHTML='Claim Rewards'; }
  if(d&&d.status==='claimed'){
    showToast('Claimed '+d.amount+' GT → balance '+d.new_balance+' GT','success');
    loadReferralStats();
  }
}

// ── Boot: load real referral data on referral.html + referrals.html ──
(function(){
  function bootReferral(){
    if(!token) return;
    loadReferralStats();
  }
  function bootWithRetry(attempt){
    // Token can be empty on load while shared.js silently restores the session
    // (refresh_token → new access token). Retry briefly so the referral UI
    // (Generate button, stats, tables) appears even after an expired access token.
    if(token){ bootReferral(); return; }
    if(attempt >= 6) return;  // give up after ~3s — api() will 401→refresh on demand
    setTimeout(function(){ bootWithRetry(attempt + 1); }, 500);
  }
  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', function(){ bootWithRetry(0); });
  } else {
    bootWithRetry(0);
  }
  // Show native "More…" share button only when Web Share API is available
  if(navigator.share){
    var nb = document.getElementById('nativeShareBtn');
    if(nb) nb.style.display = '';
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
  btn.innerHTML='<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#000000" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg><span class="copy-label">Copied</span>';
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
  var base=(el&&el.textContent)?el.textContent:'https://glbtoken.com/register.html?ref=';
  var link=base+(base.indexOf('?')>=0?'&':'?')+'src='+platform;
  var rewardTxt='Get free tokens and access to 100+ AI models!';
  // Try native Web Share API first on mobile (much higher conversion than a new tab)
  if(platform==='native' && navigator.share){
    navigator.share({title:'GlbTOKEN', text:rewardTxt+' Use my referral link:', url:link})
      .catch(function(){});
    return;
  }
  var url=encodeURIComponent(link);
  var text=encodeURIComponent(rewardTxt+' Use my referral link:');
  var href='';
  switch(platform){
    case 'twitter': href='https://twitter.com/intent/tweet?text='+text+'&url='+url; break;
    case 'whatsapp': href='https://wa.me/?text='+text+'%20'+url; break;
    case 'telegram': href='https://t.me/share/url?url='+url+'&text='+text; break;
    case 'email': href='mailto:?subject=Join%20Me%20on%20GlbTOKEN&body='+text+'%20'+url; break;
    case 'facebook': href='https://www.facebook.com/sharer/sharer.php?u='+url; break;
    case 'linkedin': href='https://www.linkedin.com/sharing/share-offsite/?url='+url; break;
  }
  if(href) window.open(href,'_blank','noopener');
}
