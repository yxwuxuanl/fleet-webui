package main

import (
	"context"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"

	git "github.com/go-git/go-git/v5"
	"github.com/go-git/go-git/v5/plumbing"
	"github.com/go-git/go-git/v5/plumbing/object"
	"github.com/go-git/go-git/v5/plumbing/storer"
	"github.com/go-git/go-git/v5/plumbing/transport"
	githttp "github.com/go-git/go-git/v5/plumbing/transport/http"
	gitssh "github.com/go-git/go-git/v5/plumbing/transport/ssh"
	"github.com/go-git/go-git/v5/storage/memory"
)

var (
	errGitHistoryDisabled = errors.New("Git history is disabled by server configuration")
	errGitActionsDisabled = errors.New("GitRepo actions are disabled by server configuration")
)

const gitHistoryDisplayLimit = 10

func (c *FleetClient) getSecret(ctx context.Context, namespace, name string) (kubeSecret, error) {
	if c.apiMode != "kubernetes" {
		return kubeSecret{}, errors.New("Git credential Secrets require Kubernetes API mode")
	}
	var secret kubeSecret
	if err := c.do(ctx, http.MethodGet, c.coreItemURL("secrets", namespace, name), nil, "", &secret); err != nil {
		return kubeSecret{}, err
	}
	return secret, nil
}

func firstSecretValue(secret kubeSecret, keys ...string) string {
	for _, key := range keys {
		if value := strings.TrimSpace(string(secret.Data[key])); value != "" {
			return value
		}
	}
	return ""
}

func gitAuthFromSecret(repoURL string, secret kubeSecret) (transport.AuthMethod, func(), error) {
	cleanup := func() {}
	if strings.HasPrefix(repoURL, "http://") || strings.HasPrefix(repoURL, "https://") {
		username := firstSecretValue(secret, "username")
		password := firstSecretValue(secret, "password", "token")
		if password == "" {
			return nil, cleanup, errors.New("Git credential Secret has no password or token")
		}
		if username == "" {
			username = "git"
		}
		return &githttp.BasicAuth{Username: username, Password: password}, cleanup, nil
	}
	privateKey := secret.Data["ssh-privatekey"]
	if len(privateKey) == 0 {
		return nil, cleanup, errors.New("Git credential Secret has no ssh-privatekey")
	}
	username := "git"
	if parsed, err := url.Parse(repoURL); err == nil && parsed.User != nil && parsed.User.Username() != "" {
		username = parsed.User.Username()
	}
	auth, err := gitssh.NewPublicKeys(username, privateKey, firstSecretValue(secret, "ssh-privatekey-passphrase"))
	if err != nil {
		return nil, cleanup, fmt.Errorf("parse Git SSH private key: %w", err)
	}
	knownHosts := secret.Data["known_hosts"]
	if len(knownHosts) == 0 {
		return nil, cleanup, errors.New("Git credential Secret has no known_hosts; host verification is required")
	}
	file, err := os.CreateTemp("", "fleet-webui-known-hosts-*")
	if err != nil {
		return nil, cleanup, fmt.Errorf("prepare known_hosts: %w", err)
	}
	path := file.Name()
	cleanup = func() { _ = os.Remove(path) }
	if _, err := file.Write(knownHosts); err != nil {
		_ = file.Close()
		cleanup()
		return nil, func() {}, err
	}
	if err := file.Close(); err != nil {
		cleanup()
		return nil, func() {}, err
	}
	callback, err := gitssh.NewKnownHostsCallback(path)
	if err != nil {
		cleanup()
		return nil, func() {}, fmt.Errorf("parse known_hosts: %w", err)
	}
	auth.HostKeyCallback = callback
	return auth, cleanup, nil
}

func (c *FleetClient) gitRepoHistory(ctx context.Context, namespace, name string, limit int) ([]GitCommitView, error) {
	if !c.config.GitHistoryEnabled {
		return nil, errGitHistoryDisabled
	}
	repoResource, err := c.getGitRepo(ctx, namespace, name)
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(repoResource.Spec.Repo) == "" {
		return nil, errors.New("GitRepo has no repository URL")
	}
	var auth transport.AuthMethod
	cleanup := func() {}
	if repoResource.Spec.ClientSecretName != "" {
		secret, err := c.getSecret(ctx, namespace, repoResource.Spec.ClientSecretName)
		if err != nil {
			return nil, fmt.Errorf("load Git credential Secret: %w", err)
		}
		auth, cleanup, err = gitAuthFromSecret(repoResource.Spec.Repo, secret)
		if err != nil {
			return nil, err
		}
		defer cleanup()
	}
	if limit < 1 {
		limit = 30
	}
	if limit > 100 {
		limit = 100
	}
	options := &git.CloneOptions{URL: repoResource.Spec.Repo, Auth: auth, Depth: limit + 20, SingleBranch: true, NoCheckout: true}
	branch := strings.TrimSpace(repoResource.Spec.Branch)
	if branch != "" {
		options.ReferenceName = plumbing.NewBranchReferenceName(branch)
	}
	repository, err := git.CloneContext(ctx, memory.NewStorage(), nil, options)
	if err != nil {
		return nil, fmt.Errorf("read Git history: %w", err)
	}
	head, err := repository.Head()
	if err != nil {
		return nil, err
	}
	iterator, err := repository.Log(&git.LogOptions{From: head.Hash(), Order: git.LogOrderCommitterTime})
	if err != nil {
		return nil, err
	}
	defer iterator.Close()
	items := make([]GitCommitView, 0, limit)
	err = iterator.ForEach(func(commit *object.Commit) error {
		if len(items) >= limit {
			return storer.ErrStop
		}
		hash := commit.Hash.String()
		subject := strings.TrimSpace(strings.SplitN(commit.Message, "\n", 2)[0])
		items = append(items, GitCommitView{Hash: hash, ShortHash: shortCommit(hash), Author: commit.Author.Name, AuthoredAt: commit.Author.When.Format(time.RFC3339), Subject: subject, Current: hash == repoResource.Status.Commit, Pinned: repoResource.Spec.Revision != "" && hash == repoResource.Spec.Revision})
		return nil
	})
	if err != nil && !errors.Is(err, storer.ErrStop) {
		return nil, err
	}
	return items, nil
}

func (c *FleetClient) patchGitRepo(ctx context.Context, namespace, name string, spec map[string]any) (GitRepo, error) {
	for attempt := 0; attempt < 3; attempt++ {
		repo, err := c.getGitRepo(ctx, namespace, name)
		if err != nil {
			return GitRepo{}, err
		}
		patch := map[string]any{"metadata": map[string]any{"resourceVersion": repo.Metadata.ResourceVersion}, "spec": spec}
		payload, err := json.Marshal(patch)
		if err != nil {
			return GitRepo{}, err
		}
		var updated GitRepo
		err = c.do(ctx, http.MethodPatch, c.itemURL("gitrepos", namespace, name), strings.NewReader(string(payload)), "application/merge-patch+json", &updated)
		if err == nil {
			c.gitRepos.invalidate()
			return updated, nil
		}
		if !strings.Contains(err.Error(), "409") && !strings.Contains(strings.ToLower(err.Error()), "conflict") {
			return GitRepo{}, err
		}
	}
	return GitRepo{}, errors.New("GitRepo changed concurrently; please try again")
}

func (c *FleetClient) syncGitRepo(ctx context.Context, namespace, name string) (GitRepo, int64, error) {
	if !c.config.GitRepoActionsEnabled {
		return GitRepo{}, 0, errGitActionsDisabled
	}
	for attempt := 0; attempt < 3; attempt++ {
		repo, err := c.getGitRepo(ctx, namespace, name)
		if err != nil {
			return GitRepo{}, 0, err
		}
		next := repo.Spec.ForceSyncGeneration + 1
		patch := map[string]any{"metadata": map[string]any{"resourceVersion": repo.Metadata.ResourceVersion}, "spec": map[string]any{"forceSyncGeneration": next}}
		payload, err := json.Marshal(patch)
		if err != nil {
			return GitRepo{}, 0, err
		}
		var updated GitRepo
		err = c.do(ctx, http.MethodPatch, c.itemURL("gitrepos", namespace, name), strings.NewReader(string(payload)), "application/merge-patch+json", &updated)
		if err == nil {
			c.gitRepos.invalidate()
			return updated, next, nil
		}
		if !strings.Contains(err.Error(), "409") && !strings.Contains(strings.ToLower(err.Error()), "conflict") {
			return GitRepo{}, 0, err
		}
	}
	return GitRepo{}, 0, errors.New("GitRepo changed concurrently; please try sync again")
}

func (c *FleetClient) setGitRepoRevision(ctx context.Context, namespace, name, revision string) (GitRepo, error) {
	if !c.config.GitRepoActionsEnabled {
		return GitRepo{}, errGitActionsDisabled
	}
	if revision != "" {
		if len(revision) != 40 {
			return GitRepo{}, errors.New("revision must be a full 40-character commit hash")
		}
		if _, err := hex.DecodeString(revision); err != nil {
			return GitRepo{}, errors.New("revision is not a valid Git commit hash")
		}
		history, err := c.gitRepoHistory(ctx, namespace, name, 100)
		if err != nil {
			return GitRepo{}, err
		}
		found := false
		for _, commit := range history {
			if commit.Hash == revision {
				found = true
				break
			}
		}
		if !found {
			return GitRepo{}, errors.New("revision is not present in the loaded branch history")
		}
	}
	return c.patchGitRepo(ctx, namespace, name, map[string]any{"revision": revision})
}

func gitRepoPathValues(r *http.Request) (string, string, error) {
	namespace, name := r.PathValue("namespace"), r.PathValue("name")
	if namespace == "" || name == "" {
		return "", "", errors.New("namespace and name are required")
	}
	return namespace, name, nil
}

func (a *App) handleGitRepoHistory(w http.ResponseWriter, r *http.Request) {
	namespace, name, err := gitRepoPathValues(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	if !a.config.GitHistoryEnabled {
		repo, repoErr := a.fleet.getGitRepo(r.Context(), namespace, name)
		if repoErr != nil {
			writeError(w, http.StatusBadGateway, repoErr)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"items": []GitCommitView{}, "revision": repo.Spec.Revision, "branch": repo.Spec.Branch, "actionsEnabled": a.config.GitRepoActionsEnabled, "historyEnabled": false})
		return
	}
	items, err := a.fleet.gitRepoHistory(r.Context(), namespace, name, gitHistoryDisplayLimit)
	if err != nil {
		status := http.StatusBadGateway
		if errors.Is(err, errGitHistoryDisabled) {
			status = http.StatusServiceUnavailable
		}
		writeError(w, status, err)
		return
	}
	repo, err := a.fleet.getGitRepo(r.Context(), namespace, name)
	if err != nil {
		writeError(w, http.StatusBadGateway, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items, "revision": repo.Spec.Revision, "branch": repo.Spec.Branch, "actionsEnabled": a.config.GitRepoActionsEnabled, "historyEnabled": true})
}

func (a *App) handleGitRepoSync(w http.ResponseWriter, r *http.Request) {
	namespace, name, err := gitRepoPathValues(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	repo, generation, err := a.fleet.syncGitRepo(r.Context(), namespace, name)
	if err != nil {
		status := http.StatusBadGateway
		if errors.Is(err, errGitActionsDisabled) {
			status = http.StatusServiceUnavailable
		}
		writeError(w, status, err)
		return
	}
	writeJSON(w, http.StatusAccepted, map[string]any{"repository": gitRepoView(repo), "generation": generation, "sourceGeneration": repo.Metadata.Generation, "uid": repo.Metadata.UID})
}

func (a *App) handleGitRepoRevision(w http.ResponseWriter, r *http.Request) {
	namespace, name, err := gitRepoPathValues(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	var body struct {
		Revision string `json:"revision"`
	}
	if err := json.NewDecoder(io.LimitReader(r.Body, 8<<10)).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, errors.New("valid JSON revision body is required"))
		return
	}
	repo, err := a.fleet.setGitRepoRevision(r.Context(), namespace, name, strings.TrimSpace(body.Revision))
	if err != nil {
		status := http.StatusBadGateway
		if errors.Is(err, errGitActionsDisabled) {
			status = http.StatusServiceUnavailable
		}
		writeError(w, status, err)
		return
	}
	writeJSON(w, http.StatusAccepted, gitRepoDetailView(repo))
}
