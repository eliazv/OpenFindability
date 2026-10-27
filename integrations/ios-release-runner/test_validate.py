import copy
import json
import re
import unittest
from pathlib import Path
from validate import validate


class RunnerPolicyTests(unittest.TestCase):
    def test_actions_are_pinned_to_immutable_commits(self):
        workflow = Path(__file__).with_name("release-ios.yml").read_text()
        refs = re.findall(r"uses:\s+([^\s]+)", workflow)
        self.assertGreater(len(refs), 5)
        self.assertTrue(all(re.fullmatch(r"[^@]+@[a-f0-9]{40}", ref) for ref in refs))

    def setUp(self):
        self.apps = json.loads(Path(__file__).with_name("apps.json").read_text())
        self.inputs = dict(slug="scadenzario", sha="a" * 40, mode="unsigned", build_name="1.2.3", build_number="104", correlation_id="12345678-1234-1234-1234-123456789abc")

    def enabled(self):
        apps = copy.deepcopy(self.apps)
        apps["scadenzario"].update(enabled=True, appId=123, xcodeVersion="26.0", approvedShas=["a" * 40])
        return apps

    def test_template_cannot_release(self):
        with self.assertRaises(ValueError):
            validate(self.apps, self.inputs)

    def test_explicitly_approved_commit(self):
        self.assertEqual(validate(self.enabled(), self.inputs)["teamId"], "TP72E87G5R")

    def test_arbitrary_commit_and_pull_ref_rejected(self):
        for sha in ["b" * 40, "refs/pull/1/head", "main"]:
            with self.assertRaises(ValueError):
                validate(self.enabled(), dict(self.inputs, sha=sha))

    def test_path_and_shell_inputs_rejected(self):
        for key, value in [("workingDirectory", "../escape"), ("workingDirectory", "/tmp"), ("repository", "owner/repo;echo bad"), ("scheme", "$(bad)")]:
            apps = self.enabled()
            apps["scadenzario"][key] = value
            with self.assertRaises(ValueError):
                validate(apps, self.inputs)

    def test_missing_extension_mapping_rejected(self):
        apps = self.enabled()
        del apps["scadenzario"]["targets"]["ScadenzarioWidget"]
        with self.assertRaises(ValueError):
            validate(apps, self.inputs)

    def test_production_and_invalid_versions_rejected(self):
        for key, value in [("mode", "production"), ("build_name", "1.2.3;echo bad"), ("build_number", "-1"), ("slug", "../scadenzario")]:
            with self.assertRaises(ValueError):
                validate(self.enabled(), dict(self.inputs, **{key: value}))


if __name__ == "__main__":
    unittest.main()
