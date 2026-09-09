export const APPROVAL_STATUS_LABELS = {requested:'Requested',approved:'Approved',changes_requested:'Changes requested',withdrawn:'Withdrawn'};
export const REVIEW_FIELDS = ['title','type','hook','script','caption','cta','targetPublishDate'];
export const REVIEW_FROZEN_FIELDS = [...REVIEW_FIELDS,'recordingRequired','internalReviewRequired','clientApprovalRequired'];
export const APPROVAL_HISTORY_SIZE = 20;
const invalid = () => ({ok:false,reason:'invalid',errors:{form:'Use the approval form. Feedback and reasons must be plain text, at most 2,000 characters.'}});
export function normalizeApproval(input, operation) {
  const fields = {request:['requestId','expectedRevision'],withdraw:['expectedRevision','reason'],respond:['decision','feedback']}[operation];
  if (!fields || !input || typeof input!=='object' || Array.isArray(input) || Object.keys(input).some(k=>!fields.includes(k))) return invalid();
  if (operation!=='respond' && (!Number.isSafeInteger(input.expectedRevision)||input.expectedRevision<1)) return invalid();
  if (operation==='request' && (typeof input.requestId!=='string'||!(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/).test(input.requestId))) return invalid();
  if (operation==='respond' && !['approved','changes_requested'].includes(input.decision)) return invalid();
  const key=operation==='withdraw'?'reason':'feedback';
  if (input[key]!=null && typeof input[key]!=='string') return invalid();
  const text=input[key]?.normalize('NFC').replace(/\r\n?/g,'\n').trim()||null;
  if (text && (text.length>2000 || !text.isWellFormed() || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069]/.test(text))) return invalid();
  if (operation==='respond' && (input.decision==='changes_requested' ? !text : text!==null)) return invalid();
  return {ok:true,...input,...operation==='request'?{}:{[key]:text}};
}
