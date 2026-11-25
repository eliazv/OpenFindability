import test from "node:test";
import assert from "node:assert/strict";
import {navigationItems,validateNavigation,moveItem} from "../lib/dashboard/navigation";
const projects=["z","b","a"].map(id=>({id,slug:id,name:id}));
test("manual order, archived default and explicit visibility",()=>{
 const result=navigationItems(projects,[{projectId:"z",favorite:false,archived:true,sidebarHidden:false,sidebarOrder:0},{projectId:"b",favorite:true,archived:true,sidebarHidden:null,sidebarOrder:null}]);
 assert.deepEqual(result.map(p=>[p.id,p.hidden]),[["z",false],["b",true],["a",false]]);
});
test("reorder does not mutate input; invalid or incomplete navigation rejected",()=>{
 assert.deepEqual(moveItem(projects,0,2).map(p=>p.id),["b","a","z"]);assert.equal(projects[0].id,"z");
 const ids=new Set(projects.map(p=>p.id));assert.throws(()=>validateNavigation([{id:"a",hidden:false}],ids));
 assert.throws(()=>validateNavigation(projects.map(()=>({id:"a",hidden:false})),ids));
 assert.equal(validateNavigation(projects.map(p=>({id:p.id,hidden:null})),ids).length,3);
});
