#!/bin/bash
# bump-versions.sh — Bump cache-busting version numbers across all HTML files
# Usage: bash scripts/bump-versions.sh
# macOS-compatible (no associative arrays)

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
echo "🔍 Bumping cache versions..."

for f in "$PROJECT_DIR"/*.html; do
  basename=$(basename "$f")
  
  # Find all versioned resources and bump them
  while IFS= read -r line; do
    # Match: file.ext?v=NUMBER
    if [[ $line =~ (src|href)=\"?([^\"]+\.(css|js))\?v=([0-9]+) ]]; then
      resource="${BASH_REMATCH[2]}"
      ext="${BASH_REMATCH[3]}"
      old_ver="${BASH_REMATCH[4]}"
      new_ver=$((old_ver + 1))
      
      # Replace in this file
      sed -i '' "s|$resource?v=$old_ver|$resource?v=$new_ver|g" "$f"
      echo "  $basename: $resource?v=$old_ver → v=$new_ver"
    fi
  done < <(grep -o '\(src\|href\)="[^"]*\.\(css\|js\)?v=[0-9]*"' "$f" 2>/dev/null)
done

echo "✅ Done"
echo "   Run 'git diff --stat' to see changed files"
