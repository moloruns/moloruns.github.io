from pathlib import Path
import time

import pandas as pd
from nba_api.stats.endpoints import (
    commonteamroster,
    leaguedashplayerstats,
)


DATA_DIR = Path("data")
CACHE_DIR = DATA_DIR / "raw"

CACHE_DIR.mkdir(parents=True, exist_ok=True)

SEASONS = {
    "NBA": {
        "league_id": "00",
        "season": "2024-25",
    },
    "WNBA": {
        "league_id": "10",
        "season": "2025",
    },
}

STAT_COLUMNS = [
    "PLAYER_ID",
    "PLAYER_NAME",
    "GP",
    "MIN",
    "PTS",
    "AST",
    "REB",
    "STL",
    "BLK",
    "TOV",
    "FGA",
    "FTA",
    "FG3A",
]

# These are starting assumptions, not definitive basketball roles.
ROLE_MAP = {
    "G": "Guard",
    "PG": "Guard",
    "SG": "Guard",
    "F": "Wing",
    "SF": "Wing",
    "PF": "Big",
    "C": "Big",
    "G-F": "Wing",
    "F-G": "Wing",
    "F-C": "Big",
    "C-F": "Big",
}


def get_season_stats(league, league_id, season):
    """Download per-game regular-season statistics, or use cached data."""
    path = CACHE_DIR / f"{league}_{season}_base.csv"

    if path.exists():
        print(f"Using cached statistics: {path}")
        return pd.read_csv(path)

    print(f"Downloading {league} {season} statistics...")
    time.sleep(3)

    response = leaguedashplayerstats.LeagueDashPlayerStats(
        league_id_nullable=league_id,
        season=season,
        season_type_all_star="Regular Season",
        per_mode_detailed="PerGame",
        measure_type_detailed_defense="Base",
        timeout=60,
    )

    stats = response.get_data_frames()[0]

    if stats.empty:
        raise RuntimeError(
            f"No statistics returned for {league} {season}."
        )

    missing = set(STAT_COLUMNS + ["TEAM_ID"]) - set(stats.columns)
    if missing:
        raise RuntimeError(f"Missing expected columns: {missing}")

    stats.to_csv(path, index=False)
    return stats


def get_positions(stats, league, league_id, season):
    """Collect player positions from the season's team rosters."""
    roster_tables = []
    consecutive_failures = 0

    team_ids = sorted(
        int(team_id)
        for team_id in stats["TEAM_ID"].dropna().unique()
        if int(team_id) > 0
    )

    for team_id in team_ids:
        path = CACHE_DIR / f"{league}_{season}_roster_{team_id}.csv"

        if path.exists():
            roster = pd.read_csv(path)
        else:
            print(f"Downloading {league} roster: {team_id}")
            time.sleep(3)

            try:
                response = commonteamroster.CommonTeamRoster(
                    team_id=team_id,
                    season=season,
                    league_id_nullable=league_id,
                    timeout=60,
                )

                roster = response.get_data_frames()[0]

                if roster.empty:
                    raise RuntimeError("Empty roster returned.")

                if not {"PLAYER_ID", "POSITION"}.issubset(roster.columns):
                    raise RuntimeError("Roster is missing position columns.")

                roster.to_csv(path, index=False)
                consecutive_failures = 0

            except Exception as exc:
                print(f"Could not retrieve roster {team_id}: {exc}")
                consecutive_failures += 1

                # Avoid repeatedly hitting an inaccessible endpoint.
                if consecutive_failures >= 2:
                    print(
                        "Stopping roster requests for this league. "
                        "Unresolved roles can be filled manually."
                    )
                    break

                continue

        roster_tables.append(roster[["PLAYER_ID", "POSITION"]])

    if not roster_tables:
        return pd.DataFrame(columns=["PLAYER_ID", "POSITION"])

    positions = pd.concat(roster_tables, ignore_index=True)

    # A traded player may appear on more than one roster.
    # Use the most frequently observed label, ignoring blank labels.
    positions["POSITION"] = (
        positions["POSITION"]
        .astype("string")
        .str.strip()
        .str.upper()
    )
    positions = positions.dropna(subset=["POSITION"])
    positions = positions[positions["POSITION"] != ""]

    positions = (
        positions.groupby("PLAYER_ID")["POSITION"]
        .agg(lambda values: values.mode().iloc[0])
        .reset_index()
    )

    return positions


def build_league_table(league, settings):
    season = settings["season"]
    league_id = settings["league_id"]

    stats = get_season_stats(league, league_id, season)

    # The model requires one row per player-season.
    # Don't silently discard duplicates or average team-stint rows.
    if stats["PLAYER_ID"].duplicated().any():
        raise RuntimeError(
            f"{league} statistics contain duplicate player IDs. "
            "Inspect the cached data before continuing."
        )

    positions = get_positions(
        stats,
        league,
        league_id,
        season,
    )

    table = stats[STAT_COLUMNS].copy()

    table = table.merge(
        positions,
        on="PLAYER_ID",
        how="left",
        validate="one_to_one",
    )

    table["league"] = league
    table["season"] = season
    table["role"] = table["POSITION"].map(ROLE_MAP)

    return table


def main():
    league_tables = [
        build_league_table(league, settings)
        for league, settings in SEASONS.items()
    ]

    players = pd.concat(league_tables, ignore_index=True)

    # Optional manual role corrections.
    overrides_path = DATA_DIR / "role_overrides.csv"

    if overrides_path.exists():
        overrides = pd.read_csv(overrides_path)

        required = {"league", "PLAYER_ID", "role"}
        if not required.issubset(overrides.columns):
            raise ValueError(
                "role_overrides.csv needs league, PLAYER_ID, and role."
            )

        if overrides.duplicated(["league", "PLAYER_ID"]).any():
            raise ValueError("Duplicate players in role_overrides.csv.")

        if not overrides["role"].isin(["Guard", "Wing", "Big"]).all():
            raise ValueError("Override roles must be Guard, Wing, or Big.")

        overrides = overrides.rename(columns={"role": "role_override"})

        players = players.merge(
            overrides[["league", "PLAYER_ID", "role_override"]],
            on=["league", "PLAYER_ID"],
            how="left",
            validate="one_to_one",
        )

        players["role"] = players["role_override"].combine_first(
            players["role"]
        )
        players = players.drop(columns="role_override")

    column_order = [
        "PLAYER_ID",
        "PLAYER_NAME",
        "league",
        "season",
        "role",
        "POSITION",
        *STAT_COLUMNS[2:],
    ]

    players = players[column_order]

    output_path = DATA_DIR / "player_seasons.csv"
    players.to_csv(output_path, index=False)

    # Keep a separate list of records needing manual role assignments.
    missing_roles = players[players["role"].isna()]
    missing_roles.to_csv(
        DATA_DIR / "players_missing_roles.csv",
        index=False,
    )

    print(f"\nSaved {len(players)} player-seasons to {output_path}")

    print("\nPlayers by league:")
    print(players.groupby("league").size())

    print("\nAssigned roles:")
    print(pd.crosstab(players["league"], players["role"]))

    if not missing_roles.empty:
        print(
            f"\nWARNING: {len(missing_roles)} players have no role. "
            "See data/players_missing_roles.csv."
        )

    print("\nPreview:")
    print(players.head().to_string(index=False))


if __name__ == "__main__":
    main()