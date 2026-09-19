import type { BundleDeploymentView, BundleRollout, ReconcileResult, RepositorySyncResult, RepositoryRollout } from "../types.ts";
import { deploymentKey, deploymentPhase } from "./deployment-state.ts";

export const SYNC_TIMEOUT_MS = 15 * 60 * 1000;
export type SyncOutcome = "running" | "succeeded" | "failed" | "partial" | "timed-out" | "superseded";
export interface SyncRequest {
  kind: "bundle" | "repository";
  name: string;
  namespace: string;
  generation: number;
  sourceGeneration: number;
  uid: string;
  commit: string;
}
export interface SyncTask {
  id: string;
  request: SyncRequest;
  observedCommit?: string;
  startedAt: number;
  finishedAt?: number;
  checkedAt?: number;
  outcome: SyncOutcome;
  stage: string;
  ready: number;
  total: number;
  targets: string[];
  deployments: BundleDeploymentView[];
  error?: string;
}

export function newSyncTask(result: ReconcileResult | RepositorySyncResult, now: number): SyncTask {
  const isBundle = "bundle" in result;
  const resource = isBundle ? result.bundle : result.repository;
  const request: SyncRequest = { kind: isBundle ? "bundle" : "repository", name: resource.name, namespace: resource.namespace,
    generation: result.generation, sourceGeneration: result.sourceGeneration, uid: result.uid,
    commit: isBundle ? result.bundle.commit : result.repository.syncedCommit };
  return { id: `${request.kind}/${request.namespace}/${request.name}/${request.generation}/${now}`, request,
    startedAt: now, outcome: "running", stage: "Request accepted", ready: 0, total: 0, targets: [], deployments: [] };
}

export function evaluateSync(task: SyncTask, snapshot: BundleRollout | RepositoryRollout, now: number): SyncTask {
  if (task.outcome !== "running") return task;
  const repository = "repository" in snapshot ? snapshot.repository : null;
  const children = "bundles" in snapshot ? snapshot.bundles : [];
  const bundle = "bundle" in snapshot ? snapshot.bundle : {
    ...snapshot.repository, commit: snapshot.repository.syncedCommit,
    summary: { desiredReady: children.reduce((count, b) => count + b.summary.desiredReady, 0) },
  };
  const items = snapshot.items;
  const request = task.request;
  // Preserve previously observed targets so deletion cannot turn partial completion into success.
  const targets = [...new Set([...task.targets, ...items.map(deploymentKey)])];
  const total = Math.max(bundle.summary.desiredReady, targets.length);
  const controllerObserved = request.sourceGeneration > 0 && bundle.observedGeneration >= request.sourceGeneration;
  const sourceReady = !repository || (children.length > 0 && !!repository.syncedCommit && children.every(b =>
    b.forceGeneration === request.generation && b.commit === repository.syncedCommit && b.generation > 0 && b.observedGeneration >= b.generation));
  const forwarded = items.filter(d => d.forceGeneration === request.generation);
  const applied = forwarded.filter(d => d.syncGeneration === request.generation && !!d.deploymentID && d.appliedDeploymentID === d.deploymentID);
  const ready = applied.filter(d => deploymentPhase(d) === "Ready").length;
  const next: SyncTask = { ...task, targets, deployments: items, total, ready, checkedAt: now, error: undefined };
  if ((request.uid && bundle.uid !== request.uid) || bundle.forceGeneration > request.generation ||
      (request.sourceGeneration > 0 && bundle.generation > request.sourceGeneration) || (request.kind === "bundle" && bundle.commit !== request.commit) ||
      (task.observedCommit !== undefined && task.observedCommit !== bundle.commit)) {
    return { ...next, outcome: "superseded", stage: "A newer request or source change replaced this rollout", finishedAt: now };
  }
  if (controllerObserved && sourceReady) next.observedCommit = bundle.commit;
  if (controllerObserved && sourceReady && total > 0 && items.length === total && ready === total && bundle.forceGeneration === request.generation) {
    return { ...next, outcome: "succeeded", stage: "All target workloads are ready", finishedAt: now };
  }
  const failed = forwarded.filter(d => ["Failed", "Not ready"].includes(deploymentPhase(d))).length;
  if (now - task.startedAt >= SYNC_TIMEOUT_MS) {
    const outcome = failed ? (ready ? "partial" : "failed") : "timed-out";
    return { ...next, outcome, stage: `Observation ended after 15 minutes; ${ready}/${total} ready. Fleet may continue reconciling.`, finishedAt: now };
  }
  const stage = !controllerObserved || !sourceReady ? "Waiting for the controller" : !total ? "Waiting for target deployments" :
    forwarded.length < total ? `Distributing to clusters · ${forwarded.length}/${total}` :
    failed ? `Workloads need attention · ${failed} affected` : applied.length < total ? `Applying on clusters · ${applied.length}/${total}` : "Waiting for workloads to become ready";
  return { ...next, stage };
}

export function syncReadError(task: SyncTask, error: string, now: number): SyncTask {
  // A failed read is not evidence of a failed deployment or a successful old snapshot.
  return { ...task, error, ...(now - task.startedAt >= SYNC_TIMEOUT_MS ? {
    outcome: "timed-out" as const, finishedAt: now, stage: "Observation timed out; deployment outcome could not be confirmed",
  } : {}) };
}
