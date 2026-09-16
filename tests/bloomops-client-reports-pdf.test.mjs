import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PDFDocument} from 'pdf-lib';
import {publishedReportPdf,REPORT_PDF_FONTS} from '../lib/bloomops/client-report-pdf.mjs';
import {reportPublicationSnapshot} from '../lib/bloomops/client-report-publications.mjs';
import {reportCalculations} from '../lib/bloomops/client-report-values.mjs';
import {draft,observation} from './_client-report-fixture.mjs';
const fonts=REPORT_PDF_FONTS.map(f=>readFileSync(new URL('../public/fonts/'+f,import.meta.url)));
const report=()=>{const r={...draft(),templateId:'ghl_campaign',templateVersion:1,clientName:'Synthetic Client',serviceName:'GHL',clientSummary:'Clear result — café.',metrics:Object.fromEntries(['sent','delivered','failed','clicked','replied','opt_outs'].map(k=>[k,observation(k==='sent'?32:k==='delivered'?1:0)]))};r.calculations=reportCalculations(r);return {snapshot:reportPublicationSnapshot(r),version:3,publishedAt:'2026-09-15T20:00:00.000Z',snapshotHash:'synthetic-sha'};};
test('PDF creates real pages from the frozen snapshot with identified publication metadata',async()=>{const r=report(),bytes=await publishedReportPdf(r,fonts);assert.equal(Buffer.from(bytes).subarray(0,5).toString(),'%PDF-');const doc=await PDFDocument.load(bytes);assert.ok(doc.getPageCount()>=2);assert.equal(doc.getTitle(),r.snapshot.title);assert.equal(doc.getSubject(),'Published version 3; snapshot synthetic-sha');assert.equal(doc.getCreationDate().toISOString(),r.publishedAt);for(const p of doc.getPages())assert.equal(Math.round(p.getWidth()),595);});
test('long paragraphs and unbroken strings create additional pages without overflow fallback or silent glyph substitution',async()=>{const r=report();r.snapshot.clientSummary='Complete long paragraph. '.repeat(300);r.snapshot.nextActions='x'.repeat(8000);const doc=await PDFDocument.load(await publishedReportPdf(r,fonts));assert.ok(doc.getPageCount()>=6);r.snapshot.clientSummary='Unsupported glyph: \u{1F680}';await assert.rejects(publishedReportPdf(r,fonts),e=>e.code==='report_pdf_font');});
test('PDF includes actual frozen comparison bars/table without deriving growth from zero',async()=>{
 const {reportComparison}=await import('../lib/bloomops/client-report-comparison-values.mjs');const r=report(),current={...r.snapshot,metrics:Object.fromEntries(r.snapshot.metrics.map(m=>[m.key,m]))};
 current.periodStart='2026-09-01';current.periodEnd='2026-09-30';const prior={...r.snapshot,metrics:r.snapshot.metrics.map(m=>({...m,state:'value',value:0}))};
 r.snapshot.comparison=reportComparison(current,{id:'prior',sequence:1,snapshotHash:'prior-sha',snapshot:prior});assert.equal(r.snapshot.comparison.metrics[0].difference,32);assert.equal(r.snapshot.comparison.chartKeys.length,3);
 const doc=await PDFDocument.load(await publishedReportPdf(r,fonts));assert.ok(doc.getPageCount()>=3);assert.equal(doc.getSubject(),'Published version 3; snapshot synthetic-sha');
});
