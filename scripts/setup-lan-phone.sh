#!/usr/bin/env zsh
set -euo pipefail

# Optional helper. Dev servers already listen on every interface and pick up
# Wi-Fi / Ethernet IP changes automatically. Use this only if you want to print
# the current default-route IP.

detect_default_ip() {
  local iface ip
  iface="$(route -n get default 2>/dev/null | awk '/interface:/{print $2}')"
  if [[ -n "${iface:-}" ]]; then
    ip="$(ipconfig getifaddr "$iface" 2>/dev/null || true)"
    if [[ -n "$ip" ]]; then
      echo "$ip"
      return 0
    fi
  fi
  ip="$(ifconfig | awk '/inet / && $2 !~ /^127\./ { print $2; exit }')"
  [[ -n "$ip" ]] && echo "$ip" && return 0
  return 1
}

echo "Active interfaces:"
ifconfig | awk '
  /^[a-z]/ { iface=$1; sub(":$","",iface) }
  /inet / && $2 !~ /^127\./ { printf "  %-8s %s\n", iface, $2 }
'

IP="${1:-}"
if [[ -z "$IP" ]]; then
  IP="$(detect_default_ip)" || {
    echo "No LAN IP yet. Connect Ethernet or Wi-Fi, then retry."
    exit 1
  }
fi

echo
echo "Default-route IP (usually Ethernet if a cable is plugged in): ${IP}"
echo "Start Vite with:  cd client && ./node_modules/.bin/vite --host 0.0.0.0 --port 5173"
echo "On the phone open: http://${IP}:5173"
echo
echo "You do not need to edit .env when the school network changes."
