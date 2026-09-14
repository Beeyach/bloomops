import {and,eq} from 'drizzle-orm';
import {schema} from '@/lib/bloomops/db.mjs';
import {prospectCondition} from '@/lib/bloomops/prospects.mjs';
import {evaluate} from '@/lib/bloomops/authorization.mjs';
import {Button} from './Primitives';
export default async function ProspectClientOrigin({db,actor,clientId}){
 if(!evaluate(actor,{action:'prospecting.view'}).allowed)return null;
 const p=schema.prospects,r=schema.prospectConversions;const rows=await db.select({id:p.id,businessName:p.businessName}).from(p).innerJoin(r,and(eq(r.workspaceId,p.workspaceId),eq(r.prospectId,p.id))).where(and(prospectCondition(actor),eq(r.clientId,clientId))).orderBy(r.createdAt).limit(50);
 return rows.length?<section aria-label="Original prospects"><h2>Prospect history</h2>{rows.map(p=><Button key={p.id} href={'/prospecting/'+p.id} icon="prospecting">{p.businessName}</Button>)}</section>:null;
}
