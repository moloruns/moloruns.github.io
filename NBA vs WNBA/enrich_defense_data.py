from pathlib import Path

import pandas as pd


ROOT = Path(__file__).resolve().parent
DATA_DIR = ROOT / "data"
PLAYER_PATH = DATA_DIR / "player_seasons.csv"

KEYS = ["league", "season", "PLAYER_ID"]
NEW_FIELDS = ["OREB_PCT", "DREB_PCT"]


def main():
    players = pd.read_csv(PLAYER_PATH)
    players["season"] = players["season"].astype(str)

    extra_tables = []

    seasons = players[["league", "season"]].drop_duplicates()

    for league, season in seasons.itertuples(index=False, name=None):
        path = (
            DATA_DIR
            / "profile_stats"
            / f"{league}_{season}_advanced.csv"
        )

        advanced = pd.read_csv(path)

        required = {"PLAYER_ID", *NEW_FIELDS}
        missing = required - set(advanced.columns)

        if missing:
            raise ValueError(
                f"{path.name} is missing {sorted(missing)}"
            )

        extra = advanced[["PLAYER_ID"] + NEW_FIELDS].copy()
        extra["league"] = league
        extra["season"] = season

        extra_tables.append(extra)

    extra = pd.concat(extra_tables, ignore_index=True)

    updated = players.drop(
        columns=NEW_FIELDS,
        errors="ignore",
    ).merge(
        extra,
        on=KEYS,
        how="left",
        validate="one_to_one",
    )

    eligible = (
        (updated["GP"] >= 10)
        & (updated["MIN"] >= 10)
        & (updated["GP"] * updated["MIN"] >= 200)
        & updated["role"].notna()
    )

    missing = updated.loc[
        eligible & updated[NEW_FIELDS].isna().any(axis=1),
        ["PLAYER_NAME", "league"] + NEW_FIELDS,
    ]

    if not missing.empty:
        raise ValueError(
            "Eligible players have missing rebounding percentages:\n"
            + missing.to_string(index=False)
        )

    updated.to_csv(PLAYER_PATH, index=False)
    print("Added offensive and defensive rebound percentages.")


if __name__ == "__main__":
    main()

