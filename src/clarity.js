export const dimensions=['Browser','Device','Country/Region','OS','Source','Medium','Campaign','Channel','URL'];
export class Clarity {
  constructor(store, fetcher=fetch) { this.store=store;this.fetch=fetcher;this.pending=new Map(); }
  async insights(id, days=1, dims=[]) {
    if(![1,2,3].includes(days)||dims.length>3||dims.some(d=>!dimensions.includes(d))||new Set(dims).size!==dims.length) throw new Error('Use 1–3 days and up to 3 unique supported dimensions');
    const token=this.store.token(id),query=JSON.stringify([days,[...dims].sort()]),key=id+query;
    const cached=this.store.db.prepare('SELECT at,data FROM snapshots WHERE project=? AND query=? ORDER BY at DESC LIMIT 1').get(id,query);
    const revision=this.store.db.prepare('SELECT token_updated FROM projects WHERE id=?').get(id).token_updated;
    if(cached&&cached.at>=revision&&Date.now()-cached.at<6*3600000) return {project:id,days,dimensions:dims,cached:true,captured_at:new Date(cached.at).toISOString(),data:JSON.parse(cached.data)};
    if(this.pending.has(key)) return this.pending.get(key);
    const request=this.load(id,days,dims,query,token);
    this.pending.set(key,request);
    try { return await request; } finally { this.pending.delete(key); }
  }
  async load(id,days,dims,query,token) {
    if(this.store.used(id)>=10) throw new Error('Local rolling 24-hour request budget exhausted. Use saved history or wait. Microsoft also enforces a daily quota.');
    this.store.recordRequest(id);
    const url=new URL('https://www.clarity.ms/export-data/api/v1/project-live-insights');
    url.searchParams.set('numOfDays',String(days)); [...dims].sort().forEach((d,i)=>url.searchParams.set('dimension'+(i+1),d));
    let response;
    try { response=await this.fetch(url,{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(30000),redirect:'error'}); }
    catch { throw new Error('Clarity request timed out or failed. No automatic retry was made to preserve quota.'); }
    if(!response.ok) throw new Error(({401:'Clarity token is invalid or expired',403:'Clarity token lacks permission',429:'Microsoft Clarity daily quota exceeded'})[response.status]||'Clarity API returned HTTP '+response.status);
    const text=await response.text(); if(text.length>10_000_000) throw new Error('Clarity response exceeds the storage limit');
    let data; try { data=JSON.parse(text); } catch { throw new Error('Clarity returned invalid JSON'); }
    if(!Array.isArray(data)) throw new Error('Unexpected Clarity response format');
    const at=Date.now(); this.store.db.prepare('INSERT INTO snapshots(project,query,at,data) VALUES(?,?,?,?)').run(id,query,at,JSON.stringify(data));
    return {project:id,days,dimensions:dims,cached:false,captured_at:new Date(at).toISOString(),data};
  }
  history(id,limit=30) { return this.store.db.prepare('SELECT id,query,at,data FROM snapshots WHERE project=? ORDER BY at DESC LIMIT ?').all(id,limit).map(r=>({id:r.id,query:JSON.parse(r.query),captured_at:new Date(r.at).toISOString(),data:JSON.parse(r.data)})); }
  async collect() { for(const p of this.store.projects().filter(p=>p.enabled&&p.configured)) { try { await this.insights(p.id,1,[]); } catch { this.store.audit('scheduled_collection_failed',p.id); } } this.store.cleanup(); }
}
