"""Run the complete browser regression suite sequentially against a local preview."""
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parent
BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8002"
for name in ["game", "finishes", "arena", "phase21", "shotclock", "fire_perks",
             "courtside", "fire_timer", "roster", "animations", "full_roster", "match_setup", "polish"]:
    print(f"Running {name}", flush=True)
    subprocess.run([sys.executable, str(ROOT / f"browser_{name}.py"), BASE], check=True)
print("PASS: all thirteen browser suites", flush=True)
