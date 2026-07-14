import re
with open('translations.js') as f:
    js = f.read()
keys = set()
for m in re.finditer(r'TRANS\["([^"]+)"\]\s*=', js):
    keys.add(m.group(1))

check = [
    'Claimed', 'Awaiting confirmation', 'Success', 'Failed',
    'Payments', 'Billing Summary', 'Lifetime', 'Last Invoice Date',
    'Top Payment Method', 'Payment Methods', 'No payment methods saved',
    '+ Add Payment Method', 'Invoices', 'Payment Method', 'Tokens Added',
    'Receipt', 'No invoices yet', '+ Top Up Now', 'Refresh',
    'Top-up Confirmed', 'Low Balance Warning', 'API Key Created',
    'Mark All as Read', 'Notification History',
    'Profile', 'Security', 'Notifications', 'Save Notification Preferences',
    'Add an extra layer of security', 'Developer', 'API Documentation',
    'Your API Keys', 'Manage your API access',
    'Fail Newest', 'Fail Oldest', 'Create API Key',
    'Name your key and set permissions', 'Key Name', 'Permissions',
    'Read and Write', 'Read Only', 'Cancel', 'Create Key', 'Copy Key',
    'Quick Start', 'Authentication', 'Available Models', 'Chat Completions',
    'Streaming', 'Node.js Example', 'Token Pricing', 'Error Codes',
    'Best Practices', 'Rate Limits', 'Ready to Build?',
    'Invalid or missing API key', 'Insufficient token balance',
    'Model not found or not available', 'Rate limited - slow down requests',
    'Rotate keys regularly', 'Use separate keys per project',
    'Handle 402 errors', 'Deposits', 'Consumption',
    'Date Range', 'All Devices', 'All Status', 'Apply Filters',
    'Login Attempts', 'No login history yet',
    'Team Members', 'Role', 'Joined', 'Actions', 'Member', 'Viewer',
    'Remove', 'Invite Members', 'Send Invite', 'Pending Invites',
    'Leave Organization', 'Your Code', 'Share this code',
    'Total Referrals', 'Total Earned', 'Pending Rewards',
    'Share Your Referral Link', 'Copy', 'Email',
    'Referrals Over Time', 'Earnings Over Time', 'Referrals', 'Reward History',
    'Signup Bonus', 'Referral Milestone', 'How It Works',
    '1. Share Your Code', '2. They Sign Up', '3. You Earn Rewards',
    'New Chat', 'Start a conversation',
    'Parameters', 'Temperature', 'Max Tokens', 'Frequency Penalty',
    'Presence Penalty', 'Top P', 'Total Spend', 'Total API Calls',
    'Active Members', 'Owner', 'Menu',
]
for c in check:
    found = c in keys
    print(f"{'✓' if found else '✗'} {c}")
