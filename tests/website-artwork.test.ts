import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import path from "node:path";
import {refreshWebsiteArtwork,cachedWebsiteArtwork} from "../lib/dashboard/website-artwork";
test("declared website icon is cached by origin and retained on failure",async()=>{
 const root=await mkdtemp(path.join(tmpdir(),"of-webicon-"));
 try{
  const calls:string[]=[];
  const fetchPage=async(url:URL)=>{calls.push(url.href);if(url.pathname==="/")return {url:new URL("https://www.example.com/"),bytes:Buffer.from('<head><link rel="icon" href="/logos/favicon-96.png"></head>')};assert.equal(url.pathname,"/logos/favicon-96.png");return {url,bytes:Buffer.from([137,80,78,71,13,10,26,10])};};
  assert.equal(await refreshWebsiteArtwork("https://example.com",{root,fetchPage}),"updated");
  assert.deepEqual(calls,["https://example.com/","https://www.example.com/logos/favicon-96.png"]);
  assert.match((await cachedWebsiteArtwork("https://example.com/path",root))??"",/^data:image\/png;base64,/);
  assert.equal(await refreshWebsiteArtwork("https://example.com",{root,fetchPage}),"cached");
  assert.equal(calls.length,2);
  assert.equal(await refreshWebsiteArtwork("https://example.com",{root,force:true,fetchPage:async()=>{throw Error("offline");}}),"cached");
 }finally{await rm(root,{recursive:true,force:true});}
});
