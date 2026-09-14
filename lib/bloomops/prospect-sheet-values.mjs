// Shared sheet vocabulary. State labels project canonical records.
export const SHEET_VIEWS={all:{label:'All prospects',icon:'table',color:'mauve'},audit:{label:'To audit',icon:'eye',color:'blue'},ready:{label:'Ready to contact',icon:'send',color:'teal'},waiting:{label:'Waiting for reply',icon:'history',color:'amber'},reply:{label:'Needs a reply',icon:'message',color:'purple'},closed:{label:'Closed',icon:'check',color:'slate'}};
export const SHEET_COLUMNS={businessName:'Business',website:'Website',platform:'Platform',personName:'Contact',fit:'Fit',outreach:'Outreach',nextAction:'Next action',publicEmail:'Email',location:'Region',timeZone:'Timezone',proposedWork:'Matched offer',evidenceDate:'Audit date',source:'Source',importBatch:'Import batch',lastContacted:'Last contacted',createdAt:'Date added',importedAt:'Date imported'};
export const SHEET_DEFAULT_COLUMNS=['businessName','website','platform','personName','fit','outreach','nextAction'];
export const SHEET_DATES={createdAt:'Date added',importedAt:'Date imported',lastContacted:'Last contacted',evidenceDate:'Audit date'};
export const SHEET_FIT={unknown:'Unreviewed',strong:'Strong',hold:'Maybe',skip:'Skip'};
export const SHEET_EDITABLE=['businessName','website','platform','personName','fit','publicEmail','location','timeZone','proposedWork','evidenceDate'];
export function sheetQuery(input={}){
 const keys=['q','view','fit','region','platform','batch','never','sort','direction','page','size'];
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!keys.includes(k)))return null;
 const q={q:'',view:'all',fit:'',region:'',platform:'',batch:'',never:'',sort:'createdAt',direction:'desc',page:1,size:25,...input};
 if(['q','region','platform','batch'].some(k=>typeof q[k]!=='string'||q[k].length>160)||!Object.hasOwn(SHEET_VIEWS,q.view)||q.fit&&!Object.hasOwn(SHEET_FIT,q.fit)||!['','1'].includes(q.never)||!Object.hasOwn(SHEET_DATES,q.sort)||!['asc','desc'].includes(q.direction))return null;
 q.page=Number(q.page);q.size=Number(q.size);if(!Number.isInteger(q.page)||q.page<1||q.page>10000||![25,50,100,200].includes(q.size))return null;
 for(const k of ['q','region','platform','batch'])q[k]=q[k].trim();return q;
}
export function sheetPreferences(raw){
 const fallback={query:sheetQuery(),columns:SHEET_DEFAULT_COLUMNS,widths:{},viewId:'all',views:[]};
 if(!raw||typeof raw!=='object')return fallback;
 const columns=v=>Array.isArray(v)&&v.length<=Object.keys(SHEET_COLUMNS).length?['businessName',...new Set(v.filter(k=>k!=='businessName'&&Object.hasOwn(SHEET_COLUMNS,k)))]:SHEET_DEFAULT_COLUMNS;
 const views=Array.isArray(raw.views)?raw.views.slice(0,30).filter(v=>v&&typeof v.id==='string'&&v.id.length<=60&&typeof v.name==='string'&&v.name.trim()&&v.name.length<=60&&sheetQuery(v.query)).map(v=>({...v,columns:columns(v.columns)})):[];
 const valid=Object.hasOwn(SHEET_VIEWS,raw.viewId)||views.some(v=>v.id===raw.viewId);
 return {query:valid?sheetQuery(raw.query)||fallback.query:fallback.query,columns:columns(raw.columns),viewId:valid?raw.viewId:'all',views,widths:Object.fromEntries(Object.entries(raw.widths||{}).filter(([k,v])=>Object.hasOwn(SHEET_COLUMNS,k)&&Number.isInteger(v)&&v>=160&&v<=480))};
}
export const sheetDate=(v,empty='—')=>v?new Intl.DateTimeFormat('en-US',{timeZone:'UTC',month:'short',day:'numeric',year:'numeric'}).format(new Date(v)):empty;
