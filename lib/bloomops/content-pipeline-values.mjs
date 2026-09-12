export const ADS_STAGES = ['idea', 'script', 'editing', 'internal_review', 'revision_requested'];
// Shared presentation/resolution rules. The server independently resolves these
// against current Content facts and fences the write with the same facts.
import { CONTENT_STAGES } from './content-values.mjs';
export const CONTENT_CONTEXT_LIMIT = 2000;
const forward = ['idea','script','waiting_for_recording','editing','internal_review','client_review','approved','scheduled','published'];
const gates = { waiting_for_recording:'recordingRequired', internal_review:'internalReviewRequired', client_review:'clientApprovalRequired' };
export const contentNeedsContext = stage => ['waiting_for_recording','revision_requested'].includes(stage);
export function contentNextStages(item) {
  if (item.approvalRequested) return [];
  if (item.productionArea === 'ads') {
    if (item.recordingRequired || !item.internalReviewRequired || !item.clientApprovalRequired || item.publishedAt) return [];
    return {idea:['script'],script:['editing'],editing:['internal_review'],internal_review:['revision_requested'],revision_requested:['editing']}[item.stage] || [];
  }
  if (item.stage === 'revision_requested') return ['editing'];
  const index = forward.indexOf(item.stage);
  if (index < 0 || item.stage === 'published') return [];
  const next = forward.slice(index+1).find(stage => !gates[stage] || item[gates[stage]]);
  return [...(next && !(item.stage==='client_review' && item.clientApprovalRequired && next==='approved') ? [next] : []), ...(['internal_review','client_review'].includes(item.stage) ? ['revision_requested'] : [])];
}
export function normalizeContentTransition(input) {
  const invalid = errors => ({ok:false,reason:'invalid',errors});
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(k => !['targetStage','context','expectedRevision'].includes(k))) return invalid({form:'Use only the fields in this transition.'});
  if (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 1) return invalid({form:'Reload this Content before continuing.'});
  if (!CONTENT_STAGES.includes(input.targetStage)) return invalid({form:'Choose an available next stage.'});
  if (input.context != null && typeof input.context !== 'string') return invalid({context:'Enter text.'});
  const context = input.context?.normalize('NFC').replace(/\r\n?/g,'\n').trim() || null;
  if (contentNeedsContext(input.targetStage)) {
    if (!context || context.length > CONTENT_CONTEXT_LIMIT || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069]/.test(context) || !context.isWellFormed()) return invalid({context:`Enter the ${input.targetStage === 'revision_requested' ? 'revision needed' : 'recording needed and who should provide it'} in ${CONTENT_CONTEXT_LIMIT} characters or fewer, without control characters.`});
  } else if (context) return invalid({context:'This stage does not use context.'});
  return {ok:true,targetStage:input.targetStage,context,expectedRevision:input.expectedRevision};
}
