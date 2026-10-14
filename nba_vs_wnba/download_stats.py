from pathlib import Path
import time

from nba_api.stats.endpoints import leaguedashplayerstats

DATA_DIR = Path("data")
DATA_DIR.mkdir(exist_ok=True)


def download_player_stats(league, season, measure="Base"):
    league_ids = {
        "NBA": "00",
        "WNBA": "10",
    }

    output = DATA_DIR / f"{league}_{season}_{measure}.csv"

    # Reuse saved data instead of requesting it repeatedly.
    if output.exists():
        print(f"Already downloaded: {output}")
        return

    result = leaguedashplayerstats.LeagueDashPlayerStats(
        league_id_nullable=league_ids[league],
        season=season,
        season_type_all_star="Regular Season",
        per_mode_detailed="PerGame",
        measure_type_detailed_defense=measure,
        timeout=60,
    )

    df = result.get_data_frames()[0]

    if df.empty:
        raise ValueError(
            f"No rows returned for {league}, {season}, {measure}"
        )

    df["league"] = league
    df["season"] = season
    df.to_csv(output, index=False)

    print(f"Saved {len(df)} rows to {output}")
    print(df.head())


download_player_stats("NBA", "2024-25", measure="Advanced")

time.sleep(3)

download_player_stats("WNBA", "2025", measure="Advanced")
