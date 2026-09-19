package main

import (
	"net/http"
)

// Ownership requires both labels: names alone are not unique across workspaces.
func deploymentBelongsTo(deployment BundleDeployment, namespace, name string) bool {
	return deployment.Metadata.Labels["fleet.cattle.io/bundle-namespace"] == namespace &&
		deployment.Metadata.Labels["fleet.cattle.io/bundle-name"] == name
}

func (a *App) handleBundleRollout(w http.ResponseWriter, r *http.Request) {
	namespace, name := r.PathValue("namespace"), r.PathValue("name")
	bundle, err := a.fleet.getBundle(r.Context(), namespace, name)
	if err != nil {
		writeError(w, http.StatusBadGateway, err)
		return
	}
	deployments, err := a.fleet.listBundleDeployments(r.Context())
	if err != nil {
		writeError(w, http.StatusBadGateway, err)
		return
	}
	clusters, err := a.fleet.listClusters(r.Context())
	if err != nil {
		a.logger.Warn("cluster names unavailable for rollout", "error", err)
	}
	names := clusterNamesByNamespace(clusters)
	items := make([]BundleDeploymentView, 0)
	for _, deployment := range deployments {
		if deploymentBelongsTo(deployment, namespace, name) {
			items = append(items, bundleDeploymentView(deployment, names[deployment.Metadata.Namespace]))
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{"bundle": bundleDetailView(bundle), "items": items})
}

func (a *App) handleDeploymentObjects(w http.ResponseWriter, r *http.Request) {
	deployment, err := a.fleet.getBundleDeployment(r.Context(), r.PathValue("namespace"), r.PathValue("name"))
	if err != nil {
		writeError(w, http.StatusBadGateway, err)
		return
	}
	clusters, err := a.fleet.listClusters(r.Context())
	if err != nil {
		a.logger.Warn("cluster names unavailable for deployment objects", "error", err)
	}
	cluster := clusterNamesByNamespace(clusters)[deployment.Metadata.Namespace]
	items := make([]ManagedObjectView, 0, len(deployment.Status.Resources))
	for _, resource := range deployment.Status.Resources {
		items = append(items, managedObjectView(deployment, cluster, resource))
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items, "yamlEnabled": a.config.ManagedObjectsEnabled})
}

func (a *App) handleRepositoryRollout(w http.ResponseWriter, r *http.Request) {
	namespace, name := r.PathValue("namespace"), r.PathValue("name")
	repo, err := a.fleet.getGitRepo(r.Context(), namespace, name)
	if err != nil {
		writeError(w, http.StatusBadGateway, err)
		return
	}
	bundles, err := a.fleet.listBundles(r.Context())
	if err != nil {
		writeError(w, http.StatusBadGateway, err)
		return
	}
	deployments, err := a.fleet.listBundleDeployments(r.Context())
	if err != nil {
		writeError(w, http.StatusBadGateway, err)
		return
	}
	clusters, err := a.fleet.listClusters(r.Context())
	if err != nil {
		a.logger.Warn("cluster names unavailable for repository rollout", "error", err)
	}
	names := clusterNamesByNamespace(clusters)
	owned := make(map[string]bool)
	bundleViews := make([]BundleDetailView, 0)
	for _, bundle := range bundles {
		if bundle.Metadata.Namespace == namespace && bundle.Metadata.Labels["fleet.cattle.io/repo-name"] == name {
			owned[bundle.Metadata.Name] = true
			bundleViews = append(bundleViews, bundleDetailView(bundle))
		}
	}
	items := make([]BundleDeploymentView, 0)
	for _, deployment := range deployments {
		if deployment.Metadata.Labels["fleet.cattle.io/bundle-namespace"] == namespace && owned[deployment.Metadata.Labels["fleet.cattle.io/bundle-name"]] {
			items = append(items, bundleDeploymentView(deployment, names[deployment.Metadata.Namespace]))
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{"repository": gitRepoDetailView(repo), "bundles": bundleViews, "items": items})
}
