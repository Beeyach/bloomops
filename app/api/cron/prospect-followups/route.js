import {NextResponse} from 'next/server';
import {getCloudflareContext} from '@opennextjs/cloudflare';
import {getBloomOpsDb} from '@/lib/bloomops/db.mjs';
import {runScheduledProspectFollowup} from '@/lib/bloomops/prospect-followups.mjs';
export const dynamic='force-dynamic';
const env=()=>{try{return {...process.env,...(getCloudflareContext().env||{})};}catch{return process.env||{};}};
const same=(given,expected)=>{const a=String(given||''),b=String(expected||'');if(!b||a.length!==b.length)return false;let diff=0;for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);return diff===0;};
export async function POST(req){
 const e=env();
 // Configuration is checked before D1 construction, so an unconfigured
 // deployment cannot mutate a sequence or make any provider request.
 if(e.BLOOMOPS_GOOGLE_FOLLOWUP_SCHEDULER_ENABLED!=='true'||!e.BLOOMOPS_GOOGLE_FOLLOWUP_CRON_SECRET)return NextResponse.json({error:'Follow-up scheduler is disabled.'},{status:503});
 if(!same(req.headers.get('x-followup-secret'),e.BLOOMOPS_GOOGLE_FOLLOWUP_CRON_SECRET))return NextResponse.json({error:'Not authorised.'},{status:401});
 const result=await runScheduledProspectFollowup(getBloomOpsDb(),e);
 return NextResponse.json(result,{status:result?.unavailable?503:result?.conflict?409:200});
}
