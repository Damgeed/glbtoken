#!/usr/bin/env python3
"""Scan inline <script> blocks in HTML files for innerHTML XSS and other issues."""
import re, glob, sys, tempfile, subprocess, os

data_fields = re.compile(r'(\.name|\.model|\.provider|\.status|\.email|\.amount|\.address|\.reference|\.asset|\.crypto_amount|\.title|\.desc|\.message|\.error|\.reason|\.public_id|\.balance|\.tokens|\.price|\.user|\.id|\.label|\.text)\b')

for f in sorted(glob.glob('*.html') + glob.glob('auth/*.html')):
    src = open(f, encoding='utf-8', errors='replace').read()
    blocks = re.findall(r'<script(?![^>]*src=)[^>]*>(.*?)</script>', src, re.S)
    for bi, b in enumerate(blocks):
        if not b.strip():
            continue
        lines = b.split('\n')
        for ln, l in enumerate(lines, 1):
            if 'innerHTML' in l:
                interps = re.findall(r'\$\{([^}]+)\}', l)
                if interps:
                    unescaped = [i.strip() for i in interps if 'escapeHtml' not in i]
                    if unescaped:
                        print(f'{f} [script{bi}]:{ln}: RAW={unescaped}')
                        print(f'    {l.strip()[:170]}')
                if '+' in l and 'escapeHtml' not in l and data_fields.search(l):
                    print(f'{f} [script{bi}]:{ln}: CONCAT: {l.strip()[:170]}')
        # syntax check the inline block
        with tempfile.NamedTemporaryFile('w', suffix='.js', delete=False) as tf:
            tf.write(b)
            tmp = tf.name
        r = subprocess.run(['node', '--check', tmp], capture_output=True, text=True)
        if r.returncode != 0:
            # node may choke on HTML entities / box chars in comments — report only
            print(f'{f} [script{bi}]: node --check FAILED: {r.stderr.strip()[:150]}')
        os.unlink(tmp)
print('inline scan done')
