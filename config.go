package main

import (
	"os"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	ListenAddr                string
	FleetAPIBaseURL           string
	FleetAPIMode              string
	FleetToken                string
	FleetSkipTLS              bool
	FleetPageSize             int
	FleetCacheTTL             time.Duration
	KubeconfigPath            string
	KubeContext               string
	ManagedObjectsEnabled     bool
	ManagedObjectsKubeconfigs bool
	ReconcileEnabled          bool
	NtfyBaseURL               string
	NtfyTopic                 string
	NtfyToken                 string
	AppBaseURL                string
	RequestTimeout            time.Duration
	HTTPReadHeaderTimeout     time.Duration
	HTTPReadTimeout           time.Duration
	HTTPWriteTimeout          time.Duration
	HTTPIdleTimeout           time.Duration
}

func loadConfig() Config {
	apiMode := strings.ToLower(env("FLEET_API_MODE", "steve"))
	if apiMode != "steve" && apiMode != "kubernetes" {
		apiMode = "steve"
	}
	return Config{
		ListenAddr:                env("LISTEN_ADDR", ":8080"),
		FleetAPIBaseURL:           strings.TrimRight(os.Getenv("FLEET_API_BASE_URL"), "/"),
		FleetAPIMode:              apiMode,
		FleetToken:                os.Getenv("FLEET_API_TOKEN"),
		FleetSkipTLS:              envBool("FLEET_INSECURE_SKIP_TLS_VERIFY", false),
		FleetPageSize:             envInt("FLEET_PAGE_SIZE", 250),
		FleetCacheTTL:             envSeconds("FLEET_CACHE_TTL_SECONDS", 10),
		KubeconfigPath:            strings.TrimSpace(os.Getenv("FLEET_KUBECONFIG")),
		KubeContext:               strings.TrimSpace(os.Getenv("FLEET_KUBECONTEXT")),
		ManagedObjectsEnabled:     envBool("MANAGED_OBJECTS_YAML_ENABLED", true),
		ManagedObjectsKubeconfigs: envBool("MANAGED_OBJECTS_DOWNSTREAM_KUBECONFIGS", false),
		ReconcileEnabled:          envBool("RECONCILE_ENABLED", true),
		NtfyBaseURL:               strings.TrimRight(os.Getenv("NTFY_BASE_URL"), "/"),
		NtfyTopic:                 os.Getenv("NTFY_TOPIC"),
		NtfyToken:                 os.Getenv("NTFY_TOKEN"),
		AppBaseURL:                strings.TrimRight(os.Getenv("APP_BASE_URL"), "/"),
		RequestTimeout:            envSeconds("REQUEST_TIMEOUT_SECONDS", 12),
		HTTPReadHeaderTimeout:     envSeconds("HTTP_READ_HEADER_TIMEOUT_SECONDS", 5),
		HTTPReadTimeout:           envSeconds("HTTP_READ_TIMEOUT_SECONDS", 15),
		HTTPWriteTimeout:          envSeconds("HTTP_WRITE_TIMEOUT_SECONDS", 90),
		HTTPIdleTimeout:           envSeconds("HTTP_IDLE_TIMEOUT_SECONDS", 60),
	}
}

func envSeconds(key string, fallback int) time.Duration {
	return time.Duration(envInt(key, fallback)) * time.Second
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
