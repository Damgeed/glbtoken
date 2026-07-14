#!/usr/bin/env python3
"""Ultra-targeted scan: only UI strings that genuinely need translation."""
import re, os, json

os.chdir(os.path.expanduser('~/projects/glbtoken'))

with open('translations.js', 'r') as f:
    js = f.read()

existing_keys = set()
for m in re.finditer(r'TRANS\["([^"]+)"\]\s*=', js):
    existing_keys.add(m.group(1))
for m in re.finditer(r"TRANS\['([^']+)'\]\s*=", js):
    existing_keys.add(m.group(1))

print(f"Existing: {len(existing_keys)} keys")

ALREADY_EXIST = existing_keys

# These are all the genuinely translatable UI strings I found
# Filtered to remove: example data, code params, prices, URLs, user data

CANDIDATES = [
    # === DASHBOARD OVERVIEW ===
    "Token usage overview",
    "+ Top Up",
    "Available Balance",
    "Total Spent",
    "Models Used",  # Wait, check: line 347 has "Models Used"
    "API Requests",  # check line 348
    "API Keys Active",
    "Days Active",
    "Offline",
    "Top Up",
    "tokens consumed",
    "lifetime spend",
    "Usage by Model",
    "Activity Timeline",
    "events",
    "Loading activity...",
    "Recent Transactions",
    "No transactions yet",
    "Cost Breakdown by Model",
    "Per-model spend",
    "Most Expensive Model",
    "Avg cost/call",
    "Avg Cost / Call",
    "Per request",
    "Error Rate Monitoring",
    "Track API errors",
    "Total Errors",
    "Error Rate",
    "Last Error",
    "Percentage",
    "Response Time by Model",
    "Speed indicators",
    "Avg Response Time",
    "Max Response Time",
    "Call Count",
    "Speed",
    "Loading response times...",
    "Model Speed Comparison",
    "Performance tiers",
    "Avg Tokens/sec",
    "Avg Latency",
    "Reliability %",
    "Speed Tier",
    "Loading speed data...",
    "View all →",
    "Last 5",
    
    # === DASHBOARD SIDEBAR ===
    "Chat",
    "General",
    "Personal",
    "Admin",
    "Team",
    "Overview",
    "Usage & History",
    "Team & Referrals",
    "API Keys",
    
    # === BILLING ===
    "Payments",
    "Manage invoices, payment methods, and billing summary.",
    "Billing Summary",
    "Lifetime",
    "Last Invoice Date",
    "Top Payment Method",
    "Payment Methods",
    "No payment methods saved",
    "Add a card or mobile money method to get started.",
    "+ Add Payment Method",
    "Invoices",
    "Payment Method",
    "Tokens Added",
    "Receipt",
    "No invoices yet",
    "+ Top Up Now",
    "Refresh",
    "Top-up Confirmed",
    "Low Balance Warning",
    "API Key Created",
    "Your balance is below 1,000 tokens",
    "Mark All as Read",
    "Notification History",
    
    # === SETTINGS ===
    "Profile",
    "Security",
    "Notifications",
    "Update Password",
    "Save Notification Preferences",
    "Email Notifications",
    "Low Balance Alerts",
    "Login Alerts",
    "Get notified when your balance runs low",
    "Email when a new device signs in",
    "Add an extra layer of security",
    
    # === API KEYS ===
    "Developer",
    "API Documentation",
    "Your API Keys",
    "Manage your API access",
    "↓ Newest",
    "↑ Oldest",
    "A-Z",
    "Usage",
    "Loading keys...",
    "Create API Key",
    "Name your key and set permissions",
    "Key Name",
    "Permissions",
    "Read & Write",
    "Read Only",
    "Cancel",
    "Create Key",
    "Copy Key",
    "Quick Start",
    "Authentication",
    "Available Models",
    "Chat Completions",
    "Streaming",
    "Node.js Example",
    "Token Pricing",
    "Error Codes",
    "Best Practices",
    "Rate Limits",
    "Ready to Build?",
    "Create Free Account →",
    "Invalid or missing API key",
    "Insufficient token balance",
    "Model not found or not available",
    "Rate limited — slow down requests",
    "Rotate keys regularly",
    "Use separate keys per project",
    "Handle 402 errors",
    
    # === USAGE & HISTORY ===
    "Login History",
    "Review all login attempts to your account",
    "Transaction History",
    "Deposits & Consumption",
    "Deposits",
    "Consumption",
    "Deposits",
    "No deposits",
    "No consumption",
    "Date Range",
    "Device",
    "All Devices",
    "All Status",
    "Apply Filters",
    "Login Attempts",
    "No login history yet",
    "Logins will appear here once you sign in from different devices or locations.",
    "Showing 8 of 8 entries",
    "Showing 0 entries",
    
    # === TEAM ===
    "Team Management",
    "Manage organizations, members, and roles",
    "+ Invite Member",
    "+ New Org",
    "Pro Plan",
    "Owner",
    "Total Spend",
    "Total API Calls",
    "Active Members",
    "Team Members",
    "Member",
    "Role",
    "Joined",
    "Actions",
    "Admin",
    "Member",
    "Viewer",
    "Remove",
    "Invite Members",
    "Send Invite",
    "Pending Invites",
    "Cancel",
    "Membership",
    "Leave Organization",
    "Invite Member",
    
    # === REFERRAL ===
    "Referral Program",
    "Invite friends and earn rewards for every signup",
    "Your Code",
    "Share this code",
    "Total Referrals",
    "Total Earned",
    "Pending Rewards",
    "Share Your Referral Link",
    "Copy",
    "Email",
    "Referrals Over Time",
    "Earnings Over Time",
    "Referrals",
    "Reward History",
    "Signup Bonus",
    "Referral Milestone",
    "How It Works",
    "1. Share Your Code",
    "Copy your unique referral link and share it with friends via social media, email, or messaging apps.",
    "2. They Sign Up",
    "Your friends create an account using your referral link and start using GlbTOKEN.",
    "3. You Earn Rewards",
    "For every friend who signs up and uses the platform, you earn GT tokens as a reward.",
    
    # === PLAYGROUND ===
    "New Chat",
    "Delete",
    "Start a conversation",
    "Choose a model and start chatting. Your conversations are saved automatically.",
    "Write a Python sort function",
    "Explain quantum computing",
    "React modal component",
    "Compare AI models",
    "Type your message here...",
    "Parameters",
    "Temperature",
    "Max Tokens",
    "Frequency Penalty",
    "Presence Penalty",
    "Top P",
    "Toggle sidebar",
    
    # === PRESETS ===
    "Create one to save your model configurations.",
    "Save and reuse model configurations",
    "Your Presets",
    "(optional)",
    "+ Create Preset",
    
    # === TOP-UP ===
    "Buy $5",
    "Buy $20",
    "Buy $50",
    "Buy $100",
    
    # === STATUS LABELS ===
    "Active",
    "Pending",
    "Inactive",
    "Claimed",
    "Awaiting confirmation",
    "Success",
    "Failed",
    
    # === MODEL DISPLAY NAMES (UI labels) ===
    'GPT-4o — OpenAI (⚡ Fast)',
    'Claude 3.5 Sonnet — Anthropic (⚡ Fast)',
    'Claude 3 Opus — Anthropic (🐌 Slower)',
    'Gemini 2.0 Flash — Google (⚡ Fast)',
    'Llama 3.1 405B — Meta (⚡ Fast)',
    'DeepSeek V3 — DeepSeek (⚡ Fast)',
    'GPT-4 Turbo — OpenAI (🐌 Slower)',
    'Mistral Large — Mistral (⚡ Fast)',
    
    # === SOCIAL SHARE ===
    "Twitter",
    "WhatsApp",
    "Telegram",
    
    # === OTHER UI ===
    "via New API",
    "Connect New API to see available models.",
]

# Filter out ones that already exist
new_texts = [t for t in CANDIDATES if t not in ALREADY_EXIST]
new_texts = [t for t in new_texts if len(t) >= 2]

# Also deduplicate
seen = set()
unique_new = []
for t in new_texts:
    if t not in seen:
        seen.add(t)
        unique_new.append(t)

print(f"\nNew texts to translate: {len(unique_new)}")
for t in sorted(unique_new):
    print(f"  - {t}")

with open('translate_these.json', 'w') as f:
    json.dump(sorted(unique_new), f, indent=2, ensure_ascii=False)
