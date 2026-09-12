// Shared synthetic local browser story. Invoked only after the caller's loopback,
// development/captured-mail guard and explicitly generated fixture are established.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

export async function handoffStory({base,page,context,project,platform,sql,lit,api,check,layout,widths,generationInput}) {
  const projectPath=`/api/bloomops/projects/${project}`;
  const actions=()=>sql(`SELECT * FROM actions WHERE project_id=${lit(project)} ORDER BY rowid`);
  const milestones=()=>sql(`SELECT * FROM milestones WHERE project_id=${lit(project)} ORDER BY position,id`);
  const outputs=()=>sql(`SELECT * FROM deliverables WHERE project_id=${lit(project)} ORDER BY rowid`);
  const moveAction=async action=>{
    await page.goto(`${base}/work/actions/${action.id}`,{waitUntil:'networkidle'});
    for(const status of ['in_progress','done']) {
      await page.getByRole('button',{name:'Change Action status',exact:true}).click();
      await page.getByLabel('Next Action status',{exact:true}).selectOption(status);
      await page.getByRole('button',{name:'Save Action status',exact:true}).click();
      await page.getByRole('dialog').waitFor({state:'detached'}); await page.reload({waitUntil:'networkidle'});
    }
  };
  const movePhase=async name=>{
    const phase=milestones().find(m=>m.name===name); assert.ok(phase);
    for(const status of ['in_progress','completed']) {
      const current=milestones().find(m=>m.id===phase.id);
      await api(context,`${projectPath}/milestones/${phase.id}/transition`,{toStatus:status,expectedRevision:current.revision});
    }
  };
  // Build/QA use canonical APIs; critical review/launch/handoff and output controls
  // below are exercised through actual hydrated forms.
  const late=['Coordinate client review','Coordinate approved launch','Prepare handoff'];
  for(const action of actions().filter(a=>!late.includes(a.title))) for(const toStatus of ['in_progress','done']) {
    await api(context,`/api/bloomops/actions/${action.id}/transition`,{toStatus,expectedRevision:actions().find(a=>a.id===action.id).revision});
  }
  for(const phase of milestones().filter(m=>!['Client Review','Launch','Handoff'].includes(m.name))) await movePhase(phase.name);
  check('QA completion does not approve or deliver output',outputs().every(d=>d.status==='planned'&&d.delivered_at===null));
  const output=outputs()[0]; assert.ok(output);
  await page.goto(`${base}/work/projects/${project}`,{waitUntil:'networkidle'});
  const row=()=>page.locator(`[data-deliverable-id="${output.id}"]`);
  const moveOutput=async toStatus=>{
    await row().getByRole('button',{name:'Change Deliverable status',exact:true}).click();
    await page.getByLabel('Next Deliverable status',{exact:true}).selectOption(toStatus);
    if(toStatus==='approved') for(const width of widths) await layout('handoff-approve',page,width);
    await page.getByRole('button',{name:'Save Deliverable status',exact:true}).click();
    await page.getByRole('dialog').waitFor({state:'detached'}); await page.reload({waitUntil:'networkidle'});
  };
  for(const status of ['in_progress','internal_review','client_review','in_progress','internal_review','client_review','approved']) await moveOutput(status);
  check('review and rework reach explicit Approved without implying delivery',outputs()[0].status==='approved'&&outputs()[0].delivered_at===null);
  for(const [title,phase] of [['Coordinate client review','Client Review'],['Coordinate approved launch','Launch'],['Prepare handoff','Handoff']]) {
    await moveAction(actions().find(a=>a.title===title)); await movePhase(phase);
  }
  await page.goto(`${base}/work/projects/${project}`,{waitUntil:'networkidle'}); await moveOutput('delivered');
  check('explicit delivery records its timestamp without completing the Project',Boolean(outputs()[0].delivered_at)&&sql(`SELECT status FROM projects WHERE id=${lit(project)}`)[0].status==='planned');
  await row().getByRole('button',{name:'Edit Deliverable',exact:true}).click();
  await page.locator('#deliverable-clientLabel').fill('Your build and handoff');
  await page.getByLabel('Deliverable visibility',{exact:true}).selectOption('client');
  await page.getByRole('button',{name:'Save Deliverable details',exact:true}).click();await page.getByRole('dialog').waitFor({state:'detached'});await page.reload({waitUntil:'networkidle'});
  const bytes=Buffer.from(`${platform} handoff\nOperating guide. Access uses delegated invitations. No credentials.\n`), filename=`${platform} handoff.txt`;
  const files=()=>page.getByRole('region',{name:'Files',exact:true});
  await files().getByRole('button',{name:'Upload file',exact:true}).click();
  let dialog=page.getByRole('dialog');await dialog.getByLabel('File',{exact:true}).setInputFiles({name:filename,mimeType:'text/plain',buffer:bytes});
  await dialog.getByLabel('Attach to',{exact:true}).selectOption(output.id);
  check('handoff upload starts internal',await dialog.getByLabel('File visibility',{exact:true}).inputValue()==='internal');
  for(const width of widths) await layout('handoff-file',page,width);
  const uploading=page.waitForResponse(r=>r.url()===base+projectPath+'/files'&&r.request().method()==='POST');
  await dialog.getByRole('button',{name:'Upload',exact:true}).click();const uploaded=await uploading;assert.equal(uploaded.status(),201);const fileId=(await uploaded.json()).fileId;
  await dialog.waitFor({state:'detached'});await page.reload({waitUntil:'networkidle'});
  check('handoff attaches to its canonical Deliverable',await row().getByRole('button',{name:`Download ${filename}`,exact:true}).count()===1);
  const downloadEvent=page.waitForEvent('download');await row().getByRole('button',{name:`Download ${filename}`,exact:true}).click();
  check('handoff download contains the exact uploaded bytes',readFileSync(await (await downloadEvent).path()).equals(bytes));
  const fileRow=files().locator(`[data-file-id="${fileId}"]`);await fileRow.getByRole('button',{name:'Change file visibility',exact:true}).click();
  await page.getByLabel('File visibility',{exact:true}).selectOption('client');await page.getByRole('button',{name:'Save file visibility',exact:true}).click();await page.getByRole('dialog').waitFor({state:'detached'});
  const snapshot=()=>JSON.stringify([outputs(),actions(),milestones(),sql(`SELECT * FROM assets WHERE id=${lit(fileId)}`),sql(`SELECT * FROM activity_events WHERE subject_id IN (${lit(project)},${lit(fileId)},${lit(output.id)}) ORDER BY rowid`)]);
  const before=snapshot(); const replay=await api(context,projectPath+'/blueprint/generate',generationInput);
  check('generation replay preserves delivered handoff, file and semantic history',replay.replayed&&snapshot()===before);
  return {fileId,filename,bytes,outputId:output.id};
}
export async function verifyClientHandoff({base,client,handoff,check,layout,widths}) {
  await client.page.goto(base+'/portal',{waitUntil:'networkidle'});
  const text=await client.page.locator('main').innerText();
  check('Client sees the explicit delivered label without internal launch work',text.includes('Your build and handoff')&&text.includes('Delivered')&&!/Coordinate approved launch|Prepare handoff|Perform internal QA/.test(text));
  await client.page.goto(base+'/portal',{waitUntil:'networkidle'});
  for(const width of widths) await layout('handoff-client-files',client.page,width,{compactDesktop:true});
  const download=client.page.waitForEvent('download');await client.page.getByRole('button',{name:`Download ${handoff.filename}`,exact:true}).click();
  check('Client downloads the exact explicitly shared handoff',readFileSync(await (await download).path()).equals(handoff.bytes));
}
