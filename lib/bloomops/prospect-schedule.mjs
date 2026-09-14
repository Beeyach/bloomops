// A read-only three-message timing example. No queue or schedule persistence.
const DAY=86400000;
const dateStamp=p=>Date.UTC(p.year,p.month-1,p.day);
const business=p=>![0,6].includes(new Date(dateStamp(p)).getUTCDay());
function addDays(p,n){const d=new Date(dateStamp(p)+n*DAY);return {...p,year:d.getUTCFullYear(),month:d.getUTCMonth()+1,day:d.getUTCDate()};}
function businessDays(p,n){let next={...p};while(n){next=addDays(next,1);if(business(next))n--;}return next;}
export function previewProspectSchedule(timeZone,earliestAt){
 if(typeof earliestAt!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(earliestAt))throw new Error('Choose a valid earliest start in UTC.');
 const start=new Date(earliestAt);if(!Number.isFinite(+start)||start.toISOString()!==earliestAt||start.getUTCFullYear()<2000||start.getUTCFullYear()>2100)throw new Error('Choose a start between 2000 and 2100.');
 let format;try{if(typeof timeZone!=='string'||!timeZone)throw new Error();format=new Intl.DateTimeFormat('en-GB',{timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});}catch{throw new Error('Record a valid recipient timezone before previewing.');}
 const parts=instant=>Object.fromEntries(format.formatToParts(instant).filter(p=>p.type!=='literal').map(p=>[p.type,Number(p.value)]));
 function instant(local){
  const wall=dateStamp(local)+local.hour*3600000+local.minute*60000,offsets=new Set();
  // Sample either side of transitions, then round-trip every candidate. This
  // handles fractional offsets and detects missing/repeated local times.
  for(let hours=-48;hours<=48;hours+=6){const sample=wall+hours*3600000,p=parts(sample);offsets.add(dateStamp(p)+p.hour*3600000+p.minute*60000+p.second*1000-sample);}
  const candidates=[...offsets].map(offset=>wall-offset).filter(value=>{const p=parts(value);return ['year','month','day','hour','minute'].every(k=>p[k]===local[k])&&p.second===0;});
  if(candidates.length!==1)throw new Error('This local time is missing or repeated. Choose another earliest start.');return candidates[0];
 }
 const rounded=Math.ceil(+start/60000)*60000;let first=parts(rounded);
 if(!business(first)||first.hour>=11){first=addDays(first,1);first.hour=9;first.minute=0;while(!business(first))first=addDays(first,1);}else if(first.hour<9){first.hour=9;first.minute=0;}
 const dates=[first,businessDays(first,3)];dates.push(businessDays(dates[1],5));
 const label=new Intl.DateTimeFormat('en-GB',{timeZone,dateStyle:'full',timeStyle:'short'});
 return {timeZone,earliestAt,messages:dates.map((local,i)=>{const value=instant(local);return {number:i+1,at:new Date(value).toISOString(),local:label.format(value)};}),note:'Weekdays only; public holidays are not excluded. This preview does not schedule email.'};
}
