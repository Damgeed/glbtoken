#!/usr/bin/env python3
"""
GlbTOKEN i18n — Extract clean English text, translate via Google Translate,
generate translations.js with English→translation lookup.
No HTML files are modified — the JS walks text nodes at runtime.
"""

import os, re, json, html as htmlmod
from collections import OrderedDict
from deep_translator import GoogleTranslator

WORKDIR = '/Users/openclaw_007/projects/glbtoken'
LANG_MAP = {'zh-CN': 'zh-CN', 'ru': 'ru', 'ja': 'ja', 'de': 'de'}

# Strings that should NEVER be translated
PROTECTED = {
    'GlbTOKEN', 'Glb', 'TOKEN', 'GPT', 'OpenAI', 'Claude', 'Gemini',
    'DeepSeek', 'Llama', 'Mistral', 'Stripe', 'Paystack',
    'USDT', 'BTC', 'ETH', 'BNB', 'SOL', 'USDC',
    'Dashboard', 'EN', 'RU', 'DE', 'API', 'GPT-4o', 'GPT-5',
    'gpt-4', 'gpt-5', 'claude-3', 'claude-4', 'gemini-2', 'gemini-3',
    'gpt-4o-mini', 'sk-', 'Authorization', 'Bearer',
    '🇬🇧 English', '🇨🇳 中文', '🇷🇺 Русский', '🇯🇵 日本語', '🇩🇪 Deutsch',
    '🌙', '☀️', '‹', '›', '✕', '➤',
    'notranslate'
}

def is_protected(text):
    text_stripped = text.strip()
    for p in PROTECTED:
        if p in text_stripped or text_stripped in p:
            return True
    return False

def extract_ui_text():
    """Extract unique UI text strings from all HTML files."""
    texts = OrderedDict()
    
    for fname in sorted(os.listdir(WORKDIR)):
        if not fname.endswith('.html'):
            continue
        
        with open(os.path.join(WORKDIR, fname)) as f:
            content = f.read()
        
        # Remove script, style, SVG content
        cleaned = re.sub(r'<(script|style|svg)[^>]*>.*?</\1>', '', content, flags=re.DOTALL)
        cleaned = re.sub(r'<pre[^>]*>.*?</pre>', '', cleaned, flags=re.DOTALL)
        cleaned = re.sub(r'<code[^>]*>.*?</code>', '', cleaned, flags=re.DOTALL)
        
        # Remove tags, keep text
        text = re.sub(r'<[^>]+>', '\n', cleaned)
        text = htmlmod.unescape(text)
        
        for line in text.split('\n'):
            line = line.strip()
            # Filter: too short, pure symbols, URLs, tokens, numbers
            if len(line) < 2: continue
            if re.match(r'^[\d\s,.%$#(){}\[\]/\\@:;\"\'+=*&|^~`<>!?°©®™€¥₿\-\s]+$', line): continue
            if line.startswith(('http://', 'https://', '/api', 'sk-', 'Bearer ')): continue
            if len(line) > 200: continue  # Skip very long strings
            if is_protected(line): continue
            
            # Normalize whitespace
            line = re.sub(r'\s+', ' ', line).strip()
            texts[line] = texts.get(line, 0) + 1
    
    return texts

def translate_batch(texts, target_lang):
    """Translate a batch of texts."""
    translator = GoogleTranslator(source='en', target=target_lang)
    items = list(texts.keys())
    result = {}
    
    for i in range(0, len(items), 100):
        batch = items[i:i+100]
        try:
            translated = translator.translate_batch(batch)
            for orig, trans in zip(batch, translated):
                result[orig] = trans
        except Exception as e:
            print(f"  Batch {i//100+1} failed: {e}")
            # Individual fallback
            for text in batch:
                try:
                    result[text] = translator.translate(text)
                except:
                    result[text] = text
    
    return result

if __name__ == '__main__':
    os.makedirs(os.path.join(WORKDIR, 'scripts'), exist_ok=True)
    
    print("Extracting UI text from 21 HTML files...")
    texts = extract_ui_text()
    print(f"Found {len(texts)} unique strings to translate")
    
    # Save English source for reference
    src_path = os.path.join(WORKDIR, 'scripts', 'en_strings.json')
    with open(src_path, 'w') as f:
        json.dump(list(texts.keys()), f, indent=2, ensure_ascii=False)
    print(f"Saved English strings to {src_path}")
    
    # Translate
    all_translations = {'en': {t: t for t in texts}}
    for lang_code, gt_code in LANG_MAP.items():
        print(f"\nTranslating to {lang_code}...")
        all_translations[lang_code] = translate_batch(texts, gt_code)
        print(f"  Done: {len(all_translations[lang_code])} strings")
    
    # Generate translations.js
    lines = ['// GlbTOKEN i18n — auto-generated translation dictionary', '// Lookup: TRANSLATIONS["English Text"]["zh-CN"]', '', 'const TRANSLATIONS = {};', '']
    
    for text in texts:
        en = text.replace("'", "\\'").replace('"', '\\"')
        zh = all_translations.get('zh-CN', {}).get(text, text).replace("'", "\\'").replace('"', '\\"')
        ru = all_translations.get('ru', {}).get(text, text).replace("'", "\\'").replace('"', '\\"')
        ja = all_translations.get('ja', {}).get(text, text).replace("'", "\\'").replace('"', '\\"')
        de = all_translations.get('de', {}).get(text, text).replace("'", "\\'").replace('"', '\\"')
        
        lines.append(f'TRANSLATIONS[{json.dumps(text)}] = {{en: {json.dumps(en)}, "zh-CN": {json.dumps(zh)}, ru: {json.dumps(ru)}, ja: {json.dumps(ja)}, de: {json.dumps(de)}}};')
    
    # Add the switch function
    lines.extend(['',
    'let currentLang = localStorage.getItem(\'gt_lang\') || \'en\';',
    '',
    'function switchLanguage(lang) {',
    '  currentLang = lang;',
    "  localStorage.setItem('gt_lang', lang);",
    '  translatePage();',
    '  updateLangUI(lang);',
    '}',
    '',
    'function translatePage() {',
    '  if (currentLang === \'en\') return;',
    '  var walker = document.createTreeWalker(document.body, 4, null, false);',
    '  var nodes = [];',
    '  while (walker.nextNode()) nodes.push(walker.currentNode);',
    '  for (var i = 0; i < nodes.length; i++) {',
    '    var n = nodes[i];',
    '    if (!n.parentNode) continue;',
    '    if (n.parentNode.closest && n.parentNode.closest(\'.notranslate,[translate="no"],script,style,svg,code,pre,option,.lang-selector,.lang-menu,.lang-option,.nav-logo,.logo-glb,.logo-token,.trust-badge,.star,.tm-dot,.copying\')) continue;',
    '    var text = n.textContent.trim();',
    '    if (!text || text.length < 2) continue;',
    '    if (TRANSLATIONS[text] && TRANSLATIONS[text][currentLang]) {',
    '      n.textContent = TRANSLATIONS[text][currentLang];',
    '    }',
    '  }',
    '}',
    '',
    'function updateLangUI(lang) {',
    "  document.querySelectorAll('.lang-option').forEach(function(el) {",
    "    el.classList.toggle('active', el.getAttribute('data-lang') === lang);",
    '  });',
    "  var lbl = document.getElementById('currentLangLabel');",
    "  if (lbl) lbl.textContent = lang === 'zh-CN' ? '中文' : lang === 'en' ? 'EN' : lang === 'ru' ? 'RU' : lang === 'ja' ? '日' : 'DE';",
    "  var lm = document.getElementById('langMenu');",
    "  if (lm) lm.classList.remove('open');",
    '}',
    '',
    '// Apply language on load',
    '(function() {',
    "  var saved = localStorage.getItem('gt_lang');",
    "  if (saved && saved !== 'en') { switchLanguage(saved); }",
    '})();',
    ''])
    
    js_path = os.path.join(WORKDIR, 'translations.js')
    with open(js_path, 'w') as f:
        f.write('\n'.join(lines))
    
    print(f"\nGenerated translations.js ({len(lines)} lines, {os.path.getsize(js_path)} bytes)")
    print("\nDone! Now:")
    print("1. Add <script src='translations.js'></script> to all HTML files")
    print("2. Remove GT-related code from script.js")
    print("3. Update switchLanguage calls to use the new function")
