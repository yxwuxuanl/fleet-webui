package main

import (
	"fmt"
	"strings"
	"time"
)

type Metadata struct {
	Name              string            `json:"name"`
	Namespace         string            `json:"namespace"`
	ResourceVersion   string            `json:"resourceVersion"`
	CreationTimestamp time.Time         `json:"creationTimestamp"`
	Labels            map[string]string `json:"labels"`
}

type Condition struct {
	Type               string     `json:"type"`
	Status             string     `json:"status"`
	Message            string     `json:"message"`
	Reason             string     `json:"reason"`
	LastUpdateTime     *time.Time `json:"lastUpdateTime"`
	LastTransitionTime *time.Time `json:"lastTransitionTime"`
}

type Bundle struct {
	Metadata Metadata `json:"metadata"`
	Spec     struct {
		ForceSyncGeneration int64 `json:"forceSyncGeneration"`
	} `json:"spec"`
	Status struct {
		Display struct {
			State         string `json:"state"`
			ReadyClusters string `json:"readyClusters"`
		} `json:"display"`
		Summary struct {
			Ready                int `json:"ready"`
			DesiredReady         int `json:"desiredReady"`
			NotReady             int `json:"notReady"`
			WaitApplied          int `json:"waitApplied"`
			ErrApplied           int `json:"errApplied"`
			WaitingForDependency int `json:"waitingForDependency"`
			OutOfSync            int `json:"outOfSync"`
			Modified             int `json:"modified"`
			Pending              int `json:"pending"`
		} `json:"summary"`
		Conditions         []Condition `json:"conditions"`
		ObservedGeneration int64       `json:"observedGeneration"`
	} `json:"status"`
}

type GitRepo struct {
	Metadata Metadata `json:"metadata"`
	Spec     struct {
		Repo                string   `json:"repo"`
		Branch              string   `json:"branch"`
		Revision            string   `json:"revision"`
		Paths               []string `json:"paths"`
		PollingInterval     string   `json:"pollingInterval"`
		ImageScanInterval   string   `json:"imageScanInterval"`
		ClientSecretName    string   `json:"clientSecretName"`
		ForceSyncGeneration int64    `json:"forceSyncGeneration"`
	} `json:"spec"`
	Status struct {
		Commit                  string      `json:"commit"`
		WebhookCommit           string      `json:"webhookCommit"`
		PollingCommit           string      `json:"pollingCommit"`
		GitJobStatus            string      `json:"gitJobStatus"`
		LastPollingTriggered    *time.Time  `json:"lastPollingTriggered"`
		LastWebhookTime         *time.Time  `json:"lastWebhookTime"`
		LastSyncedImageScanTime *time.Time  `json:"lastSyncedImageScanTime"`
		Conditions              []Condition `json:"conditions"`
		ObservedGeneration      int64       `json:"observedGeneration"`
		ReadyClusters           int         `json:"readyClusters"`
		DesiredReadyClusters    int         `json:"desiredReadyClusters"`
		Display                 struct {
			State                  string `json:"state"`
			ReadyBundleDeployments string `json:"readyBundleDeployments"`
		} `json:"display"`
		ResourceCounts GitRepoResourceSummary `json:"resourceCounts"`
	} `json:"status"`
}

type GitRepoResourceSummary struct {
	Ready        int `json:"ready"`
	DesiredReady int `json:"desiredReady"`
	NotReady     int `json:"notReady"`
	WaitApplied  int `json:"waitApplied"`
	Modified     int `json:"modified"`
	Missing      int `json:"missing"`
	Orphaned     int `json:"orphaned"`
	Unknown      int `json:"unknown"`
}

type Cluster struct {
	Metadata Metadata `json:"metadata"`
	Spec     struct {
		Paused           bool   `json:"paused"`
		ClientID         string `json:"clientID"`
		AgentNamespace   string `json:"agentNamespace"`
		KubeConfigSecret string `json:"kubeConfigSecret"`
	} `json:"spec"`
	Status struct {
		Namespace    string `json:"namespace"`
		APIServerURL string `json:"apiServerURL"`
		Display      struct {
			ReadyBundles string `json:"readyBundles"`
			State        string `json:"state"`
		} `json:"display"`
		Agent struct {
			LastSeen  time.Time `json:"lastSeen"`
			Namespace string    `json:"namespace"`
		} `json:"agent"`
		Conditions []Condition `json:"conditions"`
	} `json:"status"`
}

type BundleDeployment struct {
	Metadata Metadata `json:"metadata"`
	Spec     struct {
		Paused             bool   `json:"paused"`
		DeploymentID       string `json:"deploymentID"`
		StagedDeploymentID string `json:"stagedDeploymentID"`
		Options            struct {
			ForceSyncGeneration int64  `json:"forceSyncGeneration"`
			TargetNamespace     string `json:"namespace"`
		} `json:"options"`
	} `json:"spec"`
	Status struct {
		Conditions          []Condition `json:"conditions"`
		AppliedDeploymentID string      `json:"appliedDeploymentID"`
		Release             string      `json:"release"`
		Ready               bool        `json:"ready"`
		NonModified         bool        `json:"nonModified"`
		Display             struct {
			Deployed  string `json:"deployed"`
			Monitored string `json:"monitored"`
			State     string `json:"state"`
		} `json:"display"`
		SyncGeneration *int64                     `json:"syncGeneration"`
		ResourceCounts GitRepoResourceSummary     `json:"resourceCounts"`
		Resources      []BundleDeploymentResource `json:"resources"`
	} `json:"status"`
}

type BundleDeploymentResource struct {
	Kind       string    `json:"kind"`
	APIVersion string    `json:"apiVersion"`
	Namespace  string    `json:"namespace"`
	Name       string    `json:"name"`
	CreatedAt  time.Time `json:"createdAt"`
}

type BundleView struct {
	Name            string `json:"name"`
	Namespace       string `json:"namespace"`
	GitRepo         string `json:"gitRepo"`
	Commit          string `json:"commit"`
	Health          string `json:"health"`
	State           string `json:"state"`
	Targets         string `json:"targets"`
	LastActivity    string `json:"lastActivity"`
	Message         string `json:"message,omitempty"`
	ForceGeneration int64  `json:"forceGeneration"`
}

type BundleSummaryView struct {
	Ready                int `json:"ready"`
	DesiredReady         int `json:"desiredReady"`
	NotReady             int `json:"notReady"`
	WaitApplied          int `json:"waitApplied"`
	ErrApplied           int `json:"errApplied"`
	WaitingForDependency int `json:"waitingForDependency"`
	OutOfSync            int `json:"outOfSync"`
	Modified             int `json:"modified"`
	Pending              int `json:"pending"`
}

type BundleConditionView struct {
	Type        string `json:"type"`
	Status      string `json:"status"`
	Reason      string `json:"reason,omitempty"`
	Message     string `json:"message,omitempty"`
	LastUpdated string `json:"lastUpdated,omitempty"`
}

type BundleDetailView struct {
	BundleView
	CreatedAt          string                `json:"createdAt,omitempty"`
	ResourceVersion    string                `json:"resourceVersion,omitempty"`
	ObservedGeneration int64                 `json:"observedGeneration"`
	Summary            BundleSummaryView     `json:"summary"`
	Conditions         []BundleConditionView `json:"conditions"`
}

type GitRepoView struct {
	Name           string `json:"name"`
	Namespace      string `json:"namespace"`
	Repo           string `json:"repo"`
	Branch         string `json:"branch"`
	SyncedCommit   string `json:"syncedCommit"`
	PendingCommit  string `json:"pendingCommit,omitempty"`
	SyncState      string `json:"syncState"`
	LatestActivity string `json:"latestActivity"`
	Message        string `json:"message,omitempty"`
}

type GitRepoDetailView struct {
	GitRepoView
	Revision                string                 `json:"revision,omitempty"`
	Paths                   []string               `json:"paths,omitempty"`
	PollingInterval         string                 `json:"pollingInterval,omitempty"`
	ImageScanInterval       string                 `json:"imageScanInterval,omitempty"`
	WebhookCommit           string                 `json:"webhookCommit,omitempty"`
	PollingCommit           string                 `json:"pollingCommit,omitempty"`
	GitJobStatus            string                 `json:"gitJobStatus,omitempty"`
	LastPollingTriggered    string                 `json:"lastPollingTriggered,omitempty"`
	LastWebhookTime         string                 `json:"lastWebhookTime,omitempty"`
	LastSyncedImageScanTime string                 `json:"lastSyncedImageScanTime,omitempty"`
	CreatedAt               string                 `json:"createdAt,omitempty"`
	ResourceVersion         string                 `json:"resourceVersion,omitempty"`
	ObservedGeneration      int64                  `json:"observedGeneration"`
	ReadyBundleDeployments  string                 `json:"readyBundleDeployments,omitempty"`
	ResourceCounts          GitRepoResourceSummary `json:"resourceCounts"`
	Conditions              []BundleConditionView  `json:"conditions"`
}

type ClusterView struct {
	Name             string `json:"name"`
	Namespace        string `json:"namespace"`
	ClusterNamespace string `json:"clusterNamespace,omitempty"`
	State            string `json:"state"`
	ReadyBundles     string `json:"readyBundles"`
	Paused           bool   `json:"paused"`
	LastSeen         string `json:"lastSeen,omitempty"`
	AgentNamespace   string `json:"agentNamespace,omitempty"`
	Message          string `json:"message,omitempty"`
}

type ClusterDetailView struct {
	ClusterView
	ClientID        string                `json:"clientID,omitempty"`
	APIServerURL    string                `json:"apiServerURL,omitempty"`
	CreatedAt       string                `json:"createdAt,omitempty"`
	ResourceVersion string                `json:"resourceVersion,omitempty"`
	Labels          map[string]string     `json:"labels"`
	Conditions      []BundleConditionView `json:"conditions"`
}

type BundleDeploymentView struct {
	Name            string `json:"name"`
	Namespace       string `json:"namespace"`
	Cluster         string `json:"cluster"`
	BundleName      string `json:"bundleName"`
	BundleNamespace string `json:"bundleNamespace,omitempty"`
	State           string `json:"state"`
	Deployed        string `json:"deployed,omitempty"`
	Monitored       string `json:"monitored,omitempty"`
	Release         string `json:"release,omitempty"`
	Ready           bool   `json:"ready"`
	Paused          bool   `json:"paused"`
	LastActivity    string `json:"lastActivity,omitempty"`
	Message         string `json:"message,omitempty"`
}

type BundleDeploymentDetailView struct {
	BundleDeploymentView
	DeploymentID        string                 `json:"deploymentID,omitempty"`
	StagedDeploymentID  string                 `json:"stagedDeploymentID,omitempty"`
	AppliedDeploymentID string                 `json:"appliedDeploymentID,omitempty"`
	TargetNamespace     string                 `json:"targetNamespace,omitempty"`
	ForceGeneration     int64                  `json:"forceGeneration"`
	SyncGeneration      *int64                 `json:"syncGeneration,omitempty"`
	ResourceCounts      GitRepoResourceSummary `json:"resourceCounts"`
	ResourceTotal       int                    `json:"resourceTotal"`
	CreatedAt           string                 `json:"createdAt,omitempty"`
	ResourceVersion     string                 `json:"resourceVersion,omitempty"`
	Conditions          []BundleConditionView  `json:"conditions"`
}

type ManagedObjectView struct {
	DeploymentName      string `json:"deploymentName"`
	DeploymentNamespace string `json:"deploymentNamespace"`
	Cluster             string `json:"cluster"`
	APIVersion          string `json:"apiVersion"`
	Kind                string `json:"kind"`
	Namespace           string `json:"namespace,omitempty"`
	Name                string `json:"name"`
	CreatedAt           string `json:"createdAt,omitempty"`
}

type ManagedObjectYAMLView struct {
	ManagedObjectView
	YAML         string                   `json:"yaml"`
	LiveYAML     string                   `json:"liveYAML"`
	DesiredYAML  string                   `json:"desiredYAML,omitempty"`
	Diff         string                   `json:"diff,omitempty"`
	Redacted     bool                     `json:"redacted"`
	Events       []ManagedObjectEventView `json:"events"`
	Pods         []ManagedObjectPodView   `json:"pods"`
	DesiredError string                   `json:"desiredError,omitempty"`
}

type ManagedObjectEventView struct {
	Type      string `json:"type"`
	Reason    string `json:"reason"`
	Message   string `json:"message"`
	Count     int32  `json:"count"`
	FirstSeen string `json:"firstSeen,omitempty"`
	LastSeen  string `json:"lastSeen,omitempty"`
	Source    string `json:"source,omitempty"`
}

type ManagedObjectPodView struct {
	Name           string   `json:"name"`
	Namespace      string   `json:"namespace"`
	Phase          string   `json:"phase"`
	Ready          int      `json:"ready"`
	Containers     int      `json:"containers"`
	Restarts       int32    `json:"restarts"`
	ContainerNames []string `json:"containerNames"`
}

type GitCommitView struct {
	Hash       string `json:"hash"`
	ShortHash  string `json:"shortHash"`
	Author     string `json:"author"`
	AuthoredAt string `json:"authoredAt"`
	Subject    string `json:"subject"`
	Current    bool   `json:"current"`
	Pinned     bool   `json:"pinned"`
}

func latestTime(values ...*time.Time) time.Time {
	var latest time.Time
	for _, value := range values {
		if value != nil && value.After(latest) {
			latest = *value
		}
	}
	return latest
}

func latestCondition(conditions []Condition) (time.Time, string) {
	var latest time.Time
	var message string
	for _, condition := range conditions {
		at := latestTime(condition.LastUpdateTime, condition.LastTransitionTime)
		if at.After(latest) {
			latest, message = at, condition.Message
		}
	}
	return latest, message
}

func bundleView(bundle Bundle) BundleView {
	state := bundleState(bundle)
	health := "Unknown"
	switch strings.ToLower(state) {
	case "ready":
		health = "Healthy"
	case "errapplied", "error", "notready":
		health = "Error"
	case "outofsync", "modified":
		health = "Out of sync"
	case "pending", "waitapplied", "waitingfordependency":
		health = "Reconciling"
	}
	activity, message := latestCondition(bundle.Status.Conditions)
	if activity.IsZero() {
		activity = bundle.Metadata.CreationTimestamp
	}
	targets := bundle.Status.Display.ReadyClusters
	if targets == "" {
		targets = fmt.Sprintf("%d / %d", bundle.Status.Summary.Ready, bundle.Status.Summary.DesiredReady)
	}
	return BundleView{
		Name: bundle.Metadata.Name, Namespace: bundle.Metadata.Namespace,
		GitRepo: bundle.Metadata.Labels["fleet.cattle.io/repo-name"], Commit: shortCommit(bundle.Metadata.Labels["fleet.cattle.io/commit"]),
		Health: health, State: state, Targets: targets, LastActivity: activity.Format(time.RFC3339), Message: message,
		ForceGeneration: bundle.Spec.ForceSyncGeneration,
	}
}

func bundleDetailView(bundle Bundle) BundleDetailView {
	conditions := make([]BundleConditionView, 0, len(bundle.Status.Conditions))
	for _, condition := range bundle.Status.Conditions {
		updated := latestTime(condition.LastUpdateTime, condition.LastTransitionTime)
		conditions = append(conditions, BundleConditionView{
			Type: condition.Type, Status: condition.Status, Reason: condition.Reason, Message: condition.Message,
			LastUpdated: timestamp(updated),
		})
	}
	return BundleDetailView{
		BundleView:         bundleView(bundle),
		CreatedAt:          timestamp(bundle.Metadata.CreationTimestamp),
		ResourceVersion:    bundle.Metadata.ResourceVersion,
		ObservedGeneration: bundle.Status.ObservedGeneration,
		Summary: BundleSummaryView{
			Ready: bundle.Status.Summary.Ready, DesiredReady: bundle.Status.Summary.DesiredReady,
			NotReady: bundle.Status.Summary.NotReady, WaitApplied: bundle.Status.Summary.WaitApplied,
			ErrApplied: bundle.Status.Summary.ErrApplied, OutOfSync: bundle.Status.Summary.OutOfSync,
			Modified: bundle.Status.Summary.Modified, Pending: bundle.Status.Summary.Pending,
			WaitingForDependency: bundle.Status.Summary.WaitingForDependency,
		},
		Conditions: conditions,
	}
}

func timestamp(value time.Time) string {
	if value.IsZero() {
		return ""
	}
	return value.Format(time.RFC3339)
}

func timestampValue(value *time.Time) string {
	if value == nil {
		return ""
	}
	return timestamp(*value)
}

func bundleState(bundle Bundle) string {
	if state := bundle.Status.Display.State; state != "" {
		return state
	}
	summary := bundle.Status.Summary
	switch {
	case summary.ErrApplied > 0:
		return "ErrApplied"
	case summary.WaitingForDependency > 0:
		return "WaitingForDependency"
	case summary.WaitApplied > 0:
		return "WaitApplied"
	case summary.Modified > 0:
		return "Modified"
	case summary.OutOfSync > 0:
		return "OutOfSync"
	case summary.Pending > 0:
		return "Pending"
	case summary.NotReady > 0:
		return "NotReady"
	case summary.DesiredReady > 0 && summary.Ready >= summary.DesiredReady:
		return "Ready"
	}
	for _, condition := range bundle.Status.Conditions {
		if strings.EqualFold(condition.Type, "Ready") && strings.EqualFold(condition.Status, "True") {
			return "Ready"
		}
	}
	return ""
}

func gitRepoView(repo GitRepo) GitRepoView {
	activity := latestTime(repo.Status.LastWebhookTime, repo.Status.LastPollingTriggered)
	if activity.IsZero() {
		activity, _ = latestCondition(repo.Status.Conditions)
	}
	if activity.IsZero() {
		activity = repo.Metadata.CreationTimestamp
	}
	pending := repo.Status.PollingCommit
	if pending == "" || pending == repo.Status.Commit {
		pending = repo.Status.WebhookCommit
	}
	if pending == repo.Status.Commit {
		pending = ""
	}
	state := strings.TrimSpace(repo.Status.Display.State)
	if state == "" {
		state = strings.TrimSpace(repo.Status.GitJobStatus)
	}
	if state == "" {
		state = "Unknown"
	}
	if pending != "" && (strings.EqualFold(state, "Current") || strings.EqualFold(state, "Ready") || strings.EqualFold(state, "Synced")) {
		state = "Out of sync"
	}
	message := ""
	for _, condition := range repo.Status.Conditions {
		if condition.Message != "" {
			message = condition.Message
			break
		}
	}
	branch := repo.Spec.Branch
	if branch == "" {
		branch = repo.Spec.Revision
	}
	return GitRepoView{
		Name: repo.Metadata.Name, Namespace: repo.Metadata.Namespace, Repo: repo.Spec.Repo, Branch: branch,
		SyncedCommit: shortCommit(repo.Status.Commit), PendingCommit: shortCommit(pending), SyncState: state,
		LatestActivity: activity.Format(time.RFC3339), Message: message,
	}
}

func gitRepoDetailView(repo GitRepo) GitRepoDetailView {
	conditions := make([]BundleConditionView, 0, len(repo.Status.Conditions))
	for _, condition := range repo.Status.Conditions {
		updated := latestTime(condition.LastUpdateTime, condition.LastTransitionTime)
		conditions = append(conditions, BundleConditionView{
			Type: condition.Type, Status: condition.Status, Reason: condition.Reason, Message: condition.Message,
			LastUpdated: timestamp(updated),
		})
	}
	return GitRepoDetailView{
		GitRepoView:             gitRepoView(repo),
		Revision:                repo.Spec.Revision,
		Paths:                   repo.Spec.Paths,
		PollingInterval:         repo.Spec.PollingInterval,
		ImageScanInterval:       repo.Spec.ImageScanInterval,
		WebhookCommit:           repo.Status.WebhookCommit,
		PollingCommit:           repo.Status.PollingCommit,
		GitJobStatus:            repo.Status.GitJobStatus,
		LastPollingTriggered:    timestampValue(repo.Status.LastPollingTriggered),
		LastWebhookTime:         timestampValue(repo.Status.LastWebhookTime),
		LastSyncedImageScanTime: timestampValue(repo.Status.LastSyncedImageScanTime),
		CreatedAt:               timestamp(repo.Metadata.CreationTimestamp),
		ResourceVersion:         repo.Metadata.ResourceVersion,
		ObservedGeneration:      repo.Status.ObservedGeneration,
		ReadyBundleDeployments:  repo.Status.Display.ReadyBundleDeployments,
		ResourceCounts:          repo.Status.ResourceCounts,
		Conditions:              conditions,
	}
}

func conditionViews(conditions []Condition) []BundleConditionView {
	views := make([]BundleConditionView, 0, len(conditions))
	for _, condition := range conditions {
		updated := latestTime(condition.LastUpdateTime, condition.LastTransitionTime)
		views = append(views, BundleConditionView{
			Type: condition.Type, Status: condition.Status, Reason: condition.Reason, Message: condition.Message,
			LastUpdated: timestamp(updated),
		})
	}
	return views
}

func clusterView(cluster Cluster) ClusterView {
	activity, message := latestCondition(cluster.Status.Conditions)
	if cluster.Status.Agent.LastSeen.After(activity) {
		activity = cluster.Status.Agent.LastSeen
	}
	state := strings.TrimSpace(cluster.Status.Display.State)
	if cluster.Spec.Paused {
		state = "Paused"
	} else if state == "" {
		state = "Unknown"
	}
	agentNamespace := cluster.Spec.AgentNamespace
	if agentNamespace == "" {
		agentNamespace = cluster.Status.Agent.Namespace
	}
	return ClusterView{
		Name: cluster.Metadata.Name, Namespace: cluster.Metadata.Namespace,
		ClusterNamespace: cluster.Status.Namespace, State: state, ReadyBundles: cluster.Status.Display.ReadyBundles,
		Paused: cluster.Spec.Paused, LastSeen: timestamp(activity), AgentNamespace: agentNamespace, Message: message,
	}
}

func clusterDetailView(cluster Cluster) ClusterDetailView {
	return ClusterDetailView{
		ClusterView: clusterView(cluster), ClientID: cluster.Spec.ClientID, APIServerURL: cluster.Status.APIServerURL,
		CreatedAt: timestamp(cluster.Metadata.CreationTimestamp), ResourceVersion: cluster.Metadata.ResourceVersion,
		Labels: cluster.Metadata.Labels, Conditions: conditionViews(cluster.Status.Conditions),
	}
}

func bundleDeploymentView(deployment BundleDeployment, clusterName string) BundleDeploymentView {
	activity, message := latestCondition(deployment.Status.Conditions)
	if activity.IsZero() {
		activity = deployment.Metadata.CreationTimestamp
	}
	state := strings.TrimSpace(deployment.Status.Display.State)
	if deployment.Spec.Paused {
		state = "Paused"
	} else if state == "" && deployment.Status.Ready {
		state = "Ready"
	} else if state == "" {
		state = "Unknown"
	}
	if clusterName == "" {
		clusterName = deployment.Metadata.Namespace
	}
	bundleName := deployment.Metadata.Labels["fleet.cattle.io/bundle-name"]
	if bundleName == "" {
		bundleName = deployment.Metadata.Name
	}
	return BundleDeploymentView{
		Name: deployment.Metadata.Name, Namespace: deployment.Metadata.Namespace, Cluster: clusterName,
		BundleName: bundleName, BundleNamespace: deployment.Metadata.Labels["fleet.cattle.io/bundle-namespace"],
		State: state, Deployed: deployment.Status.Display.Deployed, Monitored: deployment.Status.Display.Monitored,
		Release: deployment.Status.Release, Ready: deployment.Status.Ready, Paused: deployment.Spec.Paused,
		LastActivity: timestamp(activity), Message: message,
	}
}

func bundleDeploymentDetailView(deployment BundleDeployment, clusterName string) BundleDeploymentDetailView {
	return BundleDeploymentDetailView{
		BundleDeploymentView: bundleDeploymentView(deployment, clusterName),
		DeploymentID:         deployment.Spec.DeploymentID, StagedDeploymentID: deployment.Spec.StagedDeploymentID,
		AppliedDeploymentID: deployment.Status.AppliedDeploymentID, TargetNamespace: deployment.Spec.Options.TargetNamespace,
		ForceGeneration: deployment.Spec.Options.ForceSyncGeneration, SyncGeneration: deployment.Status.SyncGeneration,
		ResourceCounts: deployment.Status.ResourceCounts, ResourceTotal: len(deployment.Status.Resources),
		CreatedAt: timestamp(deployment.Metadata.CreationTimestamp), ResourceVersion: deployment.Metadata.ResourceVersion,
		Conditions: conditionViews(deployment.Status.Conditions),
	}
}

func shortCommit(commit string) string {
	if len(commit) > 7 {
		return commit[:7]
	}
	return commit
}
