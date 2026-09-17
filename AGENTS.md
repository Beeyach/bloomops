# Bloomsi agent entry

Read [AI_WORKING_AGREEMENTS.md](AI_WORKING_AGREEMENTS.md) and the short
[docs/BUILD_STATE.md](docs/BUILD_STATE.md) once at task start. Read only the
relevant phase section and its necessary dependencies, not every linked document.
After compaction, use the current handoff and changed files; do not replay history.

History, old root reports and evidence are opt-in. Use
`python3 tools/agent_context.py search 'symbol'` for bounded source searches.
Keep AGENTS.md and CLAUDE.md byte-identical. The working agreements own safety,
model routing, testing and reporting. Newer explicit owner scope takes precedence.
