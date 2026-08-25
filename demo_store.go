package main

import (
	"errors"
	"sync"
	"time"
)

type DemoStore struct {
	mu       sync.RWMutex
	bundles  []BundleView
	gitRepos []GitRepoView
}

func newDemoStore() *DemoStore {
	now := time.Now().UTC()
	ago := func(minutes int) string { return now.Add(-time.Duration(minutes) * time.Minute).Format(time.RFC3339) }
	return &DemoStore{
		bundles: []BundleView{
			{Name: "platform-base", Namespace: "platform", GitRepo: "platform-configs", Commit: "8f3a1b2", Health: "Healthy", State: "Ready", Targets: "42 / 42", LastActivity: ago(1), ForceGeneration: 6},
			{Name: "apps-nginx", Namespace: "applications", GitRepo: "apps", Commit: "c2d9f7a", Health: "Healthy", State: "Ready", Targets: "18 / 18", LastActivity: ago(2), ForceGeneration: 3},
			{Name: "monitoring", Namespace: "observability", GitRepo: "observability", Commit: "a7b4e91", Health: "Healthy", State: "Ready", Targets: "27 / 27", LastActivity: ago(3), ForceGeneration: 8},
			{Name: "team-a-services", Namespace: "team-a", GitRepo: "team-a", Commit: "d1e2c3b", Health: "Out of sync", State: "OutOfSync", Targets: "9 / 11", LastActivity: ago(5), ForceGeneration: 4},
			{Name: "team-b-services", Namespace: "team-b", GitRepo: "team-b", Commit: "f6a8d10", Health: "Error", State: "ErrApplied", Targets: "3 / 8", LastActivity: ago(7), ForceGeneration: 11, Message: "Helm upgrade failed"},
			{Name: "security-policies", Namespace: "security", GitRepo: "security", Commit: "b9c0d4e", Health: "Healthy", State: "Ready", Targets: "14 / 14", LastActivity: ago(9), ForceGeneration: 2},
		},
		gitRepos: []GitRepoView{
			{Name: "platform-configs", Namespace: "platform", Repo: "git@github.com:acme/platform-configs.git", Branch: "main", SyncedCommit: "8f3a1b2", LatestActivity: ago(1), SyncState: "Current"},
			{Name: "apps", Namespace: "applications", Repo: "git@github.com:acme/apps.git", Branch: "main", SyncedCommit: "c2d9f7a", LatestActivity: ago(2), SyncState: "Current"},
			{Name: "observability", Namespace: "observability", Repo: "git@github.com:acme/observability.git", Branch: "main", SyncedCommit: "a7b4e91", LatestActivity: ago(3), SyncState: "Current"},
			{Name: "team-a", Namespace: "team-a", Repo: "git@github.com:acme/team-a.git", Branch: "main", SyncedCommit: "d1e2c3b", PendingCommit: "d8b2a41", LatestActivity: ago(5), SyncState: "Out of sync"},
			{Name: "team-b", Namespace: "team-b", Repo: "git@github.com:acme/team-b.git", Branch: "main", SyncedCommit: "f6a8d10", LatestActivity: ago(7), SyncState: "Failed", Message: "GitJob failed"},
		},
	}
}

func (d *DemoStore) listBundles() []BundleView {
	d.mu.RLock()
	defer d.mu.RUnlock()
	return append([]BundleView(nil), d.bundles...)
}

func (d *DemoStore) listGitRepos() []GitRepoView {
	d.mu.RLock()
	defer d.mu.RUnlock()
	return append([]GitRepoView(nil), d.gitRepos...)
}

func (d *DemoStore) bundleDetail(namespace, name string) (BundleDetailView, error) {
	d.mu.RLock()
	defer d.mu.RUnlock()
	for _, bundle := range d.bundles {
		if bundle.Namespace == namespace && bundle.Name == name {
			return BundleDetailView{
				BundleView: bundle,
				CreatedAt:  bundle.LastActivity,
				Summary: BundleSummaryView{
					Ready: 1, DesiredReady: 1,
				},
				Conditions: []BundleConditionView{{Type: "Ready", Status: "True", LastUpdated: bundle.LastActivity, Message: bundle.Message}},
			}, nil
		}
	}
	return BundleDetailView{}, errors.New("bundle not found")
}

func (d *DemoStore) gitRepoDetail(namespace, name string) (GitRepoDetailView, error) {
	d.mu.RLock()
	defer d.mu.RUnlock()
	for _, repo := range d.gitRepos {
		if repo.Namespace == namespace && repo.Name == name {
			return GitRepoDetailView{
				GitRepoView:            repo,
				Paths:                  []string{"."},
				PollingInterval:        "1m",
				GitJobStatus:           repo.SyncState,
				LastPollingTriggered:   repo.LatestActivity,
				CreatedAt:              repo.LatestActivity,
				ReadyBundleDeployments: "1 / 1",
				ResourceCounts:         GitRepoResourceSummary{Ready: 1, DesiredReady: 1},
				Conditions:             []BundleConditionView{{Type: "Ready", Status: "True", LastUpdated: repo.LatestActivity, Message: repo.Message}},
			}, nil
		}
	}
	return GitRepoDetailView{}, errors.New("Git repository not found")
}

func (d *DemoStore) reconcile(namespace, name string) (BundleView, int64, error) {
	d.mu.Lock()
	defer d.mu.Unlock()
	for index := range d.bundles {
		bundle := &d.bundles[index]
		if bundle.Namespace == namespace && bundle.Name == name {
			bundle.ForceGeneration++
			bundle.LastActivity = time.Now().UTC().Format(time.RFC3339)
			return *bundle, bundle.ForceGeneration, nil
		}
	}
	return BundleView{}, 0, errors.New("bundle not found")
}
