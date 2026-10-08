"""Fetch selected playable action sheets, preserving source art and attribution."""
import argparse
import json
from pathlib import Path
import subprocess
import xml.etree.ElementTree as ET


ROOT = Path(__file__).resolve().parents[1]
SOURCE = "https://raw.githubusercontent.com/PMDCollab/SpriteCollab/master"
ACTIONS = ("Idle", "Walk", "Shoot", "Attack", "Charge", "Hurt", "Pose")


def fetch_url(url):
    return subprocess.run(["curl", "--fail", "--location", "--silent", "--show-error",
                           "--retry", "2", "--max-time", "30", url],
                          check=True, capture_output=True).stdout


def fetch(path):
    return fetch_url(f"{SOURCE}/{path}")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("slugs", nargs="*", help="Only update these roster entries (default: all)")
    args = parser.parse_args()
    roster = json.loads((ROOT / "data" / "playable_roster.json").read_text())["players"]
    players = {p["slug"]: f'{p["id"]:04d}' for p in roster}
    profiles = {p["slug"]: p.get("visual", {}).get("animation", {}).get("actions", {}) for p in roster}
    unknown = set(args.slugs) - players.keys()
    if unknown:
        parser.error(f"Not playable: {', '.join(sorted(unknown))}")
    destination = ROOT / "assets" / "animations"
    destination.mkdir(parents=True, exist_ok=True)
    manifest_path = destination / "manifest.json"
    manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else {"source": "https://github.com/PMDCollab/SpriteCollab",
                "license": "Source repository: CC BY-NC 4.0; official sprites retain original rights holders.",
                "players": {}}
    if not (destination / "SOURCE-LICENSE.md").exists():
        (destination / "SOURCE-LICENSE.md").write_bytes(fetch("LICENSE.md"))
    for slug in args.slugs or players:
        number = players[slug]
        folder = destination / slug
        folder.mkdir(exist_ok=True)
        xml = fetch(f"sprite/{number}/AnimData.xml")
        (folder / "AnimData.xml").write_bytes(xml)
        credits = fetch(f"sprite/{number}/credits.txt")
        (folder / "credits.txt").write_bytes(credits)
        available = {node.findtext("Name"): node for node in ET.fromstring(xml).find("Anims")}
        actions = {}
        for name in dict.fromkeys([*ACTIONS, *profiles[slug].values()]):
            node = available.get(name)
            if node is None:
                continue
            source_name = name
            seen = set()
            while node.findtext("CopyOf"):
                if source_name in seen:
                    raise ValueError(f"Cyclic animation alias: {slug}/{name}")
                seen.add(source_name)
                source_name = node.findtext("CopyOf")
                node = available[source_name]
            sheet = fetch(f"sprite/{number}/{source_name}-Anim.png")
            (folder / f"{name}.png").write_bytes(sheet)
            actions[name] = {"width": int(node.findtext("FrameWidth")),
                             "height": int(node.findtext("FrameHeight")),
                             "durations": [int(d.text) * 1000 / 60 for d in node.find("Durations")],
                             "path": f"assets/animations/{slug}/{name}.png"}
        if not {"Idle", "Walk"}.issubset(actions):
            raise ValueError(f"Missing required idle/walk sheets: {slug}")
        fallback = ROOT / "assets" / "pokemon" / f"{slug}.png"
        if not fallback.exists():
            fallback.write_bytes(fetch_url(f"https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/{int(number)}.png"))
        manifest["players"][slug] = {"source": f"{SOURCE}/sprite/{number}",
                                     "credits": credits.decode(), "actions": actions}
        manifest_path.write_text(json.dumps(manifest, indent=2) + "\n")
        print(slug, ", ".join(actions), flush=True)


if __name__ == "__main__":
    main()
