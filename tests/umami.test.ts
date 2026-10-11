import assert from "node:assert/strict";
import test from "node:test";
import { readUmamiMetric } from "../lib/connectors/umami";

test("Umami metrics are read from both the flat self-hosted shape and the wrapped cloud shape", () => {
  assert.equal(readUmamiMetric(518), 518);
  assert.equal(readUmamiMetric({ value: 247 }), 247);
  assert.equal(readUmamiMetric(0), 0);
  assert.equal(readUmamiMetric({}), undefined);
  assert.equal(readUmamiMetric(undefined), undefined);
});
