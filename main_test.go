package main

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"path/filepath"
	"sync/atomic"
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

	cluster := Cluster{Metadata: Metadata{
		Name:              "edge-a",
		Namespace:         "platform",
		ResourceVersion:   "9",
		CreationTimestamp: updatedAt.Add(-2 * time.Hour),
		Labels:            map[string]string{"region": "eu-west"},
	}}
	cluster.Spec.ClientID = "edge-a-client"
	cluster.Status.Namespace = "cluster-platform-edge-a-12ab"
	cluster.Status.Display.State = "Ready"
	cluster.Status.Display.ReadyBundles = "1 / 1"
	cluster.Status.Agent.LastSeen = updatedAt
	cluster.Status.Agent.Namespace = "cattle-fleet-system"
	cluster.Status.Conditions = []Condition{{Type: "Ready", Status: "True", LastUpdateTime: &updatedAt}}

	syncGeneration := int64(3)
	bundleDeployment := BundleDeployment{Metadata: Metadata{
		Name:              "platform-base",
		Namespace:         cluster.Status.Namespace,
		ResourceVersion:   "10",
		CreationTimestamp: updatedAt.Add(-30 * time.Minute),
		Labels: map[string]string{
			"fleet.cattle.io/bundle-name":      "platform-base",
			"fleet.cattle.io/bundle-namespace": "platform",
		},
	}}
	bundleDeployment.Spec.DeploymentID = "deployment-3"
	bundleDeployment.Status.AppliedDeploymentID = "deployment-3"
	bundleDeployment.Status.Ready = true
	bundleDeployment.Status.NonModified = true
	bundleDeployment.Status.Display.State = "Ready"
	bundleDeployment.Status.Display.Deployed = "True"
	bundleDeployment.Status.Display.Monitored = "True"
	bundleDeployment.Status.SyncGeneration = &syncGeneration
	bundleDeployment.Status.ResourceCounts.Ready = 4
	bundleDeployment.Status.ResourceCounts.DesiredReady = 4
	bundleDeployment.Status.Conditions = []Condition{{Type: "Ready", Status: "True", LastUpdateTime: &updatedAt}}

	fleetAPI := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.Method + " " + r.URL.Path {
		case http.MethodGet + " /apis/fleet.cattle.io/v1alpha1/bundles":
			writeJSON(w, http.StatusOK, map[string]any{"items": []Bundle{sourceBundle}})
		case http.MethodGet + " /apis/fleet.cattle.io/v1alpha1/gitrepos":
			writeJSON(w, http.StatusOK, map[string]any{"items": []GitRepo{gitRepo}})
		case http.MethodGet + " /apis/fleet.cattle.io/v1alpha1/clusters":
			writeJSON(w, http.StatusOK, map[string]any{"items": []Cluster{cluster}})
		case http.MethodGet + " /apis/fleet.cattle.io/v1alpha1/bundledeployments":
			writeJSON(w, http.StatusOK, map[string]any{"items": []BundleDeployment{bundleDeployment}})
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
		case http.MethodGet + " /apis/fleet.cattle.io/v1alpha1/namespaces/platform/clusters/edge-a":
			writeJSON(w, http.StatusOK, cluster)
		case http.MethodGet + " /apis/fleet.cattle.io/v1alpha1/namespaces/cluster-platform-edge-a-12ab/bundledeployments/platform-base":
			writeJSON(w, http.StatusOK, bundleDeployment)
		default:
			t.Errorf("unexpected Fleet API request: %s %s", r.Method, r.URL.Path)
			http.NotFound(w, r)
		}
	}))
	defer fleetAPI.Close()

	app := newApp(Config{
		FleetAPIBaseURL:    fleetAPI.URL,
		FleetAPIMode:       "kubernetes",
		FleetSkipTLS:       true,
		ReconcileAuthToken: "reconcile-secret",
		RequestTimeout:     time.Second,
	})
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

	clustersResponse, err := http.Get(server.URL + "/api/clusters")
	if err != nil {
		t.Fatalf("list clusters: %v", err)
	}
	defer clustersResponse.Body.Close()
	var clusters struct {
		Items []ClusterView `json:"items"`
	}
	if err := json.NewDecoder(clustersResponse.Body).Decode(&clusters); err != nil {
		t.Fatalf("decode clusters: %v", err)
	}
	if len(clusters.Items) != 1 || clusters.Items[0].ReadyBundles != "1 / 1" {
		t.Fatalf("unexpected clusters: %#v", clusters.Items)
	}
	clusterDetailResponse, err := http.Get(server.URL + "/api/clusters/platform/edge-a")
	if err != nil {
		t.Fatalf("get cluster detail: %v", err)
	}
	defer clusterDetailResponse.Body.Close()
	var clusterDetail ClusterDetailView
	if err := json.NewDecoder(clusterDetailResponse.Body).Decode(&clusterDetail); err != nil {
		t.Fatalf("decode cluster detail: %v", err)
	}
	if clusterDetail.ClientID != "edge-a-client" || len(clusterDetail.Conditions) != 1 {
		t.Fatalf("unexpected cluster detail: %#v", clusterDetail)
	}

	deploymentsResponse, err := http.Get(server.URL + "/api/bundledeployments")
	if err != nil {
		t.Fatalf("list BundleDeployments: %v", err)
	}
	defer deploymentsResponse.Body.Close()
	var deployments struct {
		Items []BundleDeploymentView `json:"items"`
	}
	if err := json.NewDecoder(deploymentsResponse.Body).Decode(&deployments); err != nil {
		t.Fatalf("decode BundleDeployments: %v", err)
	}
	if len(deployments.Items) != 1 || deployments.Items[0].Cluster != "platform/edge-a" {
		t.Fatalf("unexpected BundleDeployments: %#v", deployments.Items)
	}
	deploymentDetailResponse, err := http.Get(server.URL + "/api/bundledeployments/cluster-platform-edge-a-12ab/platform-base")
	if err != nil {
		t.Fatalf("get BundleDeployment detail: %v", err)
	}
	defer deploymentDetailResponse.Body.Close()
	var deploymentDetail BundleDeploymentDetailView
	if err := json.NewDecoder(deploymentDetailResponse.Body).Decode(&deploymentDetail); err != nil {
		t.Fatalf("decode BundleDeployment detail: %v", err)
	}
	if deploymentDetail.AppliedDeploymentID != "deployment-3" || deploymentDetail.ResourceCounts.Ready != 4 {
		t.Fatalf("unexpected BundleDeployment detail: %#v", deploymentDetail)
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

	unauthorized, err := http.NewRequest(http.MethodPost, server.URL+"/api/bundles/"+bundle.Namespace+"/"+bundle.Name+"/reconcile", nil)
	if err != nil {
		t.Fatalf("create unauthorized reconcile request: %v", err)
	}
	unauthorizedResponse, err := http.DefaultClient.Do(unauthorized)
	if err != nil {
		t.Fatalf("send unauthorized reconcile request: %v", err)
	}
	defer unauthorizedResponse.Body.Close()
	if unauthorizedResponse.StatusCode != http.StatusUnauthorized || unauthorizedResponse.Header.Get("WWW-Authenticate") == "" {
		t.Fatalf("unauthorized reconcile status = %d, authenticate = %q", unauthorizedResponse.StatusCode, unauthorizedResponse.Header.Get("WWW-Authenticate"))
	}

	request, err := http.NewRequest(http.MethodPost, server.URL+"/api/bundles/"+bundle.Namespace+"/"+bundle.Name+"/reconcile", nil)
	if err != nil {
		t.Fatalf("create reconcile request: %v", err)
	}
	request.Header.Set("Authorization", "Bearer reconcile-secret")
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
		AppBaseURL:     "https://fleet.example.com/console?source=ntfy",
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
	click, err := url.Parse(received.Click)
	if err != nil {
		t.Fatalf("parse ntfy click URL: %v", err)
	}
	if click.Path != "/console" || click.Query().Get("source") != "ntfy" || click.Query().Get("bundle") != "platform/base" {
		t.Fatalf("unexpected ntfy click URL: %q", received.Click)
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

func TestReconcileIsReadOnlyWithoutServerToken(t *testing.T) {
	app := newApp(Config{})

	healthRecorder := httptest.NewRecorder()
	app.routes().ServeHTTP(healthRecorder, httptest.NewRequest(http.MethodGet, "/api/health", nil))
	var health struct {
		ReconcileEnabled bool `json:"reconcileEnabled"`
	}
	if err := json.NewDecoder(healthRecorder.Body).Decode(&health); err != nil {
		t.Fatalf("decode health: %v", err)
	}
	if health.ReconcileEnabled {
		t.Fatal("reconcile should be disabled without RECONCILE_AUTH_TOKEN")
	}

	reconcileRecorder := httptest.NewRecorder()
	app.routes().ServeHTTP(reconcileRecorder, httptest.NewRequest(http.MethodPost, "/api/bundles/fleet-local/example/reconcile", nil))
	if reconcileRecorder.Code != http.StatusServiceUnavailable {
		t.Fatalf("reconcile status = %d, want %d", reconcileRecorder.Code, http.StatusServiceUnavailable)
	}
}

func TestBundleStateUsesFleetPriority(t *testing.T) {
	var bundle Bundle
	bundle.Status.Summary.NotReady = 1
	bundle.Status.Summary.Pending = 1
	bundle.Status.Summary.OutOfSync = 1
	bundle.Status.Summary.Modified = 1
	bundle.Status.Summary.WaitApplied = 1
	if got := bundleState(bundle); got != "WaitApplied" {
		t.Fatalf("state = %q, want WaitApplied", got)
	}
	bundle.Status.Summary.ErrApplied = 1
	if got := bundleState(bundle); got != "ErrApplied" {
		t.Fatalf("state = %q, want ErrApplied", got)
	}
}

func TestGitRepoViewPrefersDisplayState(t *testing.T) {
	var repo GitRepo
	repo.Metadata.Name = "platform"
	repo.Status.Display.State = "Ready"
	repo.Status.GitJobStatus = "GitUpdating"
	repo.Status.Commit = "abc1234"

	if got := gitRepoView(repo).SyncState; got != "Ready" {
		t.Fatalf("sync state = %q, want display state Ready", got)
	}
	repo.Status.PollingCommit = "def5678"
	if got := gitRepoView(repo).SyncState; got != "Out of sync" {
		t.Fatalf("sync state with pending commit = %q, want Out of sync", got)
	}
}

func TestFleetListsAllPagesAndCachesResults(t *testing.T) {
	tests := []struct {
		name     string
		apiMode  string
		path     string
		useSteve bool
	}{
		{name: "Kubernetes", apiMode: "kubernetes", path: "/apis/fleet.cattle.io/v1alpha1/bundles"},
		{name: "Steve", apiMode: "steve", path: "/v1/fleet.cattle.io.bundles", useSteve: true},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			var calls atomic.Int32
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				call := calls.Add(1)
				if r.URL.Path != test.path {
					t.Errorf("path = %q, want %q", r.URL.Path, test.path)
				}
				if got := r.URL.Query().Get("limit"); got != "1" {
					t.Errorf("limit = %q, want 1", got)
				}
				if call == 1 {
					if r.URL.Query().Get("continue") != "" {
						t.Errorf("first request unexpectedly had a continue token")
					}
					bundle := Bundle{Metadata: Metadata{Name: "first"}}
					if test.useSteve {
						writeJSON(w, http.StatusOK, map[string]any{"data": []Bundle{bundle}, "continue": "next-token"})
					} else {
						writeJSON(w, http.StatusOK, map[string]any{"items": []Bundle{bundle}, "metadata": map[string]string{"continue": "next-token"}})
					}
					return
				}
				if got := r.URL.Query().Get("continue"); got != "next-token" {
					t.Errorf("continue = %q, want next-token", got)
				}
				bundle := Bundle{Metadata: Metadata{Name: "second"}}
				if test.useSteve {
					writeJSON(w, http.StatusOK, map[string]any{"data": []Bundle{bundle}})
				} else {
					writeJSON(w, http.StatusOK, map[string]any{"items": []Bundle{bundle}})
				}
			}))
			defer server.Close()

			client := newFleetClient(Config{
				FleetAPIBaseURL: server.URL,
				FleetAPIMode:    test.apiMode,
				FleetPageSize:   1,
				FleetCacheTTL:   time.Minute,
				RequestTimeout:  time.Second,
			})
			for attempt := 0; attempt < 2; attempt++ {
				items, err := client.listBundles(context.Background())
				if err != nil {
					t.Fatalf("list bundles: %v", err)
				}
				if len(items) != 2 || items[0].Metadata.Name != "first" || items[1].Metadata.Name != "second" {
					t.Fatalf("unexpected paginated items: %#v", items)
				}
			}
			if got := calls.Load(); got != 2 {
				t.Fatalf("Fleet API calls = %d, want 2 pages fetched once", got)
			}
		})
	}
}

func TestFleetSkipTLSOverridesKubeconfigCA(t *testing.T) {
	t.Setenv("KUBERNETES_SERVICE_HOST", "")
	t.Setenv("KUBERNETES_SERVICE_PORT", "")
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]any{"items": []Bundle{}})
	}))
	defer server.Close()

	kubeconfigPath := filepath.Join(t.TempDir(), "config")
	kubeconfig := clientcmdapi.Config{
		CurrentContext: "fleet",
		Clusters: map[string]*clientcmdapi.Cluster{
			"fleet": {Server: server.URL, CertificateAuthorityData: []byte("not-a-valid-ca")},
		},
		AuthInfos: map[string]*clientcmdapi.AuthInfo{"fleet": {}},
		Contexts: map[string]*clientcmdapi.Context{
			"fleet": {Cluster: "fleet", AuthInfo: "fleet"},
		},
	}
	if err := clientcmd.WriteToFile(kubeconfig, kubeconfigPath); err != nil {
		t.Fatalf("write kubeconfig: %v", err)
	}

	client := newFleetClient(Config{KubeconfigPath: kubeconfigPath, FleetSkipTLS: true, RequestTimeout: time.Second})
	if err := client.ready(); err != nil {
		t.Fatalf("initialize client with skip TLS: %v", err)
	}
	if _, err := client.listBundles(context.Background()); err != nil {
		t.Fatalf("list bundles with skip TLS: %v", err)
	}
}
