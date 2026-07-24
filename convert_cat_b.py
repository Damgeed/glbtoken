#!/usr/bin/env python3
"""Convert Category B functions to safeApi pattern."""
import re

with open('/Users/openclaw_007/projects/glbtoken/script.js', 'r') as f:
    text = f.read()

# Each conversion: pattern of try{...api('GET',url)...}catch(e){ innerHTML error }
# Replace with: safeApi('GET',url,null,null,true); if(!data){ innerHTML }
# For functions where try wraps the ENTIRE body (common pattern)

conversions = []

# 1. loadResponseTimes (L944-959): try{ ... }catch(e){ body.innerHTML='...Failed...' }
conversions.append({
    'try_start': "async function loadResponseTimes(days){\n      try{\n        var body=document.getElementById('responseTimeBody');\n        if(!body)return;\n        body.innerHTML='<tr><td colspan=\"4\" style=\"text-align:center;padding:1rem;color:var(--text-muted)\">Loading...</td></tr>';\n        var data=await api('GET','/api/analytics/response-times?days='+(days||7));",
    'try_start_replacement': "async function loadResponseTimes(days){\n      var body=document.getElementById('responseTimeBody');\n      if(!body)return;\n      body.innerHTML='<tr><td colspan=\"4\" style=\"text-align:center;padding:1rem;color:var(--text-muted)\">Loading...</td></tr>';\n      var data=await safeApi('GET','/api/analytics/response-times?days='+(days||7),null,null,true); if(!data){ body.innerHTML='<tr><td colspan=\"4\" style=\"text-align:center;padding:1.5rem;color:var(--text-muted)\">Failed to load response times.</td></tr>';return}",
    'catch_end': "      }catch(e){\n        var b2=document.getElementById('responseTimeBody');\n        if(b2)b2.innerHTML='<tr><td colspan=\"4\" style=\"text-align:center;padding:1.5rem;color:var(--text-muted)\">Failed to load response times.</td></tr>';\n      }",
    'catch_end_replacement': ""
})

# 2. loadKeyUsage (L965-978)
conversions.append({
    'try_start': "async function loadKeyUsage(days){\n      try{\n        var body=document.getElementById('keyUsageBody');\n        if(!body)return;\n        body.innerHTML='<tr><td colspan=\"5\" style=\"text-align:center;padding:1rem;color:var(--text-muted)\">Loading...</td></tr>';\n        var data=await api('GET','/api/analytics/key-usage?days='+(days||7));",
    'try_start_replacement': "async function loadKeyUsage(days){\n      var body=document.getElementById('keyUsageBody');\n      if(!body)return;\n      body.innerHTML='<tr><td colspan=\"5\" style=\"text-align:center;padding:1rem;color:var(--text-muted)\">Loading...</td></tr>';\n      var data=await safeApi('GET','/api/analytics/key-usage?days='+(days||7),null,null,true); if(!data){ body.innerHTML='<tr><td colspan=\"5\" style=\"text-align:center;padding:1.5rem;color:var(--text-muted)\">Failed to load key usage.</td></tr>';return}",
    'catch_end': "      }catch(e){\n        var b2=document.getElementById('keyUsageBody');\n        if(b2)b2.innerHTML='<tr><td colspan=\"5\" style=\"text-align:center;padding:1.5rem;color:var(--text-muted)\">Failed to load key usage.</td></tr>';\n      }",
    'catch_end_replacement': ""
})

# 3. loadSpeedComparison (L1000-1020)
conversions.append({
    'try_start': "async function loadSpeedComparison(){\n      try{\n        var body=document.getElementById('speedComparisonBody');\n        if(!body)return;\n        body.innerHTML='<tr><td colspan=\"4\" style=\"text-align:center;padding:1rem;color:var(--text-muted)\">Loading...</td></tr>';\n        var result=await api('GET','/api/available-models',null,8000);",
    'try_start_replacement': "async function loadSpeedComparison(){\n      var body=document.getElementById('speedComparisonBody');\n      if(!body)return;\n      body.innerHTML='<tr><td colspan=\"4\" style=\"text-align:center;padding:1rem;color:var(--text-muted)\">Loading...</td></tr>';\n      var result=await safeApi('GET','/api/available-models',null,8000,true); if(!result){ body.innerHTML='<tr><td colspan=\"4\" style=\"text-align:center;padding:1.5rem;color:var(--text-muted)\">Failed to load speed comparison.</td></tr>';return}",
    'catch_end': "      }catch(e){\n        var b2=document.getElementById('speedComparisonBody');\n        if(b2)b2.innerHTML='<tr><td colspan=\"4\" style=\"text-align:center;padding:1.5rem;color:var(--text-muted)\">Failed to load speed comparison.</td></tr>';\n      }",
    'catch_end_replacement': ""
})

# 4. loadMonthlySummary (L1213-1261)
conversions.append({
    'try_start': "async function loadMonthlySummary(){\n      try{\n        var container=document.getElementById('monthlySummary');\n        if(!container)return;\n        container.innerHTML='<p style=\"color:var(--text-muted);text-align:center;padding:1rem\">Loading monthly comparison...</p>';\n        var data=await api('GET','/api/activity?months=2');",
    'try_start_replacement': "async function loadMonthlySummary(){\n      var container=document.getElementById('monthlySummary');\n      if(!container)return;\n      container.innerHTML='<p style=\"color:var(--text-muted);text-align:center;padding:1rem\">Loading monthly comparison...</p>';\n      var data=await safeApi('GET','/api/activity?months=2',null,null,true); if(!data){ container.innerHTML='<p style=\"color:var(--text-muted);text-align:center;padding:1rem\">Failed to load monthly summary.</p>';return}",
    'catch_end': "      }catch(e){\n        var c2=document.getElementById('monthlySummary');\n        if(c2)c2.innerHTML='<p style=\"color:var(--text-muted);text-align:center;padding:1rem\">Failed to load monthly summary.</p>';\n      }",
    'catch_end_replacement': ""
})

# 5. loadRecentActivity (L1267-1289)
conversions.append({
    'try_start': "async function loadRecentActivity(){\n      try{\n        var container=document.getElementById('recentActivity');\n        if(!container)return;\n        container.innerHTML='<p style=\"color:var(--text-muted);text-align:center;padding:0.5rem;font-size:0.85rem\">Loading...</p>';\n        var act=await api('GET','/api/activity');",
    'try_start_replacement': "async function loadRecentActivity(){\n      var container=document.getElementById('recentActivity');\n      if(!container)return;\n      container.innerHTML='<p style=\"color:var(--text-muted);text-align:center;padding:0.5rem;font-size:0.85rem\">Loading...</p>';\n      var act=await safeApi('GET','/api/activity',null,null,true); if(!act){ container.innerHTML='<p style=\"color:var(--text-muted);text-align:center;padding:0.5rem;font-size:0.85rem\">Failed to load recent activity.</p>';return}",
    'catch_end': "      }catch(e){\n        var c2=document.getElementById('recentActivity');\n        if(c2)c2.innerHTML='<p style=\"color:var(--text-muted);text-align:center;padding:0.5rem;font-size:0.85rem\">Failed to load recent activity.</p>';\n      }",
    'catch_end_replacement': ""
})

# 6. loadActivity (L1619-1654) 
conversions.append({
    'try_start': "async function loadActivity(){\n      var container=document.getElementById('dashActivity');\n      var countEl=document.getElementById('activityCount');\n      if(!container)return;\n      try{\n        var act=await api('GET','/api/activity');",
    'try_start_replacement': "async function loadActivity(){\n      var container=document.getElementById('dashActivity');\n      var countEl=document.getElementById('activityCount');\n      if(!container)return;\n      var act=await safeApi('GET','/api/activity',null,null,true); if(!act){ container.innerHTML='<div class=\"empty-state\" style=\"padding:1.5rem 1rem\"><div class=\"empty-icon\" style=\"font-size:2rem;opacity:0.35\">⚠</div><div class=\"empty-title\" style=\"font-size:0.85rem\">Failed to load activity</div></div>';return}",
    'catch_end': "      }catch(e){\n        if(countEl)countEl.textContent='0 events';\n        container.innerHTML='<div class=\"empty-state\" style=\"padding:1.5rem 1rem\"><div class=\"empty-icon\" style=\"font-size:2rem;opacity:0.35\">⚠</div><div class=\"empty-title\" style=\"font-size:0.85rem\">Failed to load activity</div></div>';\n      }",
    'catch_end_replacement': ""
})

# 7. toggleLogContent (L1658-1688) - special, already uses safeApi partially
conversions.append({
    'try_start': "async function toggleLogContent(el,expandId){\n      var expand=document.getElementById(expandId);\n      if(!expand||expand.style.display==='block'){\n        if(expand)expand.style.display='none';\n        var arrow=el.querySelector('span:last-child');\n        if(arrow)arrow.textContent='▶';\n        return;\n      }\n      expand.style.display='block';\n      var arrow=el.querySelector('span:last-child');\n      if(arrow)arrow.textContent='▼';\n      if(expand.getAttribute('data-loaded'))return;\n      expand.setAttribute('data-loaded','1');\n      try{\n        var content=await api('GET','/api/logs/content?log_id='+logId);",
    'try_start_replacement': "async function toggleLogContent(el,expandId){\n      var expand=document.getElementById(expandId);\n      if(!expand||expand.style.display==='block'){\n        if(expand)expand.style.display='none';\n        var arrow=el.querySelector('span:last-child');\n        if(arrow)arrow.textContent='▶';\n        return;\n      }\n      expand.style.display='block';\n      var arrow=el.querySelector('span:last-child');\n      if(arrow)arrow.textContent='▼';\n      if(expand.getAttribute('data-loaded'))return;\n      expand.setAttribute('data-loaded','1');\n      var content=await safeApi('GET','/api/logs/content?log_id='+logId,null,null,true); if(!content){ expand.innerHTML='<p style=\"color:var(--text-muted);text-align:center;padding:0.5rem\">Failed to load log content.</p>';return}",
    'catch_end': "      }catch(e){\n        expand.innerHTML='<p style=\"color:var(--text-muted);text-align:center;padding:0.5rem\">Failed to load log content.</p>';\n      }",
    'catch_end_replacement': ""
})

# 8. loadAvailableModels (L1767-1799)
conversions.append({
    'try_start': "async function loadAvailableModels(){\n      var container=document.getElementById('availModelsContainer');\n      var countEl=document.getElementById('availModelCount');\n      if(!container)return;\n      try{\n        var result=await api('GET','/api/available-models',null,8000);",
    'try_start_replacement': "async function loadAvailableModels(){\n      var container=document.getElementById('availModelsContainer');\n      var countEl=document.getElementById('availModelCount');\n      if(!container)return;\n      var result=await safeApi('GET','/api/available-models',null,8000,true); if(!result){container.innerHTML='<p style=\"color:var(--text-muted);font-size:0.85rem;text-align:center;padding:0.75rem\">Failed to load models.</p>';return}",
    'catch_end': "      }catch(e){\n        container.innerHTML='<p style=\"color:var(--text-muted);font-size:0.85rem;text-align:center;padding:0.75rem\">Failed to load models.</p>';\n      }",
    'catch_end_replacement': ""
})

# 9. loadModels (L1912-1942)
conversions.append({
    'try_start': "async function loadModels(){\n      var filter=document.getElementById('providerFilter');\n      if(!filter)return;\n      try{\n        var m=await api('GET','/api/models');",
    'try_start_replacement': "async function loadModels(){\n      var filter=document.getElementById('providerFilter');\n      if(!filter)return;\n      var m=await safeApi('GET','/api/models',null,null,true); if(!m){document.getElementById('modelCount').textContent='0 models loaded';return}",
    'catch_end': "      }catch(e){\n        document.getElementById('modelCount').textContent='Failed to load models';\n      }",
    'catch_end_replacement': ""
})

# 10. refreshTopModels (L2712-2734)
conversions.append({
    'try_start': "async function refreshTopModels(){\n      var container=document.getElementById('topModelsContainer');\n      var fallbackHtml='<p style=\"color:var(--text-muted);text-align:center;padding:1rem\">Unable to load models</p>';\n      if(!container)return;\n      try{\n        var all=await api('GET','/api/models',null,8000);",
    'try_start_replacement': "async function refreshTopModels(){\n      var container=document.getElementById('topModelsContainer');\n      var fallbackHtml='<p style=\"color:var(--text-muted);text-align:center;padding:1rem\">Unable to load models</p>';\n      if(!container)return;\n      var all=await safeApi('GET','/api/models',null,8000,true); if(!all){container.innerHTML=fallbackHtml;return}",
    'catch_end': "      }catch(e){\n        container.innerHTML=fallbackHtml;\n      }",
    'catch_end_replacement': ""
})

# Apply all conversions
count = 0
for c in conversions:
    if c['try_start'] in text and c['catch_end'] in text:
        text = text.replace(c['try_start'], c['try_start_replacement'])
        text = text.replace(c['catch_end'], c['catch_end_replacement'])
        count += 1
        print(f"✅ Converted: lines matching try_start for {c['try_start'][:50]}...")
    else:
        print(f"❌ FAILED: Could not find pattern for {c['try_start'][:50]}...")
        # Show what was found
        if c['try_start'] not in text:
            print(f"   try_start NOT found in file")
        if c['catch_end'] not in text:
            print(f"   catch_end NOT found in file")

with open('/Users/openclaw_007/projects/glbtoken/script.js', 'w') as f:
    f.write(text)

print(f"\nConverted {count} of {len(conversions)} functions")
