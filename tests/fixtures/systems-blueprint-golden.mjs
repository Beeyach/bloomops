// Hand-authored expectations; deliberately no imports from the implementation.
const header = { schemaVersion: 1, compilerVersion: 1, blueprintKey: 'ghl_build' };
const milestone = (logicalKey, name, position) => ({ logicalKey, name, position, status: 'upcoming', visibility: 'internal' });
const action = (logicalKey, title, milestoneKey) => ({ logicalKey, title, milestoneKey, status: 'to_do', visibility: 'internal', priority: 'normal' });
const deliverable = (logicalKey, title) => ({ logicalKey, title, status: 'planned', visibility: 'internal' });
const edge = (actionKey, dependsOnActionKey) => ({ actionKey, dependsOnActionKey });
const all = {
  ...header,
  selectedComponentKeys: ['discovery', 'access', 'funnel', 'forms', 'calendar', 'pipeline', 'automations', 'email', 'sms', 'integrations', 'qa', 'client_review', 'launch', 'handoff'],
  milestones: [
    milestone('ghl_discovery_milestone', 'Discovery', 10), milestone('ghl_access_milestone', 'Access', 20),
    milestone('ghl_funnel_milestone', 'Funnel', 30), milestone('ghl_forms_milestone', 'Forms', 40),
    milestone('ghl_calendar_milestone', 'Calendar', 50), milestone('ghl_pipeline_milestone', 'Pipeline', 60),
    milestone('ghl_automations_milestone', 'Automations', 70), milestone('ghl_email_sms_milestone', 'Email/SMS', 80),
    milestone('ghl_integrations_milestone', 'Integrations', 90), milestone('ghl_qa_milestone', 'QA', 100),
    milestone('ghl_client_review_milestone', 'Client Review', 110), milestone('ghl_launch_milestone', 'Launch', 120),
    milestone('ghl_handoff_milestone', 'Handoff', 130),
  ],
  actions: [
    action('ghl_discovery_confirm_scope', 'Confirm build scope', 'ghl_discovery_milestone'),
    action('ghl_access_verify_access', 'Verify delegated GHL access', 'ghl_access_milestone'),
    action('ghl_funnel_build', 'Build funnel', 'ghl_funnel_milestone'),
    action('ghl_forms_build', 'Build forms', 'ghl_forms_milestone'),
    action('ghl_calendar_configure', 'Configure booking calendar', 'ghl_calendar_milestone'),
    action('ghl_pipeline_configure', 'Configure pipeline', 'ghl_pipeline_milestone'),
    action('ghl_automations_build', 'Build automations', 'ghl_automations_milestone'),
    action('ghl_email_build', 'Build email sequence', 'ghl_email_sms_milestone'),
    action('ghl_sms_build', 'Build SMS sequence', 'ghl_email_sms_milestone'),
    action('ghl_integrations_configure', 'Configure integration', 'ghl_integrations_milestone'),
    action('ghl_qa_perform', 'Perform internal QA', 'ghl_qa_milestone'),
    action('ghl_client_review_coordinate', 'Coordinate client review', 'ghl_client_review_milestone'),
    action('ghl_launch_coordinate', 'Coordinate approved launch', 'ghl_launch_milestone'),
    action('ghl_handoff_prepare', 'Prepare handoff', 'ghl_handoff_milestone'),
  ],
  deliverables: [
    deliverable('ghl_funnel_deliverable', 'GHL funnel'), deliverable('ghl_forms_deliverable', 'Form set'),
    deliverable('ghl_calendar_deliverable', 'Calendar'), deliverable('ghl_pipeline_deliverable', 'Pipeline'),
    deliverable('ghl_automations_deliverable', 'Automation'), deliverable('ghl_email_deliverable', 'Email sequence'),
    deliverable('ghl_sms_deliverable', 'SMS sequence'), deliverable('ghl_integrations_deliverable', 'Integration'),
  ],
  dependencies: [
    edge('ghl_access_verify_access', 'ghl_discovery_confirm_scope'),
    edge('ghl_automations_build', 'ghl_access_verify_access'),
    edge('ghl_calendar_configure', 'ghl_access_verify_access'),
    edge('ghl_client_review_coordinate', 'ghl_qa_perform'),
    edge('ghl_email_build', 'ghl_access_verify_access'),
    edge('ghl_forms_build', 'ghl_access_verify_access'), edge('ghl_funnel_build', 'ghl_access_verify_access'),
    edge('ghl_handoff_prepare', 'ghl_launch_coordinate'), edge('ghl_integrations_configure', 'ghl_access_verify_access'),
    edge('ghl_launch_coordinate', 'ghl_client_review_coordinate'), edge('ghl_pipeline_configure', 'ghl_access_verify_access'),
    edge('ghl_qa_perform', 'ghl_automations_build'), edge('ghl_qa_perform', 'ghl_calendar_configure'),
    edge('ghl_qa_perform', 'ghl_email_build'), edge('ghl_qa_perform', 'ghl_forms_build'),
    edge('ghl_qa_perform', 'ghl_funnel_build'), edge('ghl_qa_perform', 'ghl_integrations_configure'),
    edge('ghl_qa_perform', 'ghl_pipeline_configure'), edge('ghl_qa_perform', 'ghl_sms_build'),
    edge('ghl_sms_build', 'ghl_access_verify_access'),
  ],
};
const representative = {
  ...header, selectedComponentKeys: ['access', 'funnel', 'forms', 'qa', 'client_review', 'handoff'],
  milestones: [milestone('ghl_access_milestone', 'Access', 10), milestone('ghl_funnel_milestone', 'Funnel', 20),
    milestone('ghl_forms_milestone', 'Forms', 30), milestone('ghl_qa_milestone', 'QA', 40),
    milestone('ghl_client_review_milestone', 'Client Review', 50), milestone('ghl_handoff_milestone', 'Handoff', 60)],
  actions: [all.actions[1], all.actions[2], all.actions[3], all.actions[10], all.actions[11], all.actions[13]],
  deliverables: [all.deliverables[0], all.deliverables[1]],
  dependencies: [edge('ghl_client_review_coordinate', 'ghl_qa_perform'), edge('ghl_forms_build', 'ghl_access_verify_access'),
    edge('ghl_funnel_build', 'ghl_access_verify_access'), edge('ghl_handoff_prepare', 'ghl_client_review_coordinate'),
    edge('ghl_qa_perform', 'ghl_forms_build'), edge('ghl_qa_perform', 'ghl_funnel_build')],
};
export const GOLDEN_PLANS = [
  { name: 'minimal', selection: ['funnel'], plan: { ...header, selectedComponentKeys: ['funnel'],
    milestones: [milestone('ghl_funnel_milestone', 'Funnel', 10)], actions: [all.actions[2]],
    deliverables: [all.deliverables[0]], dependencies: [] } },
  { name: 'representative', selection: representative.selectedComponentKeys, plan: representative },
  { name: 'all', selection: all.selectedComponentKeys, plan: all },
  { name: 'reordered', selection: ['handoff', 'forms', 'qa', 'access', 'client_review', 'funnel'], plan: representative },
  { name: 'email_sms', selection: ['sms', 'email'], plan: { ...header, selectedComponentKeys: ['email', 'sms'],
    milestones: [milestone('ghl_email_sms_milestone', 'Email/SMS', 10)], actions: [all.actions[7], all.actions[8]],
    deliverables: [all.deliverables[5], all.deliverables[6]], dependencies: [] } },
];

const minimalDefinition = {
  ...header,
  components: [{ logicalKey: 'funnel', position: 10, milestoneKey: 'ghl_funnel_milestone', actionKey: 'ghl_funnel_build', deliverableKey: 'ghl_funnel_deliverable' }],
  milestones: [{ logicalKey: 'ghl_funnel_milestone', name: 'Funnel', position: 10 }],
  actions: [{ logicalKey: 'ghl_funnel_build', title: 'Build funnel' }],
  deliverables: [{ logicalKey: 'ghl_funnel_deliverable', title: 'GHL funnel' }],
  dependencyGroups: [['ghl_funnel_build']],
};
export const INVALID_DEFINITIONS = [
  { name: 'malformed', reason: 'invalid_definition', definition: { ...minimalDefinition, credentials: 'forbidden' } },
  { name: 'duplicate', reason: 'duplicate_logical_key', definition: { ...minimalDefinition, actions: [...minimalDefinition.actions, { logicalKey: 'ghl_funnel_build', title: 'Another visible label' }] } },
  { name: 'dangling', reason: 'dangling_reference', definition: { ...minimalDefinition, dependencyGroups: [['missing_action']] } },
  { name: 'cyclic', reason: 'cyclic_dependencies', definition: { ...minimalDefinition, dependencyGroups: [['ghl_funnel_build'], ['ghl_funnel_build']] } },
];
