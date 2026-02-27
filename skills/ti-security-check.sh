#!/usr/bin/env bash
# ============================================================================
# Techimpossible Security Posture Check
# https://techimpossible.com
#
# A deterministic security scanner for OpenClaw hosts.
# Runs real commands, outputs structured JSON. No AI guessing.
#
# Usage: bash ti-security-check.sh [--json] [--fix] [--openclaw-only] [--host-only]
#
# Copyright (c) 2026 Techimpossible Security Inc.
# Free to use. Professional remediation: https://techimpossible.com
# ============================================================================

set -uo pipefail

VERSION="1.2.0"
SCAN_ID="ti-$(date +%s)-$$"
SCAN_TIME=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
OUTPUT_JSON=false
AUTO_FIX=false
SCAN_OPENCLAW=true
SCAN_HOST=true

# Parse flags
for arg in "$@"; do
  case "$arg" in
    --json) OUTPUT_JSON=true ;;
    --fix) AUTO_FIX=true ;;
    --openclaw-only) SCAN_HOST=false ;;
    --host-only) SCAN_OPENCLAW=false ;;
    --help|-h)
      echo "Techimpossible Security Posture Check v${VERSION}"
      echo ""
      echo "Usage: bash ti-security-check.sh [OPTIONS]"
      echo ""
      echo "Options:"
      echo "  --json           Output raw JSON (for SKILL.md parsing)"
      echo "  --fix            Auto-fix safe issues (with confirmation)"
      echo "  --openclaw-only  Only scan OpenClaw configuration"
      echo "  --host-only      Only scan host machine"
      echo "  --help           Show this help"
      echo ""
      echo "Professional remediation: https://techimpossible.com"
      exit 0
      ;;
  esac
done

# ============================================================================
# Utilities
# ============================================================================

FINDINGS="[]"
FINDING_COUNT=0

add_finding() {
  local severity="$1"    # CRITICAL, HIGH, MEDIUM, LOW, INFO
  local category="$2"    # openclaw, network, ssh, docker, secrets, firewall, services
  local title="$3"
  local detail="$4"
  local risk="$5"        # Plain English risk explanation
  local fix="$6"         # Fix instructions
  local auto_fixable="${7:-false}"  # Can --fix handle this?
  local raw_evidence="${8:-}"       # Raw command output as proof

  FINDING_COUNT=$((FINDING_COUNT + 1))

  local finding
  finding=$(cat <<ENDJSON
{
  "id": ${FINDING_COUNT},
  "severity": "${severity}",
  "category": "${category}",
  "title": $(echo "$title" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read().strip()))'),
  "detail": $(echo "$detail" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read().strip()))'),
  "risk": $(echo "$risk" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read().strip()))'),
  "fix": $(echo "$fix" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read().strip()))'),
  "auto_fixable": ${auto_fixable},
  "evidence": $(echo "$raw_evidence" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read().strip()))')
}
ENDJSON
)

  # Append to findings array
  if [ "$FINDINGS" = "[]" ]; then
    FINDINGS="[${finding}]"
  else
    FINDINGS="${FINDINGS%]},${finding}]"
  fi
}

command_exists() {
  command -v "$1" &>/dev/null
}

file_readable() {
  [ -f "$1" ] && [ -r "$1" ]
}

# Detect OS: "linux" or "macos"
detect_os() {
  case "$(uname -s)" in
    Darwin*) echo "macos" ;;
    *)       echo "linux" ;;
  esac
}

OS_TYPE="$(detect_os)"

# Check if sudo is available and usable (non-interactive)
CAN_SUDO=false
if command -v sudo &>/dev/null; then
  # Test if sudo works without a password prompt (NOPASSWD or cached credentials)
  if sudo -n true 2>/dev/null; then
    CAN_SUDO=true
  fi
fi

# Run a command with sudo if available, otherwise without
# Usage: try_sudo command arg1 arg2 ...
try_sudo() {
  if [ "$CAN_SUDO" = true ]; then
    sudo "$@" 2>/dev/null
  else
    "$@" 2>/dev/null
  fi
}

SKIPPED_CHECKS=0

# Portable stat: returns octal permissions (e.g., "644")
portable_stat_perms() {
  if [ "$OS_TYPE" = "macos" ]; then
    stat -f "%Lp" "$1" 2>/dev/null || echo "unknown"
  else
    stat -c "%a" "$1" 2>/dev/null || echo "unknown"
  fi
}

print_banner() {
  if [ "$OUTPUT_JSON" = false ]; then
    echo ""
    echo "  =============================================="
    echo "  Techimpossible Security Posture Check v${VERSION}"
    echo "  https://techimpossible.com"
    echo "  =============================================="
    echo ""
    echo "  Scan ID:   ${SCAN_ID}"
    echo "  Timestamp: ${SCAN_TIME}"
    echo "  Host:      $(hostname 2>/dev/null || echo 'unknown')"
    echo ""
  fi
}

print_section() {
  if [ "$OUTPUT_JSON" = false ]; then
    echo "  --- $1 ---"
    echo ""
  fi
}

# ============================================================================
# Phase 1: OpenClaw Configuration Audit
# ============================================================================

check_openclaw() {
  print_section "OpenClaw Configuration"

  local oc_config=""
  local oc_dir=""

  # Find OpenClaw config
  for path in \
    "$HOME/.openclaw/openclaw.json" \
    "$HOME/.config/openclaw/openclaw.json" \
    "/etc/openclaw/openclaw.json"; do
    if file_readable "$path"; then
      oc_config="$path"
      oc_dir="$(dirname "$path")"
      break
    fi
  done

  if [ -z "$oc_config" ]; then
    # Check if OpenClaw is running via Docker
    if command_exists docker && docker ps 2>/dev/null | grep -qi "openclaw"; then
      add_finding "INFO" "openclaw" \
        "OpenClaw running in Docker" \
        "OpenClaw detected as a Docker container. Config may be inside the container." \
        "Docker-based installs need container-level config checks." \
        "Run: docker exec <container> cat /home/user/.openclaw/openclaw.json to inspect config." \
        "false" \
        "$(docker ps --filter name=openclaw --format '{{.Names}} {{.Image}} {{.Ports}}' 2>/dev/null || echo 'docker ps failed')"
    else
      add_finding "INFO" "openclaw" \
        "OpenClaw not detected" \
        "No OpenClaw configuration found at standard paths." \
        "If OpenClaw is not installed, these checks do not apply." \
        "No action needed if OpenClaw is not in use." \
        "false"
      return
    fi
  fi

  # Check 1: Gateway binding
  if [ -n "$oc_config" ]; then
    local bind_mode
    bind_mode=$(python3 -c "
import json
try:
    c = json.load(open('${oc_config}'))
    print(c.get('gateway',{}).get('bind','not_set'))
except: print('parse_error')
" 2>/dev/null || echo "parse_error")

    if [ "$bind_mode" = "not_set" ] || [ "$bind_mode" = "parse_error" ]; then
      add_finding "HIGH" "openclaw" \
        "Gateway bind mode not explicitly set" \
        "No explicit bind mode in openclaw.json. Default behavior depends on install method — Docker defaults to 0.0.0.0 (all interfaces)." \
        "If bound to all interfaces, anyone who finds your server IP can access your AI agent, run commands, and steal your API keys." \
        "Add to openclaw.json: {\"gateway\": {\"bind\": \"loopback\"}}  Then restart OpenClaw." \
        "true" \
        "bind_mode=${bind_mode}"
    elif echo "$bind_mode" | grep -qi "custom\|0\.0\.0\.0"; then
      add_finding "CRITICAL" "openclaw" \
        "Gateway exposed to all network interfaces" \
        "Gateway bind is set to '${bind_mode}', which may expose port 18789 to the public internet." \
        "Anyone on the internet can connect to your AI agent. This is how 135,000+ OpenClaw instances were found exposed by security researchers. Attackers can execute commands, read your files, and steal every API key on your machine." \
        "Change gateway.bind to 'loopback' in ${oc_config}. If you need remote access, use Tailscale (gateway.bind: 'tailnet')." \
        "true" \
        "bind_mode=${bind_mode}"
    fi

    # Check 2: Gateway authentication
    local auth_mode
    auth_mode=$(python3 -c "
import json
try:
    c = json.load(open('${oc_config}'))
    print(c.get('gateway',{}).get('auth',{}).get('mode','not_set'))
except: print('parse_error')
" 2>/dev/null || echo "parse_error")

    if [ "$auth_mode" = "not_set" ]; then
      add_finding "CRITICAL" "openclaw" \
        "No gateway authentication configured" \
        "No auth mode set in gateway config." \
        "Without authentication, anyone who can reach your gateway has full access to your AI agent and everything it can do — including running commands on your machine." \
        "Add to openclaw.json: {\"gateway\": {\"auth\": {\"mode\": \"token\", \"token\": \"$(openssl rand -hex 32 2>/dev/null || echo 'GENERATE_A_LONG_RANDOM_STRING')\"}}}  Then restart OpenClaw." \
        "true" \
        "auth_mode=${auth_mode}"
    fi

    # Check 3: Auth token strength
    local auth_token
    auth_token=$(python3 -c "
import json
try:
    c = json.load(open('${oc_config}'))
    t = c.get('gateway',{}).get('auth',{}).get('token','')
    p = c.get('gateway',{}).get('auth',{}).get('password','')
    val = t or p
    print(len(val) if val else 0)
except: print(-1)
" 2>/dev/null || echo "-1")

    if [ "$auth_token" != "-1" ] && [ "$auth_token" -gt 0 ] && [ "$auth_token" -lt 12 ]; then
      add_finding "HIGH" "openclaw" \
        "Weak gateway authentication token" \
        "Auth token/password is only ${auth_token} characters. OpenClaw accepts even single-character passwords." \
        "Short tokens can be brute-forced in minutes. Automated scanners are actively targeting OpenClaw instances." \
        "Replace your token with a strong random string (32+ characters): openssl rand -hex 32" \
        "true" \
        "token_length=${auth_token}"
    fi

    # Check 4: Elevated tools enabled
    local elevated
    elevated=$(python3 -c "
import json
try:
    c = json.load(open('${oc_config}'))
    print(str(c.get('tools',{}).get('elevated',{}).get('enabled', False)).lower())
except: print('parse_error')
" 2>/dev/null || echo "parse_error")

    if [ "$elevated" = "true" ]; then
      add_finding "HIGH" "openclaw" \
        "Elevated tool access enabled" \
        "tools.elevated.enabled is true — skills can perform privileged operations." \
        "A malicious or compromised skill can run commands with elevated privileges, modify system files, and install software. The documented 'What Would Elon Do' attack exploited exactly this." \
        "Set in openclaw.json: {\"tools\": {\"elevated\": {\"enabled\": false}}}  Only enable temporarily when needed." \
        "true" \
        "elevated=${elevated}"
    fi

    # Check 5: Config file permissions
    local config_perms
    config_perms=$(stat -c "%a" "$oc_config" 2>/dev/null || stat -f "%Lp" "$oc_config" 2>/dev/null || echo "unknown")

    if [ "$config_perms" != "unknown" ] && [ "$config_perms" != "600" ] && [ "$config_perms" != "400" ]; then
      add_finding "HIGH" "openclaw" \
        "OpenClaw config file has loose permissions" \
        "${oc_config} has permissions ${config_perms} (should be 600)." \
        "Other users or processes on this machine can read your config, which contains authentication tokens and API keys." \
        "Run: chmod 600 ${oc_config}" \
        "true" \
        "permissions=${config_perms} file=${oc_config}"
    fi

    # Check 6: Config directory permissions
    if [ -n "$oc_dir" ]; then
      local dir_perms
      dir_perms=$(stat -c "%a" "$oc_dir" 2>/dev/null || stat -f "%Lp" "$oc_dir" 2>/dev/null || echo "unknown")

      if [ "$dir_perms" != "unknown" ] && [ "$dir_perms" != "700" ] && [ "$dir_perms" != "500" ]; then
        add_finding "MEDIUM" "openclaw" \
          "OpenClaw directory has loose permissions" \
          "${oc_dir}/ has permissions ${dir_perms} (should be 700)." \
          "Other users can browse your OpenClaw directory, which contains session transcripts, credentials, and installed skills." \
          "Run: chmod 700 ${oc_dir}" \
          "true" \
          "permissions=${dir_perms} dir=${oc_dir}"
      fi
    fi

    # Check 7: Browser control exposure
    local browser_control
    browser_control=$(python3 -c "
import json
try:
    c = json.load(open('${oc_config}'))
    bc = c.get('tools',{}).get('browser',{})
    print('enabled' if bc.get('enabled', True) else 'disabled')
except: print('parse_error')
" 2>/dev/null || echo "parse_error")

    if [ "$browser_control" = "enabled" ]; then
      add_finding "MEDIUM" "openclaw" \
        "Browser control is enabled" \
        "OpenClaw can control a browser session on this machine." \
        "If your OpenClaw instance is compromised, an attacker can browse the web as you — accessing logged-in sessions, banking sites, email, and anything your browser remembers." \
        "Disable if not needed: {\"tools\": {\"browser\": {\"enabled\": false}}}  If needed, use a dedicated browser profile (not your personal one)." \
        "false" \
        "browser_control=${browser_control}"
    fi

    # Check 8: mDNS broadcasting
    local mdns_mode
    mdns_mode=$(python3 -c "
import json
try:
    c = json.load(open('${oc_config}'))
    print(c.get('discovery',{}).get('mdns',{}).get('mode','minimal'))
except: print('parse_error')
" 2>/dev/null || echo "parse_error")

    if [ "$mdns_mode" = "full" ]; then
      add_finding "MEDIUM" "openclaw" \
        "mDNS broadcasting in full mode" \
        "Discovery mDNS mode is 'full', broadcasting SSH port and CLI path to the local network." \
        "Anyone on your network can discover your OpenClaw instance and its SSH port, making targeted attacks easier." \
        "Set discovery.mdns.mode to 'minimal' or 'off' in openclaw.json." \
        "true" \
        "mdns_mode=${mdns_mode}"
    fi

    # Check 9: DM policy
    local dm_policy
    dm_policy=$(python3 -c "
import json
try:
    c = json.load(open('${oc_config}'))
    channels = c.get('channels', {})
    policies = []
    for ch_name, ch_conf in channels.items():
        if isinstance(ch_conf, dict):
            p = ch_conf.get('dmPolicy', 'not_set')
            policies.append(f'{ch_name}={p}')
    print('|'.join(policies) if policies else 'no_channels')
except: print('parse_error')
" 2>/dev/null || echo "parse_error")

    if echo "$dm_policy" | grep -q "open"; then
      add_finding "HIGH" "openclaw" \
        "Open DM policy detected" \
        "One or more channels have dmPolicy set to 'open', allowing anyone to message your AI agent." \
        "Strangers can send prompts to your agent, potentially triggering prompt injection attacks that steal data or execute commands." \
        "Change dmPolicy to 'pairing' (requires approval) or 'allowlist' (whitelist only) for each channel." \
        "false" \
        "dm_policies=${dm_policy}"
    fi
  fi

  # Check 10: OpenClaw process running as root
  local oc_procs
  oc_procs=$(ps aux 2>/dev/null | grep -i "[o]penclaw" | head -5 || echo "")
  if echo "$oc_procs" | grep -q "^root"; then
    add_finding "HIGH" "openclaw" \
      "OpenClaw running as root" \
      "The OpenClaw process is running as the root user." \
      "If an attacker compromises OpenClaw, they have full root access to your entire machine — every file, every service, every secret." \
      "Create a dedicated user: sudo useradd -r -m openclaw  Then run OpenClaw as that user instead of root." \
      "false" \
      "$(echo "$oc_procs" | head -3)"
  fi
}

# ============================================================================
# Phase 2: Network Exposure
# ============================================================================

check_network() {
  print_section "Network Exposure"

  # Get listening ports (OS-aware)
  local listening=""
  if [ "$OS_TYPE" = "macos" ]; then
    if command_exists lsof; then
      listening=$(try_sudo lsof -iTCP -sTCP:LISTEN -nP || lsof -iTCP -sTCP:LISTEN -nP 2>/dev/null || echo "")
    elif command_exists netstat; then
      listening=$(netstat -an -p tcp 2>/dev/null | grep LISTEN || echo "")
    fi
  else
    if command_exists ss; then
      listening=$(ss -tlnp 2>/dev/null || echo "")
    elif command_exists netstat; then
      listening=$(netstat -tlnp 2>/dev/null || echo "")
    fi
  fi

  if [ -z "$listening" ]; then
    local install_hint="Install iproute2 (provides ss): sudo apt install iproute2"
    [ "$OS_TYPE" = "macos" ] && install_hint="Try running with sudo: sudo bash ti-security-check.sh"
    add_finding "INFO" "network" \
      "Could not enumerate listening ports" \
      "Could not list listening services, or insufficient permissions." \
      "Cannot verify which services are exposed to the network." \
      "$install_hint" \
      "false"
    return
  fi

  # Check for services bound to 0.0.0.0 (all interfaces)
  # macOS lsof uses *:port, Linux ss/netstat uses 0.0.0.0:port or :::port
  local exposed_services
  if [ "$OS_TYPE" = "macos" ]; then
    exposed_services=$(echo "$listening" | grep -E "\*:" | grep -v "127\." || echo "")
  else
    exposed_services=$(echo "$listening" | grep -E "0\.0\.0\.0:|:::" | grep -v "127\." || echo "")
  fi

  if [ -n "$exposed_services" ]; then
    # Check specific dangerous services
    local dangerous_ports="3306 5432 6379 27017 9200 9300 11211 2375 2376 5984 8529 18789"

    for port in $dangerous_ports; do
      if echo "$exposed_services" | grep -qE ":${port}\b"; then
        local svc_name=""
        local svc_risk=""
        local svc_fix=""

        case "$port" in
          3306)
            svc_name="MySQL/MariaDB"
            svc_risk="Your database is accessible from the internet. Attackers can brute-force credentials or exploit known vulnerabilities to steal or destroy all your data."
            svc_fix="Bind to localhost only. In /etc/mysql/mysql.conf.d/mysqld.cnf, set: bind-address = 127.0.0.1  Then restart: sudo systemctl restart mysql"
            ;;
          5432)
            svc_name="PostgreSQL"
            svc_risk="Your database is accessible from the internet. Attackers can attempt authentication and exploit misconfigurations to access sensitive data."
            svc_fix="In /etc/postgresql/*/main/postgresql.conf, set: listen_addresses = 'localhost'  Also restrict pg_hba.conf to local connections only. Then restart: sudo systemctl restart postgresql"
            ;;
          6379)
            svc_name="Redis"
            svc_risk="Redis often runs with NO password by default. Anyone can connect, read all data, and execute commands — including writing files to disk. This is how cryptominers get installed."
            svc_fix="In /etc/redis/redis.conf, set: bind 127.0.0.1 and requirepass YOUR_STRONG_PASSWORD  Then restart: sudo systemctl restart redis"
            ;;
          27017)
            svc_name="MongoDB"
            svc_risk="Over 87,000 MongoDB instances are exposed with no authentication. Attackers scan for these constantly. Your entire database can be downloaded or ransomed in minutes."
            svc_fix="In /etc/mongod.conf, set bindIp to 127.0.0.1 and enable authentication. Restart: sudo systemctl restart mongod"
            ;;
          9200|9300)
            svc_name="Elasticsearch"
            svc_risk="Elasticsearch with no auth exposes all indexed data. Attackers can read, modify, or delete everything — and use it as a pivot point to attack other services."
            svc_fix="In elasticsearch.yml, set: network.host: 127.0.0.1  Enable X-Pack security or put it behind a reverse proxy with auth."
            ;;
          11211)
            svc_name="Memcached"
            svc_risk="Exposed Memcached can be used for DDoS amplification attacks (your server becomes a weapon) and leaks cached data including session tokens."
            svc_fix="In /etc/memcached.conf, set: -l 127.0.0.1  Then restart: sudo systemctl restart memcached"
            ;;
          2375|2376)
            svc_name="Docker API"
            svc_risk="The Docker socket is exposed to the network. This is equivalent to giving root access to anyone — they can create privileged containers, mount the host filesystem, and take complete control of your machine."
            svc_fix="IMMEDIATELY stop exposing Docker TCP. Remove -H tcp://0.0.0.0:2375 from Docker daemon config. Use SSH or TLS mutual auth if remote Docker access is needed."
            ;;
          5984)
            svc_name="CouchDB"
            svc_risk="CouchDB with default credentials (admin/admin) or no auth is a common target for data theft."
            svc_fix="Bind to localhost in /opt/couchdb/etc/local.ini: [chttpd] bind_address = 127.0.0.1  Set admin credentials."
            ;;
          8529)
            svc_name="ArangoDB"
            svc_risk="Exposed database interface allows direct data access and query execution."
            svc_fix="Configure endpoint to listen on localhost only in arangod.conf."
            ;;
          18789)
            svc_name="OpenClaw Gateway"
            svc_risk="Your AI agent is directly accessible from the internet. See OpenClaw findings above for full impact."
            svc_fix="Set gateway.bind to 'loopback' in openclaw.json."
            ;;
        esac

        local evidence_line
        evidence_line=$(echo "$exposed_services" | grep -E ":${port}\b" | head -1)
        local severity="CRITICAL"
        [ "$port" = "11211" ] || [ "$port" = "5984" ] || [ "$port" = "8529" ] && severity="HIGH"

        add_finding "$severity" "network" \
          "${svc_name} exposed on port ${port}" \
          "${svc_name} is listening on all interfaces (0.0.0.0:${port}), accessible from the internet." \
          "$svc_risk" \
          "$svc_fix" \
          "true" \
          "$evidence_line"
      fi
    done

    # Count total exposed ports
    local total_exposed
    total_exposed=$(echo "$exposed_services" | grep -c "LISTEN" || echo "0")
    total_exposed=$(echo "$total_exposed" | tr -d '[:space:]')
    total_exposed="${total_exposed:-0}"
    if [ "$total_exposed" -gt 10 ] 2>/dev/null; then
      add_finding "MEDIUM" "network" \
        "${total_exposed} services exposed to all interfaces" \
        "There are ${total_exposed} services listening on 0.0.0.0 (all network interfaces)." \
        "Each exposed service is an attack surface. The more services exposed, the more ways an attacker can get in." \
        "Review each service and bind to 127.0.0.1 unless it specifically needs to accept external connections. Use a firewall (ufw) to restrict access." \
        "false" \
        "$(echo "$exposed_services" | head -15)"
    fi
  fi
}

# ============================================================================
# Phase 3: SSH Hardening
# ============================================================================

check_ssh() {
  print_section "SSH Configuration"

  local sshd_config="/etc/ssh/sshd_config"
  if ! file_readable "$sshd_config"; then
    # Try common alternate locations
    for alt in /etc/ssh/sshd_config.d/*.conf; do
      if file_readable "$alt"; then
        sshd_config="$alt"
        break
      fi
    done
  fi

  if ! file_readable "$sshd_config"; then
    add_finding "INFO" "ssh" \
      "SSH config not readable" \
      "Cannot read ${sshd_config} — may need elevated permissions." \
      "SSH configuration could not be verified." \
      "Run this script with sudo, or check SSH config manually: sudo cat /etc/ssh/sshd_config" \
      "false"
    return
  fi

  local sshd_full
  sshd_full=$(cat /etc/ssh/sshd_config /etc/ssh/sshd_config.d/*.conf 2>/dev/null || cat "$sshd_config")

  # Check: Password authentication
  if echo "$sshd_full" | grep -qi "^PasswordAuthentication yes"; then
    add_finding "HIGH" "ssh" \
      "SSH password authentication is enabled" \
      "PasswordAuthentication is set to 'yes' in SSH config." \
      "Your server is being brute-forced right now. Every internet-facing SSH server gets hundreds to thousands of password guessing attempts per day. One weak password and they're in." \
      "1. Make sure you have SSH key access working first (test in a second terminal!)
2. Edit /etc/ssh/sshd_config: set PasswordAuthentication no
3. Restart SSH: sudo systemctl restart sshd
WARNING: Do NOT do this if SSH keys are not set up — you will lock yourself out." \
      "false" \
      "$(grep -i 'PasswordAuthentication' /etc/ssh/sshd_config 2>/dev/null || echo 'not found')"
  fi

  # Check: Root login
  local root_login
  root_login=$(echo "$sshd_full" | grep -i "^PermitRootLogin" | tail -1 | awk '{print $2}' || echo "")
  if [ "$root_login" = "yes" ] || [ -z "$root_login" ]; then
    add_finding "HIGH" "ssh" \
      "SSH root login is permitted" \
      "PermitRootLogin is '${root_login:-not set (defaults to yes on many systems)}'." \
      "Attackers always try root first. If they guess or crack the root password, they own the entire machine instantly — no privilege escalation needed." \
      "Edit /etc/ssh/sshd_config: set PermitRootLogin no (or 'prohibit-password' if you need root key access)  Then restart: sudo systemctl restart sshd" \
      "false" \
      "PermitRootLogin=${root_login:-not_set}"
  fi

  # Check: Default port
  local ssh_port
  ssh_port=$(echo "$sshd_full" | grep -i "^Port " | awk '{print $2}' | tail -1 || echo "22")
  [ -z "$ssh_port" ] && ssh_port="22"
  if [ "$ssh_port" = "22" ]; then
    add_finding "LOW" "ssh" \
      "SSH running on default port 22" \
      "SSH is using the default port 22." \
      "Automated scanners target port 22 first. Changing the port won't stop a determined attacker but reduces noise from bots by 95%+." \
      "Optional: Change Port to a high number (e.g., 2222 or 34567) in /etc/ssh/sshd_config. Update your firewall rules first, then restart sshd. Make sure to test access before closing your current session." \
      "false" \
      "ssh_port=${ssh_port}"
  fi

  # Check: Fail2ban (Linux) or brute-force protection note (macOS)
  if ! command_exists fail2ban-client; then
    if [ "$OS_TYPE" = "macos" ]; then
      add_finding "LOW" "ssh" \
        "No SSH brute-force protection detected" \
        "fail2ban is not installed. macOS does not include built-in SSH brute-force protection." \
        "Without brute-force protection, automated bots can try thousands of passwords. macOS is less commonly targeted over SSH than Linux servers, but Mac Minis with Remote Login enabled are still at risk." \
        "Option 1 (recommended): Disable Remote Login if not needed — System Settings > General > Sharing > Remote Login off
Option 2: Install via Homebrew: brew install fail2ban
Option 3: Use macOS pf rules to rate-limit SSH connections" \
        "false"
    else
      add_finding "MEDIUM" "ssh" \
        "Fail2ban is not installed" \
        "fail2ban is not present on this system." \
        "Without fail2ban, there is nothing stopping automated bots from trying thousands of passwords against your SSH. Even with key-only auth, the constant attempts waste resources and fill your logs." \
        "Install: sudo apt install fail2ban -y
Configure: sudo cp /etc/fail2ban/jail.conf /etc/fail2ban/jail.local
Enable: sudo systemctl enable --now fail2ban" \
        "true"
    fi
  else
    local f2b_status
    f2b_status=$(fail2ban-client status sshd 2>/dev/null || echo "not_running")
    if echo "$f2b_status" | grep -q "not_running\|ERROR"; then
      add_finding "MEDIUM" "ssh" \
        "Fail2ban installed but SSH jail not active" \
        "Fail2ban is installed but the sshd jail is not running." \
        "Fail2ban is installed but not protecting SSH. It's like having a lock but not using it." \
        "Enable SSH jail: sudo fail2ban-client start sshd  Or check config: sudo fail2ban-client status" \
        "true" \
        "$f2b_status"
    fi
  fi
}

# ============================================================================
# Phase 4: Firewall
# ============================================================================

check_firewall() {
  print_section "Firewall"

  local fw_active=false

  if [ "$OS_TYPE" = "macos" ]; then
    # macOS: Check Application Firewall (socketfilterfw)
    local alf_status=""
    alf_status=$(/usr/libexec/ApplicationFirewall/socketfilterfw --getglobalstate 2>/dev/null || echo "unknown")

    if echo "$alf_status" | grep -qi "disabled"; then
      add_finding "HIGH" "firewall" \
        "macOS Application Firewall is disabled" \
        "$alf_status" \
        "The built-in macOS firewall blocks unwanted incoming connections. Without it, any service listening on a port is accessible to other devices on the network." \
        "Enable: System Settings > Network > Firewall > turn on
Or: sudo /usr/libexec/ApplicationFirewall/socketfilterfw --setglobalstate on" \
        "false" \
        "$alf_status"
    elif echo "$alf_status" | grep -qi "enabled"; then
      fw_active=true
    fi

    # macOS: Check stealth mode
    local stealth=""
    stealth=$(/usr/libexec/ApplicationFirewall/socketfilterfw --getstealthmode 2>/dev/null || echo "unknown")
    if echo "$stealth" | grep -qi "disabled"; then
      add_finding "LOW" "firewall" \
        "Firewall stealth mode is disabled" \
        "$stealth" \
        "Stealth mode prevents your Mac from responding to probing requests (ping, port scans). This makes your machine harder to discover on untrusted networks." \
        "Enable: sudo /usr/libexec/ApplicationFirewall/socketfilterfw --setstealthmode on
Or: System Settings > Network > Firewall > Options > Enable stealth mode" \
        "false" \
        "$stealth"
    fi

    # macOS: Check pf (packet filter) for advanced setups
    if command_exists pfctl; then
      local pf_status
      pf_status=$(try_sudo pfctl -s info 2>/dev/null | head -1 || echo "unknown")
      if echo "$pf_status" | grep -qi "Enabled"; then
        fw_active=true
      fi
    fi

  else
    # Linux: Check UFW
    if command_exists ufw; then
      local ufw_status
      ufw_status=$(try_sudo ufw status || ufw status 2>/dev/null || echo "unknown")
      if echo "$ufw_status" | grep -qi "inactive\|disabled"; then
        add_finding "HIGH" "firewall" \
          "UFW firewall is installed but inactive" \
          "UFW (Uncomplicated Firewall) is installed but not enabled." \
          "With no firewall, every service on every port is accessible from the internet. This is like leaving every door and window open." \
          "Enable UFW (MAKE SURE SSH IS ALLOWED FIRST):
1. sudo ufw allow ssh (or your custom SSH port)
2. sudo ufw allow http (if running a web server)
3. sudo ufw allow https (if running HTTPS)
4. sudo ufw enable
WARNING: Enabling the firewall without allowing SSH will lock you out." \
          "false" \
          "$(echo "$ufw_status" | head -5)"
      elif echo "$ufw_status" | grep -qi "active"; then
        fw_active=true
      fi
    fi

    # Check iptables if no UFW
    if [ "$fw_active" = false ] && command_exists iptables; then
      local ipt_rules
      ipt_rules=$(try_sudo iptables -L -n || iptables -L -n 2>/dev/null || echo "")
      local rule_count
      rule_count=$(echo "$ipt_rules" | grep -c -v "^Chain\|^target\|^$" || echo "0")
      rule_count=$(echo "$rule_count" | tr -d '[:space:]')
      rule_count="${rule_count:-0}"

      if [ "$rule_count" -lt 3 ] 2>/dev/null; then
        add_finding "HIGH" "firewall" \
          "No firewall rules configured" \
          "No UFW and iptables has ${rule_count} rules (effectively no firewall)." \
          "Your server has no firewall protection. Every listening service is directly accessible from the internet." \
          "Install and enable UFW:
sudo apt install ufw -y
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow ssh
sudo ufw enable" \
          "false" \
          "iptables_rules=${rule_count}"
      else
        fw_active=true
      fi
    fi

    if [ "$fw_active" = false ] && ! command_exists ufw && ! command_exists iptables; then
      add_finding "HIGH" "firewall" \
        "No firewall detected" \
        "Neither UFW nor iptables found on this system." \
        "Your server has no firewall at all. Every port is open to the internet." \
        "Install UFW: sudo apt install ufw -y  Then configure as described above." \
        "false"
    fi
  fi
}

# ============================================================================
# Phase 5: Docker Security
# ============================================================================

check_docker() {
  print_section "Docker Security"

  if ! command_exists docker; then
    return
  fi

  # Check: Docker socket permissions
  if [ -S /var/run/docker.sock ]; then
    local sock_perms
    sock_perms=$(stat -c "%a" /var/run/docker.sock 2>/dev/null || echo "unknown")
    if [ "$sock_perms" = "666" ] || [ "$sock_perms" = "777" ]; then
      add_finding "CRITICAL" "docker" \
        "Docker socket is world-accessible" \
        "/var/run/docker.sock has permissions ${sock_perms}." \
        "Any user or process on this machine can control Docker — create privileged containers, mount the host filesystem, and effectively get root access. This is the #1 Docker misconfiguration." \
        "Fix permissions: sudo chmod 660 /var/run/docker.sock  Ensure only the docker group has access. Use 'sudo usermod -aG docker <your-user>' for authorized users only." \
        "true" \
        "socket_perms=${sock_perms}"
    fi
  fi

  # Check: Containers running as root
  local root_containers
  root_containers=$(docker ps --format '{{.Names}}' 2>/dev/null | while read -r name; do
    local user
    user=$(docker inspect --format '{{.Config.User}}' "$name" 2>/dev/null || echo "")
    if [ -z "$user" ] || [ "$user" = "root" ] || [ "$user" = "0" ]; then
      echo "$name"
    fi
  done)

  if [ -n "$root_containers" ]; then
    local count
    count=$(echo "$root_containers" | wc -l)
    add_finding "MEDIUM" "docker" \
      "${count} container(s) running as root" \
      "These containers run as root (UID 0): $(echo "$root_containers" | tr '\n' ', ' | sed 's/,$//')" \
      "If any of these containers is compromised, the attacker has root privileges inside the container. Combined with certain misconfigurations, this can lead to full host compromise." \
      "Add a non-root USER directive to each Dockerfile, or run with --user flag: docker run --user 1000:1000 ..." \
      "false" \
      "$(echo "$root_containers" | head -10)"
  fi

  # Check: Privileged containers
  local priv_containers
  priv_containers=$(docker ps --format '{{.Names}}' 2>/dev/null | while read -r name; do
    local priv
    priv=$(docker inspect --format '{{.HostConfig.Privileged}}' "$name" 2>/dev/null || echo "false")
    if [ "$priv" = "true" ]; then
      echo "$name"
    fi
  done)

  if [ -n "$priv_containers" ]; then
    add_finding "CRITICAL" "docker" \
      "Privileged container(s) detected" \
      "These containers run in privileged mode: $(echo "$priv_containers" | tr '\n' ', ' | sed 's/,$//')" \
      "Privileged containers have FULL access to the host machine — all devices, all kernel capabilities. A container escape is trivial. This is equivalent to running without Docker isolation at all." \
      "Remove --privileged flag. Use specific --cap-add flags for only the capabilities actually needed." \
      "false" \
      "$(echo "$priv_containers" | head -5)"
  fi

  # Check: Docker daemon exposed on TCP
  if docker info 2>/dev/null | grep -q "tcp://"; then
    add_finding "CRITICAL" "docker" \
      "Docker daemon exposed via TCP" \
      "Docker daemon is listening on a TCP socket." \
      "Remote Docker API access without TLS mutual auth is the same as giving root SSH access to anyone. Cryptomining botnets actively scan for this." \
      "Remove -H tcp:// from Docker daemon configuration (/etc/docker/daemon.json or dockerd flags). Use SSH-based Docker access instead: docker -H ssh://user@host" \
      "false" \
      "$(docker info 2>/dev/null | grep -i 'tcp://' || echo '')"
  fi
}

# ============================================================================
# Phase 6: Secrets & Credentials
# ============================================================================

check_secrets() {
  print_section "Secrets & Credentials"

  # Check: .env files with loose permissions
  local loose_env_files=""
  local search_dirs="/home /opt /srv"
  [ "$OS_TYPE" = "macos" ] && search_dirs="/Users /opt /srv"
  [ -d /root ] && search_dirs="$search_dirs /root"
  for env_file in $(find $search_dirs -name ".env" -type f -maxdepth 5 2>/dev/null | head -20); do
    local perms
    perms=$(portable_stat_perms "$env_file")
    if [ "$perms" != "unknown" ] && [ "$perms" != "600" ] && [ "$perms" != "400" ] && [ "$perms" != "640" ]; then
      loose_env_files="${loose_env_files}${env_file} (${perms})\n"
    fi
  done

  if [ -n "$loose_env_files" ]; then
    add_finding "HIGH" "secrets" \
      ".env files with loose permissions" \
      "These .env files are readable by other users: $(echo -e "$loose_env_files" | head -5)" \
      "Environment files typically contain API keys, database passwords, and secret tokens. Loose permissions mean any user on this machine can read them." \
      "Fix permissions on all .env files: find /home /opt /srv -name '.env' -exec chmod 600 {} \;" \
      "true" \
      "$(echo -e "$loose_env_files" | head -10)"
  fi

  # Check: SSH key permissions
  local bad_keys=""
  local ssh_search_dirs="/home/*/.ssh"
  [ "$OS_TYPE" = "macos" ] && ssh_search_dirs="/Users/*/.ssh"
  [ -d /root/.ssh ] && ssh_search_dirs="$ssh_search_dirs /root/.ssh"
  for key_dir in $ssh_search_dirs; do
    if [ -d "$key_dir" ]; then
      for key in "$key_dir"/id_* "$key_dir"/*.pem; do
        if [ -f "$key" ] && [[ ! "$key" == *.pub ]]; then
          local kperms
          kperms=$(portable_stat_perms "$key")
          if [ "$kperms" != "unknown" ] && [ "$kperms" != "600" ] && [ "$kperms" != "400" ]; then
            bad_keys="${bad_keys}${key} (${kperms})\n"
          fi
        fi
      done
    fi
  done

  if [ -n "$bad_keys" ]; then
    add_finding "HIGH" "secrets" \
      "SSH private keys with loose permissions" \
      "These private keys have overly permissive access: $(echo -e "$bad_keys" | head -5)" \
      "SSH private keys with wrong permissions can be read by other users. SSH itself will refuse to use them, but an attacker who reads them can use them from elsewhere." \
      "Fix: chmod 600 on all private key files. SSH requires this anyway." \
      "true" \
      "$(echo -e "$bad_keys" | head -10)"
  fi

  # Check: API keys in shell history
  local history_files="$HOME/.bash_history $HOME/.zsh_history"
  local history_leaks=""
  for hfile in $history_files; do
    if file_readable "$hfile"; then
      local leaks
      leaks=$(grep -niE "(api[_-]?key|secret[_-]?key|password|token|bearer)\s*[=:]\s*['\"]?[A-Za-z0-9_\-]{16,}" "$hfile" 2>/dev/null | head -5 || echo "")
      if [ -n "$leaks" ]; then
        history_leaks="${history_leaks}${hfile}: $(echo "$leaks" | wc -l) potential secrets found\n"
      fi
    fi
  done

  if [ -n "$history_leaks" ]; then
    add_finding "MEDIUM" "secrets" \
      "Potential secrets found in shell history" \
      "Shell history files contain what appear to be API keys or tokens: $(echo -e "$history_leaks")" \
      "Anyone who gains access to your user account (or reads a backup) can see every command you've typed, including any passwords or API keys you've pasted into the terminal." \
      "Clear history: history -c && rm -f ~/.bash_history ~/.zsh_history  Then use environment variables or config files (with proper permissions) instead of pasting secrets into commands." \
      "false" \
      "$(echo -e "$history_leaks")"
  fi

  # Check: Authorized keys (informational)
  local total_authorized=0
  local ak_dirs="/home/*/.ssh/authorized_keys"
  [ "$OS_TYPE" = "macos" ] && ak_dirs="/Users/*/.ssh/authorized_keys"
  [ -f /root/.ssh/authorized_keys ] && ak_dirs="$ak_dirs /root/.ssh/authorized_keys"
  for ak in $ak_dirs; do
    if file_readable "$ak"; then
      local count
      count=$(grep -c "^ssh-" "$ak" 2>/dev/null || echo "0")
      total_authorized=$((total_authorized + count))
    fi
  done

  if [ "$total_authorized" -gt 5 ]; then
    add_finding "LOW" "secrets" \
      "${total_authorized} SSH authorized keys found" \
      "There are ${total_authorized} SSH public keys authorized to access this machine." \
      "Each authorized key is a potential access point. If any of these keys are compromised or belong to people who no longer need access, they can still log in." \
      "Review authorized_keys files periodically. Remove keys for former team members or unused services: cat ~/.ssh/authorized_keys" \
      "false" \
      "total_authorized_keys=${total_authorized}"
  fi
}

# ============================================================================
# Phase 7: System Updates
# ============================================================================

check_updates() {
  print_section "System Updates"

  if [ "$OS_TYPE" = "macos" ]; then
    # macOS: Check for pending software updates (with timeout to avoid hanging)
    local sw_updates=""
    # Use perl timeout since macOS lacks GNU timeout; avoids gtimeout dependency
    sw_updates=$(perl -e 'alarm 30; exec @ARGV' softwareupdate -l 2>&1 || echo "TIMEOUT")

    if echo "$sw_updates" | grep -q "TIMEOUT"; then
      add_finding "INFO" "system" \
        "Could not check for macOS updates" \
        "softwareupdate timed out after 30 seconds (Apple servers may be slow)." \
        "Cannot verify if your system is fully patched." \
        "Check manually: System Settings > General > Software Update, or run: softwareupdate -l" \
        "false"
    elif echo "$sw_updates" | grep -qi "No new software available"; then
      : # All good, no finding needed
    elif echo "$sw_updates" | grep -qi "\*"; then
      local pending
      pending=$(echo "$sw_updates" | grep -c "\*" || echo "0")
      pending=$(echo "$pending" | tr -d '[:space:]')
      pending="${pending:-0}"
      local update_list
      update_list=$(echo "$sw_updates" | grep "\*" | sed 's/^[[:space:]]*//' | head -10)

      # Check if any are security updates (Rapid Security Response or Security Update)
      local security_count
      security_count=$(echo "$sw_updates" | grep -ciE "security|XProtect|Rapid Security Response" || echo "0")
      security_count=$(echo "$security_count" | tr -d '[:space:]')
      security_count="${security_count:-0}"

      local severity="MEDIUM"
      [ "$security_count" -gt 0 ] 2>/dev/null && severity="HIGH"

      add_finding "$severity" "system" \
        "${pending} pending macOS update(s)" \
        "Available updates: ${update_list}" \
        "Pending updates may include security patches for known vulnerabilities. macOS updates also include XProtect malware definitions and Rapid Security Responses." \
        "Update now: sudo softwareupdate -ia  Or via System Settings > General > Software Update.
For servers (Mac Mini): enable automatic updates in System Settings > General > Software Update > Automatic Updates." \
        "false" \
        "pending_updates=${pending}, security_updates=${security_count}"
    fi

    # macOS: Check if automatic updates are enabled
    local auto_update=""
    auto_update=$(defaults read /Library/Preferences/com.apple.SoftwareUpdate AutomaticCheckEnabled 2>/dev/null || echo "unknown")
    local auto_download=""
    auto_download=$(defaults read /Library/Preferences/com.apple.SoftwareUpdate AutomaticDownload 2>/dev/null || echo "unknown")
    local auto_install=""
    auto_install=$(defaults read /Library/Preferences/com.apple.SoftwareUpdate AutomaticallyInstallMacOSUpdates 2>/dev/null || echo "unknown")
    local auto_critical=""
    auto_critical=$(defaults read /Library/Preferences/com.apple.SoftwareUpdate CriticalUpdateInstall 2>/dev/null || echo "unknown")

    if [ "$auto_update" = "0" ] || [ "$auto_update" = "unknown" ]; then
      add_finding "MEDIUM" "system" \
        "Automatic update checking is disabled" \
        "AutomaticCheckEnabled=${auto_update}" \
        "Without automatic checking, your Mac won't know about new security patches until you manually check. Rapid Security Responses fix actively exploited vulnerabilities." \
        "Enable: sudo defaults write /Library/Preferences/com.apple.SoftwareUpdate AutomaticCheckEnabled -bool true
Or: System Settings > General > Software Update > Automatic Updates > Check for updates" \
        "false" \
        "AutomaticCheckEnabled=${auto_update}"
    fi

    if [ "$auto_critical" = "0" ] || [ "$auto_critical" = "unknown" ]; then
      add_finding "HIGH" "system" \
        "Automatic critical/security updates are disabled" \
        "CriticalUpdateInstall=${auto_critical}, AutomaticallyInstallMacOSUpdates=${auto_install}" \
        "Apple's Rapid Security Responses patch actively exploited zero-days and are designed to install immediately. With this off, your Mac stays vulnerable until you manually update." \
        "Enable: sudo defaults write /Library/Preferences/com.apple.SoftwareUpdate CriticalUpdateInstall -bool true
Or: System Settings > General > Software Update > Automatic Updates > Install Security Responses and system files" \
        "false" \
        "CriticalUpdateInstall=${auto_critical}, AutoInstallMacOS=${auto_install}"
    fi

    # macOS: Check SIP status
    if command_exists csrutil; then
      local sip_status
      sip_status=$(csrutil status 2>/dev/null || echo "unknown")
      if echo "$sip_status" | grep -qi "disabled"; then
        add_finding "CRITICAL" "system" \
          "System Integrity Protection (SIP) is disabled" \
          "$sip_status" \
          "SIP prevents even root from modifying protected system files, frameworks, and kernel extensions. With SIP off, malware or a compromised process can tamper with core macOS components." \
          "Re-enable SIP: Boot into Recovery Mode (hold Cmd+R on Intel, or hold power button on Apple Silicon), open Terminal, run: csrutil enable, then reboot." \
          "false" \
          "$sip_status"
      fi
    fi

    # macOS: Check FileVault
    if command_exists fdesetup; then
      local fv_status
      fv_status=$(fdesetup status 2>/dev/null || echo "unknown")
      if echo "$fv_status" | grep -qi "Off\|not encrypted"; then
        add_finding "HIGH" "system" \
          "FileVault disk encryption is disabled" \
          "$fv_status" \
          "Without FileVault, anyone with physical access to this Mac (theft, break-in, decommissioned hardware) can read all data on the disk by booting into recovery or removing the drive." \
          "Enable: System Settings > Privacy & Security > FileVault > Turn On
Or: sudo fdesetup enable" \
          "false" \
          "$fv_status"
      fi
    fi

    # macOS: Check Gatekeeper
    if command_exists spctl; then
      local gk_status
      gk_status=$(spctl --status 2>/dev/null || echo "unknown")
      if echo "$gk_status" | grep -qi "disabled"; then
        add_finding "HIGH" "system" \
          "Gatekeeper is disabled" \
          "$gk_status" \
          "Gatekeeper blocks unsigned and unnotarized apps. With it off, any downloaded application can run — including malware disguised as legitimate software." \
          "Enable: sudo spctl --master-enable
Or: System Settings > Privacy & Security > Allow applications downloaded from: App Store and identified developers" \
          "false" \
          "$gk_status"
      fi
    fi

  else
    # Linux: Check unattended upgrades (Debian/Ubuntu)
    if command_exists apt; then
      if ! dpkg -l unattended-upgrades 2>/dev/null | grep -q "^ii"; then
        add_finding "MEDIUM" "system" \
          "Automatic security updates not configured" \
          "unattended-upgrades package is not installed." \
          "Without automatic security updates, known vulnerabilities remain unfixed until you manually update. Most breaches exploit vulnerabilities that already have patches available." \
          "Install: sudo apt install unattended-upgrades -y
Configure: sudo dpkg-reconfigure -plow unattended-upgrades" \
          "true"
      fi
    fi

    # Linux: Check pending security updates
    if command_exists apt; then
      local pending
      pending=$(apt list --upgradable 2>/dev/null | grep -ci "security" || true)
      pending="${pending:-0}"
      pending=$(echo "$pending" | tr -d '[:space:]')
      if [ "$pending" -gt 0 ] 2>/dev/null; then
        add_finding "HIGH" "system" \
          "${pending} pending security update(s)" \
          "There are ${pending} security updates waiting to be installed." \
          "Each pending security update is a known vulnerability with a published fix that you haven't applied yet. Attackers actively monitor these disclosures." \
          "Update now: sudo apt update && sudo apt upgrade -y  For security-only: sudo unattended-upgrades --dry-run" \
          "true" \
          "pending_security_updates=${pending}"
      fi
    elif command_exists dnf; then
      local pending
      pending=$(dnf check-update --security 2>/dev/null | grep -c "\.x86_64\|\.noarch\|\.aarch64" || echo "0")
      if [ "$pending" -gt 0 ]; then
        add_finding "HIGH" "system" \
          "${pending} pending security update(s)" \
          "There are ${pending} security updates waiting to be installed." \
          "Each pending security update is a known vulnerability with a published fix that you haven't applied yet." \
          "Update now: sudo dnf update --security -y" \
          "true" \
          "pending_security_updates=${pending}"
      fi
    elif command_exists yum; then
      local pending
      pending=$(yum check-update --security 2>/dev/null | grep -c "\.x86_64\|\.noarch\|\.aarch64" || echo "0")
      if [ "$pending" -gt 0 ]; then
        add_finding "HIGH" "system" \
          "${pending} pending security update(s)" \
          "There are ${pending} security updates waiting to be installed." \
          "Each pending security update is a known vulnerability with a published fix that you haven't applied yet." \
          "Update now: sudo yum update --security -y" \
          "true" \
          "pending_security_updates=${pending}"
      fi
    fi
  fi
}

# ============================================================================
# Phase 8: SSL/TLS
# ============================================================================

check_ssl() {
  print_section "SSL/TLS Certificates"

  # Check for expiring certificates
  if command_exists openssl; then
    local cert_dirs="/etc/letsencrypt/live /etc/ssl/certs /etc/nginx/ssl"
    for cert_dir in $cert_dirs; do
      if [ -d "$cert_dir" ]; then
        find "$cert_dir" -name "*.pem" -o -name "*.crt" 2>/dev/null | head -10 | while read -r cert; do
          local expiry
          expiry=$(openssl x509 -enddate -noout -in "$cert" 2>/dev/null | cut -d= -f2 || echo "")
          if [ -n "$expiry" ]; then
            local expiry_epoch
            expiry_epoch=$(date -d "$expiry" +%s 2>/dev/null || echo "0")
            local now_epoch
            now_epoch=$(date +%s)
            local days_left=$(( (expiry_epoch - now_epoch) / 86400 ))

            if [ "$days_left" -lt 0 ]; then
              add_finding "CRITICAL" "ssl" \
                "SSL certificate EXPIRED" \
                "${cert} expired ${days_left#-} days ago." \
                "Your HTTPS certificate has expired. Browsers show scary warnings to visitors, and encrypted connections may fail entirely." \
                "Renew with: sudo certbot renew  If using Let's Encrypt, check cron/timer: systemctl status certbot.timer" \
                "true" \
                "cert=${cert} expired=${expiry}"
            elif [ "$days_left" -lt 14 ]; then
              add_finding "HIGH" "ssl" \
                "SSL certificate expires in ${days_left} days" \
                "${cert} expires on ${expiry}." \
                "Your certificate will expire soon. If auto-renewal is not working, your site will go down." \
                "Test renewal: sudo certbot renew --dry-run  If it fails, check logs: sudo journalctl -u certbot" \
                "true" \
                "cert=${cert} expires=${expiry} days_left=${days_left}"
            fi
          fi
        done
      fi
    done
  fi
}

# ============================================================================
# Output
# ============================================================================

generate_output() {
  # Count by severity
  local critical=0 high=0 medium=0 low=0 info=0
  critical=$(echo "$FINDINGS" | python3 -c "import json,sys; d=json.load(sys.stdin); print(sum(1 for f in d if f['severity']=='CRITICAL'))" 2>/dev/null || echo "0")
  high=$(echo "$FINDINGS" | python3 -c "import json,sys; d=json.load(sys.stdin); print(sum(1 for f in d if f['severity']=='HIGH'))" 2>/dev/null || echo "0")
  medium=$(echo "$FINDINGS" | python3 -c "import json,sys; d=json.load(sys.stdin); print(sum(1 for f in d if f['severity']=='MEDIUM'))" 2>/dev/null || echo "0")
  low=$(echo "$FINDINGS" | python3 -c "import json,sys; d=json.load(sys.stdin); print(sum(1 for f in d if f['severity']=='LOW'))" 2>/dev/null || echo "0")
  info=$(echo "$FINDINGS" | python3 -c "import json,sys; d=json.load(sys.stdin); print(sum(1 for f in d if f['severity']=='INFO'))" 2>/dev/null || echo "0")

  # Determine overall posture
  local posture="GREEN"
  local posture_label="GOOD"
  if [ "$medium" -gt 0 ] || [ "$low" -gt 2 ]; then posture="YELLOW"; posture_label="NEEDS ATTENTION"; fi
  if [ "$high" -gt 0 ]; then posture="ORANGE"; posture_label="AT RISK"; fi
  if [ "$critical" -gt 0 ]; then posture="RED"; posture_label="CRITICAL"; fi

  local auto_fixable
  auto_fixable=$(echo "$FINDINGS" | python3 -c "import json,sys; d=json.load(sys.stdin); print(sum(1 for f in d if f.get('auto_fixable')))" 2>/dev/null || echo "0")

  # JSON output
  local report
  report=$(cat <<ENDJSON
{
  "scan_id": "${SCAN_ID}",
  "timestamp": "${SCAN_TIME}",
  "version": "${VERSION}",
  "host": "$(hostname 2>/dev/null || echo 'unknown')",
  "posture": "${posture}",
  "posture_label": "${posture_label}",
  "summary": {
    "total": ${FINDING_COUNT},
    "critical": ${critical},
    "high": ${high},
    "medium": ${medium},
    "low": ${low},
    "info": ${info},
    "auto_fixable": ${auto_fixable}
  },
  "findings": ${FINDINGS},
  "scanner": "Techimpossible Security Posture Check v${VERSION}",
  "elevated": ${CAN_SUDO},
  "os": "${OS_TYPE}",
  "more_info": "https://techimpossible.com"
}
ENDJSON
)

  if [ "$OUTPUT_JSON" = true ]; then
    echo "$report"
  else
    # Human-readable output
    echo ""
    echo "  SECURITY POSTURE: ${posture} — ${posture_label}"
    echo "  ${critical} critical | ${high} high | ${medium} medium | ${low} low | ${info} info"
    if [ "$auto_fixable" -gt 0 ]; then
      echo "  ${auto_fixable} issue(s) can be auto-fixed with --fix"
    fi
    echo ""
    echo "  -----------------------------------------------"
    echo ""

    # Print findings sorted by severity
    echo "$FINDINGS" | python3 -c "
import json, sys
findings = json.load(sys.stdin)
order = {'CRITICAL': 0, 'HIGH': 1, 'MEDIUM': 2, 'LOW': 3, 'INFO': 4}
findings.sort(key=lambda f: order.get(f['severity'], 5))
for f in findings:
    sev = f['severity']
    icon = {'CRITICAL': '!!!', 'HIGH': '!! ', 'MEDIUM': '!  ', 'LOW': '.  ', 'INFO': '   '}.get(sev, '   ')
    print(f\"  {icon} [{sev}] {f['title']}\")
    print(f\"      Risk: {f['risk'][:120]}\")
    print(f\"      Fix:  {f['fix'].split(chr(10))[0][:120]}\")
    print()
" 2>/dev/null

    echo "  -----------------------------------------------"
    echo "  Full report: rerun with --json for structured output"
    echo "  Auto-fix safe issues: rerun with --fix"
    echo ""
    echo "  Need help fixing these? https://techimpossible.com"
    echo "  Professional security audit & remediation for startups and SMEs."
    echo ""
  fi
}

# ============================================================================
# Auto-fix (safe fixes only, with confirmation)
# ============================================================================

run_auto_fix() {
  if [ "$AUTO_FIX" = false ]; then
    return
  fi

  local fixable
  fixable=$(echo "$FINDINGS" | python3 -c "
import json, sys
findings = json.load(sys.stdin)
for f in findings:
    if f.get('auto_fixable'):
        print(f['title'])
" 2>/dev/null || echo "")

  if [ -z "$fixable" ]; then
    echo "  No auto-fixable issues found."
    return
  fi

  echo ""
  echo "  AUTO-FIX: The following issues can be fixed automatically:"
  echo ""
  echo "$fixable" | while read -r title; do
    echo "    - ${title}"
  done
  echo ""
  echo "  This will only fix safe, non-destructive issues (file permissions,"
  echo "  firewall rules, config changes). SSH and service restarts require"
  echo "  manual action to prevent lockouts."
  echo ""

  if [ -t 0 ]; then
    read -rp "  Proceed with auto-fix? [y/N] " confirm
    if [ "$confirm" != "y" ] && [ "$confirm" != "Y" ]; then
      echo "  Auto-fix cancelled."
      return
    fi
  else
    echo "  Running in non-interactive mode. Skipping auto-fix confirmation."
    echo "  Run interactively for auto-fix, or apply fixes from the report manually."
    return
  fi

  echo ""
  echo "  Applying fixes..."

  # Fix: OpenClaw config permissions
  for path in "$HOME/.openclaw/openclaw.json" "$HOME/.config/openclaw/openclaw.json"; do
    if [ -f "$path" ]; then
      chmod 600 "$path" 2>/dev/null && echo "    Fixed: ${path} permissions -> 600"
    fi
  done
  for path in "$HOME/.openclaw" "$HOME/.config/openclaw"; do
    if [ -d "$path" ]; then
      chmod 700 "$path" 2>/dev/null && echo "    Fixed: ${path}/ permissions -> 700"
    fi
  done

  # Fix: .env file permissions
  local fix_search_dirs="/home /opt /srv"
  [ "$OS_TYPE" = "macos" ] && fix_search_dirs="/Users /opt /srv"
  find $fix_search_dirs -name ".env" -type f -maxdepth 5 2>/dev/null | while read -r env_file; do
    local current
    current=$(portable_stat_perms "$env_file")
    if [ -n "$current" ] && [ "$current" != "unknown" ] && [ "$current" != "600" ] && [ "$current" != "400" ]; then
      chmod 600 "$env_file" 2>/dev/null && echo "    Fixed: ${env_file} permissions -> 600"
    fi
  done

  # Fix: SSH key permissions
  local fix_key_dirs="/home/*/.ssh"
  [ "$OS_TYPE" = "macos" ] && fix_key_dirs="/Users/*/.ssh"
  for key_dir in $fix_key_dirs "$HOME/.ssh"; do
    if [ -d "$key_dir" ]; then
      for key in "$key_dir"/id_* "$key_dir"/*.pem; do
        if [ -f "$key" ] && [[ ! "$key" == *.pub ]]; then
          chmod 600 "$key" 2>/dev/null && echo "    Fixed: ${key} permissions -> 600"
        fi
      done
    fi
  done

  # Fix: Install fail2ban if missing (Linux only — macOS uses Homebrew, don't auto-install)
  if [ "$OS_TYPE" = "linux" ] && ! command_exists fail2ban-client && command_exists apt; then
    echo "    Installing fail2ban..."
    if [ "$CAN_SUDO" = true ]; then
      sudo apt install -y fail2ban >/dev/null 2>&1 && \
        sudo systemctl enable --now fail2ban >/dev/null 2>&1 && \
        echo "    Fixed: fail2ban installed and enabled"
    else
      echo "    Skipped: fail2ban install requires sudo"
    fi
  fi

  # Fix: Install unattended-upgrades if missing (Linux/apt only)
  if [ "$OS_TYPE" = "linux" ] && command_exists apt && ! dpkg -l unattended-upgrades 2>/dev/null | grep -q "^ii"; then
    echo "    Installing unattended-upgrades..."
    if [ "$CAN_SUDO" = true ]; then
      sudo apt install -y unattended-upgrades >/dev/null 2>&1 && \
        echo "    Fixed: unattended-upgrades installed"
    else
      echo "    Skipped: unattended-upgrades install requires sudo"
    fi
  fi

  # Fix: Enable macOS automatic critical updates
  if [ "$OS_TYPE" = "macos" ]; then
    local crit_update
    crit_update=$(defaults read /Library/Preferences/com.apple.SoftwareUpdate CriticalUpdateInstall 2>/dev/null || echo "unknown")
    if [ "$crit_update" = "0" ] || [ "$crit_update" = "unknown" ]; then
      echo "    Enabling automatic critical/security updates..."
      if [ "$CAN_SUDO" = true ]; then
        sudo defaults write /Library/Preferences/com.apple.SoftwareUpdate CriticalUpdateInstall -bool true 2>/dev/null && \
          echo "    Fixed: Automatic critical updates enabled"
        sudo defaults write /Library/Preferences/com.apple.SoftwareUpdate AutomaticCheckEnabled -bool true 2>/dev/null && \
          echo "    Fixed: Automatic update checking enabled"
      else
        echo "    Skipped: macOS system preferences require sudo"
      fi
    fi
  fi

  echo ""
  echo "  Auto-fix complete. Re-run the scan to verify."
  echo "  Some fixes (SSH config, firewall, service binding) require manual action."
  echo ""
  echo "  Need help with the remaining issues? https://techimpossible.com"
  echo ""
}

# ============================================================================
# Main
# ============================================================================

main() {
  print_banner

  if [ "$SCAN_OPENCLAW" = true ]; then
    check_openclaw
  fi

  if [ "$SCAN_HOST" = true ]; then
    check_network
    check_ssh
    check_firewall
    check_docker
    check_secrets
    check_updates
    check_ssl
  fi

  generate_output

  if [ "$AUTO_FIX" = true ]; then
    run_auto_fix
  fi
}

main
