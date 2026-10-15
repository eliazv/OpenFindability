import assert from "node:assert/strict";
import test from "node:test";
import { retentionImportStatus } from "../lib/connectors/appstoreconnect-analytics";

test("session/engagement availability never claims retention cohort metrics were imported", () => {
  assert.match(retentionImportStatus([{ name: "App Sessions" },{ name: "App Store Discovery and Engagement" }]),/session counts are not retention/);
  assert.match(retentionImportStatus([{ name: "App Retention" }]),/parser not implemented/);
});
