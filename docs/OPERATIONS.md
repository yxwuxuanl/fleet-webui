# Deployment operations

## Deployment matrix

Open **Deployment matrix** to compare Bundles across clusters. Filter Bundle rows by name, repository, workspace or **Needs attention**. Filter cluster columns by name, ClusterGroup or an exact label. Rows and columns are paginated separately; the table scrolls horizontally on narrow screens.

Every cell comes from a BundleDeployment associated with both the Bundle name and workspace. Cluster columns use their downstream namespaces, so identically named clusters in different workspaces remain distinct. Click a cell to open the deployment, a row heading to open the Bundle, or a column heading to open the cluster.

- **Behind target**: the currently assigned deployment ID has not been applied.
- **Staged**: Fleet has a newer staged deployment, for example while waiting for a rollout partition.
- **Sync pending**: the agent has not acknowledged the assigned force-sync generation.
- **Not ready / Failed / Modified**: the deployment requires investigation.
- **No deployment**: no matching BundleDeployment was reported. This is not proof that a selector excludes the cluster.

Version labels are Fleet deployment IDs, not Git commits. Different clusters can legitimately have different IDs because of target customizations. The matrix compares each deployment with its own target, not with another cluster's ID. Group membership is calculated from the current ClusterGroup selector and same-workspace cluster labels; it does not preview a GitRepo target selector.

## Follow a deployment

Repository details link to generated Bundles. Bundle details show a deployment path with affected targets first and the first affected target expanded. Expand a target to inspect only its managed objects. Object details provide Desired/Live YAML, Diff, Pod diagnostics, events and container logs. Deployment details also link back to the Bundle and cluster. Resource links can be copied, opened in a new tab, or revisited with browser history.

Diagnostics use the existing server switches and permissions. When diagnostics are disabled, resource metadata remains visible. Relationship or permission failures are shown rather than interpreted as healthy or empty state.

## Observe manual syncs

**Reconcile** on a Bundle and **Sync now** on a repository create a session activity entry after the server accepts the write. Acceptance does not mean successful deployment.

The console checks progress every five seconds, independently of the page's normal refresh setting. The configured server list cache can delay visible changes. Completion requires the controller to have observed the requested source generation, propagation of the force-sync generation, matching assigned/applied deployment IDs, and ready workloads across all reported targets. Repository syncs also require generated Bundles to reflect the source commit and force-sync generation. A missing generation, no targets, or a disappeared target cannot count as success. A newer source specification or request supersedes the observed rollout.

Fleet can retry transient failures. The UI keeps observing affected targets for up to 15 minutes. At the end of that window it reports failed, partially completed, or timed out according to the last observed state. A read failure is not treated as deployment failure. These results describe the observation window; Fleet may continue reconciling afterward. Optional browser notifications report the final observed outcome.

Activity continues while navigating between pages and is restored on reload in the same browser tab. Closing the console stops observation and notifications. It is not a server-side history, an audit log, or a background alert service. Revision pin/resume actions retain their existing behavior and do not create a sync activity entry. After changing a revision, use **Sync now** if an observed forced rollout is needed.
