# D2 Slice 1 — Audit Follow-up and PR

## Starting point

Canonical base:

`36b3431483ce54dfde556b636a63ee49ed7ffd79`

Local candidate branch:

`feat/d2-ghl-blueprint-compiler`

Audited candidate commit:

`c255ed62718d6a4e3a6efea6f4c8197d6d059c00`

Independent audit verdict: **PASS WITH NONBLOCKING NOTES**. Slice 1 is review-ready and no blocking defect was found.

Performance remains closed. **Do not begin Slice 2.**

## Goal

Apply only the three low-severity audit cleanups below, re-verify Slice 1, then push the Slice 1 branch and open a PR against `main`.

Do not broaden scope or redesign the compiler.

## Required cleanup 1 — sanitize exotic reflection failures

Audit finding:

`lib/bloomops/systems-blueprint-definition.mjs` can leak a raw exception if an exotic object such as a Proxy throws from `getPrototypeOf` during validation.

Ordinary JSON-parsed inputs are unaffected, but the documented invalid-input boundary should remain sanitized.

Make the smallest correction that preserves the intended **plain JSON data** input contract while ensuring reflection/shape-validation failures caused by malformed/exotic inputs become the existing sanitized `SystemsBlueprintError` domain failure rather than leaking the original exception/message.

Requirements:

- Do not add support for executable/non-JSON objects.
- Do not broadly swallow unrelated compiler/programming errors.
- Keep the validator pure.
- Add a regression test using a throwing Proxy or equivalent adversarial object.
- Assert the raw thrown message is not exposed.

## Required cleanup 2 — make “single-line” title validation true

Audit finding:

Titles already reject ASCII newline/control characters but still accept Unicode line separators `U+0085`, `U+2028`, and `U+2029`, while the Slice 1 contract describes labels/titles as single-line.

Choose the strict interpretation and reject these Unicode line separators.

Requirements:

- Preserve the existing title length ceiling.
- Reject `U+0085`, `U+2028`, and `U+2029` in titles.
- Add focused regression coverage for all three.
- Keep docs and implementation wording aligned.

## Required cleanup 3 — committed byte-limit rejection coverage

Audit independently confirmed both existing byte guards work, but committed tests do not exercise rejection above the limits.

Add regression tests that prove:

- normalized definition size above the configured ceiling returns the sanitized `definition_too_large` failure;
- normalized compiled plan size above the configured ceiling returns the sanitized `plan_too_large` failure.

Use deterministic synthetic fixtures. Do not weaken or raise the existing bounds merely to simplify the tests.

## Preserve all approved Slice 1 boundaries

Do not change:

- approved GHL v1 manifest/components;
- logical keys unless a cleanup above strictly requires it (it should not);
- dependency grouping/algorithm;
- all-selected expected result: 13 Milestones, 14 Actions, 8 Deliverables, 20 edges;
- 49-edge generic safety ceiling;
- version numbers;
- selection semantics;
- canonical initial statuses/visibility;
- no `serviceType.slug === "ghl"` eligibility rule;
- no Project/Service eligibility logic;
- no authorization logic;
- no database/schema/migration work;
- no API or UI;
- no generation transaction;
- no provider execution;
- no provenance/deletion decision (Slice 2 gate);
- no committed-receipt implementation (Slice 4 gate);
- no D3–D7 work.

## Verification

After the cleanup:

1. Run the focused Slice 1 definition/compiler tests.
2. Re-run the exhaustive 16,383 non-empty selection coverage.
3. Run the full test suite.
4. Run the normal Next/build validation used by the candidate.
5. Run changed-file syntax checks and `git diff --check`.
6. Confirm the working tree contains no unrelated changes.

If any cleanup reveals a deeper design or correctness issue, **stop and report it** instead of expanding scope silently.

## Commit and PR

If verification passes:

1. Commit the three audit cleanups as a separate commit on `feat/d2-ghl-blueprint-compiler`.
2. Push `feat/d2-ghl-blueprint-compiler`.
3. Open a PR against canonical `main`.
4. Verify the PR is conflict-free and contains only D2 Slice 1 plus these audit cleanups.
5. Do **not** merge it.
6. Do **not** start Slice 2.

PR body should state:

- D2 Slice 1 only: pure versioned GHL blueprint definition/default manifest/compiler;
- no schema, database writes, API, UI, eligibility or provider execution;
- independent audit verdict was PASS WITH NONBLOCKING NOTES;
- the three low-severity notes were corrected before PR;
- independently verified all-selected graph: 13 Milestones / 14 Actions / 8 Deliverables / 20 edges;
- 49 edges is the generic compiler safety ceiling, not the default manifest edge count;
- provenance/deletion semantics remain a Slice 2 gate;
- exact committed-receipt proof remains a Slice 4 gate;
- performance remains closed.

## Return

Report:

1. exact cleanup changes;
2. focused/exhaustive/full/build results;
3. cleanup commit SHA;
4. pushed branch;
5. PR number and URL;
6. exact PR head SHA;
7. confirmation PR is conflict-free;
8. confirmation Slice 2 was not started.
