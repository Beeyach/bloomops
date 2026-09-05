# Release A

## Goal

Release A makes BloomOps usable for a real client activation and onboarding workflow.

At completion, Ellen can:

1. sign in
2. create a client
3. add purchased services
4. assign team members
5. activate the client
6. generate onboarding from templates
7. invite the client
8. let the client sign in through a simple portal
9. let the client fulfill onboarding requirements
10. let the team verify requirements
11. complete onboarding and move the client to Active
12. review an immutable activity history

Release A does not include full Social production, full Work execution, Ads operations, Systems QA, Finance, or payment automation.

## Release A Phases

- A0 — Create BloomOps safely
- A1 — Infrastructure isolation
- A2 — Database foundation
- A3 — Authentication and membership
- A4 — Authorization layer
- A5 — New BloomOps shell
- A6 — Clients
- A7 — Services and departments
- A8 — Onboarding template engine
- A9 — Activate Client
- A10 — Client onboarding portal
- A11 — Release A hardening

## Release-Level Acceptance Story 1

Ellen signs in.

She creates Lawrence.

She adds Kajabi.

She assigns Ary.

She activates Lawrence.

BloomOps generates Common + Kajabi onboarding.

Lawrence receives an invitation.

Lawrence signs in.

Lawrence sees only his client portal.

Lawrence fulfills required onboarding items.

Ary verifies access items.

All required onboarding completes.

Lawrence becomes Active.

Activity shows the significant lifecycle events.

## Release-Level Acceptance Story 2

Ellen creates James.

She adds:

- Social
- Ads
- GHL

BloomOps merges overlapping onboarding requirements such as Meta access.

A Social contractor receives Social scope.

Ary receives GHL scope.

The Social contractor cannot access James' GHL work.

James can see only his own client-visible onboarding.

## Release Gate

Release A is not complete merely because pages render.

It is complete only when:

- lifecycle transitions are correct
- invitation flow works
- authorization denials are tested
- workspace/client isolation is proven
- activation is idempotent
- template snapshots do not mutate existing onboarding
- onboarding completion logic is correct
- staging cannot mutate production
- client UI is usable on desktop and mobile
