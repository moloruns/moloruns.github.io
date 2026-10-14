import json
import time
from pathlib import Path

import pandas as pd
from nba_api.stats.endpoints import leaguedashplayershotlocations


ROOT = Path(__file__).resolve().parent
OUTPUT_DIR = ROOT / "data" / "shot_locations"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

SEASONS = {
    "NBA": ("00", "2024-25"),
    "WNBA": ("10", "2025"),
}


def flatten_shot_locations(payload):
    """
    Parse the grouped 'By Zone' headers.

    Fail explicitly if the response structure differs from what
    this parser understands.
    """
    result_sets = payload.get("resultSets")

    if isinstance(result_sets, dict):
        result_sets = [result_sets]

    if not isinstance(result_sets, list):
        raise ValueError("Unexpected resultSets structure.")

    for result in result_sets:
        headers = result.get("headers", [])

        if not headers or not isinstance(headers[0], dict):
            continue

        zone_header = next(
            (
                header
                for header in headers
                if header.get("name") == "SHOT_CATEGORY"
            ),
            None,
        )

        columns_header = next(
            (
                header
                for header in headers
                if header.get("name") == "columns"
            ),
            None,
        )

        if zone_header is None or columns_header is None:
            continue

        zones = zone_header["columnNames"]
        skip = int(zone_header["columnsToSkip"])
        span = int(zone_header["columnSpan"])

        original_columns = columns_header["columnNames"]

        expected_count = skip + len(zones) * span

        if len(original_columns) != expected_count:
            raise ValueError(
                "Unexpected header length. Inspect the saved JSON "
                "before changing the parser."
            )

        columns = list(original_columns[:skip])

        for zone_index, zone in enumerate(zones):
            start = skip + zone_index * span
            metrics = original_columns[start:start + span]

            if "FGA" not in metrics:
                raise ValueError(
                    f"No FGA field found for zone {zone!r}."
                )

            columns.extend(
                f"{zone}__{metric}"
                for metric in metrics
            )

        rows = result.get("rowSet", [])

        if not rows:
            raise ValueError("The endpoint returned no player rows.")

        if any(len(row) != len(columns) for row in rows):
            raise ValueError("A row does not match the header length.")

        if len(columns) != len(set(columns)):
            raise ValueError("Flattened column names are not unique.")

        return pd.DataFrame(rows, columns=columns)

    raise ValueError(
        "Could not locate the grouped shooting-zone table. "
        "Inspect the headers in the saved JSON."
    )


def download_league(league, league_id, season):
    raw_path = OUTPUT_DIR / f"{league}_{season}_raw.json"
    csv_path = OUTPUT_DIR / f"{league}_{season}_zones.csv"

    if raw_path.exists():
        print(f"Using cached response: {raw_path.name}")
        payload = json.loads(raw_path.read_text(encoding="utf-8"))
    else:
        print(f"Downloading {league} {season} shooting zones...")
        time.sleep(3)

        response = (
            leaguedashplayershotlocations.LeagueDashPlayerShotLocations(
                league_id_nullable=league_id,
                season=season,
                season_type_all_star="Regular Season",
                distance_range="By Zone",
                measure_type_simple="Base",
                per_mode_detailed="Totals",
                timeout=60,
            )
        )

        payload = response.get_dict()

        raw_path.write_text(
            json.dumps(payload, indent=2),
            encoding="utf-8",
        )

    df = flatten_shot_locations(payload)

    if "PLAYER_ID" not in df.columns:
        raise ValueError("The shooting table has no PLAYER_ID.")

    if df["PLAYER_ID"].duplicated().any():
        raise ValueError(
            "Duplicate player IDs found. Inspect whether these are "
            "team stints before aggregating."
        )

    df["league"] = league
    df["season"] = season

    df.to_csv(csv_path, index=False)

    attempt_columns = [
        column
        for column in df.columns
        if column.endswith("__FGA")
    ]

    print(f"\nSaved {csv_path.name}: {len(df)} players")
    print("\nAttempt columns:")
    for column in attempt_columns:
        print(f"  {column}")

    print("\nPreview:")
    print(
        df[
            ["PLAYER_NAME"] + attempt_columns
        ].head().to_string(index=False)
    )


def main():
    for league, (league_id, season) in SEASONS.items():
        try:
            download_league(league, league_id, season)
        except Exception as exc:
            print(f"\nCould not complete {league}: {exc}")
            print(
                "Stopping rather than making repeated requests. "
                "Any successfully saved files remain available."
            )
            return


if __name__ == "__main__":
    main()