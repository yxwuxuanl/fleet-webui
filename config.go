package main

import (
	"os"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	ListenAddr      string
	FleetAPIBaseURL string
	FleetAPIMode    string
	FleetToken      string
	FleetSkipTLS    bool
	KubeconfigPath  string
	KubeContext     string
	NtfyBaseURL     string
	NtfyTopic       string
	NtfyToken       string
	AppBaseURL      string
	RequestTimeout  time.Duration
}

func loadConfig() Config {
	timeoutSeconds := envInt("REQUEST_TIMEOUT_SECONDS", 12)
	apiMode := strings.ToLower(env("FLEET_API_MODE", "steve"))
	if apiMode != "steve" && apiMode != "kubernetes" {
		apiMode = "steve"
	}
	return Config{
		ListenAddr:      env("LISTEN_ADDR", ":8080"),
		FleetAPIBaseURL: strings.TrimRight(os.Getenv("FLEET_API_BASE_URL"), "/"),
		FleetAPIMode:    apiMode,
		FleetToken:      os.Getenv("FLEET_API_TOKEN"),
		FleetSkipTLS:    envBool("FLEET_INSECURE_SKIP_TLS_VERIFY", false),
		KubeconfigPath:  strings.TrimSpace(os.Getenv("FLEET_KUBECONFIG")),
		KubeContext:     strings.TrimSpace(os.Getenv("FLEET_KUBECONTEXT")),
		NtfyBaseURL:     strings.TrimRight(os.Getenv("NTFY_BASE_URL"), "/"),
		NtfyTopic:       os.Getenv("NTFY_TOPIC"),
		NtfyToken:       os.Getenv("NTFY_TOKEN"),
		AppBaseURL:      strings.TrimRight(os.Getenv("APP_BASE_URL"), "/"),
		RequestTimeout:  time.Duration(timeoutSeconds) * time.Second,
	}
}

func env(key, fallback string) string {
	if value := strings.TrimSpace(os.Getenv(key)); value != "" {
		return value
	}
	return fallback
}

func envInt(key string, fallback int) int {
	value, err := strconv.Atoi(strings.TrimSpace(os.Getenv(key)))
	if err != nil || value < 1 {
		return fallback
	}
	return value
}

func envBool(key string, fallback bool) bool {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback
	}
	parsed, err := strconv.ParseBool(value)
	if err != nil {
		return fallback
	}
	return parsed
}
