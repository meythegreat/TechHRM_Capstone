#!/usr/bin/env bash
# Import and activate the TechHRM forgot-password n8n workflow.
# Requires: n8n CLI on PATH (or set N8N_BIN), and a writable N8N_USER_FOLDER.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORKFLOW="$ROOT/n8n/forgot-password.workflow.json"
N8N_BIN="${N8N_BIN:-$(command -v n8n || true)}"
IMPORT_FILE="$(mktemp)"

cleanup() { rm -f "$IMPORT_FILE"; }
trap cleanup EXIT

if [[ -z "$N8N_BIN" ]]; then
  echo "n8n CLI not found. Install with: npm install n8n"
  echo "Or set N8N_BIN=/path/to/n8n"
  exit 1
fi

if [[ ! -f "$WORKFLOW" ]]; then
  echo "Missing workflow file: $WORKFLOW"
  exit 1
fi

# n8n import expects a JSON array of workflows
python3 - "$WORKFLOW" "$IMPORT_FILE" <<'PY'
import json, sys
src, dest = sys.argv[1], sys.argv[2]
wf = json.loads(open(src, encoding='utf-8').read())
payload = wf if isinstance(wf, list) else [wf]
open(dest, 'w', encoding='utf-8').write(json.dumps(payload))
print(f"Prepared import for: {payload[0].get('name', 'workflow')}")
PY

echo "Importing into n8n..."
"$N8N_BIN" import:workflow --input="$IMPORT_FILE"

WF_ID="$("$N8N_BIN" list:workflow 2>/dev/null | awk -F'|' '/TechHRM Forgot Password/{print $1; exit}')"
if [[ -n "${WF_ID:-}" ]]; then
  echo "Activating workflow id=$WF_ID ..."
  "$N8N_BIN" update:workflow --id="$WF_ID" --active=true || true
  echo "If n8n is already running, restart it so the production webhook registers."
else
  echo "Could not resolve workflow id from list:workflow output."
fi

echo
echo "Required in the n8n UI (http://localhost:5678):"
echo "  1. Credentials -> SMTP. Host smtp.gmail.com, port 465, SSL/TLS on."
echo "  2. User is the Gmail in MAIL_CONTACT_ADDRESS. Password is that account's app password."
echo "     Enter the app password only in n8n. Do not put it in Laravel, Render, or git."
echo "  3. Open workflow: TechHRM Forgot Password. On Send Gmail SMTP, select that credential."
echo "  4. Save, keep the workflow Active, restart n8n if the webhook 404s."
echo "  5. Laravel env: N8N_FORGOT_PASSWORD_WEBHOOK=http://localhost:5678/webhook/techhrm/forgot-password"
echo "     On Render, deploy render.yaml (New > Blueprint), then set the API to"
echo "     https://<techhrm-n8n host>/webhook/techhrm/forgot-password"
echo
echo "Smoke-test:"
echo "  curl -s -X POST http://localhost:5678/webhook/techhrm/forgot-password \\"
echo "    -H 'Content-Type: application/json' \\"
echo "    -d '{\"email\":\"you@example.com\",\"subject\":\"TechHRM test\",\"message\":\"<p>test</p>\",\"from_name\":\"TechHRM WSPO\"}'"
