// The editor's original values, never a server permission or a mutable revision.
export const CLIENT_EDIT_FIELDS = ['name','company','website','timezone','startDate','endDate','health','ownerMembershipId'];
export const CLIENT_DETAIL_FIELDS = ['name','website','timezone','startDate','endDate','ownerMembershipId'];
export function clientEditSnapshot(client) {
 return Object.fromEntries(CLIENT_EDIT_FIELDS.map(k=>[k,k==='ownerMembershipId'?(client.ownerMembershipId??client.owner?.membershipId??null):(client[k]??null)]));
}
export const validClientSnapshot = value => !!value && typeof value==='object' && !Array.isArray(value)
 && Object.keys(value).length===CLIENT_EDIT_FIELDS.length
 && CLIENT_EDIT_FIELDS.every(k=>Object.hasOwn(value,k)&&(value[k]===null||typeof value[k]==='string'&&value[k].length<=4096));
export const sameClientSnapshot = (a,b) => CLIENT_EDIT_FIELDS.every(k=>a[k]===b[k]);
export const clientDetailInput = snapshot => Object.fromEntries(CLIENT_DETAIL_FIELDS.map(k=>[k,snapshot[k]??'']));
