#!/usr/bin/env bash
# Import and publish the WoSPIS forgot-password workflow.
#
# n8n 2.x does not register POST /webhook/wospis/forgot-password until the
# workflow is published. Importing alone leaves a draft, and the old
# "update:workflow --active=true" command only flips a database flag.
#
# Run this where the n8n CLI can see the same database as the running
# instance (on Render, the n8n service shell). The official n8n image has
# Node and does not have Python.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORKFLOW="$ROOT/n8n/forgot-password.workflow.json"
N8N_BIN="${N8N_BIN:-$(command -v n8n || true)}"
IMPORT_FILE="$(mktemp)"

cleanup() { rm -f "$IMPORT_FILE"; }
trap cleanup EXIT

if [[ -z "$N8N_BIN" ]]; then
  echo "n8n CLI not found. Install with: npm install n8n" >&2
  echo "Or set N8N_BIN=/path/to/n8n" >&2
  exit 1
fi

if [[ ! -f "$WORKFLOW" ]]; then
  echo "Missing workflow file: $WORKFLOW" >&2
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "Node is required to prepare the workflow import." >&2
  exit 1
fi

node -e '
const fs = require("fs");
const wf = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
const payload = Array.isArray(wf) ? wf : [wf];
fs.writeFileSync(process.argv[2], JSON.stringify(payload));
const name = payload[0] && payload[0].name ? payload[0].name : "workflow";
process.stdout.write("Prepared import for: " + name + "\n");
' "$WORKFLOW" "$IMPORT_FILE"

echo "Importing into n8n..."
"$N8N_BIN" import:workflow --input="$IMPORT_FILE"

# Prefer the id stored in the workflow file. list:workflow prints "<id>|<name>"
# through the n8n logger, which may write to stdout or stderr and may prefix
# the line, so keep both streams.
EXPECTED_ID="$(node -e 'const w=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")); process.stdout.write(w.id||"")' "$WORKFLOW")"
LIST="$("$N8N_BIN" list:workflow 2>&1 || true)"
WF_ID="$(
  printf '%s\n' "$LIST" | awk -F'|' -v expected="$EXPECTED_ID" '
    {
      id = $1
      sub(/^.*[[:space:]]/, "", id)
    }
    expected != "" && id == expected { print id; found = 1; exit }
    /WoSPIS Forgot Password/ && !found { name_id = id }
    END { if (!found && name_id != "") print name_id }
  '
)"

if [[ -z "${WF_ID:-}" ]]; then
  echo "Could not resolve the WoSPIS Forgot Password workflow id." >&2
  echo "list:workflow output:" >&2
  printf '%s\n' "$LIST" >&2
  exit 1
fi

echo "Publishing workflow id=$WF_ID ..."
if ! "$N8N_BIN" publish:workflow --id="$WF_ID"; then
  echo "publish:workflow failed; trying update:workflow --active=true" >&2
  "$N8N_BIN" update:workflow --id="$WF_ID" --active=true
fi

echo
echo "Published. Restart n8n if it is already running so the production webhook is registered."
echo "In the editor, open WoSPIS Forgot Password and connect Gmail OAuth for techhrmwspo@gmail.com on Send Gmail."
echo "Laravel: N8N_FORGOT_PASSWORD_WEBHOOK=https://techhrm-n8n.onrender.com/webhook/wospis/forgot-password"
echo
echo "After restart, this should no longer say the webhook is not registered:"
echo "  curl -sS -X POST \"\${N8N_EDITOR_BASE_URL:-http://localhost:5678}/webhook/wospis/forgot-password\" \\"
echo "    -H 'Content-Type: application/json' \\"
echo "    -d '{\"email\":\"you@example.com\",\"subject\":\"WoSPIS test\",\"message\":\"<p>test</p>\",\"from_name\":\"WoSPIS WSPO\"}'"
