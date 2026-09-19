package main

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestBundleDependencyCompatibility(t *testing.T) {
	// Raw API payloads exercise decoding as well as the public summary response.
	for _, tt := range []struct {
		name    string
		status  string
		state   string
		health  string
		waiting int
	}{
		{
			name:   "Fleet 0.16.2 display state",
			status: `{"display":{"state":"WaitingForDependency"},"summary":{"desiredReady":2,"waitingForDependency":2}}`,
			state:  "WaitingForDependency", health: "Reconciling", waiting: 2,
		},
		{
			name:   "summary fallback",
			status: `{"summary":{"desiredReady":2,"waitingForDependency":2}}`,
			state:  "WaitingForDependency", health: "Reconciling", waiting: 2,
		},
		{
			name:   "waiting outranks other progress states",
			status: `{"summary":{"desiredReady":3,"waitingForDependency":1,"waitApplied":1,"pending":1}}`,
			state:  "WaitingForDependency", health: "Reconciling", waiting: 1,
		},
		{
			name:   "deployment errors outrank waiting",
			status: `{"summary":{"desiredReady":3,"errApplied":1,"waitingForDependency":1,"waitApplied":1}}`,
			state:  "ErrApplied", health: "Error", waiting: 1,
		},
		{
			name:   "display remains authoritative",
			status: `{"display":{"state":"ErrApplied"},"summary":{"desiredReady":1,"waitingForDependency":1}}`,
			state:  "ErrApplied", health: "Error", waiting: 1,
		},
		{
			name:   "older Fleet ready response",
			status: `{"summary":{"desiredReady":1,"ready":1}}`,
			state:  "Ready", health: "Healthy",
		},
		{
			name:   "older Fleet waiting response",
			status: `{"summary":{"desiredReady":1,"waitApplied":1}}`,
			state:  "WaitApplied", health: "Reconciling",
		},
	} {
		t.Run(tt.name, func(t *testing.T) {
			upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if r.Method != http.MethodGet || r.URL.Path != "/apis/fleet.cattle.io/v1alpha1/namespaces/fleet-local/bundles/dependent" {
					t.Errorf("unexpected request: %s %s", r.Method, r.URL.Path)
					http.NotFound(w, r)
					return
				}
				w.Header().Set("Content-Type", "application/json")
				_, _ = w.Write([]byte(`{"metadata":{"name":"dependent","namespace":"fleet-local"},"status":` + tt.status + `}`))
			}))
			defer upstream.Close()
			client := newFleetClient(Config{FleetAPIBaseURL: upstream.URL, FleetAPIMode: "kubernetes"})
			bundle, err := client.getBundle(context.Background(), "fleet-local", "dependent")
			if err != nil {
				t.Fatal(err)
			}
			view := bundleDetailView(bundle)
			if view.State != tt.state || view.Health != tt.health {
				t.Fatalf("state/health = %s/%s, want %s/%s", view.State, view.Health, tt.state, tt.health)
			}
			payload, err := json.Marshal(view)
			if err != nil {
				t.Fatal(err)
			}
			var response struct {
				Summary map[string]int `json:"summary"`
			}
			if err := json.Unmarshal(payload, &response); err != nil {
				t.Fatal(err)
			}
			if count, exists := response.Summary["waitingForDependency"]; !exists || count != tt.waiting {
				t.Fatalf("waitingForDependency = %d (present=%v), want %d", count, exists, tt.waiting)
			}
		})
	}
}
