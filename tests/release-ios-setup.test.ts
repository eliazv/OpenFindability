import assert from "node:assert/strict";
import test from "node:test";
import { appEnvVariable, declaresEnvAsset, deployKeyVariable, missingFirebasePods, parseEntitlements, parseNativeTargets } from "../lib/release-ios-setup";

const id = (n: number) => String(n).padStart(24, "A");
function target(n: number, name: string, type: string, list: number) {
  return `\t\t${id(n)} /* ${name} */ = {\n\t\t\tisa = PBXNativeTarget;\n\t\t\tbuildConfigurationList = ${id(list)} /* list */;\n\t\t\tname = ${name};\n\t\t\tproductType = "com.apple.product-type.${type}";\n\t\t};\n`;
}
function list(n: number, debug: number, release: number) {
  return `\t\t${id(n)} /* list */ = {\n\t\t\tisa = XCConfigurationList;\n\t\t\tbuildConfigurations = (\n\t\t\t\t${id(debug)} /* Debug */,\n\t\t\t\t${id(release)} /* Release */,\n\t\t\t);\n\t\t};\n`;
}
function config(n: number, name: string, settings: string) {
  return `\t\t${id(n)} /* ${name} */ = {\n\t\t\tisa = XCBuildConfiguration;\n\t\t\tbuildSettings = {\n${settings}\t\t\t};\n\t\t\tname = ${name};\n\t\t};\n`;
}
const pbxproj = `/* Begin PBXNativeTarget section */
${target(1, "Widget", "app-extension", 11)}${target(2, "RunnerTests", "bundle.unit-test", 12)}${target(3, "Runner", "application", 13)}/* End PBXNativeTarget section */
/* Begin XCBuildConfiguration section */
${config(21, "Debug", "PRODUCT_BUNDLE_IDENTIFIER = com.example.debug;\n")}${config(22, "Release", 'CODE_SIGN_ENTITLEMENTS = "Widget/Widget.entitlements";\nPRODUCT_BUNDLE_IDENTIFIER = com.example.app.Widget;\n')}${config(23, "Debug", "PRODUCT_BUNDLE_IDENTIFIER = com.example.debug;\n")}${config(24, "Release", "DEVELOPMENT_TEAM = ABCDEFGHIJ;\nMARKETING_VERSION = 2.5;\nPRODUCT_BUNDLE_IDENTIFIER = com.example.app;\n")}/* End XCBuildConfiguration section */
/* Begin XCConfigurationList section */
${list(11, 21, 22)}${list(13, 23, 24)}/* End XCConfigurationList section */
`;

test("reads Release settings of shipped targets, app first, without test targets", () => {
  const targets = parseNativeTargets(pbxproj);
  assert.deepEqual(targets.map((t) => t.name), ["Runner", "Widget"]);
  assert.equal(targets[0].bundleId, "com.example.app");
  assert.equal(targets[0].team, "ABCDEFGHIJ");
  assert.equal(targets[0].marketingVersion, "2.5");
  assert.equal(targets[1].bundleId, "com.example.app.Widget");
  assert.equal(targets[1].entitlements, "Widget/Widget.entitlements");
});

test("entitlements require production push and keep array values", () => {
  const plist = `<plist><dict>
    <key>aps-environment</key><string>development</string>
    <key>com.apple.developer.applesignin</key><array><string>Default</string></array>
    <key>com.apple.security.application-groups</key><array/>
    <key>flag</key><true/>
  </dict></plist>`;
  assert.deepEqual(parseEntitlements(plist), {
    "aps-environment": "production",
    "com.apple.developer.applesignin": ["Default"],
    "com.apple.security.application-groups": [],
    flag: true,
  });
});

test("deploy key variable name matches what the runner reads", () => {
  assert.equal(deployKeyVariable("sette-e-mezzo-carte-italiane"), "SOURCE_KEY_SETTE_E_MEZZO_CARTE_ITALIANE");
});

test("finds Firebase pods not published for the pinned SDK, only for plugins in use", async () => {
  const lock = '  firebase_analytics:\n    dependency: "direct main"\n    version: "13.0.1"\n  cloud_firestore:\n    version: "7.1.0"\n  http:\n    version: "1.0.0"\n';
  const versions = async (pod: string) => pod === "FirebaseFirestore" ? ["12.19.0", "12.19.3"] : ["12.19.0"];
  assert.deepEqual(await missingFirebasePods(lock, "12.19.3", versions), ["FirebaseAnalytics"]);
  assert.deepEqual(await missingFirebasePods(lock, "12.19.0", versions), []);
});

test("detects a .env Flutter asset and names its variable like the runner", () => {
  assert.equal(declaresEnvAsset("flutter:\n  assets:\n    - .env\n    - assets/\n"), true);
  assert.equal(declaresEnvAsset("flutter:\n  assets:\n    - assets/.env.example\n"), false);
  assert.equal(appEnvVariable("sette-e-mezzo"), "APP_ENV_SETTE_E_MEZZO");
});
