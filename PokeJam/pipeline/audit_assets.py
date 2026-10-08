"""Check local runtime asset manifests; optionally prune unreferenced imported images."""
import argparse
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def audit(prune=False):
    manifest_path = ROOT / "assets/animations/manifest.json"
    manifest = json.loads(manifest_path.read_text())
    roster = json.loads((ROOT / "data/playable_roster.json").read_text())["players"]
    referenced = set()
    changes = False
    for player in roster:
        record = manifest["players"][player["slug"]]
        used = {"Idle", "Walk", "Shoot", "Attack", "Charge", "Hurt", "Pose"}
        used.update(player["visual"].get("animation", {}).get("actions", {}).values())
        for action, data in list(record["actions"].items()):
            if action not in used:
                print(f"Unused action: {player['slug']}/{action}")
                if prune:
                    del record["actions"][action]
                    changes = True
                    continue
            referenced.add(data["path"])
        for action in used - {"Shoot", "Attack", "Charge", "Hurt", "Pose"}:
            if action not in record["actions"]:
                raise ValueError(f"Missing required action: {player['slug']}/{action}")
        referenced.add(f"assets/pokemon/{player['slug']}.png")
    images = json.loads((ROOT / "data/player_images.json").read_text())["players"]
    referenced.update(entry["path"] for entry in images.values() if entry.get("path"))
    stages = json.loads((ROOT / "data/stages.json").read_text())["stages"]
    referenced.update(stage["backdrop"] for stage in stages)
    missing = sorted(path for path in referenced if not (ROOT / path).is_file())
    if missing:
        raise ValueError(f"Missing assets: {missing}")
    if changes:
        manifest_path.write_text(json.dumps(manifest, indent=2) + "\n")
    removed = 0
    for directory in ("assets/animations", "assets/players", "assets/pokemon", "assets/arenas"):
        for path in (ROOT / directory).rglob("*"):
            if path.suffix.lower() not in {".png", ".jpg", ".jpeg"}:
                continue
            if path.relative_to(ROOT).as_posix() not in referenced:
                print(f"Unreferenced image: {path.relative_to(ROOT)}")
                if prune:
                    path.unlink()
                    removed += 1
    print(f"PASS: {len(referenced)} local asset paths exist; {removed} unreferenced images removed. Credits/XML retained.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--prune", action="store_true")
    audit(parser.parse_args().prune)
