package main

import (
	"context"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// imageTag excludes registry ports and digests, neither of which is a version.
func imageTag(image string) string {
	image, _, _ = strings.Cut(image, "@")
	lastSlash := strings.LastIndex(image, "/")
	lastColon := strings.LastIndex(image, ":")
	if lastColon <= lastSlash {
		return ""
	}
	return image[lastColon+1:]
}

func (c *FleetClient) fleetVersion(ctx context.Context) string {
	versions, err := c.version.load(ctx, time.Minute, func(ctx context.Context) ([]string, error) {
		namespace := c.config.FleetSystemNamespace
		if namespace == "" {
			namespace = "cattle-fleet-system"
		}
		endpoint := c.baseURL + "/apis/apps/v1/namespaces/" + url.PathEscape(namespace) + "/deployments/fleet-controller"
		if c.apiMode == "steve" {
			endpoint = c.baseURL + "/v1/apps.deployment/" + url.PathEscape(namespace) + "/fleet-controller"
		}
		var deployment struct {
			Spec struct {
				Template struct {
					Spec struct {
						Containers []struct {
							Name  string `json:"name"`
							Image string `json:"image"`
						} `json:"containers"`
					} `json:"spec"`
				} `json:"template"`
			} `json:"spec"`
		}
		// Version discovery is optional and must not hold up the health probe.
		ctx, cancel := context.WithTimeout(ctx, 2*time.Second)
		defer cancel()
		version := ""
		if err := c.do(ctx, http.MethodGet, endpoint, nil, "", &deployment); err == nil {
			for _, container := range deployment.Spec.Template.Spec.Containers {
				if container.Name == "fleet-controller" {
					version = imageTag(container.Image)
					break
				}
			}
		}
		// Cache unavailable results too, to avoid retrying denied reads on every visit.
		return []string{version}, nil
	})
	if err != nil || len(versions) == 0 {
		return ""
	}
	return versions[0]
}

func (a *App) handleFleetVersion(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"version": a.fleet.fleetVersion(r.Context())})
}
