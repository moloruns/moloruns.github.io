from pathlib import Path

import pandas as pd


ROOT = Path(__file__).resolve().parent
DATA_DIR = ROOT / "data"

SEASONS = {
    "NBA": "2024-25",
    "WNBA": "2025",
}


def main():
    players = pd.read_csv(DATA_DIR / "player_seasons.csv")

    for league, season in SEASONS.items():
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

        # Use mutually exclusive zones only.
        # "Corner 3" is an aggregate of left and right corner threes,
        # so it must NOT be included alongside those two zones.
        exclusive_zones = [
            "Restricted Area",
            "In The Paint (Non-RA)",
            "Mid-Range",
            "Left Corner 3",
            "Right Corner 3",
            "Above the Break 3",
            "Backcourt",
        ]

        attempt_columns = [
            f"{zone}__FGA"
            for zone in exclusive_zones
        ]

        missing_columns = [
            column
            for column in attempt_columns
            if column not in zones.columns
        ]

        if missing_columns:
            available = [
                column
                for column in zones.columns
                if column.endswith("__FGA")
            ]

            raise ValueError(
                f"{league}: missing expected shooting-zone columns:\n"
                f"{missing_columns}\n"
                f"Available attempt columns:\n{available}"
            )

        # Ensure counts are numeric. Unexpected text should raise an error.
        zones[attempt_columns] = zones[attempt_columns].apply(
            pd.to_numeric,
            errors="raise",
        )

        # Keep the missing-data safeguard.
        # A missing required zone should not silently become zero.
        zones["ZONE_FGA"] = zones[attempt_columns].sum(
            axis=1,
            min_count=len(attempt_columns),
        )

        excluded_columns = [
            column
            for column in zones.columns
            if column.endswith("__FGA")
            and column not in attempt_columns
        ]

        print(f"\n{league}: excluded overlapping/unused attempt columns:")
        print(excluded_columns)

        missing_zone_values = zones[attempt_columns].isna().any(axis=1)

        if missing_zone_values.any():
            print("\nPlayers with missing values in required zones:")
            print(
                zones.loc[
                    missing_zone_values,
                    ["PLAYER_NAME"] + attempt_columns,
                ].head(20).to_string(index=False)
            )

        league_players = players[
            (players["league"] == league)
            & (players["season"].astype(str) == season)
        ].copy()

        report = league_players[
            ["PLAYER_ID", "PLAYER_NAME", "GP", "MIN", "role"]
        ].merge(
            totals[["PLAYER_ID", "FGA"]],
            on="PLAYER_ID",
            how="left",
            validate="one_to_one",
        ).merge(
            zones[["PLAYER_ID", "ZONE_FGA"]],
            on="PLAYER_ID",
            how="left",
            validate="one_to_one",
        )

        report["FGA_DIFFERENCE"] = (
            report["ZONE_FGA"] - report["FGA"]
        )

        report["coverage_ok"] = (
            report["FGA"].notna()
            & report["ZONE_FGA"].notna()
            & report["FGA_DIFFERENCE"].eq(0)
        )

        eligible = (
            (report["GP"] >= 10)
            & (report["MIN"] >= 10)
            & (report["GP"] * report["MIN"] >= 200)
            & report["role"].notna()
        )

        problems = report[
            eligible & ~report["coverage_ok"]
        ]

        output = (
            DATA_DIR
            / "shot_locations"
            / f"{league}_{season}_coverage.csv"
        )
        report.to_csv(output, index=False)

        print(f"\n{league} {season}")
        print(f"Eligible players checked: {int(eligible.sum())}")
        print(f"Eligible players with coverage problems: {len(problems)}")

        if not problems.empty:
            print(
                problems[
                    [
                        "PLAYER_NAME",
                        "FGA",
                        "ZONE_FGA",
                        "FGA_DIFFERENCE",
                    ]
                ].to_string(index=False)
            )


if __name__ == "__main__":
    main()