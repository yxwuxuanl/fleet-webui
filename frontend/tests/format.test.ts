import assert from "node:assert/strict";
import { test } from "node:test";
import { needsAttention, statusKind } from "../src/lib/format.ts";

test("Fleet dependency waits use the shared progress classification", () => {
  assert.equal(statusKind("WaitingForDependency"), "progress");
  assert.equal(statusKind("waitingfordependency"), "progress");
});

test("dependency waits are not deployment errors, but errors still need attention", () => {
  const bundle = {
    name: "dependent", namespace: "fleet-local", gitRepo: "example",
    commit: "", health: "Reconciling", state: "WaitingForDependency",
    targets: "0 / 1", lastActivity: "", forceGeneration: 0,
  };
  assert.equal(needsAttention(bundle), false);
  assert.equal(needsAttention({ ...bundle, health: "Error", state: "ErrApplied" }), true);
});

test("existing Fleet states and unknown future states keep their classifications", () => {
  assert.equal(statusKind("Ready"), "healthy");
  assert.equal(statusKind("ErrApplied"), "error");
  assert.equal(statusKind("WaitApplied"), "progress");
  assert.equal(statusKind("Pending"), "progress");
  assert.equal(statusKind("Modified"), "warning");
  assert.equal(statusKind("FutureState"), "neutral");
  assert.equal(statusKind(undefined), "neutral");
});
