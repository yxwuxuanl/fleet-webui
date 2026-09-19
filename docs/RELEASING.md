# Building and releasing Fleet WebUI

Repository: `yxwuxuanl/fleet-webui`
Image: `ghcr.io/yxwuxuanl/fleet-webui`
OCI chart: `oci://ghcr.io/yxwuxuanl/charts/fleet-webui`

## Triggers and artifacts

| Event | Workflow | Result |
| --- | --- | --- |
| Pull request | CI | Secret scan, frontend/Go checks, container smoke test, downloadable chart check artifact (7 days). No registry writes. |
| Push to `main` / manual build on `main` | Development build | Reuses CI, tests a development image and installs its chart in kind, pushes `sha-<full-commit>` to GHCR, uploads a chart and checksums (14 days). |
| Push `vX.Y.Z` or `vX.Y.Z-rc.N` / manual release on that existing tag | Release | Reuses CI, tests the versioned image/chart, publishes image and OCI chart, verifies anonymous downloads, then publishes GitHub Release assets. Prerelease tags create prereleases. |

The development chart uses `<base-version>-dev.<workflow-run-number>`; its `appVersion` is the exact `sha-<full-commit>` image tag. Development charts are workflow artifacts, not OCI releases. The chart's empty `image.tag` defaults to `appVersion`, so the downloaded chart references the image tested in that run. Explicit image overrides remain supported.

Images currently target **linux/amd64**. No moving `latest` image tag is published. Version tags and existing artifacts must not be overwritten.

## Repository setup

- Configure required checks for the reusable CI jobs: Secret scan, Build/test/Helm checks and Container smoke test. Select their actual contexts from a completed pull request run when configuring branch rules.
- The publishing jobs use `GITHUB_TOKEN` with `packages: write`. Only the Release publishing job also has `contents: write`; PR checks have read permission. No PAT or deployment credentials are needed by these workflows.
- On the first push of each GHCR package, set **both** the image package and `charts/fleet-webui` package to public in their package settings and link the chart package to this repository. Source repository visibility does not automatically make a new package public. A first run can stop at anonymous download verification until this setup is complete; then rerun it.
- Enable private vulnerability reporting and protect version tags from deletion or replacement.

Actions are pinned to commit SHAs. Docker builds use a GitHub Actions cache. The tested single-platform image is loaded locally and that same image is pushed; there is no second build between testing and publishing. The initial flow does not attach SBOM/provenance attestations. `build-info.json` records source identity and the registry image digest; it is metadata, not a cryptographic attestation.

## Prepare a release

1. Update chart `version` and `appVersion`, frontend package/lockfile version, raw deployment image and changelog together. Stable versions are `X.Y.Z`; previews can use `X.Y.Z-rc.N`. Build metadata (`+...`) is not accepted.
2. Merge the version commit to `main`, wait for Development build, then push a tag on that exact commit. For example, for the prepared 0.2.0 release:

   ```sh
   git tag v0.2.0
   git push origin v0.2.0
   ```

3. The tag automatically triggers Release. A manual recovery run must select that same tag:

   ```sh
   gh workflow run release.yml --repo yxwuxuanl/fleet-webui --ref v0.2.0
   ```

The workflow rejects branch runs, malformed versions, metadata mismatches and tags whose commits are not ancestors of `origin/main`. It checks the tag's source rather than the current branch head.

Publishing proceeds in this order: CI → build/reuse image → container test → package chart → kind installation and health/read-only check → push image → push/reuse OCI chart → anonymous image/chart downloads → checksums/artifact upload → complete GitHub Release. A draft Release is used only while uploading its attachments; it becomes public after the expected attachments have been verified.

The temporary Kubernetes test verifies startup, chart installation and the read-only switches. It has no real Fleet credentials and does not establish Rancher/Fleet compatibility. Record separately any real integration versions actually tested.

## Retries and partial failures

- Publishing runs for the same branch/tag are serialized; a newer push does not cancel a publishing run halfway through.
- An existing image is reused only when its source, full commit, version labels and architecture match. Conflicts stop the run. Authentication/network errors are not treated as permission to replace a tag.
- An existing OCI chart must have identical archived file contents, including source metadata. Its original archive is reused so the released checksums stay consistent despite packaging timestamps.
- An existing Release must contain the same source marker and matching attachments. A matching draft can resume missing uploads; published assets are never overwritten.
- Image, chart and Release publication are separate registry/API operations, not one atomic transaction. If a later step fails, earlier uploads remain available. Inspect the failing step and rerun the original tag; use a new version when source needs changing.
- Artifacts include the chart `.tgz`, `build-info.json`, `LICENSE`, `CHANGELOG.md` and `SHA256SUMS`. The final Release is published only after public downloads succeed.

## Install a published chart

Choose a version that appears on the repository's Releases page:

```sh
helm upgrade --install fleet-webui oci://ghcr.io/yxwuxuanl/charts/fleet-webui \
  --version 0.2.0 \
  --namespace cattle-fleet-system --create-namespace \
  --set reconcile.enabled=false --set gitRepoActions.enabled=false
```

For a development build, download its workflow artifact, verify `SHA256SUMS`, then install the included `.tgz`. Its image is pinned to the source commit.

## Local validation

```sh
make test
make chart-test
python3 -m unittest discover -s scripts -p 'test_*.py' -v
bash -n scripts/smoke-container.sh scripts/smoke-chart.sh
actionlint
gitleaks git --redact --log-opts='--all' .
gitleaks dir --redact .
```

Official references: [GitHub image publishing](https://docs.github.com/en/actions/tutorials/publish-packages/publish-docker-images), [GHCR authentication and visibility](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry), [Helm OCI registries](https://docs.helm.sh/docs/topics/registries/).
