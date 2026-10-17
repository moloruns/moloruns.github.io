"""Frozen, model-blinded review packets and honest evaluation of human judgments."""
import hashlib

import numpy as np
import pandas as pd
from sklearn.metrics import ndcg_score

from comparison_ui import player_token
from research_models import rank_models

PACKET_VERSION = 'review-2026-10-17-v1'
RATING_GUIDE = '0 = poor match; 1 = weak; 2 = plausible; 3 = strong statistical-style match. Judge resemblance, not equal talent.'


def stable_hash(text):
    return hashlib.sha256(text.encode()).hexdigest()


def make_packet(players, profiles, lab):
    """Four fixed sources per league/role; one source per stratum is held out."""
    tokens = players.apply(player_token, axis=1)
    rows, manifest = [], []
    for _, group in players.groupby(['league', 'role'], sort=True):
        sources = sorted(group.index, key=lambda i: stable_hash(PACKET_VERSION + tokens[i]))[:4]
        for position, source in enumerate(sources):
            league = players.loc[source, 'league']
            pool = players.index[players.league.ne(league) & players.GP.ge(40 if league == 'WNBA' else 20)]
            rankings = rank_models(players, profiles, source, pool, lab)
            chosen = set()
            for scores in rankings.values():
                chosen.update(scores.head(5).index)
            controls = sorted(set(pool) - chosen, key=lambda i: stable_hash(tokens[source] + tokens[i]))[:5]
            chosen.update(controls)
            for candidate in sorted(chosen, key=lambda i: stable_hash('order' + tokens[source] + tokens[i])):
                task_id = stable_hash(PACKET_VERSION + tokens[source] + tokens[candidate])[:20]
                rows.append({'task_id': task_id, 'source': tokens[source], 'candidate': tokens[candidate],
                             'source_name': players.loc[source, 'PLAYER_NAME'], 'candidate_name': players.loc[candidate, 'PLAYER_NAME'],
                             'reviewer': '', 'rating': '', 'rationale': ''})
            manifest.append({'source': tokens[source], 'source_name': players.loc[source, 'PLAYER_NAME'],
                             'split': 'holdout' if position == 0 else 'development'})
    return pd.DataFrame(rows), pd.DataFrame(manifest)


def validate_labels(labels, packet):
    required = {'task_id', 'source', 'candidate', 'reviewer', 'rating'}
    if not required.issubset(labels):
        raise ValueError('Use the downloaded template: task_id, source, candidate, reviewer, and rating are required.')
    data = labels.copy()
    # Unfilled template rows are unjudged, never negative labels.
    data = data[data.rating.notna() & data.rating.astype(str).str.strip().ne('')].copy()
    if data.empty:
        return data
    data['rating'] = pd.to_numeric(data.rating, errors='coerce')
    if data.rating.isna().any() or not data.rating.isin([0, 1, 2, 3]).all():
        raise ValueError('Ratings must be integer grades 0, 1, 2, or 3. Leave unjudged rows blank.')
    data['reviewer'] = data.reviewer.fillna('').astype(str).str.strip()
    if data.reviewer.eq('').any():
        raise ValueError('Every judgment needs a reviewer ID or pseudonym.')
    if data.duplicated(['task_id', 'reviewer']).any():
        raise ValueError('Duplicate task/reviewer judgments. Combine files without duplicate submissions.')
    expected = packet.set_index('task_id')
    if not data.task_id.isin(expected.index).all():
        raise ValueError('Unknown task IDs: use this frozen packet, not a different version.')
    joined = data.join(expected[['source', 'candidate']], on='task_id', rsuffix='_expected')
    if not (joined.source.eq(joined.source_expected) & joined.candidate.eq(joined.candidate_expected)).all():
        raise ValueError('A task ID does not match its source/candidate pair.')
    return data


def evaluate_labels(players, profiles, lab, packet, manifest, labels, split='development'):
    data = validate_labels(labels, packet)
    if data.empty:
        return pd.DataFrame(), {'judgments': 0, 'complete_sources': 0, 'skipped_sources': 0, 'paired_tasks': 0, 'mean_grade_gap': None}
    tokens = {player_token(p): i for i, p in players.iterrows()}
    allowed = set(manifest.loc[manifest.split.eq(split), 'source'])
    data = data[data.source.isin(allowed)]
    rows, complete, skipped = [], 0, 0
    for source_token in sorted(allowed):
        tasks = packet[packet.source.eq(source_token)]
        judged = data[data.source.eq(source_token)]
        grades = judged.groupby('task_id').rating.mean().reindex(tasks.task_id)
        if grades.isna().any():
            skipped += 1
            continue
        complete += 1
        candidates = [tokens[t] for t in tasks.candidate]
        relevance = pd.Series(grades.to_numpy(), index=candidates)
        ranked = rank_models(players, profiles, tokens[source_token], candidates, lab)
        reviewers_per_pair = judged.groupby('task_id').reviewer.nunique()
        for name, scores in ranked.items():
            if len(scores) != len(candidates):
                continue  # Never compare models on differing judged pools.
            k = min(5, len(candidates))
            ndcg = float(ndcg_score(relevance.to_numpy()[None, :], -scores.reindex(candidates).to_numpy()[None, :], k=k)) if relevance.sum() else np.nan
            rows.append({'Model': name, 'Source': source_token, 'NDCG@5': ndcg,
                         'Plausible@5': float((relevance.loc[scores.head(k).index] >= 2).mean()),
                         'Minimum reviewers per pair': int(reviewers_per_pair.min())})
    gaps = [float(g.rating.max() - g.rating.min()) for _, g in data.groupby('task_id') if g.reviewer.nunique() >= 2]
    metadata = {'judgments': len(data), 'complete_sources': complete, 'skipped_sources': skipped,
                'paired_tasks': len(gaps), 'mean_grade_gap': float(np.mean(gaps)) if gaps else None}
    if not rows:
        return pd.DataFrame(), metadata
    table = pd.DataFrame(rows).groupby('Model', sort=False).agg(
        **{'Mean NDCG@5': ('NDCG@5', 'mean'), 'Mean plausible@5': ('Plausible@5', 'mean'),
           'Sources scored': ('Source', 'nunique'), 'NDCG sources': ('NDCG@5', 'count'), 'Minimum reviewers per pair': ('Minimum reviewers per pair', 'min')}
    ).reset_index()
    return table, metadata
