// Optional E2A containment extension to the existing Social approval walkthrough.
// The caller permits loopback and synthetic local D1/R2 only.
import { randomUUID } from 'node:crypto';
export async function contentContextReview({base,sql,lit,check,owner,client,pm,team,ws,cl,dept}) {
  const adsDept=randomUUID(),type=randomUUID(),service=randomUUID(),project=randomUUID(),content=randomUUID();
  sql(`INSERT INTO departments(id,workspace_id,name,slug) VALUES(${lit(adsDept)},${lit(ws)},'Ads','ads');
    INSERT INTO service_types(id,workspace_id,name,slug,department_id) VALUES(${lit(type)},${lit(ws)},'Campaign service','ads',${lit(adsDept)});
    INSERT INTO service_engagements(id,workspace_id,client_id,service_type_id) VALUES(${lit(service)},${lit(ws)},${lit(cl)},${lit(type)});
    INSERT INTO projects(id,workspace_id,client_id,service_engagement_id,name,visibility) VALUES(${lit(project)},${lit(ws)},${lit(cl)},${lit(service)},'E2A campaign','client');
    INSERT INTO content_items(id,workspace_id,client_id,service_engagement_id,production_area,ads_project_id,creation_request_id,title,type,stage,recording_required,visibility,target_publish_date)
      VALUES(${lit(content)},${lit(ws)},${lit(cl)},${lit(service)},'ads',${lit(project)},${lit(randomUUID())},'E2A_PRIVATE_ADS_CONTENT','ad_creative','waiting_for_recording',1,'client','2026-09-22');`);
  for(const reclassified of [false,true]) {
    if(reclassified)sql(`UPDATE service_types SET department_id=${lit(dept)} WHERE id=${lit(type)}`);
    for(const [name,who] of [['Owner',owner],['PM',pm],['Team',team],['Client',client]]) {
      for(const path of [`/api/bloomops/content/${content}`,`/api/bloomops/content/${content}/files`,`/api/bloomops/portal/content/${content}`,`/api/bloomops/portal/recordings/${content}/files`]) {
        const r=await who.context.request.get(base+path);
        check(`${name} guessed Ads GET denied, department reclassified=${reclassified}`,r.status()===404&&!/E2A_PRIVATE/.test(await r.text()));
      }
      const r=await who.context.request.patch(base+`/api/bloomops/content/${content}`,{headers:{origin:base},data:{title:'Bypass',expectedRevision:1}});
      check(`${name} Ads edit denied, department reclassified=${reclassified}`,r.status()===404);
    }
    for(const [who,path] of [[owner,`/social/${content}`],[client,`/portal/content/${content}`]]) {
      const r=await who.page.goto(base+path);
      // The portal can stream its layout with 200 before notFound resolves.
      // Require the rendered denial as well as absence of protected copy.
      await who.page.getByRole('heading',{name:'There is nothing here',exact:true}).waitFor();
      check('built Worker guessed Ads page renders Not Found without protected copy',[200,404].includes(r.status())&&!/E2A_PRIVATE/.test(await who.page.content()));
    }
    for(const [who,path] of [[owner,'/social'],[owner,'/api/bloomops/content/calendar?start=2026-09-01&end=2026-09-30'],[client,'/portal'],[client,'/portal/content']]) {
      const r=await who.context.request.get(base+path);check('built Worker Social/portal projections omit Ads',r.status()===200&&!/E2A_PRIVATE/.test(await r.text()));
    }
  }
  const ads=await owner.page.goto(base+'/ads');check('E1 Campaign work remains reachable',ads.status()===200&&await owner.page.getByRole('heading',{name:'Campaign work',exact:true}).count()===1);
  check('denied browser operations leave Ads identity and revision unchanged',sql(`SELECT production_area,ads_project_id,revision FROM content_items WHERE id=${lit(content)}`).every(r=>r.production_area==='ads'&&r.ads_project_id===project&&r.revision===1));
}
