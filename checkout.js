/* ══════════════════════════════════════════
   CHECKOUT — Buy tokens, top-up, payment modal
   Shared by pricing.html and topup.html
   NOTE: selectedAmount/selectedPayment are declared
   in shared.js (global let) — do NOT redeclare here.
   ══════════════════════════════════════════ */

    function updateCustomPricing(){
      var slider=document.getElementById('customSlider');
      if(!slider)return;
      var val=parseInt(slider.value)||50;
      var el1=document.getElementById('customPriceLabel')||document.getElementById('customPriceDisplay');
      var el2=document.getElementById('customTokensLabel')||document.getElementById('customTokensDisplay');
      var el3=document.getElementById('customBuyBtn');
      var el4=document.getElementById('topupTotal');
      if(el1)el1.textContent='$'+val;
      if(el2)el2.textContent=(val*1100).toLocaleString()+' Tokens';
      if(el3)el3.textContent='Buy $'+val;
      if(el4)el4.textContent='$'+val+'.00';
      selectedAmount=val;
    }
    function customCheckout(){
      const amt=parseInt(document.getElementById('customSlider').value||2);
      if(amt<2){showToast('Minimum $2','error');return}
      if(!token){showPage('register');return}
      selectedAmount=amt;showPage('topup');
    }
    function selectPackage(el,amount){
      document.querySelectorAll('.pricing-card').forEach(c=>c.classList.remove('selected'));
      el.classList.add('selected');
      selectedAmount=amount;
      document.getElementById('topupTotal').textContent='$'+amount.toFixed(2);
    }
    function selectCustomTopup(){
      document.querySelectorAll('.pricing-card').forEach(c=>c.classList.remove('selected'));
      var card=document.getElementById('customCard');card.classList.add('selected');
      updateCustomPricing();
    }
    function selectPayment(el,method){
      document.querySelectorAll('.payment-opt,.payment-card').forEach(p=>p.classList.remove('selected'));
      el.classList.add('selected');selectedPayment=method;
    }
    async function processTopup(){
      if(!token){showToast('Please login first','error');return}
      const method=(selectedPayment||'stripe').toLowerCase();
      const payload={amount:selectedAmount,currency:'USD',payment_method:method,email:userData.email||''};
      // SECURITY: tokens are only credited after a REAL payment (webhook/verify).
      // The direct /api/topup credit endpoint now requires a verified payment ref.
      if(method==='stripe'){
        const d=await safeApi('POST','/api/payments/stripe/create-checkout',payload);
        if(d&&d.url){ window.location.href=d.url; }
        return;
      }
      if(method==='paystack'){
        const d=await safeApi('POST','/api/payments/paystack/initialize',payload);
        if(d&&d.authorization_url){ window.location.href=d.authorization_url; }
        return;
      }
      if(method==='crypto'){
        const d=await safeApi('POST','/api/payments/crypto/create',{amount:selectedAmount,currency:'USDT_TRC20',payment_method:'USDT_TRC20'});
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
        +'<h3 style="color:'+textClr+';font-size:1.05rem;font-weight:700;margin:0 0 0.75rem">Send Crypto</h3>'
        +'<p style="color:'+muted+';font-size:0.85rem;margin:0 0 1rem;line-height:1.5">Send exactly <strong style="color:'+textClr+'">'+d.crypto_amount+' '+d.asset+'</strong> to the address below. Tokens are credited after confirmation.</p>'
        +'<div style="background:rgba(244,180,0,0.08);border:1px solid '+border+';border-radius:10px;padding:0.75rem;margin-bottom:0.5rem;word-break:break-all;font-size:0.8rem;color:'+textClr+'">'+escapeHtml(d.address)+'</div>'
        +'<p style="color:'+muted+';font-size:0.75rem;margin:0 0 1rem">Ref: <span style="color:'+textClr+'">'+escapeHtml(d.reference)+'</span></p>'
        +'<button id="cryptoConfirmBtn" style="width:100%;padding:0.65rem;border-radius:10px;border:none;background:#F4B400;color:#0A0B14;font-size:0.85rem;font-weight:600;cursor:pointer">I\'ve sent it — Credit my account</button>'
        +'<button id="cryptoCancelBtn" style="width:100%;margin-top:0.5rem;padding:0.6rem;border-radius:10px;border:1px solid '+border+';background:transparent;color:'+muted+';font-size:0.82rem;cursor:pointer">Cancel</button>'
        +'</div>';
      document.body.appendChild(m);
      m.querySelector('#cryptoConfirmBtn').onclick=async function(){
        m.querySelector('#cryptoConfirmBtn').disabled=true;m.querySelector('#cryptoConfirmBtn').textContent='Confirming...';
        const r=await safeApi('POST','/api/topup',{amount:d.usd_amount,currency:'USDT_TRC20',payment_method:'crypto',payment_ref:d.reference});
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
      document.getElementById('modalAmount').textContent='$'+selectedAmount.toFixed(2);
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
