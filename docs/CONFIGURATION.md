# Configuration

Export environment variables before starting the server, or inject them through your Kubernetes Deployment. The app does not load `.env` files automatically. See [.env.example](../.env.example) for all settings, including timeouts, access logging and list caching.

## Fleet connection

Connection priority is an explicit `FLEET_API_BASE_URL`, then a Pod ServiceAccount, then local kubeconfig.

- **Local kubeconfig:** uses `$KUBECONFIG` or `~/.kube/config`. Set `FLEET_KUBECONFIG` for a specific file and `FLEET_KUBECONTEXT` for a context.
- **In-cluster:** uses the Pod's mounted ServiceAccount token and CA automatically.
- **Direct API:** set `FLEET_API_BASE_URL`, `FLEET_API_TOKEN` and `FLEET_API_MODE`.

For a Rancher Steve connection:

```sh
export FLEET_API_BASE_URL=https://rancher.example.com
export FLEET_API_MODE=steve
export FLEET_API_TOKEN=REPLACE_ME
```

For a Kubernetes API connection, use its server URL and `FLEET_API_MODE=kubernetes`. The app appends API resource paths; do not include `/v1/fleet.cattle.io.*` or `/apis/fleet.cattle.io/v1alpha1/*` in the base URL.

Managed-object YAML, diagnostics, logs and Git credential Secrets require Kubernetes API mode, which is selected automatically for kubeconfig and in-cluster connections. Steve mode does not support these features.

## Permissions

The Fleet identity needs `get`, `list`, `watch` on `bundles`, `gitrepos`, `clusters` and `bundledeployments` in the `fleet.cattle.io` API group. Lists currently query across all namespaces; namespace-only RoleBindings are insufficient.

Bundle reconcile requires Bundle `patch` permission; GitRepo actions require GitRepo `patch` permission. Private Git history and downstream kubeconfigs also need access to their credential Secrets. See the [Helm chart](../charts/fleet-webui/README.md) for diagnostics permissions and deployment options.

## Feature switches

These defaults apply when running the binary locally or in a container. The Helm chart has separate defaults in [values.yaml](../charts/fleet-webui/values.yaml).

| Variable | Default | Enables |
| --- | --- | --- |
| `RECONCILE_ENABLED` | `true` | Manual Bundle reconcile. |
| `GIT_REPO_ACTIONS_ENABLED` | `true` | GitRepo sync, revision pinning and branch resumption. |
| `GIT_HISTORY_ENABLED` | `true` | Recent Git commits. |
| `MANAGED_OBJECTS_YAML_ENABLED` | `true` | Desired/Live YAML, diffs, events, Pods and container logs. |
| `MANAGED_OBJECTS_DOWNSTREAM_KUBECONFIGS` | `false` | Access to remote clusters through Fleet kubeconfig Secrets. |

For read-only mode, disable **both** write switches and remove their patch permissions. With Helm, set `reconcile.enabled=false` and `gitRepoActions.enabled=false`; the chart removes both patch permissions.

## Managed objects

Diagnostics are limited to objects indexed by the selected BundleDeployment. Secret values are redacted from YAML and diffs. To inspect remote clusters, enable `MANAGED_OBJECTS_DOWNSTREAM_KUBECONFIGS` and grant access to the kubeconfig Secret referenced by the Fleet Cluster.

The Helm chart disables diagnostics and downstream kubeconfig access by default. Enabling diagnostics grants broad Kubernetes read access; review the [chart configuration](../charts/fleet-webui/README.md#managed-object-diagnostics) and [security boundary](../SECURITY.md#deployment-boundary) before enabling it.

## Git history and revisions

Private repositories reuse the Secret referenced by `GitRepo.spec.clientSecretName`. SSH Secrets need `ssh-privatekey` and `known_hosts`; HTTPS Secrets use `username` with `password` or `token`. Credentials stay on the server.

Pinning a commit sets `GitRepo.spec.revision` and pauses branch updates. **Resume branch** clears it. These operations change what Fleet deploys without rewriting Git history.

## Browser notifications

Browser notifications can be enabled through **Enable alerts** in Settings. They require browser permission and HTTPS, except on localhost, and work while the console is open.
