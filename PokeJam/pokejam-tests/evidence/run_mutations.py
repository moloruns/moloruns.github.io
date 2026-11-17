"""Capture sequential one-line mutations; always restore the original source bytes."""
from pathlib import Path
import difflib
import os
import re
import subprocess

EVIDENCE = Path(__file__).resolve().parent
PROJECT = EVIDENCE.parents[1]
NODE = os.environ.get("POKEJAM_NODE", "node")
LOGS = EVIDENCE / "logs"
COMMAND = [NODE, "--test", "--test-reporter=tap", *[
    str(path.relative_to(PROJECT)) for path in sorted((PROJECT / "tests").glob("*.test.js"))
]]

MUTATIONS = [
    ("M1", "js/catalog_logic.js", "(record) => record.match_pool", "(record) => !record.match_pool"),
    ("M2", "js/catalog_logic.js", "others.slice(0, 72)", "others.slice(0, 71)"),
    ("M3", "js/catalog_logic.js", ".includes(query)", ".startsWith(query)"),
    ("M4", "js/catalog_logic.js", "gap: Math.abs(queryRecord.attributes[attribute] - matchRecord.attributes[attribute]),",
     "gap: (queryRecord.attributes[attribute] - matchRecord.attributes[attribute]),"),
    ("M5", "js/match.js", "rmsGap <= PROFILE_FIT.maxRmsGap", "rmsGap < PROFILE_FIT.maxRmsGap"),
]


def run(name):
    result = subprocess.run(COMMAND, cwd=PROJECT, capture_output=True, text=True)
    output = result.stdout + result.stderr
    (LOGS / f"{name}.txt").write_text(
        "$ node --test --test-reporter=tap tests/*.test.js\n" + output + f"\nexit={result.returncode}\n"
    )
    return result.returncode, output


def require_passing(code, output):
    if code != 0 or "# tests 18\n" not in output or "# pass 18\n" not in output:
        raise RuntimeError("Expected 18 passing tests; inspect raw log before continuing")


def main():
    LOGS.mkdir(exist_ok=True)
    require_passing(*run("mutations-baseline"))
    sha = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=PROJECT, text=True).strip()
    report = [
        "# Mutation evidence\n",
        "AI-generated factual record, November 16, 2026. All excerpts below are captured output.\n",
        f"Test snapshot / `TESTS_SHA` / `FINAL_TESTS_SHA`: `{sha}`.\n",
        "Command from `PokeJam/`: `node --test --test-reporter=tap tests/*.test.js`.\n",
        "Node: `" + subprocess.check_output([NODE, "--version"], text=True).strip() + "`.\n",
        "Baseline: 18 passing tests, exit 0. Each mutation changes one source line and is restored before the next.\n\n",
        "| ID | Source line | Failure exit | Detecting tests | Restored run |\n",
        "| --- | --- | --- | --- | --- |\n",
    ]
    details = []
    survived = []
    for identifier, relative, old, new in MUTATIONS:
        source = PROJECT / relative
        original = source.read_bytes()
        text = original.decode()
        if text.count(old) != 1:
            raise RuntimeError(f"{identifier}: expected exactly one mutation target")
        mutated = text.replace(old, new, 1)
        line = text[:text.index(old)].count("\n") + 1
        diff = "".join(difflib.unified_diff(text.splitlines(True), mutated.splitlines(True),
                                         fromfile=f"a/PokeJam/{relative}", tofile=f"b/PokeJam/{relative}"))
        (LOGS / f"{identifier}.diff").write_text(diff)
        try:
            source.write_bytes(mutated.encode())
            code, output = run(f"{identifier}-mutated")
        finally:
            source.write_bytes(original)
        restored_code, restored_output = run(f"{identifier}-restored")
        require_passing(restored_code, restored_output)
        failures = re.findall(r"^not ok \d+ - (.+)$", output, re.MULTILINE)
        if code == 0 or not failures:
            survived.append(identifier)
        names = "; ".join(failures) or "none"
        report.append(f"| {identifier} | `{relative}:{line}` | {code} | {names} | 18 pass, exit {restored_code} |\n")
        # Save each full failing TAP block, including actual assertion message and stack.
        blocks = re.findall(r"(^not ok \d+ - .*?^  \.\.\.$)", output, re.MULTILINE | re.DOTALL)
        details.append(
            f"\n## {identifier}\n\nOriginal: `{old}`\n\nMutated: `{new}`\n\n"
            f"[Exact diff](logs/{identifier}.diff), [mutation output](logs/{identifier}-mutated.txt), "
            f"[restored output](logs/{identifier}-restored.txt).\n\n"
            "```text\n" + ("\n\n".join(blocks) if blocks else output) + "\n```\n"
        )
        print(f"{identifier}: exit {code}; caught by {names}; restored 18/18")
    report.append("\nSurviving mutations: " + (", ".join(survived) if survived else "none") + ".\n")
    report.append("No test changes were needed during these experiments. This does not prove every test can catch every bug.\n")
    (EVIDENCE / "mutations.md").write_text("".join(report + details))
    if survived:
        raise SystemExit("Some mutations survived; see mutations.md")


if __name__ == "__main__":
    main()
