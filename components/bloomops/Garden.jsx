export const palettes=[['#eeeafb','#a99bff','#ffe98a'],['#fff0e9','#ff82c8','#ffe98a'],['#e9f7f4','#56bfa1','#ffb49c'],['#eaf5ff','#6ec8ff','#ffe98a']];
export function variantFor(seed){let hash=0;for(const char of String(seed||'garden'))hash=(Math.imul(hash,31)+char.codePointAt(0))>>>0;return hash%palettes.length;}
export default function Garden({variant}){
 const [,petal,center]=palettes[variant];
 return <svg viewBox="0 0 64 64" aria-hidden="true" focusable="false" className="bo-prospect-garden">
  <path d="M32 54V30" stroke="#39785d" strokeWidth="3" strokeLinecap="round"/>
  <path d="M31 47c-10 0-15-5-15-11 9 0 15 3 15 11ZM33 51c10 0 15-5 15-11-9 0-15 3-15 11Z" fill="#76b699"/>
  {variant===1?<><path d="M18 17c7 0 10 4 14 8 4-4 7-8 14-8v12c0 9-7 14-14 14s-14-5-14-14Z" fill={petal}/><path d="m24 19 8-9 8 9-8 9Z" fill="#ffb49c"/><path d="M32 29v11" stroke="#b64d83" strokeWidth="2"/></>:variant===2?<><path d="M32 31C18 31 13 23 15 14c12 1 19 7 17 17Z" fill={petal}/><path d="M32 39c14-1 20-9 17-18-12 2-19 8-17 18Z" fill="#75bdaa"/><circle cx="32" cy="16" r="7" fill={center}/></>:<>{[0,60,120,180,240,300].map(angle=><ellipse key={angle} cx="32" cy="16" rx="7" ry="10" fill={petal} transform={`rotate(${angle} 32 26)`}/>)}<circle cx="32" cy="26" r="7" fill={center}/><circle cx="30" cy="24" r="1.5" fill="#8a6117"/></>}
 </svg>;
}
