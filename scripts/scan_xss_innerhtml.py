#!/usr/bin/env python3
"""Exhaustive innerHTML XSS scan: enumerate EVERY ${...} interpolation and
every +var+ concatenation in innerHTML contexts; flag unescaped ones."""
import re, glob

# 1. Template-literal interpolations
print("=== TEMPLATE LITERALS (${...}) in innerHTML lines ===")
for f in sorted(glob.glob('*.js')):
    lines = open(f).read().split('\n')
    for ln, l in enumerate(lines, 1):
        if 'innerHTML' in l:
            interps = re.findall(r'\$\{([^}]+)\}', l)
            if interps:
                unescaped = [i.strip() for i in interps if 'escapeHtml' not in i]
                if unescaped:
                    print(f'{f}:{ln}: RAW={unescaped}')
                    print(f'    {l.strip()[:170]}')

# 2. String-concat innerHTML with data-ish fields
print("\n=== CONCAT innerHTML with data fields, no escapeHtml on line ===")
data_fields = re.compile(r'(\.name|\.model|\.provider|\.status|\.email|\.amount|\.address|\.reference|\.asset|\.crypto_amount|\.title|\.desc|\.message|\.error|\.reason|\.public_id|\.balance|\.tokens|\.price|\.user|\.id|\.label|\.text)\b')
for f in sorted(glob.glob('*.js')):
    lines = open(f).read().split('\n')
    for ln, l in enumerate(lines, 1):
        if 'innerHTML' in l and '+' in l and 'escapeHtml' not in l:
            if data_fields.search(l):
                print(f'{f}:{ln}: {l.strip()[:170]}')
