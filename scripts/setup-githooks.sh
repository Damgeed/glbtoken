#!/bin/bash
# setup-githooks.sh — Install Git hooks for the GlbTOKEN project
# Run: bash scripts/setup-githooks.sh
# Installs pre-commit hook that prevents orphaned '-->' comment tags

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
HOOKS_DIR="$PROJECT_DIR/.git/hooks"

echo "🔧 Installing GlbTOKEN Git hooks..."

# Pre-commit hook: check for orphaned --> in HTML files
cat > "$HOOKS_DIR/pre-commit" << 'HOOK'
#!/bin/bash
# Pre-commit hook: reject orphaned HTML closing comment tags

ERRORS=0
while IFS= read -r file; do
  if grep -n '^\s*-->$' "$file" > /dev/null 2>&1; then
    echo "❌ ERROR: Orphaned '-->' found in $file"
    grep -n '^\s*-->$' "$file"
    ERRORS=$((ERRORS + 1))
  fi
done < <(git diff --cached --name-only --diff-filter=ACM | grep '\.html$' || true)

if [ $ERRORS -gt 0 ]; then
  echo ""
  echo "Commit blocked: $ERRORS file(s) contain orphaned '-->' tags."
  echo "These render as visible arrows in the browser. Remove them and try again."
  exit 1
fi
exit 0
HOOK

chmod +x "$HOOKS_DIR/pre-commit"
echo "✅ Pre-commit hook installed at $HOOKS_DIR/pre-commit"
echo "   This hook blocks commits with orphaned '-->' in HTML files."
