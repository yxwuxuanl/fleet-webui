# fleet-webui Helm chart

Deploys Fleet WebUI using the automatically detected Pod ServiceAccount to access the Fleet CRDs. The default image is `ghcr.io/yxwuxuanl/fleet-webui:0.1.0-rc.1`.

## Install

```sh
helm upgrade --install fleet-webui ./charts/fleet-webui \
  --namespace cattle-fleet-system \
  --create-namespace
```

The chart creates a ClusterRole and ClusterRoleBinding so the WebUI can list Fleet resources across namespaces. Manual reconcile is enabled by default and adds Bundle `patch` permission.

Choose an available version from [GitHub Releases](https://github.com/yxwuxuanl/fleet-webui/releases). Versioned charts are published at `oci://ghcr.io/yxwuxuanl/charts/fleet-webui`; see [release instructions](../../docs/RELEASING.md) for installation. For a custom image, override `image.repository` and `image.tag`. If its registry is private, configure `imagePullSecrets` with your registry credentials.

## Manual reconcile

Opening reconcile displays a confirmation dialog. Confirming it increments the Bundle's `spec.forceSyncGeneration`; no browser or server-side reconcile token is required.

```sh
helm upgrade --install fleet-webui ./charts/fleet-webui \
  --namespace cattle-fleet-system \
  --set reconcile.enabled=false \
  --set gitRepoActions.enabled=false
```

The example above disables both Bundle and GitRepo writes and removes both `patch` permissions for a read-only installation. Setting only `reconcile.enabled=false` leaves GitRepo actions enabled. Expose the console only through your private access-control layer; preserve Host, Origin and Sec-Fetch-Site headers so the server can validate browser requests.

## ntfy notifications

Create a Secret with the ntfy token first:

```sh
kubectl -n cattle-fleet-system create secret generic fleet-webui-ntfy \
  --from-literal=token='REPLACE_ME'
```

Then enable it during install or upgrade:

```sh
helm upgrade --install fleet-webui ./charts/fleet-webui \
  --namespace cattle-fleet-system \
  --set ntfy.enabled=true \
  --set ntfy.baseURL=https://ntfy.example.com \
  --set ntfy.topic=fleet-reconcile-your-topic \
  --set ntfy.existingSecret=fleet-webui-ntfy
```

## Managed object diagnostics

The Bundle drawer always lists the Kubernetes objects reported in `BundleDeployment.status.resources`. Diagnostics are opt-in because Kubernetes RBAC must grant access to arbitrary resource kinds. The API shows Desired/Live YAML, a normalized Diff, Events, workload Pods, and container logs only for objects present in the selected BundleDeployment. Secret `data`, `stringData`, and `binaryData` are redacted before returning YAML or Diff.

For objects deployed to the same Kubernetes API as Fleet WebUI:

```sh
helm upgrade --install fleet-webui ./charts/fleet-webui \
  --namespace cattle-fleet-system \
  --set managedObjects.enabled=true
```

For remote Fleet clusters, also allow the server to read the kubeconfig Secret referenced by each Fleet Cluster:

```sh
helm upgrade --install fleet-webui ./charts/fleet-webui \
  --namespace cattle-fleet-system \
  --set managedObjects.enabled=true \
  --set managedObjects.downstreamKubeconfigs=true
```

Enabling managed object YAML grants the WebUI ServiceAccount get-only access to arbitrary Kubernetes resource kinds, including Secrets. Enable it only for a private, HTTPS-protected console with tightly controlled access.

## Private Git history and revision control

Enable recent commit history and allow the server to read the Secret referenced by `GitRepo.spec.clientSecretName`:

```sh
helm upgrade --install fleet-webui ./charts/fleet-webui \
  --namespace cattle-fleet-system \
  --set gitHistory.enabled=true
```

SSH Secrets must include `ssh-privatekey` and `known_hosts`; HTTPS Secrets may use `username` with `password` or `token`. `gitRepoActions.enabled=true` enables immediate sync plus revision pin/resume and adds GitRepo patch permission. Pinning uses Fleet's `spec.revision`; it pauses branch updates until resumed and does not rewrite Git history.

## Common values

| Value | Default | Description |
| --- | --- | --- |
| `image.repository` | `ghcr.io/yxwuxuanl/fleet-webui` | Container image repository. |
| `image.tag` | `""` | Uses Chart `appVersion` when empty; can override the container image tag. |
| `rbac.create` | `true` | Create the ClusterRole and ClusterRoleBinding. |
| `fleet.pageSize` | `250` | Maximum Fleet resources requested per upstream page. |
| `fleet.cacheTTLSeconds` | `10` | Shared in-process list cache lifetime. |
| `managedObjects.enabled` | `false` | Enable live YAML for Bundle-managed objects and add get-only dynamic-resource RBAC. |
| `managedObjects.downstreamKubeconfigs` | `false` | Read Fleet Cluster kubeconfig Secrets to retrieve YAML from remote clusters. |
| `gitHistory.enabled` | `false` | Read recent commits using each GitRepo credential Secret. |
| `gitRepoActions.enabled` | `true` | Enable sync-now and revision pin/resume with GitRepo patch RBAC. |
| `server.accessLogEnabled` | `true` | Log method, path, status, response size, duration, direct remote address, and user agent for each HTTP request. |
| `reconcile.enabled` | `true` | Enable confirmation-based manual reconcile and Bundle patch RBAC. |
| `ntfy.enabled` | `false` | Configure the fixed ntfy channel. |
| `ntfy.existingSecret` | empty | Secret containing `ntfy.tokenKey`. |
| `ingress.enabled` | `false` | Create an Ingress resource. |
