export interface HealthStatus {
  mode: "direct" | "kubeconfig" | "in-cluster" | "unconfigured" | string;
  connectionError: string;
  reconcileEnabled: boolean;
  managedObjectsYAMLEnabled?: boolean;
  gitHistoryEnabled?: boolean;
  gitRepoActionsEnabled?: boolean;
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
  waitingForDependency: number;
  outOfSync: number;
  modified: number;
  pending: number;
}

export interface BundleDetail extends BundleView {
  generation: number;
  uid: string;
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
  generation: number;
  forceGeneration: number;
  uid: string;
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
  sourceGeneration: number;
  uid: string;
  bundle: BundleView;
  generation: number;
}

export interface ClusterView {
  labels?: Record<string, string>;
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
  deploymentID?: string;
  stagedDeploymentID?: string;
  appliedDeploymentID?: string;
  forceGeneration: number;
  syncGeneration?: number;
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
  liveYAML: string;
  desiredYAML?: string;
  diff?: string;
  redacted: boolean;
  desiredError?: string;
  events: ManagedObjectEvent[];
  pods: ManagedObjectPod[];
}

export interface ManagedObjectEvent {
  type: string;
  reason: string;
  message: string;
  count: number;
  firstSeen?: string;
  lastSeen?: string;
  source?: string;
}

export interface ManagedObjectPod {
  name: string;
  namespace: string;
  phase: string;
  ready: number;
  containers: number;
  restarts: number;
  containerNames: string[];
}

export interface GitCommit {
  hash: string;
  shortHash: string;
  author: string;
  authoredAt: string;
  subject: string;
  current: boolean;
  pinned: boolean;
}

export interface GitHistory {
  items: GitCommit[];
  revision?: string;
  branch?: string;
  actionsEnabled: boolean;
  historyEnabled: boolean;
}

export interface LoadErrors {
  health: string;
  bundles: string;
  repositories: string;
}

export interface BundleRollout {
  bundle: BundleDetail;
  items: BundleDeploymentView[];
}

export interface RepositorySyncResult {
  repository: GitRepoView;
  generation: number;
  sourceGeneration: number;
  uid: string;
}
export interface RepositoryRollout {
  repository: GitRepoDetail;
  bundles: BundleDetail[];
  items: BundleDeploymentView[];
}

export interface ClusterGroupView {
  name: string;
  namespace: string;
  clusterNamespaces: string[];
}
