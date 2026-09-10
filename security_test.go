package main

import (
	"context"
	"net/http"
	"net/http/httptest"
	"regexp"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"k8s.io/apimachinery/pkg/labels"
)

func TestCrossSiteWritesAreRejected(t *testing.T) {
	var patches atomic.Int32
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == "PATCH" {
			patches.Add(1)
		}
		writeJSON(w, 200, map[string]any{"metadata": map[string]any{"name": "demo", "namespace": "ns", "resourceVersion": "1"}, "spec": map[string]any{"forceSyncGeneration": 1}})
	}))
	defer upstream.Close()
	app := newApp(Config{FleetAPIBaseURL: upstream.URL, FleetAPIMode: "kubernetes", RequestTimeout: time.Second, ReconcileEnabled: true, GitRepoActionsEnabled: true})
	for _, endpoint := range []string{"/api/bundles/ns/demo/reconcile", "/api/gitrepos/ns/demo/sync", "/api/gitrepos/ns/demo/revision"} {
		t.Run(endpoint, func(t *testing.T) {
			req := httptest.NewRequest("POST", "http://console.example"+endpoint, strings.NewReader(`{"revision":""}`))
			req.Header.Set("Origin", "https://untrusted.example")
			req.Header.Set("Sec-Fetch-Site", "cross-site")
			req.Header.Set("Content-Type", "text/plain")
			response := httptest.NewRecorder()
			app.routes().ServeHTTP(response, req)
			if response.Code != http.StatusForbidden {
				t.Errorf("cross-site write accepted: HTTP %d; upstream patches=%d", response.Code, patches.Load())
			}
		})
	}
	if patches.Load() != 0 {
		t.Fatalf("blocked requests wrote to upstream: %d", patches.Load())
	}
}

func diagnosticTestServer(t *testing.T, podQuery *string) *httptest.Server {
	t.Helper()
	resource := BundleDeploymentResource{APIVersion: "apps/v1", Kind: "Deployment", Namespace: "ns", Name: "app"}
	dep := BundleDeployment{Metadata: Metadata{Name: "bundle", Namespace: "deployments", Labels: map[string]string{"fleet.cattle.io/cluster": "remote", "fleet.cattle.io/cluster-namespace": "fleet"}}}
	dep.Status.Resources = []BundleDeploymentResource{resource}
	cluster := Cluster{Metadata: Metadata{Name: "remote", Namespace: "fleet"}}
	cluster.Spec.KubeConfigSecret = "remote-credentials"
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/apis/fleet.cattle.io/v1alpha1/namespaces/deployments/bundledeployments/bundle":
			writeJSON(w, 200, dep)
		case "/apis/fleet.cattle.io/v1alpha1/namespaces/fleet/clusters/remote":
			writeJSON(w, 200, cluster)
		case "/apis/apps/v1":
			writeJSON(w, 200, map[string]any{"resources": []any{map[string]any{"name": "deployments", "kind": "Deployment", "namespaced": true}}})
		case "/apis/apps/v1/namespaces/ns/deployments/app":
			writeJSON(w, 200, map[string]any{"apiVersion": "apps/v1", "kind": "Deployment", "metadata": map[string]any{"name": "app", "namespace": "ns", "labels": map[string]string{"source": "management-cluster"}}, "spec": map[string]any{"selector": map[string]any{"matchLabels": map[string]string{"app": "shared"}, "matchExpressions": []any{map[string]any{"key": "tier", "operator": "In", "values": []string{"frontend"}}}}}})
		case "/api/v1/namespaces/ns/pods":
			if podQuery != nil {
				*podQuery = r.URL.Query().Get("labelSelector")
			}
			writeJSON(w, 200, map[string]any{"items": []any{map[string]any{"metadata": map[string]any{"name": "backend-pod", "namespace": "ns", "labels": map[string]string{"app": "shared", "tier": "backend"}}, "spec": map[string]any{"containers": []any{map[string]any{"name": "main"}}}}}})
		case "/api/v1/namespaces/ns/pods/backend-pod/log":
			_, _ = w.Write([]byte("management-cluster backend log"))
		default:
			http.NotFound(w, r)
		}
	}))
}

func TestDisabledDiagnosticsBlocksLogs(t *testing.T) {
	upstream := diagnosticTestServer(t, nil)
	defer upstream.Close()
	app := newApp(Config{FleetAPIBaseURL: upstream.URL, FleetAPIMode: "kubernetes", RequestTimeout: time.Second, ManagedObjectsEnabled: false})
	req := httptest.NewRequest("GET", "/api/bundledeployments/deployments/bundle/managed-object/logs?apiVersion=apps%2Fv1&kind=Deployment&namespace=ns&name=app&pod=backend-pod&container=main", nil)
	res := httptest.NewRecorder()
	app.routes().ServeHTTP(res, req)
	if res.Code != http.StatusServiceUnavailable {
		t.Fatalf("disabled diagnostics status=%d: %s", res.Code, res.Body.String())
	}
}

func TestRemoteClusterDoesNotFallBackToManagement(t *testing.T) {
	upstream := diagnosticTestServer(t, nil)
	defer upstream.Close()
	client := newFleetClient(Config{FleetAPIBaseURL: upstream.URL, FleetAPIMode: "kubernetes", RequestTimeout: time.Second, ManagedObjectsEnabled: true, ManagedObjectsKubeconfigs: false})
	cluster := Cluster{}
	cluster.Spec.KubeConfigSecret = "remote-credentials"
	text, _, err := client.managedObjectYAML(context.Background(), cluster, BundleDeploymentResource{APIVersion: "apps/v1", Kind: "Deployment", Namespace: "ns", Name: "app"})
	if err == nil {
		t.Fatalf("remote resource incorrectly returned management-cluster YAML: %s", text)
	}
}

func TestPodSelectorRetainsExpressions(t *testing.T) {
	var query string
	upstream := diagnosticTestServer(t, &query)
	defer upstream.Close()
	client := &kubeObjectClient{http: upstream.Client(), baseURL: upstream.URL}
	resource := BundleDeploymentResource{APIVersion: "apps/v1", Kind: "Deployment", Namespace: "ns", Name: "app"}
	object, err := client.get(context.Background(), resource)
	if err != nil {
		t.Fatal(err)
	}
	pods := client.pods(context.Background(), resource, object)
	if !strings.Contains(query, "tier") || len(pods) != 0 {
		t.Fatalf("matchExpressions omitted from selector %q; unrelated pod returned: %+v", query, pods)
	}
}

func TestDocumentedReadOnlyModeBlocksGitWrites(t *testing.T) {
	t.Setenv("RECONCILE_ENABLED", "false")
	t.Setenv("GIT_REPO_ACTIONS_ENABLED", "false")
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, 200, map[string]any{"metadata": map[string]any{"name": "demo", "namespace": "ns", "resourceVersion": "1"}})
	}))
	defer upstream.Close()
	cfg := loadConfig()
	cfg.FleetAPIBaseURL = upstream.URL
	cfg.FleetAPIMode = "kubernetes"
	app := newApp(cfg)
	res := httptest.NewRecorder()
	app.routes().ServeHTTP(res, httptest.NewRequest("POST", "/api/gitrepos/ns/demo/sync", nil))
	if res.Code != http.StatusServiceUnavailable {
		t.Fatalf("read-only GitRepo sync status: HTTP %d", res.Code)
	}
}

func TestCrossOriginProtectionAllowsLegitimateRequests(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, 200, map[string]any{"metadata": map[string]string{"name": "demo", "namespace": "ns", "resourceVersion": "1"}})
	}))
	defer upstream.Close()
	app := newApp(Config{FleetAPIBaseURL: upstream.URL, FleetAPIMode: "kubernetes", RequestTimeout: time.Second, ReconcileEnabled: true})
	cases := []struct {
		name, origin, site string
		want               int
	}{
		{"same origin", "https://console.example", "same-origin", 202},
		{"older browser same origin", "https://console.example", "", 202},
		{"CLI without browser headers", "", "", 202},
		{"older browser cross origin", "https://untrusted.example", "", 403},
		{"opaque origin", "null", "", 403},
		{"same site subdomain", "https://untrusted.console.example", "same-site", 403},
	}
	for _, test := range cases {
		t.Run(test.name, func(t *testing.T) {
			req := httptest.NewRequest("POST", "https://console.example/api/bundles/ns/demo/reconcile", nil)
			if test.origin != "" {
				req.Header.Set("Origin", test.origin)
			}
			if test.site != "" {
				req.Header.Set("Sec-Fetch-Site", test.site)
			}
			res := httptest.NewRecorder()
			app.routes().ServeHTTP(res, req)
			if res.Code != test.want {
				t.Fatalf("status=%d, want %d: %s", res.Code, test.want, res.Body.String())
			}
		})
	}
}

func TestDisabledLogsDoNotContactUpstream(t *testing.T) {
	var calls atomic.Int32
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { calls.Add(1); http.Error(w, "must not be called", 500) }))
	defer upstream.Close()
	app := newApp(Config{FleetAPIBaseURL: upstream.URL, FleetAPIMode: "kubernetes", ManagedObjectsEnabled: false})
	res := httptest.NewRecorder()
	app.routes().ServeHTTP(res, httptest.NewRequest("GET", "/api/bundledeployments/ns/demo/managed-object/logs", nil))
	if res.Code != 503 || calls.Load() != 0 {
		t.Fatalf("status=%d upstream calls=%d", res.Code, calls.Load())
	}
}

func TestWorkloadSelectorExpressions(t *testing.T) {
	tests := []struct {
		name, operator    string
		values            []string
		matches, excluded map[string]string
	}{
		{"in", "In", []string{"frontend"}, map[string]string{"tier": "frontend"}, map[string]string{"tier": "backend"}},
		{"not in", "NotIn", []string{"backend"}, map[string]string{"tier": "frontend"}, map[string]string{"tier": "backend"}},
		{"exists", "Exists", nil, map[string]string{"tier": "frontend"}, map[string]string{}},
		{"does not exist", "DoesNotExist", nil, map[string]string{}, map[string]string{"tier": "frontend"}},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			obj := map[string]any{"spec": map[string]any{"selector": map[string]any{"matchExpressions": []any{map[string]any{"key": "tier", "operator": test.operator, "values": test.values}}}}}
			selector, err := workloadSelector(obj)
			if err != nil {
				t.Fatal(err)
			}
			if selector.Empty() || !selector.Matches(labels.Set(test.matches)) || selector.Matches(labels.Set(test.excluded)) {
				t.Fatalf("incorrect selector %s", selector)
			}
		})
	}
	invalid := map[string]any{"spec": map[string]any{"selector": map[string]any{"matchExpressions": []any{map[string]any{"key": "tier", "operator": "Invalid"}}}}}
	if _, err := workloadSelector(invalid); err == nil {
		t.Fatal("invalid selector accepted")
	}
}

func TestEmbeddedFrontendAndAssets(t *testing.T) {
	app := newApp(Config{FleetAPIBaseURL: "http://127.0.0.1:1", FleetAPIMode: "kubernetes"})
	handler := app.routes()
	res := httptest.NewRecorder()
	handler.ServeHTTP(res, httptest.NewRequest("GET", "/", nil))
	if res.Code != 200 || !strings.Contains(res.Body.String(), `id="root"`) {
		t.Fatalf("React entry missing: %s", res.Body.String())
	}
	assets := regexp.MustCompile(`(?:src|href)="(/assets/[^"]+)"`).FindAllStringSubmatch(res.Body.String(), -1)
	if len(assets) < 2 {
		t.Fatal("built JS/CSS assets missing from entry")
	}
	for _, asset := range assets {
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, httptest.NewRequest("GET", asset[1], nil))
		if response.Code != 200 || response.Body.Len() == 0 {
			t.Fatalf("embedded asset unavailable: %s status=%d", asset[1], response.Code)
		}
	}
	for _, legacy := range []string{"/app.js", "/styles.css"} {
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, httptest.NewRequest("GET", legacy, nil))
		if response.Code != 404 {
			t.Fatalf("legacy frontend still served: %s", legacy)
		}
	}
}
