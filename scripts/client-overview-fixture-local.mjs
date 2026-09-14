// Emits relational synthetic fixture SQL for an isolated development database.
// Does not connect to a Worker, send mail or read an existing database.
import { writeFileSync } from 'node:fs';
import { setup } from '../tests/_work-projections.mjs';
import { run, all } from '../tests/_bloomops-db.mjs';
const output = process.argv[2];
if (!output) throw new Error('Specify the local fixture SQL output path');
const t = await setup();
const day = offset => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
run(t.raw, "UPDATE workspaces SET name='Bloomsi local QA' WHERE id='a'");
run(t.raw, "UPDATE bloomops_clients SET name='Garden House Studio',timezone='America/Los_Angeles' WHERE id='james'");
run(t.raw, "UPDATE service_types SET name='Social Media' WHERE id='type-social'");
run(t.raw, "UPDATE service_types SET name='Systems & Automation' WHERE id='type-systems'");
run(t.raw, "UPDATE service_engagements SET status='active',package_name='Monthly content' WHERE id='social-service'");
run(t.raw, "UPDATE service_engagements SET status='onboarding',package_name='Website and CRM setup' WHERE id='ghl-service'");
run(t.raw, "UPDATE projects SET name='Autumn website launch',status='in_progress' WHERE id='website'");
t.project('social-plan', { name: 'September content calendar', service_engagement_id: 'social-service', status: 'review', target_date: day(7) });
t.action('copy', { title: 'Review the homepage copy', due_date: day(-2), status: 'review' });
t.action('brand', { title: 'Prepare the brand asset library', status: 'in_progress' });
t.action('automation', { title: 'Connect the welcome sequence', status: 'waiting', waiting_type: 'client', waiting_reason: 'Awaiting approved copy' });
t.milestone('launch', { name: 'Website ready for client review', target_date: day(1), visibility: 'client' });
t.deliverable('guide', { title: 'Website handoff guide', target_date: day(3), visibility: 'client' });
t.project('restricted', { name: 'PRIVATE restricted project', visibility: 'restricted', target_date: day(1) });
t.project('other-client-project', { name: 'Other client project', client_id: 'lawrence', status: 'cancelled' });
t.assign('client');
run(t.raw, "UPDATE client_contacts SET email='james@example.com' WHERE id='c-james'");
run(t.raw, "INSERT INTO onboarding_instances(id,workspace_id,client_id) VALUES('n2-onboarding','a','james')");
for (const [id,title,party,verify,required,status] of [['agreement','Signed agreement','client',1,1,'pending'],['assets','Brand assets','client',0,1,'pending'],['access','CRM access','team',0,1,'completed'],['references','Design references','client',0,0,'pending']]) {
 run(t.raw, "INSERT INTO onboarding_items(id,workspace_id,onboarding_instance_id,logical_key,title,responsible_party,verification_required,required,status,visibility,completed_at) VALUES(?,'a','n2-onboarding',?,?,?,?,?,?,'client',?)", id,id,title,party,verify,required,status,status==='completed'?new Date().toISOString():null);
}
run(t.raw, "INSERT INTO onboarding_item_submissions(workspace_id,onboarding_item_id,submitted_by_membership_id,submitted_at) VALUES('a','agreement','m-james',?)", new Date().toISOString());
const tables = ['workspaces','user','workspace_memberships','bloomops_clients','client_contacts','departments','service_types','service_engagements','projects','client_assignments','actions','milestones','deliverables','onboarding_instances','onboarding_items','onboarding_item_submissions'];
const lit = x => x == null ? 'NULL' : typeof x === 'number' ? String(x) : "'" + String(x).replaceAll("'", "''") + "'";
writeFileSync(output, tables.flatMap(table => all(t.raw, `SELECT * FROM ${table}`).map(row => `INSERT INTO ${table}(${Object.keys(row).map(x => '"'+x+'"').join(',')}) VALUES(${Object.values(row).map(lit).join(',')});`)).join('\n'));
console.log('Synthetic client overview fixture prepared.');
