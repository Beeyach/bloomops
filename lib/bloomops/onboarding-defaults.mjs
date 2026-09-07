// One source for both new and existing workspace bootstrap. Hash constants
// permit the existing synchronous SQL plan; tests independently recompute them.
import { canonicalJson, validateOnboardingDefinition } from './onboarding-definition.mjs';

const item = (logicalKey, title, instructions, position, verificationRequired = false, required = true) => ({
  logicalKey, title, instructions, required, verificationRequired, responsibleParty: 'client', visibility: 'client', position,
});
const meta = (position) => item('meta_business_access', 'Meta Business access', 'Grant the agency the required Meta Business access for this service. Do not send a password.', position, true);
const defaults = [
  { slug: 'common', name: 'Common', definitionHash: 'b9648ae0f508ab5005a629e2d2ce139f5426e2a538d39fc7d4854cf353be95bf', items: [
    item('agreement', 'Agreement', 'Review and complete the agreement provided by the agency.', 10),
    item('brand_assets', 'Brand assets', 'Share the current logo files, brand colors, fonts, and other brand assets the team should use.', 20),
    item('kickoff_booking', 'Kickoff booking', "Book the kickoff call using the agency's scheduling link.", 30),
  ] },
  { slug: 'social', name: 'Social', definitionHash: 'ae144823f42aba38b1d461b04cba88881135c06b6194b0f892d1ffed6befcab8', items: [
    item('instagram_access', 'Instagram access', 'Grant the agency approved business or delegated access to the Instagram account. Do not send a password.', 10, true),
    meta(20),
  ] },
  { slug: 'ads', name: 'Ads', definitionHash: '7640d1037bde0f10e258d2fe1bcb700b102e60af839fa8456860aed294d655f2', items: [meta(10)] },
  { slug: 'ghl', name: 'GHL', definitionHash: 'b068ae5b53fe6ad9107f5cf621f0f254a84d245e1f54a9e7d169cedbb2c6716e', items: [
    item('ghl_access', 'GoHighLevel access', 'Invite the agency to the correct GoHighLevel account or location using delegated user access. Do not send a password.', 10, true),
  ] },
  { slug: 'kajabi', name: 'Kajabi', definitionHash: '234563d1ac87206141cd00640a2ee2a587a40e57a2bdc7b69bb88e39c4eaa0fb', items: [
    item('kajabi_access', 'Kajabi access', 'Invite the agency to the Kajabi site with the access needed for the purchased work. Do not send a password.', 10, true),
    item('course_videos', 'Course videos', 'Upload or share the course videos and assets needed for the build, if this service includes course creation.', 20, false, false),
  ] },
];
export const DEFAULT_ONBOARDING_TEMPLATES = Object.freeze(defaults.map(({ items, ...t }) => Object.freeze({
  ...t, kind: 'onboarding', definitionJson: canonicalJson(validateOnboardingDefinition({ schemaVersion: 1, category: t.slug, items })),
})));

const literal = (value) => `'${String(value).replace(/'/g, "''")}'`;
export function onboardingDefaultStatements({ workspaceSlug, now = new Date() }) {
  const ws = literal(workspaceSlug);
  const iso = literal(now.toISOString());
  return DEFAULT_ONBOARDING_TEMPLATES.flatMap((t) => {
    const slug = literal(t.slug);
    return [
      `INSERT INTO templates (workspace_id, kind, name, slug, created_at, updated_at) ` +
      `SELECT w.id, 'onboarding', ${literal(t.name)}, ${slug}, ${iso}, ${iso} FROM workspaces w WHERE w.slug = ${ws} ` +
      `ON CONFLICT (workspace_id, kind, slug) DO NOTHING;`,
      // Never update V1, metadata, or the selected publication. If a newer
      // version is already current, a missing V1 is historical (retired).
      `INSERT INTO template_versions (workspace_id, template_id, version_number, status, definition_json, definition_hash, published_at, created_at, updated_at) ` +
      `SELECT t.workspace_id, t.id, 1, CASE WHEN EXISTS (SELECT 1 FROM template_versions v WHERE v.template_id = t.id AND v.status = 'published') THEN 'retired' ELSE 'published' END, ` +
      `${literal(t.definitionJson)}, ${literal(t.definitionHash)}, CASE WHEN EXISTS (SELECT 1 FROM template_versions v WHERE v.template_id = t.id AND v.status = 'published') THEN NULL ELSE ${iso} END, ${iso}, ${iso} ` +
      `FROM templates t JOIN workspaces w ON w.id = t.workspace_id WHERE w.slug = ${ws} AND t.kind = 'onboarding' AND t.slug = ${slug} ` +
      `ON CONFLICT (template_id, version_number) DO NOTHING;`,
    ];
  });
}
