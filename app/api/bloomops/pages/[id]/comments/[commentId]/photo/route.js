import {getActor,notFound,requireAccess} from '@/lib/bloomops/access.mjs';
import {withApiErrors} from '@/lib/bloomops/api-handler.mjs';
import {downloadProfilePhoto,profilePhotoResponse} from '@/lib/bloomops/profile-photos.mjs';
export const dynamic='force-dynamic';
export const GET=withApiErrors(async(req,{params})=>{
  const {access,response}=await requireAccess(req);if(response)return response;
  const {id,commentId}=await params;
  return profilePhotoResponse(await downloadProfilePhoto(access.db,{bucket:access.env.FILES,actor:await getActor(access),context:{kind:'comment',pageId:id,commentId}}))||notFound();
});
