/* ══════════════════════════════════════════
   CHECKOUT — Buy tokens, top-up, payment modal
   Shared by pricing.html and topup.html
   NOTE: selectedAmount/selectedPayment are declared
   in shared.js (global let) — do NOT redeclare here.
   ══════════════════════════════════════════ */

    // Redirect to a server-provided checkout URL only when it is a real http(s)
    // link — blocks javascript:/data:/vbscript: URLs a compromised/misconfigured
    // API response could return (open-redirect / phish vector).
    function safeRedirect(u){
      try{
        var p = new URL(String(u||''), window.location.href);
        if(p.protocol === 'https:' || p.protocol === 'http:'){ window.location.href = p.href; return true; }
      }catch(e){}
      if(typeof showToast === 'function') showToast(t('Payment link unavailable — please try again'),'error');
      return false;
    }

    function updateCustomPricing(){
      var slider=document.getElementById('customSlider');
      if(!slider)return;
      var val=parseInt(slider.value)||50;
      var el1=document.getElementById('customPriceLabel')||document.getElementById('customPriceDisplay');
      var el2=document.getElementById('customTokensLabel')||document.getElementById('customTokensDisplay');
      var el3=document.getElementById('customBuyBtn');
      var el4=document.getElementById('topupTotal');
      if(el1)el1.textContent=fmtUSD(val);
      if(el2)el2.textContent=(val*1000).toLocaleString()+' Tokens';
      if(el3)el3.textContent='Buy '+fmtUSD(val);
      if(el4)el4.textContent=fmtUSD(val);
      selectedAmount=val;
    }
    function customCheckout(){
      const amt=parseInt(document.getElementById('customSlider').value||2);
      if(amt<2){showToast('Minimum $2','error');return}
      if(!token){showPage('register');return}
      selectedAmount=amt;showPage('topup');
    }
    function selectPayment(el,method){
      document.querySelectorAll('.payment-opt,.payment-card').forEach(function(card){
        card.classList.remove('selected');
        if(card.hasAttribute('aria-pressed')) card.setAttribute('aria-pressed','false');
      });
      el.classList.add('selected');
      if(el.hasAttribute('aria-pressed')) el.setAttribute('aria-pressed','true');
      selectedPayment=method;
      var row=document.getElementById('cryptoAssetRow');
      if(row){ row.style.display = (method==='crypto') ? 'block' : 'none'; }
      if(method==='crypto') loadCryptoAssets();
    }
    // ── Crypto assets from backend (/api/payments/crypto/addresses) ──
    var _cryptoAssetsLoaded = false;
    async function loadCryptoAssets(){
      var sel=document.getElementById('cryptoAssetSelect');
      if(!sel) return;
      if(_cryptoAssetsLoaded) return;
      try{
        var d=await safeApi('GET','/api/payments/crypto/addresses',null,null,true);
        var assets=(d&&d.addresses)||[];
        if(!assets.length) return;
        _cryptoAssetsLoaded=true;
        sel.innerHTML=assets.map(function(a){
          var label=String(a.asset||'').replace(/_/g,' ');
          return '<option value="'+escapeAttr(a.asset)+'">'+escapeHtml(label)+'</option>';
        }).join('');
        var hint=document.getElementById('cryptoAssetHint');
        if(hint&&assets.length>1) hint.textContent=t('Select the network you want to pay with.');
      }catch(e){ /* fall back to default USDT_TRC20 */ }
    }
    function onCryptoAssetChange(sel){
      var hint=document.getElementById('cryptoAssetHint');
      if(hint) hint.textContent=t('Selected: ')+String(sel.value||'').replace(/_/g,' ');
    }
    async function processTopup(){
      if(!token){showToast('Please login first','error');return}
      const method=(selectedPayment||'stripe').toLowerCase();
      const payload={amount:selectedAmount,currency:'USD',payment_method:method,email:userData.email||''};
      // Stash the pending top-up so the payment redirect (back to topup.html)
      // can auto-verify via /api/topup and show the success card.
      try{ sessionStorage.setItem('gt_pending_topup', JSON.stringify({amount:selectedAmount, method:method})); }catch(e){}
      // SECURITY: tokens are only credited after a REAL payment (webhook/verify).
      // The direct /api/topup credit endpoint now requires a verified payment ref.
      if(method==='stripe'){
        const d=await safeApi('POST','/api/payments/stripe/create-checkout',payload);
        if(d&&d.url){ safeRedirect(d.url); }
        return;
      }
      if(method==='paystack'){
        const d=await safeApi('POST','/api/payments/paystack/initialize',payload);
        if(d&&d.authorization_url){ safeRedirect(d.authorization_url); }
        return;
      }
      if(method==='crypto'){
        var assetSel=document.getElementById('cryptoAssetSelect');
        var asset=assetSel?assetSel.value:'USDT_TRC20';
        const d=await safeApi('POST','/api/payments/crypto/create',{amount:selectedAmount,currency:asset,payment_method:asset});
        if(d&&d.address) showCryptoInstructions(d);
        return;
      }
      showToast('Select a supported payment method','error');
    }
    function showCryptoInstructions(d){
      var existing=document.getElementById('cryptoModal');
      if(existing)existing.remove();
      var m=document.createElement('div');
      m.id='cryptoModal';
      m.style.cssText='position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.6);animation:fadeIn 0.15s ease';
      var isDark=document.documentElement.className==='dark';
      var cardBg=isDark?'#1e1f29':'#ffffff', textClr=isDark?'#f8f8f2':'#1a1a2e', muted=isDark?'#6272a4':'#666', border=isDark?'#3a3a4e':'#ddd';
      m.innerHTML='<div style="background:'+cardBg+';border:1px solid '+border+';border-radius:16px;padding:1.75rem;max-width:400px;width:92%;box-shadow:0 16px 48px rgba(0,0,0,0.3);animation:slideUp 0.2s ease">'
        +'<h3 style="color:'+textClr+';font-size:1.05rem;font-weight:700;margin:0 0 0.75rem">'+t('Send Crypto')+'</h3>'
        +'<p style="color:'+muted+';font-size:0.85rem;margin:0 0 1rem;line-height:1.5">'+t('Send exactly ')+'<strong style="color:'+textClr+'">'+escapeHtml(d.crypto_amount)+' '+escapeHtml(d.asset)+'</strong>'+t(' to the address below. Tokens are credited after confirmation.')+'</p>'
        +'<div style="background:var(--primary-subtle);border:1px solid '+border+';border-radius:10px;padding:0.75rem;margin-bottom:0.5rem;word-break:break-all;font-size:0.8rem;color:'+textClr+'" id="cryptoAddr">'+escapeHtml(d.address)+'</div>'
        +'<button id="cryptoCopyBtn" style="width:100%;margin-bottom:0.5rem;padding:0.55rem;border-radius:10px;border:1px solid '+border+';background:transparent;color:'+textClr+';font-size:0.8rem;cursor:pointer">'+t('📋 Copy address')+'</button>'
        +'<p style="color:'+muted+';font-size:0.75rem;margin:0 0 1rem">'+t('Ref: ')+'<span style="color:'+textClr+'">'+escapeHtml(d.reference)+'</span></p>'
        +'<button id="cryptoConfirmBtn" style="width:100%;padding:0.65rem;border-radius:10px;border:none;background:var(--primary);color:#0A0B14;font-size:0.85rem;font-weight:600;cursor:pointer">'+t("I've sent it — Credit my account")+'</button>'
        +'<button id="cryptoCancelBtn" style="width:100%;margin-top:0.5rem;padding:0.6rem;border-radius:10px;border:1px solid '+border+';background:transparent;color:'+muted+';font-size:0.82rem;cursor:pointer">'+t('Cancel')+'</button>'
        +'</div>';
      document.body.appendChild(m);
      m.querySelector('#cryptoCopyBtn').onclick=function(){
        var addr=document.getElementById('cryptoAddr');
        var text=addr?addr.textContent:d.address;
        function done(){ var b=m.querySelector('#cryptoCopyBtn'); if(b){b.textContent=t('✔ Copied'); setTimeout(function(){b.textContent=t('📋 Copy address');},1800);} showToast(t('Address copied'),'success'); }
        if(navigator.clipboard&&navigator.clipboard.writeText){ navigator.clipboard.writeText(text).then(done).catch(done); }
        else { done(); }
      };
      m.querySelector('#cryptoConfirmBtn').onclick=async function(){
        m.querySelector('#cryptoConfirmBtn').disabled=true;m.querySelector('#cryptoConfirmBtn').textContent=t('Confirming...');
        const r=await safeApi('POST','/api/topup',{amount:d.usd_amount,currency:d.asset||'USDT_TRC20',payment_method:'crypto',payment_ref:d.reference});
        if(r&&r.status==='success'){
          m.remove();
          if(typeof showTopupSuccessPopup==='function') showTopupSuccessPopup(r.tokens_added);
          if(typeof updateBalance==='function')updateBalance();
          setTimeout(function(){ window.location.href='dashboard.html'; }, 2500);
        } else {
          m.querySelector('#cryptoConfirmBtn').disabled=false;m.querySelector('#cryptoConfirmBtn').textContent='I\'ve sent it — Credit my account';
        }
      };
      m.querySelector('#cryptoCancelBtn').onclick=function(){ m.remove(); };
    }
    function showTopupSuccessPopup(tokensAdded){
      var pop=document.getElementById('topupSuccessPopup');
      if(!pop)return;
      var msg=document.getElementById('topupPopupMsg');
      if(msg&&tokensAdded)msg.textContent=tokensAdded.toLocaleString()+' tokens added to your wallet.';
      pop.classList.add('open');
    }
    function showPaymentModal(amount){
      if(!token){showToast('Please login first','error');showPage('register');return}
      selectedAmount=amount==='custom'?parseInt(document.getElementById('customSlider').value||50):amount;
      document.getElementById('modalAmount').textContent=fmtUSD(selectedAmount);
      document.getElementById('paymentModal').classList.add('open');
    }
    function closePaymentModal(e){
      if(e&&e.target!==e.currentTarget)return;
      document.getElementById('paymentModal').classList.remove('open');
    }
    function processModalPayment(){
      if(!selectedPayment){showToast('Select a payment method','error');return}
      document.getElementById('paymentModal').classList.remove('open');
      processTopup();
    }
    function startCheckout(amount){
      if(!token){showPage('register');return}
      selectedAmount=amount;showPage('topup');
    }

    // ── Hide unavailable payment rails (e.g. Paystack when unconfigured) ──
    // Backend /api/config/payments reports which rails are wired; hide any
    // card whose rail is missing so users never get stuck on a 400.
    async function applyPaymentAvailability(){
      try{
        var cfg = await safeApi('GET','/api/config/payments',null,null,true);
        if(!cfg) return;
        var rails = ['stripe','paystack','crypto'];
        for(var i=0;i<rails.length;i++){
          if(cfg[rails[i]] === false){
            document.querySelectorAll('[onclick*="\''+rails[i]+'\'"]').forEach(function(el){
              var card = el.closest('.payment-card, .payment-opt');
              if(card) card.style.display='none';
            });
            if((typeof selectedPayment!=='undefined' && selectedPayment===rails[i]) || !selectedPayment){
              var first = document.querySelector('[onclick*="\'stripe\'"],[onclick*="\'crypto\'"]:not([style*="display: none"])');
              var alt = document.querySelector('.payment-card:not([style*="display: none"]), .payment-opt:not([style*="display: none"])');
              var fallback = first || alt;
              if(fallback && typeof selectPayment==='function') selectPayment(fallback, fallback.getAttribute('onclick').match(/'([a-z]+)'/)[1]);
            }
          }
        }
      }catch(e){ /* non-fatal */ }
    }
    if(document.readyState==='loading'){ document.addEventListener('DOMContentLoaded', applyPaymentAvailability); }
    else { applyPaymentAvailability(); }
