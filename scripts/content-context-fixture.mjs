// Synthetic compatibility data shared by SQLite and disposable native D1 acceptance.
// Uses the pre-E2A column shape; never targets a deployed database.
export const contentContextBytes = new TextEncoder().encode('PRIVATE_AD_BYTES');
export const contentContextTables = ['content_items','content_platforms','assets','content_asset_links','content_review_revisions','content_approval_rounds','activity_events'];
export async function seedLegacyContent(run) {
  for (const ws of ['a','b']) await run('INSERT INTO workspaces(id,name,slug) VALUES(?,?,?)',ws,ws,ws);
  for (const [id,role,ws] of [['ellen','owner','a'],['ary','admin','a'],['pm','project_manager','a'],['sam','team_member','a'],['james','client','a'],['foreign','owner','b']]) {
    await run('INSERT INTO user(id,name,email,email_verified) VALUES(?,?,?,1)',id,id,`${id}@example.com`);
    await run("INSERT INTO workspace_memberships(id,workspace_id,user_id,role,status) VALUES(?,?,?,?,'active')",`m-${id}`,ws,id,role);
  }
  for (const [id,ws] of [['james','a'],['lawrence','a'],['foreign-client','b']]) await run('INSERT INTO bloomops_clients(id,workspace_id,name,slug) VALUES(?,?,?,?)',id,ws,id,id);
  await run("INSERT INTO client_contacts(workspace_id,client_id,name,user_id) VALUES('a','james','James','james')");
  await run("INSERT INTO departments(id,workspace_id,name,slug) VALUES('social','a','Social','social')");
  await run("INSERT INTO service_types(id,workspace_id,name,slug,department_id) VALUES('type-social','a','Social','social','social')");
  await run("INSERT INTO service_engagements(id,workspace_id,client_id,service_type_id) VALUES('social-service','a','james','type-social')");
  for (const [id,stage,type,service] of [['idea','idea','ad_creative',null],['recording','waiting_for_recording','reel','social-service'],['open','client_review','video','social-service'],['terminal','client_review','reel','social-service']]) {
    await run("INSERT INTO content_items(id,workspace_id,client_id,service_engagement_id,creation_request_id,title,type,stage,recording_required,visibility,revision,target_publish_date,script) VALUES(?,'a','james',?,?,?, ?,?,1,'client',2,'2026-09-22','Legacy script')",id,service,crypto.randomUUID(),`Legacy ${id}`,type,stage);
    await run("INSERT INTO content_platforms(workspace_id,content_id,platform_key,label) VALUES('a',?,'instagram','Instagram')",id);
    await run("INSERT INTO activity_events(workspace_id,actor_membership_id,actor_user_id,client_id,subject_type,subject_id,event_type,metadata_json) VALUES('a','m-ellen','ellen','james','content',?,'CONTENT_CREATED',?)",id,JSON.stringify({contentTitle:`Legacy ${id}`,serviceEngagementId:service,details:{title:`Legacy ${id}`,type,pillar:null,ownerMembershipId:null,hook:null,script:'Legacy script',caption:null,cta:null,recordingRequired:true,internalReviewRequired:true,clientApprovalRequired:true,targetPublishDate:'2026-09-22',visibility:'client'},platforms:[{key:'instagram',label:'Instagram'}]}));
  }
  for (const id of ['open','terminal']) await seedReview(run,id);
  await run("UPDATE content_approval_rounds SET status='approved',responded_by='m-james',responded_at='2026-09-10T12:00:00Z',completion_revision=2,completion_id='legacy-approved' WHERE id='round-terminal'");
  await run("UPDATE content_items SET stage='approved',revision=3 WHERE id='terminal'");
  await seedContentAsset(run,'recording','legacy-file');
}
export async function seedReview(run,contentId) {
  await run("INSERT INTO content_review_revisions(id,workspace_id,content_id,number,title,type,hook,script,caption,cta,target_publish_date,platforms_json) SELECT ?,'a',id,1,title,type,hook,script,caption,cta,target_publish_date,(SELECT json_group_array(label) FROM (SELECT label FROM content_platforms WHERE content_id=? ORDER BY platform_key)) FROM content_items WHERE id=?",`review-${contentId}`,contentId,contentId);
  await run("INSERT INTO content_approval_rounds(id,workspace_id,content_id,revision_id,number,request_id,request_revision,requested_by,requested_at) VALUES(?,'a',?,?,1,?,1,'m-ellen','2026-09-10T11:00:00Z')",`round-${contentId}`,contentId,`review-${contentId}`,crypto.randomUUID());
}
export async function seedContentAsset(run,contentId,id,visibility='client') {
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',contentContextBytes)),n=>n.toString(16).padStart(2,'0')).join('');
  await run("INSERT INTO assets(id,workspace_id,creation_request_id,filename,mime_type,byte_size,sha256,uploader_membership_id,initial_visibility,visibility,status,object_key,etag,ready_at) VALUES(?,'a',?,'PRIVATE-ADS.mp4','video/mp4',?,?,'m-james',?,?,'ready',?,?,'2026-09-10T11:00:00Z')",id,crypto.randomUUID(),contentContextBytes.length,hash,visibility,visibility,`local/${id}`,hash.slice(0,32));
  await run("INSERT INTO content_asset_links(asset_id,workspace_id,content_id,purpose) VALUES(?,'a',?,'recording')",id,contentId);
}
export async function seedAdsParents(run) {
  await run("INSERT INTO departments(id,workspace_id,name,slug) VALUES('ads','a','Ads','ads'),('foreign-ads','b','Ads','ads')");
  await run("INSERT INTO service_types(id,workspace_id,name,slug,department_id) VALUES('type-ads','a','Ads','ads','ads'),('type-other-ads','a','Other Ads','other-ads','ads'),('type-foreign-ads','b','Ads','ads','foreign-ads')");
  for (const [id,ws,client,type] of [['ads-service','a','james','type-ads'],['ads-other-service','a','james','type-other-ads'],['ads-other-client-service','a','lawrence','type-ads'],['foreign-ads-service','b','foreign-client','type-foreign-ads']]) await run('INSERT INTO service_engagements(id,workspace_id,client_id,service_type_id) VALUES(?,?,?,?)',id,ws,client,type);
  for (const [id,ws,client,service] of [['ads-project','a','james','ads-service'],['ads-other-project','a','james','ads-other-service'],['ads-other-client','a','lawrence','ads-other-client-service'],['ads-no-service','a','james',null],['social-project','a','james','social-service'],['foreign-ads-project','b','foreign-client','foreign-ads-service']]) await run("INSERT INTO projects(id,workspace_id,client_id,service_engagement_id,name,visibility) VALUES(?,?,?,?,'Campaign','client')",id,ws,client,service);
}
export async function insertAds(run,extra={}) {
  const row={id:crypto.randomUUID(),workspace_id:'a',client_id:'james',service_engagement_id:'ads-service',production_area:'ads',ads_project_id:'ads-project',creation_request_id:crypto.randomUUID(),title:'PRIVATE_ADS_CONTENT',type:'ad_creative',stage:'idea',visibility:'client',recording_required:1,target_publish_date:'2026-09-22',...extra};
  await run(`INSERT INTO content_items(${Object.keys(row).join(',')}) VALUES(${Object.keys(row).map(()=>'?').join(',')})`,...Object.values(row));
  return row.id;
}
