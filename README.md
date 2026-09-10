# Fleet WebUI

A Go-based web console for Rancher Fleet. It lists Fleet status, can request a confirmed Bundle reconcile, and sends a fixed-topic ntfy notification after Fleet accepts that request.

## Run locally

Requires Go 1.27+, Node.js 22.12+ and npm. From a fresh clone:

```sh
make run
```

`make run` installs the locked frontend dependencies, builds the React app into `frontend/dist/`, and starts Go with those assets embedded. `make build` creates a standalone binary; `make test` builds the frontend and runs Go tests with race detection plus `go vet`. Build the frontend before invoking `go run .`, `go build`, or `go test` directly. There is no legacy frontend fallback.

Open `http://localhost:8080`. Configure a local kubeconfig or direct Fleet API endpoint before opening the console. If no Fleet connection is available, the UI keeps a visible connection error instead of sample resources. Bundle reconcile and GitRepo actions have independent switches. For read-only mode, disable both:

```sh
RECONCILE_ENABLED=false GIT_REPO_ACTIONS_ENABLED=false make run
```

For frontend development, run `npm --prefix frontend run dev` in another terminal after starting the Go server. Vite proxies `/api` requests to it.

## Connect Rancher Fleet

Use `.env.example` as a deployment template, then export those variables (or inject them through your Deployment) before starting the server. The application automatically detects a Pod ServiceAccount for in-cluster access; outside a Pod it uses a configured direct API endpoint, then local kubeconfig. If neither is available, the API returns a connection error.

### Local kubeconfig

Outside a Pod, the application loads `$KUBECONFIG` or `~/.kube/config` when present. Set `FLEET_KUBECONFIG` to a specific file and `FLEET_KUBECONTEXT` to select a context. The app uses the kubeconfig's server, CA, client certificates, bearer token, and exec authentication settings; it talks to Fleet through the Kubernetes CRD API.

```sh
export FLEET_KUBECONFIG="$HOME/.kube/config"
export FLEET_KUBECONTEXT=your-context # optional
make run
```

### In-cluster

When running in a Pod, the app detects `KUBERNETES_SERVICE_HOST` and `KUBERNETES_SERVICE_PORT` and uses the mounted ServiceAccount token and CA at the standard Kubernetes paths. No connection-mode environment variable is required.

The included [RBAC manifest](deploy/rbac.yaml) is read-only: both write switches are off and no `patch` permission is granted. The Helm chart removes Bundle `patch` permission when `reconcile.enabled=false` and GitRepo `patch` permission when `gitRepoActions.enabled=false`. Set both to `false` for a read-only Helm installation. Bind either deployment only to the namespaces/clusters the console should manage.

### Direct Rancher API

For a Rancher Steve endpoint, set `FLEET_API_BASE_URL` and `FLEET_API_TOKEN`. `FLEET_API_MODE=steve` uses Rancher's `/v1` API; use `kubernetes` only when the supplied endpoint points directly at a Kubernetes API server.

The Fleet identity needs:

- `get`, `list`, `watch` on `bundles.fleet.cattle.io` and `gitrepos.fleet.cattle.io`
- `patch` on `bundles.fleet.cattle.io` only when manual reconcile is enabled
- `patch` on `gitrepos.fleet.cattle.io` when GitRepo actions are enabled
- `get` on Git credential Secrets when private Git history is enabled

List responses are fetched in chunks (`FLEET_PAGE_SIZE`, default `250`) and shared between browser sessions for a short interval (`FLEET_CACHE_TTL_SECONDS`, default `10`). This avoids a full upstream list request from every open dashboard while preserving complete results.

## Managed Kubernetes objects

The Bundle detail drawer lists objects reported by each matching `BundleDeployment.status.resources`. With `MANAGED_OBJECTS_YAML_ENABLED=true` (the local default), selecting an object shows Desired YAML from Fleet's Helm release, current Live YAML, a normalized Diff, Kubernetes Events, matching workload Pods, and opt-in container logs. Requests are limited to objects Fleet already indexed for that BundleDeployment. Secret values and large applied-object annotations are redacted server-side before either YAML or Diff is returned.

Set `MANAGED_OBJECTS_DOWNSTREAM_KUBECONFIGS=true` to read remote-cluster objects through the kubeconfig Secret referenced by the Fleet Cluster. This requires `get` access to those Secrets. The Helm chart keeps both live YAML and downstream kubeconfig access disabled by default because arbitrary Bundle kinds require broad get-only Kubernetes RBAC; enable them only for a private HTTPS console.

Clusters with a kubeconfig Secret are never queried through the management-cluster connection: disabled downstream access or invalid credentials return an error. Disabling `MANAGED_OBJECTS_YAML_ENABLED` also disables diagnostics and container-log access, even if the Kubernetes identity still has permission.

## Git history and operational rollback

Set `GIT_HISTORY_ENABLED=true` to load recent commits directly from each GitRepo. Private SSH repositories reuse `spec.clientSecretName`; the Secret must contain `ssh-privatekey` and `known_hosts`. HTTPS repositories may use `username` plus `password` or `token`. Credentials remain server-side.

`GIT_REPO_ACTIONS_ENABLED=true` enables **Sync now**, **Pin revision**, and **Resume branch**. Pinning writes a selected full commit hash to `GitRepo.spec.revision`, so Fleet redeploys that version and pauses normal branch updates. Resuming clears `spec.revision`. This is an operational rollback and does not rewrite or revert the Git repository.

## Reconcile and notifications

`POST /api/bundles/{namespace}/{name}/reconcile` does not require a reconcile token. The UI presents a second confirmation dialog before sending the request. Set `RECONCILE_ENABLED=false` to disable this endpoint; also set `GIT_REPO_ACTIONS_ENABLED=false` for read-only mode.

All write endpoints reject cross-origin browser requests with HTTP 403. Reverse proxies must preserve the original Host, Origin and Sec-Fetch-Site headers. Cross-origin protection does not replace authentication; keep the console behind your private access-control layer.

After confirmation, the endpoint reads the current Bundle, increments `spec.forceSyncGeneration`, and patches it with its current `resourceVersion`. The operation retries conflicts up to three times. Because the endpoint has no authentication challenge of its own, keep Fleet WebUI behind your private access-control layer.

Once Fleet accepts the patch, the server posts a JSON message to the fixed `NTFY_TOPIC`. A failed ntfy delivery never rolls back a reconcile that has already been accepted. The API returns this as `notification: "failed"` so the UI can surface it.

Keep `NTFY_TOKEN` in a Kubernetes Secret or another secret manager. Do not put it in browser code.

When `APP_BASE_URL` is configured, ntfy messages link directly to the reconciled Bundle drawer in the dashboard.

## HTTP limits

The server applies read-header, read, write, and idle timeouts. Their defaults are documented in [.env.example](.env.example); adjust them when an upstream proxy or unusually slow Fleet API requires a larger request window.

HTTP access logging is enabled by default. Each request emits a structured `http access` entry with its method, URL path, response status and size, duration, direct remote address, and user agent. Query strings are deliberately omitted. Set `ACCESS_LOG_ENABLED=false` to disable these entries.

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
