// Read the exact disposable local D1 database, not an exported reconstruction.
// Workerd caps statement bytecode; a whole-schema quick_check now exceeds that
// cap. Node SQLite keeps the FULL check (including cross-table pages/freelist),
// whereas substituting per-table checks would lose physical integrity coverage.
import {DatabaseSync} from 'node:sqlite';
import {readdirSync} from 'node:fs';
import {join} from 'node:path';
export function localD1Integrity(disposableRoot){
 const root=join(disposableRoot,'.wrangler/state/v3/d1'),files=[];
 function walk(path){for(const entry of readdirSync(path,{withFileTypes:true})){
  if(entry.isSymbolicLink())throw Error('Refusing a symlink in disposable D1 storage.');
  const next=join(path,entry.name);if(entry.isDirectory())walk(next);
  else if(entry.isFile()&&/^[a-f0-9]{64}\.sqlite$/.test(entry.name))files.push(next);
 }}
 walk(root);if(files.length!==1)throw Error('Expected exactly one disposable local D1 database.');
 // SQLite's file-readonly mode omits CHECK validation in quick_check. Keep
 // the ordinary connection semantics but forbid writes before any inspection.
 const db=new DatabaseSync(files[0]);
 try{
  db.exec('PRAGMA query_only=ON');
  if(db.prepare('PRAGMA query_only').get().query_only!==1)throw Error('Query-only guard unavailable.');
  const version=db.prepare('SELECT sqlite_version() version').get().version;
  const rows=db.prepare('PRAGMA quick_check').all();
  if(rows.length!==1||rows[0].quick_check!=='ok')throw Error('Whole-database SQLite integrity check failed: '+rows.map(r=>r.quick_check).join('; '));
  return {version,queryOnly:true,result:'ok'};
 }finally{db.close();}
}
