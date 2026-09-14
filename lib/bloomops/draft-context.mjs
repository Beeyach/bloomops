// Small shared lifecycle signal; no sheet/editor runtime in the app shell.
export const SHEET_DRAFT_PREFIX='bloomsi:sheet-draft:';
export const PROFILE_DRAFT_PREFIX='bloomsi:profile-draft:';
export const DRAFT_CONTEXT_KEY='bloomsi:draft-context';
export function changeDraftContext({logout=false}={}){
 try{
  if(logout)for(const key of Object.keys(localStorage))if((key.startsWith(SHEET_DRAFT_PREFIX)||key.startsWith(PROFILE_DRAFT_PREFIX)))localStorage.removeItem(key);
  localStorage.setItem(DRAFT_CONTEXT_KEY,crypto.randomUUID());
 }catch{try{localStorage.removeItem(DRAFT_CONTEXT_KEY);}catch{}}
 // Broadcast also reaches tabs when browser storage rejects the epoch write.
 try{const channel=new BroadcastChannel(DRAFT_CONTEXT_KEY);channel.postMessage(null);channel.close();}catch{}
 window.dispatchEvent(new Event(DRAFT_CONTEXT_KEY));
}
