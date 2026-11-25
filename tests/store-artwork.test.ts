import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import path from "node:path";
import {appleArtwork,playArtwork,allowedArtworkUrl,storeIdentities,refreshStoreArtwork,cachedStoreArtwork} from "../lib/dashboard/store-artwork";
test("use only matching IDs and approved artwork hosts",()=>{
 assert.equal(storeIdentities({appStoreTrackId:123}).length,1);
 assert.equal(appleArtwork({results:[{trackId:321,kind:"software",artworkUrl100:"https://is1-ssl.mzstatic.com/icon.png"}]},"123"),undefined);
 assert.equal(allowedArtworkUrl("https://mzstatic.com.evil.example/icon.png","apple"),undefined);
 assert.equal(allowedArtworkUrl("https://127.0.0.1/icon.png","play"),undefined);
 assert.equal(playArtwork('<meta content="https://play-lh.googleusercontent.com/icon" property="og:image">')?.hostname,"play-lh.googleusercontent.com");
});
test("App Store-only project caches exact public icon and reuses it offline",async()=>{
 const root=await mkdtemp(path.join(tmpdir(),"of-artwork-"));let calls=0;
 try{
 const request:typeof fetch=async(input)=>{calls++;const url=String(input);return url.startsWith("https://itunes.apple.com/")?Response.json({results:[{trackId:123,kind:"software",artworkUrl100:"https://is1-ssl.mzstatic.com/test.png"}]}):new Response(Buffer.from([137,80,78,71,13,10,26,10]));};
 assert.equal(await refreshStoreArtwork({appStoreTrackId:123},{root,request}),"updated");
 assert.match((await cachedStoreArtwork({appStoreTrackId:123},root))??"",/^data:image\/png;base64,/);
 assert.equal(await refreshStoreArtwork({appStoreTrackId:123},{root,request}),"cached");assert.equal(calls,2);
 assert.equal(await cachedStoreArtwork({appStoreTrackId:321},root),undefined);
 }finally{await rm(root,{recursive:true,force:true});}
});
