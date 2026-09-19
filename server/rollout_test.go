package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestRolloutOwnershipAndRevisionProjection(t *testing.T) {
	bundle := Bundle{Metadata: Metadata{Name: "api", Namespace: "prod", Generation: 12, UID: "bundle-uid", Labels: map[string]string{"fleet.cattle.io/repo-name": "platform"}}}
	bundle.Spec.ForceSyncGeneration = 4
	bundle.Status.ObservedGeneration = 12
	bundle.Status.Summary.DesiredReady = 1
	repo := GitRepo{Metadata: Metadata{Name: "platform", Namespace: "prod", Generation: 8, UID: "repo-uid"}}
	repo.Spec.ForceSyncGeneration = 4
	repo.Status.ObservedGeneration = 8
	otherBundle := bundle
	otherBundle.Metadata.Namespace = "dev"
	deployment := BundleDeployment{Metadata: Metadata{Name: "api", Namespace: "cluster-a", Labels: map[string]string{"fleet.cattle.io/bundle-name": "api", "fleet.cattle.io/bundle-namespace": "prod"}}}
	generation := int64(4)
	deployment.Spec.DeploymentID = "target"
	deployment.Spec.StagedDeploymentID = "staged"
	deployment.Spec.Options.ForceSyncGeneration = generation
	deployment.Status.AppliedDeploymentID = "previous"
	deployment.Status.SyncGeneration = &generation
	deployment.Status.Resources = []BundleDeploymentResource{{APIVersion: "apps/v1", Kind: "Deployment", Namespace: "app", Name: "api"}}
	wrongWorkspace := deployment
	wrongWorkspace.Metadata = Metadata{Name: "api", Namespace: "cluster-b", Labels: map[string]string{"fleet.cattle.io/bundle-name": "api", "fleet.cattle.io/bundle-namespace": "dev"}}
	missingOwner := deployment
	missingOwner.Metadata = Metadata{Name: "api", Namespace: "cluster-c"}
	cluster := Cluster{Metadata: Metadata{Name: "edge", Namespace: "prod", Labels: map[string]string{"region": "east"}}}
	cluster.Status.Namespace = "cluster-a"
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/apis/fleet.cattle.io/v1alpha1/namespaces/prod/bundles/api":
			writeJSON(w, 200, bundle)
		case "/apis/fleet.cattle.io/v1alpha1/namespaces/prod/gitrepos/platform":
			writeJSON(w, 200, repo)
		case "/apis/fleet.cattle.io/v1alpha1/bundles":
			writeJSON(w, 200, map[string]any{"items": []Bundle{bundle, otherBundle}})
		case "/apis/fleet.cattle.io/v1alpha1/bundledeployments":
			writeJSON(w, 200, map[string]any{"items": []BundleDeployment{deployment, wrongWorkspace, missingOwner}})
		case "/apis/fleet.cattle.io/v1alpha1/clusters":
			writeJSON(w, 200, map[string]any{"items": []Cluster{cluster}})
		case "/apis/fleet.cattle.io/v1alpha1/namespaces/cluster-a/bundledeployments/api":
			writeJSON(w, 200, deployment)
		default:
			t.Errorf("unexpected upstream path %s", r.URL.Path)
			http.NotFound(w, r)
		}
	}))
	defer upstream.Close()
	app := newApp(Config{FleetAPIBaseURL: upstream.URL, FleetAPIMode: "kubernetes"})
	handler := app.routes()
	for _, path := range []string{"/api/bundles/prod/api/rollout", "/api/gitrepos/prod/platform/rollout"} {
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, httptest.NewRequest(http.MethodGet, path, nil))
		if response.Code != 200 {
			t.Fatalf("%s: %d %s", path, response.Code, response.Body.String())
		}
		var result struct {
			Bundle     BundleDetailView       `json:"bundle"`
			Repository GitRepoDetailView      `json:"repository"`
			Bundles    []BundleDetailView     `json:"bundles"`
			Items      []BundleDeploymentView `json:"items"`
		}
		if err := json.Unmarshal(response.Body.Bytes(), &result); err != nil {
			t.Fatal(err)
		}
		if len(result.Items) != 1 {
			t.Fatalf("cross-workspace or unknown owner leaked into %s: %+v", path, result.Items)
		}
		d := result.Items[0]
		if d.Cluster != "prod/edge" || d.DeploymentID != "target" || d.AppliedDeploymentID != "previous" || d.StagedDeploymentID != "staged" || d.ForceGeneration != 4 || d.SyncGeneration == nil || *d.SyncGeneration != 4 {
			t.Fatalf("lost revision identity: %+v", d)
		}
		if result.Bundle.Name != "" && (result.Bundle.Generation != 12 || result.Bundle.UID != "bundle-uid") {
			t.Fatalf("missing bundle generation: %+v", result.Bundle)
		}
		if result.Repository.Name != "" && (result.Repository.Generation != 8 || result.Repository.ForceGeneration != 4 || result.Repository.UID != "repo-uid" || len(result.Bundles) != 1) {
			t.Fatalf("missing source identity: %+v", result)
		}
	}
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/api/bundledeployments/cluster-a/api/managed-objects", nil))
	var objects struct {
		Items       []ManagedObjectView `json:"items"`
		YAMLEnabled bool                `json:"yamlEnabled"`
	}
	if err := json.Unmarshal(response.Body.Bytes(), &objects); err != nil {
		t.Fatal(err)
	}
	if response.Code != 200 || len(objects.Items) != 1 || objects.Items[0].DeploymentNamespace != "cluster-a" || objects.YAMLEnabled {
		t.Fatalf("unexpected scoped resources: %s", response.Body.String())
	}
	if clusterView(cluster).Labels["region"] != "east" {
		t.Fatal("matrix labels missing")
	}
}
