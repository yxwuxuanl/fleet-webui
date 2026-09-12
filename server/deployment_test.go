package main

import (
	"bytes"
	"io"
	"os"
	"os/exec"
	"slices"
	"testing"

	kyaml "k8s.io/apimachinery/pkg/util/yaml"
)

type deploymentDocument struct {
	Kind  string `json:"kind"`
	Rules []struct {
		Verbs []string `json:"verbs"`
	} `json:"rules"`
	Spec struct {
		Template struct {
			Spec struct {
				Containers []struct {
					Env []struct {
						Name  string `json:"name"`
						Value string `json:"value"`
					} `json:"env"`
				} `json:"containers"`
			} `json:"spec"`
		} `json:"template"`
	} `json:"spec"`
}

func assertReadOnlyDeployment(t *testing.T, manifest []byte) {
	t.Helper()
	decoder := kyaml.NewYAMLOrJSONDecoder(bytes.NewReader(manifest), 4096)
	seenDeployment := false
	for {
		var document deploymentDocument
		if err := decoder.Decode(&document); err == io.EOF {
			break
		} else if err != nil {
			t.Fatal(err)
		}
		for _, rule := range document.Rules {
			for _, verb := range rule.Verbs {
				if !slices.Contains([]string{"get", "list", "watch"}, verb) {
					t.Fatalf("read-only role grants %q", verb)
				}
			}
		}
		if document.Kind == "Deployment" {
			seenDeployment = true
			if len(document.Spec.Template.Spec.Containers) == 0 {
				t.Fatal("missing application container")
			}
			values := map[string]string{}
			for _, env := range document.Spec.Template.Spec.Containers[0].Env {
				values[env.Name] = env.Value
			}
			for _, key := range []string{"RECONCILE_ENABLED", "GIT_REPO_ACTIONS_ENABLED"} {
				if values[key] != "false" {
					t.Fatalf("read-only %s = %q", key, values[key])
				}
			}
		}
	}
	if !seenDeployment {
		t.Fatal("no Deployment rendered")
	}
}

func TestReadOnlyManifest(t *testing.T) {
	manifest, err := os.ReadFile("../deploy/rbac.yaml")
	if err != nil {
		t.Fatal(err)
	}
	assertReadOnlyDeployment(t, manifest)
}

func TestHelmConfiguration(t *testing.T) {
	if _, err := exec.LookPath("helm"); err != nil {
		t.Skip("Helm is not installed; run make chart-test with Helm available")
	}
	for _, name := range []string{"default", "read-only", "diagnostics"} {
		t.Run(name, func(t *testing.T) {
			args := []string{"template", "fleet-webui", "../charts/fleet-webui"}
			if name == "read-only" {
				args = append(args, "--set", "reconcile.enabled=false", "--set", "gitRepoActions.enabled=false")
			}
			if name == "diagnostics" {
				args = append(args, "--set", "managedObjects.enabled=true", "--set", "managedObjects.downstreamKubeconfigs=true", "--set", "gitHistory.enabled=true")
			}
			manifest, err := exec.Command("helm", args...).CombinedOutput()
			if err != nil {
				t.Fatalf("helm: %v\n%s", err, manifest)
			}
			if name == "read-only" {
				assertReadOnlyDeployment(t, manifest)
			}
		})
	}
	if output, err := exec.Command("helm", "template", "fleet-webui", "../charts/fleet-webui", "--set", "managedObjects.downstreamKubeconfigs=true").CombinedOutput(); err == nil {
		t.Fatalf("invalid downstream configuration accepted:\n%s", output)
	}
}
