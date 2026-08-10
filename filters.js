/* ══════════════════════════════════════════
   FILTERS — Saved filters, spending alerts, heatmap
   ══════════════════════════════════════════ */

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
      // filters.js only loads on usage.html — load the transaction feed here
      const pageId = location.pathname.split('/').pop().replace('.html','') || 'home';
      if(pageId==='usage'&&token)loadTx();
    })();




    // ── Transactions ──
    function txDepositRow(t){
      var st = String(t.status||'completed').toLowerCase();
      var stLabel = st.charAt(0).toUpperCase() + st.slice(1);
      var stCls = (st==='completed'||st==='success') ? 'status-paid' : 'status-'+st.replace(/[^a-z0-9_-]/gi,'');
      if(st==='success') stLabel = 'Paid';
      var stHtml = '<span class="status-badge '+stCls+'">'+escapeHtml(stLabel)+'</span>';
      return '<tr><td class="td-date">'+(t.created_at?fmtDTStack(t.created_at):'<div class="td-date-strong">—</div>')+'</td><td class="amount gold">'+escapeHtml(fmtUSD(t.amount))+'</td><td>'+escapeHtml(t.payment_method||'-')+'</td><td class="amount gold">+'+escapeHtml(String(t.tokens||0))+'</td><td class="tx-td-center">'+stHtml+'</td></tr>';
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
      if(token){refreshMe();applyAuth()}
    });
    // Parse URL error param (from Auth0 callback failure redirect)
    (function(){
      const params = new URLSearchParams(window.location.search);
      const err = params.get('error');
      if(err) { try { showToast(decodeURIComponent(err), 'error'); } catch(e) { showToast('Login error', 'error'); } }
    })();

