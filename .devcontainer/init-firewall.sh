#!/bin/bash
# init-firewall.sh — restrict container egress to an allowlist.
# Runs INSIDE the dev container (via `sudo` from postStartCommand). Needs CAP_NET_ADMIN
# (granted by devcontainer.json runArgs) and the host to have the netfilter modules loaded
# (rootless containers cannot modprobe — see /etc/modules-load.d/claude-firewall.conf on host).
set -euo pipefail
IFS=$'\n\t'

echo "[firewall] flushing existing rules"
iptables -F; iptables -X
iptables -t nat -F 2>/dev/null || true; iptables -t nat -X 2>/dev/null || true
iptables -t mangle -F 2>/dev/null || true; iptables -t mangle -X 2>/dev/null || true
ipset destroy allowed-domains 2>/dev/null || true

# Reset the policies to ACCEPT. `iptables -F` clears RULES but leaves the default policy
# alone, so on a re-run inside an already-firewalled container the policy is still DROP —
# and the GitHub-ranges fetch below would silently return nothing, leaving git broken.
iptables -P INPUT ACCEPT
iptables -P FORWARD ACCEPT
iptables -P OUTPUT ACCEPT

# --- baseline allows (added while policy is still ACCEPT so the script can resolve DNS) ---
# DNS (to the pinned --dns resolver), SSH, and loopback.
iptables -A OUTPUT -p udp --dport 53 -j ACCEPT
iptables -A INPUT  -p udp --sport 53 -j ACCEPT
iptables -A OUTPUT -p tcp --dport 53 -j ACCEPT
iptables -A INPUT  -p tcp --sport 53 -j ACCEPT
iptables -A OUTPUT -p tcp --dport 22 -j ACCEPT
iptables -A INPUT  -p tcp --sport 22 -j ACCEPT
iptables -A INPUT  -i lo -j ACCEPT
iptables -A OUTPUT -o lo -j ACCEPT

ipset create allowed-domains hash:net

# --- GitHub IP ranges (git clone/push, API, releases, ghcr) ---
echo "[firewall] fetching GitHub IP ranges"
gh_ranges="$(curl -fsSL --connect-timeout 10 https://api.github.com/meta || true)"
if [ -n "$gh_ranges" ]; then
  echo "$gh_ranges" | jq -r '(.web + .api + .git + .packages)[]?' 2>/dev/null \
    | while read -r cidr; do
        [[ "$cidr" =~ ^[0-9.]+/[0-9]+$ ]] && ipset add allowed-domains "$cidr" -exist
      done
fi

# --- individual allowlisted hosts ---
# Extend PROJECT-SPECIFIC domains here (package mirrors, APIs the app calls, etc).
ALLOWED_DOMAINS=(
  # Debian package repos, so apt works inside the container. These resolve to Fastly
  # anycast IPs; they are re-resolved every time this script runs (i.e. every container
  # start), which is what keeps the set current if the CDN rotates.
  deb.debian.org
  security.debian.org
  registry.npmjs.org
  api.anthropic.com
  console.anthropic.com
  statsig.anthropic.com
  statsig.com
  sentry.io
)
# Per-project additions, from devcontainer.json containerEnv (comma or space separated),
# so one project needing a CDN does not widen egress for every other project.
for extra in $(printf '%s' "${EXTRA_ALLOWED_DOMAINS:-}" | tr ',' '\n'); do
  [ -n "$extra" ] && ALLOWED_DOMAINS+=("$extra")
done

for domain in "${ALLOWED_DOMAINS[@]}"; do
  echo "[firewall] resolving $domain"
  for ip in $(dig +short A "$domain"); do
    [[ "$ip" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]] && ipset add allowed-domains "$ip" -exist
  done
done

# --- inbound: the project's own dev-server ports ---------------------------
# Published ports are useless without this: the default INPUT policy below is DROP, so a
# NEW inbound connection to a dev server is dropped even though Docker forwarded it.
# DEV_PORTS is set from devcontainer.json containerEnv (comma-separated); empty = none.
for p in $(printf '%s' "${DEV_PORTS:-}" | tr ',' '\n'); do
  case "$p" in ''|*[!0-9]*) continue ;; esac
  iptables -A INPUT -p tcp --dport "$p" -j ACCEPT
  echo "[firewall] inbound allowed on tcp/$p"
done

# --- return traffic + the allowlist, then default-deny ---
iptables -A INPUT  -m state --state ESTABLISHED,RELATED -j ACCEPT
iptables -A OUTPUT -m state --state ESTABLISHED,RELATED -j ACCEPT
iptables -A OUTPUT -m set --match-set allowed-domains dst -j ACCEPT

iptables -P INPUT  DROP
iptables -P FORWARD DROP
iptables -P OUTPUT DROP

# --- verification gate ---
echo "[firewall] verifying"
if curl --connect-timeout 5 -s https://example.com >/dev/null 2>&1; then
  echo "[firewall] ERROR: example.com reachable — egress NOT restricted" >&2
  exit 1
fi
echo "[firewall] OK: example.com blocked"
if ! curl --connect-timeout 5 -s https://api.github.com/zen >/dev/null 2>&1; then
  echo "[firewall] ERROR: api.github.com unreachable — allowlist broken" >&2
  exit 1
fi
echo "[firewall] OK: api.github.com reachable — firewall active"
