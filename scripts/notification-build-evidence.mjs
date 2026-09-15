// Local evidence only: hash completed build inputs/outputs without reading secrets.
import {createHash} from 'node:crypto';
import {readFileSync,readdirSync,statSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
export const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
export function buildArtifacts(root){
 const files=[];
 function walk(relative){for(const entry of readdirSync(join(root,relative),{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){const path=relative+'/'+entry.name;if(entry.isDirectory())walk(path);else if(entry.isFile())files.push({path,bytes:statSync(join(root,path)).size,sha256:hash(readFileSync(join(root,path)))});}}
 walk('.open-next');return files;
}
export function localProcesses(pid=process.pid){
 const rows=[];function visit(id){try{const name=readFileSync(`/proc/${id}/comm`,'utf8').trim();rows.push({pid:id,name});const children=readFileSync(`/proc/${id}/task/${id}/children`,'utf8').trim();if(children)for(const child of children.split(' '))visit(Number(child));}catch{}}
 visit(pid);return rows;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const root=process.cwd(),revision=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
 execFileSync('git',['diff','--exit-code','HEAD','--'],{stdio:'pipe'});
 const files=buildArtifacts(root),versions={node:process.version,npm:execFileSync('npm',['--version'],{encoding:'utf8'}).trim()};
 for(const name of ['next','@opennextjs/cloudflare','wrangler','react'])versions[name]=JSON.parse(readFileSync(join(root,'node_modules',name,'package.json'),'utf8')).version;
 const configuration=['next.config.js','open-next.config.ts','wrangler.jsonc','package.json','package-lock.json'].map(path=>({path,sha256:hash(readFileSync(join(root,path)))}));
 writeFileSync(process.argv[2],JSON.stringify({root,revision,recordedAt:new Date().toISOString(),command:'npm run cf:build',versions,configuration,files,digest:hash(JSON.stringify(files))},null,2));
}
