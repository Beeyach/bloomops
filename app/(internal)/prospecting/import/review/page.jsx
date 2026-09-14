import {notFound} from 'next/navigation';
import {requireShell} from '@/lib/bloomops/shell-server.mjs';
import {PageHeader,Button} from '@/components/bloomops/Primitives';
import ProspectImportPreview from '@/components/bloomops/ProspectImportPreview';
export const dynamic='force-dynamic';
export const metadata={title:'Preview prospect import'};
export default async function ImportReviewPage(){
 const {access,actor}=await requireShell('internal');if(access.workspace.purpose!=='prospecting'||!['owner','admin'].includes(actor.role))notFound();
 return <div className="bo-prospect-page bo-source-preview"><Button href="/prospecting/import" variant="ghost" icon="chevron-left">Back to source records</Button><PageHeader title="Preview prospect import" subtitle="Check mapped fields and possible duplicates before importing."/><Button href="/prospecting/import/receipts" variant="ghost" icon="history">Import history</Button><ProspectImportPreview workspaceId={access.workspace.id}/></div>;
}
