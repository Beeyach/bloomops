// Canon has no provider allowlist: labels describe channels, never accounts.
export const CONTENT_PLATFORM_LIMIT=12;
export const CONTENT_PLATFORM_LABEL_LIMIT=60;
const safe=value=>typeof value==='string'&&value.isWellFormed()&&!/[\x00-\x1f\x7f-\x9f\p{Cf}]/u.test(value);
const text=value=>value.normalize('NFC').trim().replace(/\s+/gu,' ');
export function platformFilterKey(value) {
  if(!safe(value))return null;
  const key=text(value).toLowerCase().normalize('NFC');return key&&key.length<=120?key:null;
}
export function normalizePlatform(value) {
  if(!safe(value))return null;
  const label=text(value),key=platformFilterKey(value);return label&&label.length<=60&&key?{key,label}:null;
}
// Match SQLite BINARY/UTF-8 order, including astral characters. JS's default
// UTF-16 ordering would make mixed Unicode sets look changed on every save.
const compare=(a,b)=>{const x=Array.from(a.key,c=>c.codePointAt(0)),y=Array.from(b.key,c=>c.codePointAt(0));for(let i=0;i<Math.min(x.length,y.length);i++)if(x[i]!==y[i])return x[i]-y[i];return x.length-y.length;};
export function normalizePlatforms(values) {
  const invalid=()=>({ok:false,reason:'invalid',errors:{platforms:'Enter up to 12 distinct platform labels, each 1–60 characters, without control or invisible formatting characters.'}});
  if(!Array.isArray(values)||values.length>CONTENT_PLATFORM_LIMIT)return invalid();
  const platforms=values.map(normalizePlatform);
  if(platforms.some(p=>!p)||new Set(platforms.map(p=>p.key)).size!==platforms.length)return invalid();
  return {ok:true,platforms:platforms.sort(compare)};
}
export const samePlatforms=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
