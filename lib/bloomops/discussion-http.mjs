import { json, notFound } from './access.mjs';
import { getRecordDiscussions, listDiscussionPeople, recordDiscussionAccess } from './record-discussions.mjs';
export async function discussionGet(req,db,actor,parent){
  const q=new URL(req.url).searchParams;
  if([...q.keys()].some(k=>!['threadId','page','resolved','people','audience','search','access'].includes(k))||[...q.keys()].some(k=>q.getAll(k).length!==1)
    ||['resolved','people','access'].some(k=>q.has(k)&&!['true','false'].includes(q.get(k))))return json({error:'Invalid discussion query.'},400);
  const threadId=q.get('threadId');
  if(q.get('access')==='true')return await recordDiscussionAccess(db,actor,parent,threadId)?json({ok:true}):notFound();
  const result=q.get('people')==='true'?await listDiscussionPeople(db,actor,parent,{threadId,audience:q.get('audience')||'internal',search:q.get('search')||''})
    :await getRecordDiscussions(db,actor,parent,{threadId,page:q.has('page')?Number(q.get('page')):1,resolved:q.get('resolved')==='true'});
  return result?json(result):notFound();
}
