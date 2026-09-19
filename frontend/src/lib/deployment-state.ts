import type { BundleDeploymentView } from "../types.ts";

export function deploymentPhase(item: BundleDeploymentView): string {
  if (item.paused) return "Paused";
  if (["ErrApplied", "Error", "Failed"].includes(item.state)) return "Failed";
  if (item.stagedDeploymentID && item.stagedDeploymentID !== item.deploymentID) return "Staged";
  if (!item.deploymentID || !item.appliedDeploymentID) return "Awaiting deployment";
  if (item.deploymentID !== item.appliedDeploymentID) return "Behind target";
  if (item.forceGeneration > 0 && item.syncGeneration !== item.forceGeneration) return "Sync pending";
  if (item.state === "Modified") return "Modified";
  if (item.ready && ["Ready", "Healthy", "Current"].includes(item.state)) return "Ready";
  return item.ready ? item.state || "Unknown" : "Not ready";
}

export function deploymentKey(item: Pick<BundleDeploymentView, "namespace" | "name">) {
  return `${item.namespace}/${item.name}`;
}

export function indexDeployments(items: BundleDeploymentView[]) {
  const index = new Map<string, Map<string, BundleDeploymentView[]>>();
  for (const item of items) {
    if (!item.bundleNamespace) continue;
    const bundle = `${item.bundleNamespace}/${item.bundleName}`;
    let columns = index.get(bundle);
    if (!columns) index.set(bundle, columns = new Map());
    const cell = columns.get(item.namespace) ?? [];
    cell.push(item);
    columns.set(item.namespace, cell);
  }
  return index;
}
