"""Run from trusted runner repo BEFORE checking out or executing any app code."""
import json
import os
import re
from pathlib import Path


def validate(apps, inputs):
    slug, sha = inputs["slug"], inputs["sha"]
    if not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", slug):
        raise ValueError("Invalid slug")
    app = apps[slug]
    if app.get("enabled") is not True:
        raise ValueError("App disabled: complete setup and review identities first")
    if not re.fullmatch(r"[a-f0-9]{40}", sha) or sha not in app["approvedShas"]:
        raise ValueError("Commit must be explicitly approved in the private runner allowlist")
    if inputs["mode"] not in ("unsigned", "build", "testflight"):
        raise ValueError("Invalid destination")
    if not re.fullmatch(r"[0-9]+\.[0-9]+\.[0-9]+", inputs["build_name"]):
        raise ValueError("Invalid version")
    if not re.fullmatch(r"[1-9][0-9]*", inputs["build_number"]):
        raise ValueError("Invalid build number")
    if not re.fullmatch(r"[a-f0-9-]{36}", inputs["correlation_id"]):
        raise ValueError("Invalid correlation ID")
    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9-]*/[A-Za-z0-9][A-Za-z0-9._-]*", app["repository"]):
        raise ValueError("Invalid repository")
    if app["framework"] != "flutter" or not re.fullmatch(r"[A-Z0-9]{10}", app["teamId"]):
        raise ValueError("Unsupported framework or invalid Team ID")
    if type(app["appId"]) is not int or app["appId"] < 1:
        raise ValueError("Missing ASC app ID")
    ids = app["bundleIds"]
    if not ids or len(set(ids)) != len(ids) or any(not re.fullmatch(r"[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+", x) for x in ids):
        raise ValueError("Invalid bundle IDs")
    directory = app["workingDirectory"]
    if directory != "." and (not re.fullmatch(r"[A-Za-z0-9_-]+(?:/[A-Za-z0-9_-]+)*", directory)):
        raise ValueError("Invalid workingDirectory")
    if not re.fullmatch(r"[0-9]+\.[0-9]+\.[0-9]+", app["flutterVersion"]):
        raise ValueError("Pin Flutter version")
    if not re.fullmatch(r"[0-9]+\.[0-9]+(?:\.[0-9]+)?", app["xcodeVersion"]):
        raise ValueError("Pin a verified Xcode version available on the macOS image")
    if app["scheme"] != "Runner":
        raise ValueError("Initial Flutter builder supports only the Runner scheme, without flavors")
    if set(app["targets"].values()) != set(ids) or any(not re.fullmatch(r"[A-Za-z0-9_-]+", name) for name in app["targets"]):
        raise ValueError("Every bundle ID needs an explicit Xcode target mapping")
    return app


if __name__ == "__main__":
    inputs = {key: os.environ[key.upper()] for key in ("slug", "sha", "mode", "build_name", "build_number", "correlation_id")}
    app = validate(json.loads(Path(__file__).with_name("apps.json").read_text()), inputs)
    owner, repo = app["repository"].split("/")
    with open(os.environ["GITHUB_OUTPUT"], "a") as output:
        for key, value in {"owner": owner, "repo": repo, "flutter": app["flutterVersion"], "xcode": app["xcodeVersion"]}.items():
            output.write(f"{key}={value}\n")
