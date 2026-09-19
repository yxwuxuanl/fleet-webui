import assert from "node:assert/strict";
import { test } from "node:test";
import { deploymentPhase, indexDeployments } from "../src/lib/deployment-state.ts";
import { evaluateSync, newSyncTask, syncReadError, SYNC_TIMEOUT_MS } from "../src/lib/sync-state.ts";
import type { BundleDetail, BundleDeploymentView, BundleRollout, RepositoryRollout } from "../src/types.ts";

const bundle: BundleDetail = {
  name: "api", namespace: "prod", gitRepo: "platform", commit: "abcdef0", health: "Healthy", state: "Ready", targets: "1/1", lastActivity: "",
  forceGeneration: 4, generation: 12, uid: "bundle-uid", observedGeneration: 12, conditions: [],
  summary: { ready: 1, desiredReady: 1, notReady: 0, waitApplied: 0, errApplied: 0, waitingForDependency: 0, outOfSync: 0, modified: 0, pending: 0 },
};
const deployment: BundleDeploymentView = { name: "api", namespace: "cluster-a", cluster: "prod/a", bundleName: "api", bundleNamespace: "prod",
  state: "Ready", ready: true, paused: false, forceGeneration: 4, syncGeneration: 4, deploymentID: "new", appliedDeploymentID: "new" };
const request = { bundle, generation: 4, sourceGeneration: 12, uid: "bundle-uid" };
const snapshot: BundleRollout = { bundle, items: [deployment] };
const task = () => newSyncTask(request, 1000);

test("matrix keeps duplicate names in separate workspaces and cluster namespaces", () => {
  const index = indexDeployments([deployment, { ...deployment, namespace: "cluster-b", cluster: "dev/a", bundleNamespace: "dev" }, { ...deployment, bundleNamespace: undefined }]);
  assert.equal(index.size, 2);
  assert.equal(index.get("prod/api")?.get("cluster-a")?.length, 1);
  assert.equal(index.get("prod/api")?.has("cluster-b"), false);
});

test("matrix distinguishes unapplied, staged, paused, failed and missing revisions", () => {
  assert.equal(deploymentPhase(deployment), "Ready");
  assert.equal(deploymentPhase({ ...deployment, appliedDeploymentID: "old" }), "Behind target");
  assert.equal(deploymentPhase({ ...deployment, stagedDeploymentID: "next" }), "Staged");
  assert.equal(deploymentPhase({ ...deployment, paused: true }), "Paused");
  assert.equal(deploymentPhase({ ...deployment, state: "ErrApplied" }), "Failed");
  assert.equal(deploymentPhase({ ...deployment, syncGeneration: 3 }), "Sync pending");
  assert.equal(deploymentPhase({ ...deployment, deploymentID: undefined }), "Awaiting deployment");
  assert.notEqual(deploymentPhase({ ...deployment, state: "WaitingForDependency" }), "Ready");
});

test("old Ready and old generations never complete a new reconcile", () => {
  for (const item of [
    { ...deployment, forceGeneration: 3, syncGeneration: 3 },
    { ...deployment, syncGeneration: undefined },
    { ...deployment, syncGeneration: 3 },
    { ...deployment, appliedDeploymentID: "old" },
    { ...deployment, ready: false },
    { ...deployment, stagedDeploymentID: "next" },
  ]) assert.equal(evaluateSync(task(), { bundle, items: [item] }, 2000).outcome, "running");
  assert.equal(evaluateSync(task(), { ...snapshot, bundle: { ...bundle, observedGeneration: 11 } }, 2000).outcome, "running");
  assert.equal(evaluateSync(task(), snapshot, 2000).outcome, "succeeded");
});

test("empty and disappearing targets cannot produce false success", () => {
  assert.equal(evaluateSync(task(), { bundle, items: [] }, 2000).outcome, "running");
  const first = evaluateSync(task(), { bundle, items: [deployment, { ...deployment, namespace: "cluster-b", ready: false }] }, 2000);
  const next = evaluateSync(first, snapshot, 3000);
  assert.equal(next.total, 2);
  assert.equal(next.outcome, "running");
});

test("new requests, source edits and recreation supersede a tracked rollout", () => {
  for (const change of [{ forceGeneration: 5 }, { generation: 13 }, { commit: "different" }, { uid: "recreated" }]) {
    assert.equal(evaluateSync(task(), { ...snapshot, bundle: { ...bundle, ...change } }, 2000).outcome, "superseded");
  }
});

test("timeouts distinguish failed, partial and unconfirmed states", () => {
  const now = 1000 + SYNC_TIMEOUT_MS;
  const bad = { ...deployment, namespace: "cluster-b", state: "ErrApplied", ready: false };
  assert.equal(evaluateSync(task(), { bundle, items: [bad] }, now).outcome, "failed");
  assert.equal(evaluateSync(task(), { bundle, items: [deployment, bad] }, now).outcome, "partial");
  assert.equal(evaluateSync(task(), { bundle, items: [{ ...deployment, paused: true }] }, now).outcome, "timed-out");
  assert.equal(syncReadError(task(), "offline", 2000).outcome, "running");
  assert.equal(syncReadError(task(), "offline", now).outcome, "timed-out");
});

test("repository sync waits for new source to propagate through every bundle", () => {
  const repository = { name: "platform", namespace: "prod", repo: "https://example.test/repo", branch: "main", syncedCommit: "newhash", syncState: "Ready", latestActivity: "", generation: 8, forceGeneration: 4, uid: "repo-uid", observedGeneration: 8, conditions: [], resourceCounts: { ready: 1, desiredReady: 1, notReady: 0, waitApplied: 0, modified: 0, missing: 0, orphaned: 0, unknown: 0 } };
  const t = newSyncTask({ repository, generation: 4, sourceGeneration: 8, uid: "repo-uid" }, 1000);
  const source: RepositoryRollout = { repository, bundles: [bundle], items: [deployment] };
  assert.equal(evaluateSync(t, source, 2000).outcome, "running");
  assert.equal(evaluateSync(t, { ...source, bundles: [{ ...bundle, commit: "newhash" }] }, 2000).outcome, "succeeded");
  assert.equal(evaluateSync(t, { ...source, bundles: [] }, 2000).outcome, "running");
});
