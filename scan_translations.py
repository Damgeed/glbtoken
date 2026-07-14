#!/usr/bin/env python3
"""Scan all HTML files for untranslated English text and generate translations."""
import re, os, json, html
from html.parser import HTMLParser

os.chdir(os.path.expanduser('~/projects/glbtoken'))

# Load existing TRANS keys
with open('translations.js', 'r') as f:
    js = f.read()

# Extract all existing TRANS keys
existing_keys = set()
for m in re.finditer(r'TRANS\["([^"]+)"\]\s*=', js):
    existing_keys.add(m.group(1))
# Also handle single-quote keys
for m in re.finditer(r"TRANS\['([^']+)'\]\s*=", js):
    existing_keys.add(m.group(1))

print(f"Existing TRANS keys: {len(existing_keys)}")

# Scan all HTML files for visible English text
html_files = sorted([f for f in os.listdir('.') if f.endswith('.html')])
print(f"HTML files found: {len(html_files)}")

# Skip tags that contain non-translatable content
SKIP_TAGS = {'script', 'style', 'code', 'pre', 'svg', 'path', 'line', 'circle', 
             'rect', 'polyline', 'polygon', 'stop', 'defs', 'linearGradient',
             'option', 'select', 'input', 'textarea'}

SKIP_CLASSES = {'notranslate', 'lang-selector', 'lang-menu', 'lang-option', 
                'nav-logo', 'logo-glb', 'logo-token', 'trust-badge',
                'lang-btn', 'lang-btn-mobile'}

TECHNICAL_TERMS = {'API', 'SDK', 'JSON', 'URL', 'USD', 'GT', 'GPT', 'SSE',
                   'RPM', 'TPM', 'ID', 'IP', 'SMS', '2FA', 'CSS', 'HTML',
                   'HTTP', 'HTTPS', 'NGN', 'BTC', 'USDT', 'REST', 'AI',
                   'UI', 'GitHub', 'OpenAI', 'Stripe', 'Paystack', 'GMT',
                   'CET', 'SGT', 'EST', 'UTC'}

MODEL_NAMES = {'gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'claude-3.5-sonnet',
               'claude-3-opus', 'gemini-2.0', 'llama-3.1-405b', 'deepseek-v3',
               'mistral-large', 'gpt-4', 'GPT-4o', 'GPT-4o Mini', 'GPT-4 Turbo',
               'Claude 3.5 Sonnet', 'Claude 3 Opus', 'Gemini 2.0 Flash',
               'Llama 3.1 405B', 'DeepSeek V3', 'Mistral Large', 'Llama 4 Maverick'}

def is_technical(text):
    """Check if text is technical/not worth translating."""
    t = text.strip()
    if not t or len(t) < 2:
        return True
    # Skip if starts with currency/number
    if re.match(r'^[\$\€\£\₦\¥]\s*\d', t):
        return True
    # Skip if purely numeric or price-like
    if re.match(r'^[\d,.\s]+$', t):
        return True
    # Skip if looks like a version/date
    if re.match(r'^\d+\.\d+(\.\d+)?$', t):
        return True
    # Skip model names
    if t in MODEL_NAMES:
        return True
    # Skip pure technical terms (single word, all caps)
    if re.match(r'^[A-Z][A-Z0-9_/\-.]{1,10}$', t) and not any(c.islower() for c in t):
        return True
    # Skip single letters/words that are likely nav labels
    if len(t.split()) == 1 and len(t) <= 2 and t.upper() == t:
        return True
    return False

def clean_text(text):
    """Clean HTML text for translation key matching."""
    text = html.unescape(text)
    text = re.sub(r'\s+', ' ', text).strip()
    return text

def extract_text_from_html(filepath):
    """Extract visible English text nodes from HTML, skipping code/pre/script."""
    texts = set()
    
    with open(filepath, 'r') as f:
        content = f.read()
    
    # Remove script and style blocks
    content = re.sub(r'<script[^>]*>.*?</script>', '', content, flags=re.DOTALL|re.IGNORECASE)
    content = re.sub(r'<style[^>]*>.*?</style>', '', content, flags=re.DOTALL|re.IGNORECASE)
    content = re.sub(r'<pre[^>]*>.*?</pre>', '', content, flags=re.DOTALL|re.IGNORECASE)
    content = re.sub(r'<code[^>]*>.*?</code>', '', content, flags=re.DOTALL|re.IGNORECASE)
    content = re.sub(r'<svg[^>]*>.*?</svg>', '', content, flags=re.DOTALL|re.IGNORECASE)
    
    # Find text between tags
    # Get all text content between > and <
    for m in re.finditer(r'>([^<]+)<', content):
        text = m.group(1).strip()
        if not text:
            continue
        
        # Skip if it's in a notranslate context
        # Find the surrounding tag
        before = content[:m.start()]
        if 'class="notranslate' in before[:200] or 'notranslate' in before.split('>')[-1] if '>' in before else False:
            continue
            
        text = clean_text(text)
        
        # Skip technical strings
        if is_technical(text):
            continue
            
        # Skip strings with HTML entity codes
        if '&' in text and ';' in text:
            continue
            
        # Skip strings that are entirely numbers/symbols
        if re.match(r'^[\d\s\.,:;\-–—()\[\]{}]+$', text):
            continue
            
        # Skip strings that already exist
        if text in existing_keys:
            continue
            
        # Skip very short strings
        if len(text) < 3:
            continue
            
        # Skip single words that are nav items (already in existing_keys mostly)
        # Keep multi-word phrases
        texts.add(text)
    
    return texts

all_untranslated = {}

for fname in html_files:
    texts = extract_text_from_html(fname)
    if texts:
        all_untranslated[fname] = sorted(texts)
        print(f"  {fname}: {len(texts)} untranslated texts")

total = sum(len(v) for v in all_untranslated.values())
print(f"\nTotal untranslated texts found: {total}")

# Write them to a JSON file for manual review
with open('untranslated_texts.json', 'w') as f:
    json.dump({k: list(v) for k, v in all_untranslated.items()}, f, indent=2, ensure_ascii=False)

print(f"\nSaved to untranslated_texts.json")
