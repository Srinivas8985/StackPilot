#!/usr/bin/env bash
# ==============================================================================
# check_mem.sh - Nagios NRPE Memory Usage Plugin
# ==============================================================================
# Usage: ./check_mem.sh <warning_pct> <critical_pct>
# Exit codes: 0 = OK, 1 = WARNING, 2 = CRITICAL, 3 = UNKNOWN

WARN=${1:-80}
CRIT=${2:-90}

if ! command -v free >/dev/null 2>&1; then
  echo "UNKNOWN - 'free' command not found"
  exit 3
fi

TOTAL=$(free -m | awk '/^Mem:/{print $2}')
USED=$(free -m | awk '/^Mem:/{print $3}')

if [ -z "$TOTAL" ] || [ "$TOTAL" -eq 0 ]; then
  echo "UNKNOWN - Unable to calculate total memory"
  exit 3
fi

PCT=$(( USED * 100 / TOTAL ))
PERF="used=${USED}MB;${WARN};${CRIT};0;${TOTAL}"

if [ "$PCT" -ge "$CRIT" ]; then
  echo "CRITICAL - Memory utilization at ${PCT}% (${USED}MB/${TOTAL}MB) | $PERF"
  exit 2
elif [ "$PCT" -ge "$WARN" ]; then
  echo "WARNING - Memory utilization at ${PCT}% (${USED}MB/${TOTAL}MB) | $PERF"
  exit 1
else
  echo "OK - Memory utilization at ${PCT}% (${USED}MB/${TOTAL}MB) | $PERF"
  exit 0
fi

