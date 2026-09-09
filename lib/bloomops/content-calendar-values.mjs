export const CONTENT_CALENDAR_MAX_DAYS=42;
export function contentMonth(month=new Date().toISOString().slice(0,7)) {
  if(typeof month!=='string'||!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)||Number(month.slice(0,4))<100)return null;
  const year=Number(month.slice(0,4)),m=Number(month.slice(5)),leap=year%4===0&&(year%100!==0||year%400===0),days=[31,leap?29:28,31,30,31,30,31,31,30,31,30,31][m-1];
  const adjacent=offset=>{const n=year*12+m-1+offset,y=Math.floor(n/12);return y<100||y>9999?null:`${String(y).padStart(4,'0')}-${String(n%12+1).padStart(2,'0')}`;};
  return {month,start:`${month}-01`,end:`${month}-${days}`,days,previous:adjacent(-1),next:adjacent(1)};
}
export const contentDateLabel=date=>new Intl.DateTimeFormat('en',{timeZone:'UTC',weekday:'short',month:'short',day:'numeric',year:'numeric'}).format(new Date(`${date}T12:00:00Z`));
