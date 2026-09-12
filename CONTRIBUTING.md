# Contributing

Fleet WebUI is an independent console for Rancher Fleet. Small, focused fixes and reproducible bug reports are welcome.

## Development

Install Go 1.27+, Node.js 22.12+, npm and Helm. Docker is needed for image validation.

```sh
make run
```

For live frontend development, run `npm --prefix frontend run dev` in a second terminal. The production frontend is embedded in the Go binary, so rebuild it before validating the packaged app.

Use a test Fleet cluster and a least-privilege identity. To inspect resources without writes:

```sh
RECONCILE_ENABLED=false GIT_REPO_ACTIONS_ENABLED=false make run
```

## Before submitting a pull request

```sh
gofmt -w ./*.go
make test
make chart-test
docker build -t fleet-webui:check .
bash scripts/smoke-container.sh fleet-webui:check
```

The Go suite uses local mock services; it does not require cluster credentials. Helm tests check that a read-only deployment disables both write endpoints and grants no write verbs. CI also builds and starts the production container without credentials.

For frontend changes, exercise affected controls in a browser, including slow requests and switching resources when relevant. Include the expected and actual behavior, test results, and any remaining limitations in the PR description. Keep screenshots and logs free of private data.

Changes to configuration should update `.env.example`, Helm values/templates and both READMEs together. Keep generated `frontend/dist/`, dependencies and binaries out of Git. Do not add files under the removed `web/` directory.

## Security and licensing

Follow [SECURITY.md](SECURITY.md) for vulnerability reports. Contributions to project-owned code are under the [MIT license](LICENSE). Preserve third-party copyright and license notices; identify the source of imported components and assets.
