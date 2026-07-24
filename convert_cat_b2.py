#!/usr/bin/env python3
"""Convert remaining Category B functions to safeApi pattern."""
with open('/Users/openclaw_007/projects/glbtoken/script.js', 'r') as f:
    text = f.read()

# loadActivity: remove try{/catch block around the api call
old1 = '      var act=await safeApi(\'GET\',\'/api/activity\',null,null,true); if(!act){\n        var items=act.items||[];'
new1 = '      var act=await safeApi(\'GET\',\'/api/activity\',null,null,true); if(!act)return;\n      var items=act.items||[];'

# Remove the catch block for loadActivity
old_catch_load_activity = '''      }catch(e){
        if(countEl)countEl.textContent='0 events';
        container.innerHTML='<div class="empty-state" style="padding:1.5rem 1rem"><div class="empty-icon" style="font-size:2rem;opacity:0.35">⚠</div><div class="empty-title" style="font-size:0.85rem">Failed to load activity</div></div>';
      }'''

# For toggleLogContent - convert the inner try/catch
old_tc = '''    async function toggleLogContent(el,expandId){
      var expand=document.getElementById(expandId);
      if(!expand||expand.style.display==='block'){
        if(expand)expand.style.display='none';
        var arrow=el.querySelector('span:last-child');
        if(arrow)arrow.textContent='▶';
        return;
      }
      expand.style.display='block';
      var arrow=el.querySelector('span:last-child');
      if(arrow)arrow.textContent='▼';
      if(expand.getAttribute('data-loaded'))return;
      expand.setAttribute('data-loaded','1');
      try{
        var content=await api('GET','/api/logs/content?log_id='+logId);'''

new_tc = '''    async function toggleLogContent(el,expandId){
      var expand=document.getElementById(expandId);
      if(!expand||expand.style.display==='block'){
        if(expand)expand.style.display='none';
        var arrow=el.querySelector('span:last-child');
        if(arrow)arrow.textContent='▶';
        return;
      }
      expand.style.display='block';
      var arrow=el.querySelector('span:last-child');
      if(arrow)arrow.textContent='▼';
      if(expand.getAttribute('data-loaded'))return;
      expand.setAttribute('data-loaded','1');
      var content=await safeApi('GET','/api/logs/content?log_id='+logId,null,null,true); if(!content){expand.innerHTML='<p style="color:var(--text-muted);text-align:center;padding:0.5rem">Failed to load log content.</p>';return}'''

old_tc_catch = '''      }catch(e){
        expand.innerHTML='<p style="color:var(--text-muted);text-align:center;padding:0.5rem">Failed to load content.</p>';
      }'''

# loadAvailableModels
old_am = '''      try{
        var result=await api('GET','/api/available-models',null,8000);'''
new_am = '''      var result=await safeApi('GET','/api/available-models',null,8000,true); if(!result){container.innerHTML='Failed to load models';return}'''

old_am_catch = '''      }catch(e){
        container.innerHTML='<p style=\"color:var(--text-muted);font-size:0.85rem;text-align:center;padding:0.75rem\">Failed to load models.</p>';
      }'''
new_am_catch = ''

# loadModels
old_m = '''      try{
        var m=await api('GET','/api/models');'''
new_m = '''      var m=await safeApi('GET','/api/models',null,null,true); if(!m){document.getElementById('modelCount').textContent='0 models loaded';return}'''

old_m_catch = '''      }catch(e){
        document.getElementById('modelCount').textContent='Failed to load models';
      }'''
new_m_catch = ''

# refreshTopModels
old_rt = '''      try{
        var all=await api('GET','/api/models',null,8000);'''
new_rt = '''      var all=await safeApi('GET','/api/models',null,8000,true); if(!all){container.innerHTML=fallbackHtml;return}'''

old_rt_catch = '''      }catch(e){
        container.innerHTML=fallbackHtml;
      }'''
new_rt_catch = ''

conversions = [
    (old1, new1),
    (old_catch_load_activity, ''),
    (old_tc, new_tc),
    (old_tc_catch, ''),
    (old_am, new_am),
    (old_am_catch, new_am_catch),
    (old_m, new_m),
    (old_m_catch, new_m_catch),
    (old_rt, new_rt),
    (old_rt_catch, new_rt_catch),
]

count = 0
for old, new in conversions:
    if old in text:
        text = text.replace(old, new)
        count += 1
        print(f"✅ Converted: {old[:60]}...")
    else:
        print(f"❌ Not found: {old[:60]}...")

with open('/Users/openclaw_007/projects/glbtoken/script.js', 'w') as f:
    f.write(text)

print(f"\nApplied {count} of {len(conversions)} conversions")
