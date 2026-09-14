import {headers} from 'next/headers';
import {redirect} from 'next/navigation';
import Link from 'next/link';
import {getAccessOrProblem,getActor} from '@/lib/bloomops/access.mjs';
import {hasSharedPages} from '@/lib/bloomops/pages.mjs';
import {hasPortalContent} from '@/lib/bloomops/portal-content.mjs';
import {ROLE_LABELS} from '@/lib/bloomops/membership.mjs';
import InternalShell from '@/components/bloomops/InternalShell';
import PortalShell from '@/components/bloomops/PortalShell';
import ProfilePhotoEditor from '@/components/bloomops/ProfilePhotoEditor';
export const dynamic='force-dynamic';
export const metadata={title:'Your profile'};
export default async function ProfilePage(){
  const {access}=await getAccessOrProblem(await headers());if(!access)redirect('/sign-in');if(!access.workspace||!access.membership)redirect('/workspaces');
  const portal=access.membership.role==='client',Shell=portal?PortalShell:InternalShell;
  const actor=portal?await getActor(access):null;
  const [hasContent,hasPages]=portal?await Promise.all([hasPortalContent(access.db,actor),hasSharedPages(access.db,actor)]):[false,false];
  return <Shell workspace={access.workspace} user={access.user} hasContent={hasContent} hasPages={hasPages} roleLabel={ROLE_LABELS[access.membership.role]}><div className="bo-personal-profile"><Link href={portal?'/portal':'/'} className="bo-link bo-profile-back">Back to Home</Link><h1>Your profile</h1><ProfilePhotoEditor name={access.user.name} email={access.user.email}/></div></Shell>;
}
