from pathlib import Path
import time

import pandas as pd
from nba_api.stats.endpoints import leaguedashplayerstats


ROOT = Path(__file__).resolve().parent
OUTPUT_DIR = ROOT / "data" / "profile_stats"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

SEASONS = {
    "NBA": ("00", "2024-25"),
    "WNBA": ("10", "2025"),
}

DATASETS = {
    "basic": ("Base", "PerGame"),
    "totals": ("Base", "Totals"),
    "advanced": ("Advanced", "PerGame"),
}


def main():
    for league, (league_id, season) in SEASONS.items():
        for kind, (measure, per_mode) in DATASETS.items():
            output = OUTPUT_DIR / f"{league}_{season}_{kind}.csv"

            if output.exists():
                print(f"Already downloaded: {output.name}")
                continue

            # Reuse the full basic table saved by the earlier downloader.
            existing_basic = (
                ROOT / "data" / "raw" / f"{league}_{season}_base.csv"
            )

            if kind == "basic" and existing_basic.exists():
                df = pd.read_csv(existing_basic)
            else:
                print(f"Downloading {league} {season}: {kind}")
                time.sleep(3)

                try:
                    response = (
                        leaguedashplayerstats.LeagueDashPlayerStats(
                            league_id_nullable=league_id,
                            season=season,
                            season_type_all_star="Regular Season",
                            measure_type_detailed_defense=measure,
                            per_mode_detailed=per_mode,
                            timeout=60,
                        )
                    )

                    df = response.get_data_frames()[0]

                    if df.empty:
                        raise RuntimeError("The endpoint returned no rows.")

                except Exception as exc:
                    print(f"Download failed: {exc}")
                    print(
                        "Stopping to avoid repeated failing requests. "
                        "Completed files remain saved; rerun later."
                    )
                    return

            if "PLAYER_ID" not in df.columns:
                raise RuntimeError(f"Missing PLAYER_ID in {output.name}")

            if df["PLAYER_ID"].duplicated().any():
                raise RuntimeError(
                    f"Duplicate player IDs in {output.name}; "
                    "inspect the data before continuing."
                )

            df["league"] = league
            df["season"] = season

            df.to_csv(output, index=False)
            print(f"Saved {output.name}: {len(df)} players")


if __name__ == "__main__":
    main()