package main

import (
	"context"
	"encoding/json"
	"errors"
	"io/fs"
	"log/slog"
	"net"
	"net/http"
	"sort"
	"time"
)

type App struct {
	config Config
	fleet  *FleetClient
	logger *slog.Logger
}

func newApp(config Config) *App {
	return &App{config: config, fleet: newFleetClient(config), logger: slog.Default()}
}

func (a *App) routes() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/health", a.handleHealth)
	mux.HandleFunc("GET /api/bundles", a.handleBundles)
	mux.HandleFunc("GET /api/bundles/{namespace}/{name}", a.handleBundleDetail)
	mux.HandleFunc("GET /api/bundles/{namespace}/{name}/managed-objects", a.handleManagedObjects)
	mux.HandleFunc("GET /api/gitrepos", a.handleGitRepos)
	mux.HandleFunc("GET /api/gitrepos/{namespace}/{name}", a.handleGitRepoDetail)
	mux.HandleFunc("GET /api/gitrepos/{namespace}/{name}/history", a.handleGitRepoHistory)
	mux.HandleFunc("POST /api/gitrepos/{namespace}/{name}/sync", a.handleGitRepoSync)
	mux.HandleFunc("POST /api/gitrepos/{namespace}/{name}/revision", a.handleGitRepoRevision)
	mux.HandleFunc("GET /api/clusters", a.handleClusters)
	mux.HandleFunc("GET /api/clusters/{namespace}/{name}", a.handleClusterDetail)
	mux.HandleFunc("GET /api/bundledeployments", a.handleBundleDeployments)
	mux.HandleFunc("GET /api/bundledeployments/{namespace}/{name}", a.handleBundleDeploymentDetail)
	mux.HandleFunc("GET /api/bundledeployments/{namespace}/{name}/managed-object", a.handleManagedObjectYAML)
	mux.HandleFunc("GET /api/bundledeployments/{namespace}/{name}/managed-object/logs", a.handleManagedObjectLogs)
	mux.HandleFunc("POST /api/bundles/{namespace}/{name}/reconcile", a.handleReconcile)

	static, err := fs.Sub(frontendFS, "dist")
	if err != nil {
		panic(err)
	}
	mux.Handle("/", http.FileServer(http.FS(static)))
	protection := http.NewCrossOriginProtection()
	protection.SetDenyHandler(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		writeError(w, http.StatusForbidden, errors.New("cross-origin write requests are not allowed"))
	}))
	handler := a.withHeaders(protection.Handler(mux))
	if a.config.AccessLogEnabled {
		handler = a.withAccessLog(handler)
	}
	return handler
}

type accessLogResponseWriter struct {
	http.ResponseWriter
	status int
	bytes  int
}

func (w *accessLogResponseWriter) WriteHeader(status int) {
	if w.status != 0 {
		return
	}
	w.status = status
	w.ResponseWriter.WriteHeader(status)
}

func (w *accessLogResponseWriter) Write(body []byte) (int, error) {
	if w.status == 0 {
		w.WriteHeader(http.StatusOK)
	}
	written, err := w.ResponseWriter.Write(body)
	w.bytes += written
	return written, err
}

func (w *accessLogResponseWriter) Unwrap() http.ResponseWriter {
	return w.ResponseWriter
}

func (w *accessLogResponseWriter) statusCode() int {
	if w.status == 0 {
		return http.StatusOK
	}
	return w.status
}

func requestRemoteAddress(r *http.Request) string {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err == nil {
		return host
	}
	return r.RemoteAddr
}

func (a *App) withAccessLog(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		started := time.Now()
		response := &accessLogResponseWriter{ResponseWriter: w}
		next.ServeHTTP(response, r)
		a.logger.Info("http access",
			"method", r.Method,
			"path", r.URL.Path,
			"status", response.statusCode(),
			"bytes", response.bytes,
			"duration", time.Since(started),
			"remote_addr", requestRemoteAddress(r),
			"user_agent", r.UserAgent(),
		)
	})
}

func (a *App) withHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("X-Frame-Options", "DENY")
		w.Header().Set("Referrer-Policy", "same-origin")
		next.ServeHTTP(w, r)
	})
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}

func writeError(w http.ResponseWriter, status int, err error) {
	writeJSON(w, status, map[string]string{"error": err.Error()})
}

func (a *App) handleHealth(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"mode":                      a.fleet.connectionMode,
		"connectionError":           errorMessage(a.fleet.ready()),
		"notificationConfigured":    a.config.NtfyBaseURL != "" && a.config.NtfyTopic != "",
		"reconcileEnabled":          a.config.ReconcileEnabled,
		"managedObjectsYAMLEnabled": a.config.ManagedObjectsEnabled,
		"gitHistoryEnabled":         a.config.GitHistoryEnabled,
		"gitRepoActionsEnabled":     a.config.GitRepoActionsEnabled,
	})
}

func managedObjectView(deployment BundleDeployment, cluster string, resource BundleDeploymentResource) ManagedObjectView {
	return ManagedObjectView{
		DeploymentName: deployment.Metadata.Name, DeploymentNamespace: deployment.Metadata.Namespace,
		Cluster: cluster, APIVersion: resource.APIVersion, Kind: resource.Kind,
		Namespace: resource.Namespace, Name: resource.Name, CreatedAt: timestamp(resource.CreatedAt),
	}
}

func (a *App) handleManagedObjects(w http.ResponseWriter, r *http.Request) {
	namespace, name := r.PathValue("namespace"), r.PathValue("name")
	if namespace == "" || name == "" {
		writeError(w, http.StatusBadRequest, errors.New("namespace and name are required"))
		return
	}
	deployments, err := a.fleet.listBundleDeployments(r.Context())
	if err != nil {
		writeError(w, http.StatusBadGateway, err)
		return
	}
	clusters, err := a.fleet.listClusters(r.Context())
	if err != nil {
		a.logger.Warn("cluster names unavailable for managed objects", "error", err)
	}
	clusterNames := clusterNamesByNamespace(clusters)
	items := make([]ManagedObjectView, 0)
	for _, deployment := range deployments {
		if deployment.Metadata.Labels["fleet.cattle.io/bundle-name"] != name || deployment.Metadata.Labels["fleet.cattle.io/bundle-namespace"] != namespace {
			continue
		}
		cluster := clusterNames[deployment.Metadata.Namespace]
		for _, resource := range deployment.Status.Resources {
			items = append(items, managedObjectView(deployment, cluster, resource))
		}
	}
	sort.SliceStable(items, func(left, right int) bool {
		leftKey := items[left].Cluster + "\x00" + items[left].Kind + "\x00" + items[left].Namespace + "\x00" + items[left].Name
		rightKey := items[right].Cluster + "\x00" + items[right].Kind + "\x00" + items[right].Namespace + "\x00" + items[right].Name
		return leftKey < rightKey
	})
	writeJSON(w, http.StatusOK, map[string]any{
		"items": items, "yamlEnabled": a.config.ManagedObjectsEnabled,
	})
}

func requestedManagedObject(r *http.Request, deployment BundleDeployment) (BundleDeploymentResource, error) {
	requested := BundleDeploymentResource{
		APIVersion: r.URL.Query().Get("apiVersion"), Kind: r.URL.Query().Get("kind"),
		Namespace: r.URL.Query().Get("namespace"), Name: r.URL.Query().Get("name"),
	}
	if requested.APIVersion == "" || requested.Kind == "" || requested.Name == "" {
		return BundleDeploymentResource{}, errors.New("apiVersion, kind and name are required")
	}
	for _, resource := range deployment.Status.Resources {
		if resource.APIVersion == requested.APIVersion && resource.Kind == requested.Kind && resource.Namespace == requested.Namespace && resource.Name == requested.Name {
			return resource, nil
		}
	}
	return BundleDeploymentResource{}, errManagedObjectNotIndexed
}

func (a *App) clusterForDeployment(ctx context.Context, deployment BundleDeployment) (Cluster, string, error) {
	clusterNamespace := deployment.Metadata.Labels["fleet.cattle.io/cluster-namespace"]
	clusterName := deployment.Metadata.Labels["fleet.cattle.io/cluster"]
	if clusterNamespace != "" && clusterName != "" {
		cluster, err := a.fleet.getCluster(ctx, clusterNamespace, clusterName)
		return cluster, clusterNamespace + "/" + clusterName, err
	}
	clusters, err := a.fleet.listClusters(ctx)
	if err != nil {
		return Cluster{}, "", err
	}
	for _, cluster := range clusters {
		if cluster.Status.Namespace == deployment.Metadata.Namespace {
			return cluster, cluster.Metadata.Namespace + "/" + cluster.Metadata.Name, nil
		}
	}
	return Cluster{}, "", errors.New("target Fleet Cluster was not found")
}

func (a *App) handleManagedObjectYAML(w http.ResponseWriter, r *http.Request) {
	namespace, name := r.PathValue("namespace"), r.PathValue("name")
	if namespace == "" || name == "" {
		writeError(w, http.StatusBadRequest, errors.New("namespace and name are required"))
		return
	}
	deployment, err := a.fleet.getBundleDeployment(r.Context(), namespace, name)
	if err != nil {
		writeError(w, http.StatusBadGateway, err)
		return
	}
	resource, err := requestedManagedObject(r, deployment)
	if err != nil {
		status := http.StatusBadRequest
		if errors.Is(err, errManagedObjectNotIndexed) {
			status = http.StatusNotFound
		}
		writeError(w, status, err)
		return
	}
	cluster, clusterName, err := a.clusterForDeployment(r.Context(), deployment)
	if err != nil {
		writeError(w, http.StatusBadGateway, err)
		return
	}
	diagnostics, err := a.fleet.managedObjectDiagnostics(r.Context(), deployment, cluster, resource)
	if err != nil {
		status := http.StatusBadGateway
		if errors.Is(err, errManagedObjectsDisabled) {
			status = http.StatusServiceUnavailable
		}
		writeError(w, status, err)
		return
	}
	view := ManagedObjectYAMLView{
		ManagedObjectView: managedObjectView(deployment, clusterName, resource),
		YAML:              diagnostics.LiveYAML, LiveYAML: diagnostics.LiveYAML,
		DesiredYAML: diagnostics.DesiredYAML, Diff: diagnostics.Diff,
		Redacted: diagnostics.Redacted, Events: diagnostics.Events, Pods: diagnostics.Pods,
		DesiredError: diagnostics.DesiredError,
	}
	writeJSON(w, http.StatusOK, view)
}

func errorMessage(err error) string {
	if err == nil {
		return ""
	}
	return err.Error()
}

func (a *App) handleBundles(w http.ResponseWriter, r *http.Request) {
	items, err := a.fleet.listBundles(r.Context())
	if err != nil {
		writeError(w, http.StatusBadGateway, err)
		return
	}
	views := make([]BundleView, 0, len(items))
	for _, item := range items {
		views = append(views, bundleView(item))
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": views})
}

func (a *App) handleBundleDetail(w http.ResponseWriter, r *http.Request) {
	namespace, name := r.PathValue("namespace"), r.PathValue("name")
	if namespace == "" || name == "" {
		writeError(w, http.StatusBadRequest, errors.New("namespace and name are required"))
		return
	}
	bundle, err := a.fleet.getBundle(r.Context(), namespace, name)
	if err != nil {
		writeError(w, http.StatusBadGateway, err)
		return
	}
	writeJSON(w, http.StatusOK, bundleDetailView(bundle))
}

func (a *App) handleGitRepos(w http.ResponseWriter, r *http.Request) {
	items, err := a.fleet.listGitRepos(r.Context())
	if err != nil {
		writeError(w, http.StatusBadGateway, err)
		return
	}
	views := make([]GitRepoView, 0, len(items))
	for _, item := range items {
		views = append(views, gitRepoView(item))
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": views})
}

func (a *App) handleGitRepoDetail(w http.ResponseWriter, r *http.Request) {
	namespace, name := r.PathValue("namespace"), r.PathValue("name")
	if namespace == "" || name == "" {
		writeError(w, http.StatusBadRequest, errors.New("namespace and name are required"))
		return
	}
	repo, err := a.fleet.getGitRepo(r.Context(), namespace, name)
	if err != nil {
		writeError(w, http.StatusBadGateway, err)
		return
	}
	writeJSON(w, http.StatusOK, gitRepoDetailView(repo))
}

func (a *App) handleClusters(w http.ResponseWriter, r *http.Request) {
	items, err := a.fleet.listClusters(r.Context())
	if err != nil {
		writeError(w, http.StatusBadGateway, err)
		return
	}
	views := make([]ClusterView, 0, len(items))
	for _, item := range items {
		views = append(views, clusterView(item))
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": views})
}

func (a *App) handleClusterDetail(w http.ResponseWriter, r *http.Request) {
	namespace, name := r.PathValue("namespace"), r.PathValue("name")
	if namespace == "" || name == "" {
		writeError(w, http.StatusBadRequest, errors.New("namespace and name are required"))
		return
	}
	cluster, err := a.fleet.getCluster(r.Context(), namespace, name)
	if err != nil {
		writeError(w, http.StatusBadGateway, err)
		return
	}
	writeJSON(w, http.StatusOK, clusterDetailView(cluster))
}

func clusterNamesByNamespace(clusters []Cluster) map[string]string {
	names := make(map[string]string, len(clusters))
	for _, cluster := range clusters {
		if cluster.Status.Namespace != "" {
			names[cluster.Status.Namespace] = cluster.Metadata.Namespace + "/" + cluster.Metadata.Name
		}
	}
	return names
}

func (a *App) handleBundleDeployments(w http.ResponseWriter, r *http.Request) {
	deployments, err := a.fleet.listBundleDeployments(r.Context())
	if err != nil {
		writeError(w, http.StatusBadGateway, err)
		return
	}
	clusters, err := a.fleet.listClusters(r.Context())
	if err != nil {
		a.logger.Warn("cluster names unavailable for BundleDeployments", "error", err)
	}
	clusterNames := clusterNamesByNamespace(clusters)
	views := make([]BundleDeploymentView, 0, len(deployments))
	for _, deployment := range deployments {
		views = append(views, bundleDeploymentView(deployment, clusterNames[deployment.Metadata.Namespace]))
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": views})
}

func (a *App) handleBundleDeploymentDetail(w http.ResponseWriter, r *http.Request) {
	namespace, name := r.PathValue("namespace"), r.PathValue("name")
	if namespace == "" || name == "" {
		writeError(w, http.StatusBadRequest, errors.New("namespace and name are required"))
		return
	}
	deployment, err := a.fleet.getBundleDeployment(r.Context(), namespace, name)
	if err != nil {
		writeError(w, http.StatusBadGateway, err)
		return
	}
	clusters, err := a.fleet.listClusters(r.Context())
	if err != nil {
		a.logger.Warn("cluster name unavailable for BundleDeployment", "namespace", namespace, "name", name, "error", err)
	}
	writeJSON(w, http.StatusOK, bundleDeploymentDetailView(deployment, clusterNamesByNamespace(clusters)[namespace]))
}

func (a *App) handleReconcile(w http.ResponseWriter, r *http.Request) {
	if !a.config.ReconcileEnabled {
		writeError(w, http.StatusServiceUnavailable, errors.New("manual reconcile is disabled by server configuration"))
		return
	}
	namespace, name := r.PathValue("namespace"), r.PathValue("name")
	if namespace == "" || name == "" {
		writeError(w, http.StatusBadRequest, errors.New("namespace and name are required"))
		return
	}

	source, generation, err := a.fleet.reconcileBundle(r.Context(), namespace, name)
	if err != nil {
		writeError(w, http.StatusBadGateway, err)
		return
	}
	bundle := bundleView(source)

	notification := "not-configured"
	if a.config.NtfyBaseURL != "" && a.config.NtfyTopic != "" {
		if err := a.notifyReconcile(r.Context(), bundle, generation, "console user"); err != nil {
			a.logger.Error("ntfy notification failed", "bundle", namespace+"/"+name, "error", err)
			notification = "failed"
		} else {
			notification = "sent"
		}
	}

	writeJSON(w, http.StatusAccepted, map[string]any{"bundle": bundle, "generation": generation, "notification": notification})
}
