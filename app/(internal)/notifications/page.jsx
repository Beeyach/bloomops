import {notFound} from 'next/navigation';
import {requireShell} from '@/lib/bloomops/shell-server.mjs';
import {listNotifications} from '@/lib/bloomops/notifications.mjs';
import NotificationInbox from '@/components/bloomops/NotificationInbox';
export const dynamic='force-dynamic';
export const metadata={title:'Notifications'};
export default async function NotificationsPage(){
 const {access,actor}=await requireShell('internal'),data=await listNotifications(access.db,actor);if(!data)notFound();
 return <NotificationInbox key={`${actor.userId}:${actor.workspaceId}:${actor.membershipId}`} initial={data} scope={{workspaceId:actor.workspaceId,userId:actor.userId,membershipId:actor.membershipId}}/>;
}
