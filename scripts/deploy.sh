#!/usr/bin/env bash
# Deploy the Burnly API to the production VM.
#
# Builds the API image, transfers it to the VM over SSH (docker save | ssh |
# docker load), then swaps the running container via scripts/deploy-remote.sh.
# The remote script health-checks the new container and rolls back to the
# previous image automatically if it does not become healthy.
#
# Usage:
#   scripts/deploy.sh [--tag <commit-sha>] [--image <name>] [--yes]
#
# Env:
#   VM_HOST, VM_USER, VM_SSH_KEY — required (VM_SSH_KEY is a file path)
#   CI=true — non-interactive mode (no prompts)
set -euo pipefail

# --- config ----------------------------------------------------------------

SHA=""
IMAGE_NAME="burnly-api-api"
ASSUME_YES=0

while [ $# -gt 0 ]; do
  case "$1" in
    --tag) SHA="${2:-}"; shift 2 ;;
    --image) IMAGE_NAME="${2:-}"; shift 2 ;;
    --yes) ASSUME_YES=1; shift ;;
    *) echo "unknown option: $1" >&2; exit 2 ;;
  esac
done

if [ -z "$SHA" ]; then
  SHA="$(git rev-parse --short HEAD)"
fi

FULL_IMAGE="${IMAGE_NAME}:${SHA}"

VM_HOST="${VM_HOST:-}"
VM_USER="${VM_USER:-azureuser}"
VM_SSH_KEY="${VM_SSH_KEY:-}"

if [ -z "$VM_HOST" ] || [ -z "$VM_SSH_KEY" ] || [ ! -f "$VM_SSH_KEY" ]; then
  echo "error: VM_HOST and VM_SSH_KEY (path to an existing key file) are required" >&2
  exit 2
fi

SSH_ARGS=(-o BatchMode=yes -o StrictHostKeyChecking=accept-new -o IdentitiesOnly=yes -o ConnectTimeout=15 -i "$VM_SSH_KEY")
REMOTE_SCRIPT="scripts/deploy-remote.sh"

# --- helpers ----------------------------------------------------------------

log() { printf '[deploy] %s\n' "$*"; }

confirm() {
  if [ "$ASSUME_YES" = "1" ] || [ "${CI:-false}" = "true" ]; then return 0; fi
  read -r -p "[deploy] swap production container to ${FULL_IMAGE}? [y/N] " ans
  case "$ans" in
    y|Y) return 0 ;;
    *) echo "aborted"; exit 1 ;;
  esac
}

# --- 1. build ----------------------------------------------------------------

log "building image ${FULL_IMAGE}"
if ! docker build --target api -t "$FULL_IMAGE" .; then
  echo "error: image build failed" >&2
  exit 1
fi

# --- 2. transfer -------------------------------------------------------------

log "transferring ${FULL_IMAGE} to ${VM_USER}@${VM_HOST}"
if ! docker save "$FULL_IMAGE" | gzip -1 | ssh "${SSH_ARGS[@]}" "${VM_USER}@${VM_HOST}" 'gzip -d | sudo docker load'; then
  echo "error: image transfer/load failed" >&2
  exit 1
fi

# --- 3. swap on the VM ---------------------------------------------------------

log "swapping container on VM (image ${IMAGE_NAME}:${SHA})"
confirm
if ! ssh "${SSH_ARGS[@]}" "${VM_USER}@${VM_HOST}" \
  "sudo bash -s -- ${IMAGE_NAME} ${SHA}" < "$REMOTE_SCRIPT"; then
  echo "error: remote deploy failed (container rolled back if possible)" >&2
  exit 1
fi

log "deploy complete: ${FULL_IMAGE}"
