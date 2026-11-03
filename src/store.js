import { DatabaseSync } from 'node:sqlite';
import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'node:crypto';
export const random = () => randomBytes(32).toString('base64url');
export const hash = value => createHash('sha256').update(value).digest('hex');
export const seeds = ['rockmole.lv','aitroniclab.com','stepintoplan.com','krezs.lv','ztc.lv','ztcprefab.co.uk','nordicrafter.com','cncexperts.lv'];
export class Store {
  constructor(path, key) {
    if (!/^[a-f0-9]{64}$/i.test(key || '')) throw new Error('ENCRYPTION_KEY must be 64 hex characters');
    this.key = Buffer.from(key,'hex');
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS projects(id TEXT PRIMARY KEY,name TEXT NOT NULL,domain TEXT NOT NULL,clarity_id TEXT NOT NULL DEFAULT '',token TEXT,enabled INTEGER NOT NULL DEFAULT 1,token_updated INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS records(kind TEXT,key TEXT,value TEXT,expires INTEGER,PRIMARY KEY(kind,key));
      CREATE TABLE IF NOT EXISTS snapshots(id INTEGER PRIMARY KEY,project TEXT,query TEXT,at INTEGER,data TEXT);
      CREATE INDEX IF NOT EXISTS snapshot_lookup ON snapshots(project,query,at);
      CREATE TABLE IF NOT EXISTS requests(project TEXT,at INTEGER);
      CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY,at INTEGER,event TEXT,subject TEXT);
    `);
    for(const domain of seeds) this.db.prepare('INSERT OR IGNORE INTO projects(id,name,domain) VALUES(?,?,?)').run(domain.replaceAll('.','-'),domain,domain);
  }
  encrypt(value) {
    const iv=randomBytes(12), cipher=createCipheriv('aes-256-gcm',this.key,iv);
    const data=Buffer.concat([cipher.update(value,'utf8'),cipher.final()]);
    return Buffer.concat([iv,cipher.getAuthTag(),data]).toString('base64');
  }
  decrypt(value) {
    const b=Buffer.from(value,'base64'),d=createDecipheriv('aes-256-gcm',this.key,b.subarray(0,12));
    d.setAuthTag(b.subarray(12,28)); return Buffer.concat([d.update(b.subarray(28)),d.final()]).toString();
  }
  projects() { return this.db.prepare('SELECT id,name,domain,clarity_id,enabled,token IS NOT NULL AS configured FROM projects ORDER BY name').all(); }
  saveProject({id,name,domain,clarity_id='',token='',enabled=true}) {
    this.db.prepare(`INSERT INTO projects(id,name,domain,clarity_id,token,enabled,token_updated) VALUES(?,?,?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET name=excluded.name,domain=excluded.domain,clarity_id=excluded.clarity_id,enabled=excluded.enabled,token=COALESCE(excluded.token,projects.token),token_updated=CASE WHEN excluded.token IS NOT NULL THEN excluded.token_updated ELSE projects.token_updated END`)
      .run(id,name,domain,clarity_id,token?this.encrypt(token):null,enabled?1:0,token?Date.now():0);
    this.audit('project_saved',id);
  }
  token(id) { const p=this.db.prepare('SELECT token,enabled FROM projects WHERE id=?').get(id); if(!p?.enabled||!p.token) throw new Error('Project is disabled or its Clarity API token has not been configured'); return this.decrypt(p.token); }
  put(kind,key,value,ttl=3600) { this.db.prepare('INSERT OR REPLACE INTO records VALUES(?,?,?,?)').run(kind,key,JSON.stringify(value),Date.now()+ttl*1000); }
  get(kind,key) { const row=this.db.prepare('SELECT value FROM records WHERE kind=? AND key=? AND expires>?').get(kind,key,Date.now()); return row?JSON.parse(row.value):undefined; }
  remove(kind,key) { this.db.prepare('DELETE FROM records WHERE kind=? AND key=?').run(kind,key); }
  take(kind,key) { const value=this.get(kind,key); this.remove(kind,key); return value; }
  records(kind) { return this.db.prepare('SELECT key,value,expires FROM records WHERE kind=? AND expires>?').all(kind,Date.now()).map(r=>({...JSON.parse(r.value),key:r.key,expires:r.expires})); }
  audit(event,subject='') { this.db.prepare('INSERT INTO audit(at,event,subject) VALUES(?,?,?)').run(Date.now(),event,subject); }
  recordRequest(project) { this.db.prepare('INSERT INTO requests VALUES(?,?)').run(project,Date.now()); }
  used(project) { return this.db.prepare('SELECT count(*) AS n FROM requests WHERE project=? AND at>?').get(project,Date.now()-86400000).n; }
  cleanup() { this.db.prepare('DELETE FROM records WHERE expires<?').run(Date.now()); this.db.prepare('DELETE FROM requests WHERE at<?').run(Date.now()-2*86400000); this.db.prepare('DELETE FROM snapshots WHERE at<?').run(Date.now()-400*86400000); this.db.prepare('DELETE FROM audit WHERE at<?').run(Date.now()-400*86400000); }
  close(){this.db.close();}
}
