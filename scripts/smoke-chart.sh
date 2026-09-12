#!/usr/bin/env bash
set -euo pipefail

image=${1:?Usage: bash scripts/smoke-chart.sh IMAGE CHART}
chart=${2:?Chart package required}
kind load docker-image "$image" --name fleet-release
helm upgrade --install fleet-webui "$chart" \
  --namespace fleet-webui-test --create-namespace \
  --set image.pullPolicy=Never \
  --set reconcile.enabled=false --set gitRepoActions.enabled=false \
  --wait --timeout 180s
kubectl -n fleet-webui-test rollout status deployment/fleet-webui --timeout=60s
kubectl -n fleet-webui-test port-forward service/fleet-webui 18080:80 > /tmp/fleet-chart-port-forward.log 2>&1 &
forward_pid=$!
trap 'kill "$forward_pid" 2>/dev/null || true' EXIT
curl --fail --silent --show-error --max-time 5 --retry 15 --retry-all-errors --retry-delay 1 \
  http://127.0.0.1:18080/api/health |
  python3 -c 'import json,sys; h=json.load(sys.stdin); assert not h["reconcileEnabled"] and not h["gitRepoActionsEnabled"]'
helm uninstall fleet-webui --namespace fleet-webui-test --wait
