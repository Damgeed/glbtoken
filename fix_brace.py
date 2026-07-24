#!/usr/bin/env python3
"""Fix the orphaned try-body closing brace in refreshTopModels."""
with open('/Users/openclaw_007/projects/glbtoken/script.js', 'r') as f:
    text = f.read()

# The issue: after removing try{ and }catch(e){}, there's an extra } 
# that was the try body close. Pattern: '        });\n      }\n    }\n    function slideTopView'
# Should be: '        });\n    }\n    function slideTopView'

old = '        });\n      }\n    }\n    function slideTopView('
new = '        });\n    }\n    function slideTopView('

count = text.count(old)
if count > 0:
    text = text.replace(old, new)
    print(f"Replaced {count} occurrence(s)")
else:
    print("Pattern not found!")
    # Show what's around the area
    import re
    m = re.search(r'        \}\);\n(?:      \}\n)?    \}\n    function slideTopView\(', text)
    if m:
        print(f"Found similar: {repr(m.group())}")

with open('/Users/openclaw_007/projects/glbtoken/script.js', 'w') as f:
    f.write(text)

print("Done")
