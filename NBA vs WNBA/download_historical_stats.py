import argparse
import time
from pathlib import Path

from nba_api.stats.endpoints import leaguedashplayerstats


ROOT = Path(__file__).resolve().parent
OUTPUT_DIR = ROOT / "data" / "profile_stats"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

DATASETS = {
    "basic": ("Base", "PerGame"),
    "totals": ("Base", "Totals"),
    "advanced": ("Advanced", "PerGame"),
}


def download_dataset(league, league_id, season, kind):
    output = OUTPUT_DIR / f"{league}_{season}_{kind}.csv"

    if output.exists():
        print(f"Cached: {output.name}")
        return

    measure, per_mode = DATASETS[kind]

    print(f"Downloading {league} {season}: {kind}")
    time.sleep(4)

    response = leaguedashplayerstats.LeagueDashPlayerStats(
        league_id_nullable=league_id,
        season=season,
        season_type_all_star="Regular Season",
        measure_type_detailed_defense=measure,
        per_mode_detailed=per_mode,
        timeout=60,
    )

    tables = response.get_data_frames()

    if not tables or tables[0].empty:
        raise ValueError(
            f"No data returned for {league} {season} {kind}."
        )

    table = tables[0]

    if "PLAYER_ID" not in table.columns:
        raise ValueError("Expected PLAYER_ID was not returned.")

    if table["PLAYER_ID"].duplicated().any():
        raise ValueError(
            "Duplicate player IDs returned; inspect before aggregating."
        )

    table["league"] = league
    table["season"] = season

    # Write to a temporary file first.
    temporary = output.with_suffix(".tmp")
    table.to_csv(temporary, index=False)
    temporary.replace(output)

    print(f"Saved {output.name}: {len(table)} players")


def main():
    parser = argparse.ArgumentParser()

    parser.add_argument(
        "--start-year",
        type=int,
        default=2003,
    )

    parser.add_argument(
        "--end-year",
        type=int,
        default=2003,
    )

    parser.add_argument(
        "--league",
        choices=["NBA", "WNBA", "both"],
        default="both",
    )

    args = parser.parse_args()

    if args.end_year < args.start_year:
        raise ValueError("End year must not precede start year.")

    for year in range(args.start_year, args.end_year + 1):
        seasons = []

        if args.league in {"NBA", "both"}:
            nba_season = f"{year}-{str(year + 1)[-2:]}"
            seasons.append(("NBA", "00", nba_season))

        if args.league in {"WNBA", "both"}:
            seasons.append(("WNBA", "10", str(year)))

        for league, league_id, season in seasons:
            for kind in DATASETS:
                try:
                    download_dataset(
                        league,
                        league_id,
                        season,
                        kind,
                    )
                except Exception as exc:
                    print(
                        f"\nStopped at {league} {season} {kind}: {exc}"
                    )
                    print(
                        "Completed files remain cached. "
                        "Inspect the failure before retrying; "
                        "missing historical data is not automatically zero."
                    )
                    return


if __name__ == "__main__":
    main()