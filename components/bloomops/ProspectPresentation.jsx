import {Icon} from './Icons';
import {safeProspectUrl} from '@/lib/bloomops/prospect-values.mjs';

const paths={
 edit:<><path d="m15 4 5 5M4 20l5-1L21 7a2 2 0 0 0-5-5L4 14Z"/></>,
 globe:<><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c5 5 5 13 0 18-5-5-5-13 0-18Z"/></>,
 pin:<><path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></>,
 clock:<><circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/></>,
 question:<><circle cx="12" cy="12" r="9"/><path d="M9 8a3 3 0 0 1 6 1c0 2-3 2-3 4M12 17h.01"/></>,
 opportunity:<><path d="M9 18h6M10 22h4M8 14a6 6 0 1 1 8 0c-1 1-1 2-1 2H9s0-1-1-2ZM12 1V0M3 4l1 1M20 5l1-1M1 11h2M21 11h2"/></>,
 history:<><path d="M3 11a9 9 0 1 1 2 7M3 4v7h7M12 6v6l4 2"/></>,
 linkedin:<><rect x="2" y="2" width="20" height="20" rx="3"/><path d="M7 10v7M11 17v-7m0 3c0-4 6-4 6 0v4M7 7h.01" strokeWidth="2.4"/></>,
};
export function ProfileIcon({name,size=20}){
 return paths[name]?<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{paths[name]}</svg>:<Icon name={name} size={size}/>;
}
function Unknown(){return <span className="bo-prospect-unknown">Not recorded</span>;}
function Property({icon,label,value,className='',iconOnly=false}){
 return <div className={`bo-profile-property ${className}`}><dt><span className="bo-profile-property-icon"><ProfileIcon name={icon}/></span><span className={iconOnly?'sr-only':undefined}>{label}</span></dt><dd>{value||<Unknown/>}</dd></div>;
}
export function ProspectIdentity({profile}){
 const website=safeProspectUrl(profile.website);
 return <div className="bo-profile-contact">
  <dl>
   <div className="bo-profile-person"><dt className="sr-only">Person</dt><dd>{profile.personName||<Unknown/>}</dd></div>
   <Property iconOnly icon="mail" label="Public contact email" value={profile.publicEmail}/>
   <Property iconOnly icon="globe" label="Website" value={website?<a href={website} target="_blank" rel="noreferrer">{website.replace(/^https?:\/\//,'')}</a>:null}/>
   <Property iconOnly icon="systems" label="Current platform" value={profile.platform}/>
   <Property iconOnly icon="pin" label="Location" value={profile.location}/>
   <Property iconOnly icon="clock" label="Timezone" value={profile.timeZone}/>
  </dl>
  <details className="bo-prospect-evidence bo-profile-business-details"><summary>Business details</summary><dl>
   <Property icon="clients" label="Services" value={profile.services}/>
  </dl></details>
 </div>;
}
export function ProspectAssessment({profile}){
 return <div className="bo-profile-assessment">
  <dl className="bo-profile-reason"><div><dt>Assessment reason</dt><dd>{profile.fitReason||<span className="bo-prospect-unknown">No opportunity assessed yet</span>}</dd></div></dl>
  <dl className="bo-profile-proposal"><div><dt>Proposed work</dt><dd>{profile.proposedWork||<Unknown/>}</dd></div></dl>
  <div className="bo-profile-observations">
   <dl className="bo-profile-observed"><Property icon="eye" label="Observed facts" value={profile.observedFacts}/></dl>
   <dl className="bo-profile-uncertain"><Property icon="question" label="Unknowns" value={profile.unknowns}/></dl>
  </div>
  <p className="bo-profile-fit-help">Fit describes an opportunity, not a confirmed buyer.</p>
 </div>;
}
export function ProspectSocialLinks({links}){
 return links.map(link=><a key={link.url} href={link.url} target="_blank" rel="noreferrer" className={`bo-profile-social bo-profile-social-${link.network}`} aria-label={link.label}><ProfileIcon name={link.network} size={22}/><span role="tooltip">{link.label}</span></a>);
}
