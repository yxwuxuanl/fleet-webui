package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"

	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/clientcmd"
	"sigs.k8s.io/yaml"
)

var (
	errManagedObjectNotIndexed = errors.New("managed object is not indexed by this BundleDeployment")
	errManagedObjectsDisabled  = errors.New("managed object YAML is disabled; set MANAGED_OBJECTS_YAML_ENABLED=true")
)

type kubeSecret struct {
	Metadata Metadata          `json:"metadata"`
	Data     map[string][]byte `json:"data"`
}

type apiResourceList struct {
	Resources []struct {
		Name       string `json:"name"`
		Kind       string `json:"kind"`
		Namespaced bool   `json:"namespaced"`
	} `json:"resources"`
}

type kubeObjectClient struct {
	http    *http.Client
	baseURL string
	token   string
}

func (c *FleetClient) coreItemURL(resource, namespace, name string) string {
	return c.baseURL + "/api/v1/namespaces/" + url.PathEscape(namespace) + "/" + resource + "/" + url.PathEscape(name)
}

func (c *FleetClient) getKubeconfigSecret(ctx context.Context, namespace, name string) (kubeSecret, error) {
	if c.apiMode != "kubernetes" {
		return kubeSecret{}, errors.New("downstream kubeconfig access requires Kubernetes API mode")
	}
	var secret kubeSecret
	if err := c.do(ctx, http.MethodGet, c.coreItemURL("secrets", namespace, name), nil, "", &secret); err != nil {
		return kubeSecret{}, err
	}
	if len(secret.Data["value"]) == 0 {
		return kubeSecret{}, fmt.Errorf("Fleet kubeconfig Secret %s/%s has no value key", namespace, name)
	}
	return secret, nil
}

func (c *FleetClient) objectClient(ctx context.Context, cluster Cluster) (*kubeObjectClient, error) {
	if c.apiMode != "kubernetes" {
		return nil, errors.New("managed object YAML requires Kubernetes API mode")
	}
	if cluster.Spec.KubeConfigSecret != "" {
		if !c.config.ManagedObjectsKubeconfigs {
			return nil, errors.New("remote cluster access requires MANAGED_OBJECTS_DOWNSTREAM_KUBECONFIGS=true")
		}
		secret, err := c.getKubeconfigSecret(ctx, cluster.Metadata.Namespace, cluster.Spec.KubeConfigSecret)
		if err != nil {
			return nil, fmt.Errorf("load downstream kubeconfig for %s/%s: %w", cluster.Metadata.Namespace, cluster.Metadata.Name, err)
		}
		restConfig, err := clientcmd.RESTConfigFromKubeConfig(secret.Data["value"])
		if err != nil {
			return nil, fmt.Errorf("parse downstream kubeconfig for %s/%s: %w", cluster.Metadata.Namespace, cluster.Metadata.Name, err)
		}
		if c.config.FleetSkipTLS {
			restConfig.TLSClientConfig.Insecure = true // #nosec G402 -- controlled by an explicit deployment setting.
			restConfig.TLSClientConfig.CAFile = ""
			restConfig.TLSClientConfig.CAData = nil
		}
		restConfig.Timeout = c.config.RequestTimeout
		httpClient, err := rest.HTTPClientFor(restConfig)
		if err != nil {
			return nil, fmt.Errorf("build downstream Kubernetes client: %w", err)
		}
		return &kubeObjectClient{http: httpClient, baseURL: strings.TrimRight(restConfig.Host, "/")}, nil
	}
	return &kubeObjectClient{http: c.http, baseURL: c.baseURL, token: c.config.FleetToken}, nil
}

func apiVersionPath(apiVersion string) (string, error) {
	if apiVersion == "" {
		return "", errors.New("apiVersion is required")
	}
	group, version, grouped := strings.Cut(apiVersion, "/")
	if !grouped {
		return "/api/" + url.PathEscape(apiVersion), nil
	}
	if group == "" || version == "" {
		return "", fmt.Errorf("invalid apiVersion %q", apiVersion)
	}
	return "/apis/" + url.PathEscape(group) + "/" + url.PathEscape(version), nil
}

func (c *kubeObjectClient) getJSON(ctx context.Context, endpoint string, destination any) error {
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return err
	}
	request.Header.Set("Accept", "application/json")
	if c.token != "" {
		request.Header.Set("Authorization", "Bearer "+c.token)
	}
	response, err := c.http.Do(request)
	if err != nil {
		return err
	}
	defer response.Body.Close()
	if response.StatusCode < http.StatusOK || response.StatusCode >= http.StatusMultipleChoices {
		message, _ := io.ReadAll(io.LimitReader(response.Body, 32<<10))
		return fmt.Errorf("Kubernetes API returned %s: %s", response.Status, strings.TrimSpace(string(message)))
	}
	return json.NewDecoder(response.Body).Decode(destination)
}

func (c *kubeObjectClient) get(ctx context.Context, resource BundleDeploymentResource) (map[string]any, error) {
	versionPath, err := apiVersionPath(resource.APIVersion)
	if err != nil {
		return nil, err
	}
	var discovery apiResourceList
	if err := c.getJSON(ctx, c.baseURL+versionPath, &discovery); err != nil {
		return nil, fmt.Errorf("discover %s resources: %w", resource.APIVersion, err)
	}
	resourceName := ""
	namespaced := false
	for _, candidate := range discovery.Resources {
		if candidate.Kind == resource.Kind && !strings.Contains(candidate.Name, "/") {
			resourceName = candidate.Name
			namespaced = candidate.Namespaced
			break
		}
	}
	if resourceName == "" {
		return nil, fmt.Errorf("Kubernetes resource kind %s was not found in %s", resource.Kind, resource.APIVersion)
	}
	endpoint := c.baseURL + versionPath
	if namespaced {
		if resource.Namespace == "" {
			return nil, fmt.Errorf("namespace is required for %s %s", resource.Kind, resource.Name)
		}
		endpoint += "/namespaces/" + url.PathEscape(resource.Namespace)
	}
	endpoint += "/" + url.PathEscape(resourceName) + "/" + url.PathEscape(resource.Name)
	var object map[string]any
	if err := c.getJSON(ctx, endpoint, &object); err != nil {
		return nil, fmt.Errorf("get %s %s/%s: %w", resource.Kind, resource.Namespace, resource.Name, err)
	}
	return object, nil
}

func redactMapValues(object map[string]any, field string) bool {
	value, exists := object[field]
	if !exists {
		return false
	}
	if values, ok := value.(map[string]any); ok {
		for key := range values {
			values[key] = "<redacted>"
		}
		return true
	}
	object[field] = "<redacted>"
	return true
}

func sanitizeManagedObject(object map[string]any) bool {
	if metadata, ok := object["metadata"].(map[string]any); ok {
		delete(metadata, "managedFields")
		if annotations, ok := metadata["annotations"].(map[string]any); ok {
			delete(annotations, "kubectl.kubernetes.io/last-applied-configuration")
			delete(annotations, "objectset.rio.cattle.io/applied")
			if len(annotations) == 0 {
				delete(metadata, "annotations")
			}
		}
	}
	if !strings.EqualFold(fmt.Sprint(object["kind"]), "Secret") {
		return false
	}
	redacted := false
	for _, field := range []string{"data", "stringData", "binaryData"} {
		redacted = redactMapValues(object, field) || redacted
	}
	return redacted || strings.EqualFold(fmt.Sprint(object["kind"]), "Secret")
}

func (c *FleetClient) managedObjectYAML(ctx context.Context, cluster Cluster, resource BundleDeploymentResource) (string, bool, error) {
	if !c.config.ManagedObjectsEnabled {
		return "", false, errManagedObjectsDisabled
	}
	client, err := c.objectClient(ctx, cluster)
	if err != nil {
		return "", false, err
	}
	object, err := client.get(ctx, resource)
	if err != nil {
		if !c.config.ManagedObjectsKubeconfigs && cluster.Spec.KubeConfigSecret != "" {
			return "", false, fmt.Errorf("%w; for remote clusters enable MANAGED_OBJECTS_DOWNSTREAM_KUBECONFIGS", err)
		}
		return "", false, err
	}
	redacted := sanitizeManagedObject(object)
	jsonValue, err := json.Marshal(object)
	if err != nil {
		return "", false, fmt.Errorf("encode managed object: %w", err)
	}
	yamlValue, err := yaml.JSONToYAML(jsonValue)
	if err != nil {
		return "", false, fmt.Errorf("render managed object YAML: %w", err)
	}
	return string(yamlValue), redacted, nil
}
