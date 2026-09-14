import {normalizeProspectFields,safeProspectUrl} from './prospect-values.mjs';
export const CSV_FIELDS={businessName:'Business name',personName:'Contact name',website:'Website',publicEmail:'Email',location:'Country',platform:'Platform',instagram:'Instagram',linkedin:'LinkedIn'};
export const CSV_LIMIT=262144,CSV_ROWS=50;
const aliases={person:'personName','public email':'publicEmail','public contact email':'publicEmail',region:'location',location:'location'};
export function parseCsv(text){
 if(typeof text!=='string'||new TextEncoder().encode(text).length>CSV_LIMIT)throw Error('Choose a CSV file of 256 KiB or less.');
 const rows=[];let row=[],value='',quoted=false,ended=false;
 const cell=()=>{row.push(value);value='';ended=false;};const line=()=>{cell();if(row.some(x=>x.trim()))rows.push(row);row=[];if(rows.length>CSV_ROWS+1)throw Error('Import up to 50 rows at a time.');};
 text=text.replace(/^\uFEFF/,'');
 for(let i=0;i<text.length;i++){const c=text[i];if(quoted){if(c==='"'){if(text[i+1]==='"'){value+='"';i++;}else {quoted=false;ended=true;}}else value+=c;}else if(c==='"'){if(value||ended)throw Error('Invalid CSV quotation.');quoted=true;}else if(c===',')cell();else if(c==='\n'||c==='\r'){if(c==='\r'&&text[i+1]==='\n')i++;line();}else {if(ended&&c.trim())throw Error('Unexpected text after a quoted field.');if(!ended)value+=c;}}
 if(quoted)throw Error('A quoted CSV field was not closed.');if(value||row.length||ended)line();if(rows.length<2)throw Error('Include a header and at least one prospect.');
 const headers=rows.shift(),mapping=headers.map(h=>Object.keys(CSV_FIELDS).find(k=>[k.toLowerCase(),CSV_FIELDS[k].toLowerCase()].includes(h.trim().toLowerCase()))||aliases[h.trim().toLowerCase()]||null);
 if(mapping.some(k=>!k)||new Set(mapping).size!==mapping.length||!mapping.includes('businessName'))throw Error('Use the Sample CSV headings. Unknown or repeated columns are not imported.');
 return {mapping:headers.map((label,i)=>({label,field:mapping[i],target:CSV_FIELDS[mapping[i]]})),rows:rows.map((cells,i)=>{const raw=Object.fromEntries(mapping.map((k,j)=>[k,cells[j]?.trim()||null]));const fields={};for(const key of Object.keys(raw).filter(k=>!['instagram','linkedin'].includes(k)))fields[key]=key==='website'&&raw[key]&&!/^[a-z][a-z0-9+.-]*:/i.test(raw[key])?'https://'+raw[key]:raw[key];const normalized=normalizeProspectFields(fields,{creating:true});const errors=normalized.ok?[]:Object.values(normalized.errors);if(cells.length!==headers.length)errors.push('The number of cells does not match the header.');for(const key of ['instagram','linkedin'])if(raw[key]&&(!safeProspectUrl(raw[key])||!new URL(raw[key]).hostname.match(key==='instagram'?/(^|\.)instagram\.com$/:/(^|\.)linkedin\.com$/)))errors.push('Use the complete '+CSV_FIELDS[key]+' profile URL.');return {index:i+1,raw,fields:normalized.ok?normalized.fields:{},errors};})};
}
export function csvEncode(rows){const quote=v=>'"'+String(v??'').replaceAll('"','""')+'"';return rows.map(r=>r.map(quote).join(',')).join('\r\n')+'\r\n';}
export function sampleCsv(){return csvEncode([Object.values(CSV_FIELDS),['Fictional Cedar Studio','Maya Example','https://cedar.example','maya@cedar.example','Australia','Kajabi','',''],['Fictional Fern Garden','Rowan Example','','','New Zealand','','https://www.instagram.com/fictional_fern_example/','']]);}
