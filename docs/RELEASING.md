# Releasing Fleet WebUI

Repository: `yxwuxuanl/fleet-webui`  
Container: `ghcr.io/yxwuxuanl/fleet-webui`  
First planned version: `0.1.0` (preview)

The source tree targets this version; it does not imply that its image is already published.

## First repository setup

1. Create the GitHub repository and push the reviewed source. Enable private vulnerability reporting under Security settings.
2. Require the `Secret scan`, `Build, test and Helm checks` and `Container smoke test` checks on the main branch.
3. Confirm Actions can write packages and draft releases for the manually triggered release workflow. PR checks only have read permission and use no deployment credentials.
4. Review code/assets provenance, third-party notices and the redacted secret-scan results, including all history selected for publication.
5. Run the Docker smoke test and test Fleet integration against a disposable cluster. Record the exact Rancher/Fleet/Kubernetes versions actually tested in the release notes.

## Local checks

```sh
make test
make chart-test
docker build -t fleet-webui:release-check .
bash scripts/smoke-container.sh fleet-webui:release-check
```

If Gitleaks is installed, scan both history and working files before public upload:

```sh
gitleaks git --redact --log-opts='--all' .
gitleaks dir --redact .
```

Do not publish active credentials. Rotate any exposed credential before deciding whether history needs rewriting. Do not force-push or rewrite history as part of an ordinary release.

## Prepare a preview release

1. Update `Chart.yaml` version/appVersion, chart image tag, `deploy/rbac.yaml`, frontend package version/lockfile and changelog together. The versioned image tag has no `v` prefix.
2. Merge the release commit and wait for CI. Create and push the corresponding tag, for example `v0.1.0`, on that exact commit.
3. Run **Actions → Prepare release → Run workflow** against that tag and enter `0.1.0` as the version. From the CLI:

```sh
gh workflow run release.yml --repo yxwuxuanl/fleet-webui --ref v0.1.0 -f version=0.1.0
```

The workflow rejects branch runs and version mismatches, reruns CI, builds and smoke-tests the `linux/amd64` image on an Ubuntu runner, pushes `ghcr.io/yxwuxuanl/fleet-webui:0.1.0`, and creates a **draft prerelease** containing the Helm package, license, changelog and SHA256 checksums. It does not update `latest` or publish the Release page automatically. The image is pushed before the draft is created; inspect GHCR visibility separately.

4. Review the draft, replace generated notes with verified installation instructions, compatibility results and known limitations, then publish it. Verify anonymous image pulling if the package is intended to be public.
5. Do not move an existing version tag or overwrite a published version. If a run fails after pushing an image, inspect that tag and the workflow logs before retrying. Existing Release objects are rejected by the workflow and require explicit operator handling.

## Install the published image

Only after the image exists:

```sh
helm upgrade --install fleet-webui ./charts/fleet-webui \
  --namespace cattle-fleet-system --create-namespace \
  --set image.repository=ghcr.io/yxwuxuanl/fleet-webui \
  --set image.tag=0.1.0 \
  --set reconcile.enabled=false --set gitRepoActions.enabled=false
```

For architecture support beyond `linux/amd64`, add build and runtime validation before advertising it.

The GHCR workflow follows [GitHub's container publishing guide](https://docs.github.com/en/actions/tutorials/publish-packages/publish-docker-images).
