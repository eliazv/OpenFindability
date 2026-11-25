import test from "node:test";
import assert from "node:assert/strict";
import {declaredIcons,publicWebsite,publicIpv4,sameWebsite} from "../lib/dashboard/website-icon-discovery";
test("custom favicon links and www redirect",()=>{
 const html='<head><link rel="icon" href="/images/icons/ez-viola-32.png"><link rel="apple-touch-icon" href="/images/icons/ez-viola-180.png"></head>';
 assert.deepEqual(declaredIcons(html,new URL("https://www.eliazavatta.it/")).map(x=>x.pathname),["/images/icons/ez-viola-32.png","/images/icons/ez-viola-180.png"]);
 assert.equal(declaredIcons('<link href=/logos/favicon-96.png rel=icon>',new URL("https://www.globoricambi.it/"))[0]?.pathname,"/logos/favicon-96.png");
 assert.ok(sameWebsite(new URL("https://eliazavatta.it"),new URL("https://www.eliazavatta.it")));
});
test("do not discover private, cross-site, or credential URLs",()=>{
 const links='<link rel="icon" href="https://evil.example/icon.png"><link rel="icon" href="http://127.0.0.1/icon"><link rel="icon" href="https://user:secret@example.com/icon">';
 assert.equal(declaredIcons(links,new URL("https://example.com")).length,0);
 for(const value of ["http://localhost","http://169.254.169.254","http://test.local","https://example.com:8443","file:///tmp/a"])assert.equal(publicWebsite(value),undefined);
 for(const ip of ["127.0.0.1","10.1.1.1","192.168.1.1","169.254.169.254","100.64.0.1","172.16.0.1","192.0.2.1","198.51.100.1","203.0.113.1","224.0.0.1"])assert.equal(publicIpv4(ip),false);
 assert.equal(publicIpv4("8.8.8.8"),true);
});
