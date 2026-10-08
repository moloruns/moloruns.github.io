"""
Print a Pokemon's game card (star ratings) and its closest NBA players,
or an NBA player's attributes and closest Pokemon. Matches are shown
for the whole profile and per trait ("scores like", "handles like"...).

    python3 show.py pikachu
    python3 show.py "alolan raichu"
    python3 show.py giannis
"""
import sys

from formulas import ATTRIBUTES, PROFILE_LEVEL_WEIGHT, TRAITS
from match import ranked_on, ranked_profile
from validate import load, plain


TOP_N = 5


def stars(value):
    """3.5 -> '★★★½☆'"""
    full = int(value)
    half = value - full >= 0.5
    return "★" * full + ("½" if half else "") + "☆" * (5 - full - half)


def ordinal(value):
    """22 -> '22nd'"""
    n = round(value)
    suffix = "th" if 10 <= n % 100 <= 20 else {1: "st", 2: "nd", 3: "rd"}.get(n % 10, "th")
    return f"{n}{suffix}"


def label(attribute):
    return attribute.replace("_", " ").title()


def print_matches(query, query_level, candidates, candidate_levels, records, heading):
    best = ranked_profile(query, query_level, candidates, candidate_levels,
                          PROFILE_LEVEL_WEIGHT)[:TOP_N]
    print(f"\n  {heading}, whole profile")
    print(f"    {', '.join(records[i]['name'] for i in best)}")

    print("\n  Plays like")
    for phrase, group in TRAITS.items():
        columns = [ATTRIBUTES.index(a) for a in group]
        top = ranked_on(query, candidates, columns)[:3]
        runners_up = ", ".join(records[i]["name"] for i in top[1:])
        print(f"    {phrase:<13} {records[top[0]]['name']}  (then {runners_up})")
    print()


def show_pokemon(k, pokemon, poke_vectors, poke_levels, players, nba_vectors, nba_levels):
    p = pokemon[k]
    roster = f"  {p['roster'].title()} roster" if p["roster"] else ""
    print(f"\n{p['name']}  (#{p['id']}, {'/'.join(t.title() for t in p['types'])})"
          f"  BST {p['bst']}{roster}\n")

    print(f"  {'Overall':<14} {stars(p['stars']['overall'])}  {p['stars']['overall']}")
    for a in ATTRIBUTES:
        bonus = ", +10 type/ability bonus" if a in p["bonuses"] else ""
        print(f"  {label(a):<14} {stars(p['stars'][a])}  {p['stars'][a]:<4}"
              f" ({ordinal(p['attributes'][a])} percentile{bonus})")
    print(f"  {'Clutch':<14} {stars(p['stars']['clutch'])}  {p['stars']['clutch']:<4}"
          f" (game only, from BST)")

    # Only players in the match pool (2K overall 78+) can be a match.
    pool = [i for i, player in enumerate(players) if player["match_pool"]]
    print_matches(poke_vectors[k], poke_levels[k], nba_vectors[pool], nba_levels[pool],
                  [players[i] for i in pool], "Closest NBA players")


def show_player(n, players, nba_vectors, nba_levels, pokemon, poke_vectors, poke_levels):
    p = players[n]
    print(f"\n{p['name']}  ({p['team']}, {'/'.join(p['positions'])}, "
          f"{p['archetype']}, 2K overall {p['overall_2k']})\n")

    for a in ATTRIBUTES:
        value = p["attributes"][a]
        bar = "█" * round(value / 5)
        print(f"  {label(a):<14} {bar:<20} {ordinal(value)} percentile")

    print_matches(nba_vectors[n], nba_levels[n], poke_vectors, poke_levels,
                  pokemon, "Closest Pokemon")


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        return

    query = plain(" ".join(sys.argv[1:]))
    pokemon, poke_vectors, poke_levels = load("pokemon.json", "pokemon")
    players, nba_vectors, nba_levels = load("nba_players.json", "players")

    def show(kind, i):
        if kind == "pokemon":
            show_pokemon(i, pokemon, poke_vectors, poke_levels, players, nba_vectors, nba_levels)
        else:
            show_player(i, players, nba_vectors, nba_levels, pokemon, poke_vectors, poke_levels)

    def name(kind, i):
        return (pokemon if kind == "pokemon" else players)[i]["name"]

    # Exact name (or PokeAPI slug) first, e.g. "pikachu" not "Alolan Raichu".
    exact = (
        [("pokemon", i) for i, r in enumerate(pokemon)
         if query in (plain(r["name"]), r["slug"])]
        + [("player", i) for i, r in enumerate(players)
           if query == plain(r["name"])]
    )
    if exact:
        show(*exact[0])
        return

    partial = (
        [("pokemon", i) for i, r in enumerate(pokemon) if query in plain(r["name"])]
        + [("player", i) for i, r in enumerate(players) if query in plain(r["name"])]
    )
    if len(partial) == 1:
        show(*partial[0])
    elif not partial:
        print(f"No Pokemon or NBA player matches {query!r}.")
    else:
        print(f"{query!r} matches several entries; be more specific:")
        for kind, i in partial[:15]:
            print("  " + name(kind, i))


if __name__ == "__main__":
    main()
