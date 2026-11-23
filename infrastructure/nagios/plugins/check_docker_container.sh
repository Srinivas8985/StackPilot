#!/usr/bin/env bash
# ==============================================================================
# check_docker_container.sh - Verify running Docker container on dedicated host
# ==============================================================================
# Usage: ./check_docker_container.sh <container_name_or_prefix>
# Exit codes: 0 = OK, 1 = WARNING, 2 = CRITICAL, 3 = UNKNOWN

TARGET_NAME=${1:-""}

if [ -z "$TARGET_NAME" ]; then
  echo "UNKNOWN - Container name argument required"
  exit 3
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "CRITICAL - Docker CLI not installed or not in PATH"
  exit 2
fi

RUNNING=$(docker ps --filter "name=${TARGET_NAME}" --filter "status=running" --format "{{.Names}}" | head -n 1)

if [ -n "$RUNNING" ]; then
  STATUS=$(docker inspect --format "{{.State.Status}}" "$RUNNING" 2>/dev/null || echo "running")
  echo "OK - Container '$RUNNING' is $STATUS"
  exit 0
fi

# Check if it exists but is stopped
STOPPED=$(docker ps -a --filter "name=${TARGET_NAME}" --format "{{.Names}} ({{.Status}})" | head -n 1)
if [ -n "$STOPPED" ]; then
  echo "CRITICAL - Container '$STOPPED' is not running"
  exit 2
fi

echo "WARNING - No container matching '${TARGET_NAME}' found"
exit 1

