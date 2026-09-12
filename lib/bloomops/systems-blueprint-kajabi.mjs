// Definition data only. Access and launch actions never execute provider changes.
const rows = [
  ['access_assets', 'access_assets', 'Access / Assets', 'verify', 'Verify delegated Kajabi access and assets', null],
  ['architecture', 'architecture', 'Architecture', 'confirm', 'Confirm course and offer architecture', null],
  ['course', 'course', 'Course Build', 'build', 'Build course', 'Kajabi course'],
  ['funnel', 'funnel_checkout', 'Funnel / Checkout', 'build', 'Build funnel', 'Kajabi funnel'],
  ['checkout', 'funnel_checkout', 'Funnel / Checkout', 'configure', 'Configure offer and checkout', 'Offer and checkout'],
  ['email', 'email', 'Email / Nurture', 'build', 'Build nurture sequence', 'Nurture sequence'],
  ['qa', 'qa', 'QA', 'perform', 'Perform internal QA', null],
  ['client_review', 'client_review', 'Client Review', 'coordinate', 'Coordinate client review', null],
  ['launch', 'launch', 'Launch', 'coordinate', 'Coordinate approved launch', null],
  ['handoff', 'handoff', 'Handoff', 'prepare', 'Prepare handoff', null],
];
const components = [], milestones = [], actions = [], deliverables = [];
for (const [index, [key, phase, name, work, title, output]] of rows.entries()) {
  const milestoneKey = `kajabi_${phase}_milestone`, actionKey = `kajabi_${key}_${work}`;
  const deliverableKey = output === null ? null : `kajabi_${key}_deliverable`;
  components.push({ logicalKey: key, position: (index + 1) * 10, milestoneKey, actionKey, deliverableKey });
  if (!milestones.some(row => row.logicalKey === milestoneKey)) milestones.push({ logicalKey: milestoneKey, name, position: (milestones.length + 1) * 10 });
  actions.push({ logicalKey: actionKey, title });
  if (output !== null) deliverables.push({ logicalKey: deliverableKey, title: output });
}
function freeze(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
export const KAJABI_BUILD_BLUEPRINT_V1 = freeze({
  schemaVersion: 1, compilerVersion: 1, blueprintKey: 'kajabi_build',
  components, milestones, actions, deliverables,
  dependencyGroups: [
    ['kajabi_access_assets_verify'], ['kajabi_architecture_confirm'],
    ['kajabi_course_build', 'kajabi_funnel_build', 'kajabi_checkout_configure', 'kajabi_email_build'],
    ['kajabi_qa_perform'], ['kajabi_client_review_coordinate'], ['kajabi_launch_coordinate'], ['kajabi_handoff_prepare'],
  ],
});
