"""Offline security checks; does not require macOS, network or Codemagic credentials."""
import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import codemagic_runner

APP = {
    "enabled": True,
    "repository": "example/app",
    "appId": 12345,
    "teamId": "ABCDEFGHIJ",
    "bundleIds": ["com.example.app"],
    "framework": "flutter",
    "workingDirectory": ".",
    "flutterVersion": "3.38.0",
    "xcodeVersion": "26.6",
    "scheme": "Runner",
    "targets": {"Runner": "com.example.app"},
    "approvedShas": ["a" * 40],
}
ENV = {
    "SLUG": "test",
    "SHA": "a" * 40,
    "MODE": "unsigned",
    "BUILD_NAME": "1.2.3",
    "BUILD_NUMBER": "12",
    "CORRELATION_ID": "11111111-1111-4111-8111-111111111111",
}


class CodemagicRunnerTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        (self.root / "apps.json").write_text(json.dumps({"test": APP}))
        self.patched_root = patch.object(codemagic_runner, "ROOT", self.root)
        self.patched_root.start()
        self.addCleanup(self.patched_root.stop)

    def test_rejects_incorrect_scope_before_git_clone(self):
        with patch.dict(os.environ, {**ENV, "MODE": "testflight", "SOURCE_READ_TOKEN": "token"}):
            with self.assertRaisesRegex(ValueError, "Unsigned workflow"):
                codemagic_runner.checkout("unsigned")

    def test_rejects_unapproved_commit_before_git_clone(self):
        with patch.dict(os.environ, {**ENV, "SHA": "b" * 40, "SOURCE_READ_TOKEN": "token"}):
            with self.assertRaisesRegex(ValueError, "approved"):
                codemagic_runner.checkout("unsigned")

    def test_rejects_missing_source_token(self):
        with patch.dict(os.environ, ENV, clear=True):
            with self.assertRaisesRegex(ValueError, "SOURCE_READ_TOKEN"):
                codemagic_runner.checkout("unsigned")

    def test_rejects_clone_over_existing_source(self):
        (self.root / "source").mkdir()
        with patch.dict(os.environ, {**ENV, "SOURCE_READ_TOKEN": "token"}):
            with self.assertRaisesRegex(ValueError, "already exists"):
                codemagic_runner.checkout("unsigned")


if __name__ == "__main__":
    unittest.main()
