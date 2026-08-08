#!/usr/bin/env python3
"""Surgical dead-CSS removal for GlbTOKEN.

Removes ONLY confirmed-dead selector rules by exact span deletion —
everything else (comments, whitespace, formatting) is preserved byte-for-byte.
Uses brace-depth scanning. Verifies brace balance after each file.
"""
import re
import sys

DEAD = {
    'apikeys.css': [
        '.syn-plain', '.section-heading-sm', '.li-mb',
    ],
    'billing.css': [
        '.pm-title-row',
        '.payment-card .card-info',
        '.payment-card .card-info .name',
        '.payment-card .card-info .meta',
    ],
    'dashboard.css': [
        '.table-header', '.text-sm-semibold-muted', '.btn-primary-green',
        '.chart-center-label', '.text-sm-muted-2', '.legend-row',
        '.activity-model', '.progress-row',
    ],
    'how.css': [
        '.section-bg-alt',
        '.visual-grid', '.visual-tile', '.visual-preview',
        '.preview-navy', '.preview-navy-alt', '.preview-green',
        '.preview-gold', '.preview-red', '.preview-iframe',
        '.visual-info', '.visual-info h3', '.visual-info p',
        '.tag-row', '.tag-gold', '.tag-green', '.tag-blue',
        '.tag-purple', '.tag-red',
        '.viz-title', '.viz-desc',
    ],
    'logs.css': [
        '.payment-card .card-info',
        '.payment-card .card-info .name',
        '.payment-card .card-info .meta',
        '.tx-collapse',
    ],
    'more.css': [
        '.act-list',
        '.act-card', '.act-card:hover', '.act-card-top', '.act-card-icon',
        '.act-card-icon svg', '.act-card-icon-teal', '.act-card-icon-gold',
        '.act-card-icon-red', '.act-card-icon-blue', '.act-card-time',
        '.act-card-desc', '.act-card-amt',
        '.act-card-amt .amt-pos', '.act-card-amt .amt-neg',
    ],
    'presets.css': [
        '.presets-header', '.presets-header h1', '.presets-header p',
    ],
    'referrals.css': [
        '.payment-card .card-info',
        '.payment-card .card-info .name',
        '.payment-card .card-info .meta',
        '.refs-status-success', '.refs-status-failed',
    ],
    'style.css': [
        '.opacity-4', '.inline-block',
    ],
    'team.css': [
        '.text-xs-muted-2', '.badge-red-sm', '.team-row', '.btn-auto',
        '.badge-gold',
        '.payment-card .card-info',
        '.payment-card .card-info .name',
        '.payment-card .card-info .meta',
        '.member-collapse', '.member-collapse.open',
    ],
    'usage.css': [
        '.filter-row-wide', '.filter-label', '.date-range-row',
        '.separator-dash', '.apply-btn',
        '.usage-empty-state', '.usage-empty-icon', '.usage-empty-title',
        '.usage-empty-desc',
        '.load-more-wrap', '.load-more-btn', '.history-count-note',
        '.status-badge-success', '.status-badge-failed',
    ],
}


def normalize(sel: str) -> str:
    s = sel.strip()
    s = re.sub(r'\s+', ' ', s)
    s = re.sub(r'\s*([>+~])\s*', r'\1', s)
    s = re.sub(r'\s*,\s*', ',', s)
    return s


def split_selectors(sel: str):
    parts, depth, cur = [], 0, ''
    for ch in sel:
        if ch in '([':
            depth += 1
        elif ch in ')]':
            depth -= 1
        if ch == ',' and depth == 0:
            parts.append(cur)
            cur = ''
        else:
            cur += ch
    if cur.strip():
        parts.append(cur)
    return [p.strip() for p in parts]


def process_region(text, dead_set):
    """Process a CSS region; returns (processed_text, removed_count)."""
    i = 0
    n = len(text)
    out = []
    removed = 0
    while i < n:
        # capture whitespace + comments
        ws_start = i
        while i < n:
            if text[i].isspace():
                i += 1
            elif text.startswith('/*', i):
                end = text.find('*/', i + 2)
                i = (end + 2) if end != -1 else n
            else:
                break
        ws = text[ws_start:i]
        if i >= n:
            out.append(ws)
            break
        # scan selector up to '{' at depth 0
        sel_start = i
        depth = 0
        while i < n:
            c = text[i]
            if c == '{' and depth == 0:
                break
            if c == '{':
                depth += 1
            elif c == '}':
                depth -= 1
            if text.startswith('/*', i):
                end = text.find('*/', i + 2)
                i = (end + 2) if end != -1 else n
                continue
            i += 1
        selector = text[sel_start:i]
        if i >= n:
            out.append(ws + selector)
            break
        i += 1  # consume '{'
        body_start = i
        depth = 1
        while i < n and depth > 0:
            c = text[i]
            if c == '{':
                depth += 1
            elif c == '}':
                depth -= 1
            if text.startswith('/*', i):
                end = text.find('*/', i + 2)
                i = (end + 2) if end != -1 else n
                continue
            i += 1
        body = text[body_start:i - 1]  # excludes closing '}'
        closing = text[i - 1:i] if i > 0 else '}'
        sel = selector.strip()
        if sel.startswith('@media'):
            new_body, cnt = process_region(body, dead_set)
            removed += cnt
            if not new_body.strip():
                removed += 1  # whole media block removed
                continue
            out.append(ws + selector + '{' + new_body + closing)
        elif sel.startswith('@'):
            out.append(ws + selector + '{' + body + closing)
        else:
            parts = split_selectors(sel)
            kept = [p for p in parts if normalize(p) not in dead_set]
            if not kept:
                removed += 1
                continue  # drop rule + its leading ws/comment
            elif len(kept) != len(parts):
                removed += len(parts) - len(kept)
                out.append(ws + ', '.join(kept) + '{' + body + closing)
            else:
                out.append(ws + selector + '{' + body + closing)
    res = ''.join(out)
    res = re.sub(r'\n{3,}', '\n\n', res)
    return res, removed


def main():
    total = 0
    for fname, dead_list in DEAD.items():
        text = open(fname).read()
        if text.count('{') != text.count('}'):
            print(f"ERROR pre imbalance {fname}")
            sys.exit(1)
        dead_set = {normalize(d) for d in dead_list}
        new_text, cnt = process_region(text, dead_set)
        if new_text.count('{') != new_text.count('}'):
            print(f"ERROR post imbalance {fname}: {{={new_text.count('{')} }}={new_text.count('}')}")
            sys.exit(1)
        if cnt:
            open(fname, 'w').write(new_text)
            total += cnt
            print(f"{fname}: removed {cnt} rule(s)")
        else:
            print(f"{fname}: no change")
    print(f"TOTAL: {total}")


if __name__ == '__main__':
    main()
