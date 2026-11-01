#!/bin/sh
set -euo pipefail

LABEL="com.bhagya.netusage"
BILLING_DAY="1"
HOTSPOT_GATEWAY="172.20.10.1"
TAILSCALE_CIDR="100.64.0.0/10"
INTERVAL="60"
BUN_FLAG=""
NO_BOOTSTRAP=0
UNINSTALL=0
WIPE_DATA=0
BIN_DIR=""
ASSUME_YES=0
INTERACTIVE=0
REPO="bhagyamudgal/netusage"
REF="main"
REMOTE_MODE=0
BILLING_DAY_SET=0
HOTSPOT_SET=0
CIDR_SET=0
INTERVAL_SET=0
ASK_VALUE=""

usage() {
  cat <<'EOF'
Usage: install.sh [options]

Install netusage sampler (macOS launchd, every 60s by default).

Options:
  --billing-day N         First day of billing cycle, 1-28 (default 1)
  --hotspot-gateway IP    Hotspot gateway address (default 172.20.10.1)
  --tailscale-cidr CIDR   Tailscale CGNAT range (default 100.64.0.0/10)
  --interval SEC          Seconds between samples, positive int (default 60)
  --bun PATH              Bun binary to use (default: auto-detect real bun)
  --bin-dir DIR           Where to install the netusage shim (default $HOME/.local/bin)
  --repo SLUG             GitHub repo for no-checkout install (default bhagyamudgal/netusage)
  --ref REF               Git ref for no-checkout install (default main)
  --yes, -y               Accept all defaults, never prompt
  --interactive           Prompt for every setting, not just billing day
  --no-bootstrap          Copy files and write plist without loading it
  --uninstall             Remove plist, app dir and shim (keeps data)
  --wipe-data             With --uninstall, also remove usage.json and error.log
  -h, --help              Show this help
EOF
}

die() {
  echo "install.sh: $1" >&2
  exit "${2:-1}"
}

is_shim() {
  target="$1"
  if [ -L "$target" ]; then
    link_dest="$(readlink "$target" 2>/dev/null || true)"
    case "$link_dest" in
      *sfw-shim*) return 0 ;;
    esac
  fi
  if grep -q "sfw-shim" "$target" 2>/dev/null; then
    return 0
  fi
  return 1
}

is_good_bun() {
  candidate="$1"
  [ -n "$candidate" ] || return 1
  [ -f "$candidate" ] || return 1
  [ -x "$candidate" ] || return 1
  if is_shim "$candidate"; then
    return 1
  fi
  return 0
}

resolve_bun() {
  if [ -n "$BUN_FLAG" ]; then
    is_good_bun "$BUN_FLAG" || die "bun at $BUN_FLAG is missing, not executable, or an sfw-shim. Install Bun from https://bun.sh and retry."
    echo "$BUN_FLAG"
    return 0
  fi
  home_bun="${HOME}/.bun/bin/bun"
  if is_good_bun "$home_bun"; then
    echo "$home_bun"
    return 0
  fi
  if command -v bun >/dev/null 2>&1; then
    found="$(command -v bun)"
    resolved="$found"
    if [ -L "$found" ]; then
      link_dest="$(readlink "$found" 2>/dev/null || true)"
      case "$link_dest" in
        /*) resolved="$link_dest" ;;
        *) resolved="$(dirname "$found")/$link_dest" ;;
      esac
    fi
    case "$resolved" in
      *sfw-shim*) ;;
      *) if is_good_bun "$resolved"; then echo "$resolved"; return 0; fi ;;
    esac
  fi
  if is_good_bun "/opt/homebrew/bin/bun"; then
    echo "/opt/homebrew/bin/bun"
    return 0
  fi
  die "no real bun binary found (skipped sfw-shim entries). Install Bun from https://bun.sh, then retry with --bun PATH."
}

valid_billing_day() {
  case "$1" in
    ''|*[!0-9]*) return 1 ;;
  esac
  [ "$1" -ge 1 ] 2>/dev/null || return 1
  [ "$1" -le 28 ] 2>/dev/null || return 1
  return 0
}

valid_interval() {
  case "$1" in
    ''|*[!0-9]*) return 1 ;;
  esac
  [ "$1" -ge 1 ] 2>/dev/null || return 1
  return 0
}

ask_number() {
  label="$1"
  default_value="$2"
  validator="$3"
  hint="$4"
  if ! [ -t 0 ]; then
    ASK_VALUE="$default_value"
    return 0
  fi
  while true; do
    printf "%s [%s]: " "$label" "$default_value"
    if ! IFS= read -r answer; then
      echo ""
      ASK_VALUE="$default_value"
      return 0
    fi
    answer="$(printf '%s' "$answer" | tr -d '\r')"
    if [ -z "$answer" ]; then
      ASK_VALUE="$default_value"
      return 0
    fi
    if "$validator" "$answer"; then
      ASK_VALUE="$answer"
      return 0
    fi
    echo "$hint"
  done
}

ask_text() {
  label="$1"
  default_value="$2"
  if ! [ -t 0 ]; then
    ASK_VALUE="$default_value"
    return 0
  fi
  printf "%s [%s]: " "$label" "$default_value"
  if ! IFS= read -r answer; then
    echo ""
    ASK_VALUE="$default_value"
    return 0
  fi
  answer="$(printf '%s' "$answer" | tr -d '\r')"
  if [ -z "$answer" ]; then
    ASK_VALUE="$default_value"
  else
    ASK_VALUE="$answer"
  fi
}

while [ $# -gt 0 ]; do
  case "$1" in
    --billing-day) [ $# -ge 2 ] || die "--billing-day needs a value"; BILLING_DAY="$2"; BILLING_DAY_SET=1; shift 2 ;;
    --hotspot-gateway) [ $# -ge 2 ] || die "--hotspot-gateway needs a value"; HOTSPOT_GATEWAY="$2"; HOTSPOT_SET=1; shift 2 ;;
    --tailscale-cidr) [ $# -ge 2 ] || die "--tailscale-cidr needs a value"; TAILSCALE_CIDR="$2"; CIDR_SET=1; shift 2 ;;
    --interval) [ $# -ge 2 ] || die "--interval needs a value"; INTERVAL="$2"; INTERVAL_SET=1; shift 2 ;;
    --bun) [ $# -ge 2 ] || die "--bun needs a value"; BUN_FLAG="$2"; shift 2 ;;
    --bin-dir) [ $# -ge 2 ] || die "--bin-dir needs a value"; BIN_DIR="$2"; shift 2 ;;
    --repo) [ $# -ge 2 ] || die "--repo needs a value"; REPO="$2"; shift 2 ;;
    --ref) [ $# -ge 2 ] || die "--ref needs a value"; REF="$2"; shift 2 ;;
    --yes|-y) ASSUME_YES=1; shift ;;
    --interactive) INTERACTIVE=1; shift ;;
    --no-bootstrap) NO_BOOTSTRAP=1; shift ;;
    --uninstall) UNINSTALL=1; shift ;;
    --wipe-data) WIPE_DATA=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) die "unknown flag: $1 (see --help)" ;;
  esac
done

: "${HOME:?"HOME is not set"}"
if [ -z "$BIN_DIR" ]; then
  BIN_DIR="${HOME}/.local/bin"
fi

DATA_DIR="${HOME}/.netusage"
APP_DIR="${DATA_DIR}/app"
PLIST="${HOME}/Library/LaunchAgents/${LABEL}.plist"
SHIM="${BIN_DIR}/netusage"

if [ "$UNINSTALL" -eq 1 ]; then
  if [ "$(uname)" = "Darwin" ]; then
    launchctl bootout "gui/$(id -u)/${LABEL}" 2>/dev/null || true
  fi
  rm -f "$PLIST" "$SHIM"
  rm -rf "$APP_DIR"
  if [ "$WIPE_DATA" -eq 1 ]; then
    rm -f "${DATA_DIR}/usage.json" "${DATA_DIR}/error.log"
    rmdir "$DATA_DIR" 2>/dev/null || true
    echo "Uninstalled ${LABEL} and wiped usage data."
  else
    echo "Uninstalled ${LABEL}. Kept ${DATA_DIR}/usage.json and ${DATA_DIR}/error.log."
  fi
  exit 0
fi

if [ "$BILLING_DAY_SET" -eq 0 ]; then
  if valid_billing_day "${NETUSAGE_BILLING_DAY:-}"; then
    BILLING_DAY="${NETUSAGE_BILLING_DAY}"
  fi
fi
if [ "$INTERVAL_SET" -eq 0 ]; then
  if valid_interval "${NETUSAGE_INTERVAL_SEC:-}"; then
    INTERVAL="${NETUSAGE_INTERVAL_SEC}"
  fi
fi
if [ "$HOTSPOT_SET" -eq 0 ] && [ -n "${NETUSAGE_HOTSPOT_GATEWAY:-}" ]; then
  HOTSPOT_GATEWAY="${NETUSAGE_HOTSPOT_GATEWAY}"
fi
if [ "$CIDR_SET" -eq 0 ] && [ -n "${NETUSAGE_TAILSCALE_CIDR:-}" ]; then
  TAILSCALE_CIDR="${NETUSAGE_TAILSCALE_CIDR}"
fi

if [ "$ASSUME_YES" -eq 0 ]; then
  if [ "$BILLING_DAY_SET" -eq 0 ]; then
    ask_number "Billing day of month" "$BILLING_DAY" valid_billing_day "Enter an integer 1-28."
    BILLING_DAY="$ASK_VALUE"
  fi
  if [ "$INTERACTIVE" -eq 1 ]; then
    if [ "$HOTSPOT_SET" -eq 0 ]; then
      ask_text "Hotspot gateway" "$HOTSPOT_GATEWAY"
      HOTSPOT_GATEWAY="$ASK_VALUE"
    fi
    if [ "$CIDR_SET" -eq 0 ]; then
      ask_text "Tailscale CIDR" "$TAILSCALE_CIDR"
      TAILSCALE_CIDR="$ASK_VALUE"
    fi
    if [ "$INTERVAL_SET" -eq 0 ]; then
      ask_number "Sample interval in seconds" "$INTERVAL" valid_interval "Enter a positive integer."
      INTERVAL="$ASK_VALUE"
    fi
  fi
fi

valid_billing_day "$BILLING_DAY" || die "--billing-day must be an integer 1-28 (got '$BILLING_DAY')"
valid_interval "$INTERVAL" || die "--interval must be a positive integer (got '$INTERVAL')"
[ -n "$HOTSPOT_GATEWAY" ] || die "--hotspot-gateway must be a non-empty string"
[ -n "$TAILSCALE_CIDR" ] || die "--tailscale-cidr must be a non-empty string"

BUN_BIN="$(resolve_bun)"

SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
if [ ! -f "${SCRIPT_DIR}/src/cli.ts" ] || [ ! -f "${SCRIPT_DIR}/package.json" ]; then
  command -v curl >/dev/null 2>&1 || die "curl is required for no-checkout install but was not found."
  command -v tar >/dev/null 2>&1 || die "tar is required for no-checkout install but was not found."
  case "$REPO" in
    *github.com/*) REPO="${REPO##*github.com/}" ;;
  esac
  REPO="${REPO%.git}"
  REMOTE_MODE=1
  FETCH_DIR="$(mktemp -d)"
  TARBALL_URL="https://codeload.github.com/${REPO}/tar.gz/refs/heads/${REF}"
  if curl -fsSL "$TARBALL_URL" -o "${FETCH_DIR}/repo.tgz"; then
    # Top dir name tracks the ref, so read it from the archive instead of assuming it.
    TOP_DIR="$(tar -tzf "${FETCH_DIR}/repo.tgz" | cut -d/ -f1 | head -n 1 || true)"
    [ -n "${TOP_DIR:-}" ] || die "could not read file list from $TARBALL_URL"
    tar -xzf "${FETCH_DIR}/repo.tgz" -C "$FETCH_DIR" "${TOP_DIR}/src" "${TOP_DIR}/lib" "${TOP_DIR}/package.json" "${TOP_DIR}/bun.lock" "${TOP_DIR}/tsconfig.json" || die "could not extract netusage sources from $TARBALL_URL"
    SCRIPT_DIR="${FETCH_DIR}/${TOP_DIR}"
  else
    RAW_BASE="https://raw.githubusercontent.com/${REPO}/${REF}"
    for f in src/cli.ts src/classify.ts src/config.ts src/cycle.ts src/delta.ts src/netstat.ts src/store.ts lib/try-catch.ts package.json bun.lock tsconfig.json; do
      mkdir -p "${FETCH_DIR}/tree/$(dirname "$f")"
      curl -fsSL "${RAW_BASE}/$f" -o "${FETCH_DIR}/tree/$f" || die "could not fetch $f from ${RAW_BASE} (tarball failed, raw fallback failed)"
    done
    SCRIPT_DIR="${FETCH_DIR}/tree"
  fi
fi
mkdir -p "$APP_DIR"
if command -v rsync >/dev/null 2>&1; then
  rsync -a --delete --exclude node_modules "${SCRIPT_DIR}/src/" "${APP_DIR}/src/"
  rsync -a --exclude node_modules "${SCRIPT_DIR}/lib/" "${APP_DIR}/lib/"
  cp "${SCRIPT_DIR}/package.json" "${APP_DIR}/package.json"
  cp "${SCRIPT_DIR}/bun.lock" "${APP_DIR}/bun.lock"
  cp "${SCRIPT_DIR}/tsconfig.json" "${APP_DIR}/tsconfig.json"
else
  rm -rf "${APP_DIR}/src" "${APP_DIR}/lib"
  mkdir -p "${APP_DIR}/src" "${APP_DIR}/lib"
  cp -R "${SCRIPT_DIR}/src/." "${APP_DIR}/src/"
  cp -R "${SCRIPT_DIR}/lib/." "${APP_DIR}/lib/"
  rm -rf "${APP_DIR}/src/node_modules" "${APP_DIR}/lib/node_modules"
  cp "${SCRIPT_DIR}/package.json" "${APP_DIR}/package.json"
  cp "${SCRIPT_DIR}/bun.lock" "${APP_DIR}/bun.lock"
  cp "${SCRIPT_DIR}/tsconfig.json" "${APP_DIR}/tsconfig.json"
fi

if ! "$BUN_BIN" install --cwd "$APP_DIR"; then
  die "bun install failed in $APP_DIR. Check network access and retry."
fi

mkdir -p "$BIN_DIR"
SHIM_TMP="${SHIM}.tmp.$$"
NETUSAGE_PATH_LINE=""
NETUSAGE_PATH_EXPORT=""
if [ -n "${NETUSAGE_PATH:-}" ] && [ "${NETUSAGE_PATH}" != "${DATA_DIR}/usage.json" ]; then
  NETUSAGE_PATH_LINE=": \"\${NETUSAGE_PATH:=${NETUSAGE_PATH}\""
  NETUSAGE_PATH_EXPORT=" NETUSAGE_PATH"
fi
cat > "$SHIM_TMP" <<EOF
#!/bin/sh
: "\${NETUSAGE_BILLING_DAY:=${BILLING_DAY}}"
: "\${NETUSAGE_HOTSPOT_GATEWAY:=${HOTSPOT_GATEWAY}}"
: "\${NETUSAGE_TAILSCALE_CIDR:=${TAILSCALE_CIDR}}"
: "\${NETUSAGE_INTERVAL_SEC:=${INTERVAL}}"
${NETUSAGE_PATH_LINE}
export NETUSAGE_BILLING_DAY NETUSAGE_HOTSPOT_GATEWAY NETUSAGE_TAILSCALE_CIDR NETUSAGE_INTERVAL_SEC${NETUSAGE_PATH_EXPORT}
exec "${BUN_BIN}" "${APP_DIR}/src/cli.ts" "\$@"
EOF
chmod +x "$SHIM_TMP"
mv "$SHIM_TMP" "$SHIM"

if [ "$(uname)" != "Darwin" ]; then
  if [ "$NO_BOOTSTRAP" -eq 1 ]; then
    echo "Non-macOS system: copied app and installed shim, skipped launchd plist and bootstrap."
  else
    echo "install.sh: launchd install requires macOS (found $(uname)). Re-run with --no-bootstrap for copy-only mode." >&2
    exit 2
  fi
else
  mkdir -p "$(dirname "$PLIST")"
  cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${BUN_BIN}</string>
    <string>${APP_DIR}/src/cli.ts</string>
    <string>sample</string>
  </array>
  <key>StartInterval</key>
  <integer>${INTERVAL}</integer>
  <key>RunAtLoad</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${DATA_DIR}/error.log</string>
  <key>StandardErrorPath</key>
  <string>${DATA_DIR}/error.log</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>NETUSAGE_BILLING_DAY</key>
    <string>${BILLING_DAY}</string>
    <key>NETUSAGE_HOTSPOT_GATEWAY</key>
    <string>${HOTSPOT_GATEWAY}</string>
    <key>NETUSAGE_TAILSCALE_CIDR</key>
    <string>${TAILSCALE_CIDR}</string>
    <key>NETUSAGE_INTERVAL_SEC</key>
    <string>${INTERVAL}</string>
  </dict>
</dict>
</plist>
EOF
  if [ "$NO_BOOTSTRAP" -eq 0 ]; then
    launchctl bootout "gui/$(id -u)/${LABEL}" 2>/dev/null || true
    launchctl bootstrap "gui/$(id -u)" "$PLIST"
  else
    echo "Wrote $PLIST without bootstrap (--no-bootstrap)."
  fi
fi

echo "netusage installed:"
echo "  bun:             $BUN_BIN"
echo "  app:             $APP_DIR"
echo "  billing day:     $BILLING_DAY"
echo "  hotspot gateway: $HOTSPOT_GATEWAY"
echo "  tailscale cidr:  $TAILSCALE_CIDR"
echo "  interval (sec):  $INTERVAL"
echo "  shim:            $SHIM"
if [ "$NO_BOOTSTRAP" -eq 0 ] && [ "$(uname)" = "Darwin" ]; then
  echo "  plist:           $PLIST (loaded)"
else
  echo "  plist:           $PLIST (not loaded)"
fi
case ":$PATH:" in
  *":${BIN_DIR}:"*) ;;
  *) echo "Add the shim to PATH: export PATH=\"${BIN_DIR}:\$PATH\"" ;;
esac
if [ "$REMOTE_MODE" -eq 1 ]; then
  UNINSTALL_CMD="bash <(curl -fsSL https://raw.githubusercontent.com/${REPO}/${REF}/scripts/install.sh) --uninstall"
else
  UNINSTALL_CMD="bash scripts/install.sh --uninstall"
fi
if [ "$NO_BOOTSTRAP" -eq 0 ] && [ "$(uname)" = "Darwin" ]; then
  echo "Next: run \`netusage report\`, data lives at ${DATA_DIR}/usage.json."
  echo "Uninstall: $UNINSTALL_CMD"
else
  echo "Next: run \`$SHIM report\`, data lives at ${DATA_DIR}/usage.json."
  echo "Uninstall: $UNINSTALL_CMD"
fi
