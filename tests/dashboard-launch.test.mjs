import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { ensureStudio, runDashboard } from '../scripts/dashboard.mjs';
import { STUDIO_IDENTITY } from '../studio/serve.mjs';

const occupied = async () => { throw Object.assign(new Error('occupied'), { code:'EADDRINUSE' }); };
test('reuses only a studio belonging to this checkout and never closes borrowed service', async () => {
  let requested;
  const session = await ensureStudio({ start:occupied, request:async url => {requested=url;return {ok:true,json:async()=>({service:'openfindability-studio',protocol:1,instance:STUDIO_IDENTITY})};} });
  assert.equal(session.reused,true);assert.match(requested,/127\.0\.0\.1:5177\/api\/studio\/status$/);await session.close();
  for(const status of [{}, {service:'openfindability-studio',protocol:1,instance:'other-checkout'}]) {
    await assert.rejects(ensureStudio({start:occupied,request:async()=>({ok:true,json:async()=>status})}), /occupata/);
  }
});
test('owned studio is closed and idle connections are drained',async()=>{
  let closed=0,idle=0;
  const session=await ensureStudio({start:async()=>({server:{close(ok){closed++;ok();},closeIdleConnections(){idle++;}}})});
  assert.equal(session.reused,false);await session.close();assert.equal(closed,1);assert.equal(idle,1);
});
test('dashboard lifecycle forwards flags and stops only its own resources once',async()=>{
  for(const mode of ['dev','start']) {
    const signals=new EventEmitter(),child=new EventEmitter();let closed=0,killed=0,code,argv;
    const session=await runDashboard({mode,args:['--port','3100'],signals,ensure:async()=>({port:5177,reused:false,close:async()=>closed++}),spawnNext:args=>{argv=args;return child;},terminate:async()=>killed++,setExitCode:value=>code=value,log:()=>{}});
    assert.deepEqual(argv,[mode,'--hostname','127.0.0.1','--port','3100']);
    signals.emit('SIGINT');await session.stop();assert.equal(killed,1);assert.equal(closed,1);assert.equal(code,0);assert.equal(signals.listenerCount('SIGINT'),0);
  }
});
test('Next exit preserves failure and closes studio without killing an exited child',async()=>{
 const child=new EventEmitter();let closed=0,code;
 const session=await runDashboard({signals:new EventEmitter(),ensure:async()=>({port:5177,close:async()=>closed++}),spawnNext:()=>child,terminate:()=>assert.fail('already exited'),setExitCode:value=>code=value,log:()=>{}});
 child.emit('exit',2);await session.stop();assert.equal(closed,1);assert.equal(code,2);
});
test('startup failures do not leave a studio running',async()=>{
 let closed=0;
 await assert.rejects(runDashboard({ensure:async()=>({port:5177,close:async()=>closed++}),spawnNext:()=>{throw new Error('missing next');},log:()=>{}}),/missing next/);
 assert.equal(closed,1);
 await assert.rejects(runDashboard({ensure:async()=>{throw new Error('studio failed');},spawnNext:()=>assert.fail('must not start')}),/studio failed/);
});
