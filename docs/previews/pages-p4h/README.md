# Pages compatibility and navigation acceptance

Existing project-file links retain independent file permissions when placed inside a shared page.15 built-browser checks cover actual client downloads, private response headers, internal/unrelated denial, file visibility revocation while page access stays valid, unchanged document source and desktop/mobile layouts. No upload UI or new storage model is added.

- [Desktop file links](files-desktop.png)
- [Mobile file links](files-mobile.png)
- [Small mobile file links](files-small-mobile.png)

## Controlled navigation comparison

Pre-Pages source was reconstructed from recorded phase snapshots in a disposable directory; all1785 recorded source hashes match. Both builds use the same dependency versions and the same synthetic representative workspace:50 clients,100 projects,1000 actions,250 static posts and200 file metadata rows. File-link browser mutations run on a separate database copy. No original workspace records or source documents were changed.

The accepted local Worker wrapper adds40ms per D1 invocation. Seven navigation rounds per route/width exclude two warmups; the five retained observations include full destination content plus two animation frames. Both builds run on the same local environment. Current was measured first, baseline second. These short runs support a regression check, not a global speed claim; differences around one frame are ordinary sample variation.

| Width | Route | Median before / after (ms) | p95 before / after (ms) | Requests / statements / D1 calls |
| --- | --- | --- | --- | --- |
| 1440 | Home | 212.1 / 212.0 | 228.5 / 228.4 | 1 / 15 / 3 |
| 1440 | Clients | 161.6 / 146.3 | 163.0 / 162.9 | 1 / 3 / 2 |
| 1440 | Work | 212.2 / 212.6 | 245.0 / 229.1 | 1 / 7 / 2 |
| 390 | Home | 213.1 / 213.1 | 213.2 / 213.2 | 1 / 15 / 3 |
| 390 | Clients | 146.8 / 146.9 | 163.7 / 163.5 | 1 / 3 / 2 |
| 390 | Work | 212.7 / 212.5 | 229.2 / 229.1 | 1 / 7 / 2 |

Every request/statement/call count is unchanged. All six cold route/width loads retain10 scripts:388457 →388810 decoded bytes (+353 bytes, about0.09%). Actual loaded script bodies contain no ProseMirror runtime or new Pages editor controls. The instrumented queries include no workspace Pages tables on these routes.

[Before samples](navigation-before.json), [after samples](navigation-after.json), [comparison](comparison.json). Across both builds,84 navigation samples were recorded (60 retained), plus12 cold loads.192 focused non-video editor/tree/sharing/file tests pass.

An initial baseline Worker failed because its symlinked dependency setup produced an incompatible bundle; giving the disposable baseline its own dependency copy and rebuilding resolved it. No production source workaround was made. The successful baseline still matches every recorded source hash. These are local results, not staging measurements; BUILD_STATE owns final acceptance and remaining scope.
