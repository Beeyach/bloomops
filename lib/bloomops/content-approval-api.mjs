import { requireAuthorized } from './access.mjs';
import { workQueryAccess } from './work-api-input.mjs';
import { loadApprovalResource } from './content-approval-access.mjs';
export const approvalAccess=(req,roundId,{portal=false,respond=false}={})=>workQueryAccess(req,requireAuthorized(req,{
  action:portal?respond?'approval.respond':'approval.view':'content.approval.withdraw',
  resource:access=>loadApprovalResource(access.db,access.actor,roundId,{portal,retry:respond}),
}));
