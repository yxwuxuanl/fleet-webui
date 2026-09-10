package main

import (
	"bytes"
	"compress/gzip"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"sort"
	"strconv"
	"strings"

	"github.com/pmezard/go-difflib/difflib"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/labels"
	kyaml "k8s.io/apimachinery/pkg/util/yaml"
	"sigs.k8s.io/yaml"
)

type managedObjectDiagnostics struct {
	LiveYAML     string
	DesiredYAML  string
	Diff         string
	Redacted     bool
	Events       []ManagedObjectEventView
	Pods         []ManagedObjectPodView
	DesiredError string
}

type helmRelease struct {
	Manifest string `json:"manifest"`
}

func renderManagedYAML(object map[string]any, desired bool) (string, bool, error) {
	redacted := sanitizeManagedObject(object)
	delete(object, "status")
	if metadata, ok := object["metadata"].(map[string]any); ok {
		for _, field := range []string{"managedFields", "creationTimestamp", "resourceVersion", "uid", "generation"} {
			delete(metadata, field)
		}
		if desired {
			delete(metadata, "selfLink")
		}
	}
	encoded, err := json.Marshal(object)
	if err != nil {
		return "", redacted, err
	}
	value, err := yaml.JSONToYAML(encoded)
	if err != nil {
		return "", redacted, err
	}
	return string(value), redacted, nil
}

func deleteDefault(object map[string]any, key string, expected any) {
	if fmt.Sprint(object[key]) == fmt.Sprint(expected) {
		delete(object, key)
	}
}

func normalizeProbeDefaults(probe map[string]any) {
	deleteDefault(probe, "failureThreshold", float64(3))
	deleteDefault(probe, "successThreshold", float64(1))
	deleteDefault(probe, "timeoutSeconds", float64(1))
	if httpGet, ok := probe["httpGet"].(map[string]any); ok {
		deleteDefault(httpGet, "scheme", "HTTP")
	}
}

func normalizePodSpecDefaults(spec map[string]any) {
	deleteDefault(spec, "dnsPolicy", "ClusterFirst")
	deleteDefault(spec, "restartPolicy", "Always")
	deleteDefault(spec, "schedulerName", "default-scheduler")
	deleteDefault(spec, "terminationGracePeriodSeconds", float64(30))
	if fmt.Sprint(spec["serviceAccount"]) == fmt.Sprint(spec["serviceAccountName"]) {
		delete(spec, "serviceAccount")
	}
	containers, _ := spec["containers"].([]any)
	for _, item := range containers {
		container, _ := item.(map[string]any)
		deleteDefault(container, "imagePullPolicy", "IfNotPresent")
		deleteDefault(container, "terminationMessagePath", "/dev/termination-log")
		deleteDefault(container, "terminationMessagePolicy", "File")
		for _, field := range []string{"livenessProbe", "readinessProbe", "startupProbe"} {
			if probe, ok := container[field].(map[string]any); ok {
				normalizeProbeDefaults(probe)
			}
		}
	}
}

func normalizeKubernetesDefaults(object map[string]any) {
	if metadata, ok := object["metadata"].(map[string]any); ok {
		if annotations, ok := metadata["annotations"].(map[string]any); ok {
			for _, key := range []string{"deployment.kubernetes.io/revision", "meta.helm.sh/release-name", "meta.helm.sh/release-namespace"} {
				delete(annotations, key)
			}
			if len(annotations) == 0 {
				delete(metadata, "annotations")
			}
		}
	}
	spec, _ := object["spec"].(map[string]any)
	switch fmt.Sprint(object["kind"]) {
	case "Deployment":
		deleteDefault(spec, "progressDeadlineSeconds", float64(600))
		deleteDefault(spec, "revisionHistoryLimit", float64(10))
		if strategy, ok := spec["strategy"].(map[string]any); ok {
			deleteDefault(strategy, "type", "RollingUpdate")
			if rolling, ok := strategy["rollingUpdate"].(map[string]any); ok {
				deleteDefault(rolling, "maxSurge", "25%")
				deleteDefault(rolling, "maxUnavailable", "25%")
				if len(rolling) == 0 {
					delete(strategy, "rollingUpdate")
				}
			}
			if len(strategy) == 0 {
				delete(spec, "strategy")
			}
		}
	}
	if template, ok := spec["template"].(map[string]any); ok {
		if podSpec, ok := template["spec"].(map[string]any); ok {
			normalizePodSpecDefaults(podSpec)
		}
	}
}

func decodeHelmRelease(data []byte) (helmRelease, error) {
	decoded := data
	if value, err := base64.StdEncoding.DecodeString(strings.TrimSpace(string(data))); err == nil {
		decoded = value
	}
	if reader, err := gzip.NewReader(bytes.NewReader(decoded)); err == nil {
		decompressed, readErr := io.ReadAll(reader)
		closeErr := reader.Close()
		if readErr != nil {
			return helmRelease{}, readErr
		}
		if closeErr != nil {
			return helmRelease{}, closeErr
		}
		decoded = decompressed
	}
	var release helmRelease
	if err := json.Unmarshal(decoded, &release); err != nil {
		return helmRelease{}, fmt.Errorf("decode Helm release: %w", err)
	}
	if strings.TrimSpace(release.Manifest) == "" {
		return helmRelease{}, errors.New("Helm release contains no manifest")
	}
	return release, nil
}

func releaseSecretRef(release string) (namespace, name string, err error) {
	colon := strings.LastIndex(release, ":")
	slash := strings.Index(release, "/")
	if slash < 1 || colon <= slash+1 || colon == len(release)-1 {
		return "", "", fmt.Errorf("invalid Fleet release reference %q", release)
	}
	namespace, releaseName, revision := release[:slash], release[slash+1:colon], release[colon+1:]
	if _, parseErr := strconv.Atoi(revision); parseErr != nil {
		return "", "", fmt.Errorf("invalid Fleet release revision %q", revision)
	}
	return namespace, "sh.helm.release.v1." + releaseName + ".v" + revision, nil
}

func manifestObject(manifest string, resource BundleDeploymentResource) (map[string]any, error) {
	decoder := kyaml.NewYAMLOrJSONDecoder(strings.NewReader(manifest), 4096)
	for {
		var raw json.RawMessage
		if err := decoder.Decode(&raw); err != nil {
			if errors.Is(err, io.EOF) {
				break
			}
			return nil, fmt.Errorf("decode desired manifest: %w", err)
		}
		if len(raw) == 0 || string(raw) == "null" {
			continue
		}
		var object map[string]any
		if err := json.Unmarshal(raw, &object); err != nil {
			return nil, err
		}
		metadata, _ := object["metadata"].(map[string]any)
		objectNamespace, _ := metadata["namespace"].(string)
		if fmt.Sprint(object["apiVersion"]) == resource.APIVersion &&
			fmt.Sprint(object["kind"]) == resource.Kind &&
			fmt.Sprint(metadata["name"]) == resource.Name &&
			(objectNamespace == resource.Namespace || (objectNamespace == "" && resource.Namespace != "")) {
			if objectNamespace == "" && resource.Namespace != "" {
				metadata["namespace"] = resource.Namespace
			}
			return object, nil
		}
	}
	return nil, fmt.Errorf("desired %s %s/%s was not found in Helm release", resource.Kind, resource.Namespace, resource.Name)
}

func (c *kubeObjectClient) coreObject(ctx context.Context, namespace, resource, name string, destination any) error {
	endpoint := c.baseURL + "/api/v1"
	if namespace != "" {
		endpoint += "/namespaces/" + url.PathEscape(namespace)
	}
	endpoint += "/" + url.PathEscape(resource)
	if name != "" {
		endpoint += "/" + url.PathEscape(name)
	}
	return c.getJSON(ctx, endpoint, destination)
}

func (c *FleetClient) desiredObjectYAML(ctx context.Context, client *kubeObjectClient, deployment BundleDeployment, resource BundleDeploymentResource) (string, bool, error) {
	namespace, secretName, err := releaseSecretRef(deployment.Status.Release)
	if err != nil {
		return "", false, err
	}
	var secret kubeSecret
	if err := client.coreObject(ctx, namespace, "secrets", secretName, &secret); err != nil {
		return "", false, fmt.Errorf("load desired Helm release: %w", err)
	}
	release, err := decodeHelmRelease(secret.Data["release"])
	if err != nil {
		return "", false, err
	}
	object, err := manifestObject(release.Manifest, resource)
	if err != nil {
		return "", false, err
	}
	normalizeKubernetesDefaults(object)
	return renderManagedYAML(object, true)
}

type eventList struct {
	Items []struct {
		Type           string `json:"type"`
		Reason         string `json:"reason"`
		Message        string `json:"message"`
		Count          int32  `json:"count"`
		FirstTimestamp string `json:"firstTimestamp"`
		LastTimestamp  string `json:"lastTimestamp"`
		EventTime      string `json:"eventTime"`
		Source         struct {
			Component string `json:"component"`
		} `json:"source"`
		ReportingController string `json:"reportingController"`
	} `json:"items"`
}

func (c *kubeObjectClient) events(ctx context.Context, resource BundleDeploymentResource) []ManagedObjectEventView {
	if resource.Namespace == "" {
		return nil
	}
	query := url.Values{"fieldSelector": {"involvedObject.kind=" + resource.Kind + ",involvedObject.name=" + resource.Name}}
	endpoint := c.baseURL + "/api/v1/namespaces/" + url.PathEscape(resource.Namespace) + "/events?" + query.Encode()
	var result eventList
	if err := c.getJSON(ctx, endpoint, &result); err != nil {
		return nil
	}
	views := make([]ManagedObjectEventView, 0, len(result.Items))
	for _, item := range result.Items {
		last := item.LastTimestamp
		if last == "" {
			last = item.EventTime
		}
		source := item.Source.Component
		if source == "" {
			source = item.ReportingController
		}
		views = append(views, ManagedObjectEventView{Type: item.Type, Reason: item.Reason, Message: item.Message, Count: item.Count, FirstSeen: item.FirstTimestamp, LastSeen: last, Source: source})
	}
	sort.SliceStable(views, func(i, j int) bool { return views[i].LastSeen > views[j].LastSeen })
	return views
}

type podList struct {
	Items []struct {
		Metadata Metadata `json:"metadata"`
		Spec     struct {
			Containers []struct {
				Name string `json:"name"`
			} `json:"containers"`
		} `json:"spec"`
		Status struct {
			Phase             string `json:"phase"`
			ContainerStatuses []struct {
				Ready        bool   `json:"ready"`
				RestartCount int32  `json:"restartCount"`
				Name         string `json:"name"`
			} `json:"containerStatuses"`
		} `json:"status"`
	} `json:"items"`
}

func workloadSelector(object map[string]any) (labels.Selector, error) {
	spec, _ := object["spec"].(map[string]any)
	selector, _ := spec["selector"].(map[string]any)
	encoded, err := json.Marshal(selector)
	if err != nil {
		return nil, err
	}
	var parsed metav1.LabelSelector
	if err := json.Unmarshal(encoded, &parsed); err != nil {
		return nil, err
	}
	return metav1.LabelSelectorAsSelector(&parsed)
}

func (c *kubeObjectClient) pods(ctx context.Context, resource BundleDeploymentResource, object map[string]any) []ManagedObjectPodView {
	selector, err := workloadSelector(object)
	if err != nil || resource.Namespace == "" || selector.Empty() {
		return nil
	}
	endpoint := c.baseURL + "/api/v1/namespaces/" + url.PathEscape(resource.Namespace) + "/pods?" + url.Values{"labelSelector": {selector.String()}}.Encode()
	var result podList
	if err := c.getJSON(ctx, endpoint, &result); err != nil {
		return nil
	}
	views := make([]ManagedObjectPodView, 0, len(result.Items))
	for _, pod := range result.Items {
		if !selector.Matches(labels.Set(pod.Metadata.Labels)) {
			continue
		}
		view := ManagedObjectPodView{Name: pod.Metadata.Name, Namespace: pod.Metadata.Namespace, Phase: pod.Status.Phase, Containers: len(pod.Spec.Containers)}
		for _, container := range pod.Spec.Containers {
			view.ContainerNames = append(view.ContainerNames, container.Name)
		}
		for _, status := range pod.Status.ContainerStatuses {
			if status.Ready {
				view.Ready++
			}
			view.Restarts += status.RestartCount
		}
		views = append(views, view)
	}
	sort.SliceStable(views, func(i, j int) bool { return views[i].Name < views[j].Name })
	return views
}

func (c *FleetClient) managedObjectDiagnostics(ctx context.Context, deployment BundleDeployment, cluster Cluster, resource BundleDeploymentResource) (managedObjectDiagnostics, error) {
	if !c.config.ManagedObjectsEnabled {
		return managedObjectDiagnostics{}, errManagedObjectsDisabled
	}
	client, err := c.objectClient(ctx, cluster)
	if err != nil {
		return managedObjectDiagnostics{}, err
	}
	live, err := client.get(ctx, resource)
	if err != nil {
		return managedObjectDiagnostics{}, err
	}
	liveForDetails := live
	normalizeKubernetesDefaults(live)
	liveYAML, liveRedacted, err := renderManagedYAML(live, false)
	if err != nil {
		return managedObjectDiagnostics{}, err
	}
	result := managedObjectDiagnostics{LiveYAML: liveYAML, Redacted: liveRedacted, Events: client.events(ctx, resource), Pods: client.pods(ctx, resource, liveForDetails)}
	if result.Events == nil {
		result.Events = []ManagedObjectEventView{}
	}
	if result.Pods == nil {
		result.Pods = []ManagedObjectPodView{}
	}
	desiredYAML, desiredRedacted, desiredErr := c.desiredObjectYAML(ctx, client, deployment, resource)
	result.Redacted = result.Redacted || desiredRedacted
	if desiredErr != nil {
		result.DesiredError = desiredErr.Error()
		return result, nil
	}
	result.DesiredYAML = desiredYAML
	diff, err := difflib.GetUnifiedDiffString(difflib.UnifiedDiff{A: difflib.SplitLines(desiredYAML), B: difflib.SplitLines(liveYAML), FromFile: "desired", ToFile: "live", Context: 3})
	if err != nil {
		return managedObjectDiagnostics{}, err
	}
	result.Diff = diff
	return result, nil
}

func (a *App) handleManagedObjectLogs(w http.ResponseWriter, r *http.Request) {
	if !a.config.ManagedObjectsEnabled {
		writeError(w, http.StatusServiceUnavailable, errManagedObjectsDisabled)
		return
	}
	namespace, name := r.PathValue("namespace"), r.PathValue("name")
	deployment, err := a.fleet.getBundleDeployment(r.Context(), namespace, name)
	if err != nil {
		writeError(w, http.StatusBadGateway, err)
		return
	}
	resource, err := requestedManagedObject(r, deployment)
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	cluster, _, err := a.clusterForDeployment(r.Context(), deployment)
	if err != nil {
		writeError(w, http.StatusBadGateway, err)
		return
	}
	client, err := a.fleet.objectClient(r.Context(), cluster)
	if err != nil {
		writeError(w, http.StatusBadGateway, err)
		return
	}
	live, err := client.get(r.Context(), resource)
	if err != nil {
		writeError(w, http.StatusBadGateway, err)
		return
	}
	podName, container := r.URL.Query().Get("pod"), r.URL.Query().Get("container")
	allowed := false
	for _, pod := range client.pods(r.Context(), resource, live) {
		if pod.Name == podName {
			for _, candidate := range pod.ContainerNames {
				if candidate == container {
					allowed = true
				}
			}
		}
	}
	if !allowed {
		writeError(w, http.StatusNotFound, errors.New("pod or container is not managed by this workload"))
		return
	}
	endpoint := client.baseURL + "/api/v1/namespaces/" + url.PathEscape(resource.Namespace) + "/pods/" + url.PathEscape(podName) + "/log?" + url.Values{"container": {container}, "tailLines": {"200"}}.Encode()
	request, err := http.NewRequestWithContext(r.Context(), http.MethodGet, endpoint, nil)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	if client.token != "" {
		request.Header.Set("Authorization", "Bearer "+client.token)
	}
	response, err := client.http.Do(request)
	if err != nil {
		writeError(w, http.StatusBadGateway, err)
		return
	}
	defer response.Body.Close()
	data, err := io.ReadAll(io.LimitReader(response.Body, 1<<20))
	if err != nil {
		writeError(w, http.StatusBadGateway, err)
		return
	}
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		writeError(w, http.StatusBadGateway, fmt.Errorf("Kubernetes logs API returned %s", response.Status))
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"pod": podName, "container": container, "logs": string(data)})
}
