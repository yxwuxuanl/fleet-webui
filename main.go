package main

import (
	"embed"
	"errors"
	"net/http"
	"os"
)

//go:embed web
var webFS embed.FS

func main() {
	config := loadConfig()
	app := newApp(config)
	app.logger.Info("starting Fleet WebUI", "listen", config.ListenAddr, "connection", app.fleet.connectionMode, "apiMode", app.fleet.apiMode)
	if err := app.fleet.ready(); err != nil {
		app.logger.Error("Fleet connection could not be initialized", "error", err)
	}
	if config.NtfyBaseURL != "" && config.NtfyTopic != "" {
		app.logger.Info("ntfy notification channel configured", "url", config.NtfyBaseURL, "topic", config.NtfyTopic)
	}
	if config.ReconcileAuthToken == "" {
		app.logger.Warn("manual reconcile is disabled until RECONCILE_AUTH_TOKEN is configured")
	}
	server := &http.Server{
		Addr:              config.ListenAddr,
		Handler:           app.routes(),
		ReadHeaderTimeout: config.HTTPReadHeaderTimeout,
		ReadTimeout:       config.HTTPReadTimeout,
		WriteTimeout:      config.HTTPWriteTimeout,
		IdleTimeout:       config.HTTPIdleTimeout,
	}
	if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		app.logger.Error("server stopped", "error", err)
		os.Exit(1)
	}
}
