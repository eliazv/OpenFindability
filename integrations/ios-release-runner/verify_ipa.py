"""Validate exported app AND extensions before any TestFlight upload."""
import datetime
import json
import os
import plistlib
import subprocess
import sys
import tempfile
from pathlib import Path


def verify(ipa):
    app = json.loads(Path(__file__).with_name("apps.json").read_text())[os.environ["SLUG"]]
    with tempfile.TemporaryDirectory() as temporary:
        subprocess.run(["ditto", "-x", "-k", ipa, temporary], check=True)
        mains = list((Path(temporary) / "Payload").glob("*.app"))
        assert len(mains) == 1, "Expected one main app"
        bundles = [mains[0], *mains[0].glob("PlugIns/*.appex")]
        found = []
        for bundle in bundles:
            info = plistlib.loads((bundle / "Info.plist").read_bytes())
            identifier = info["CFBundleIdentifier"]
            found.append(identifier)
            assert info["CFBundleShortVersionString"] == os.environ["BUILD_NAME"], "Version mismatch"
            assert info["CFBundleVersion"] == os.environ["BUILD_NUMBER"], "Build mismatch"
            subprocess.run(["codesign", "--verify", "--deep", "--strict", str(bundle)], check=True)
            signed = subprocess.check_output(["codesign", "-d", "--entitlements", ":-", str(bundle)], stderr=subprocess.DEVNULL)
            entitlements = plistlib.loads(signed)
            assert entitlements["com.apple.developer.team-identifier"] == app["teamId"], "Signing team mismatch"
            assert entitlements["application-identifier"].endswith("." + identifier), "Signing app ID mismatch"
            assert entitlements.get("get-task-allow", False) is False, "Debug signing"
            if "aps-environment" in entitlements:
                assert entitlements["aps-environment"] == "production", "Development push environment"
            profile = plistlib.loads(subprocess.check_output(["security", "cms", "-D", "-i", str(bundle / "embedded.mobileprovision")]))
            assert app["teamId"] in profile["TeamIdentifier"], "Profile team mismatch"
            assert profile["ExpirationDate"] > datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None), "Expired profile"
            assert "ProvisionedDevices" not in profile and not profile.get("ProvisionsAllDevices", False), "Not an App Store profile"
            assert entitlements["application-identifier"] == profile["Entitlements"]["application-identifier"], "Profile app ID mismatch"
            assert profile["Entitlements"].get("get-task-allow") is False, "Development profile"
            for key, expected in app.get("requiredEntitlements", {}).get(identifier, {}).items():
                assert entitlements.get(key) == expected, f"Missing/mismatched entitlement: {key}"
            certificate_prefix = str(Path(temporary) / "signing-cert")
            subprocess.run(["codesign", "-d", "--extract-certificates", certificate_prefix, str(bundle)], check=True, capture_output=True)
            certificate = Path(certificate_prefix + "0").read_bytes()
            assert certificate in profile["DeveloperCertificates"], "Certificate does not match embedded profile"
        assert found[0] == app["bundleIds"][0], "Main app bundle mismatch"
        assert len(found) == len(set(found)) and set(found) == set(app["bundleIds"]), "Missing or unexpected extensions"


if __name__ == "__main__":
    verify(sys.argv[1])
