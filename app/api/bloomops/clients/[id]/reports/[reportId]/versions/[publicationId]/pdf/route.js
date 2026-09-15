import {withApiErrors} from '@/lib/bloomops/api-handler.mjs';
import {reportPdfResponse} from '@/lib/bloomops/client-report-pdf-response.mjs';
export const dynamic='force-dynamic';
export const GET=withApiErrors((req,{params})=>reportPdfResponse(req,params));
