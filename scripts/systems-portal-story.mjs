// Runs inside the guarded synthetic local Systems browser fixture.
import assert from 'node:assert/strict';
export async function portalStory({base,owner,client,team,project,secondProject,clientId,service,ws,members,handoff,sql,lit,api,check,layout,widths}) {
 const patch=async(path,data)=>{const r=await owner.context.request.patch(base+path,{headers:{origin:base},data});assert.equal(r.status(),200,await r.text());};
 const projectRow=sql(`SELECT revision FROM projects WHERE id=${lit(secondProject)}`)[0];
 await patch(`/api/bloomops/projects/${secondProject}`,{visibility:'client',clientLabel:'Your GHL build',expectedRevision:projectRow.revision});
 const output=sql(`SELECT id,revision FROM deliverables WHERE project_id=${lit(secondProject)}`)[0];
 await patch(`/api/bloomops/projects/${secondProject}/deliverables/${output.id}`,{visibility:'client',clientLabel:'Your GHL output',expectedRevision:output.revision});
 for(const toStatus of ['in_progress','internal_review'])await api(owner.context,`/api/bloomops/projects/${secondProject}/deliverables/${output.id}/transition`,{toStatus,expectedRevision:sql(`SELECT revision FROM deliverables WHERE id=${lit(output.id)}`)[0].revision});
 const phase=sql(`SELECT id,revision FROM milestones WHERE project_id=${lit(project)} AND name='Handoff'`)[0];
 await patch(`/api/bloomops/projects/${project}/milestones/${phase.id}`,{visibility:'client',clientLabel:'Your handoff',expectedRevision:phase.revision});
 await client.page.goto(base+'/portal',{waitUntil:'networkidle'});
 const portalText=()=>client.page.locator('main').innerText();let text=await portalText();
 check('mixed GHL and Kajabi outputs use the existing Client portal sections',text.includes('Your GHL build')&&text.includes('Your GHL output')&&text.includes('Your handoff')&&text.includes(handoff.filename));
 check('Client output hides internal QA, review labels and provenance',!(/Perform internal QA|Build funnel|Build course|Internal Review|Coordinate approved launch|Prepare handoff|definition_hash|blueprint_key/.test(text))&&text.includes('In progress'));
 for(const width of widths)await layout('mixed-systems-portal',client.page,width,{compactDesktop:true});
 const filePath=`/api/bloomops/files/${handoff.fileId}`;
 const file=async()=>{const r=await owner.context.request.get(base+filePath);assert.equal(r.status(),200);return (await r.json()).file;};
 await patch(filePath,{operation:'visibility',visibility:'internal',expectedRevision:(await file()).revision});
 await client.page.reload({waitUntil:'networkidle'});
 check('current handoff visibility removes portal filename and bytes',!(await portalText()).includes(handoff.filename)&&(await client.context.request.get(base+filePath+'/download')).status()===404);
 await patch(filePath,{operation:'visibility',visibility:'client',expectedRevision:(await file()).revision});
 sql(`DELETE FROM project_assignments WHERE workspace_id=${lit(ws)} AND membership_id=${lit(members.team.membership)}`);
 for(const scope of ['service','client']) {
  const table=scope==='service'?'service_assignments':'client_assignments',column=scope==='service'?'service_engagement_id':'client_id',id=scope==='service'?service:clientId;
  sql(`INSERT INTO ${table}(workspace_id,${column},membership_id) VALUES(${lit(ws)},${lit(id)},${lit(members.team.membership)})`);
  await team.page.goto(base+'/systems',{waitUntil:'networkidle'});
  check(`issued Team ${scope} assignment gives exact Systems projects`,await team.page.locator(`[data-project-id="${project}"]`).count()===1&&await team.page.locator(`[data-project-id="${secondProject}"]`).count()===(scope==='client'?1:0));
  check(`issued Team ${scope} assignment gives current handoff bytes`,(await team.context.request.get(base+filePath+'/download')).status()===200);
  await team.page.goto(base+'/',{waitUntil:'networkidle'});check(`Home shows readable handoff under ${scope} scope`,(await team.page.locator('main').innerText()).includes(handoff.filename));
  await team.page.goto(base+'/work?tab=projects',{waitUntil:'networkidle'});check(`Work shows readable Project under ${scope} scope`,(await team.page.locator('main').innerText()).includes('Garden build'));
  sql(`DELETE FROM ${table} WHERE workspace_id=${lit(ws)} AND membership_id=${lit(members.team.membership)}`);
  for(const path of ['/','/work','/work?tab=projects','/systems']) {
   await team.page.goto(base+path,{waitUntil:'networkidle'});const body=await team.page.locator('main').innerText();
   check(`${path} removes revoked ${scope} Projects and historical handoff names`,!body.includes('Garden build')&&!body.includes('Second platform build')&&!body.includes(handoff.filename));
  }
  check(`revoked ${scope} scope cannot download guessed handoff bytes`,(await team.context.request.get(base+filePath+'/download')).status()===404);
 }
 sql(`UPDATE client_contacts SET user_id=NULL WHERE workspace_id=${lit(ws)} AND client_id=${lit(clientId)} AND user_id=${lit(members.client.id)}`);
 await client.page.reload({waitUntil:'networkidle'});const list=await client.context.request.get(base+'/api/bloomops/portal/projects');assert.equal(list.status(),200);
 check('issued Client session loses both platforms and handoff after contact unlinking',(await list.json()).projects.length===0&&!(await portalText()).includes('Your GHL build')&&!(await portalText()).includes(handoff.filename)&&(await client.context.request.get(base+filePath+'/download')).status()===404);
}
