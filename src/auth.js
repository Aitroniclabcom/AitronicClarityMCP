import { InvalidGrantError, InvalidTokenError, InvalidTargetError, InvalidScopeError, InvalidClientMetadataError } from '@modelcontextprotocol/sdk/server/auth/errors.js';
import { random, hash } from './store.js';
import { esc, page, hidden } from './views.js';
export class ConsentRequestError extends Error {
  constructor(reason,restartUrl) {super('OAuth consent request is unavailable');this.name='ConsentRequestError';this.reason=reason;this.restartUrl=restartUrl;}
}
export class AuthProvider {
  constructor(store,base) {
    this.store=store;this.resource=base+'/mcp';
    this.clientsStore={
      getClient:id=>{const c=store.get('client',id);return c?JSON.parse(store.decrypt(c.encrypted)):undefined;},
      registerClient:client=>{
        if(!client.redirect_uris?.length||client.redirect_uris.length>10) throw new InvalidClientMetadataError('Register 1–10 redirect URLs');
        for(const uri of client.redirect_uris) { const u=new URL(uri); if(u.hash||u.username||u.password||(u.protocol!=='https:'&&!(u.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(u.hostname)))) throw new InvalidClientMetadataError('HTTPS or localhost redirect URLs required'); }
        const c={...client,client_id:random(),client_id_issued_at:Math.floor(Date.now()/1000)};
        store.put('client',c.client_id,{encrypted:store.encrypt(JSON.stringify(c))},365*86400);return c;
      }
    };
  }
  target(resource) { if(resource&&resource.toString()!==this.resource) throw new InvalidTargetError('Invalid resource'); }
  scopes(scopes=[]) { if(scopes.some(s=>s!=='clarity:read')) throw new InvalidScopeError('Only clarity:read is supported'); }
  async authorize(client,params,res) {
    this.target(params.resource);this.scopes(params.scopes);
    // Keep the validated intent briefly after expiry so it can be restarted, never auto-approved.
    const id=random(); this.store.put('pending',id,{clientId:client.client_id,name:client.client_name||client.client_id,params:{...params,resource:params.resource?.toString()},session:res.req.sessionId,validUntil:Date.now()+600000},3600);
    res.redirect('/consent?request='+id);
  }
  restartUrl(p) {
    const q=new URLSearchParams({client_id:p.clientId,response_type:'code',redirect_uri:p.params.redirectUri,code_challenge:p.params.codeChallenge,code_challenge_method:'S256'});
    if(p.params.state!==undefined)q.set('state',p.params.state);
    if(p.params.scopes?.length)q.set('scope',p.params.scopes.join(' '));
    if(p.params.resource)q.set('resource',p.params.resource);
    return '/authorize?'+q;
  }
  findPending(req) {
    const id=req.method==='POST'?req.body?.request:req.query?.request;
    const p=typeof id==='string'?this.store.get('pending',id):undefined;
    if(!p)throw new ConsentRequestError('missing');
    if(p.validUntil!==undefined&&p.validUntil<=Date.now())throw new ConsentRequestError('expired',this.restartUrl(p));
    return p;
  }
  restartForSession(req) {
    const p=this.findPending(req);
    // OAuth clients may open consent in a different browser than the initial authorization request.
    // Re-run the SDK's full client/redirect/PKCE validation and show fresh consent in that browser.
    return p.session!==req.sessionId?this.restartUrl(p):undefined;
  }
  pending(req) {const p=this.findPending(req);if(p.session!==req.sessionId)throw new ConsentRequestError('session_mismatch',this.restartUrl(p));return p;}
  consentPage(req) {
    const p=this.pending(req);return page('Atļaut Clarity piekļuvi',`<section><p>Lietotne <strong>${esc(p.name)}</strong> pieprasa lasīšanas piekļuvi Clarity projektu analītikai.</p><p>Atbildes adrese: <code>${esc(p.params.redirectUri)}</code></p><p>Atzīmē projektus, ko šis pieslēgums drīkst lasīt. Jauni projekti netiks pievienoti automātiski.</p><form method="post" action="/consent">${hidden('csrf',req.session.csrf)}${hidden('request',req.query.request)}${this.store.projects().filter(p=>p.enabled).map(p=>`<label><input type="checkbox" name="projects" value="${esc(p.id)}">${esc(p.name)}</label>`).join('')}<button name="decision" value="approve">Atļaut atlasītos projektus</button> <button class="secondary" name="decision" value="deny">Atteikt</button></form></section>`);
  }
  approve(req,res) {
    const p=this.pending(req),u=new URL(p.params.redirectUri);
    if(p.params.state!==undefined) u.searchParams.set('state',p.params.state);
    if(req.body.decision!=='approve') u.searchParams.set('error','access_denied');
    else {
      const projects=Array.isArray(req.body.projects)?req.body.projects:[req.body.projects].filter(Boolean);
      const valid=this.store.projects().filter(p=>p.enabled).map(p=>p.id);
      if(!projects.length||projects.some(id=>!valid.includes(id))) return res.status(400).send(page('Atlasiet projektus','<p>Jāizvēlas vismaz viens aktīvs projekts. Atgriezieties un mēģiniet vēlreiz.</p>'));
      const code=random();this.store.put('code',hash(code),{...p,projects},120);u.searchParams.set('code',code);
    }
    this.store.remove('pending',req.body.request);res.redirect(u.toString());
  }
  code(client,code) {const c=this.store.get('code',hash(code));if(!c||c.clientId!==client.client_id) throw new InvalidGrantError('Invalid authorization code');return c;}
  async challengeForAuthorizationCode(client,code) {return this.code(client,code).params.codeChallenge;}
  async exchangeAuthorizationCode(client,code,_verifier,redirectUri,resource) {
    this.target(resource);const c=this.code(client,code);
    if(!redirectUri||redirectUri!==c.params.redirectUri) throw new InvalidGrantError('redirect_uri mismatch');
    this.store.remove('code',hash(code));
    const grant=random();this.store.put('grant',grant,{clientId:client.client_id,name:c.name,projects:c.projects},90*86400);
    this.store.audit('oauth_authorized',client.client_id);return this.issue(client.client_id,grant);
  }
  issue(clientId,grant) {
    const access=random(),refresh=random();
    this.store.put('access',hash(access),{clientId,grant,expiresAt:Math.floor(Date.now()/1000)+3600},3600);
    this.store.put('refresh',hash(refresh),{clientId,grant},30*86400);
    return {access_token:access,refresh_token:refresh,token_type:'Bearer',expires_in:3600,scope:'clarity:read'};
  }
  async exchangeRefreshToken(client,token,scopes,resource) {
    this.target(resource);this.scopes(scopes);const r=this.store.get('refresh',hash(token));
    if(!r||r.clientId!==client.client_id||!this.store.get('grant',r.grant)) throw new InvalidGrantError('Refresh token expired or revoked');
    this.store.remove('refresh',hash(token));return this.issue(r.clientId,r.grant);
  }
  async verifyAccessToken(token) {
    const t=this.store.get('access',hash(token)),g=t&&this.store.get('grant',t.grant);
    if(!g) throw new InvalidTokenError('Token expired or revoked');
    return {token,clientId:t.clientId,expiresAt:t.expiresAt,scopes:['clarity:read'],resource:new URL(this.resource),extra:{projects:g.projects}};
  }
  async revokeToken(client,request) {
    for(const kind of ['access','refresh']) {const r=this.store.get(kind,hash(request.token));if(r?.clientId===client.client_id) {this.store.remove('grant',r.grant);this.store.remove(kind,hash(request.token));}}
  }
}
