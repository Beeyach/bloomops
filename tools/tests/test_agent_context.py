"""Dependency-free context tooling regressions; no npm, browser or database."""
import contextlib
import importlib.util
import io
from pathlib import Path
import shutil
import tempfile
import unittest
from unittest import mock

MODULE = Path(__file__).resolve().parents[1] / 'agent_context.py'
spec = importlib.util.spec_from_file_location('agent_context', MODULE)
agent = importlib.util.module_from_spec(spec)
spec.loader.exec_module(agent)


class ContextTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        for name in agent.BUDGETS:
            self.put(name, 'short\n')
        self.put('.codex/config.toml', 'model = "gpt-5.6-sol"\nmodel_reasoning_effort = "medium"\n')
        self.put('.claude/settings.json', '{"model":"claude-sonnet-5","fastMode":false}')
        for name in ('app/live.mjs', 'docs/phases/current.md', 'OLD-REPORT.md',
                     'docs/history/old.md', 'docs/previews/demo.md'):
            self.put(name, 'needle\n')
        shutil.copy(MODULE.parents[1] / '.rgignore', self.root / '.rgignore')

    def tearDown(self):
        self.tmp.cleanup()

    def put(self, name, content):
        path = self.root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content)

    def test_valid_small_context(self):
        self.assertEqual(agent.check_current(self.root), [])

    def test_build_state_limit(self):
        self.put('docs/BUILD_STATE.md', 'x' * (agent.BUDGETS['docs/BUILD_STATE.md'] + 1))
        self.assertTrue(any('exceeds' in x for x in agent.check_current(self.root)))

    def test_entry_equality(self):
        self.put('CLAUDE.md', 'different')
        self.assertIn('AGENTS.md and CLAUDE.md differ', agent.check_current(self.root))

    def test_wrong_model_and_config_syntax(self):
        self.put('.codex/config.toml', 'model = "gpt-6-astra"')
        self.assertTrue(any('Codex default' in x for x in agent.check_current(self.root)))
        self.put('.codex/config.toml', 'not TOML !')
        self.assertTrue(any('Agent configuration' in x for x in agent.check_current(self.root)))

    def test_missing_current_link(self):
        self.put('docs/INDEX.md', '[missing](not-there.md)')
        self.assertTrue(any('missing local link' in x for x in agent.check_current(self.root)))

    def test_archive_exact_bytes_and_missing(self):
        data = (self.root / 'docs/history/old.md').read_bytes()
        manifest = {'docs/history/old.md': (agent.blob_id(data), len(data))}
        with mock.patch.object(agent, 'ARCHIVES', manifest):
            self.assertEqual(agent.check_archives(self.root), [])
            self.put('docs/history/old.md', 'modified\n')
            self.assertTrue(agent.check_archives(self.root))
            (self.root / 'docs/history/old.md').unlink()
            self.assertTrue(agent.check_archives(self.root))

    def test_history_requires_explicit_safe_file(self):
        for path in (None, '../secret.md', '/etc/passwd', 'docs/history', 'app/live.mjs'):
            with self.subTest(path=path), self.assertRaises(ValueError):
                agent.search_command(self.root, 'needle', 'history', path)

    def test_history_rejects_symlink(self):
        (self.root / 'docs/history/link.md').symlink_to(self.root / 'OLD-REPORT.md')
        with self.assertRaises(ValueError):
            agent.search_command(self.root, 'needle', 'history', 'docs/history/link.md')

    @unittest.skipUnless(shutil.which('rg'), 'ripgrep required for search execution')
    def test_code_search_excludes_report_content(self):
        output = io.StringIO()
        with contextlib.redirect_stdout(output):
            result = agent.search(self.root, 'needle', 'code', None, 60)
        self.assertEqual(result, 0)
        self.assertIn('app/live.mjs', output.getvalue())
        self.assertNotIn('OLD-REPORT', output.getvalue())
        self.assertNotIn('docs/', output.getvalue())

    @unittest.skipUnless(shutil.which('rg'), 'ripgrep required for search execution')
    def test_docs_skip_history_but_explicit_history_works(self):
        output = io.StringIO()
        with contextlib.redirect_stdout(output):
            self.assertEqual(agent.search(self.root, 'needle', 'docs', None, 60), 0)
        self.assertIn('docs/phases/current.md', output.getvalue())
        self.assertNotIn('history/', output.getvalue())
        self.assertNotIn('previews/', output.getvalue())
        for name in ('docs/history/old.md', 'OLD-REPORT.md'):
            output = io.StringIO()
            with contextlib.redirect_stdout(output):
                self.assertEqual(agent.search(self.root, 'needle', 'history', name, 60), 0)
            self.assertIn('needle', output.getvalue())

    @unittest.skipUnless(shutil.which('rg'), 'ripgrep required for search execution')
    def test_truncation_and_exit_codes(self):
        self.put('app/live.mjs', 'needle\n' * 5)
        output = io.StringIO()
        with contextlib.redirect_stdout(output):
            self.assertEqual(agent.search(self.root, 'needle', 'code', None, 2), 0)
        self.assertIn('TRUNCATED', output.getvalue())
        with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
            self.assertEqual(agent.search(self.root, 'absent-term', 'code', None, 2), 1)
            self.assertEqual(agent.search(self.root, '[', 'code', None, 2), 2)


if __name__ == '__main__':
    unittest.main()
