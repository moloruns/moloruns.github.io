"""
Download NBA 2K27 player ratings and save one clean table.

Source: the community NBA 2K API (nba2kapi.com), whose data comes from
2kratings.com. Not official, and not affiliated with 2K or the NBA.
One bulk request returns every current player. The raw response is
cached under cache/nba2k/, so reruns don't use the API again (delete
the cached file to pull fresh ratings).

Needs a free API key in pipeline/.env (gitignored), written as either
NBA2KAPI_KEY=... or "nba2kapi key: ...".

Kept: every player with all 35 attributes, free agents included.
Ratings don't depend on games played, so there is no
games or minutes filter.

Output: tables/nba2k.csv
"""
import json
import re
from pathlib import Path

import pandas as pd
import requests


ROOT = Path(__file__).resolve().parent
CACHE = ROOT / "cache" / "nba2k" / "bulk_curr.json"
OUTPUT = ROOT / "tables" / "nba2k.csv"

API = "https://api.nba2kapi.com/api/players/bulk"
ATTRIBUTE_COUNT = 35

# 2K27 lists Westbrook at 42 overall (2K26: 80) although the attributes
# barely changed, which looks like a data error. When an overall drops
# this much in one year, the previous year's overall is kept instead.
MAX_YEARLY_DROP = 15


def api_key():
    for line in (ROOT / ".env").read_text(encoding="utf-8").splitlines():
        if "nba2kapi" in line.lower():
            return re.split(r"[:=]", line, maxsplit=1)[1].strip()
    raise ValueError("No nba2kapi key found in pipeline/.env")


def download():
    if CACHE.exists():
        print(f"Using cached response: {CACHE.relative_to(ROOT)}")
        return json.loads(CACHE.read_text(encoding="utf-8"))

    response = requests.get(
        API,
        params={"teamType": "curr"},  # current teams, not classic/all-time
        headers={"X-API-Key": api_key()},
        timeout=60,
    )
    response.raise_for_status()

    CACHE.parent.mkdir(parents=True, exist_ok=True)
    CACHE.write_text(response.text, encoding="utf-8")
    return response.json()


def inches(text):
    """6'11" -> 83"""
    feet, rest = text.split("'")
    return int(feet) * 12 + int(rest.strip('"') or 0)


def overall(player):
    """2K's overall rating, falling back to last year's after a broken drop."""
    previous_version = f"2K{int(player['gameVersion'][2:]) - 1}"
    previous = next(
        (h["overall"] for h in player["ratingHistory"]
         if h["gameVersion"] == previous_version),
        None,
    )
    if previous is not None and previous - player["overall"] >= MAX_YEARLY_DROP:
        print(f"  {player['name']}: overall {player['overall']} looks broken, "
              f"using {previous_version}'s {previous}")
        return previous
    return player["overall"]


def main():
    payload = download()
    players = payload["data"]

    incomplete = [p["name"] for p in players if len(p["attributes"]) < ATTRIBUTE_COUNT]
    players = [p for p in players if len(p["attributes"]) == ATTRIBUTE_COUNT]

    df = pd.DataFrame([
        {
            "slug": p["slug"],
            "name": p["name"],
            "team": p["team"],
            "positions": "|".join(p["positions"]),
            "archetype": p["archetype"],
            "image_url": p.get("playerImage", ""),
            "player_url": p.get("playerUrl", ""),
            "team_logo_url": p.get("teamImg", ""),
            "overall": overall(p),
            "height_in": inches(p["height"]),
            "weight_lb": int(p["weight"].split()[0]),
            **p["attributes"],
        }
        for p in players
    ])

    if df["slug"].duplicated().any():
        raise ValueError("Duplicate players in the 2K data.")

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(OUTPUT, index=False)

    versions = {p["gameVersion"] for p in players}
    print(f"Saved {OUTPUT.relative_to(ROOT)}: {len(df)} players ({', '.join(versions)}), "
          f"{(df['team'] == 'Free Agency').sum()} of them free agents")
    if incomplete:
        print(f"Skipped (missing attributes): {', '.join(incomplete)}")


if __name__ == "__main__":
    main()
