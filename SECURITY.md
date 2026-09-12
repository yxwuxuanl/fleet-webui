# Security

## Reporting vulnerabilities

Use the repository's **Security → Advisories → Report a vulnerability** entry when private vulnerability reporting is enabled. If that entry is unavailable, open an issue asking the maintainer to enable private reporting, without disclosing the vulnerability or attaching sensitive material.

Include affected versions, configuration, minimal reproduction steps, impact and a suggested fix if available. Never include working credentials, kubeconfig files, private source repositories, customer logs or Secret values in public issues.

## Deployment boundary

Fleet WebUI uses a server-side Kubernetes/Rancher identity shared by its visitors. It does not provide per-user authentication or authorization. Deploy behind authenticated private access, preserve Host/Origin/Sec-Fetch-Site headers, and restrict the identity's RBAC.

- Read-only deployments must disable **both** `RECONCILE_ENABLED` and `GIT_REPO_ACTIONS_ENABLED` and remove both Bundle and GitRepo patch permissions.
- Managed-object diagnostics, container logs, downstream credentials and private Git history increase the data available to console users. Enable them only for authorized operators.
- Cross-origin protection supplements access control. It is not an authentication mechanism.
- Logs and arbitrary non-Secret resources can contain application data. YAML redaction of Kubernetes Secrets is not a general-purpose data-loss prevention filter.

## Version support

Security fixes target the current development branch and the latest stable release. No response-time SLA is offered.
