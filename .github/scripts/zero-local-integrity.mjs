// Read the exact disposable local D1 database, not an exported reconstruction.
// Workerd caps statement bytecode; a whole-schema quick_check now exceeds that
// cap. Node SQLite keeps the FULL check (including cross-table pages/freelist),
// whereas substituting per-table checks would lose physical integrity coverage.
import {DatabaseSync} from 'node:sqlite';
import {readdirSync} from 'node:fs';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
function disposableFile(disposableRoot){
 const root=join(disposableRoot,'.wrangler/state/v3/d1'),files=[];
 function walk(path){for(const entry of readdirSync(path,{withFileTypes:true})){
  if(entry.isSymbolicLink())throw Error('Refusing a symlink in disposable D1 storage.');
  const next=join(path,entry.name);if(entry.isDirectory())walk(next);
  else if(entry.isFile()&&/^[a-f0-9]{64}\.sqlite$/.test(entry.name))files.push(next);
 }}
 walk(root);if(files.length!==1)throw Error('Expected exactly one disposable local D1 database.');
 return files[0];
}
export function localD1Integrity(disposableRoot){
 // SQLite's file-readonly mode omits CHECK validation in quick_check. Keep
 // the ordinary connection semantics but forbid writes before any inspection.
 const db=new DatabaseSync(disposableFile(disposableRoot));
 try{
  db.exec('PRAGMA query_only=ON');
  if(db.prepare('PRAGMA query_only').get().query_only!==1)throw Error('Query-only guard unavailable.');
  const version=db.prepare('SELECT sqlite_version() version').get().version;
  const rows=db.prepare('PRAGMA quick_check').all();
  if(rows.length!==1||rows[0].quick_check!=='ok')throw Error('Whole-database SQLite integrity check failed: '+rows.map(r=>r.quick_check).join('; '));
  return {version,queryOnly:true,result:'ok'};
 }finally{db.close();}
}
// This is a diagnostic on the original local file, never remote acceptance.
// EXPLAIN compiles the check without running its integrity bytecode. Disable
// Python's statement cache so restoring the limit proves a new compilation.
export function localBytecodeDiagnostic(disposableRoot){
 const script=`import sqlite3, sys, json
db=sqlite3.connect(sys.argv[1], cached_statements=0)
db.execute('PRAGMA query_only=ON')
original=db.getlimit(sqlite3.SQLITE_LIMIT_VDBE_OP)
result={'sqliteVersion':sqlite3.sqlite_version,'limit':25000}
result['unlimitedOpcodes']=len(db.execute('EXPLAIN PRAGMA quick_check').fetchall())
db.setlimit(sqlite3.SQLITE_LIMIT_VDBE_OP,25000)
try:
 result['limitedOpcodes']=len(db.execute('EXPLAIN PRAGMA quick_check').fetchall())
 result['limitedCompilation']='completed'
except MemoryError:
 result['limitedCompilation']='SQLITE_NOMEM (Python MemoryError)'
db.setlimit(sqlite3.SQLITE_LIMIT_VDBE_OP,original)
result['restoredOpcodes']=len(db.execute('EXPLAIN PRAGMA quick_check').fetchall())
result['wholeFileCheck']=db.execute('PRAGMA quick_check').fetchall()
db.close()
print(json.dumps(result))`;
 return JSON.parse(execFileSync('python3',['-c',script,disposableFile(disposableRoot)],{encoding:'utf8'}));
}
