from pathlib import Path

import pandas as pd


ROOT = Path(__file__).resolve().parent
PLAYER_PATH = ROOT / "data" / "player_seasons.csv"
PROFILE_DIR = ROOT / "data" / "profile_stats"


def main():
    players = pd.read_csv(PLAYER_PATH)

    # Allow this script to be run repeatedly.
    players = players.drop(columns=["USG_PCT"], errors="ignore")

    advanced_tables = []

    for league, season in (
        players[["league", "season"]]
        .drop_duplicates()
        .itertuples(index=False, name=None)
    ):
        path = PROFILE_DIR / f"{league}_{season}_advanced.csv"

        if not path.exists():
            raise FileNotFoundError(
                f"Missing {path}. Run download_profile_stats.py first."
            )

        advanced = pd.read_csv(path)

        required = {"PLAYER_ID", "USG_PCT"}
        if not required.issubset(advanced.columns):
            raise ValueError(
                f"{path.name} does not contain the required usage data."
            )

        advanced = advanced[["PLAYER_ID", "USG_PCT"]].copy()
        advanced["league"] = league
        advanced["season"] = str(season)

        advanced_tables.append(advanced)

    usage = pd.concat(advanced_tables, ignore_index=True)
    players["season"] = players["season"].astype(str)

    players = players.merge(
        usage,
        on=["league", "season", "PLAYER_ID"],
        how="left",
        validate="one_to_one",
    )

    eligible = (
        (players["GP"] >= 10)
        & (players["MIN"] >= 10)
        & (players["GP"] * players["MIN"] >= 200)
        & players["role"].notna()
    )

    missing = players.loc[
        eligible & players["USG_PCT"].isna(),
        ["PLAYER_NAME", "league", "season"],
    ]

    if not missing.empty:
        raise ValueError(
            "Eligible players are missing usage data:\n"
            + missing.to_string(index=False)
        )

    players.to_csv(PLAYER_PATH, index=False)
    print(f"Updated {PLAYER_PATH} with USG_PCT.")


if __name__ == "__main__":
    main()