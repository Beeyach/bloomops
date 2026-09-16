// Small shared lifecycle signal; no sheet/editor runtime in the app shell.
export const SHEET_DRAFT_PREFIX='bloomsi:sheet-draft:';
export const PROFILE_DRAFT_PREFIX='bloomsi:profile-draft:';
export const CLIENT_DRAFT_PREFIX='bloomsi:client-copy:';
export const CLIENT_EDIT_DRAFT_PREFIX='bloomsi:client-edit:';
export const PAGE_DRAFT_PREFIX='bloomsi:page-copy:';
export const PAGE_LEGACY_LOGOUT_KEY='bloomsi:page-legacy-logout';
export const DRAFT_CONTEXT_KEY='bloomsi:draft-context';
export function changeDraftContext({logout=false}={}){
 try{
  if(logout)for(const key of Object.keys(localStorage))if((key.startsWith(SHEET_DRAFT_PREFIX)||key.startsWith(PROFILE_DRAFT_PREFIX)||key.startsWith(PAGE_DRAFT_PREFIX)||key.startsWith(CLIENT_DRAFT_PREFIX)||key.startsWith(CLIENT_EDIT_DRAFT_PREFIX)))localStorage.removeItem(key);
  if(logout)localStorage.setItem(PAGE_LEGACY_LOGOUT_KEY,crypto.randomUUID());
  localStorage.setItem(DRAFT_CONTEXT_KEY,crypto.randomUUID());
 }catch{try{localStorage.removeItem(DRAFT_CONTEXT_KEY);}catch{}}
 if(logout)try{for(const key of Object.keys(sessionStorage))if(key.startsWith('bloomsi:page-draft:'))sessionStorage.removeItem(key);}catch{}
 // Broadcast also reaches tabs when browser storage rejects the epoch write.
 try{const channel=new BroadcastChannel(DRAFT_CONTEXT_KEY);channel.postMessage({logout});channel.close();}catch{}
 window.dispatchEvent(new CustomEvent(DRAFT_CONTEXT_KEY,{detail:{logout}}));
}
