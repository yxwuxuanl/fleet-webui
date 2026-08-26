# Fleet WebUI

A Go-based web console for Rancher Fleet. It lists Bundle and GitRepo status, can request a Bundle reconcile, and sends a fixed-topic ntfy notification after Fleet accepts that request.

## Run locally

```sh
go run .
```

Open `http://localhost:8080`. Configure a local kubeconfig or direct Fleet API endpoint before opening the console. If no Fleet connection is available, the UI shows a clear connection error instead of sample resources.

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

The included [RBAC manifest](deploy/rbac.yaml) grants the minimum Fleet permissions required by the UI. Bind it only to the namespaces/clusters the console should manage.

### Direct Rancher API

For a Rancher Steve endpoint, set `FLEET_API_BASE_URL` and `FLEET_API_TOKEN`. `FLEET_API_MODE=steve` uses Rancher's `/v1` API; use `kubernetes` only when the supplied endpoint points directly at a Kubernetes API server.

The Fleet identity needs:

- `get`, `list`, `watch` on `bundles.fleet.cattle.io` and `gitrepos.fleet.cattle.io`
- `get`, `patch` on `bundles.fleet.cattle.io`

## Reconcile and notifications

`POST /api/bundles/{namespace}/{name}/reconcile` reads the current Bundle, increments `spec.forceSyncGeneration`, and patches it with its current `resourceVersion`. The operation retries conflicts up to three times.

Once Fleet accepts the patch, the server posts a JSON message to the fixed `NTFY_TOPIC`. A failed ntfy delivery never rolls back a reconcile that has already been accepted. The API returns this as `notification: "failed"` so the UI can surface it.

Keep `NTFY_TOKEN` in a Kubernetes Secret or another secret manager. Do not put it in browser code.

### Browser system notifications

The UI offers an opt-in **Enable browser alerts** control below the Git repository list. Once a user allows it, the browser shows a local system notification when that user’s manual reconcile request is accepted or cannot be requested. The opt-in is kept only in that browser, and no ntfy credentials are sent to it.

Browser alerts require browser support, an explicit user permission, and HTTPS in deployed environments (localhost is suitable for development). They supplement rather than replace the server-side ntfy delivery; they do not persist after the browser has been closed.

## Container image

```sh
docker build -t fleet-webui:local .
docker run --rm -p 8080:8080 fleet-webui:local
```

For Kubernetes, build and publish the image, then update the image reference in `deploy/rbac.yaml` before applying it.
