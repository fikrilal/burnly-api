#!/usr/bin/env bash
# Manually roll back the Burnly API container on the VM to the previous image.
#
# Runs ON the VM (via sudo). Assumes deploy-remote.sh tagged the prior image
# as <name>:previous. If no previous tag exists, fails with guidance.
#
# Usage:
#   scripts/rollback.sh [--image <name>]
#   (or directly on the VM: sudo bash scripts/rollback.sh)
#
# Env:
#   VM_HOST, VM_USER, VM_SSH_KEY — required when run from a dev machine/CI
set -euo pipefail

IMAGE_NAME="${1:-burnly-api-api}"
CONTAINER_NAME="burnly-api"
ENV_FILE="/opt/burnly-api/app.env"
HEALTH_URL="http://127.0.0.1:${PORT:-4000}/health"
HEALTH_TIMEOUT_SECONDS="${HEALTH_TIMEOUT_SECONDS:-60}"
HEALTH_INTERVAL_SECONDS="${HEALTH_INTERVAL_SECONDS:-2}"

log() { printf '[rollback] %s\n' "$*"; }
die() { echo "[rollback] error: $*" >&2; exit 1; }

# If run locally, dispatch to the VM over SSH.
if [ -n "${VM_HOST:-}" ] && [ -n "${VM_SSH_KEY:-}" ]; then
  log "running rollback on ${VM_USER:-azureuser}@${VM_HOST}"
  exec ssh -o BatchMode=yes -o IdentitiesOnly=yes -o ConnectTimeout=15 -i "$VM_SSH_KEY" \
    "${VM_USER:-azureuser}@${VM_HOST}" \
    "sudo bash -s -- ${IMAGE_NAME}" < "$0"
fi

# --- on the VM ---------------------------------------------------------------

[ -f "$ENV_FILE" ] || die "env file not found: $ENV_FILE"
docker image inspect "${IMAGE_NAME}:previous" >/dev/null 2>&1 \
  || die "no previous image (${IMAGE_NAME}:previous) available for rollback"

log "rolling back ${CONTAINER_NAME} to ${IMAGE_NAME}:previous"
docker stop "$CONTAINER_NAME" >/dev/null 2>&1 || true
docker rm "$CONTAINER_NAME" >/dev/null 2>&1 || true
docker run -d \
  --name "$CONTAINER_NAME" \
  --restart unless-stopped \
  --network host \
  --env-file "$ENV_FILE" \
  "${IMAGE_NAME}:previous"

waited=0
while [ "$waited" -lt "$HEALTH_TIMEOUT_SECONDS" ]; do
  if curl -fsS "$HEALTH_URL" >/dev/null 2>&1; then
    log "rollback complete, health check passed"
    exit 0
  fi
  sleep "$HEALTH_INTERVAL_SECONDS"
  waited=$((waited + HEALTH_INTERVAL_SECONDS))
done

die "rollback container did not become healthy within ${HEALTH_TIMEOUT_SECONDS}s"
