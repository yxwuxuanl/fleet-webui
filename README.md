# Fleet WebUI

A Go-based web console for Rancher Fleet. It lists Fleet status, can request a confirmed Bundle reconcile, and sends a fixed-topic ntfy notification after Fleet accepts that request.

## Run locally

```sh
go run .
```

Open `http://localhost:8080`. Configure a local kubeconfig or direct Fleet API endpoint before opening the console. If no Fleet connection is available, the UI keeps a visible connection error instead of sample resources. Manual reconcile is enabled by default; set `RECONCILE_ENABLED=false` for read-only mode.

## Connect Rancher Fleet

Use `.env.example` as a deployment template, then export those variables (or inject them through your Deployment) before starting the server. The application automatically detects a Pod ServiceAccount for in-cluster access; outside a Pod it uses a configured direct API endpoint, then local kubeconfig. If neither is available, the API returns a connection error.

### Local kubeconfig

Outside a Pod, the application loads `$KUBECONFIG` or `~/.kube/config` when present. Set `FLEET_KUBECONFIG` to a specific file and `FLEET_KUBECONTEXT` to select a context. The app uses the kubeconfig's server, CA, client certificates, bearer token, and exec authentication settings; it talks to Fleet through the Kubernetes CRD API.

```sh
export FLEET_KUBECONFIG="$HOME/.kube/config"
export FLEET_KUBECONTEXT=your-context # optional
go run .
```

### In-cluster

When running in a Pod, the app detects `KUBERNETES_SERVICE_HOST` and `KUBERNETES_SERVICE_PORT` and uses the mounted ServiceAccount token and CA at the standard Kubernetes paths. No connection-mode environment variable is required.

The included [RBAC manifest](deploy/rbac.yaml) grants the list/read permissions needed by the console plus Bundle `patch` for manual reconcile. The Helm chart removes Bundle `patch` permission when `reconcile.enabled=false`. Bind either deployment only to the namespaces/clusters the console should manage.

### Direct Rancher API

For a Rancher Steve endpoint, set `FLEET_API_BASE_URL` and `FLEET_API_TOKEN`. `FLEET_API_MODE=steve` uses Rancher's `/v1` API; use `kubernetes` only when the supplied endpoint points directly at a Kubernetes API server.

The Fleet identity needs:

- `get`, `list`, `watch` on `bundles.fleet.cattle.io` and `gitrepos.fleet.cattle.io`
- `patch` on `bundles.fleet.cattle.io` only when manual reconcile is enabled

List responses are fetched in chunks (`FLEET_PAGE_SIZE`, default `250`) and shared between browser sessions for a short interval (`FLEET_CACHE_TTL_SECONDS`, default `10`). This avoids a full upstream list request from every open dashboard while preserving complete results.

## Managed Kubernetes objects

The Bundle detail drawer lists objects reported by each matching `BundleDeployment.status.resources`. With `MANAGED_OBJECTS_YAML_ENABLED=true` (the local default), selecting an object reads its current YAML from the connected Kubernetes API. Requests are limited to objects Fleet already indexed for that BundleDeployment. Secret values and large applied-object annotations are redacted server-side.

Set `MANAGED_OBJECTS_DOWNSTREAM_KUBECONFIGS=true` to read remote-cluster objects through the kubeconfig Secret referenced by the Fleet Cluster. This requires `get` access to those Secrets. The Helm chart keeps both live YAML and downstream kubeconfig access disabled by default because arbitrary Bundle kinds require broad get-only Kubernetes RBAC; enable them only for a private HTTPS console.

## Reconcile and notifications

`POST /api/bundles/{namespace}/{name}/reconcile` does not require a reconcile token. The UI presents a second confirmation dialog before sending the request. Set `RECONCILE_ENABLED=false` to disable the endpoint and run the console in read-only mode.

After confirmation, the endpoint reads the current Bundle, increments `spec.forceSyncGeneration`, and patches it with its current `resourceVersion`. The operation retries conflicts up to three times. Because the endpoint has no authentication challenge of its own, keep Fleet WebUI behind your private access-control layer.

Once Fleet accepts the patch, the server posts a JSON message to the fixed `NTFY_TOPIC`. A failed ntfy delivery never rolls back a reconcile that has already been accepted. The API returns this as `notification: "failed"` so the UI can surface it.

Keep `NTFY_TOKEN` in a Kubernetes Secret or another secret manager. Do not put it in browser code.

When `APP_BASE_URL` is configured, ntfy messages link directly to the reconciled Bundle drawer in the dashboard.

## HTTP limits

The server applies read-header, read, write, and idle timeouts. Their defaults are documented in [.env.example](.env.example); adjust them when an upstream proxy or unusually slow Fleet API requires a larger request window.

## Browser system notifications

The UI offers an opt-in **Enable browser alerts** control below the Git repository list. Once a user allows it, the browser shows a local system notification when that user’s manual reconcile request is accepted or cannot be requested. The opt-in is kept only in that browser, and no ntfy credentials are sent to it.

Browser alerts require browser support, an explicit user permission, and HTTPS in deployed environments (localhost is suitable for development). They supplement rather than replace the server-side ntfy delivery; they do not persist after the browser has been closed.

## Container image

```sh
make image
docker run --rm -p 8080:8080 registry.cn-shenzhen.aliyuncs.com/lin2ur/fleet-webui:$(git rev-parse --short=7 HEAD)-amd64
```

`make image` builds a local `linux/amd64` image. `make image-push` builds and publishes the same image. The default image name is `registry.cn-shenzhen.aliyuncs.com/lin2ur/fleet-webui:<short-commit>-amd64`, so the unqualified commit tag and `latest` are not changed. Print the resolved name with `make image-name`.

Override any image setting when needed:

```sh
make image-push IMAGE_TAG=my-temporary-tag
make image-push IMAGE_REPOSITORY=example.com/team/fleet-webui IMAGE_PLATFORM=linux/amd64
```

For Kubernetes, publish the image, then update the image reference in `deploy/rbac.yaml` before applying it.
