from pathlib import Path
import shutil

import pandas as pd


ROOT = Path(__file__).resolve().parent
DATA_DIR = ROOT / "data"

PLAYER_PATH = DATA_DIR / "player_seasons.csv"
OVERRIDES_PATH = DATA_DIR / "role_overrides.csv"

ASSIGNMENTS = [
    ("NBA", "Cam Reddish", "Wing"),
    ("NBA", "Daniel Theis", "Big"),
    ("NBA", "Isaiah Wong", "Guard"),
    ("NBA", "Marcus Bagley", "Wing"),
    ("NBA", "Mo Bamba", "Big"),
    ("NBA", "Orlando Robinson", "Big"),
    ("NBA", "Reggie Jackson", "Guard"),
    ("WNBA", "Karlie Samuelson", "Wing"),
    ("WNBA", "Teaira McCowan", "Big"),
]


def main():
    players = pd.read_csv(PLAYER_PATH)
    new_overrides = []

    for league, name, role in ASSIGNMENTS:
        mask = (
            players["league"].eq(league)
            & players["PLAYER_NAME"].eq(name)
        )

        if not mask.any():
            raise ValueError(
                f"Could not find {name} in {league}. "
                "Check the spelling in player_seasons.csv."
            )

        player_ids = players.loc[mask, "PLAYER_ID"].unique()

        if len(player_ids) != 1:
            raise ValueError(
                f"Multiple player IDs found for {name}; inspect manually."
            )

        players.loc[mask, "role"] = role

        new_overrides.append({
            "league": league,
            "PLAYER_ID": int(player_ids[0]),
            "role": role,
        })

        print(f"{name}: {role}")

    patches = pd.DataFrame(new_overrides)

    if OVERRIDES_PATH.exists():
        existing = pd.read_csv(OVERRIDES_PATH)

        required = {"league", "PLAYER_ID", "role"}
        if not required.issubset(existing.columns):
            raise ValueError(
                "role_overrides.csv needs league, PLAYER_ID, and role."
            )

        overrides = pd.concat(
            [existing[["league", "PLAYER_ID", "role"]], patches],
            ignore_index=True,
        )
    else:
        overrides = patches

    # The assignments from this script take priority.
    overrides = overrides.drop_duplicates(
        ["league", "PLAYER_ID"],
        keep="last",
    )

    backup = DATA_DIR / "player_seasons.before_role_fix.csv"

    if not backup.exists():
        shutil.copy2(PLAYER_PATH, backup)

    overrides.to_csv(OVERRIDES_PATH, index=False)
    players.to_csv(PLAYER_PATH, index=False)

    eligible = (
        (players["GP"] >= 10)
        & (players["MIN"] >= 10)
        & (players["GP"] * players["MIN"] >= 200)
    )

    remaining = players.loc[
        eligible & players["role"].isna(),
        ["PLAYER_NAME", "league"],
    ]

    print("\nSaved role assignments without removing existing statistics.")

    if remaining.empty:
        print("All playing-time-eligible players now have roles.")
    else:
        print("\nAdditional players still need roles:")
        print(remaining.to_string(index=False))


if __name__ == "__main__":
    main()