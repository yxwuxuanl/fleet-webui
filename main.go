package main

import (
	"embed"
	"net/http"
	"os"
)

//go:embed web/*
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
	if err := http.ListenAndServe(config.ListenAddr, app.routes()); err != nil {
		app.logger.Error("server stopped", "error", err)
		os.Exit(1)
	}
}
