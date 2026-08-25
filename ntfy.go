package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
)

type ntfyMessage struct {
	Topic      string   `json:"topic"`
	Title      string   `json:"title"`
	Message    string   `json:"message"`
	Priority   int      `json:"priority"`
	Tags       []string `json:"tags"`
	Click      string   `json:"click,omitempty"`
	SequenceID string   `json:"sequence_id"`
}

func (a *App) notifyReconcile(ctx context.Context, bundle BundleView, generation int64, requester string) error {
	if a.config.NtfyBaseURL == "" || a.config.NtfyTopic == "" {
		return nil
	}
	click := ""
	if a.config.AppBaseURL != "" {
		click = a.config.AppBaseURL + "/?bundle=" + url.QueryEscape(bundle.Namespace+"/"+bundle.Name)
	}
	message := ntfyMessage{
		Topic: a.config.NtfyTopic, Title: "[Fleet] Bundle reconcile triggered", Priority: 3,
		Tags: []string{"loudspeaker", "fleet"}, Click: click,
		SequenceID: "reconcile-" + safeID(bundle.Namespace) + "-" + safeID(bundle.Name) + "-" + strconv.FormatInt(generation, 10),
		Message:    fmt.Sprintf("Bundle: %s/%s\nGitRepo: %s\nCommit: %s\nGeneration: %d\nRequested by: %s\nTime: %s", bundle.Namespace, bundle.Name, emptyAs(bundle.GitRepo, "—"), emptyAs(bundle.Commit, "—"), generation, requester, time.Now().Format(time.RFC3339)),
	}
	payload, err := json.Marshal(message)
	if err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, a.config.NtfyBaseURL+"/", strings.NewReader(string(payload)))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	if a.config.NtfyToken != "" {
		req.Header.Set("Authorization", "Bearer "+a.config.NtfyToken)
	}
	client := &http.Client{Timeout: a.config.RequestTimeout}
	response, err := client.Do(req)
	if err != nil {
		return err
	}
	defer response.Body.Close()
	if response.StatusCode < http.StatusOK || response.StatusCode >= http.StatusMultipleChoices {
		body, _ := io.ReadAll(io.LimitReader(response.Body, 8<<10))
		return fmt.Errorf("ntfy returned %s: %s", response.Status, strings.TrimSpace(string(body)))
	}
	return nil
}

func emptyAs(value, fallback string) string {
	if value == "" {
		return fallback
	}
	return value
}

func safeID(value string) string {
	value = strings.ToLower(value)
	var output strings.Builder
	for _, runeValue := range value {
		if (runeValue >= 'a' && runeValue <= 'z') || (runeValue >= '0' && runeValue <= '9') || runeValue == '-' || runeValue == '_' {
			output.WriteRune(runeValue)
		} else {
			output.WriteByte('-')
		}
	}
	return strings.Trim(output.String(), "-")
}
