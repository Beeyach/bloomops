// Additive synthetic fixture for a task-only copy of the N2A development DB.
// Emits SQL only; no remote database, provider, video or mail calls.
import { writeFileSync } from 'node:fs';
import { setup } from '../tests/_content-approvals.mjs';
import { run, all } from '../tests/_bloomops-db.mjs';
import { createWorkspacePage, saveWorkspacePage } from '../lib/bloomops/pages.mjs';
import { getWorkspacePageTree } from '../lib/bloomops/page-hierarchy.mjs';
import { updatePageSharing } from '../lib/bloomops/page-sharing.mjs';
const output=process.argv[2];if(!output)throw Error('Provide task-only output prefix');
const t=await setup();
const round=await t.request();if(!round.ok)throw Error('Fixture approval creation failed');
const tree=()=>getWorkspacePageTree(t.db,t.owner);
const create=async(title,parentId=null)=>{
  const result=await createWorkspacePage(t.db,t.owner,{workspaceId:'a',requestId:crypto.randomUUID(),parentId,expectedTreeRevision:(await tree()).revision});
  if(!result.ok)throw Error('Fixture page creation failed');
  await saveWorkspacePage(t.db,t.owner,result.id,{workspaceId:'a',expectedRevision:1,title,body:'<h2>Your project guide</h2><p>Use this shared guide to follow your project.</p>'});return result.id;
};
const root=await create('Client welcome guide'), child=await create('Shared brand checklist',root), secret=await create('PRIVATE agency notes');
await updatePageSharing(t.db,t.owner,root,{workspaceId:'a',expectedTreeRevision:(await tree()).revision,kind:'grant',membershipId:'m-james',permission:'edit'});
await saveWorkspacePage(t.db,t.owner,root,{workspaceId:'a',expectedRevision:2,title:'Client welcome guide',body:`<h2>Your project guide</h2><p>A shared guide with a <a href="/portal/pages/${child}">brand checklist</a>.</p><p><a href="/api/bloomops/files/private-file/download">Hidden attachment</a></p><p><a href="/api/auth/sign-out">Unsafe account action</a></p><img src="/api/bloomops/files/private-file/download" alt="Private image must not load"><p><input type="checkbox" checked> Read the brief</p>`});
const tables=['content_items','content_platforms','content_review_revisions','content_approval_rounds','bloomops_pages','bloomops_page_settings','bloomops_page_trees','bloomops_page_locations','bloomops_page_grants'];
const lit=x=>x==null?'NULL':typeof x==='number'?String(x):"'"+String(x).replaceAll("'","''")+"'";
const statements=tables.flatMap(table=>all(t.raw,`SELECT * FROM ${table}`).map(row=>`INSERT INTO ${table}(${Object.keys(row).map(x=>'"'+x+'"').join(',')}) VALUES(${Object.values(row).map(lit).join(',')});`));
statements.push("UPDATE workspace_memberships SET status='active' WHERE id='m-sam';");
writeFileSync(output+'.sql',statements.join('\n'));writeFileSync(output+'.json',JSON.stringify({root,child,secret,content:t.contentId,round:round.roundId}));t.raw.close();
console.log('Synthetic preview fixture prepared.');
