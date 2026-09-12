import io
import json
from pathlib import Path
import subprocess
import tarfile
import tempfile
import unittest
from unittest.mock import patch

import pipeline


class PublishingGuards(unittest.TestCase):
    def test_semver_accepts_stable_and_prerelease(self):
        for version in ("0.1.0", "1.2.3-rc.1", "1.0.0-beta", "2.0.0-0"):
            self.assertTrue(pipeline.valid_version(version), version)

    def test_semver_rejects_ambiguous_or_unsafe_tags(self):
        for version in ("v1.2.3", "01.2.3", "1.2", "1.2.3-rc..1", "1.2.3-01", "1.2.3+build", "1.2.3\n", "$(id)"):
            self.assertFalse(pipeline.valid_version(version), version)

    def test_absence_is_distinct_from_authentication_and_network_errors(self):
        for message in ("manifest unknown", "no such manifest: ghcr.io/org/app:1", "name unknown", "ghcr.io/org/chart:1: not found"):
            self.assertTrue(pipeline.missing_manifest(subprocess.CompletedProcess([], 1, "", message)))
        for message in ("unauthorized", "denied", "TLS handshake timeout", "rate limit exceeded", "repository access denied"):
            self.assertFalse(pipeline.missing_manifest(subprocess.CompletedProcess([], 1, "", message)))

    def image_result(self, revision="abc"):
        return [{"Config": {"Labels": {
            "org.opencontainers.image.revision": revision,
            "org.opencontainers.image.source": "https://github.com/owner/repo",
            "org.opencontainers.image.version": "1.0.0",
        }}, "Os": "linux", "Architecture": "amd64"}]

    def check_image(self, revision):
        responses = [subprocess.CompletedProcess([], 0, "{}", ""),
                     subprocess.CompletedProcess([], 0, "", ""),
                     subprocess.CompletedProcess([], 0, json.dumps(self.image_result(revision)), "")]
        data = dict(image="ghcr.io/owner/repo:1.0.0", revision="abc",
                    source="https://github.com/owner/repo", imageTag="1.0.0")
        with patch.object(pipeline, "context", return_value=data), patch.object(pipeline, "run", side_effect=responses), patch.object(pipeline, "output") as output:
            pipeline.image_check()
            return output

    def test_same_commit_image_is_reused(self):
        self.check_image("abc").assert_called_once_with(reuse="true")

    def test_conflicting_image_is_not_overwritten(self):
        with self.assertRaisesRegex(ValueError, "conflicting revision"):
            self.check_image("different-commit")

    def test_archive_comparison_ignores_timestamps_but_detects_content_changes(self):
        with tempfile.TemporaryDirectory() as directory:
            paths = [Path(directory) / str(index) for index in range(3)]
            for index, path in enumerate(paths):
                with tarfile.open(path, "w:gz") as archive:
                    content = b"same" if index < 2 else b"different"
                    info = tarfile.TarInfo("fleet-webui/build-info.json")
                    info.mtime = index
                    info.size = len(content)
                    archive.addfile(info, io.BytesIO(content))
            self.assertEqual(pipeline.archive_contents(paths[0]), pipeline.archive_contents(paths[1]))
            self.assertNotEqual(pipeline.archive_contents(paths[0]), pipeline.archive_contents(paths[2]))

    def test_development_package_references_the_commit_image(self):
        data = dict(mode="development", version="0.1.0-dev.42", revision="abc", repository="yxwuxuanl/fleet-webui",
                    image="ghcr.io/yxwuxuanl/fleet-webui:sha-abc", imageTag="sha-abc")
        with tempfile.TemporaryDirectory() as directory, patch.object(pipeline, "OUT", Path(directory)), patch.object(pipeline, "context", return_value=data):
            pipeline.package_chart()
            archive = Path(directory) / "fleet-webui-0.1.0-dev.42.tgz"
            self.assertEqual(pipeline.chart_field(archive, "version"), data["version"])
            self.assertEqual(pipeline.chart_field(archive, "appVersion"), data["imageTag"])
            files = pipeline.archive_contents(archive)
            self.assertEqual(json.loads(files["fleet-webui/build-info.json"])["revision"], "abc")

    def test_public_verification_uses_empty_registry_credentials(self):
        data = dict(mode="development", image="ghcr.io/owner/repo:sha-abc")
        with patch.object(pipeline, "context", return_value=data), patch.object(pipeline, "run") as run:
            pipeline.verify_public()
            args = run.call_args.args
            self.assertEqual(args[:2], ("docker", "--config"))
            self.assertEqual(args[3:], ("pull", "--platform", "linux/amd64", data["image"]))


if __name__ == "__main__":
    unittest.main()
