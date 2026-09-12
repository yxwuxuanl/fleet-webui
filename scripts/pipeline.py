#!/usr/bin/env python3
"""Build/release helpers. Uses Python's standard library and the runner CLIs."""

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tarfile
import tempfile


OUT = Path("release-output")
CONTEXT = OUT / "context.json"
SEMVER = re.compile(r"(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-([0-9A-Za-z.-]+))?")


def run(*args, check=True):
    result = subprocess.run(args, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if check and result.returncode:
        raise RuntimeError(f"{args[0]} failed: {result.stderr.strip()}")
    return result


def valid_version(version):
    match = SEMVER.fullmatch(version)
    if not match:
        return False
    return not match[4] or all(
        item and (not item.isdigit() or item == "0" or not item.startswith("0"))
        for item in match[4].split(".")
    )


def chart_field(chart, name):
    # Helm normalizes these top-level scalar fields; versions cannot contain YAML syntax.
    value = re.search(rf"^{name}:\s*(.*?)\s*$", run("helm", "show", "chart", str(chart)).stdout, re.M)
    if not value:
        raise ValueError(f"Missing chart field: {name}")
    return value[1].strip("\"'")


def output(**values):
    if os.environ.get("GITHUB_OUTPUT"):
        with open(os.environ["GITHUB_OUTPUT"], "a") as stream:
            for key, value in values.items():
                stream.write(f"{key}={value}\n")


def context():
    return json.loads(CONTEXT.read_text())


def prepare(mode):
    revision = run("git", "rev-parse", "HEAD").stdout.strip()
    repository = os.environ["GITHUB_REPOSITORY"].lower()
    if not re.fullmatch(r"[a-z0-9_.-]+/[a-z0-9_.-]+", repository):
        raise ValueError("Invalid repository")
    base = chart_field("charts/fleet-webui", "version")
    if not valid_version(base):
        raise ValueError("Chart version must be SemVer without build metadata")
    if mode == "release":
        tag = os.environ["GITHUB_REF_NAME"]
        version = tag.removeprefix("v")
        if os.environ["GITHUB_REF_TYPE"] != "tag" or tag != "v" + version or not valid_version(version):
            raise ValueError("Select an existing vX.Y.Z or vX.Y.Z-rc.N tag")
        requested = os.environ.get("REQUESTED_VERSION", "")
        if requested and requested != version:
            raise ValueError("Input version does not match the selected tag")
        run("git", "merge-base", "--is-ancestor", revision, "origin/main")
        if base != version or chart_field("charts/fleet-webui", "appVersion") != version:
            raise ValueError("Tag, Chart version and appVersion must match")
        for package in ("frontend/package.json", "frontend/package-lock.json"):
            data = json.loads(Path(package).read_text())
            if data["version"] != version or data.get("packages", {}).get("", {}).get("version", version) != version:
                raise ValueError(f"Version mismatch in {package}")
        image_tag = version
    else:
        if os.environ["GITHUB_REF"] != "refs/heads/main":
            raise ValueError("Development publishing requires main")
        number = os.environ["GITHUB_RUN_NUMBER"]
        if not number.isdigit():
            raise ValueError("Invalid run number")
        version = f"{base.split('-')[0]}-dev.{number}"
        image_tag = f"sha-{revision}"
    data = dict(mode=mode, version=version, revision=revision, repository=repository,
                image=f"ghcr.io/{repository}:{image_tag}", imageTag=image_tag,
                chartRegistry=f"oci://ghcr.io/{repository.split('/')[0]}/charts",
                source=f"https://github.com/{repository}")
    OUT.mkdir(exist_ok=True)
    CONTEXT.write_text(json.dumps(data, indent=2) + "\n")
    output(version=version, image=data["image"], image_tag=image_tag, revision=revision,
           chart=f"{OUT}/fleet-webui-{version}.tgz")


def missing_manifest(result):
    # Authentication, rate limits and transport errors must never authorize overwriting a tag.
    return bool(re.search(r"manifest unknown|no such manifest|name unknown|: not found", result.stderr, re.I))


def image_check():
    data = context()
    result = run("docker", "manifest", "inspect", data["image"], check=False)
    if result.returncode:
        if not missing_manifest(result):
            raise RuntimeError(f"Cannot determine whether image exists: {result.stderr}")
        output(reuse="false")
        return
    run("docker", "pull", "--platform", "linux/amd64", data["image"])
    image = json.loads(run("docker", "image", "inspect", data["image"]).stdout)[0]
    labels = image["Config"].get("Labels") or {}
    for key, expected in {"revision": data["revision"], "source": data["source"], "version": data["imageTag"]}.items():
        if labels.get(f"org.opencontainers.image.{key}") != expected:
            raise ValueError(f"Existing image has conflicting {key}; refusing to overwrite")
    if image["Os"] != "linux" or image["Architecture"] != "amd64":
        raise ValueError("Existing image has an unexpected platform")
    output(reuse="true")


def package_chart():
    data = context()
    with tempfile.TemporaryDirectory() as directory:
        chart = Path(directory) / "fleet-webui"
        shutil.copytree("charts/fleet-webui", chart)
        # Record source identity inside the archive for safe retries and provenance inspection.
        (chart / "build-info.json").write_text(json.dumps({
            key: data[key] for key in ("repository", "revision", "version", "image", "imageTag")
        }, indent=2, sort_keys=True) + "\n")
        run("helm", "package", str(chart), "--version", data["version"],
            "--app-version", data["imageTag"], "--destination", str(OUT))
    archive = OUT / f"fleet-webui-{data['version']}.tgz"
    run("helm", "lint", str(archive))
    rendered = run("helm", "template", "fleet-webui", str(archive)).stdout
    if f'image: "{data["image"]}"' not in rendered:
        raise ValueError("Packaged chart does not reference the expected image")


def archive_contents(path):
    with tarfile.open(path) as archive:
        files = {}
        for member in archive:
            if member.isfile():
                if member.name in files:
                    raise ValueError("Duplicate chart archive entry")
                files[member.name] = archive.extractfile(member).read()
        return files


def chart_publish():
    data = context()
    archive = OUT / f"fleet-webui-{data['version']}.tgz"
    reference = f"{data['chartRegistry']}/fleet-webui"
    with tempfile.TemporaryDirectory() as directory:
        existing = run("helm", "pull", reference, "--version", data["version"], "--destination", directory, check=False)
        if existing.returncode == 0:
            downloaded = Path(directory) / archive.name
            if archive_contents(downloaded) != archive_contents(archive):
                raise ValueError("Published chart differs; refusing to overwrite this version")
            shutil.copyfile(downloaded, archive)
        elif missing_manifest(existing):
            run("helm", "push", str(archive), data["chartRegistry"])
        else:
            raise RuntimeError(f"Cannot determine whether chart exists: {existing.stderr}")


def verify_public():
    data = context()
    # Fresh CLI homes ensure that public consumers can retrieve the published artifacts.
    with tempfile.TemporaryDirectory() as directory:
        run("docker", "--config", directory, "pull", "--platform", "linux/amd64", data["image"])
        if data["mode"] == "release":
            archive = OUT / f"fleet-webui-{data['version']}.tgz"
            run("helm", "pull", f"{data['chartRegistry']}/fleet-webui", "--version", data["version"],
                "--registry-config", f"{directory}/registry.json", "--destination", directory)
            if hashlib.sha256((Path(directory) / archive.name).read_bytes()).digest() != hashlib.sha256(archive.read_bytes()).digest():
                raise ValueError("Public chart differs from release artifact")


def checksums():
    data = context()
    digests = json.loads(run("docker", "image", "inspect", "--format", "{{json .RepoDigests}}", data["image"]).stdout)
    prefix = data["image"].rsplit(":", 1)[0] + "@"
    digest = next((item[len(prefix):] for item in digests if item.startswith(prefix)), None)
    if not digest:
        raise ValueError("Published image digest unavailable")
    data["imageDigest"] = digest
    (OUT / "build-info.json").write_text(json.dumps(data, indent=2, sort_keys=True) + "\n")
    for name in ("LICENSE", "CHANGELOG.md"):
        shutil.copyfile(name, OUT / name)
    files = sorted([*OUT.glob("*.tgz"), OUT / "build-info.json", OUT / "LICENSE", OUT / "CHANGELOG.md"])
    (OUT / "SHA256SUMS").write_text("".join(f"{hashlib.sha256(path.read_bytes()).hexdigest()}  {path.name}\n" for path in files))


def publish_release():
    data = json.loads((OUT / "build-info.json").read_text())
    tag = "v" + data["version"]
    marker = f"<!-- fleet-webui-release:{data['revision']} -->"
    result = run("gh", "release", "view", tag, "--json", "body,isDraft,isPrerelease,assets", check=False)
    if result.returncode:
        if "release not found" not in result.stderr.lower():
            raise RuntimeError(f"Cannot determine whether Release exists: {result.stderr}")
        notes = OUT / "notes.md"
        notes.write_text(f"""{marker}
Image: `{data['image']}`  
Digest: `{data['imageDigest']}`  
Source commit: `{data['revision']}`

```sh
helm upgrade --install fleet-webui {data['chartRegistry']}/fleet-webui \\
  --version {data['version']} --namespace cattle-fleet-system --create-namespace \\
  --set reconcile.enabled=false --set gitRepoActions.enabled=false
```

Validated on linux/amd64 with the CI kind cluster. This checks chart installation,
container startup and read-only settings; it does not certify a Rancher/Fleet compatibility matrix.
""")
        args = ["gh", "release", "create", tag, "--verify-tag", "--draft", "--title", f"Fleet WebUI {tag}",
                "--notes-file", str(notes), "--generate-notes"]
        if "-" in data["version"]:
            args.append("--prerelease")
        run(*args)
        current = {"body": marker, "isDraft": True, "isPrerelease": "-" in data["version"], "assets": []}
    else:
        current = json.loads(result.stdout)
    if marker not in current["body"] or current["isPrerelease"] != ("-" in data["version"]):
        raise ValueError("Existing Release does not belong to this build")
    names = {asset["name"] for asset in current["assets"]}
    files = [*OUT.glob("*.tgz"), *(OUT / name for name in ("build-info.json", "LICENSE", "CHANGELOG.md", "SHA256SUMS"))]
    with tempfile.TemporaryDirectory() as directory:
        for path in files:
            if path.name in names:
                run("gh", "release", "download", tag, "--pattern", path.name, "--dir", directory)
                if (Path(directory) / path.name).read_bytes() != path.read_bytes():
                    raise ValueError(f"Conflicting Release attachment: {path.name}")
            else:
                if not current["isDraft"]:
                    raise ValueError("Published Release is missing an expected attachment")
                run("gh", "release", "upload", tag, str(path))
    if current["isDraft"]:
        run("gh", "release", "edit", tag, "--draft=false")
    if os.environ.get("GITHUB_STEP_SUMMARY"):
        with open(os.environ["GITHUB_STEP_SUMMARY"], "a") as stream:
            stream.write(f"Published [{tag}]({data['source']}/releases/tag/{tag})\n\nImage: `{data['image']}@{data['imageDigest']}`\n")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=["prepare", "image-check", "package", "chart-publish", "verify-public", "checksums", "release"])
    parser.add_argument("--mode", choices=["development", "release"], default="development")
    args = parser.parse_args()
    if args.command == "prepare":
        prepare(args.mode)
    else:
        {"image-check": image_check, "package": package_chart, "chart-publish": chart_publish,
         "verify-public": verify_public, "checksums": checksums, "release": publish_release}[args.command]()


if __name__ == "__main__":
    main()
