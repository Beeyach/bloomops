import {PageHeader,EmptyState} from '@/components/bloomops/Primitives';
import {requireShell} from '@/lib/bloomops/shell-server.mjs';
import {evaluate} from '@/lib/bloomops/authorization.mjs';
import PagesHome from '@/components/bloomops/PagesHome';
export const dynamic='force-dynamic';
export const metadata={title:'Pages'};
export default async function PagesPage({searchParams}){
 await requireShell('internal');return <PagesHome/>;
}
