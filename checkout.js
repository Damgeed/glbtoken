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
      const d=await safeApi('POST','/api/topup',{amount:selectedAmount,currency:'USD',payment_method:selectedPayment});
      if(!d) return;
      userData.token_balance=d.new_balance;window.__secure.setItem('gt_user',JSON.stringify(userData));
      if(typeof updateBalance==='function')updateBalance();
      var hdr=document.getElementById('topupHeader');if(hdr)hdr.style.display='none';
      var step=document.getElementById('topupStep1');if(step)step.style.display='none';
      var suc=document.getElementById('topupSuccess');
      if(suc){suc.classList.remove('d-none');suc.style.display='flex';}
      var msg=document.getElementById('topupSuccessMsg');if(msg)msg.textContent=d.tokens_added.toLocaleString()+' tokens added!';
      var bal=document.getElementById('topupBalanceValue');if(bal)bal.textContent=(d.new_balance||0).toLocaleString()+' Tokens';
      showTopupSuccessPopup(d.tokens_added);
      // Redirect to dashboard overview after brief confirmation
      setTimeout(function(){ window.location.href='dashboard.html'; }, 2200);
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
