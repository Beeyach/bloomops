export const SEARCH_TYPES = {
  prospects: {label:'Prospects',icon:'prospecting',tone:'lilac'},
  clients: {label:'Clients',icon:'clients',tone:'mint'},
  tasks: {label:'Tasks',icon:'work',tone:'peach'},
  pages: {label:'Pages',icon:'pages',tone:'lilac'},
  files: {label:'Files',icon:'download',tone:'mint'},
};
export const searchTypes = portal => portal ? ['pages','files'] : Object.keys(SEARCH_TYPES);
export function searchInput(input) {
  if (!input || typeof input!=='object' || Array.isArray(input) || Object.keys(input).some(k=>!['userId','workspaceId','q','type','page'].includes(k))) return null;
  const q=typeof input.q==='string'?input.q.trim():'';
  const type=input.type??'all',page=input.page??1;
  if(q.length<2||q.length>120||/[\u0000-\u001f\u007f]/.test(q)||type!=='all'&&!Object.hasOwn(SEARCH_TYPES,type)||!Number.isSafeInteger(page)||page<1||page>100||type==='all'&&page!==1)return null;
  return {q,type,page};
}
