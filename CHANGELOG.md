# Changelog

## 0.2.0

- Add a Bundle × Cluster deployment matrix with workspace, ClusterGroup, cluster-label and attention filters, plus separate row/column pagination.
- Show assigned, staged and applied Fleet deployment IDs without treating repository commits as proof of deployment on every cluster.
- Connect GitRepo, Bundle, BundleDeployment, cluster, managed-object and Pod diagnostics through shareable resource links and an expandable deployment path.
- Track manual Bundle reconciles and GitRepo Sync now requests across page navigation and same-tab reloads, checking source observation, sync generations, applied deployment IDs and workload readiness.
- Report successful, failed, partial, timed-out and superseded observations, with optional browser notifications for final outcomes rather than request acceptance.
- Add Settings setup guides for server capabilities and browser alerts.
- Fix nested resource rows shifting while scrolling into view and cancel stale Bundle detail reads.

Upgrade note: apply the updated Helm chart or RBAC manifest to grant read access to Fleet `clustergroups`. Other matrix filters remain available without that permission. Sync tracking runs while the console is open, observes each request for up to 15 minutes, and does not provide server-side history or background alerts. See [Operations](docs/OPERATIONS.md).

## 0.1.2

- Show Fleet controller and Fleet WebUI versions in the sidebar, with an unavailable state when controller discovery fails.

- Support Fleet v0.16.2's `WaitingForDependency` state in health indicators, progress filters and Bundle deployment summaries. Older Fleet responses default the new count to zero.

Upgrade note: apply the updated Helm chart or RBAC manifest to grant `get` on the `fleet-controller` Deployment. Without that permission, Fleet version displays `Unavailable`; the console remains usable. For a custom Fleet namespace, set `FLEET_SYSTEM_NAMESPACE` or Helm `fleet.systemNamespace`.

## 0.1.1

- Remove ntfy delivery, its environment variables, Helm configuration and setup instructions.
- Remove `notificationConfigured` from health responses and `notification` from reconcile responses. Reconcile responses now contain `bundle` and `generation`.
- Remove ntfy delivery status from Settings and reconcile success messages.

## 0.1.0

First stable release, retaining the Fleet console features introduced in 0.1.0-rc.1.

- Organize the Go module, source and tests under `server/`, with the embedded React build in `server/dist/`.
- Isolate Docker credentials when verifying anonymous Helm chart downloads.
- Align the container image, Helm chart, frontend package and deployment examples on version 0.1.0.
- Clarify development, installation and release documentation.

Automated checks cover container startup, Helm installation on a temporary Kubernetes cluster and read-only settings. A production Rancher/Fleet compatibility matrix has not been verified.

## 0.1.0-rc.1

- React console for Fleet Bundles, GitRepos, Clusters and BundleDeployments.
- Desired/Live YAML, normalized diffs, Kubernetes events and workload container logs.
- Confirmed Bundle reconcile, GitRepo sync, revision pinning and branch resume.
- Private Git history using server-side credential Secrets.
- Optional ntfy delivery, browser notifications and structured HTTP access logs.
- Cross-origin write protection, diagnostic feature gates and downstream connection checks.
- Correct Pod selector expressions, resource-switch isolation and notification deep links.
- A single embedded React frontend, container build and Helm deployment.
- Read-only deployment examples and automated checks.
- Automatic development image builds, version-tag image and OCI Helm chart releases, package checksums, and temporary Kubernetes installation checks.

First preview release. Automated checks cover container startup and Helm installation on a temporary Kubernetes cluster. A production Rancher/Fleet compatibility matrix has not been verified.
