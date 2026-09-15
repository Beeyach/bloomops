"""CI receipts and TAP comparison; never waives or replaces a command's exit status."""
import datetime
import hashlib
import json
import pathlib
import re
import subprocess
import sys


def capture(command):
    return subprocess.check_output(command, text=True).strip()


def sanitize(text):
    text = re.sub(r"\x1b\[[0-9;]*m", "", text)
    text = re.sub(r"(?i)(bearer\s+)[\w.~-]+", r"\1[REDACTED]", text)
    return re.sub(r"(?i)([?&](?:token|secret|key)=)[^\s&]+", r"\1[REDACTED]", text)


def tap(text):
    counts = {key: int(value) for key, value in re.findall(
        r"^# (tests|pass|fail|cancelled|skipped|todo) (\d+)$", text, re.M)}
    failures = []
    for match in re.finditer(r"^( *)not ok \d+ - (.+)\n", text, re.M):
        rest = text[match.end():]
        end = re.search(r"^ *\.\.\.$", rest, re.M)
        diagnostic = rest[:end.end()] if end else rest.split('\n')[0]
        # Keep actual/expected/error/operator; discard only timing and stack paths.
        cause = re.sub(r"^ *duration_ms:.*\n|^ *location:.*\n", "", diagnostic, flags=re.M)
        cause = re.sub(r"^ *stack:.*(?:\n {4,}.*)*", "", cause, flags=re.M)
        failures.append({"test": match[2], "diagnostic": diagnostic, "cause": cause.strip()})
    return {"counts": counts, "failures": failures}


def run():
    output = pathlib.Path(sys.argv[2]).resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    command = sys.argv[3:]
    started = datetime.datetime.now(datetime.timezone.utc).isoformat()
    result = subprocess.run(command, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    text = sanitize(result.stdout)
    output.with_suffix('.log').write_text(text)
    receipt = {
        "command": command, "cwd": str(pathlib.Path.cwd()),
        "revision": capture(['git', 'rev-parse', 'HEAD']),
        "startedAt": started, "completedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "exitCode": result.returncode, "node": capture(['node', '--version']),
        "npm": capture(['npm', '--version']), "python": sys.version,
        "lockfileSha256": hashlib.sha256(pathlib.Path('package-lock.json').read_bytes()).hexdigest(),
        **tap(text),
    }
    output.with_suffix('.json').write_text(json.dumps(receipt, indent=2))
    print(text, end='')
    sys.exit(result.returncode if result.returncode >= 0 else 128 - result.returncode)


def compare():
    candidate, base = [json.loads(pathlib.Path(p).read_text()) for p in sys.argv[2:4]]
    comparable = (candidate['command'] == base['command'] and candidate['node'] == base['node']
                  and candidate['npm'] == base['npm'] and candidate['python'] == base['python']
                  and len({r[k][:10] for r in (candidate, base)
                           for k in ('startedAt', 'completedAt')}) == 1)
    # Diagnostic equivalence is evidence for human classification, not a green gate.
    rows = []
    for failure in candidate['failures']:
        matches = [f for f in base['failures'] if f['test'] == failure['test']]
        rows.append({"test": failure['test'], "candidate": failure['diagnostic'],
                     "base": [f['diagnostic'] for f in matches],
                     "matchedAssertion": comparable and len(matches) == 1
                     and failure['cause'] == matches[0]['cause']})
    report = {"candidateRevision": candidate['revision'], "baseRevision": base['revision'],
              "comparableRuntimeAndUtcDate": comparable, "failures": rows,
              "baseOnlyFailures": [f for f in base['failures']
                                   if f['test'] not in {c['test'] for c in candidate['failures']}],
              "note": "No baseline waiver. Inspect causes and clock-sensitive fixtures before classification."}
    pathlib.Path(sys.argv[4]).write_text(json.dumps(report, indent=2))
    print(json.dumps(report, indent=2))


if __name__ == '__main__':
    {'run': run, 'compare': compare}[sys.argv[1]]()
