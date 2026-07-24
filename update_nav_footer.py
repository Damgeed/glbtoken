#!/usr/bin/env python3
"""
Bulk-update all HTML files to use nav.js and footer.js injection.
Comments out the original inline nav/footer and adds injection container divs + script tags.
"""

import os
import re

PROJECT_DIR = os.path.expanduser('~/projects/glbtoken')
SKIP_FILES = {'update_nav_footer.py'}

# Unique marker in the mobile-overlay signout link
SIGNOUT_MARKER = 'closeMobile();setTimeout(function(){logoutUser()},250)'

SCRIPT_MARKERS = [
    '<script src="translations.js',
    '<script data-cfasync="false" src="shared.js',
]


def find_nav_end(content, start_pos):
    """Find end of nav block by locating the signout marker and counting closing divs."""
    pos = content.find(SIGNOUT_MARKER, start_pos)
    if pos == -1:
        return -1

    # Find the end of the signout link </a></div>
    link_end = content.find('</a></div>', pos)
    if link_end == -1:
        return -1

    after_link = link_end + len('</a></div>')

    # Count 3 more </div> tags to close mobile-account-card, mobileUserSection, mobile-overlay
    div_count = 0
    current = after_link
    while div_count < 3 and current < len(content):
        next_div = content.find('</div>', current)
        if next_div == -1:
            break
        div_count += 1
        current = next_div + 6

    if div_count >= 3:
        return current
    return -1


def get_active_page_and_logo(content):
    """Determine active page from nav-center links and logo active state."""
    active_page = ''
    logo_active = False

    if 'class="nav-logo active"' in content or 'class="nav-logo active notranslate"' in content:
        logo_active = True

    nc_match = re.search(r'<div class="nav-center" id="navCenter">(.*?)</div>', content, re.DOTALL)
    if nc_match:
        nav_center = nc_match.group(1)
        active_links = re.findall(r'<a href="([^"]*)"[^>]*class="active"', nav_center)
        if active_links:
            page_map = {
                'index.html': 'home',
                'pricing.html': 'pricing',
                'how.html': 'how',
                'models.html': 'models',
                'apikeys.html': 'docs',
            }
            for href in active_links:
                if href != 'index.html':
                    active_page = page_map.get(href, '')
                    break
            if not active_page and active_links:
                active_page = page_map.get(active_links[0], '')

    return active_page, logo_active


def process_file(filepath):
    relpath = os.path.relpath(filepath, PROJECT_DIR)
    print(f"Processing: {relpath}")

    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    original = content

    # === 1. Replace nav: comment out original and add container ===
    nav_start = content.find('<nav class="navbar">')
    if nav_start == -1:
        print(f"  SKIP: No navbar found")
        return False

    nav_end = find_nav_end(content, nav_start)
    if nav_end == -1:
        print(f"  ERROR: Cannot find mobile-overlay end")
        return False

    nav_block = content[nav_start:nav_end]
    active_page, logo_active = get_active_page_and_logo(nav_block)

    data_attrs = f'data-active-page="{active_page}"'
    if logo_active:
        data_attrs += ' data-logo-active="true"'

    # Comment out original nav block and add container div
    nav_replacement = (
        '<!-- NAV: Injected by nav.js -->\n'
        '<div id="nav-container" ' + data_attrs + '></div>\n'
        '<!-- NAV: Original fallback (kept for reference) -->\n'
        '<!--\n' + nav_block + '\n-->\n'
    )

    content = content[:nav_start] + nav_replacement + content[nav_end:]

    # === 2. Replace footer: comment out original and add container ===
    footer_start = content.find('<footer>')
    if footer_start == -1:
        print(f"  WARNING: No footer found")
    else:
        footer_end = content.find('</footer>', footer_start)
        if footer_end != -1:
            footer_end += len('</footer>')
            footer_block = content[footer_start:footer_end]

            footer_replacement = (
                '<!-- FOOTER: Injected by footer.js -->\n'
                '<div id="footer-container"></div>\n'
                '<!-- FOOTER: Original fallback (kept for reference) -->\n'
                '<!--\n' + footer_block + '\n-->\n'
            )
            content = content[:footer_start] + footer_replacement + content[footer_end:]
        else:
            print(f"  WARNING: Footer start found but no end")

    # === 3. Add script tags ===
    script_insert = '<script src="nav.js?v=1"></script>\n<script src="footer.js?v=1"></script>\n'

    inserted = False
    for marker in SCRIPT_MARKERS:
        idx = content.find(marker)
        if idx != -1:
            content = content[:idx] + script_insert + content[idx:]
            inserted = True
            break

    if not inserted:
        body_end = content.find('</body>')
        if body_end != -1:
            content = content[:body_end] + script_insert + content[body_end:]
            inserted = True

    if not inserted:
        print(f"  WARNING: Could not insert script tags")

    # === 4. Write if changed ===
    if content != original:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"  OK: page={active_page}, logo_active={logo_active}")
        return True
    else:
        print(f"  No changes")
        return False


def main():
    html_files = []
    for root, dirs, files in os.walk(PROJECT_DIR):
        for f in files:
            if f.endswith('.html') and f not in SKIP_FILES:
                if 'auth/' in root or 'visuals/' in root:
                    continue
                html_files.append(os.path.join(root, f))

    html_files = sorted(html_files)

    success = 0
    failed = 0
    for filepath in html_files:
        if process_file(filepath):
            success += 1
        else:
            failed += 1

    print(f"\nDone. {success} files updated, {failed} failed/ignored.")


if __name__ == '__main__':
    main()
