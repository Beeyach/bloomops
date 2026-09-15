import {requireAccess,getActor,json,notFound} from './access.mjs';
import {getPublishedReport,reportPublicationReview} from './client-report-publications.mjs';
import {publishedReportPdf,REPORT_PDF_FONTS} from './client-report-pdf.mjs';
export async function reportPdfResponse(req,params,{portal=false}={}){
 const {access,response}=await requireAccess(req);if(response)return response;const actor=await getActor(access),{id,reportId,publicationId}=await params;
 if(new URL(req.url).search)return json({error:'Invalid query.'},400);
 if(!portal&&!await reportPublicationReview(access.db,actor,id,reportId))return notFound();
 const report=await getPublishedReport(access.db,actor,publicationId,{portal});if(!report||!portal&&report.reportId!==reportId)return notFound();
 try{
  const fonts=[];for(const name of REPORT_PDF_FONTS){const asset=await access.env.ASSETS.fetch(new Request(new URL('/fonts/'+name,req.url)));if(!asset.ok)throw Error('Bundled font unavailable');fonts.push(new Uint8Array(await asset.arrayBuffer()));}
  const bytes=await publishedReportPdf(report,fonts);
  // Rendering is work, not a permission lease. Check again before sending bytes.
  if(!await getPublishedReport(access.db,actor,publicationId,{portal}))return notFound();
  return new Response(bytes,{headers:{'content-type':'application/pdf','content-disposition':`attachment; filename="client-report-v${report.version}.pdf"`,'cache-control':'private, no-store','x-content-type-options':'nosniff','x-bloomsi-published-version':String(report.version),'x-bloomsi-snapshot-hash':report.snapshotHash}});
 }catch(error){return json({error:error.code==='report_pdf_font'?error.message:'PDF could not be generated. Retry this published version.'},error.code==='report_pdf_font'?422:503);}
}
