import test from "node:test";
import assert from "node:assert/strict";
import {projectSections,searchDestinations} from "../lib/dashboard/navigation-search";
const projects=[{slug:"web",name:"Vita Romagna",type:"web" as const},{slug:"mobile",name:"App nascosta",type:"app" as const,hidden:true}];
test("empty palette shows only visible projects and global destinations",()=>{const rows=searchDestinations(projects,"");assert.equal(rows.some(x=>x.slug==="mobile"),false);assert.equal(rows.some(x=>x.group==="sections"),false);assert.ok(rows.some(x=>x.href==="/data"));});
test("hidden projects searchable and only valid sections offered",()=>{assert.ok(searchDestinations(projects,"app nascosta").some(x=>x.href==="/project/mobile"&&x.hidden));assert.ok(searchDestinations(projects,"app store").some(x=>x.href==="/project/mobile/store"));assert.ok(!projectSections("web").some(([id])=>id==="store"));assert.ok(searchDestinations(projects,"romagna ricavi").some(x=>x.href==="/project/web/revenue"));});
test("search matches accents and words in any order",()=>{assert.ok(searchDestinations(projects,"backup").some(x=>x.href==="/data"));assert.ok(searchDestinations(projects,"romágna vita").some(x=>x.href==="/project/web"));});
