import {notFound} from 'next/navigation';
import {requireShell} from '@/lib/bloomops/shell-server.mjs';
import {getProspectImport} from '@/lib/bloomops/prospect-imports.mjs';
import {Button,PageHeader} from '@/components/bloomops/Primitives';
import ProspectImportReceipt from '@/components/bloomops/ProspectImportReceipt';
export const dynamic='force-dynamic';
export const metadata={title:'Import receipt'};
export default async function ImportReceiptPage({params}){
 const {access,actor}=await requireShell('internal');if(access.workspace.purpose!=='prospecting')notFound();
 const receipt=await getProspectImport(access.db,actor,(await params).receiptId);if(!receipt)notFound();
 return <div className="bo-prospect-page"><Button href="/prospecting/import/receipts" variant="ghost" icon="chevron-left">Back to import history</Button><PageHeader title="Import receipt" subtitle="The original import result stays available after profiles are edited."/><ProspectImportReceipt receipt={receipt}/></div>;
}
