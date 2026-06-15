#!/usr/bin/env bash
#
# setup-host.sh — one-time host preparation for Elasticsearch on Linux.
#
# Elasticsearch requires vm.max_map_count >= 262144 or it refuses to start.
# This script sets it for the current boot AND persists it across reboots.
#
# Usage:  ./scripts/setup-host.sh
#
set -euo pipefail

# This kernel parameter applies to LINUX hosts only. On macOS and Windows,
# Docker Desktop runs containers inside its own tuned Linux VM and already sets
# vm.max_map_count high enough — so there is nothing to do here.
if [ "$(uname -s)" != "Linux" ]; then
  echo "Detected non-Linux host ($(uname -s))."
  echo "Docker Desktop manages vm.max_map_count inside its VM — no action needed."
  echo "→ Just run: docker compose up -d"
  exit 0
fi

REQUIRED=262144
KEY="vm.max_map_count"
SYSCTL_FILE="/etc/sysctl.conf"

current="$(sysctl -n "$KEY" 2>/dev/null || echo 0)"
echo "Current ${KEY} = ${current} (required >= ${REQUIRED})"

if [ "$current" -ge "$REQUIRED" ]; then
  echo "✓ ${KEY} already satisfies the requirement for this boot."
else
  echo "→ Setting ${KEY}=${REQUIRED} for the current boot (needs sudo)..."
  sudo sysctl -w "${KEY}=${REQUIRED}"
fi

# Persist across reboots (only append if not already present).
if grep -qE "^${KEY}\s*=" "$SYSCTL_FILE" 2>/dev/null; then
  echo "✓ ${KEY} already persisted in ${SYSCTL_FILE}."
else
  echo "→ Persisting ${KEY}=${REQUIRED} in ${SYSCTL_FILE} (needs sudo)..."
  echo "${KEY}=${REQUIRED}" | sudo tee -a "$SYSCTL_FILE" >/dev/null
fi

echo
echo "✓ Host is ready. Now run:  docker compose up -d"
