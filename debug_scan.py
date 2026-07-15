#!/usr/bin/env python3
"""Debug: Show all untranslated texts found in HTML files."""

import os, re, html as html_mod

PROJECT_DIR = os.path.expanduser("~/projects/glbtoken")
TRANS_FILE = os.path.join(PROJECT_DIR, "translations.js")

ALL_HTML = [
    "index.html","home.html","about.html","blog.html","contact.html",
    "faq.html","how.html","models.html","pricing.html","privacy.html",
    "terms.html","refund.html","blog-article-1.html","blog-article-2.html",
    "blog-article-3.html","blog-article-4.html","blog-article-5.html",
    "blog-article-6.html","notifications.html","settings.html",
    "history.html","billing.html","apikeys.html","playground.html",
    "referral.html","team.html","topup.html","presets.html",
    "login.html","register.html","dashboard.html",
]

STANDARD_WORDS = {
    "API", "GT", "USD", "AI", "SSE", "CSV", "URL", "HTML", "CSS", "JS",
    "JSON", "SDK", "CLI", "GUI", "HTTP", "HTTPS", "IP", "DNS", "REST",
    "OpenAI", "Anthropic", "Google", "Meta", "DeepSeek", "Mistral",
    "Stripe", "Paystack", "GitHub", "GlbTOKEN", "Glb", "TOKEN",
    "github.com", "glbtoken.com", "Railway", "Cloudflare",
    "GPT-4o", "GPT-4", "Claude 3.5", "Claude 3", "Gemini 2.0",
    "Llama 3.1", "Llama 4", "DeepSeek V3", "Mistral Large",
    "gpt-4o-mini", "gpt-4-turbo", "claude-3.5-sonnet", "claude-3-opus",
    "Sonnet", "Maverick", "Opus", "Turbo", "Flash", "GPT", "GT",
    "Token", "Tokens", "GT Token", "GT Tokens", "sk-glt",
    "base_url", "api_key", "Authorization", "Bearer", "max_tokens",
    "temperature", "top_p", "frequency_penalty", "presence_penalty",
    "stream", "role", "content", "model", "messages",
    "EN", "DE", "RU", "JP", "notranslate",
    "RPM", "TPM"
}

KNOWN_SINGLE = {"DASHBOARD", "LOGIN", "REGISTER", "LOGOUT", "SAVE",
                  "CANCEL", "DELETE", "EDIT", "VIEW", "LOAD", "DONE",
                  "BACK", "NEXT", "PREV", "ALL", "TOP", "NEW",
                  "CHAT", "GENERAL", "PERSONAL", "ADMIN", "TEAM",
                  "OVERVIEW", "BILLING", "SETTINGS", "PLAYGROUND",
                  "DOCS", "HOME", "ABOUT", "BLOG", "FAQ", "CONTACT",
                  "PRICING", "MODELS", "SUPPORT", "TERMS", "PRIVACY",
                  "REFUND", "HELLO", "CLOSE", "OPEN", "MORE",
                  "SHOW", "HIDE", "ADD", "REMOVE", "COPY", "APPLY",
                  "FILTER", "SORT", "RESET", "ACCOUNT", "PROFILE",
                  "SECURITY", "NOTIFICATIONS", "DEPOSITS", "CONSUMPTION",
                  "OWNER", "VIEWER", "TIMESTAMP", "STATUS", "AMOUNT",
                  "DEVICE", "LOCATION", "RECEIPT", "METHOD", "TIER",
                  "CODE", "MEANING", "MODEL", "SPEED", "COST", "USAGE",
                  "TOKENS", "COST:", "TOTAL:", "SEARCH", "SUPPORT",
                  "CONTACT", "COMPANY", "PRODUCT", "BILLING", "SETTINGS",
                  "PLAYGROUND", "DOCS", "PENDING", "ACTIVE", "INACTIVE",
                  "Hello,", "7d", "30d", "90d", "↓ Newest", "↑ Oldest",
                  "A-Z", "Usage", "Tokens", "Cost"}

def extract_text_from_html(filepath):
    with open(filepath, "r", encoding="utf-8", errors="replace") as f:
        content = f.read()
    content = re.sub(r'<script[^>]*>.*?</script>', '', content, flags=re.DOTALL | re.IGNORECASE)
    content = re.sub(r'<style[^>]*>.*?</style>', '', content, flags=re.DOTALL | re.IGNORECASE)
    content = re.sub(r'<svg[^>]*>.*?</svg>', '', content, flags=re.DOTALL | re.IGNORECASE)
    content = re.sub(r'<pre[^>]*>.*?</pre>', '', content, flags=re.DOTALL | re.IGNORECASE)
    content = re.sub(r'<code[^>]*>.*?</code>', '', content, flags=re.DOTALL | re.IGNORECASE)
    text = re.sub(r'<[^>]+>', ' ', content)
    text = html_mod.unescape(text)
    lines = []
    for line in text.split('\n'):
        line = line.strip()
        if len(line) < 3 or len(line) > 200:
            continue
        if re.match(r'^[\d\s\.,%$₿€£¥₦+\-*/=<>()\[\]{}|&^~@#:;"\'\\\\]+$', line):
            continue
        if re.match(r'^(https?://|/|\.\.|\./|[a-zA-Z]:\\\\|sk-glt)', line):
            continue
        if sum(1 for c in line if c in '{}[]<>()|&^#$@=+/\\"\'') > len(line) * 0.3:
            continue
        if re.search(r'[\u4e00-\u9fff\u0400-\u04ff\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af]', line):
            continue
        lines.append(line)
    return lines

def load_existing_translations():
    with open(TRANS_FILE, "r", encoding="utf-8", errors="replace") as f:
        content = f.read()
    keys = set(re.findall(r'TRANS\["([^"]+)"\]', content))
    keys.update(re.findall(r"TRANS\['([^']+)'\]", content))
    return keys, content

existing_keys, trans_content = load_existing_translations()
print(f"Existing keys: {len(existing_keys)}")

# Now check specifically some strings from dashboard.html
dash_texts = extract_text_from_html(os.path.join(PROJECT_DIR, "dashboard.html"))
print(f"\nDashboard texts found: {len(dash_texts)}")

# Find untranslated ones
untranslated = []
for t in sorted(set(dash_texts)):
    if t in existing_keys:
        continue
    # Skip single known words
    stripped = t.strip()
    if len(stripped.split()) == 1:
        single = stripped.upper()
        if single in KNOWN_SINGLE:
            continue
        for w in STANDARD_WORDS:
            if stripped.lower() == w.lower():
                break
        else:
            untranslated.append(t)
    else:
        # Check if any standard word equals this
        skip = False
        for w in STANDARD_WORDS:
            if stripped.lower() == w.lower():
                skip = True
                break
        if not skip:
            untranslated.append(t)

print(f"\nUntranslated dashboard texts: {len(untranslated)}")
print("\n--- Sample untranslated texts ---")
for t in untranslated[:50]:
    print(f"  '{t}'")

# Also check some specific strings I know exist
print("\n\n--- Checking specific strings ---")
specific = [
    "Personal",
    "General", 
    "Admin",
    "Team",
    "Playground",
    "Overview",
    "API Keys",
    "Usage & History",
    "Team & Referrals",
    "Billing",
    "Settings",
    "Payments",
    "Transaction History",
    "Login History",
    "Team Management",
    "Total Spend",
    "Total API Calls",
    "Active Members",
    "Avg Cost / Call",
    "Member",
    "Role",
    "Joined",
    "Actions",
    "Owner",
    "Viewer",
    "Remove",
    "Date",
    "Receipt",
    "Code",
    "Meaning",
    "Token Usage",
    "Your Models",
    "via New API",
    "Profile",
    "Security",
    "Email Notifications",
    "Low Balance Alerts",
    "Login Alerts",
    "Notification History",
    "Mark All as Read",
    "Add an extra layer of security",
    "No payment methods saved",
    "Add a card or mobile money method to get started.",
]

for s in specific:
    if s in existing_keys:
        print(f"  ✅ EXISTS: '{s}'")
    else:
        print(f"  ❌ MISSING: '{s}'")
