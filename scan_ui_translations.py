#!/usr/bin/env python3
"""Targeted scan for untranslated dashboard/UI English text in GlbTOKEN HTML files."""
import re, os, json, html

os.chdir(os.path.expanduser('~/projects/glbtoken'))

# Load existing TRANS keys
with open('translations.js', 'r') as f:
    js = f.read()

existing_keys = set()
for m in re.finditer(r'TRANS\["([^"]+)"\]\s*=', js):
    existing_keys.add(m.group(1))
for m in re.finditer(r"TRANS\['([^']+)'\]\s*=", js):
    existing_keys.add(m.group(1))

print(f"Existing TRANS keys: {len(existing_keys)}")

# Focus files (dashboard + admin pages)
FOCUS_FILES = [
    'dashboard.html', 'billing.html', 'settings.html', 'history.html',
    'team.html', 'referral.html', 'playground.html', 'notifications.html',
    'apikeys.html', 'topup.html', 'presets.html',
]

def clean_text(text):
    text = html.unescape(text)
    text = re.sub(r'\s+', ' ', text).strip()
    return text

def should_skip(text):
    """Filter out strings that shouldn't be translated."""
    t = text.strip()
    
    # Too short
    if len(t) < 3:
        return True
    
    # Only numbers/punctuation
    if re.match(r'^[\d\s\.,:;\-–—()\[\]{}%$€£₦¥#@+\/\\!?❌✅⬆⬇↑↓*~\'\"<>|&]+$', t):
        return True
    
    # Prices/amounts
    if re.match(r'^[\$€£₦¥]\s*[\d,]+\.?\d*', t):
        return True
    if re.match(r'^[\d,]+\.?\d*\s*(GT|USD|tokens?)$', t, re.IGNORECASE):
        return True
    if re.match(r'^\d+\s*GT$', t):
        return True
    if re.match(r'^\$?[\d,]+\.?\d*', t):
        return True
    
    # URLs
    if t.startswith('http://') or t.startswith('https://'):
        return True
    
    # Pure numbers
    if re.match(r'^[\d,.\s]+$', t):
        return True
    
    # Placeholder user data
    if t in ('User', 'user@email.com', '0 Tokens', '© 2026 GlbTOKEN', '💬 Support'):
        return True
    
    # Single char/symbol
    if len(t) <= 1:
        return True
    
    # Model names (shouldn't be translated)
    technical_single_words = {'GPT-4o', 'GPT-4', 'GPT-4o Mini', 'GPT-4 Turbo', 
        'Claude 3.5 Sonnet', 'Claude 3 Opus', 'Gemini 2.0 Flash', 
        'Llama 3.1 405B', 'DeepSeek V3', 'Mistral Large', 'Llama 4 Maverick',
        'RPM', 'TPM', 'GT', 'USD', 'API', 'SDK', 'JSON', 'SSE', 'SOC',
        'OpenAI', 'Stripe', 'Paystack', 'USDT', 'BTC', 'NGN', 'GMT', 'CET',
        'SGT', 'EST', 'UTC', 'A-Z', '7d', '30d', '90d', 'sk-glt_...',
        'gpt-4o', 'claude-3.5-sonnet', 'gpt-4-turbo', 'deepseek-v3',
        'glbtoken', 'GlbTOKEN', 'Glb', 'TOKEN'}
    if t in technical_single_words:
        return True
    
    # Already translated
    if t in existing_keys:
        return True
    
    # Very long text (blog content etc.)
    if len(t) > 200:
        return True
    
    # Contains code-like content
    if t.startswith('<') or '&lt;' in t:
        return True
    
    # Skip if it's just a navigation label (single word, part of existing known set)
    single_words_skip = {'Home', 'Pricing', 'Models', 'Docs', 'Dashboard', 'Login',
        'Settings', 'Billing', 'Notifications', 'FAQ', 'About', 'Blog', 'Contact',
        'Product', 'Company', 'Support', 'Refund', 'Privacy', 'Terms'}
    if t.strip() in single_words_skip:
        return True
    
    # Skip dates and timestamps
    if re.match(r'^[A-Z][a-z]{2}\s+\d+,\s+\d{4}$', t):  # "Jan 15, 2026"
        return True
    if re.match(r'^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}$', t):
        return True
    if re.match(r'^[A-Z][a-z]{2}\s+\d+$', t):  # "Jun 14"
        return True
    
    # Skip "X entries" patterns
    if re.match(r'^Showing \d+ of \d+ entries$', t):
        return True
    if re.match(r'^Showing \d+ entries$', t):
        return True
    if re.match(r'^All entries loaded$', t):
        return True
    if re.match(r'^Load More$', t):
        return True
    
    # Technical descriptions that are too niche
    if re.match(r'^UTC[+-]\d+.*$', t):
        return True
    
    return False

def extract_texts_from_html(filepath):
    """Extract visible text content from HTML, skipping non-translatable blocks."""
    with open(filepath, 'r') as f:
        content = f.read()
    
    # Remove non-translatable blocks
    content = re.sub(r'<script[^>]*>.*?</script>', '', content, flags=re.DOTALL|re.IGNORECASE)
    content = re.sub(r'<style[^>]*>.*?</style>', '', content, flags=re.DOTALL|re.IGNORECASE)
    content = re.sub(r'<pre[^>]*>.*?</pre>', '', content, flags=re.DOTALL|re.IGNORECASE)
    
    texts = set()
    for m in re.finditer(r'>([^<]+)<', content):
        text = m.group(1).strip()
        if not text:
            continue
        
        text = clean_text(text)
        
        if should_skip(text):
            continue
        
        # Additional check: skip if in notranslate context
        # Simple heuristic - check if notranslate appears nearby
        ctx_start = max(0, m.start() - 300)
        context = content[ctx_start:m.start()]
        if 'notranslate' in context:
            continue
        
        texts.add(text)
    
    return texts

all_texts = {}
for fname in FOCUS_FILES:
    path = fname
    if os.path.exists(path):
        texts = extract_texts_from_html(path)
        if texts:
            all_texts[fname] = sorted(texts)
            print(f"  {fname}: {len(texts)} texts")

total = sum(len(v) for v in all_texts.values())
print(f"\nTotal important untranslated texts: {total}")

# Print them all
for fname, texts in all_texts.items():
    print(f"\n=== {fname} ===")
    for t in texts:
        print(f"  - {t}")

# Save
with open('untranslated_ui_texts.json', 'w') as f:
    json.dump({k: list(v) for k, v in all_texts.items()}, f, indent=2, ensure_ascii=False)
