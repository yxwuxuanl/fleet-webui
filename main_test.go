package main

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"
	"time"

	"k8s.io/client-go/tools/clientcmd"
	clientcmdapi "k8s.io/client-go/tools/clientcmd/api"
)

func TestAPIListsAndReconcilesBundle(t *testing.T) {
	updatedAt := time.Now().UTC()
	sourceBundle := Bundle{Metadata: Metadata{
		Name:              "platform-base",
		Namespace:         "platform",
		ResourceVersion:   "7",
		CreationTimestamp: updatedAt.Add(-time.Hour),
		Labels: map[string]string{
			"fleet.cattle.io/repo-name": "platform-configs",
			"fleet.cattle.io/commit":    "8f3a1b2",
		},
	}}
	sourceBundle.Spec.ForceSyncGeneration = 6
	sourceBundle.Status.Display.State = "Ready"
	sourceBundle.Status.Display.ReadyClusters = "1 / 1"
	sourceBundle.Status.Summary.Ready = 1
	sourceBundle.Status.Summary.DesiredReady = 1
	sourceBundle.Status.Conditions = []Condition{{Type: "Ready", Status: "True", LastUpdateTime: &updatedAt}}

	gitRepo := GitRepo{Metadata: Metadata{
		Name:              "platform-configs",
		Namespace:         "platform",
		ResourceVersion:   "8",
		CreationTimestamp: updatedAt.Add(-time.Hour),
	}}
	gitRepo.Spec.Repo = "https://github.com/acme/platform-configs.git"
	gitRepo.Spec.Branch = "main"
	gitRepo.Status.Commit = "8f3a1b2"
	gitRepo.Status.Display.State = "Current"
	gitRepo.Status.Display.ReadyBundleDeployments = "1 / 1"
	gitRepo.Status.ResourceCounts.Ready = 1
	gitRepo.Status.ResourceCounts.DesiredReady = 1
	gitRepo.Status.Conditions = []Condition{{Type: "Ready", Status: "True", LastUpdateTime: &updatedAt}}

	fleetAPI := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.Method + " " + r.URL.Path {
		case http.MethodGet + " /apis/fleet.cattle.io/v1alpha1/bundles":
			writeJSON(w, http.StatusOK, map[string]any{"items": []Bundle{sourceBundle}})
		case http.MethodGet + " /apis/fleet.cattle.io/v1alpha1/gitrepos":
			writeJSON(w, http.StatusOK, map[string]any{"items": []GitRepo{gitRepo}})
		case http.MethodGet + " /apis/fleet.cattle.io/v1alpha1/namespaces/platform/bundles/platform-base":
			writeJSON(w, http.StatusOK, sourceBundle)
		case http.MethodPatch + " /apis/fleet.cattle.io/v1alpha1/namespaces/platform/bundles/platform-base":
			var patch struct {
				Metadata struct {
					ResourceVersion string `json:"resourceVersion"`
				} `json:"metadata"`
				Spec struct {
					ForceSyncGeneration int64 `json:"forceSyncGeneration"`
				} `json:"spec"`
			}
			if err := json.NewDecoder(r.Body).Decode(&patch); err != nil {
				t.Errorf("decode reconcile patch: %v", err)
			}
			if patch.Metadata.ResourceVersion != sourceBundle.Metadata.ResourceVersion || patch.Spec.ForceSyncGeneration != sourceBundle.Spec.ForceSyncGeneration+1 {
				t.Errorf("unexpected reconcile patch: %#v", patch)
			}
			writeJSON(w, http.StatusOK, sourceBundle)
		case http.MethodGet + " /apis/fleet.cattle.io/v1alpha1/namespaces/platform/gitrepos/platform-configs":
			writeJSON(w, http.StatusOK, gitRepo)
		default:
			t.Errorf("unexpected Fleet API request: %s %s", r.Method, r.URL.Path)
			http.NotFound(w, r)
		}
	}))
	defer fleetAPI.Close()

	app := newApp(Config{FleetAPIBaseURL: fleetAPI.URL, FleetAPIMode: "kubernetes", FleetSkipTLS: true, RequestTimeout: time.Second})
	server := httptest.NewServer(app.routes())
	defer server.Close()

	response, err := http.Get(server.URL + "/api/bundles")
	if err != nil {
		t.Fatalf("list bundles: %v", err)
	}
	defer response.Body.Close()
	if got := response.Header.Get("X-Content-Type-Options"); got != "nosniff" {
		t.Fatalf("security header = %q, want nosniff", got)
	}
	var before struct {
		Items []BundleView `json:"items"`
	}
	if err := json.NewDecoder(response.Body).Decode(&before); err != nil {
		t.Fatalf("decode bundles: %v", err)
	}
	if len(before.Items) == 0 {
		t.Fatal("expected bundles from the Fleet API")
	}

	gitReposResponse, err := http.Get(server.URL + "/api/gitrepos")
	if err != nil {
		t.Fatalf("list Git repositories: %v", err)
	}
	defer gitReposResponse.Body.Close()
	var gitRepos struct {
		Items []GitRepoView `json:"items"`
	}
	if err := json.NewDecoder(gitReposResponse.Body).Decode(&gitRepos); err != nil {
		t.Fatalf("decode Git repositories: %v", err)
	}
	if len(gitRepos.Items) == 0 {
		t.Fatal("expected Git repositories from the Fleet API")
	}
	repo := gitRepos.Items[0]
	gitRepoDetailResponse, err := http.Get(server.URL + "/api/gitrepos/" + repo.Namespace + "/" + repo.Name)
	if err != nil {
		t.Fatalf("get Git repository detail: %v", err)
	}
	defer gitRepoDetailResponse.Body.Close()
	if gitRepoDetailResponse.StatusCode != http.StatusOK {
		t.Fatalf("Git repository detail status = %d, want %d", gitRepoDetailResponse.StatusCode, http.StatusOK)
	}
	var gitRepoDetail GitRepoDetailView
	if err := json.NewDecoder(gitRepoDetailResponse.Body).Decode(&gitRepoDetail); err != nil {
		t.Fatalf("decode Git repository detail: %v", err)
	}
	if gitRepoDetail.Name != repo.Name || gitRepoDetail.Namespace != repo.Namespace || len(gitRepoDetail.Conditions) == 0 {
		t.Fatalf("unexpected Git repository detail: %#v", gitRepoDetail)
	}

	bundle := before.Items[0]
	detailResponse, err := http.Get(server.URL + "/api/bundles/" + bundle.Namespace + "/" + bundle.Name)
	if err != nil {
		t.Fatalf("get bundle detail: %v", err)
	}
	defer detailResponse.Body.Close()
	if detailResponse.StatusCode != http.StatusOK {
		t.Fatalf("detail status = %d, want %d", detailResponse.StatusCode, http.StatusOK)
	}
	var detail BundleDetailView
	if err := json.NewDecoder(detailResponse.Body).Decode(&detail); err != nil {
		t.Fatalf("decode bundle detail: %v", err)
	}
	if detail.Name != bundle.Name || detail.Namespace != bundle.Namespace || len(detail.Conditions) == 0 {
		t.Fatalf("unexpected detail: %#v", detail)
	}

	request, err := http.NewRequest(http.MethodPost, server.URL+"/api/bundles/"+bundle.Namespace+"/"+bundle.Name+"/reconcile", nil)
	if err != nil {
		t.Fatalf("create reconcile request: %v", err)
	}
	response, err = http.DefaultClient.Do(request)
	if err != nil {
		t.Fatalf("reconcile bundle: %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusAccepted {
		t.Fatalf("reconcile status = %d, want %d", response.StatusCode, http.StatusAccepted)
	}
	var result struct {
		Bundle       BundleView `json:"bundle"`
		Generation   int64      `json:"generation"`
		Notification string     `json:"notification"`
	}
	if err := json.NewDecoder(response.Body).Decode(&result); err != nil {
		t.Fatalf("decode reconcile result: %v", err)
	}
	if result.Generation != bundle.ForceGeneration+1 {
		t.Fatalf("generation = %d, want %d", result.Generation, bundle.ForceGeneration+1)
	}
	if result.Notification != "not-configured" {
		t.Fatalf("notification = %q, want not-configured", result.Notification)
	}
}

func TestNotifyReconcileSendsNtfyPayload(t *testing.T) {
	var received ntfyMessage
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if got := r.Header.Get("Authorization"); got != "Bearer secret" {
			t.Errorf("authorization = %q", got)
		}
		if err := json.NewDecoder(r.Body).Decode(&received); err != nil {
			t.Errorf("decode ntfy payload: %v", err)
		}
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	app := newApp(Config{
		NtfyBaseURL:    server.URL,
		NtfyTopic:      "fleet-alerts",
		NtfyToken:      "secret",
		RequestTimeout: time.Second,
	})
	bundle := BundleView{Namespace: "platform", Name: "base", GitRepo: "platform-configs", Commit: "abc123"}
	if err := app.notifyReconcile(context.Background(), bundle, 12, "tester"); err != nil {
		t.Fatalf("notify reconcile: %v", err)
	}
	if received.Topic != "fleet-alerts" || received.Title != "[Fleet] Bundle reconcile triggered" {
		t.Fatalf("unexpected ntfy payload: %#v", received)
	}
	if received.SequenceID != "reconcile-platform-base-12" {
		t.Fatalf("sequence ID = %q", received.SequenceID)
	}
}

func TestKubeconfigConnectionUsesKubernetesAPI(t *testing.T) {
	t.Setenv("KUBERNETES_SERVICE_HOST", "")
	t.Setenv("KUBERNETES_SERVICE_PORT", "")
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if got, want := r.URL.Path, "/apis/fleet.cattle.io/v1alpha1/bundles"; got != want {
			t.Errorf("path = %q, want %q", got, want)
		}
		if got := r.Header.Get("Authorization"); got != "Bearer kubeconfig-token" {
			t.Errorf("authorization = %q", got)
		}
		_, _ = w.Write([]byte(`{"items":[]}`))
	}))
	defer server.Close()

	kubeconfigPath := filepath.Join(t.TempDir(), "config")
	kubeconfig := clientcmdapi.Config{
		CurrentContext: "fleet",
		Clusters: map[string]*clientcmdapi.Cluster{
			"fleet": {Server: server.URL, InsecureSkipTLSVerify: true},
		},
		AuthInfos: map[string]*clientcmdapi.AuthInfo{
			"fleet": {Token: "kubeconfig-token"},
		},
		Contexts: map[string]*clientcmdapi.Context{
			"fleet": {Cluster: "fleet", AuthInfo: "fleet"},
		},
	}
	if err := clientcmd.WriteToFile(kubeconfig, kubeconfigPath); err != nil {
		t.Fatalf("write kubeconfig: %v", err)
	}

	client := newFleetClient(Config{KubeconfigPath: kubeconfigPath, RequestTimeout: time.Second})
	if err := client.ready(); err != nil {
		t.Fatalf("initialize kubeconfig client: %v", err)
	}
	if client.apiMode != "kubernetes" || client.connectionMode != "kubeconfig" {
		t.Fatalf("unexpected client mode: api=%q connection=%q", client.apiMode, client.connectionMode)
	}
	if _, err := client.listBundles(context.Background()); err != nil {
		t.Fatalf("list bundles through kubeconfig: %v", err)
	}
}

func TestResolveConnectionModeDetectsInClusterBeforeKubeconfig(t *testing.T) {
	t.Setenv("KUBERNETES_SERVICE_HOST", "10.43.0.1")
	t.Setenv("KUBERNETES_SERVICE_PORT", "443")
	t.Setenv("KUBECONFIG", "/tmp/ignored-when-in-cluster")

	if got := resolveConnectionMode(Config{}); got != "in-cluster" {
		t.Fatalf("connection mode = %q, want in-cluster", got)
	}
}

func TestBundleViewDerivesReadyFromSummary(t *testing.T) {
	var bundle Bundle
	bundle.Metadata.Name = "example"
	bundle.Metadata.Namespace = "fleet-local"
	bundle.Status.Summary.Ready = 1
	bundle.Status.Summary.DesiredReady = 1

	view := bundleView(bundle)
	if view.State != "Ready" || view.Health != "Healthy" {
		t.Fatalf("bundle view = %#v, want ready and healthy", view)
	}
}
