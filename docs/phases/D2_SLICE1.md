# D2 Slice 1 — Pure GHL blueprint definition and compiler

Base: verified canonical main `36b3431483ce54dfde556b636a63ee49ed7ffd79`.
Performance remains closed. This is only the pure definition/compiler slice,
not completion of D2 or authorization to begin Slice 2.

## Approved boundaries and required corrections

D2 v1 will generate once into an existing, empty, planned Project. It will not
create Projects, append, reconcile, amend or regenerate work. The compiler does
not implement those runtime rules or confer permission to persist its output.

- **Eligibility:** No Project/service eligibility or magic Service Type slug in
  this slice. Later preparation/storage must establish the explicit canonical
  Project/service-to-blueprint relationship from trusted data/configuration,
  preserving relational Systems eligibility. Never infer it from display names.
- **Deletion/provenance:** Before Slice 2, define how immutable provenance survives
  later live-record deletion without cascading away history or accidentally
  imposing an unapproved permanent no-delete rule through provenance FKs.
- **Receipt proof:** For Slice 4, every write must be gated by the winning receipt.
  Resolving `db.batch()` is not success. Success/replay must resolve an authorized
  immutable receipt for the exact request identity and normalized input. A
  zero-row guard is never success. Partial/inconsistent receipt/item state is an
  integrity failure, never a trigger for automatic repair or regeneration.

No schema, database writer, provisioning, API, UI, transaction, provider execution,
authorization implementation or D3–D7 functionality is included here.

## Exact GHL v1 manifest

Blueprint key: `ghl_build`. Definition schema version: **1**. Compiler version: **1**.
The key identifies blueprint data, not a service catalogue slug or eligibility.

| Component key | Milestone | Action key suffix / title | Deliverable |
| --- | --- | --- | --- |
| `discovery` | Discovery | `confirm_scope` / Confirm build scope | — |
| `access` | Access | `verify_access` / Verify delegated GHL access | — |
| `funnel` | Funnel | `build` / Build funnel | GHL funnel |
| `forms` | Forms | `build` / Build forms | Form set |
| `calendar` | Calendar | `configure` / Configure booking calendar | Calendar |
| `pipeline` | Pipeline | `configure` / Configure pipeline | Pipeline |
| `automations` | Automations | `build` / Build automations | Automation |
| `email` | Email/SMS | `build` / Build email sequence | Email sequence |
| `sms` | Email/SMS | `build` / Build SMS sequence | SMS sequence |
| `integrations` | Integrations | `configure` / Configure integration | Integration |
| `qa` | QA | `perform` / Perform internal QA | — |
| `client_review` | Client Review | `coordinate` / Coordinate client review | — |
| `launch` | Launch | `coordinate` / Coordinate approved launch | — |
| `handoff` | Handoff | `prepare` / Prepare handoff | — |

All selected: **13 Milestones, 14 Actions, 8 Deliverables, 20 dependency edges**.
Any single component is a valid minimal selection, including coordination-only
work. No component is auto-selected. Email and SMS share one Milestone while
retaining separate Actions and Deliverables. No files or approval rounds exist
in the plan. A Launch/Review Action is proposed internal work, not approval or
permission to execute an external operation.

## Strict definition schema

All listed fields are required. Unknown fields are rejected at every object level.
Inputs must be plain JSON-shaped objects/arrays with own data properties: no
accessors, sparse arrays, extra array properties, symbols or custom prototypes.
Executable/non-JSON objects are not a supported input interface. Reflection
failures while checking shapes become sanitized domain rejections; this is not
a JavaScript sandbox and unrelated compiler/encoding errors are not swallowed.

```text
{
  schemaVersion: 1,
  compilerVersion: 1,
  blueprintKey: LogicalKey,
  components: [{
    logicalKey: LogicalKey,
    position: Integer,
    milestoneKey: LogicalKey,
    actionKey: LogicalKey,
    deliverableKey: LogicalKey | null
  }],
  milestones: [{ logicalKey: LogicalKey, name: Text, position: Integer }],
  actions: [{ logicalKey: LogicalKey, title: Text }],
  deliverables: [{ logicalKey: LogicalKey, title: Text }],
  dependencyGroups: [[ActionLogicalKey, ...], ...]
}
```

Each component owns exactly one Action and zero/one Deliverable. Milestones may
be shared by components. Every entity must be referenced; all references must
resolve to the correct kind. Component/entity keys must be unique across their
combined namespace. Each Action must appear in exactly one nonempty dependency
group. Duplicate ownership, missing group coverage, repeated membership and
cycles are invalid even when the affected component is unselected.

Labels are trimmed, nonempty, bounded single-line text; they never determine
identity. The format accepts no lifecycle overrides, arbitrary instructions,
workspace/Project/member references, credentials, provider commands or authority.
Text labels are data, not executable instructions or evidence of authorization.

## Normalized input/output contract

`validateSystemsBlueprintDefinition(definition)` returns a detached normalized
definition. Components/Milestones sort by position then logical key. Actions and
Deliverables sort by logical key; group members sort by logical key. Group order
is semantic and is preserved. Caller input is never mutated.

`encodeSystemsBlueprintDefinition(definition)` returns
`{ definition, definitionJson, definitionHash }`, reusing the existing canonical
JSON and SHA-256 helpers without changing onboarding behavior. Reordering object
properties, catalogue rows or members inside parallel groups does not change the
normalized definition/hash. Changed labels do change the snapshot hash.

`compileSystemsBlueprint({ definition, selectedComponentKeys })` accepts exactly
these two fields. Selection is a nonempty unique set of known component keys;
duplicate/unknown keys fail rather than being silently dropped.

It returns:

```text
{
  schemaVersion: 1, compilerVersion: 1, blueprintKey,
  selectedComponentKeys,  // normalized component order
  milestones: [{ logicalKey, name, position, status, visibility }],
  actions: [{ logicalKey, title, milestoneKey, status, visibility, priority }],
  deliverables: [{ logicalKey, title, status, visibility }],
  dependencies: [{ actionKey, dependsOnActionKey }]
}
```

Only selected entities occur. Milestone positions normalize to 10, 20, 30, ...;
Action/Deliverable arrays follow normalized component order. Dependencies sort by
Action key then prerequisite key. Status is fixed to `upcoming` / `to_do` /
`planned`, respectively; visibility is always `internal`, Action priority `normal`.
Dates, assignments, physical IDs, timestamps, request identities and authorization
are absent. This is a pure proposal, not a persisted or authorized build.

Errors are `SystemsBlueprintError` with a sanitized message and stable reason:
`invalid_input`, `invalid_definition`, `unsupported_definition_version`,
`unsupported_compiler_version`, `duplicate_logical_key`, `dangling_reference`,
`cyclic_dependencies`, `invalid_dependency_groups`, `invalid_selection`,
`definition_too_large` or `plan_too_large`. There is no fallback or partial plan.

## Logical identity and dependency algorithm

- Component keys are the manifest keys above.
- Milestones: `ghl_<phase>_milestone`; Email/SMS use `ghl_email_sms_milestone`.
- Actions: `ghl_<component>_<action-key-suffix>` from the table.
- Deliverables: `ghl_<component>_deliverable` where the component has an output.
- Dependencies: ordered `(actionKey, dependsOnActionKey)` pairs.

All keys are explicit stored definition fields after constructing the default;
the compiler never derives identity from a label. Scope/physical identity and
immutable persisted mappings belong to later slices.

Ordered dependency groups are Discovery → Access → the eight build Actions in
parallel → QA → Client Review → Launch → Handoff. After selecting Actions, remove
empty groups. Every Action in a surviving group depends on every Action in the
immediately preceding surviving group. Do not add edges within a group. This
bridges omitted phases without inventing work. Validate the full definition DAG
first; malformed cyclic/repeated groups cannot be hidden by selection.

## Bounds

- 1–14 components/selected components; 1–13 Milestones; 1–14 Actions;
  0–8 Deliverables; 1–14 nonempty dependency groups.
- At most 14 members per input group; valid groups partition the Actions.
- At most 35 generated entities and 49 generated edges. Two groups of seven
  attain 49; this is a compiler bound, not an increase to Work Core limits.
- Logical keys: 1–64 lowercase ASCII letters/digits separated by single
  underscores. Text: at most 120 UTF-16 code units before trimming, no ASCII
  controls or Unicode line separators U+0085, U+2028 or U+2029.
  Positions: integers 0–2,147,483,647.
- Normalized canonical definition and plan: each at most 32,768 UTF-8 bytes.

Future transaction feasibility is a later-slice proof. These pure bounds are not
a claim that a D1 write batch has been implemented or validated.

## Verification

Hand-authored fixtures cover minimal, representative, all-component,
reordered-equivalent and Email/SMS plans, plus malformed, duplicate, dangling and
cyclic definitions. They do not import the compiler or its default manifest.
Additional tests exercise all 16,383 nonempty GHL selections, stable identity,
canonical states, strict input rejection, non-mutation, ordering, DAG/edge bounds,
version failures and sanitized errors. Existing onboarding compiler/template
tests cover the reused canonical encoding helpers. See BUILD_STATE for results.

The independent audit of `c255ed62718d6a4e3a6efea6f4c8197d6d059c00` returned
**PASS WITH NONBLOCKING NOTES**. The follow-up addresses all three low-severity
notes: narrow reflection-failure sanitization, Unicode single-line validation,
and deterministic fixtures exercising both byte-limit rejection paths. The
manifest, logical keys, versions, dependency algorithm and bounds are unchanged.
