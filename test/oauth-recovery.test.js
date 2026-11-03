import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createHash } from 'node:crypto';
import { Store } from '../src/store.js';
import { Clarity } from '../src/clarity.js';
import { createApp } from '../src/app.js';

test('OAuth handoff to another browser restarts binding; expired requests recover without granting access',async t=>{
  const store=new Store(':memory:','a'.repeat(64)),base='http://localhost:3168',password='test-recovery-password-long-enough';
  const {app}=createApp({store,clarity:new Clarity(store),base,password});
  const server=app.listen(3168,'127.0.0.1');await once(server,'listening');t.after(()=>{server.close();store.close();});
  const browser=()=>{
    let cookie='';
    return async(path,body)=>{
      const r=await fetch(base+path,{redirect:'manual',headers:{Cookie:cookie,...(body?{'Content-Type':'application/x-www-form-urlencoded',Origin:base}:{})},...(body?{method:'POST',body:new URLSearchParams(body)}:{})});
      if(r.headers.get('set-cookie'))cookie=r.headers.get('set-cookie').split(';')[0];return r;
    };
  };
  const initiator=browser(),user=browser();
  const login=await user('/login');const csrf=(await login.text()).match(/name="csrf" value="([^"]+)"/)[1];
  assert.equal((await user('/login',{csrf,password})).status,302);
  const r=await fetch(base+'/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({client_name:'OAuth recovery test',redirect_uris:['https://example.com/callback'],token_endpoint_auth_method:'none',grant_types:['authorization_code','refresh_token'],response_types:['code']})});
  const client=await r.json(),challenge=createHash('sha256').update('v'.repeat(64)).digest('base64url');
  const params=new URLSearchParams({client_id:client.client_id,redirect_uri:client.redirect_uris[0],response_type:'code',code_challenge:challenge,code_challenge_method:'S256',scope:'clarity:read',state:'preserved-state',resource:base+'/mcp'});
  const started=await initiator('/authorize?'+params),oldConsent=started.headers.get('location');
  const oldRequest=new URL(oldConsent,base).searchParams.get('request');
  assert.equal((await user('/consent',{csrf,request:oldRequest,decision:'approve',projects:'rockmole-lv'})).status,410);
  assert.equal(store.records('code').length,0);assert.equal(store.records('grant').length,0);
  const handoff=await user(oldConsent);assert.equal(handoff.status,302);
  const restart=new URL(handoff.headers.get('location'),base);assert.equal(restart.pathname,'/authorize');
  assert.equal(restart.searchParams.get('state'),'preserved-state');assert.equal(restart.searchParams.get('code_challenge'),challenge);
  const restarted=await user(restart.pathname+restart.search),newConsent=restarted.headers.get('location');assert.notEqual(newConsent,oldConsent);
  assert.equal((await user(newConsent)).status,200);assert.equal(store.records('grant').length,0);
  const request=new URL(newConsent,base).searchParams.get('request'),pending=store.get('pending',request);
  store.put('pending',request,{...pending,validUntil:Date.now()-1},3600);
  const expired=await user(newConsent);assert.equal(expired.status,410);const html=await expired.text();
  assert.match(html,/Sākt autorizāciju no jauna/);assert.doesNotMatch(html,/Pieprasījumu neizdevās apstrādāt/);
  const expiredSubmit=await user('/consent',{csrf,request,decision:'approve',projects:'rockmole-lv'});assert.equal(expiredSubmit.status,410);
  assert.equal(store.records('code').length,0);assert.equal(store.records('grant').length,0);
  const missing=await user('/consent?request=missing');assert.equal(missing.status,410);assert.match(await missing.text(),/ChatGPT/);
  assert.equal((await user('/consent')).status,410);
});
