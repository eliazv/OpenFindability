import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { startServer, discoverProjects, inside, safePath } from '../studio/serve.mjs';
import { validateSet } from '../studio/contract.mjs';
const valid = () => ({engine:1,name:'Main',platforms:{ios:{w:1320,h:2868}},locales:['it'],slides:[{headline:'Test'}],elements:[{id:'a',type:'text',text:'Test',x:.5,y:.4,w:.5,h:.2}]});
test('engine version and layout inputs fail explicitly',()=>{
 assert.equal(validateSet(valid()).engine,1);
 for(const change of [{engine:2},{engine:undefined},{slides:[]},{elements:[{id:'a',x:NaN,w:1}]},{elements:[valid().elements[0],valid().elements[0]]}]) assert.throws(()=>validateSet({...valid(),...change}));
});
test('path containment handles siblings and Windows drives',()=>{
 assert.equal(inside('C:/repo','C:/repo/file'),true);
 assert.equal(inside('C:/repo','C:/repo-other/file'),false);
 assert.equal(inside('C:/repo','D:/secret'),false);
});
test('multi-project discovery, public files, origin guard and isolated atomic saving',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'studio-'));let server;
 try {
  const dbPath=join(dir,'test.db');const db=new DatabaseSync(dbPath);
  db.exec('CREATE TABLE projects (slug TEXT, flutter_project_path TEXT)');
  for(const slug of ['first','second']){
   const repo=join(dir,slug),studio=join(repo,'store/studio');await mkdir(join(studio,'sets'),{recursive:true});await mkdir(join(studio,'assets'));
   await writeFile(join(studio,'studio.config.json'),JSON.stringify({name:slug,sets:'sets',defaultSet:'main',components:'components.js',css:'components.css',icon:'assets/icon.png'}));
   await writeFile(join(studio,'sets/main.json'),JSON.stringify(valid()));await writeFile(join(studio,'components.js'),'export default {};');await writeFile(join(studio,'private.txt'),'secret');
   db.prepare('INSERT INTO projects VALUES (?,?)').run(slug,slug === 'first' ? null : repo);
  }db.close();
  assert.equal((await discoverProjects({dbPath,repo:null,slug:null})).length,1);
  const started=await startServer(0,{dbPath,repo:null,slug:null});server=started.server;const base=`http://127.0.0.1:${started.port}`;
  const health = await (await fetch(base+'/api/studio/status')).json();
  assert.equal(health.service,'openfindability-studio');assert.equal(health.protocol,1);
  const mapping = new DatabaseSync(dbPath);
  mapping.prepare('UPDATE projects SET flutter_project_path = ? WHERE slug = ?').run(join(dir,'first'),'first');mapping.close();
  const projects=await(await fetch(base+'/api/projects')).json();assert.equal(projects.length,2);assert.equal('dir' in projects[0],false);
  assert.equal((await fetch(base+'/p/first/components.js')).status,200);
  for(const path of ['/p/first/private.txt','/p/first/studio.config.json','/p/first/assets/%2e%2e%2fprivate.txt','/engine/serve.mjs']) assert.notEqual((await fetch(base+path)).status,200);
  const target=base+'/api/save?project=first&set=main';
  const save=(body,origin=base)=>fetch(target,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(body)});
  assert.equal((await save(valid(),'http://evil.test')).status,403);
  assert.equal((await save({...valid(),engine:2})).status,400);
  assert.equal((await save({...valid(),name:'Changed'})).status,204);
  assert.equal(JSON.parse(await readFile(join(dir,'first/store/studio/sets/main.json'))).name,'Changed');
  assert.equal(JSON.parse(await readFile(join(dir,'second/store/studio/sets/main.json'))).name,'Main');
  const override=await discoverProjects({dbPath:join(dir,'missing'),repo:join(dir,'second'),slug:'custom'});assert.equal(override[0].slug,'custom');
  await writeFile(join(dir,'outside.txt'),'private');
  await assert.rejects(safePath(join(dir,'first/store/studio'),'../../../outside.txt'));
  try {await symlink(join(dir,'outside.txt'),join(dir,'first/store/studio/assets/link.txt'),'file');await assert.rejects(safePath(join(dir,'first/store/studio'),'assets/link.txt'));} catch(error) {if(error.code!=='EPERM')throw error;}
 } finally {if(server)await new Promise(ok=>server.close(ok));await rm(dir,{recursive:true,force:true});}
});

test('header normalizes URL, preserves supported preferences and guards dirty navigation', async()=>{
 const {connectHeader}=await import('../studio/session.js');
 const originals=Object.fromEntries(['document','Option','location','history','confirm'].map(key=>[key,globalThis[key]]));
 const nodes=Object.fromEntries(['project','set','app-icon','platform','locale','gallery'].map(id=>[id,{value:'',options:[],listeners:{},add(option){this.options.push(option);},addEventListener(name,fn){this.listeners[name]=fn;}}]));
 let left=0;
 try {
  globalThis.document={getElementById:id=>nodes[id]};
  globalThis.Option=class {constructor(label,value){this.label=label;this.value=value;}};
  globalThis.location={pathname:'/engine/editor.html',search:'?project=first&set=main&platform=android&locale=en&slide=3',href:''};
  globalThis.history={replaceState(_a,_b,url){globalThis.location.search=url;}};
  globalThis.confirm=()=>false;
  const project={slug:'first',name:'First',icon:'/p/first/assets/icon.png',sets:[{id:'main',name:'Main'}]};
  const second={slug:'second',name:'Second',defaultSet:'other',sets:[{id:'other',name:'Other'}]};
  connectHeader({projects:[project,second],project,setName:'main',set:{...valid(),locales:['it','en']},q:new URLSearchParams(location.search)},()=>true,()=>{left++;});
  assert.equal(nodes.platform.value,'ios');assert.equal(nodes.locale.value,'en');
  assert.match(location.search,/platform=ios/);assert.match(nodes.gallery.href,/locale=en/);
  nodes.project.value='second';nodes.project.onchange();assert.equal(nodes.project.value,'first');assert.equal(location.href,'');assert.equal(left,0);
  globalThis.confirm=()=>true;nodes.project.value='second';nodes.project.onchange();
  const changed=new URL(location.href,'http://localhost');assert.equal(changed.searchParams.get('project'),'second');assert.equal(changed.searchParams.get('set'),'other');assert.equal(changed.searchParams.get('locale'),'en');assert.equal(changed.searchParams.has('slide'),false);assert.equal(left,1);
 } finally {for(const [key,value] of Object.entries(originals)){if(value===undefined)delete globalThis[key];else globalThis[key]=value;}}
});

test('all HTML module entrypoints parse successfully',async()=>{
 const {spawnSync}=await import('node:child_process');
 for(const file of ['editor.html','index.html','render.html']){
  const html=await readFile(new URL(`../studio/${file}`,import.meta.url),'utf8');
  const source=html.match(/<script type="module">([\s\S]*?)<\/script>/)[1];
  const result=spawnSync(process.execPath,['--input-type=module','--check'],{input:source,encoding:'utf8'});
  assert.equal(result.status,0,`${file}: ${result.stderr}`);
 }
});

test('panorama renders independent elements and passes the project context',async()=>{
 const {configure,buildPanorama}=await import('../studio/engine.js');
 const original=globalThis.document;
 const created=[];
 try {
  globalThis.document={createElement(tag){const node={tag,style:{},dataset:{},children:[],appendChild(child){this.children.push(child);},querySelector(){return null;}};created.push(node);return node;}};
  let context;
  configure({custom:(element,ctx)=>{context=ctx;return ctx.esc(element.text);}}, {name:'Other app',icon:'/icon.png'});
  const set={...valid(),elements:[{...valid().elements[0],type:'custom',text:'<safe>'},{...valid().elements[0],id:'extra',type:'text',hidden:false},{...valid().elements[0],id:'hidden',hidden:true}]};
  const {root,count}=buildPanorama(set,{platform:'ios',locale:'it'});
  assert.equal(count,1);assert.equal(root.children.length,3);
  assert.equal(root.children[1].innerHTML,'&lt;safe&gt;');assert.equal(root.children[2].dataset.id,'extra');assert.equal(context.app.name,'Other app');assert.equal(typeof context.frame,'function');
 } finally {globalThis.document=original;configure({},{});}
});
