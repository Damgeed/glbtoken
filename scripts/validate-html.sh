#!/usr/bin/env bash
# validate-html.sh — Check for orphaned HTML comment tags
# Run: bash scripts/validate-html.sh
# Also runs automatically via .git/hooks/pre-commit

echo "🔍 Checking for orphaned '-->' in all HTML files..."
ERRORS=0
FILES=$(find . -name '*.html' -maxdepth 1 -not -path './.git/*' 2>/dev/null)

for f in $FILES; do
  if grep -n '^\s*-->$' "$f" > /dev/null 2>&1; then
    echo "❌ $f"
    grep -n '^\s*-->$' "$f"
    ERRORS=$((ERRORS + 1))
  fi
done

if [ $ERRORS -eq 0 ]; then
  echo "✅ Clean — no orphaned '-->' found"
else
  echo "⚠️  $ERRORS file(s) have orphaned '-->'"
  exit 1
fi

# Also check for other common HTML comment mistakes
echo "🔍 Checking for broken HTML comment syntax..."
if grep -rn '<!---' --include='*.html' . 2>/dev/null | grep -v '.git/' > /dev/null; then
  echo "⚠️  Found '<!---' (triple dash opening):"
  grep -rn '<!---' --include='*.html' . | grep -v '.git/'
  ERRORS=$((ERRORS + 1))
fi
if grep -rn '--->' --include='*.html' . 2>/dev/null | grep -v '.git/' > /dev/null; then
  echo "⚠️  Found '--->' (triple dash closing):"
  grep -rn '--->' --include='*.html' . | grep -v '.git/'
  ERRORS=$((ERRORS + 1))
fi

exit $ERRORS
