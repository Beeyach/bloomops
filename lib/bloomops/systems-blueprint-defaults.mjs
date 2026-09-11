// Definition data only: not provisioning, service matching or GHL execution.
const rows = [
  ['discovery', 'discovery', 'Discovery', 'confirm_scope', 'Confirm build scope', null],
  ['access', 'access', 'Access', 'verify_access', 'Verify delegated GHL access', null],
  ['funnel', 'funnel', 'Funnel', 'build', 'Build funnel', 'GHL funnel'],
  ['forms', 'forms', 'Forms', 'build', 'Build forms', 'Form set'],
  ['calendar', 'calendar', 'Calendar', 'configure', 'Configure booking calendar', 'Calendar'],
  ['pipeline', 'pipeline', 'Pipeline', 'configure', 'Configure pipeline', 'Pipeline'],
  ['automations', 'automations', 'Automations', 'build', 'Build automations', 'Automation'],
  ['email', 'email_sms', 'Email/SMS', 'build', 'Build email sequence', 'Email sequence'],
  ['sms', 'email_sms', 'Email/SMS', 'build', 'Build SMS sequence', 'SMS sequence'],
  ['integrations', 'integrations', 'Integrations', 'configure', 'Configure integration', 'Integration'],
  ['qa', 'qa', 'QA', 'perform', 'Perform internal QA', null],
  ['client_review', 'client_review', 'Client Review', 'coordinate', 'Coordinate client review', null],
  ['launch', 'launch', 'Launch', 'coordinate', 'Coordinate approved launch', null],
  ['handoff', 'handoff', 'Handoff', 'prepare', 'Prepare handoff', null],
];
const components = [], milestones = [], actions = [], deliverables = [];
for (const [index, [key, phase, name, work, title, output]] of rows.entries()) {
  const milestoneKey = `ghl_${phase}_milestone`, actionKey = `ghl_${key}_${work}`;
  const deliverableKey = output === null ? null : `ghl_${key}_deliverable`;
  components.push({ logicalKey: key, position: (index + 1) * 10, milestoneKey, actionKey, deliverableKey });
  if (!milestones.some(row => row.logicalKey === milestoneKey)) milestones.push({ logicalKey: milestoneKey, name, position: (milestones.length + 1) * 10 });
  actions.push({ logicalKey: actionKey, title });
  if (output !== null) deliverables.push({ logicalKey: deliverableKey, title: output });
}
function freeze(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
export const GHL_BUILD_BLUEPRINT_V1 = freeze({
  schemaVersion: 1, compilerVersion: 1, blueprintKey: 'ghl_build',
  components, milestones, actions, deliverables,
  dependencyGroups: [
    ['ghl_discovery_confirm_scope'], ['ghl_access_verify_access'],
    ['ghl_funnel_build', 'ghl_forms_build', 'ghl_calendar_configure', 'ghl_pipeline_configure',
      'ghl_automations_build', 'ghl_email_build', 'ghl_sms_build', 'ghl_integrations_configure'],
    ['ghl_qa_perform'], ['ghl_client_review_coordinate'], ['ghl_launch_coordinate'], ['ghl_handoff_prepare'],
  ],
});
