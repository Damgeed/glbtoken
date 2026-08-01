#!/usr/bin/env python3
"""
GlbTOKEN i18n incremental updater.
Extracts English UI text from all HTML files, compares against existing
translations.js (TRANS + I18N_MIXED), translates ONLY missing strings via
Google Translate, and appends new entries. Existing translations are never
overwritten. Runs safely on a cron schedule (30 min).

Usage:
  python3 scripts/i18n_update.py [--commit]
"""
import os, re, json, html as htmlmod, sys, subprocess, socket
from collections import OrderedDict
from deep_translator import GoogleTranslator

# Fail fast on unreachable translation hosts — don't hang the cron run
socket.setdefaulttimeout(8)

WORKDIR = '/Users/openclaw_007/projects/glbtoken'
TRANS_JS = os.path.join(WORKDIR, 'translations.js')
STATE_FILE = os.path.join(WORKDIR, 'scripts/.i18n_state.json')
LANG_MAP = {'zh-CN': 'zh-CN', 'ru': 'ru', 'ja': 'ja', 'de': 'de'}

def load_state():
    """Load per-language translation checkpoint so killed runs resume (SIGTERM-safe)."""
    try:
        with open(STATE_FILE) as f:
            return json.load(f)
    except Exception:
        return {}

def save_state(state):
    tmp = STATE_FILE + '.tmp'
    with open(tmp, 'w') as f:
        json.dump(state, f, ensure_ascii=False)
    os.replace(tmp, STATE_FILE)

# Strings that should NEVER be translated
PROTECTED = {
    'GlbTOKEN', 'Glb', 'TOKEN', 'GPT', 'OpenAI', 'Claude', 'Gemini',
    'DeepSeek', 'Llama', 'Mistral', 'Stripe', 'Paystack',
    'USDT', 'BTC', 'ETH', 'BNB', 'SOL', 'USDC',
    'Dashboard', 'EN', 'RU', 'DE', 'API', 'GPT-4o', 'GPT-5',
    'gpt-4', 'gpt-5', 'claude-3', 'claude-4', 'gemini-2', 'gemini-3',
    'gpt-4o-mini', 'sk-', 'Authorization', 'Bearer',
    '🇬🇧 English', '🇨🇳 中文', '🇷🇺 Русский', '🇯🇵 日本語', '🇩🇪 Deutsch',
    '🌙', '☀️', '‹', '›', '✕', '➤', '▾', '✔', '⧉',
    'notranslate', 'API Request', 'Python', 'cURL', 'Copy', 'Model',
    'Playground', 'Presets', 'Overview', 'API Keys', 'Logs', 'Team',
    'Referrals', 'Usage & History', 'Settings', 'Notifications',
    'GLB-', 'YOUR_GLBTOKEN_API_KEY', 'https://', 'http://', 'api.glbtoken.com'
}

def is_protected(text):
    text_stripped = text.strip()
    for p in PROTECTED:
        if p in text_stripped or text_stripped in p:
            return True
    return False

def extract_ui_text():
    """Extract unique UI text strings from all HTML files (same as before)."""
    texts = OrderedDict()
    for fname in sorted(os.listdir(WORKDIR)):
        if not fname.endswith('.html'):
            continue
        with open(os.path.join(WORKDIR, fname)) as f:
            content = f.read()
        cleaned = re.sub(r'<(script|style|svg)[^>]*>.*?</\1>', '', content, flags=re.DOTALL)
        cleaned = re.sub(r'<pre[^>]*>.*?</pre>', '', cleaned, flags=re.DOTALL)
        cleaned = re.sub(r'<code[^>]*>.*?</code>', '', cleaned, flags=re.DOTALL)
        text = re.sub(r'<[^>]+>', '\n', cleaned)
        text = htmlmod.unescape(text)
        for line in text.split('\n'):
            line = line.strip()
            if len(line) < 2: continue
            if re.match(r'^[\d\s,.%$#(){}\[\]/\\@:;"\'+=*&|^~`<>!?°©®™€¥₿\-\s]+$', line): continue
            if line.startswith(('http://', 'https://', '/api', 'sk-', 'Bearer ')): continue
            if len(line) > 200: continue
            if is_protected(line): continue
            line = re.sub(r'\s+', ' ', line).strip()
            texts[line] = texts.get(line, 0) + 1
    return texts

def load_existing():
    """Parse translations.js and return existing TRANS keys + I18N_MIXED keys."""
    existing = set()
    mixed = set()
    if not os.path.exists(TRANS_JS):
        return existing, mixed
    with open(TRANS_JS) as f:
        content = f.read()
    # TRANS["..."] = {...};
    for m in re.finditer(r'TRANS\[((?:"[^"]*")|(?:\'[^\']*\'))\]\s*=', content):
        try:
            existing.add(json.loads(m.group(1)))
        except Exception:
            pass
    # I18N_MIXED["key"] = {...};
    for m in re.finditer(r'I18N_MIXED\[((?:"[^"]*")|(?:\'[^\']*\'))\]\s*=', content):
        try:
            mixed.add(json.loads(m.group(1)))
        except Exception:
            pass
    return existing, mixed

def extract_mixed_keys():
    """Find data-i18n attributes in HTML that reference I18N_MIXED keys."""
    keys = OrderedDict()  # key -> English text content
    for fname in sorted(os.listdir(WORKDIR)):
        if not fname.endswith('.html'):
            continue
        with open(os.path.join(WORKDIR, fname)) as f:
            content = f.read()
        # Only look at non-script/style blocks
        cleaned = re.sub(r'<(script|style)[^>]*>.*?</\1>', '', content, flags=re.DOTALL)
        for m in re.finditer(r'data-i18n="([^"]+)"[^>]*>(.*?)</', cleaned, flags=re.DOTALL):
            key = m.group(1)
            inner = m.group(2)
            # Skip if contains child tags (mixed HTML content needs manual review)
            if re.search(r'<(?!br\s*/?)[a-z]', inner, flags=re.I):
                continue
            text = re.sub(r'<[^>]+>', '', inner)
            text = htmlmod.unescape(text).strip()
            if text and len(text) >= 2:
                keys[key] = text
    return keys

def translate_text(text, target_lang):
    """Translate a single string. Tries MyMemory first (reliable), Google as backup.
    Returns None if translation genuinely failed (quota/network) so callers can defer."""
    gt_code = {'zh-CN': 'zh-CN', 'ru': 'ru', 'ja': 'ja', 'de': 'de'}[target_lang]
    # 1) MyMemory (free, 50k chars/day with email key, confirmed reachable)
    try:
        import urllib.parse, urllib.request
        url = ('https://api.mymemory.translated.net/get?q=' + urllib.parse.quote(text)
               + '&langpair=en|' + gt_code + '&de=glbtoken-i18n%40kai.com')
        with urllib.request.urlopen(url, timeout=8) as r:
            d = json.loads(r.read().decode())
        if d.get('responseStatus') == 200:
            out = d['responseData']['translatedText']
            # Quota-exhausted responses come back as 200 with a warning message
            if 'MYMEMORY WARNING' in out.upper() or out.upper().startswith('MYMEMORY'):
                return None
            if out and out.strip() and out != text:
                return out
    except Exception:
        pass
    # 2) Google translate via urllib (hard timeout — deep_translator ignores socket timeouts)
    try:
        import urllib.parse, urllib.request
        gurl = ('https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl='
                + gt_code + '&dt=t&q=' + urllib.parse.quote(text))
        req = urllib.request.Request(gurl, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=6) as r:
            gd = json.loads(r.read().decode())
        if gd and gd[0]:
            out = ''.join(seg[0] for seg in gd[0] if seg and seg[0])
            if out and out.strip() and out != text:
                return out
    except Exception:
        pass
    return None

def translate_batch(items, target_lang):
    result = {}
    for i, text in enumerate(items):
        result[text] = translate_text(text, target_lang)
        if (i + 1) % 25 == 0:
            print(f"    {i+1}/{len(items)}...", flush=True)
    return result

def js_str(s):
    return json.dumps(s, ensure_ascii=False)

def main():
    commit = '--commit' in sys.argv
    existing, mixed = load_existing()
    print(f"Existing TRANS keys: {len(existing)}, I18N_MIXED keys: {len(mixed)}")

    # 1. Plain text strings
    texts = extract_ui_text()
    new_texts = OrderedDict((t, c) for t, c in texts.items() if t not in existing)
    # Drop fragments that are substrings of another candidate or existing key —
    # they're broken pieces of larger sentences (e.g. "after signing up.") that
    # will never match a full text node at runtime.
    all_keys = set(texts.keys()) | existing
    frags = [t for t in new_texts if any(t != k and t in k for k in all_keys)]
    for t in frags:
        del new_texts[t]
    print(f"Extracted {len(texts)} strings; {len(new_texts)} NEW to translate ({len(frags)} fragments dropped)")

    new_entries = []
    if new_texts:
        # Per-run char budget: translate at most ~12k source chars per run so
        # all 4 languages (4x budget) stay under MyMemory's 50k/day quota and
        # each cron tick is bounded. Remaining strings get picked up on the
        # next run.
        CHAR_BUDGET = 12000
        budget_items = []
        used = 0
        for t, c in new_texts.items():
            if used + len(t) > CHAR_BUDGET:
                continue
            budget_items.append(t)
            used += len(t)
        print(f"Translating {len(budget_items)} strings (~{used} chars) to 4 languages...")
        state = load_state()
        state.setdefault('plain', {})
        all_translations = {}
        for lang_code in LANG_MAP:
            cached = state['plain'].get(lang_code, {})
            todo = [t for t in budget_items if t not in cached]
            if todo:
                print(f"  → {lang_code}... ({len(todo)} new, {len(budget_items) - len(todo)} cached)", flush=True)
                fresh = translate_batch(todo, LANG_MAP[lang_code])
                cached.update(fresh)
                state['plain'][lang_code] = cached
                save_state(state)  # checkpoint after every language — SIGTERM-safe
            else:
                print(f"  → {lang_code}... (cached)", flush=True)
            all_translations[lang_code] = cached
        written_texts = []
        for text in budget_items:
            # Only write entries where ALL 4 languages translated successfully.
            # Partial/failed strings are deferred to the next run (never written as English).
            langs = {}
            ok = True
            for lang_code in LANG_MAP:
                trans = all_translations.get(lang_code, {}).get(text)
                if not trans or trans == text:
                    ok = False
                    break
                langs[lang_code] = trans
            if not ok:
                continue
            written_texts.append(text)
            row = [f'TRANS[{js_str(text)}] = {{en: {js_str(text)}']
            for lang_code in LANG_MAP:
                row.append(f'{js_str(lang_code)}: {js_str(langs[lang_code])}')
            row.append('};')
            new_entries.append(''.join(row))
        # Prune checkpoint: drop texts that were written; keep deferred partial progress
        if written_texts:
            written_set = set(written_texts)
            state['plain'] = {lang: {t: tr for t, tr in d.items() if t not in written_set}
                              for lang, d in state['plain'].items()}
            save_state(state)
        if len(new_entries) < len(budget_items):
            print(f"  (deferred {len(budget_items) - len(new_entries)} strings — quota/network, next run will retry)")

    # 2. New I18N_MIXED keys (plain-text data-i18n elements)
    mixed_keys = extract_mixed_keys()
    new_mixed = OrderedDict((k, v) for k, v in mixed_keys.items() if k not in mixed)
    print(f"data-i18n keys: {len(mixed_keys)}; {len(new_mixed)} NEW I18N_MIXED to translate")

    new_mixed_entries = []
    if new_mixed:
        state = load_state()
        state.setdefault('mixed', {})
        all_translations = {}
        for lang_code in LANG_MAP:
            cached = state['mixed'].get(lang_code, {})
            todo = [v for v in new_mixed.values() if v not in cached]
            if todo:
                print(f"Translating {len(new_mixed)} mixed keys to {lang_code}... ({len(todo)} new)", flush=True)
                fresh = translate_batch(todo, LANG_MAP[lang_code])
                cached.update(fresh)
                state['mixed'][lang_code] = cached
                save_state(state)  # checkpoint after every language — SIGTERM-safe
            all_translations[lang_code] = cached
        written_mixed = []
        for key, en_text in list(new_mixed.items()):
            new_mixed[key] = {'en': en_text}
            for lang_code in LANG_MAP:
                trans = all_translations[lang_code].get(en_text, en_text)
                new_mixed[key][lang_code] = trans
        # Only keep keys where all languages translated; defer partial ones
        for key in list(new_mixed.keys()):
            d = new_mixed[key]
            if any(not d.get(lang) or d.get(lang) == d['en'] for lang in LANG_MAP):
                del new_mixed[key]
        for key, d in new_mixed.items():
            written_mixed.append(d['en'])
            row = [f'I18N_MIXED[{js_str(key)}] = {{en: {js_str(d["en"])}']
            for lang_code in LANG_MAP:
                row.append(f'{js_str(lang_code)}: {js_str(d.get(lang_code, d["en"]))}')
            row.append('};')
            new_mixed_entries.append(''.join(row))
        if written_mixed:
            written_set = set(written_mixed)
            state['mixed'] = {lang: {t: tr for t, tr in d.items() if t not in written_set}
                              for lang, d in state['mixed'].items()}
            save_state(state)

    if not new_entries and not new_mixed_entries:
        print("No new strings to translate. Up to date.")
        return

    # 3. Append to translations.js before the I18N_MIXED section marker
    with open(TRANS_JS) as f:
        content = f.read()

    marker = '// ── I18N_MIXED: HTML-safe translations for mixed-content elements ──'
    if new_entries:
        block = '\n\n' + '\n'.join(new_entries) + '\n\n'
        if marker in content:
            content = content.replace(marker, block + marker, 1)
        else:
            content = content.rstrip() + '\n' + block

    if new_mixed_entries:
        # Append new mixed entries after the last I18N_MIXED line (before the IIFE at end)
        block = '\n' + '\n'.join(new_mixed_entries) + '\n'
        # Insert before the final auto-translate IIFE
        iife_marker = '(function() {\n  var saved = localStorage.getItem'
        if iife_marker in content:
            content = content.replace(iife_marker, block + '\n' + iife_marker, 1)
        else:
            content = content.rstrip() + '\n' + block

    with open(TRANS_JS, 'w') as f:
        f.write(content)

    print(f"\n✅ Appended {len(new_entries)} TRANS entries + {len(new_mixed_entries)} I18N_MIXED entries")

    # 4. Verify JS syntax
    r = subprocess.run(['node', '--check', TRANS_JS], capture_output=True, text=True)
    if r.returncode != 0:
        print(f"❌ JS syntax error: {r.stderr[:500]}")
        sys.exit(1)
    print("✅ JS syntax OK")

    if commit:
        r = subprocess.run(['git', '-C', WORKDIR, 'add', 'translations.js'], capture_output=True, text=True)
        r = subprocess.run(['git', '-C', WORKDIR, 'commit', '-m',
                            f'i18n: auto-translate {len(new_entries)} new strings + {len(new_mixed_entries)} mixed keys'],
                           capture_output=True, text=True)
        if r.returncode == 0:
            r = subprocess.run(['git', '-C', WORKDIR, 'push'], capture_output=True, text=True)
            print("✅ Committed and pushed" if r.returncode == 0 else f"⚠️ push failed: {r.stderr[:300]}")
        else:
            print("ℹ️ Nothing to commit or commit failed")

if __name__ == '__main__':
    main()
