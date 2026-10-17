"""Reproduce research artifacts without running Streamlit or contacting the network."""
import hashlib
import json
from pathlib import Path

import pandas as pd

from comparison_ui import player_token
from research_models import prepare_lab, rank_models, comparison_summary, bootstrap_games, MODEL_NOTES
from research_review import make_packet, PACKET_VERSION
from similarity_v3 import build_profiles, MODEL_VERSION

ROOT = Path(__file__).resolve().parent


def main():
    output = ROOT / 'research'
    players, profiles, _ = build_profiles(pd.read_csv(ROOT / 'data' / 'player_seasons.csv'))
    lab = prepare_lab(players, profiles)
    lab['coverage'].to_csv(output / 'coverage.csv', index=False)
    all_summaries, examples = [], []
    names = {"A'ja Wilson", 'Caitlin Clark', 'Stephen Curry', 'LeBron James', 'Nikola Jokić'}
    for source, player in players.iterrows():
        pool = players.index[players.league.ne(player.league) & players.GP.ge(40 if player.league == 'WNBA' else 20)]
        rankings = rank_models(players, profiles, source, pool, lab)
        summary = comparison_summary(players, rankings)
        summary['Source'] = player_token(player)
        summary['League'] = player.league
        all_summaries.append(summary)
        if player.PLAYER_NAME in names:
            for name, scores in rankings.items():
                for rank, (candidate, distance) in enumerate(scores.head(5).items(), 1):
                    examples.append({'Source': player.PLAYER_NAME, 'Model': name, 'Rank': rank,
                                     'Match': players.loc[candidate, 'PLAYER_NAME'], 'Distance': distance})
    summaries = pd.concat(all_summaries, ignore_index=True)
    summaries.to_csv(output / 'all_player_comparisons.csv', index=False)
    summaries.groupby(['League', 'Model']).agg(
        same_first_match=('Same first match', 'mean'), mean_top5_overlap=('Top-five overlap', 'mean'),
        sources=('Source', 'count')).to_csv(output / 'model_agreement.csv')
    pd.DataFrame(examples).to_csv(output / 'example_rankings.csv', index=False)
    # Fixed split and blind packet. Never silently replace human evaluation artifacts.
    packet, manifest = make_packet(players, profiles, lab)
    for filename, frame in [('review_packet.csv', packet), ('review_manifest.csv', manifest)]:
        path = output / filename
        if not path.exists():
            frame.to_csv(path, index=False)
        else:
            existing = pd.read_csv(path).fillna('').astype(str)
            if not existing.equals(frame.fillna('').astype(str)):
                raise ValueError('Frozen review packet would change. Create a new version explicitly.')
    for name in ["A'ja Wilson", 'Caitlin Clark']:
        source = players.index[players.PLAYER_NAME.eq(name)][0]
        pool = players.index[players.league.eq('NBA') & players.GP.ge(40)]
        summary, ranges, metadata = bootstrap_games(players, source, pool, lab, repetitions=500)
        stem = 'wilson' if name.startswith("A'ja") else 'clark'
        summary.to_csv(output / f'{stem}_bootstrap.csv', index=False)
        ranges.to_csv(output / f'{stem}_intervals.csv', index=False)
        (output / f'{stem}_bootstrap.json').write_text(json.dumps(metadata, indent=2) + '\n')
    metadata = {'model_version': MODEL_VERSION, 'packet_version': PACKET_VERSION,
                'player_data_sha256': hashlib.sha256((ROOT / 'data' / 'player_seasons.csv').read_bytes()).hexdigest(),
                'models': MODEL_NOTES, 'human_judgments': 0,
                'research_code_sha256': {name: hashlib.sha256((ROOT / name).read_bytes()).hexdigest()
                                         for name in ['research_models.py', 'research_review.py']},
                'interpretation': 'Model agreement is not accuracy. Human evaluation remains pending.'}
    (output / 'run_manifest.json').write_text(json.dumps(metadata, indent=2) + '\n')
    print(f'OK: {len(players)} source players; {len(MODEL_NOTES)} models; {len(packet)} blind tasks; 500-draw Wilson/Clark bootstrap.')


if __name__ == '__main__':
    main()
