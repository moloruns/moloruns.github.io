"""Collect regular-season player games locally; never called by the web app."""
import argparse
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd
from nba_api.stats.endpoints import leaguegamelog

ROOT = Path(__file__).resolve().parent


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--refresh', action='store_true')
    args = parser.parse_args()
    output = ROOT / 'research' / 'game_logs'
    output.mkdir(parents=True, exist_ok=True)
    for league, league_id, season in [('NBA', '00', '2024-25'), ('WNBA', '10', '2025')]:
        path = output / f'{league}_{season}.csv'
        if path.exists() and not args.refresh:
            print(f'Using {path.name}; pass --refresh to replace it.')
            continue
        try:
            data = leaguegamelog.LeagueGameLog(
                player_or_team_abbreviation='P', league_id=league_id,
                season=season, season_type_all_star='Regular Season', timeout=20,
            ).get_data_frames()[0]
            required = ['PLAYER_ID', 'GAME_ID', 'GAME_DATE', 'MIN', 'PTS', 'AST', 'REB', 'STL', 'BLK', 'TOV', 'FGA', 'FTA', 'FG3A']
            if data.empty or not set(required).issubset(data):
                raise ValueError('Empty response or missing game fields')
            if data.duplicated(['PLAYER_ID', 'GAME_ID']).any():
                raise ValueError('Duplicate player-game rows')
            data = data[required + ['PLAYER_NAME']].copy()
            data['league'], data['season'] = league, season
            temporary = path.with_suffix('.tmp')
            data.to_csv(temporary, index=False)
            temporary.replace(path)
            metadata = {'source': 'NBA Stats LeagueGameLog', 'league_id': league_id,
                        'season': season, 'season_type': 'Regular Season',
                        'retrieved_utc': datetime.now(timezone.utc).isoformat(), 'rows': len(data),
                        'sha256': hashlib.sha256(path.read_bytes()).hexdigest()}
            path.with_suffix('.json').write_text(json.dumps(metadata, indent=2) + '\n')
            print(f'Saved {path.name}: {len(data)} player games', flush=True)
        except Exception as exc:
            raise SystemExit(f'Download stopped; prior files retained. {league}: {exc}') from exc


if __name__ == '__main__':
    main()
