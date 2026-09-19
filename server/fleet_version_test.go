package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
)

func TestImageTag(t *testing.T) {
	for _, tt := range []struct{ image, want string }{
		{"rancher/fleet:v0.16.2", "v0.16.2"},
		{"registry.local:5000/rancher/fleet:v0.16.2-rc.1", "v0.16.2-rc.1"},
		{"registry.local:5000/rancher/fleet", ""},
		{"rancher/fleet@sha256:abcdef", ""},
		{"rancher/fleet:v0.16.2@sha256:abcdef", "v0.16.2"},
		{"fleet:v0.16.2", "v0.16.2"},
		{"", ""},
	} {
		t.Run(tt.image, func(t *testing.T) {
			if got := imageTag(tt.image); got != tt.want {
				t.Fatalf("imageTag(%q) = %q, want %q", tt.image, got, tt.want)
			}
		})
	}
}

func TestFleetVersionEndpoint(t *testing.T) {
	for _, tt := range []struct {
		name, mode, namespace, path string
		status                      int
		want                        string
	}{
		{"Kubernetes", "kubernetes", "", "/apis/apps/v1/namespaces/cattle-fleet-system/deployments/fleet-controller", 200, "v0.16.2"},
		{"Steve", "steve", "", "/v1/apps.deployment/cattle-fleet-system/fleet-controller", 200, "v0.16.2"},
		{"custom namespace", "kubernetes", "fleet-custom", "/apis/apps/v1/namespaces/fleet-custom/deployments/fleet-controller", 200, "v0.16.2"},
		{"permission denied", "kubernetes", "", "/apis/apps/v1/namespaces/cattle-fleet-system/deployments/fleet-controller", 403, ""},
		{"not installed", "kubernetes", "", "/apis/apps/v1/namespaces/cattle-fleet-system/deployments/fleet-controller", 404, ""},
	} {
		t.Run(tt.name, func(t *testing.T) {
			var requests atomic.Int32
			upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				requests.Add(1)
				if r.Method != http.MethodGet || r.URL.Path != tt.path {
					t.Errorf("unexpected request: %s %s", r.Method, r.URL.Path)
				}
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(tt.status)
				// Do not mistake a sidecar version for Fleet's version.
				_, _ = w.Write([]byte(`{"spec":{"template":{"spec":{"containers":[{"name":"sidecar","image":"sidecar:v9"},{"name":"fleet-controller","image":"rancher/fleet:v0.16.2"}]}}}}`))
			}))
			defer upstream.Close()
			app := newApp(Config{FleetAPIBaseURL: upstream.URL, FleetAPIMode: tt.mode, FleetSystemNamespace: tt.namespace})
			handler := app.routes()
			health := httptest.NewRecorder()
			handler.ServeHTTP(health, httptest.NewRequest(http.MethodGet, "/api/health", nil))
			if health.Code != 200 || requests.Load() != 0 {
				t.Fatal("health probe must not depend on controller discovery")
			}
			for range 2 {
				response := httptest.NewRecorder()
				handler.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/api/fleet-version", nil))
				var result map[string]string
				if err := json.Unmarshal(response.Body.Bytes(), &result); err != nil {
					t.Fatal(err)
				}
				if response.Code != 200 || result["version"] != tt.want {
					t.Fatalf("status=%d body=%s, want version %q", response.Code, response.Body, tt.want)
				}
			}
			if requests.Load() != 1 {
				t.Fatalf("discovery made %d requests; expected cached result", requests.Load())
			}
		})
	}
}
