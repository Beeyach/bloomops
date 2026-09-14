import {withApiErrors} from '@/lib/bloomops/api-handler.mjs';
import {sampleCsv} from '@/lib/bloomops/prospect-csv-values.mjs';
import {prospectAccess} from '../_shared.mjs';
export const GET=withApiErrors(async req=>{const {response}=await prospectAccess(req,'prospecting.manage');if(response)return response;return new Response(sampleCsv(),{headers:{'content-type':'text/csv; charset=utf-8','content-disposition':'attachment; filename="bloomsi-sample-prospects.csv"','cache-control':'private, no-store','x-content-type-options':'nosniff'}});});
