"""Codemagic adapter for the central iOS runner.

Run 'policy', then 'checkout --scope unsigned|signed', before executing any application code.
The approved source repository/SHA come ONLY from RUNNER_APPS_B64, sent by the release CLI.
No signing credentials are read by this script.
"""
import base64
import json
import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path

from validate import validate

ROOT = Path(__file__).resolve().parent


def write_policy():
    # The real identities stay out of the public repo: the release CLI sends them with
    # each build and this disposable machine replaces the tracked example.
    policy = os.environ.get("RUNNER_APPS_B64", "")
    if not policy:
        raise ValueError("RUNNER_APPS_B64 is missing: start builds from the OpenFindability release CLI.")
    try:
        apps = json.loads(base64.b64decode(policy, validate=True))
    except ValueError:
        raise ValueError("RUNNER_APPS_B64 is not valid base64 JSON.") from None
    if not isinstance(apps, dict):
        raise ValueError("RUNNER_APPS_B64 must be an object keyed by slug.")
    (ROOT / "apps.json").write_text(json.dumps(apps), encoding="utf-8")


def approved():
    inputs = {key: os.environ[key.upper()] for key in
              ("slug", "sha", "mode", "build_name", "build_number", "correlation_id")}
    apps = json.loads((ROOT / "apps.json").read_text(encoding="utf-8"))
    return validate(apps, inputs)


def git(args, env=None):
    # Token is provided by GIT_ASKPASS and must NEVER be placed in argv.
    process = subprocess.run(["git", *args], cwd=ROOT, env=env, capture_output=True, text=True)
    if process.returncode:
        raise RuntimeError("Git checkout failed; inspect repository access, approved SHA and network.")
    return process.stdout.strip()


def checkout(scope):
    app = approved()
    mode = os.environ["MODE"]
    if scope == "unsigned" and mode != "unsigned":
        raise ValueError("Unsigned workflow cannot sign or upload.")
    if scope == "signed" and mode not in ("build", "testflight"):
        raise ValueError("Signed workflow requires explicit build/testflight mode.")
    if scope not in ("unsigned", "signed"):
        raise ValueError("Invalid workflow scope.")

    token = os.environ.get("SOURCE_READ_TOKEN", "")
    if not token or "\n" in token or "\r" in token:
        raise ValueError("SOURCE_READ_TOKEN must be configured as an encrypted read-only Codemagic secret.")
    source = ROOT / "source"
    if source.exists():
        raise ValueError("Source checkout already exists: refusing ambiguous state.")

    with tempfile.TemporaryDirectory(prefix="codemagic-git-") as temp:
        askpass = Path(temp) / "askpass.sh"
        askpass.write_text("#!/bin/sh\n"
                           "case \"$1\" in\n"
                           "  *Username*) printf 'x-access-token\\n' ;;\n"
                           "  *) printf '%s\\n' \"$SOURCE_READ_TOKEN\" ;;\n"
                           "esac\n", encoding="utf-8")
        askpass.chmod(0o700)
        env = os.environ.copy()
        env.update({"GIT_ASKPASS": str(askpass), "GIT_TERMINAL_PROMPT": "0"})
        git(["init", "--quiet", "source"], env)
        # No arbitrary URL from build parameters: only the validated allowlist.
        git(["-C", "source", "remote", "add", "origin",
             "https://github.com/" + app["repository"] + ".git"], env)
        git(["-C", "source", "fetch", "--quiet", "--depth", "1", "origin", os.environ["SHA"]], env)
        git(["-C", "source", "checkout", "--quiet", "--detach", "FETCH_HEAD"], env)
        actual = git(["-C", "source", "rev-parse", "HEAD"], env)
        if actual != os.environ["SHA"]:
            raise ValueError("Fetched source SHA differs from approved SHA.")
    print("Approved source checked out at " + actual[:12])


def check_toolchain():
    app = approved()
    xcode = subprocess.check_output(["xcodebuild", "-version"], text=True).splitlines()[0]
    match = re.match(r"Xcode (\d+(?:\.\d+){0,2})", xcode)
    expected = app["xcodeVersion"]
    def version_tuple(value):
        parts = [int(part) for part in value.split(".")]
        while len(parts) > 2 and parts[-1] == 0:
            parts.pop()
        return tuple(parts)
    if not match or version_tuple(match.group(1)) != version_tuple(expected):
        raise ValueError("Wrong Xcode version: expected " + expected + ", got " + xcode)

    if app["framework"] == "flutter":
        info = json.loads(subprocess.check_output(["flutter", "--version", "--machine"], text=True))
        actual = info.get("frameworkVersion")
        if actual != app["flutterVersion"]:
            raise ValueError("Wrong Flutter version: expected " + app["flutterVersion"] + ", got " + str(actual))
    else:
        actual = subprocess.check_output(["node", "--version"], text=True).strip().lstrip("v")
        if actual != app["nodeVersion"]:
            raise ValueError("Wrong Node version: expected " + app["nodeVersion"] + ", got " + actual)
    if not (ROOT / "Gemfile.lock").is_file():
        raise ValueError("Commit a reviewed Gemfile.lock into the private runner before enabling builds.")
    print("Toolchain matches the approved per-app versions.")


if __name__ == "__main__":
    if len(sys.argv) == 4 and sys.argv[1] == "checkout" and sys.argv[2] == "--scope":
        checkout(sys.argv[3])
    elif sys.argv[1:] == ["policy"]:
        write_policy()
    elif sys.argv[1:] == ["toolchain"]:
        check_toolchain()
    else:
        raise SystemExit("Usage: python3 codemagic_runner.py policy | checkout --scope unsigned|signed | toolchain")
