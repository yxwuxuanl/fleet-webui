#!/usr/bin/env bash
set -euo pipefail

image=${1:?Usage: bash scripts/smoke-container.sh IMAGE}
container=$(docker run -d --read-only --cap-drop ALL --security-opt no-new-privileges \
  -p 127.0.0.1::8080 \
  -e RECONCILE_ENABLED=false -e GIT_REPO_ACTIONS_ENABLED=false \
  -e MANAGED_OBJECTS_YAML_ENABLED=false -e GIT_HISTORY_ENABLED=false "$image")
cleanup() {
  docker logs "$container" || true
  docker rm -f "$container" >/dev/null || true
}
trap cleanup EXIT
port=$(docker inspect --format '{{(index (index .NetworkSettings.Ports "8080/tcp") 0).HostPort}}' "$container")
base="http://127.0.0.1:$port"
curl --fail --silent --show-error --max-time 5 --retry 20 --retry-all-errors --retry-max-time 30 --retry-delay 1 "$base/api/health" > /dev/null
curl --fail --silent --show-error "$base/" | python3 -c 'import sys; assert "id=\"root\"" in sys.stdin.read(), "React entry not served"'
curl --fail --silent --show-error "$base/api/health" | python3 -c 'import json,sys; h=json.load(sys.stdin); assert not h["reconcileEnabled"] and not h["gitRepoActionsEnabled"]'
for endpoint in bundles/ns/demo/reconcile gitrepos/ns/demo/sync; do
  status=$(curl --silent --output /dev/null --write-out '%{http_code}' -X POST "$base/api/$endpoint")
  test "$status" = 503
done
test "$(docker inspect --format '{{.Config.User}}' "$container")" = nonroot:nonroot
