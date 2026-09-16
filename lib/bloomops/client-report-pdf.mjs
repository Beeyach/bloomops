import {PDFDocument,rgb} from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
// Local bundled fonts only. No provider, browser-rendering service or remote
// URL supplied by report content is used to create a document.
export const REPORT_PDF_FONTS=['instrument-sans-var.ttf'];
export async function publishedReportPdf(report,fontBytes){
 const doc=await PDFDocument.create();doc.registerFontkit(fontkit);
 // Embed the existing TTF completely: the fontkit subsetter cannot safely
 // subset the variable webfonts. Full embedding preserves the real glyph map.
 const fonts=[];for(const bytes of fontBytes){const font=await doc.embedFont(bytes,{subset:false,features:{liga:false,clig:false}});fonts.push({font,characters:new Set(font.getCharacterSet())});}
 const ink=rgb(.09,.08,.16),muted=rgb(.32,.30,.39),margin=48,width=595.28,height=841.89,available=width-margin*2;
 let page,y;const pages=[];
 function addPage(){page=doc.addPage([width,height]);pages.push(page);y=height-margin;}
 function ensure(space){if(!page||y-space<64)addPage();}
 function fontFor(char){const match=fonts.find(f=>f.characters.has(char.codePointAt(0)));if(!match){const e=new Error('This report contains characters not supported by the bundled PDF fonts. The published portal version is unchanged.');e.code='report_pdf_font';throw e;}return match.font;}
 function runs(text){const result=[];for(const char of text){const font=fontFor(char);const last=result.at(-1);if(last?.font===font)last.text+=char;else result.push({text:char,font});}return result;}
 const measure=(text,size)=>runs(text).reduce((n,r)=>n+r.font.widthOfTextAtSize(r.text,size),0);
 function line(text,size,color){ensure(size*1.55);let x=margin;for(const r of runs(text)){page.drawText(r.text,{x,y:y-size,size,font:r.font,color});x+=r.font.widthOfTextAtSize(r.text,size);}y-=size*1.55;}
 function paragraph(text,{size=11,color=ink,gap=10}={}){
  for(const paragraph of String(text).split('\n')){if(!paragraph){ensure(size);y-=size;continue;}let current='';
   for(const word of paragraph.split(/\s+/u)){const next=current?current+' '+word:word;if(measure(next,size)<=available){current=next;continue;}if(current){line(current,size,color);current='';}
    // Wrap long unbroken text without clipping or dropping Unicode code points.
    for(const char of word){if(current&&measure(current+char,size)>available){line(current,size,color);current='';}current+=char;}
   }if(current)line(current,size,color);
  }y-=gap;
 }
 function heading(text){ensure(60);paragraph(text,{size:16,gap:7});}
 const s=report.snapshot;addPage();paragraph('Bloomsi client report',{size:11,color:muted});paragraph(s.title,{size:24,gap:16});
 for(const [label,value] of [['Client',s.clientName],['Service',[s.serviceName,s.packageName].filter(Boolean).join(' — ')],['Period',`${s.periodStart} to ${s.periodEnd}`],['Timezone',s.timezone],['Account',s.accountLabel],['Channel',s.channel],['Scope',s.scopeLabel]])paragraph(`${label}: ${value||'Not supplied'}`,{gap:3});
 paragraph(`${s.templateLabel}. Template version ${s.templateVersion}. Published version ${report.version}.`,{size:10,color:muted});paragraph(`Published ${report.publishedAt}`,{size:10,color:muted});
 for(const [key,label] of [['clientSummary','Summary'],['workCompleted','Work completed'],['limitations','Limits and context'],['nextActions','Next actions']]){heading(label);paragraph(s[key]||'Not supplied.');}
 heading('Observations');paragraph(s.verification);
 for(const m of s.metrics){ensure(70);paragraph(m.label,{size:13,gap:4});paragraph(m.state==='value'?m.value.toLocaleString('en-US'):{missing:'Not supplied',unavailable:'Unavailable',not_tracked:'Not tracked'}[m.state],{size:17,gap:5});paragraph(`${m.unit==='count'?'Count':m.unit}. ${m.definition}`,{size:10,color:muted,gap:4});paragraph(m.origin,{size:10,color:muted,gap:14});}
 heading('Calculated values');for(const c of s.calculations){paragraph(`${c.label}: ${c.display}`,{size:13,gap:5});paragraph(c.definition,{size:10,color:muted});}
 if(s.comparison){const c=s.comparison,shown=v=>v.state==='value'?v.value.toLocaleString('en-US'):{missing:'Not supplied',unavailable:'Unavailable',not_tracked:'Not tracked'}[v.state];
  heading('Period comparison');paragraph(`${c.periodKind}. Previous: ${c.previous.start} to ${c.previous.end} (${c.previous.days} days), published version ${c.version}. Current: ${c.current.start} to ${c.current.end} (${c.current.days} days).`);paragraph(c.note,{size:10});
  for(const key of c.chartKeys){const m=c.metrics.find(m=>m.key===key),maximum=Math.max(m.previous.value,m.current.value,1);ensure(125);paragraph(`${m.label} — count. Scale: 0 to ${Math.max(m.previous.value,m.current.value).toLocaleString('en-US')}.`,{size:12,gap:6});
   for(const [period,label,color] of [['previous','Previous',rgb(134/255,129/255,156/255)],['current','Current',rgb(93/255,88/255,115/255)]]){paragraph(`${label}: ${shown(m[period])}`,{size:10,gap:3});ensure(15);page.drawRectangle({x:margin,y:y-8,width:available*m[period].value/maximum,height:8,color});y-=19;}
  }
  heading('Comparison values');for(const m of c.metrics){ensure(65);paragraph(m.label,{size:12,gap:4});paragraph(`Previous: ${shown(m.previous)}. Current: ${shown(m.current)}. Difference (count): ${m.difference===null?'Not available':(m.difference>0?'+':'')+m.difference.toLocaleString('en-US')}.`,{size:10,gap:12});}
 }
 for(let i=0;i<pages.length;i++)pages[i].drawText(`Published version ${report.version}. Page ${i+1} of ${pages.length}.`,{x:margin,y:30,size:9,font:fonts[0].font,color:muted});
 doc.setTitle(s.title);doc.setCreator('Bloomsi');doc.setProducer('Bloomsi client reporting');doc.setCreationDate(new Date(report.publishedAt));doc.setModificationDate(new Date(report.publishedAt));doc.setSubject(`Published version ${report.version}; snapshot ${report.snapshotHash}`);
 return doc.save();
}
