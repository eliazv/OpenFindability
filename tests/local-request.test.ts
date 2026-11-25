import test from "node:test";
import assert from "node:assert/strict";
import {localRequestError} from "../lib/dashboard/local-request";
const req=(host:string,origin?:string,site?:string,internal="http://127.0.0.1:3000/api/navigation")=>new Request(internal,{method:"POST",headers:{host,...(origin?{origin}:{}),...(site?{"sec-fetch-site":site}:{})}});
test("accepts browser authority even if Next internally uses another loopback name",()=>{
 assert.equal(localRequestError(req("localhost:3000","http://localhost:3000","same-origin"),true),null);
 assert.equal(localRequestError(req("127.0.0.1:3000","http://127.0.0.1:3000",undefined,"http://localhost:3000/api/navigation"),true),null);
 assert.equal(localRequestError(req("[::1]:3000","http://[::1]:3000"),true),null);
});
test("rejects external hosts, forged suffixes, cross-origin, ports, missing origin",()=>{
 for(const r of [req("example.org","http://example.org"),req("localhost.evil.org:3000","http://localhost.evil.org:3000"),req("localhost:3000","http://evil.org"),req("localhost:3000","http://localhost:3001"),req("localhost:3000","http://127.0.0.1:3000"),req("localhost:3000","null"),req("localhost:3000"),req("localhost:3000","http://localhost:3000","cross-site"),req("localhost:3000","http://localhost:3000/path")])assert.notEqual(localRequestError(r,true),null);
});
test("read-only requests accept local Host, not forwarded headers",()=>{
 assert.equal(localRequestError(req("localhost:3000")),null);
 assert.notEqual(localRequestError(new Request("http://localhost:3000/api/doctor",{headers:{host:"evil.org","x-forwarded-host":"localhost:3000"}})),null);
});
