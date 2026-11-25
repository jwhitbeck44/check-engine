#!/usr/bin/env bash
# Sets the relay's three secrets. Run from Git Bash in this folder: bash set-secrets.sh [path-to-wrangler]
# Never prints a value. (PowerShell 5.1 piping into wrangler.cmd set them empty, so this is Bash on purpose.)
# Revoke or add a passcode: edit _local/passcodes.txt (one label=code per line), then run this again.
set -euo pipefail
WR="${1:-npx wrangler}"
CFG="worker/wrangler.jsonc"
[ -n "${ANTHROPIC_API_KEY_ENTP:-}" ] || { echo "ANTHROPIC_API_KEY_ENTP is not set"; exit 1; }
printf '%s' "$(printf '%s' "$ANTHROPIC_API_KEY_ENTP" | tr -d '\r\n ')" | $WR secret put ANTHROPIC_API_KEY --config "$CFG"
tr -d '\r' < _local/passcodes.txt | sed '/^$/d' | $WR secret put PASSCODES --config "$CFG"
printf '%s' "$(tr -d '\r\n' < _local/admin-token.txt)" | $WR secret put ADMIN_TOKEN --config "$CFG"
