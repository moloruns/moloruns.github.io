"""
Download Pokemon data from PokeAPI and save one clean table.

Kept: every default species (1-1025) plus regional forms (Alolan,
Galarian, Hisuian, Paldean). Left out: Megas, Gigantamax, and cosmetic
or battle-only forms (see docs/model.md).

PokeAPI asks users to cache, so every response is saved under
cache/pokeapi/ and never requested twice.

Output: tables/pokemon.csv
"""
import json
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import pandas as pd
import requests


ROOT = Path(__file__).resolve().parent
CACHE_DIR = ROOT / "cache" / "pokeapi"
OUTPUT = ROOT / "tables" / "pokemon.csv"

API = "https://pokeapi.co/api/v2"

REGIONS = {
    "alola": "Alolan",
    "galar": "Galarian",
    "hisui": "Hisuian",
    "paldea": "Paldean",
}

# Names that contain a region but aren't regional forms:
# pikachu-alola-cap (cosmetic), raticate-totem-alola (totem),
# darmanitan-galar-zen (battle-only).
NOT_REGIONAL = {"cap", "totem", "zen"}

STAT_NAMES = {
    "hp": "hp",
    "attack": "atk",
    "defense": "def",
    "special-attack": "spa",
    "special-defense": "spd",
    "speed": "spe",
}


def get_json(endpoint):
    """Return PokeAPI JSON for an endpoint like 'pokemon/25'."""
    path = CACHE_DIR / (endpoint.replace("/", "_") + ".json")

    if path.exists():
        return json.loads(path.read_text(encoding="utf-8"))

    for attempt in range(3):
        try:
            response = requests.get(f"{API}/{endpoint}", timeout=30)
            response.raise_for_status()
            break
        except requests.RequestException:
            if attempt == 2:
                raise
            time.sleep(2)

    path.write_text(response.text, encoding="utf-8")
    return response.json()


def regional_suffix(name):
    """Return the region key if this entry is a regional form, else None."""
    parts = name.split("-")

    if NOT_REGIONAL & set(parts):
        return None

    return next((part for part in parts if part in REGIONS), None)


def display_name(pokemon, species_name):
    """'Raichu', 'Alolan Raichu', 'Paldean Tauros (Combat Breed)'."""
    region = regional_suffix(pokemon["name"])

    if region is None:
        return species_name

    # Anything after the region, e.g. 'combat-breed' for Tauros.
    parts = pokemon["name"].split("-")
    extra = parts[parts.index(region) + 1:]
    extra = [part for part in extra if part != "standard"]

    name = f"{REGIONS[region]} {species_name}"

    if extra:
        name += f" ({' '.join(extra).title()})"

    return name


def english_name(species):
    return next(
        entry["name"]
        for entry in species["names"]
        if entry["language"]["name"] == "en"
    )


def build_row(pokemon, species):
    stats = {
        STAT_NAMES[entry["stat"]["name"]]: entry["base_stat"]
        for entry in pokemon["stats"]
    }

    types = [
        entry["type"]["name"]
        for entry in sorted(pokemon["types"], key=lambda t: t["slot"])
    ]

    # Hidden abilities count for bonuses.
    abilities = [entry["ability"]["name"] for entry in pokemon["abilities"]]

    return {
        "id": pokemon["id"],
        "slug": pokemon["name"],
        "name": display_name(pokemon, english_name(species)),
        "species_id": species["id"],
        "is_default": pokemon["is_default"],
        "generation": species["generation"]["name"],
        "legendary": species["is_legendary"],
        "mythical": species["is_mythical"],
        "types": "|".join(types),
        "abilities": "|".join(abilities),
        "height_dm": pokemon["height"],
        "weight_hg": pokemon["weight"],
        **stats,
        "bst": sum(stats.values()),
    }


def main():
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)

    listing = get_json("pokemon?limit=2000")["results"]

    # PokeAPI numbers default species 1-1025 and alternate forms 10001+.
    keep = [
        entry["name"]
        for entry in listing
        if int(entry["url"].rstrip("/").split("/")[-1]) < 10000
        or regional_suffix(entry["name"])
    ]

    print(f"{len(listing)} entries listed, keeping {len(keep)}")

    with ThreadPoolExecutor(max_workers=8) as pool:
        pokemon = list(pool.map(lambda n: get_json(f"pokemon/{n}"), keep))

        species_ids = sorted({
            int(p["species"]["url"].rstrip("/").split("/")[-1])
            for p in pokemon
        })
        species = dict(zip(
            species_ids,
            pool.map(lambda i: get_json(f"pokemon-species/{i}"), species_ids),
        ))

    rows = [
        build_row(p, species[int(p["species"]["url"].rstrip("/").split("/")[-1])])
        for p in pokemon
    ]

    df = pd.DataFrame(rows).sort_values("id")

    defaults = df[df["is_default"]]
    regional = df[~df["is_default"]]

    if len(defaults) != len(species_ids):
        raise ValueError(
            f"Expected one default entry per species, got "
            f"{len(defaults)} for {len(species_ids)} species."
        )

    df.to_csv(OUTPUT, index=False)

    print(f"Saved {OUTPUT.relative_to(ROOT)}: "
          f"{len(defaults)} species + {len(regional)} regional forms")
    print("\nRegional forms kept:")
    print(", ".join(regional["name"]))


if __name__ == "__main__":
    main()
