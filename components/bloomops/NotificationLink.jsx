import {Icon} from './Icons';
export default function NotificationLink({portal=false,compact=false}){return <a href={portal?'/portal/notifications':'/notifications'} className={'bo-search-entry'+(compact?' bo-search-entry-compact':'')} aria-label="Notifications"><Icon name="bell" size={20}/>{!compact&&<span>Notifications</span>}</a>;}
