import assert from "node:assert/strict";
import test from "node:test";
import { reconcileGscProjectLinks, resolveGscProject } from "../lib/gsc-project-links";
import type { AppData, Project } from "../lib/types";

const project: Project = { id: "p", slug: "site", name: "Site", type: "web", websiteUrl: "https://example.com/", gscProperty: "sc-domain:example.com", createdAt: "now", updatedAt: "now" };
test("index links use explicit unique mapping and preserve unrelated/unmatched observations", () => {
  const rows = [{ siteUrl: "sc-domain:example.com" }, { siteUrl: "sc-domain:other.com" }, { siteUrl: "sc-domain:example.com",projectId:"already-linked" }] as AppData["gscIndexInspections"];
  const data = { projects: [project], gscIndexInspections: rows, connectorRuns: [] };
  assert.equal(reconcileGscProjectLinks(data).inspections,1);
  assert.equal(rows[0].projectId,"p"); assert.equal(rows[1].projectId,undefined); assert.equal(rows[2].projectId,"already-linked");
  assert.equal(reconcileGscProjectLinks(data).inspections,0);
  assert.equal(resolveGscProject([project,{ ...project,id:"second" }],project.gscProperty!),undefined);
});
test("domain fallback never maps an unrelated subdomain or ambiguous website", () => {
  const missing = { ...project,gscProperty:undefined };
  assert.equal(resolveGscProject([missing],"sc-domain:example.com")?.id,"p");
  assert.equal(resolveGscProject([{ ...missing,websiteUrl:"https://app.example.com/" }],"sc-domain:example.com"),undefined);
  assert.equal(resolveGscProject([missing,{ ...missing,id:"other" }],"sc-domain:example.com"),undefined);
});
