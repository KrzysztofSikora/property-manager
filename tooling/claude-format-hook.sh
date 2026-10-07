#!/bin/sh
# Claude Code PostToolUse wrapper: Node < 24 cannot run the .ts hook, so fail visibly
# (exit 2 is the only non-zero code Claude Code shows) instead of silently.
major=$(node -v 2>/dev/null | sed -E 's/^v([0-9]+).*/\1/')
if [ -z "$major" ] || [ "$major" -lt 24 ]; then
  echo "editor hook skipped: Node 24 required (restart Claude Code after \`nvm use\`)" >&2
  exit 2
fi
exec node "$CLAUDE_PROJECT_DIR/tooling/claude-format-hook.ts"
