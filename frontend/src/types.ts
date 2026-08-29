export interface HealthStatus {
  mode: "direct" | "kubeconfig" | "in-cluster" | "unconfigured" | string;
  connectionError: string;
  notificationConfigured: boolean;
  reconcileEnabled: boolean;
  managedObjectsYAMLEnabled?: boolean;
}

export interface BundleView {
  name: string;
  namespace: string;
  gitRepo: string;
  commit: string;
  health: string;
  state: string;
  targets: string;
  lastActivity: string;
  message?: string;
  forceGeneration: number;
}

export interface FleetCondition {
  type: string;
  status: string;
  reason?: string;
  message?: string;
  lastUpdated?: string;
}

export interface BundleSummary {
  ready: number;
  desiredReady: number;
  notReady: number;
  waitApplied: number;
  errApplied: number;
  outOfSync: number;
  modified: number;
  pending: number;
}

export interface BundleDetail extends BundleView {
  createdAt?: string;
  resourceVersion?: string;
  observedGeneration: number;
  summary: BundleSummary;
  conditions: FleetCondition[];
}

export interface GitRepoView {
  name: string;
  namespace: string;
  repo: string;
  branch: string;
  syncedCommit: string;
  pendingCommit?: string;
  syncState: string;
  latestActivity: string;
  message?: string;
}

export interface GitRepoResourceCounts {
  ready: number;
  desiredReady: number;
  notReady: number;
  waitApplied: number;
  modified: number;
  missing: number;
  orphaned: number;
  unknown: number;
}

export interface GitRepoDetail extends GitRepoView {
  revision?: string;
  paths?: string[];
  pollingInterval?: string;
  imageScanInterval?: string;
  webhookCommit?: string;
  pollingCommit?: string;
  gitJobStatus?: string;
  lastPollingTriggered?: string;
  lastWebhookTime?: string;
  lastSyncedImageScanTime?: string;
  createdAt?: string;
  resourceVersion?: string;
  observedGeneration: number;
  readyBundleDeployments?: string;
  resourceCounts: GitRepoResourceCounts;
  conditions: FleetCondition[];
}

export interface ReconcileResult {
  bundle: BundleView;
  generation: number;
  notification: "sent" | "failed" | "not-configured" | string;
}

export interface ClusterView {
  name: string;
  namespace: string;
  clusterNamespace?: string;
  state: string;
  readyBundles: string;
  paused: boolean;
  lastSeen?: string;
  agentNamespace?: string;
  message?: string;
}

export interface ClusterDetail extends ClusterView {
  clientID?: string;
  apiServerURL?: string;
  createdAt?: string;
  resourceVersion?: string;
  labels: Record<string, string>;
  conditions: FleetCondition[];
}

export interface BundleDeploymentView {
  name: string;
  namespace: string;
  cluster: string;
  bundleName: string;
  bundleNamespace?: string;
  state: string;
  deployed?: string;
  monitored?: string;
  release?: string;
  ready: boolean;
  paused: boolean;
  lastActivity?: string;
  message?: string;
}

export interface BundleDeploymentDetail extends BundleDeploymentView {
  deploymentID?: string;
  stagedDeploymentID?: string;
  appliedDeploymentID?: string;
  targetNamespace?: string;
  forceGeneration: number;
  syncGeneration?: number;
  resourceCounts: GitRepoResourceCounts;
  resourceTotal: number;
  createdAt?: string;
  resourceVersion?: string;
  conditions: FleetCondition[];
}

export interface ManagedObjectView {
  deploymentName: string;
  deploymentNamespace: string;
  cluster: string;
  apiVersion: string;
  kind: string;
  namespace?: string;
  name: string;
  createdAt?: string;
}

export interface ManagedObjectYAML extends ManagedObjectView {
  yaml: string;
  redacted: boolean;
}

export interface LoadErrors {
  health: string;
  bundles: string;
  repositories: string;
}
