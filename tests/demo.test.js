import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=name=>readFileSync(new URL(`../dist/${name}.js`,import.meta.url),'utf8').replace(/^import .*$/mg,'').replace(/\bexport /g,'');
function workspace(fetchImpl=async()=>{throw Error('Unexpected network request');}){
 const element={open:false,innerHTML:'',classList:{add(){},remove(){}},showModal(){this.open=true;},close(){this.open=false;}};
 const code=['engine','care','store'].map(source).join('\n')+'\n'+source('app').split("document.addEventListener('click'")[0];
 return new Function('document','navigator','window','fetch','setTimeout','clearTimeout','AbortSignal',code+`
 state=seed();let writes=0;writeState=async()=>{writes++};
 return {action:handleCareAction,persist,sync,get state(){return state},get writes(){return writes},get demo(){return demoSession}};
 `)({querySelector:()=>element,documentElement:{}},{onLine:true},{scrollTo(){}},fetchImpl,()=>0,()=>{},AbortSignal);
}
test('practice restart and exit preserve saved records and never persist practice edits',async()=>{
 const app=workspace(),original=app.state,before=JSON.stringify(original);
 await app.action('demo-start');app.state.beneficiaries[0].name='Changed only in practice';await app.persist();await app.sync();
 assert.equal(app.writes,0);await app.action('demo-restart');assert.equal(app.state.beneficiaries[0].name,'Savitri Devi');
 await app.action('demo-exit');assert.equal(app.state,original);assert.equal(JSON.stringify(app.state),before);assert.equal(app.demo,null);
});
test('a backup health check started before practice cannot upload practice data',async()=>{
 let release;let posts=0;let checks=0;
 const response=new Promise(resolve=>{release=resolve;});
 const app=workspace(async url=>{if(url==='/api/health'){checks++;return response;}posts++;return {ok:true,json:async()=>({ok:true})};});
 const pending=app.sync();await app.action('demo-start');release({ok:true,json:async()=>({service:'asha-sahayak-demo'})});await pending;
 assert.equal(checks,1);assert.equal(posts,0);assert.equal(app.writes,0);
});
test('worker ordering persists outside practice',async()=>{
 const app=workspace();await app.action('plan-up','t4');assert.equal(app.writes,1);assert.ok(app.state.settings.dayPlan.order.includes('t4'));
});
