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
    const code=d.referral_code||'';
    if(codeEl) codeEl.textContent=code?('https://glbtoken.com/register.html?ref='+code):'—';
    if(yourCodeEl) yourCodeEl.textContent=code||'—';
    if(yourCodeEl&&yourCodeEl.setAttribute) yourCodeEl.setAttribute('data-code',code||'');
    if(countEl) countEl.textContent=d.total_referrals||0;
    if(earnEl) earnEl.textContent=(d.total_earned||0).toFixed(2);
    if(totalRefsEl) totalRefsEl.textContent=d.total_referrals||0;
    if(totalEarnEl) totalEarnEl.textContent=(d.total_earned||0).toFixed(2)+' GT';
    const tableBody=document.getElementById('refTableBody');
    if(tableBody&&d.referrals&&d.referrals.length){
      tableBody.innerHTML=d.referrals.map(function(r){
        return '<tr><td>'+escapeHtml(r.email||r.name||'—')+'</td><td>'+escapeHtml(r.status||'joined')+'</td><td>'+(r.joined_at?fmtDT(r.joined_at):'—')+'</td><td class="gold">+'+(r.reward||0)+'</td></tr>';
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

