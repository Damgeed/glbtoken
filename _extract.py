import os, re

workdir = '/Users/openclaw_007/projects/glbtoken'

# Texts that should NEVER be translated
SKIP_EXACT = {
    'EN', 'GT', 'if', 'in', 'A-Z', 'All', 'Pro', 'RPM', 'TPM', 'for', 'new',
    'Blog', 'Code', 'Date', 'Docs', 'Home', 'Meta', 'POST', 'Tier', 'True', 'Type', 'User',
    'chat', 'curl', 'from', 'role', 'text', 'About', 'Guide', 'Legal', 'Login',
    'Model', 'TOKEN', 'Terms', 'await', 'chunk', 'const', 'input', 'model',
    'parts', 'top_p', 'page.', 'Glb', 'FAQ', 'Email', 'Apple', 'Google', 'GitHub',
    'OpenAI', 'Stripe', 'Paystack', '0.5 GT', '0.8 GT', '1 GT', '5 GT', '6 GT',
    'USDT', 'BTC', 'ETH', 'NGN', 'GHS', 'KES', 'ZAR', 'USD', 'AED',
    'Sign in', 'sign in',
}

def needs_translation(t):
    if t in SKIP_EXACT:
        return False
    # Skip code/model/endpoint patterns
    code_patterns = [
        'client ', 'response ', 'stream ', 'messages', 'content', 'completion',
        'import ', 'pip ', 'console.', 'print(', 'const ', 'let ', 'var ',
        'apiKey:', 'api_key', 'baseURL:', 'base_url', 'base_url=',
        'header:', 'stream:', 'stream=', 'model:', 'model=',
        'api_key=', 'messages=[',
        'OpenAI({',
        'frequency_penalty', 'max_tokens',
        'messages:', 'content:',
        'and your',
    ]
    for p in code_patterns:
        if t.startswith(p):
            return False
    
    # Skip quoted strings (code examples)
    if t.startswith('"') and t.endswith('"'):
        return False
    if t.startswith("'") and t.endswith("'"):
        return False
    
    # Skip API endpoints
    if '/v1/' in t or '/v1beta/' in t:
        return False
    if '/messages' in t or '/completions' in t:
        return False
    
    # Skip model names
    model_pattern = r'\b(GPT-|Claude |Gemini |Llama |DeepSeek |Mistral |Qwen |Grok |Phi-|Command )'
    if re.search(model_pattern, t):
        return False
    
    # Skip lines with { } [ ] (code-like)
    braces = t.count('{') + t.count('}') + t.count('[') + t.count(']')
    if braces > 2 and not re.search(r'[A-Z][a-z]{2,}', t):
        return False
    
    # Skip emails
    if '@' in t:
        return False
    # Skip copyright
    if '©' in t:
        return False
    # Skip page titles
    if ' — GlbTOKEN' in t:
        return False
    # Skip pure emoji/symbol lines
    alpha = sum(1 for c in t if c.isalpha())
    if alpha < 3 and len(t) > 10:
        return False
    return True

all_texts = set()
for fname in sorted(os.listdir(workdir)):
    if not fname.endswith('.html'):
        continue
    with open(os.path.join(workdir, fname), 'r') as f:
        html = f.read()
    html = re.sub(r'<(script|style)[^>]*>.*?</\1>', '', html, flags=re.DOTALL)
    text = re.sub(r'<[^>]+>', '\n', html)
    text = text.replace('&amp;', '&').replace('&lt;', '<').replace('&gt;', '>')
    text = text.replace('&#39;', "'").replace('&quot;', '"')
    
    for line in text.split('\n'):
        line = line.strip()
        line = re.sub(r'\s+', ' ', line)
        if needs_translation(line) and len(line) >= 2:
            all_texts.add(line)

all_texts = sorted(all_texts, key=lambda x: (len(x), x))
print(f"Translatable UI texts: {len(all_texts)}")
for t in all_texts:
    print(repr(t))
