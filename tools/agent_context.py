#!/usr/bin/env python3
"""Bound agent startup context and search output. No model/provider calls."""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BUDGETS = {
    'AGENTS.md': 2048,
    'CLAUDE.md': 2048,
    'AI_WORKING_AGREEMENTS.md': 12288,
    'docs/BUILD_STATE.md': 6144,
    'docs/INDEX.md': 4096,
}
ARCHIVES = {
    'docs/history/BUILD_STATE-7d8166c.md': ('00c420deab949b24cb946bcfef15d94d35210b72', 854967),
    'docs/history/AI_WORKING_AGREEMENTS-7d8166c.md': ('87049db69bd043c981bf46996068411479641444', 24671),
    'docs/history/INDEX-7d8166c.md': ('e4f41a0f732417bcfc65d9ae9ea8230387583dd1', 23663),
}
CODE_PATHS = (
    'app', 'components', 'lib', 'tests', 'scripts', 'tools', 'services', 'workers',
    '.github', 'middleware.js', 'package.json', 'next.config.js',
    'open-next.config.ts', 'tailwind.config.js', 'wrangler.jsonc',
)
DOC_PATHS = ('docs', 'AGENTS.md', 'CLAUDE.md', 'AI_WORKING_AGREEMENTS.md')
HISTORY_DIRS = ('docs/history/', 'docs/previews/', 'docs/evidence/', 'docs/superpowers/')


def blob_id(data: bytes) -> str:
    """Git blob identity proves an archive is the exact original, not a summary."""
    return hashlib.sha1(b'blob ' + str(len(data)).encode() + b'\0' + data).hexdigest()


def check_current(root: Path) -> list[str]:
    errors = []
    for name, cap in BUDGETS.items():
        path = root / name
        if not path.is_file() or path.is_symlink():
            errors.append(f'{name}: missing or not a regular file')
            continue
        size = path.stat().st_size
        if size > cap:
            errors.append(f'{name}: {size} bytes exceeds {cap}; archive history, keep open obligations')
    if (root / 'AGENTS.md').is_file() and (root / 'CLAUDE.md').is_file():
        if (root / 'AGENTS.md').read_bytes() != (root / 'CLAUDE.md').read_bytes():
            errors.append('AGENTS.md and CLAUDE.md differ')
    try:
        import tomllib
        config = tomllib.loads((root / '.codex/config.toml').read_text())
        if config.get('model') != 'gpt-5.6-sol' or config.get('model_reasoning_effort') != 'medium':
            errors.append('Codex default differs from owner-approved Sol Medium; update policy explicitly')
        settings = json.loads((root / '.claude/settings.json').read_text())
        if settings.get('model') != 'claude-sonnet-5' or settings.get('fastMode') is not False:
            errors.append('Claude default differs from Sonnet 5 with fast mode off')
    except (OSError, ValueError, ImportError) as exc:
        errors.append(f'Agent configuration: {exc}')
    # Current-document local links only. Historical snapshots intentionally retain
    # their original relative-link base, documented in history/README.md.
    for name in (*BUDGETS, 'docs/history/README.md'):
        path = root / name
        if not path.is_file():
            continue
        for target in re.findall(r'\]\(([^\s)]+)\)', path.read_text()):
            if target.startswith(('#', 'http:', 'https:', 'mailto:')):
                continue
            relative = target.split('#', 1)[0]
            if relative and not (path.parent / relative).exists():
                errors.append(f'{name}: missing local link {target}')
    return errors


def check_archives(root: Path) -> list[str]:
    errors = []
    for name, (expected, size) in ARCHIVES.items():
        path = root / name
        if not path.is_file() or path.is_symlink():
            errors.append(f'{name}: missing or not a regular archive')
            continue
        data = path.read_bytes()
        if len(data) != size or blob_id(data) != expected:
            errors.append(f'{name}: archive differs from original blob {expected}')
    return errors


def search_command(root: Path, pattern: str, scope: str, path: str | None) -> list[str]:
    if not pattern:
        raise ValueError('Use a nonempty search pattern')
    args = ['rg', '--line-number', '--no-heading', '--color', 'never',
            '--max-columns', '240', '--max-columns-preview']
    if scope == 'history':
        if not path:
            raise ValueError('History search requires --path to one named file')
        target = Path(path)
        resolved = (root / target).resolve()
        if target.is_absolute() or '..' in target.parts or not resolved.is_relative_to(root.resolve()):
            raise ValueError('History path must stay inside this repository')
        if not resolved.is_file() or (root / target).is_symlink():
            raise ValueError('History search requires a regular file, not a directory or symlink')
        name = target.as_posix()
        root_report = '/' not in name and name.endswith('.md') and name not in DOC_PATHS
        if not (name.startswith(HISTORY_DIRS) or root_report):
            raise ValueError('Use a historical document or named root Markdown report')
        # Override ignore rules ONLY for the explicit historical file.
        args += ['--no-ignore', '-e', pattern, '--', name]
    else:
        if path:
            raise ValueError('--path is only for explicit history searches')
        paths = CODE_PATHS if scope == 'code' else DOC_PATHS
        existing = [name for name in paths if (root / name).exists()]
        if not existing:
            raise ValueError(f'No {scope} search paths in this checkout')
        args += ['--hidden', '-e', pattern, '--', *existing]
    return args


def search(root: Path, pattern: str, scope: str, path: str | None, limit: int) -> int:
    command = search_command(root, pattern, scope, path)
    # Exit 0 = matches, 1 = no matches, 2 = error. Do not hide real rg errors.
    result = subprocess.run(command, cwd=root, capture_output=True, text=True, check=False)
    lines = result.stdout.splitlines()
    for line in lines[:limit]:
        print(line)
    if len(lines) > limit:
        print(f'[TRUNCATED: showing {limit} of {len(lines)} matching lines; narrow the pattern/scope]')
    if result.stderr:
        print(result.stderr.strip(), file=sys.stderr)
    return result.returncode


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest='command', required=True)
    commands.add_parser('check', help='Validate budgets, configs, links and exact archive identities')
    commands.add_parser('metrics', help='Print byte/word counts, not tokenizer or billing estimates')
    lookup = commands.add_parser('search', help='Bounded source-first ripgrep')
    lookup.add_argument('pattern')
    lookup.add_argument('--scope', choices=('code', 'docs', 'history'), default='code')
    lookup.add_argument('--path')
    lookup.add_argument('--limit', type=int, choices=range(1, 201), default=60, metavar='1..200')
    args = parser.parse_args()
    if args.command == 'check':
        errors = check_current(ROOT) + check_archives(ROOT)
        if errors:
            print('\n'.join(errors), file=sys.stderr)
            return 1
        print('PASS: startup budgets, entry equality, model defaults, local links and 3 exact archives')
        return 0
    if args.command == 'metrics':
        rows = {}
        for name, cap in BUDGETS.items():
            data = (ROOT / name).read_bytes()
            rows[name] = {'bytes': len(data), 'words': len(data.decode().split()), 'byte_cap': cap}
        print(json.dumps(rows, indent=2))
        return 0
    try:
        return search(ROOT, args.pattern, args.scope, args.path, args.limit)
    except (ValueError, OSError) as exc:
        print(str(exc), file=sys.stderr)
        return 2


if __name__ == '__main__':
    raise SystemExit(main())
