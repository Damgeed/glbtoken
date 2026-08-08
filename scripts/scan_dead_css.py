#!/usr/bin/env python3
"""Find confirmed-dead CSS selectors: present in CSS but never referenced in
any HTML, JS, or other CSS file (as a string). Conservative — only reports
selectors with zero textual presence outside their own definition."""
import re, glob, sys

# 1. Gather all text from HTML + JS + translations (usage corpus)
usage_files = glob.glob('*.html') + glob.glob('auth/*.html') + glob.glob('*.js') + glob.glob('visuals/*.html')
corpus = '\n'.join(open(f, encoding='utf-8', errors='replace').read() for f in usage_files)

# 2. Parse every CSS file: selector -> body
def parse_css(text):
    """Yield (selector_text, body_text) for top-level rules; recurse into @media."""
    i, n = 0, len(text)
    out = []
    while i < n:
        if text[i].isspace():
            i += 1; continue
        if text.startswith('/*', i):
            end = text.find('*/', i+2); i = (end+2) if end != -1 else n; continue
        # scan selector
        start = i; depth = 0
        while i < n:
            c = text[i]
            if c == '{' and depth == 0: break
            if c == '{': depth += 1
            elif c == '}': depth -= 1
            if text.startswith('/*', i):
                end = text.find('*/', i+2); i = (end+2) if end != -1 else n; continue
            i += 1
        sel = text[start:i].strip()
        if i >= n: break
        i += 1
        body_start = i; depth = 1
        while i < n and depth > 0:
            c = text[i]
            if c == '{': depth += 1
            elif c == '}': depth -= 1
            if text.startswith('/*', i):
                end = text.find('*/', i+2); i = (end+2) if end != -1 else n; continue
            i += 1
        body = text[body_start:i-1]
        if sel.startswith('@media'):
            out.extend(parse_css(body))
        elif sel.startswith('@'):
            continue  # keyframes etc: skip
        else:
            out.append((sel, body))
    return out

def split_selectors(sel):
    parts, depth, cur = [], 0, ''
    for ch in sel:
        if ch in '([': depth += 1
        elif ch in ')]': depth -= 1
        if ch == ',' and depth == 0:
            parts.append(cur); cur = ''
        else:
            cur += ch
    if cur.strip(): parts.append(cur)
    return [p.strip() for p in parts]

def base_class(sel):
    """Extract the 'core' token from a selector: for .foo.bar / .foo .bar /
    .foo:hover / .foo::before → .foo. Also handle #id."""
    sel = re.sub(r'::?[a-z-]+(\([^)]*\))?$', '', sel)  # strip pseudo
    sel = re.sub(r'\[[^\]]*\]', '', sel)                # strip attrs
    # find first class or id token
    m = re.search(r'[.#][a-zA-Z0-9_-]+', sel)
    return m.group(0) if m else None

dead_candidates = []
all_defs = []
for fname in sorted(glob.glob('*.css')):
    text = open(fname, encoding='utf-8', errors='replace').read()
    if text.count('{') != text.count('}'):
        print(f'IMBALANCE {fname}: pre'); continue
    rules = parse_css(text)
    for sel, body in rules:
        for part in split_selectors(sel):
            core = base_class(part)
            if not core or core.startswith('--'):  # skip CSS vars
                continue
            if core.startswith('.') and not re.match(r'^[.#][a-zA-Z0-9_-]+$', core):
                continue
            all_defs.append((fname, core, sel, body))

# Also gather defined CSS vars
vars_defined = set()
for fname in glob.glob('*.css'):
    txt = open(fname, encoding='utf-8', errors='replace').read()
    vars_defined |= set(re.findall(r'(--[a-zA-Z0-9_-]+)\s*:', txt))

# Check each definition core against corpus + all CSS text (for composed selectors)
all_css_text = '\n'.join(open(f, encoding='utf-8', errors='replace').read() for f in glob.glob('*.css'))

seen = set()
for fname, core, sel, body in all_defs:
    if core in seen: continue
    seen.add(core)
    token = core.lstrip('.#')          # bare class/id name (no leading . or #)
    # usage: exact token anywhere in corpus (HTML/JS) — with word boundary
    if re.search(r'(?<![\w-])' + re.escape(token) + r'(?![\w-])', corpus):
        continue
    # Also check composed selector presence in CSS (e.g. .foo used in ".a .foo")
    # If the core token appears in any other selector text, it's used structurally
    used_in_css = False
    for f2, c2, s2, b2 in all_defs:
        if s2 is sel and b2 is body: continue
        if re.search(r'(?<![\w-])' + re.escape(token) + r'(?![\w-])', s2):
            used_in_css = True; break
    if used_in_css: continue
    dead_candidates.append((fname, core, sel.strip()[:120]))

for fname, core, sel in dead_candidates:
    print(f'{fname}: {core}  ({sel})')
print(f'TOTAL dead candidates: {len(dead_candidates)}')
