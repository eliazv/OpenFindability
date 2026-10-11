import assert from "node:assert/strict";
import test from "node:test";
import { parseCsv, parseNonnegativeInteger } from "../lib/csv";

test("quoted commas, embedded newlines, escaped double quotes and BOM", () => {
  const data = '\uFEFFDate,Name,Daily Device Installs\r\n' +
    '2026-10-01,"A, game",12\r\n' +
    '2026-10-02,"New\nline ""quoted""",0\r\n';
  const parsed = parseCsv(data);
  assert.deepEqual(parsed.headers, ["Date", "Name", "Daily Device Installs"]);
  assert.deepEqual(parsed.rows, [
    ["2026-10-01", "A, game", "12"],
    ["2026-10-02", 'New\nline "quoted"', "0"],
  ]);
});

test("invalid CSV structure fails rather than shifting metric columns", () => {
  assert.throws(() => parseCsv('date,value\n2026-10-01,"unclosed'), /unterminated/);
  assert.throws(() => parseCsv('date,value\n2026-10-01,2,extra'), /columns/);
  assert.throws(() => parseCsv('date,value\n2026-10-01,xx"yy'), /quote/);
});

test("missing or invalid metrics are undefined and real zero is preserved", () => {
  assert.equal(parseNonnegativeInteger("0"), 0);
  assert.equal(parseNonnegativeInteger("123"), 123);
  assert.equal(parseNonnegativeInteger(""), undefined);
  assert.equal(parseNonnegativeInteger("NaN"), undefined);
  assert.equal(parseNonnegativeInteger("-3"), undefined);
  assert.equal(parseNonnegativeInteger("42 cats"), undefined);
});
