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
	"strconv"
	"strings"
	"sync"
	"time"

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
	bundles        resourceCache[Bundle]
	gitRepos       resourceCache[GitRepo]
	clusters       resourceCache[Cluster]
	bundleDeploys  resourceCache[BundleDeployment]
	version        resourceCache[string]
}

type resourceCache[T any] struct {
	mu        sync.Mutex
	items     []T
	expiresAt time.Time
}

func (cache *resourceCache[T]) load(ctx context.Context, ttl time.Duration, fetch func(context.Context) ([]T, error)) ([]T, error) {
	if ttl <= 0 {
		return fetch(ctx)
	}
	cache.mu.Lock()
	defer cache.mu.Unlock()
	if time.Now().Before(cache.expiresAt) {
		return append([]T(nil), cache.items...), nil
	}
	items, err := fetch(ctx)
	if err != nil {
		return nil, err
	}
	cache.items = append(cache.items[:0], items...)
	cache.expiresAt = time.Now().Add(ttl)
	return append([]T(nil), items...), nil
}

func (cache *resourceCache[T]) invalidate() {
	cache.mu.Lock()
	cache.items = nil
	cache.expiresAt = time.Time{}
	cache.mu.Unlock()
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
		restConfig.TLSClientConfig.CAFile = ""
		restConfig.TLSClientConfig.CAData = nil
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

type listResponse[T any] struct {
	Items    []T    `json:"items"`
	Data     []T    `json:"data"`
	Continue string `json:"continue"`
	Metadata struct {
		Continue string `json:"continue"`
	} `json:"metadata"`
}

func listResources[T any](ctx context.Context, client *FleetClient, resource string) ([]T, error) {
	pageSize := client.config.FleetPageSize
	if pageSize < 1 {
		pageSize = 250
	}
	var all []T
	continuation := ""
	seen := make(map[string]struct{})
	for {
		endpoint, err := url.Parse(client.listURL(resource))
		if err != nil {
			return nil, fmt.Errorf("build Fleet list URL: %w", err)
		}
		query := endpoint.Query()
		query.Set("limit", strconv.Itoa(pageSize))
		if continuation != "" {
			query.Set("continue", continuation)
		}
		endpoint.RawQuery = query.Encode()

		var page listResponse[T]
		if err := client.do(ctx, http.MethodGet, endpoint.String(), nil, "", &page); err != nil {
			return nil, err
		}
		if page.Items != nil {
			all = append(all, page.Items...)
		} else {
			all = append(all, page.Data...)
		}
		next := page.Continue
		if next == "" {
			next = page.Metadata.Continue
		}
		if next == "" {
			return all, nil
		}
		if _, repeated := seen[next]; repeated {
			return nil, errors.New("Fleet API returned a repeated pagination token")
		}
		seen[next] = struct{}{}
		continuation = next
	}
}

func (c *FleetClient) listBundles(ctx context.Context) ([]Bundle, error) {
	return c.bundles.load(ctx, c.config.FleetCacheTTL, func(ctx context.Context) ([]Bundle, error) {
		return listResources[Bundle](ctx, c, "bundles")
	})
}

func (c *FleetClient) listGitRepos(ctx context.Context) ([]GitRepo, error) {
	return c.gitRepos.load(ctx, c.config.FleetCacheTTL, func(ctx context.Context) ([]GitRepo, error) {
		return listResources[GitRepo](ctx, c, "gitrepos")
	})
}

func (c *FleetClient) listClusters(ctx context.Context) ([]Cluster, error) {
	return c.clusters.load(ctx, c.config.FleetCacheTTL, func(ctx context.Context) ([]Cluster, error) {
		return listResources[Cluster](ctx, c, "clusters")
	})
}

func (c *FleetClient) listBundleDeployments(ctx context.Context) ([]BundleDeployment, error) {
	return c.bundleDeploys.load(ctx, c.config.FleetCacheTTL, func(ctx context.Context) ([]BundleDeployment, error) {
		return listResources[BundleDeployment](ctx, c, "bundledeployments")
	})
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

func (c *FleetClient) getCluster(ctx context.Context, namespace, name string) (Cluster, error) {
	var cluster Cluster
	err := c.do(ctx, http.MethodGet, c.itemURL("clusters", namespace, name), nil, "", &cluster)
	return cluster, err
}

func (c *FleetClient) getBundleDeployment(ctx context.Context, namespace, name string) (BundleDeployment, error) {
	var deployment BundleDeployment
	err := c.do(ctx, http.MethodGet, c.itemURL("bundledeployments", namespace, name), nil, "", &deployment)
	return deployment, err
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
			c.bundles.invalidate()
			return updated, nextGeneration, nil
		}
		if !strings.Contains(err.Error(), "409") && !strings.Contains(strings.ToLower(err.Error()), "conflict") {
			return Bundle{}, 0, err
		}
	}
	return Bundle{}, 0, errors.New("bundle changed concurrently; please try reconcile again")
}
