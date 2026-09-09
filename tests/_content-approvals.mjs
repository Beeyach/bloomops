import { setup as content } from './_content.mjs';
import { all,run } from './_bloomops-db.mjs';
import { requestContentApproval,withdrawContentApproval,respondContentApproval,contentApprovalHistory,getPortalApproval,approvalRequests } from '../lib/bloomops/content-approvals.mjs';
import { transitionContent } from '../lib/bloomops/content-pipeline.mjs';
import { setContentPlatforms } from '../lib/bloomops/content-platforms.mjs';
export async function setup(options={}) {
  const t=await content(options);t.client=await t.actor('james');
  t.contentId=(await t.add({visibility:'client',pillar:'PRIVATE_PILLAR',script:'Review this script',caption:'Review this caption',platforms:['Instagram','TikTok'],targetPublishDate:'2026-09-22'},{serviceEngagementId:'social-service'})).contentId;
  run(t.raw,"UPDATE content_items SET stage='client_review' WHERE id=?",t.contentId);
  t.request=async(input={},extra={})=>requestContentApproval(t.db,{actor:t.owner,contentId:t.contentId,input:{requestId:crypto.randomUUID(),expectedRevision:(await t.item(t.contentId))?.revision||1,...input},...extra});
  t.respond=(roundId,decision='approved',feedback=null,extra={})=>respondContentApproval(t.db,{actor:t.client,roundId,input:{decision,feedback},...extra});
  t.withdraw=async(roundId,input={},extra={})=>withdrawContentApproval(t.db,{actor:t.owner,roundId,input:{expectedRevision:(await t.item(t.contentId))?.revision||1,...input},...extra});
  t.rounds=(actor=t.owner,page=1)=>contentApprovalHistory(t.db,actor,t.contentId,{page});
  t.portal=(id,actor=t.client)=>getPortalApproval(t.db,actor,id);
  t.requests=(actor=t.client)=>approvalRequests(t.db,actor);
  t.move=async(stage,input={},extra={})=>transitionContent(t.db,{actor:t.owner,contentId:t.contentId,input:{targetStage:stage,expectedRevision:(await t.item(t.contentId))?.revision||1,...input},...extra});
  t.platforms=async(platforms,extra={})=>setContentPlatforms(t.db,{actor:t.owner,contentId:t.contentId,input:{platforms,expectedRevision:(await t.item(t.contentId))?.revision||1},...extra});
  t.snapshot=()=>['content_items','content_platforms','content_review_revisions','content_approval_rounds','activity_events'].map(table=>all(t.raw,`SELECT * FROM ${table} ORDER BY rowid`));
  return t;
}
