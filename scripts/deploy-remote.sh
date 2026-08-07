#!/usr/bin/env bash
# Swap the Burnly API container on the VM to a target image, with automatic
# rollback if the new container does not become healthy.
#
# Runs ON the VM (via sudo). Reads target image name + tag from argv.
#   sudo bash -s -- <image-name> <tag>
#
# Behavior:
#   - Retags the currently-running image as <name>:previous (rollback point).
#   - Stops/removes the running container, starts a new one from the target
#     image with the same runtime config (network host, restart, env-file).
#   - Waits up to HEALTH_TIMEOUT_SECONDS for /health to return 200.
#   - On failure, rolls back to the previous image and re-runs the same config.
#   - Prunes images except current + previous (keeps disk bounded).

set -euo pipefail

IMAGE_NAME="${1:-burnly-api-api}"
IMAGE_TAG="${2:?usage: deploy-remote.sh <image-name> <tag>}"
CONTAINER_NAME="burnly-api"
ENV_FILE="/opt/burnly-api/app.env"
HEALTH_URL="http://127.0.0.1:${PORT:-4000}/health"
HEALTH_TIMEOUT_SECONDS="${HEALTH_TIMEOUT_SECONDS:-60}"
HEALTH_INTERVAL_SECONDS="${HEALTH_INTERVAL_SECONDS:-2}"

TARGET_IMAGE="${IMAGE_NAME}:${IMAGE_TAG}"
PREVIOUS_TAG="previous"

log() { printf '[deploy-remote] %s\n' "$*"; }

die() { echo "[deploy-remote] error: $*" >&2; exit 1; }

require_env_file() {
  [ -f "$ENV_FILE" ] || die "env file not found: $ENV_FILE"
}

# Verify the target image exists locally before touching the running container.
ensure_image() {
  docker image inspect "$TARGET_IMAGE" >/dev/null 2>&1 \
    || die "image not loaded on VM: $TARGET_IMAGE"
}

current_image_id() {
  docker inspect "$CONTAINER_NAME" --format '{{.Image}}' 2>/dev/null || true
}

# Retag the currently running image as <name>:previous so we have a rollback.
mark_previous() {
  local cur_id
  cur_id="$(current_image_id)"
  if [ -n "$cur_id" ]; then
    local cur_ref
    cur_ref="$(docker inspect "$CONTAINER_NAME" --format '{{index .Config.Image}}' 2>/dev/null || echo '')"
    if [ -n "$cur_ref" ] && [ "$cur_ref" != "$TARGET_IMAGE" ]; then
      if docker tag "$cur_ref" "${IMAGE_NAME}:${PREVIOUS_TAG}"; then
        log "marked previous image: ${IMAGE_NAME}:${PREVIOUS_TAG} (was ${cur_ref})"
      else
        log "warning: could not tag previous image (${cur_ref})"
      fi
    else
      log "no previous image to mark (current is already ${TARGET_IMAGE})"
    fi
  else
    log "no running container; skipping previous mark"
  fi
}

run_container() {
  local image="$1"
  log "starting container ${CONTAINER_NAME} from ${image}"
  docker stop "$CONTAINER_NAME" >/dev/null 2>&1 || true
  docker rm "$CONTAINER_NAME" >/dev/null 2>&1 || true
  docker run -d \
    --name "$CONTAINER_NAME" \
    --restart unless-stopped \
    --network host \
    --env-file "$ENV_FILE" \
    "$image"
}

wait_healthy() {
  local waited=0
  while [ "$waited" -lt "$HEALTH_TIMEOUT_SECONDS" ]; do
    if curl -fsS "$HEALTH_URL" >/dev/null 2>&1; then
      log "health check passed (${HEALTH_URL})"
      return 0
    fi
    sleep "$HEALTH_INTERVAL_SECONDS"
    waited=$((waited + HEALTH_INTERVAL_SECONDS))
  done
  log "health check timed out after ${HEALTH_TIMEOUT_SECONDS}s"
  return 1
}

prune_old() {
  # Keep only current + previous images for this app name.
  local keep="$TARGET_IMAGE ${IMAGE_NAME}:${PREVIOUS_TAG}"
  local ids
  ids="$(docker images --format '{{.Repository}}:{{.Tag}} {{.ID}}' | grep "^${IMAGE_NAME}:" | awk '{print $2}' | sort -u)"
  for id in $ids; do
    local refs
    refs="$(docker images --format '{{.Repository}}:{{.Tag}} {{.ID}}' | awk -v id="$id" '$2==id {print $1}')"
    local keep_this=0
    for r in $refs; do
      case " $keep " in
        *" $r "*) keep_this=1 ;;
      esac
    done
    if [ "$keep_this" = "0" ]; then
      if docker rmi "$id" >/dev/null 2>&1; then
        log "pruned image ${id}"
      else
        log "warning: could not prune ${id}"
      fi
    fi
  done
}

# --- main --------------------------------------------------------------------

require_env_file
ensure_image

log "target: ${TARGET_IMAGE}"
mark_previous

run_container "$TARGET_IMAGE"

if wait_healthy; then
  log "deploy succeeded: ${TARGET_IMAGE}"
  prune_old
  exit 0
fi

# Rollback
log "rolling back to ${IMAGE_NAME}:${PREVIOUS_TAG}"
if docker image inspect "${IMAGE_NAME}:${PREVIOUS_TAG}" >/dev/null 2>&1; then
  run_container "${IMAGE_NAME}:${PREVIOUS_TAG}"
  if wait_healthy; then
    log "rollback succeeded: running ${IMAGE_NAME}:${PREVIOUS_TAG}"
    exit 1  # deploy failed, but rollback worked
  else
    log "rollback also failed — container left in last state; manual intervention needed"
    exit 1
  fi
else
  log "no previous image available for rollback"
  exit 1
fi
