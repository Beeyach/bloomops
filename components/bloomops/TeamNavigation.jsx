import {Button} from './Primitives';
export default function TeamNavigation({active='people',finance=false}){
 return <nav className="bo-view-nav bo-team-navigation" aria-label="Team views">{[['people','/team','People'],['workload','/team/workload','Workload'],['departments','/team/departments','Department work']].map(([key,href,label])=><Button key={key} href={href} aria-current={key===active?'page':undefined}>{label}</Button>)}{finance&&<Button href="/team/finance-access" size="sm" icon="settings">Finance access</Button>}</nav>;
}
