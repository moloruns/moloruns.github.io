from pathlib import Path
import shutil

import numpy as np
import pandas as pd


ROOT = Path(__file__).resolve().parent
DATA_DIR = ROOT / "data"
PLAYER_PATH = DATA_DIR / "player_seasons.csv"

KEYS = ["league", "season", "PLAYER_ID"]

SHOT_FEATURES = [
    "RIM_RATE",
    "PAINT_NON_RA_RATE",
    "MIDRANGE_RATE",
    "THREE_ZONE_RATE",
    "THREE_RATE",
    "FT_RATE",
]

ZONE_COLUMNS = {
    "RIM_FGA": "Restricted Area__FGA",
    "PAINT_FGA": "In The Paint (Non-RA)__FGA",
    "MIDRANGE_FGA": "Mid-Range__FGA",
    "LEFT_CORNER_FGA": "Left Corner 3__FGA",
    "RIGHT_CORNER_FGA": "Right Corner 3__FGA",
    "ABOVE_BREAK_FGA": "Above the Break 3__FGA",
    "BACKCOURT_FGA": "Backcourt__FGA",
}


def main():
    players = pd.read_csv(PLAYER_PATH)
    players["season"] = players["season"].astype(str)

    if "USG_PCT" not in players.columns:
        raise ValueError(
            "Run enrich_similarity_data.py first to add usage."
        )

    feature_tables = []

    seasons = players[["league", "season"]].drop_duplicates()

    for league, season in seasons.itertuples(index=False, name=None):
        zones_path = (
            DATA_DIR
            / "shot_locations"
            / f"{league}_{season}_zones.csv"
        )

        totals_path = (
            DATA_DIR
            / "profile_stats"
            / f"{league}_{season}_totals.csv"
        )

        zones = pd.read_csv(zones_path)
        totals = pd.read_csv(totals_path)

        required_zone_columns = {
            "PLAYER_ID",
            *ZONE_COLUMNS.values(),
        }

        missing = required_zone_columns - set(zones.columns)

        if missing:
            raise ValueError(
                f"{league}: missing zone columns: {sorted(missing)}"
            )

        counts = zones[
            ["PLAYER_ID"] + list(ZONE_COLUMNS.values())
        ].rename(
            columns={
                original: short
                for short, original in ZONE_COLUMNS.items()
            }
        )

        count_columns = list(ZONE_COLUMNS)

        counts[count_columns] = counts[count_columns].apply(
            pd.to_numeric,
            errors="raise",
        )

        total_counts = totals[
            ["PLAYER_ID", "FGA", "FG3A", "FTA"]
        ].rename(
            columns={
                "FGA": "TOTAL_FGA",
                "FG3A": "TOTAL_FG3A",
                "FTA": "TOTAL_FTA",
            }
        )

        scope = players[
            (players["league"] == league)
            & (players["season"] == season)
        ][
            KEYS + ["PLAYER_NAME", "GP", "MIN", "role"]
        ].copy()

        joined = scope.merge(
            counts,
            on="PLAYER_ID",
            how="left",
            validate="one_to_one",
        ).merge(
            total_counts,
            on="PLAYER_ID",
            how="left",
            validate="one_to_one",
        )

        joined["ZONE_FGA"] = joined[count_columns].sum(
            axis=1,
            min_count=len(count_columns),
        )

        three_columns = [
            "LEFT_CORNER_FGA",
            "RIGHT_CORNER_FGA",
            "ABOVE_BREAK_FGA",
            "BACKCOURT_FGA",
        ]

        joined["ZONE_FG3A"] = joined[three_columns].sum(
            axis=1,
            min_count=len(three_columns),
        )

        complete = joined[
            count_columns + ["TOTAL_FGA", "TOTAL_FG3A", "TOTAL_FTA"]
        ].notna().all(axis=1)

        nonnegative = joined[
            count_columns + ["TOTAL_FGA", "TOTAL_FG3A", "TOTAL_FTA"]
        ].ge(0).all(axis=1)

        # Location counts must still reconcile exactly with total FGA.
        valid = (
            complete
            & nonnegative
            & joined["TOTAL_FGA"].gt(0)
            & joined["TOTAL_FG3A"].le(joined["TOTAL_FGA"])
            & joined["ZONE_FGA"].eq(joined["TOTAL_FGA"])
        )

        # Audit the difference between location categories and official 3PA.
        joined["THREE_CLASSIFICATION_DIFF"] = (
            joined["ZONE_FG3A"] - joined["TOTAL_FG3A"]
        )

        eligible = (
            (joined["GP"] >= 10)
            & (joined["MIN"] >= 10)
            & (joined["GP"] * joined["MIN"] >= 200)
            & joined["role"].notna()
        )

        mismatch = (
            valid
            & joined["THREE_CLASSIFICATION_DIFF"].ne(0)
        )

        audit_columns = [
            "PLAYER_ID",
            "PLAYER_NAME",
            "league",
            "season",
            "TOTAL_FGA",
            "TOTAL_FG3A",
            "ZONE_FG3A",
            "THREE_CLASSIFICATION_DIFF",
            "BACKCOURT_FGA",
        ]

        audit_path = (
            DATA_DIR
            / "shot_locations"
            / f"{league}_{season}_three_point_audit.csv"
        )

        joined.loc[mismatch, audit_columns].to_csv(
            audit_path,
            index=False,
        )

        # A conservative review boundary for this initial dataset.
        # This is not a claim that a two-attempt discrepancy is always acceptable.
        # It prevents larger, unexamined disagreements from passing unnoticed.
        review_needed = (
            eligible
            & valid
            & joined["THREE_CLASSIFICATION_DIFF"].abs().gt(2)
        )

        if review_needed.any():
            raise ValueError(
                f"{league}: a three-point classification difference exceeds "
                f"the current two-attempt review boundary. Inspect {audit_path}"
            )

        eligible_mismatches = int((eligible & mismatch).sum())

        if eligible_mismatches:
            print(
                f"{league}: {eligible_mismatches} eligible players have small "
                "location-versus-official-3PA discrepancies. "
                f"Original counts preserved in {audit_path.name}."
            )

        problems = joined[eligible & ~valid]

        if not problems.empty:
            problem_path = (
                DATA_DIR
                / "shot_locations"
                / f"{league}_{season}_integration_problems.csv"
            )
            problems.to_csv(problem_path, index=False)

            raise ValueError(
                f"{league}: {len(problems)} eligible players failed "
                f"validation. Inspect {problem_path}"
            )

        denominator = joined["TOTAL_FGA"].replace(0, np.nan)

        joined["RIM_RATE"] = (
            joined["RIM_FGA"] / denominator
        )

        joined["PAINT_NON_RA_RATE"] = (
            joined["PAINT_FGA"] / denominator
        )

        joined["MIDRANGE_RATE"] = (
            joined["MIDRANGE_FGA"] / denominator
        )

        # Location-based share: used in the shot-location distribution.
        joined["THREE_ZONE_RATE"] = (
            joined["ZONE_FG3A"] / denominator
        )

        # Official shot-value share: retained for reference/display.
        joined["THREE_RATE"] = (
            joined["TOTAL_FG3A"] / denominator
        )

        joined["FT_RATE"] = (
            joined["TOTAL_FTA"] / denominator
        )

        joined.loc[~valid, SHOT_FEATURES] = np.nan

        feature_tables.append(joined[KEYS + SHOT_FEATURES])

        print(
            f"{league} {season}: "
            f"{int(eligible.sum())} eligible players validated."
        )

    features = pd.concat(feature_tables, ignore_index=True)

    # Allow the script to be rerun without creating duplicate columns.
    updated = players.drop(
        columns=SHOT_FEATURES,
        errors="ignore",
    ).merge(
        features,
        on=KEYS,
        how="left",
        validate="one_to_one",
    )

    backup = DATA_DIR / "player_seasons.before_shots.csv"
    if not backup.exists():
        shutil.copy2(PLAYER_PATH, backup)

    updated.to_csv(PLAYER_PATH, index=False)

    print(f"\nUpdated {PLAYER_PATH}")
    print("Added:", ", ".join(SHOT_FEATURES))


if __name__ == "__main__":
    main()