import test from "node:test";
import assert from "node:assert/strict";
import {faviconCandidates,linkedWebsite} from "../lib/dashboard/favicon";
test("favicon uses the configured origin, not the page path",()=>{assert.equal(faviconCandidates("https://example.com/path?q=1")[0],"https://example.com/favicon.ico");});
test("linked website falls back to GSC domain and rejects invalid URLs",()=>{assert.equal(linkedWebsite({gscProperty:"sc-domain:example.com"}),"https://example.com");assert.deepEqual(faviconCandidates("javascript:alert(1)"),[]);assert.deepEqual(faviconCandidates("https://user:password@example.com"),[]);});
