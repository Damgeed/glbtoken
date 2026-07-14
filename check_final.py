#!/usr/bin/env python3
import re
with open('/Users/openclaw_007/projects/glbtoken/translations.js') as f:
    content = f.read()
keys = set(re.findall(r'TRANS\["([^"]+)"\]\s*=', content))

check = [
    '+ Top Up', 'Top Up', 'Delete', 'Invite Member', 'Your Presets',
    'via New API', 'events', 'Type your message here...', 'Toggle sidebar',
    'Save and reuse model configurations',
    'Create one to save your model configurations.',
    '(optional)', '+ Create Preset', 'Your balance is below 1,000 tokens',
    'Pending', 'Active', 'Inactive', 'Showing 0 entries',
    'Buy $5', 'Buy $20', 'Buy $50', 'Buy $100',
    'Twitter', 'WhatsApp', 'Telegram',
    'New Chat', 'Start a conversation', 'Model Presets',
    'General', 'Personal', 'Team', 'Admin',
    'Overview', 'Usage & History', 'Team & Referrals', 'API Keys'
]

for c in check:
    status = 'OK' if c in keys else 'MISSING'
    print(f'{status}: {c}')
