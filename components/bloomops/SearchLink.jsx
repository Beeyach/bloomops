import {Icon} from './Icons';
export default function SearchLink({portal=false,compact=false}) {
  return <a href={portal?'/portal/search':'/search'} className={'bo-search-entry'+(compact?' bo-search-entry-compact':'')} aria-label="Search workspace"><Icon name="search" size={20}/>{!compact&&<span>Search</span>}</a>;
}
