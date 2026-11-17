#!/usr/bin/env bash
# Register this checkout's host as a Chrome native messaging host (macOS).
#
# After running it once, Chrome starts the host by itself whenever the Ageaf
# panel needs it, so `cd host && npm run dev` is no longer required.
# The host runs straight from host/src via tsx, so host code changes apply the
# next time Chrome starts it (reload the extension to force that).
#
# Usage: ./scripts/install-native-host.sh [extension-id]
#   Without an ID, the script looks up the unpacked Ageaf extension loaded
#   from build/ in your browser profiles (macOS may block this; pass the ID then).
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HOST_DIR="$ROOT_DIR/host"
BUILD_DIR="$ROOT_DIR/build"
APP_SUPPORT="$HOME/Library/Application Support"
BROWSER_DIRS=(
  "$APP_SUPPORT/Google/Chrome"
  "$APP_SUPPORT/BraveSoftware/Brave-Browser"
  "$APP_SUPPORT/Chromium"
  "$APP_SUPPORT/Arc/User Data"
)
WRAPPER_DIR="$HOME/.ageaf"
WRAPPER_PATH="$WRAPPER_DIR/native-host.sh"
LOG_PATH="$WRAPPER_DIR/native-host.log"

NODE_BIN="$(command -v node || true)"
if [[ -z "$NODE_BIN" ]]; then
  echo "error: node not found in PATH" >&2
  exit 1
fi

if [[ ! -d "$HOST_DIR/node_modules" ]]; then
  echo "Installing host dependencies..."
  (cd "$HOST_DIR" && npm install)
fi

EXT_ID="${1:-}"
if [[ -z "$EXT_ID" ]]; then
  EXT_ID="$("$NODE_BIN" -e '
    const fs = require("fs");
    const path = require("path");
    const [buildDir, ...browserDirs] = process.argv.slice(1);
    const found = new Set();
    for (const browserDir of browserDirs) {
      let profiles;
      try { profiles = fs.readdirSync(browserDir); } catch (err) {
        if (err.code === "EPERM" || err.code === "EACCES") {
          console.error("note: macOS blocked reading " + browserDir);
        }
        continue;
      }
      for (const profile of profiles) {
        for (const file of ["Secure Preferences", "Preferences"]) {
          let prefs;
          try { prefs = JSON.parse(fs.readFileSync(path.join(browserDir, profile, file), "utf8")); } catch { continue; }
          const settings = (prefs.extensions && prefs.extensions.settings) || {};
          for (const [id, ext] of Object.entries(settings)) {
            if (ext && ext.path && path.resolve(ext.path) === buildDir) found.add(id);
          }
        }
      }
    }
    process.stdout.write([...found].join(" "));
  ' "$BUILD_DIR" "${BROWSER_DIRS[@]}")"
  if [[ -z "$EXT_ID" ]]; then
    echo "error: could not detect the Ageaf extension ID automatically." >&2
    echo "Copy the ID shown under Ageaf in chrome://extensions and run:" >&2
    echo "  ./scripts/install-native-host.sh <extension-id>" >&2
    exit 1
  fi
  if [[ "$EXT_ID" == *" "* ]]; then
    echo "Found several Ageaf installs (one per Chrome profile): $EXT_ID"
  fi
fi

mkdir -p "$WRAPPER_DIR"

# Chrome starts native hosts with a minimal PATH, so capture the current one:
# the Claude runtime needs to find `claude` and `node`.
cat > "$WRAPPER_PATH" <<EOF
#!/bin/bash
export PATH="$PATH"
export DOTENV_CONFIG_QUIET=true
cd "$HOST_DIR"
exec "$NODE_BIN" --import tsx "$HOST_DIR/src/native.ts" "\$@" 2>>"$LOG_PATH"
EOF
chmod +x "$WRAPPER_PATH"

ORIGINS=""
for id in $EXT_ID; do
  ORIGINS+="${ORIGINS:+, }\"chrome-extension://$id/\""
done

MANIFEST_JSON="{
  \"name\": \"com.ageaf.host\",
  \"description\": \"Ageaf native messaging host\",
  \"path\": \"$WRAPPER_PATH\",
  \"type\": \"stdio\",
  \"allowed_origins\": [$ORIGINS]
}"

INSTALLED=()
for browser_dir in "${BROWSER_DIRS[@]}"; do
  [[ -d "$browser_dir" ]] || continue
  manifest_path="$browser_dir/NativeMessagingHosts/com.ageaf.host.json"
  if mkdir -p "$browser_dir/NativeMessagingHosts" 2>/dev/null \
    && printf '%s\n' "$MANIFEST_JSON" > "$manifest_path" 2>/dev/null; then
    INSTALLED+=("$manifest_path")
  else
    echo "warning: could not write $manifest_path" >&2
  fi
done

if [[ ${#INSTALLED[@]} -eq 0 ]]; then
  echo "error: no browser manifest was written." >&2
  echo "macOS may be blocking access to browser data: allow your terminal under" >&2
  echo "System Settings -> Privacy & Security -> App Management (or Full Disk Access)," >&2
  echo "then rerun." >&2
  exit 1
fi

echo "Native host registered."
for manifest_path in "${INSTALLED[@]}"; do
  echo "  manifest: $manifest_path"
done
echo "  launcher: $WRAPPER_PATH"
echo "  log:      $LOG_PATH"
echo "  allowed:  $EXT_ID"
echo
echo "Next: npm run build, reload Ageaf in chrome://extensions, refresh Overleaf,"
echo "and make sure the panel settings use the Native transport."
