"""
Apply the formulas in formulas.py and export the JSON the site loads.

Inputs:  tables/pokemon.csv, tables/nba2k.csv
Outputs: ../data/pokemon.json, ../data/nba_players.json
         tables/pokemon_attributes.csv, tables/nba_attributes.csv
         (same numbers as the JSON, for checking by eye)
"""
import json
from datetime import date
from pathlib import Path

import numpy as np
import pandas as pd

import formulas as f


ROOT = Path(__file__).resolve().parent
TABLES = ROOT / "tables"
DATA_DIR = ROOT.parent / "data"

# SPEC.md roster, as PokeAPI names.
ROSTER = {
    "kanto": [
        "wartortle", "charizard", "venusaur", "gengar", "mewtwo",
        "arcanine", "pikachu", "onix", "marowak", "snorlax",
    ],
    "sinnoh": [
        "infernape", "luxray", "croagunk", "lucario", "gardevoir",
        "staraptor", "darkrai", "weavile", "tangrowth", "garchomp",
    ],
}

GENERATIONS = {
    f"generation-{roman}": number
    for number, roman in enumerate(
        ["i", "ii", "iii", "iv", "v", "vi", "vii", "viii", "ix"], start=1
    )
}


def percentile(values):
    """0-100 rank within the population. Ties share their average rank."""
    return (values.rank(method="average") - 0.5) / values.count() * 100


def composite(inputs, weights):
    """Weighted average of input percentiles, turned back into a percentile."""
    total = sum(weights.values())
    blended = sum(
        percentile(inputs[column]) * weight
        for column, weight in weights.items()
    ) / total
    return percentile(blended)


def attribute_table(inputs, weight_table):
    return pd.DataFrame({
        attribute: composite(inputs, weight_table[attribute])
        for attribute in f.ATTRIBUTES
    })


def apply_bonuses(attributes, pokemon):
    """Add the type/ability bonus, at most once per attribute."""
    types = pokemon["types"].str.split("|").apply(set)
    abilities = pokemon["abilities"].str.split("|").apply(set)

    earned = pd.DataFrame(False, index=attributes.index, columns=f.ATTRIBUTES)

    for attribute in f.ATTRIBUTES:
        bonus_types = f.TYPE_BONUSES.get(attribute, set())
        bonus_abilities = f.ABILITY_BONUSES.get(attribute, set())
        earned[attribute] = (
            types.apply(lambda t: bool(t & bonus_types))
            | abilities.apply(lambda a: bool(a & bonus_abilities))
        )

    boosted = (attributes + earned * f.BONUS_POINTS).clip(upper=100)
    return boosted, earned


def to_stars(score):
    """0-100 -> 1 to 5 stars in half-star steps."""
    return np.floor((1 + 4 * score / 100) * 2 + 0.5) / 2


def game_stars(attributes, pokemon):
    """
    Star ratings for the game.

    Each Pokemon's level is the mean of its attributes. The game
    keeps only LEVEL_KEEP of the distance between that level and 50,
    and keeps the shape (each attribute's distance from the Pokemon's
    own mean) untouched.
    """
    level = attributes.mean(axis=1)
    shift = (1 - f.LEVEL_KEEP) * (level - 50)
    scores = attributes.sub(shift, axis=0).clip(0, 100)

    stars = to_stars(scores)

    # Clutch is game-only and comes from base stat total (SPEC.md).
    bst_score = 50 + f.LEVEL_KEEP * (percentile(pokemon["bst"]) - 50)
    stars["clutch"] = to_stars(bst_score)
    stars["overall"] = to_stars(50 + f.LEVEL_KEEP * (level - 50))

    return stars


def rounded(row, digits=1):
    return {key: round(float(value), digits) for key, value in row.items()}


def build_pokemon():
    pokemon = pd.read_csv(TABLES / "pokemon.csv")

    roster_of = {
        slug: region for region, slugs in ROSTER.items() for slug in slugs
    }
    missing = set(roster_of) - set(pokemon["slug"])
    if missing:
        raise ValueError(f"Roster Pokemon not found: {sorted(missing)}")

    attributes = attribute_table(f.pokemon_inputs(pokemon), f.POKEMON_WEIGHTS)
    attributes, earned = apply_bonuses(attributes, pokemon)
    stars = game_stars(attributes, pokemon)

    # Level for whole-profile matching: BST percentile among all Pokemon.
    level = percentile(pokemon["bst"])

    records = []
    for i, row in pokemon.iterrows():
        records.append({
            "id": int(row["id"]),
            "slug": row["slug"],
            "name": row["name"],
            "types": row["types"].split("|"),
            "abilities": row["abilities"].split("|"),
            "generation": GENERATIONS[row["generation"]],
            "legendary": bool(row["legendary"]),
            "mythical": bool(row["mythical"]),
            "roster": roster_of.get(row["slug"]),
            "height_m": row["height_dm"] / 10,
            "weight_kg": row["weight_hg"] / 10,
            "stats": {
                stat: int(row[stat])
                for stat in ["hp", "atk", "def", "spa", "spd", "spe"]
            },
            "bst": int(row["bst"]),
            "level": round(float(level.loc[i]), 1),
            "attributes": rounded(attributes.loc[i]),
            "bonuses": [a for a in f.ATTRIBUTES if earned.at[i, a]],
            "stars": rounded(stars.loc[i]),
        })

    pd.concat(
        [pokemon[["id", "name", "types", "bst"]], attributes.round(1),
         stars.add_prefix("stars_")],
        axis=1,
    ).to_csv(TABLES / "pokemon_attributes.csv", index=False)

    return records


def build_nba():
    players = pd.read_csv(TABLES / "nba2k.csv")

    inputs = f.nba_inputs(players)
    attributes = attribute_table(inputs, f.NBA_WEIGHTS)

    # Level for whole-profile matching: 2K overall percentile among all players.
    level = percentile(players["overall"])

    records = []
    for i, row in players.iterrows():
        records.append({
            "slug": row["slug"],
            "name": row["name"],
            "team": row["team"],
            "positions": row["positions"].split("|"),
            "archetype": row["archetype"],
            "image_url": row.get("image_url", ""),
            "player_url": row.get("player_url", ""),
            "team_logo_url": row.get("team_logo_url", ""),
            "overall_2k": int(row["overall"]),
            "match_pool": bool(row["overall"] >= f.MATCH_MIN_OVERALL),
            "level": round(float(level.loc[i]), 1),
            "height_in": int(row["height_in"]),
            "weight_lb": int(row["weight_lb"]),
            "attributes": rounded(attributes.loc[i]),
            "ratings_2k": {k: int(v) for k, v in inputs.loc[i].items()},
        })

    pd.concat(
        [players[["name", "team", "overall"]], attributes.round(1)],
        axis=1,
    ).to_csv(TABLES / "nba_attributes.csv", index=False)

    return records


def write_json(path, payload):
    path.write_text(
        json.dumps(payload, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    print(f"Saved {path.relative_to(ROOT.parent)} ({path.stat().st_size // 1024} KB)")


def main():
    DATA_DIR.mkdir(exist_ok=True)

    pokemon = build_pokemon()
    players = build_nba()

    shared_meta = {
        "generated": date.today().isoformat(),
        "attributes": f.ATTRIBUTES,
        "profile_level_weight": f.PROFILE_LEVEL_WEIGHT,
        "note": (
            "Attributes are percentiles (0-100) within each population. "
            "The Pokemon and NBA mappings are design choices, not "
            "statistical findings. See pipeline/formulas.py."
        ),
    }

    write_json(DATA_DIR / "pokemon.json", {
        "meta": {
            **shared_meta,
            "count": len(pokemon),
            "level": "BST percentile among all Pokemon",
            "bonus_points": f.BONUS_POINTS,
            "level_keep": f.LEVEL_KEEP,
            "sprite_url": "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/{id}.png",
            "artwork_url": "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/{id}.png",
            "cry_url": "https://raw.githubusercontent.com/PokeAPI/cries/main/cries/pokemon/latest/{id}.ogg",
        },
        "pokemon": pokemon,
    })

    write_json(DATA_DIR / "nba_players.json", {
        "meta": {
            **shared_meta,
            "source": (
                "NBA 2K27 ratings via the community NBA 2K API "
                "(nba2kapi.com, data from 2kratings.com). Not affiliated "
                "with 2K or the NBA."
            ),
            "count": len(players),
            "level": "2K overall percentile among all players",
            "match_min_overall": f.MATCH_MIN_OVERALL,
            "match_pool_count": sum(p["match_pool"] for p in players),
        },
        "players": players,
    })


if __name__ == "__main__":
    main()
