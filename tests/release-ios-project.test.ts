import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { resolveIosProject } from "../lib/release-ios-project";
import type { Project } from "../lib/types";

function project(slug: string, bundle: string, framework: "flutter" | "capacitor" = "flutter"): Project {
  return { id: slug, slug, name: slug, type: "app", createdAt: "now", updatedAt: "now", iosReleaseConfig: {
    repository: "example/app", appId: 123, teamId: "ABCDEFGHIJ", bundleIds: [bundle], framework,
  } };
}
async function app(root: string, relative: string, bundle: string, capacitor = false) {
  const dir = join(root, relative, capacitor ? "ios/App/App.xcodeproj" : "ios/Runner.xcodeproj");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "project.pbxproj"), `PRODUCT_BUNDLE_IDENTIFIER = "${bundle}";`);
}

test("--path identifies Flutter and Capacitor without running app code", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ios-path-"));
  try {
    await app(dir, "flutter", "com.example.flutter");
    await app(dir, "web", "com.example.web", true);
    const projects = [project("flutter", "com.example.flutter"), project("web", "com.example.web", "capacitor")];
    assert.equal((await resolveIosProject(projects, { path: join(dir, "flutter") })).slug, "flutter");
    assert.equal((await resolveIosProject(projects, { path: join(dir, "web") })).slug, "web");
    await assert.rejects(resolveIosProject(projects, { path: join(dir, "web"), slug: "flutter" }), /No configured/);
    await assert.rejects(resolveIosProject(projects, { slug: "unknown" }), /Unknown/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("multi-app roots require disambiguation and preserve app subfolders", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ios-multi-"));
  try {
    await app(dir, "apps/one", "com.example.one");
    await app(dir, "apps/two", "com.example.two");
    const projects = [project("one", "com.example.one"), project("two", "com.example.two")];
    await assert.rejects(resolveIosProject(projects, { path: dir }), /Multiple/);
    assert.equal((await resolveIosProject(projects, { path: dir, slug: "two" })).slug, "two");
    assert.equal((await resolveIosProject(projects, { path: join(dir, "apps/one") })).slug, "one");
    await assert.rejects(resolveIosProject([], { path: dir }), /No configured/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
