# Historical context, not startup instructions

These exact Git blobs preserve the pre-cleanup documents at application commit
`7d8166cc317335c01d18fb8596908bcf4562b62d`. They are not rewritten summaries.
The short current handoff and working agreements supersede their startup/model
rules. Old approvals, pending statuses and phase claims remain historical evidence.

| Snapshot | Bytes | Original blob SHA |
| --- | ---: | --- |
| [BUILD_STATE-7d8166c.md](BUILD_STATE-7d8166c.md) | 854967 | `00c420deab949b24cb946bcfef15d94d35210b72` |
| [AI_WORKING_AGREEMENTS-7d8166c.md](AI_WORKING_AGREEMENTS-7d8166c.md) | 24671 | `87049db69bd043c981bf46996068411479641444` |
| [INDEX-7d8166c.md](INDEX-7d8166c.md) | 23663 | `e4f41a0f732417bcfc65d9ae9ea8230387583dd1` |

Snapshots preserve original bytes, including relative links. Those links retain
their original locations as their base, not this archive directory. For navigation,
use the original revision:
[status](https://github.com/Beeyach/bloomops/blob/7d8166cc317335c01d18fb8596908bcf4562b62d/docs/BUILD_STATE.md),
[agreements](https://github.com/Beeyach/bloomops/blob/7d8166cc317335c01d18fb8596908bcf4562b62d/AI_WORKING_AGREEMENTS.md),
[index](https://github.com/Beeyach/bloomops/blob/7d8166cc317335c01d18fb8596908bcf4562b62d/docs/INDEX.md).
Old BUILD_STATE/INDEX heading references can be looked up there; do not silently
interpret an old section as the current task.

For a specific historical question, first locate its headings with:
`python3 tools/agent_context.py search '^## ' --scope history --path docs/history/BUILD_STATE-7d8166c.md`
Then read only the required line range. A named root report is also accepted by
history mode. Never read all snapshots or recursively load their links on startup.

Root reports remain at their original paths; this avoids breaking runtime readers,
tests and old relative references. Their relocation is not needed for source-first
search. No product record or historical document has been deleted.

`python3 tools/agent_context.py check` verifies the three complete blob identities,
startup budgets, identical entry files and model defaults without calling any API.
Archive existing status before replacing it again; never trim away open obligations
merely to satisfy a byte cap. New detailed receipts belong in the established
phase/evidence location, linked from the short current handoff.
