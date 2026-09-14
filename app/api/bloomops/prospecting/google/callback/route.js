import {finishProspectGoogle} from '@/lib/bloomops/prospect-google.mjs';
import {prospectAccess} from '../../_shared.mjs';
export const dynamic='force-dynamic';
const back=outcome=>new Response(null,{status:303,headers:{location:'/prospecting/sender?google='+outcome,'cache-control':'no-store','referrer-policy':'no-referrer'}});
export async function GET(req){
 try{
  const {access,response}=await prospectAccess(req,'prospecting.manage');if(response)return back('unavailable');
  const query=new URL(req.url).searchParams;if(['state','code','error'].some(k=>query.getAll(k).length>1))return back('unavailable');
  const result=await finishProspectGoogle(access.db,access.actor,access.env,access.session.id,{state:query.get('state'),code:query.get('code'),error:query.get('error')});
  return back(result?.connected?'connected':result?.cancelled?'cancelled':'unavailable');
 }catch{return back('unavailable');}
}
