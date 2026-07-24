/* ══════════════════════════════════════════
   ORGS / TEAM
   ══════════════════════════════════════════ */

async function loadOrgs() {
  if(!token)return;
  const d=await safeApi('GET','/api/orgs');
  if(!d) return;
  const selector=document.getElementById('orgSelector');
  if(!selector)return;
  const orgs=d.orgs||d||[];
  if(!orgs.length){
    return;
  }
  selector.innerHTML='<option value="">Select organization</option>'+orgs.map(function(o){return '<option value="'+escapeHtml(String(o.id))+'">'+escapeHtml(o.name||'Org '+o.id)+'</option>';}).join('');
  if(orgs.length===1){selector.value=orgs[0].id;switchOrg(orgs[0].id)}
}

async function switchOrg(orgId) {
  if(!orgId){document.getElementById('orgDetails').innerHTML='<div class="empty-state"><div class="empty-icon">🏢</div><div class="empty-title">Select an organization</div></div>';return}
  await loadOrgDetails(orgId);
}

async function loadOrgDetails(orgId) {
  if(!token||!orgId)return;
  const d=await safeApi('GET','/api/orgs/'+orgId);
  if(!d) return;
  const container=document.getElementById('orgDetails');
  if(!container)return;
  if(d.error){container.innerHTML='<p style="color:var(--destructive);text-align:center;padding:1rem">'+escapeHtml(d.error)+'</p>';return}
  let html='<div class="org-header"><h3>'+escapeHtml(d.name||'Organization')+'</h3><span style="color:var(--text-muted);font-size:0.85rem">'+(d.member_count||0)+' members</span></div>';
  html+='<div class="member-list">';
  if(d.members&&d.members.length){
    d.members.forEach(function(m){
      const roleCls=m.role==='owner'?'badge-role-owner':m.role==='admin'?'badge-role-admin':'badge-role-member';
      html+='<div class="member-row"><span class="member-avatar">'+(m.name?m.name[0].toUpperCase():'?')+'</span><span class="member-name">'+escapeHtml(m.name||m.email||'User')+'</span><span class="role-badge '+roleCls+'">'+escapeHtml(m.role||'member')+'</span></div>';
    });
  }else{
    html+='<p style="color:var(--text-muted);text-align:center;padding:1rem;font-size:0.85rem">No members found</p>';
  }
  html+='</div>';
  container.innerHTML=html;
}

async function createOrg() {
  if(!token){showToast('Please sign in','error');return}
  const nameEl=document.getElementById('orgNameInput');
  if(!nameEl||!nameEl.value.trim()){showToast('Enter an organization name','error');return}
  const d=await safeApi('POST','/api/orgs',{name:nameEl.value.trim()});
  if(!d) return;
  nameEl.value='';
  document.getElementById('createOrgModal').classList.remove('open');
  loadOrgs();
  showToast('Organization created!','success');
}

async function inviteMember(orgId) {
  if(!token||!orgId){showToast('Select an organization first','error');return}
  const emailEl=document.getElementById('inviteEmail');
  const roleEl=document.getElementById('inviteRole');
  if(!emailEl||!emailEl.value.trim()){showToast('Enter an email address','error');return}
  await safeApi('POST','/api/orgs/'+orgId+'/invite',{email:emailEl.value.trim(),role:roleEl?roleEl.value:'member'});
  emailEl.value='';
  showToast('Invitation sent!','success');
  loadOrgDetails(orgId);
}

async function updateMemberRole(orgId, userId, role) {
  if(!token)return;
  await safeApi('PUT','/api/orgs/'+orgId+'/members/'+userId+'/role',{role:role});
  loadOrgDetails(orgId);
  showToast('Member role updated','success');
}

async function removeMember(orgId, userId) {
  if(!token)return;
  showConfirm('Remove member?','This action cannot be undone.',async function(){
    await safeApi('DELETE','/api/orgs/'+orgId+'/members/'+userId);
    loadOrgDetails(orgId);
    showToast('Member removed','info');
  });
}

async function leaveOrg(orgId) {
  if(!token||!orgId)return;
  showConfirm('Leave organization?','You will lose access to this organization.',async function(){
    const d=await safeApi('DELETE','/api/orgs/'+orgId+'/members/me');
    if(!d) return;
    loadOrgs();
    document.getElementById('orgDetails').innerHTML='<div class="empty-state"><div class="empty-icon">👋</div><div class="empty-title">You left the organization</div></div>';
    showToast('Left organization','info');
  });
}

async function joinOrg(inviteToken) {
  if(!token){showToast('Please sign in','error');return}
  const d=await safeApi('POST','/api/orgs/join',{invite_token:inviteToken});
  if(!d) return;
  loadOrgs();
  showToast('Joined organization!','success');
}

