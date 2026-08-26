package main

import (
	"context"
	"crypto/tls"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strings"

	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/clientcmd"
)

type FleetClient struct {
	config         Config
	http           *http.Client
	baseURL        string
	apiMode        string
	connectionMode string
	initialization error
}

func newFleetClient(config Config) *FleetClient {
	connectionMode := resolveConnectionMode(config)
	client := &FleetClient{config: config, connectionMode: connectionMode, apiMode: config.FleetAPIMode}
	if connectionMode == "unconfigured" {
		client.initialization = errors.New("no Fleet connection detected; run inside Kubernetes, configure FLEET_API_BASE_URL, or provide a kubeconfig")
		return client
	}

	if connectionMode == "direct" {
		if config.FleetAPIBaseURL == "" {
			client.initialization = errors.New("FLEET_API_BASE_URL is required for direct Fleet API access")
			return client
		}
		client.baseURL = config.FleetAPIBaseURL
		client.http = directHTTPClient(config)
		return client
	}

	var restConfig *rest.Config
	var err error
	if connectionMode == "kubeconfig" {
		restConfig, err = restConfigFromKubeconfig(config)
	} else {
		restConfig, err = rest.InClusterConfig()
	}
	if err != nil {
		client.initialization = fmt.Errorf("configure Kubernetes client (%s): %w", connectionMode, err)
		return client
	}
	if config.FleetSkipTLS {
		restConfig.TLSClientConfig.Insecure = true // #nosec G402 -- controlled by an explicit deployment setting.
	}
	restConfig.Timeout = config.RequestTimeout
	client.http, err = rest.HTTPClientFor(restConfig)
	if err != nil {
		client.initialization = fmt.Errorf("build Kubernetes HTTP client: %w", err)
		return client
	}
	client.baseURL = strings.TrimRight(restConfig.Host, "/")
	client.apiMode = "kubernetes"
	return client
}

func directHTTPClient(config Config) *http.Client {
	transport := http.DefaultTransport.(*http.Transport).Clone()
	transport.TLSClientConfig = &tls.Config{InsecureSkipVerify: config.FleetSkipTLS} // #nosec G402 -- controlled by an explicit deployment setting.
	return &http.Client{Timeout: config.RequestTimeout, Transport: transport}
}

func resolveConnectionMode(config Config) string {
	if config.FleetAPIBaseURL != "" {
		return "direct"
	}
	if inClusterEnvironment() {
		return "in-cluster"
	}
	if config.KubeconfigPath != "" || strings.TrimSpace(os.Getenv("KUBECONFIG")) != "" {
		return "kubeconfig"
	}
	if _, err := os.Stat(clientcmd.RecommendedHomeFile); err == nil {
		return "kubeconfig"
	}
	return "unconfigured"
}

func inClusterEnvironment() bool {
	return strings.TrimSpace(os.Getenv("KUBERNETES_SERVICE_HOST")) != "" &&
		strings.TrimSpace(os.Getenv("KUBERNETES_SERVICE_PORT")) != ""
}

func restConfigFromKubeconfig(config Config) (*rest.Config, error) {
	rules := clientcmd.NewDefaultClientConfigLoadingRules()
	if config.KubeconfigPath != "" {
		rules.ExplicitPath = config.KubeconfigPath
	}
	overrides := &clientcmd.ConfigOverrides{CurrentContext: config.KubeContext}
	return clientcmd.NewNonInteractiveDeferredLoadingClientConfig(rules, overrides).ClientConfig()
}

func (c *FleetClient) ready() error { return c.initialization }

func (c *FleetClient) listURL(resource string) string {
	if c.apiMode == "kubernetes" {
		return c.baseURL + "/apis/fleet.cattle.io/v1alpha1/" + resource
	}
	return c.baseURL + "/v1/fleet.cattle.io." + resource
}

func (c *FleetClient) itemURL(resource, namespace, name string) string {
	if c.apiMode == "kubernetes" {
		return c.baseURL + "/apis/fleet.cattle.io/v1alpha1/namespaces/" + url.PathEscape(namespace) + "/" + resource + "/" + url.PathEscape(name)
	}
	return c.listURL(resource) + "/" + url.PathEscape(namespace) + "/" + url.PathEscape(name)
}

func (c *FleetClient) do(ctx context.Context, method, endpoint string, body io.Reader, contentType string, destination any) error {
	if err := c.ready(); err != nil {
		return err
	}
	request, err := http.NewRequestWithContext(ctx, method, endpoint, body)
	if err != nil {
		return err
	}
	request.Header.Set("Accept", "application/json")
	if contentType != "" {
		request.Header.Set("Content-Type", contentType)
	}
	if c.config.FleetToken != "" {
		request.Header.Set("Authorization", "Bearer "+c.config.FleetToken)
	}

	response, err := c.http.Do(request)
	if err != nil {
		return err
	}
	defer response.Body.Close()
	if response.StatusCode < http.StatusOK || response.StatusCode >= http.StatusMultipleChoices {
		message, _ := io.ReadAll(io.LimitReader(response.Body, 32<<10))
		return fmt.Errorf("Fleet API returned %s: %s", response.Status, strings.TrimSpace(string(message)))
	}
	if destination == nil {
		return nil
	}
	return json.NewDecoder(response.Body).Decode(destination)
}

func decodeList[T any](body io.Reader) ([]T, error) {
	var response struct {
		Items []T `json:"items"`
		Data  []T `json:"data"`
	}
	if err := json.NewDecoder(body).Decode(&response); err != nil {
		return nil, err
	}
	if response.Items != nil {
		return response.Items, nil
	}
	return response.Data, nil
}

func (c *FleetClient) listBundles(ctx context.Context) ([]Bundle, error) {
	if err := c.ready(); err != nil {
		return nil, err
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, c.listURL("bundles"), nil)
	if err != nil {
		return nil, err
	}
	request.Header.Set("Accept", "application/json")
	if c.config.FleetToken != "" {
		request.Header.Set("Authorization", "Bearer "+c.config.FleetToken)
	}
	response, err := c.http.Do(request)
	if err != nil {
		return nil, err
	}
	defer response.Body.Close()
	if response.StatusCode < http.StatusOK || response.StatusCode >= http.StatusMultipleChoices {
		message, _ := io.ReadAll(io.LimitReader(response.Body, 32<<10))
		return nil, fmt.Errorf("Fleet API returned %s: %s", response.Status, strings.TrimSpace(string(message)))
	}
	return decodeList[Bundle](response.Body)
}

func (c *FleetClient) listGitRepos(ctx context.Context) ([]GitRepo, error) {
	if err := c.ready(); err != nil {
		return nil, err
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, c.listURL("gitrepos"), nil)
	if err != nil {
		return nil, err
	}
	request.Header.Set("Accept", "application/json")
	if c.config.FleetToken != "" {
		request.Header.Set("Authorization", "Bearer "+c.config.FleetToken)
	}
	response, err := c.http.Do(request)
	if err != nil {
		return nil, err
	}
	defer response.Body.Close()
	if response.StatusCode < http.StatusOK || response.StatusCode >= http.StatusMultipleChoices {
		message, _ := io.ReadAll(io.LimitReader(response.Body, 32<<10))
		return nil, fmt.Errorf("Fleet API returned %s: %s", response.Status, strings.TrimSpace(string(message)))
	}
	return decodeList[GitRepo](response.Body)
}

func (c *FleetClient) getBundle(ctx context.Context, namespace, name string) (Bundle, error) {
	var bundle Bundle
	err := c.do(ctx, http.MethodGet, c.itemURL("bundles", namespace, name), nil, "", &bundle)
	return bundle, err
}

func (c *FleetClient) getGitRepo(ctx context.Context, namespace, name string) (GitRepo, error) {
	var repo GitRepo
	err := c.do(ctx, http.MethodGet, c.itemURL("gitrepos", namespace, name), nil, "", &repo)
	return repo, err
}

func (c *FleetClient) reconcileBundle(ctx context.Context, namespace, name string) (Bundle, int64, error) {
	for attempt := 0; attempt < 3; attempt++ {
		bundle, err := c.getBundle(ctx, namespace, name)
		if err != nil {
			return Bundle{}, 0, err
		}
		nextGeneration := bundle.Spec.ForceSyncGeneration + 1
		patch := map[string]any{
			"metadata": map[string]any{"resourceVersion": bundle.Metadata.ResourceVersion},
			"spec":     map[string]any{"forceSyncGeneration": nextGeneration},
		}
		payload, err := json.Marshal(patch)
		if err != nil {
			return Bundle{}, 0, err
		}
		var updated Bundle
		err = c.do(ctx, http.MethodPatch, c.itemURL("bundles", namespace, name), strings.NewReader(string(payload)), "application/merge-patch+json", &updated)
		if err == nil {
			return updated, nextGeneration, nil
		}
		if !strings.Contains(err.Error(), "409") && !strings.Contains(strings.ToLower(err.Error()), "conflict") {
			return Bundle{}, 0, err
		}
	}
	return Bundle{}, 0, errors.New("bundle changed concurrently; please try reconcile again")
}
