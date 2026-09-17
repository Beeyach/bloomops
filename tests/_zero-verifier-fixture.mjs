// Synthetic command transport for the real verifier; never starts Wrangler.
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {runMigrations,LIVE_SCHEMA_SQL,schemaFromRows} from '../scripts/migrate.mjs';

export async function verifierFixture(options={}) {
 const db=new DatabaseSync(':memory:');db.exec(readFileSync('schema.sql','utf8'));
 const inherited=readdirSync('migrations').filter(x=>x.endsWith('.sql')).sort();
 await runMigrations({files:inherited,exec:async({command,file,rows})=>rows?db.prepare(command).all():db.exec(file?readFileSync(file,'utf8'):command),schema:async()=>schemaFromRows(db.prepare(LIVE_SCHEMA_SQL).all()),readSql:name=>readFileSync('migrations/'+name,'utf8')});
 const files=JSON.parse(readFileSync('drizzle/meta/_journal.json','utf8')).entries.map(x=>x.tag+'.sql');
 db.exec('CREATE TABLE d1_migrations(id INTEGER PRIMARY KEY,name TEXT)');
 for(const [i,file] of files.entries()){db.exec(readFileSync('drizzle/'+file,'utf8'));db.prepare('INSERT INTO d1_migrations VALUES(?,?)').run(i+1,file);}
 const staging={uuid:'staging-id',name:'bloomops-staging',created_at:'2026-01-01',version:'production'};
 const mine={uuid:'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',name:'bloomops-a2-zero-verify',created_at:'2026-09-17',version:'production'};
 let created=false,deleted=false,started=false,passes=0,lists=0;
 const calls=[];
 const response=rows=>JSON.stringify([{success:true,results:rows}]);
 function execute(command,args){
  calls.push([command,...args]);
  if(command==='node')return `applied: (none)\nalready present (recorded, not executed): (none)\nalready applied: ${inherited.join(',')}\n`;
  if(command!=='npx'||args[0]!=='--no-install'||args[1]!=='wrangler')throw Error('Unexpected executable');
  const a=args.slice(2),kind=a[1];
  if(kind==='list') {lists++;if(options.afterCreateInventoryFailure&&lists===2)throw Error('Inventory transport failure');return JSON.stringify(options.preexisting&&!created?[staging,mine]:[staging,...(created&&!deleted?[mine]:[]),...(deleted&&options.inventoryChanged?[{...staging,uuid:'unrelated',name:'unrelated'}]:[])]);}
  if(kind==='info')return JSON.stringify(a[2]===staging.name?staging:options.replaced?{...mine,uuid:'replacement'}:options.renamed?{...mine,name:'renamed'}:mine);
  if(kind==='create'){created=true;if(options.createFailure)throw Error('Ambiguous create failure');return options.missingCreateId?'Created without identity':JSON.stringify({database_id:mine.uuid});}
  if(kind==='delete'){
   const config=JSON.parse(readFileSync(a[a.indexOf('--config')+1],'utf8'));
   if(a[2]!=='DB'||config.d1_databases[0].database_id!==mine.uuid)throw Error('Unsafe deletion');
   if(options.deleteFailure)throw Error('Delete transport failure');
   deleted=true;return 'Deleted';
  }
  if(kind==='migrations'){
   if(a[2]==='list')return 'No migrations to apply';
   if(options.firstFailure)throw Error('Injected migration failure');
   passes++;if(passes>1&&options.repeatFailure)throw Error('Injected repeat failure');
   return passes===1?files.join('\n'):'No migrations to apply';
  }
  if(kind==='execute'){
   if(a.includes('--file')){started=true;return response([]);}
   const sql=a[a.indexOf('--command')+1];
   if(!started)return response([]);
   if(sql==='PRAGMA quick_check'||sql==='EXPLAIN PRAGMA quick_check'){
    if(options.integrity==='nomem')throw Object.assign(Error('query failed'),{stderr:'out of memory: SQLITE_NOMEM [code: 7500]'});
    if(options.integrity==='malformed')return '{}';
    if(options.integrity==='finding'&&sql==='PRAGMA quick_check')return response([{quick_check:'CHECK constraint failed in synthetic'}]);
   }
   return response(db.prepare(sql).all());
  }
  throw Error('Unexpected command '+a.join(' '));
 }
 return {execute,calls,close:()=>db.close(),get deleted(){return deleted;},get passes(){return passes;},get lists(){return lists;}};
}
