#!/usr/bin/env python3
"""Delete EARLIEST fully-overridden duplicate blocks from style.css (v2).

Character-offset based (no line-number drift). For each target selector,
removes the earliest top-level rule block [selector_start .. closing '}']
plus any comment directly above it. Bottom-up removal keeps offsets valid.
"""
import re, sys

path = 'style.css'
text = open(path).read()

def top_level_rules(text):
    """Return [(start, end, selector)] with char offsets for ALL rules (any depth)."""
    rules = []
    i, n, depth = 0, len(text), 0
    cursor = 0  # position right after previous rule's '}' (or 0)
    while i < n:
        if text.startswith('/*', i):
            end = text.find('*/', i + 2)
            i = (end + 2) if end != -1 else n
            continue
        c = text[i]
        if c == '{':
            sel_start = cursor  # selector text lives between cursor and '{'
            open_i = i  # position of this rule's '{'
            depth += 1
            while i < n:
                i += 1
                if i >= n:
                    break
                if text.startswith('/*', i):
                    end = text.find('*/', i + 2)
                    i = (end + 2) if end != -1 else n
                    continue
                if text[i] == '{':
                    depth += 1
                elif text[i] == '}':
                    depth -= 1
                    if depth == 0:
                        rules.append((sel_start, i, text[sel_start:open_i].strip()))
                        cursor = i + 1
                        i += 1
                        break
            continue
        i += 1
    return rules

def clean_sel(s):
    return re.sub(r'\s+', ' ', s).strip()

rules = top_level_rules(text)

# group by selector
from collections import defaultdict
by_sel = defaultdict(list)
for start, end, sel in rules:
    by_sel[clean_sel(sel)].append((start, end))

targets = [
    '.dash-balance .top',
    '.dash-balance .amount small',
    '.dash-balance .actions',
    '.dash-stats',
    '.dash-stat-card',
    '.dash-stat-card .lbl',
    '.dash-stat-card .chg',
    '.modal-close',
    '.dash-section-title',
    '.tx-table',
    '.tx-table th',
    '.dash-activity',
    '.sort-btn:hover',
]

spans = []  # (start, end) char offsets to remove
for sel in targets:
    occ = by_sel.get(sel, [])
    if len(occ) < 2:
        print(f"SKIP (not duplicated): {sel}")
        continue
    earliest = occ[0]  # sorted by parse order = file order
    s, e = earliest
    # absorb a comment directly above (only whitespace between)
    prefix = text[:s]
    m = list(re.finditer(r'/\*.*?\*/', prefix, re.S))
    if m:
        cm = m[-1]
        between = prefix[cm.end():s]
        if between.strip() == '':
            s = cm.start()
    spans.append((s, e))
    print(f"DELETE {sel}: chars {s}-{e} ({text[s:s+60].splitlines()[0]!r}...)")

# sanity: no overlaps
spans.sort()
for a, b in zip(spans, spans[1:]):
    if b[0] <= a[1]:
        print(f"OVERLAP ERROR: {a} vs {b}")
        sys.exit(1)

# remove bottom-up
out = text
for s, e in reversed(spans):
    out = out[:s] + out[e+1:]

# collapse 3+ blank lines to 2
out = re.sub(r'\n{4,}', '\n\n\n', out)

open(path, 'w').write(out)

o = out.count('{')
c = out.count('}')
print(f"braces: {o} open, {c} close, {'OK' if o == c else 'IMBALANCE!'}")

# verify each target still has exactly 1 top-level block
rules2 = top_level_rules(out)
by_sel2 = defaultdict(list)
for start, end, sel in rules2:
    by_sel2[clean_sel(sel)].append((start, end))
for sel in targets:
    print(f"  {sel}: {len(by_sel2.get(sel, []))} block(s) remaining")
