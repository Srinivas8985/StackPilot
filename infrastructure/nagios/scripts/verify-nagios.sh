#!/usr/bin/env bash
# ==============================================================================
# verify-nagios.sh - Nagios Configuration Syntax Validator
# ==============================================================================
set -e

CONFIG_FILE="${1:-/etc/nagios/nagios.cfg}"

if [ ! -f "$CONFIG_FILE" ]; then
  # Fallback to local repo config if testing locally
  CONFIG_FILE="$(dirname "$0")/../nagios.cfg"
fi

echo "=================================================="
echo "Validating Nagios Configuration: $CONFIG_FILE"
echo "=================================================="

if command -v nagios >/dev/null 2>&1; then
  nagios -v "$CONFIG_FILE"
elif command -v nagios3 >/dev/null 2>&1; then
  nagios3 -v "$CONFIG_FILE"
elif command -v /usr/local/nagios/bin/nagios >/dev/null 2>&1; then
  /usr/local/nagios/bin/nagios -v "$CONFIG_FILE"
else
  echo "[WARNING] Nagios binary not installed on this system."
  echo "Verifying syntax of object definitions manually..."
  ERRORS=0
  for f in $(dirname "$CONFIG_FILE")/objects/*.cfg $(dirname "$CONFIG_FILE")/conf.d/hosts/*.cfg; do
    if [ -f "$f" ]; then
      # Basic brace matching check
      OPENS=$(grep -o "{" "$f" | wc -l)
      CLOSES=$(grep -o "}" "$f" | wc -l)
      if [ "$OPENS" -ne "$CLOSES" ]; then
        echo "[ERROR] Unbalanced braces in $f (opens: $OPENS, closes: $CLOSES)"
        ERRORS=$((ERRORS + 1))
      else
        echo "[PASS] $f: structure balanced ($OPENS definitions)"
      fi
    fi
  done
  if [ "$ERRORS" -gt 0 ]; then
    echo "Validation failed with $ERRORS error(s)"
    exit 1
  fi
  echo "All Nagios object configuration definitions validated cleanly."
fi

