"""Cache comparison portraits locally; never change the 2K ratings.

NBA IDs come from nba_api's static player directory. Exact normalized
names only; unmatched players use their existing 2K portrait. Run this
after build_attributes.py. The separate manifest survives ratings rebuilds.
"""
import ast
from concurrent.futures import ThreadPoolExecutor
import json
from pathlib import Path
import re
import unicodedata

import requests


ROOT = Path(__file__).resolve().parent.parent
DIRECTORY_URL = "https://raw.githubusercontent.com/swar/nba_api/master/src/nba_api/stats/library/data.py"
CACHE = ROOT / "pipeline/cache/nba_player_directory.py"
ASSETS = ROOT / "assets/players"
MANIFEST = ROOT / "data/player_images.json"


def name_key(name):
    name = unicodedata.normalize("NFKD", name)
    return re.sub(r"[^a-z0-9]", "", name.encode("ascii", "ignore").decode().lower())


def player_ids():
    if not CACHE.exists():
        response = requests.get(DIRECTORY_URL, timeout=30)
        response.raise_for_status()
        CACHE.parent.mkdir(parents=True, exist_ok=True)
        CACHE.write_text(response.text, encoding="utf-8")
    # Parse the data literal without executing downloaded Python code.
    module = ast.parse(CACHE.read_text(encoding="utf-8"))
    rows = next(ast.literal_eval(node.value) for node in module.body
                if isinstance(node, ast.Assign)
                and any(isinstance(target, ast.Name) and target.id == "players"
                        for target in node.targets))
    grouped = {}
    for row in rows:
        grouped.setdefault(name_key(row[3]), []).append(row[0])
    return {name: ids[0] for name, ids in grouped.items() if len(ids) == 1}


def fetch_portrait(player, ids, previous):
    slug = player["slug"]
    if slug in previous and (ROOT / previous[slug]["path"]).exists():
        return slug, previous[slug]
    nba_id = ids.get(name_key(player["name"]))
    sources = []
    if nba_id:
        sources.append((f"https://cdn.nba.com/headshots/nba/latest/260x190/{nba_id}.png", "png", "NBA"))
    if player.get("image_url"):
        sources.append((player["image_url"], "jpg", "2K Ratings"))
    for url, extension, source in sources:
        try:
            response = requests.get(url, timeout=20)
            response.raise_for_status()
            if not response.headers.get("Content-Type", "").startswith("image/"):
                continue
            content = response.content
            if not (content.startswith(b"\x89PNG") or content.startswith(b"\xff\xd8")):
                continue
            path = ASSETS / f"{slug}.{extension}"
            path.write_bytes(content)
            return slug, {"path": path.relative_to(ROOT).as_posix(), "source": source,
                          "source_url": url, "nba_id": nba_id}
        except requests.RequestException:
            continue
    return slug, None


def main():
    ids = player_ids()
    players = json.loads((ROOT / "data/nba_players.json").read_text())["players"]
    previous = json.loads(MANIFEST.read_text())["players"] if MANIFEST.exists() else {}
    ASSETS.mkdir(parents=True, exist_ok=True)
    with ThreadPoolExecutor(max_workers=8) as pool:
        results = list(pool.map(lambda player: fetch_portrait(player, ids, previous), players))
    images = {slug: image for slug, image in results if image}
    MANIFEST.write_text(json.dumps({"players": images}, indent=2) + "\n")
    print(f"Cached {len(images)}/{len(players)} portraits ({sum(p['source'] == 'NBA' for p in images.values())} NBA headshots).")
    missing = [slug for slug, image in results if not image]
    if missing:
        print("Missing portraits: " + ", ".join(missing))


if __name__ == "__main__":
    main()
