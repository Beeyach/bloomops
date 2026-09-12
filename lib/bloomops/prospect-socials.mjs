import {safeProspectUrl} from './prospect-values.mjs';

// P1 has manual audit/source checks, not an automated social detector. Only a
// checked business/person identity source establishes whose profile this is.
// Never extract arbitrary report links or infer a handle from the business name.
export function verifiedProspectSocials(sources=[]){
 const links=new Map();
 for(const source of sources){
  if(!['businessName','personName'].includes(source.fieldKey)||source.verification!=='checked'||!source.checkedAt)continue;
  const safe=safeProspectUrl(source.sourceUrl);if(!safe)continue;
  const url=new URL(safe),host=url.hostname.toLowerCase().replace(/^www\./,'');
  if(url.protocol!=='https:'||url.port)continue;
  const parts=url.pathname.split('/').filter(Boolean);let network;
  if(host==='instagram.com'&&parts.length===1&&/^[a-zA-Z0-9._]{1,30}$/.test(parts[0])&&!['p','reel','reels','stories','explore','accounts','direct','share','about','developer','legal','privacy','terms','challenge','oauth'].includes(parts[0].toLowerCase()))network='instagram';
  if(host==='linkedin.com'&&parts.length===2&&['in','company'].includes(parts[0])&&/^[a-zA-Z0-9_-]+$/.test(parts[1]))network='linkedin';
  if(!network)continue;
  url.search='';url.hash='';url.pathname='/'+parts.join('/')+'/';
  const label=(network==='instagram'?'Instagram':'LinkedIn')+(source.fieldKey==='businessName'?' business profile':' person profile');
  links.set(url.href,{network,url:url.href,label});
 }
 return [...links.values()];
}
