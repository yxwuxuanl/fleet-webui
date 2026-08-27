package main

import (
	"crypto/sha256"
	"crypto/subtle"
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
		"connectionError":        errorMessage(a.fleet.ready()),
		"notificationConfigured": a.config.NtfyBaseURL != "" && a.config.NtfyTopic != "",
		"reconcileEnabled":       a.config.ReconcileAuthToken != "",
		"reconcileAuthRequired":  true,
	})
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

func (a *App) authorizeReconcile(w http.ResponseWriter, r *http.Request) bool {
	if a.config.ReconcileAuthToken == "" {
		writeError(w, http.StatusServiceUnavailable, errors.New("manual reconcile is disabled; configure RECONCILE_AUTH_TOKEN on the server"))
		return false
	}
	scheme, token, ok := strings.Cut(strings.TrimSpace(r.Header.Get("Authorization")), " ")
	providedToken := sha256.Sum256([]byte(strings.TrimSpace(token)))
	expectedToken := sha256.Sum256([]byte(a.config.ReconcileAuthToken))
	if !ok || !strings.EqualFold(scheme, "Bearer") || subtle.ConstantTimeCompare(providedToken[:], expectedToken[:]) != 1 {
		w.Header().Set("WWW-Authenticate", `Bearer realm="fleet-webui"`)
		writeError(w, http.StatusUnauthorized, errors.New("a valid reconcile token is required"))
		return false
	}
	return true
}

func (a *App) handleReconcile(w http.ResponseWriter, r *http.Request) {
	if !a.authorizeReconcile(w, r) {
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
		if err := a.notifyReconcile(r.Context(), bundle, generation, "authenticated client"); err != nil {
			a.logger.Error("ntfy notification failed", "bundle", namespace+"/"+name, "error", err)
			notification = "failed"
		} else {
			notification = "sent"
		}
	}

	writeJSON(w, http.StatusAccepted, map[string]any{"bundle": bundle, "generation": generation, "notification": notification})
}
