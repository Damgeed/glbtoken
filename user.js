/* ══════════════════════════════════════════
   USER — Profile, logout, contact
   ══════════════════════════════════════════ */
    function logoutUser(){
      // Show confirmation dialog instead of immediate logout
      showConfirm('Sign out?','Are you sure you want to sign out?',function(){
        token='';userData={};
        localStorage.removeItem('gt_token');localStorage.removeItem('gt_user');
        localStorage.removeItem('gt_newapi_token');localStorage.removeItem('gt_newapi_endpoint');
        localStorage.removeItem('gt_keys');
        applyAuth();
        window.location.href='/';
      });
    }
    // ── Contact Form ──
    async function sendContact(){
      var contactName=document.getElementById('contactName');
      var email=document.getElementById('contactEmail');
      var msg=document.getElementById('contactMsg');
      if(!contactName||!email||!msg){showToast('Contact form not found','error');return}
      var n=contactName.value.trim(), e=email.value.trim(), m=msg.value.trim();
      if(!n){showToast('Please enter your name','error');contactName.focus();return}
      if(!e||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)){showToast('Please enter a valid email','error');email.focus();return}
      if(!m||m.length<10){showToast('Message must be at least 10 characters','error');msg.focus();return}
      var btn=document.querySelector('.info-card button.btn-primary');
      setBtnLoading(btn, true, 'Sending');
      try {
        await safeApi('POST','/api/contact',{name:n,email:e,message:m});
        showToast('Message sent successfully','success');
      } finally {
        if(btn){btn.disabled=false;btn.textContent='Send Message'}
      }
    }
    async function refreshMe(){
      if(!token)return;
      const d=await safeApi('GET','/api/auth/me',null,null,true); if(!d)return;
      userData=d;localStorage.setItem('gt_user',JSON.stringify(d));applyAuth();
    }

    // ── Settings Profile ──
    async function loadProfile(){
      if(!token)return;
      const d=await safeApi('GET','/api/user/profile',null,null,true); if(!d)return;
      var nameInp=document.getElementById('settingsName');
      var emailInp=document.getElementById('settingsEmail');
      var tzInp=document.getElementById('settingsTz');
      if(nameInp) nameInp.value=d.name||userData.name||'User';
      if(emailInp) emailInp.value=d.email||userData.email||'';
      if(tzInp&&d.timezone) tzInp.value=d.timezone;
    }
    async function saveProfile(){
      if(!token){showToast('Please sign in first','error');return}
      var settingsName=document.getElementById('settingsName');
      var tz=document.getElementById('settingsTz');
      if(!settingsName){showToast('Settings form not found','error');return}
      await safeApi('PUT','/api/user/profile',{name:settingsName.value.trim(),timezone:tz?tz.value:''});
      userData.name=settingsName.value.trim();
      localStorage.setItem('gt_user',JSON.stringify(userData));
      applyAuth();
      showToast('Profile saved','success');
    }
    async function updatePassword(){
      if(!token){showToast('Please sign in first','error');return}
      var cur=document.getElementById('settingsCurPw');
      var nw=document.getElementById('settingsNewPw');
      if(!cur||!nw||!cur.value||!nw.value){showToast('Fill in both password fields','error');return}
      if(nw.value.length<6){showToast('New password must be at least 6 characters','error');return}
      await safeApi('PUT','/api/user/password',{current_password:cur.value,new_password:nw.value});
      cur.value='';nw.value='';
      showToast('Password updated','success');
    }
    // ── Notification Settings ──
    async function loadSettings(){
      if(!token)return;
      const d=await safeApi('GET','/api/user/settings',null,null,true); if(!d)return;
      var el=document.getElementById('notifEmail');
      if(el&&typeof d.email_notifications==='boolean') el.checked=d.email_notifications;
      var el2=document.getElementById('notifLowBalance');
      if(el2&&typeof d.low_balance_alert==='boolean') el2.checked=d.low_balance_alert;
      var el3=document.getElementById('notifLogin');
      if(el3&&typeof d.login_alerts==='boolean') el3.checked=d.login_alerts;
    }
    async function saveNotificationSettings(){
      if(!token){showToast('Please sign in first','error');return}
      var emailEl=document.getElementById('notifEmail');
      var balEl=document.getElementById('notifLowBalance');
      var loginEl=document.getElementById('notifLogin');
      if(!emailEl){showToast('Settings form not found','error');return}
      await safeApi('PUT','/api/user/settings',{
        email_notifications:emailEl.checked,
        low_balance_alert:balEl?balEl.checked:false,
        login_alerts:loginEl?loginEl.checked:false
      });
      showToast('Notification preferences saved','success');
    }
    // ── History / Transactions ──

