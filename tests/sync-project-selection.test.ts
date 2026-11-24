import assert from "node:assert/strict";
import test from "node:test";
import { selectSyncProjects } from "../lib/sync-project-selection";
import { cliErrorMessage } from "../lib/cli-error";
import type { Project } from "../lib/types";

const projects = [{ id: "one", slug: "example-web" }, { id: "two", slug: "example-app" }] as Project[];
test("a scoped sync selects only the requested project; default keeps all projects", () => {
  assert.deepEqual(selectSyncProjects(projects, "example-web"), [projects[0]]);
  assert.equal(selectSyncProjects(projects), projects);
});
test("an unknown, empty or ambiguous scope fails closed", () => {
  for (const slug of ["unknown", ""]) assert.throws(() => selectSyncProjects(projects, slug));
  assert.throws(() => selectSyncProjects([projects[0], projects[0]], "example-web"));
});
test("OAuth errors expose neither the request object nor credentials in messages", () => {
  const error = Object.assign(new Error("invalid_grant"), { config: { data: { refresh_token: "private-test-token" } } });
  assert.match(cliErrorMessage(error), /authorization expired/i);
  assert.doesNotMatch(cliErrorMessage(error), /private-test-token|config|refresh_token/);
  assert.equal(cliErrorMessage(new Error("Failed with private-test-token"), { ADSENSE_REFRESH_TOKEN: "private-test-token" }), "Failed with [REDACTED]");
  assert.equal(cliErrorMessage({ config: { token: "private" } }), "Command failed.");
});
