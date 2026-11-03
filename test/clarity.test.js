import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../src/store.js';
import { Clarity } from '../src/clarity.js';
test('identical concurrent queries use one API request, persist history, respect daily budget', async () => {
  const s = new Store(':memory:', 'a'.repeat(64));
  s.saveProject({id:'rockmole-lv', name:'Rockmole', domain:'rockmole.lv', token:'secret'});
  let calls=0;
  const c = new Clarity(s, async url => { calls++; assert.equal(url.hostname,'www.clarity.ms'); return new Response(JSON.stringify([{metricName:'Traffic',information:[{totalSessionCount:'12'}]}])); });
  const results=await Promise.all([c.insights('rockmole-lv',1,[]),c.insights('rockmole-lv',1,[])]);
  assert.equal(calls,1); assert.equal(results[0].data[0].metricName,'Traffic');
  await c.insights('rockmole-lv',1,[]); assert.equal(calls,1);
  assert.equal(c.history('rockmole-lv',10).length,1);
  await assert.rejects(()=>c.insights('rockmole-lv',4,[]));
  await assert.rejects(()=>c.insights('rockmole-lv',1,['invalid']));
  for(let i=0;i<9;i++) s.recordRequest('rockmole-lv');
  await assert.rejects(()=>c.insights('rockmole-lv',2,[]), /budget/);
  assert.equal(calls,1); s.close();
});
