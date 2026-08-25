package main

import (
	"encoding/json"
	"errors"
	"io/fs"
	"log/slog"
	"net/http"
	"strings"
)

type App struct {
	config Config
	fleet  *FleetClient
	demo   *DemoStore
	logger *slog.Logger
}

func newApp(config Config) *App {
	return &App{config: config, fleet: newFleetClient(config), demo: newDemoStore(), logger: slog.Default()}
}

func (a *App) demoMode() bool { return a.fleet.demoMode() }

func (a *App) routes() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/health", a.handleHealth)
	mux.HandleFunc("GET /api/bundles", a.handleBundles)
	mux.HandleFunc("GET /api/bundles/{namespace}/{name}", a.handleBundleDetail)
	mux.HandleFunc("GET /api/gitrepos", a.handleGitRepos)
	mux.HandleFunc("GET /api/gitrepos/{namespace}/{name}", a.handleGitRepoDetail)
	mux.HandleFunc("POST /api/bundles/{namespace}/{name}/reconcile", a.handleReconcile)

	static, err := fs.Sub(webFS, "web")
	if err != nil {
		panic(err)
	}
	mux.Handle("/", http.FileServer(http.FS(static)))
	return a.withHeaders(mux)
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
		"mode":                   a.fleet.connectionMode,
		"demo":                   a.demoMode(),
		"connectionError":        errorMessage(a.fleet.ready()),
		"notificationConfigured": a.config.NtfyBaseURL != "" && a.config.NtfyTopic != "",
	})
}

func errorMessage(err error) string {
	if err == nil {
		return ""
	}
	return err.Error()
}

func (a *App) handleBundles(w http.ResponseWriter, r *http.Request) {
	if a.demoMode() {
		writeJSON(w, http.StatusOK, map[string]any{"items": a.demo.listBundles()})
		return
	}
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
	if a.demoMode() {
		detail, err := a.demo.bundleDetail(namespace, name)
		if err != nil {
			writeError(w, http.StatusNotFound, err)
			return
		}
		writeJSON(w, http.StatusOK, detail)
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
	if a.demoMode() {
		writeJSON(w, http.StatusOK, map[string]any{"items": a.demo.listGitRepos()})
		return
	}
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
	if a.demoMode() {
		detail, err := a.demo.gitRepoDetail(namespace, name)
		if err != nil {
			writeError(w, http.StatusNotFound, err)
			return
		}
		writeJSON(w, http.StatusOK, detail)
		return
	}
	repo, err := a.fleet.getGitRepo(r.Context(), namespace, name)
	if err != nil {
		writeError(w, http.StatusBadGateway, err)
		return
	}
	writeJSON(w, http.StatusOK, gitRepoDetailView(repo))
}

func requesterFrom(r *http.Request) string {
	for _, header := range []string{"X-Remote-User", "X-Forwarded-User", "X-Auth-Request-User"} {
		if value := strings.TrimSpace(r.Header.Get(header)); value != "" {
			return value
		}
	}
	return "fleet-webui"
}

func (a *App) handleReconcile(w http.ResponseWriter, r *http.Request) {
	namespace, name := r.PathValue("namespace"), r.PathValue("name")
	if namespace == "" || name == "" {
		writeError(w, http.StatusBadRequest, errors.New("namespace and name are required"))
		return
	}

	var bundle BundleView
	var generation int64
	var err error
	if a.demoMode() {
		bundle, generation, err = a.demo.reconcile(namespace, name)
	} else {
		var source Bundle
		source, generation, err = a.fleet.reconcileBundle(r.Context(), namespace, name)
		bundle = bundleView(source)
	}
	if err != nil {
		writeError(w, http.StatusBadGateway, err)
		return
	}

	notification := "not-configured"
	if a.demoMode() {
		notification = "simulated"
	} else if a.config.NtfyBaseURL != "" && a.config.NtfyTopic != "" {
		if err := a.notifyReconcile(r.Context(), bundle, generation, requesterFrom(r)); err != nil {
			a.logger.Error("ntfy notification failed", "bundle", namespace+"/"+name, "error", err)
			notification = "failed"
		} else {
			notification = "sent"
		}
	}

	writeJSON(w, http.StatusAccepted, map[string]any{"bundle": bundle, "generation": generation, "notification": notification})
}
