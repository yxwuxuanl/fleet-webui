# Changelog

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
