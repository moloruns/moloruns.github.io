"""Alternative rankings and conditional game bootstrap; no production-model mutation."""
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.covariance import LedoitWolf

from similarity_v3 import FEATURES, FEATURE_COMPONENTS, SHOT_SELECTION, player_feature_weights

ROOT = Path(__file__).resolve().parent
ZONES = SHOT_SELECTION[:4]
COUNTS = ['PTS', 'AST', 'REB', 'STL', 'BLK', 'TOV']
GAME_FIELDS = ['MIN', *COUNTS, 'FGA', 'FTA', 'FG3A']
GAME_FEATURES = [f'{f} / 36' for f in COUNTS] + ['True shooting', '3PA / FGA', 'FTA / FGA']
MODEL_NOTES = {
    'Current model': 'The unchanged v3 ranking, including role-specific and adaptive defensive weights.',
    'League z-score': 'Equal feature weights on league-standardized raw v3 inputs; no regression or percentile blend.',
    'Per-36 baseline': 'Equal-weight league z-scores; points, assists, turnovers, steals, and blocks use per-36 rates.',
    'Per-100 possessions': 'Equal-weight league z-scores; counting features use official season totals / on-court possessions × 100. No pace approximation.',
    'Fixed components': 'The v3 profiles and within-component role weights, with defense fixed at 25%.',
    'Covariance adjusted': 'Mahalanobis distance on v3 profiles. Separate Ledoit–Wolf covariance estimates per league are averaged before inversion; no v3 feature weights.',
    'Hellinger shooting': 'V3 outside shooting. Four location shares are one Hellinger distribution distance with 80% of the shooting budget; FTA/FGA retains 20%. This changes the block scale as well as geometry.',
    'Game-rate baseline': 'Equal-weight league z-scores of six per-36 counts, true shooting, 3PA/FGA, and FTA/FGA, aggregated from game logs. This is the bootstrap model.',
}
for component in dict.fromkeys(FEATURE_COMPONENTS.values()):
    MODEL_NOTES[f'Without {component.lower()}'] = f'V3 with {component.lower()} removed; remaining pair weights renormalized.'


def league_standardize(values, leagues):
    result = pd.DataFrame(index=values.index, columns=values.columns, dtype=float)
    parameters = {}
    for league in leagues.unique():
        group = values.loc[leagues.eq(league)]
        mean = group.mean()
        scale = group.std(ddof=0).replace(0, 1)
        result.loc[group.index] = (group - mean) / scale
        parameters[league] = (mean.to_numpy(), scale.to_numpy())
    return result, parameters


def game_features(totals):
    """Accept last-axis game sums; ratios of sums preserve within-game covariation."""
    totals = np.asarray(totals, dtype=float)
    minute = totals[..., 0]
    pts = totals[..., 1]
    fga, fta, fg3a = totals[..., 7], totals[..., 8], totals[..., 9]
    with np.errstate(divide='ignore', invalid='ignore'):
        rates = totals[..., 1:7] / minute[..., None] * 36
        ratios = np.stack([pts / (2 * (fga + .44 * fta)), fg3a / fga, fta / fga], axis=-1)
    return np.concatenate([rates, ratios], axis=-1)


def load_games():
    frames = []
    for league, season in [('NBA', '2024-25'), ('WNBA', '2025')]:
        path = ROOT / 'research' / 'game_logs' / f'{league}_{season}.csv'
        if not path.exists():
            raise ValueError('Game logs are missing. Run download_game_logs.py locally.')
        frames.append(pd.read_csv(path, dtype={'GAME_ID': str, 'season': str}))
    games = pd.concat(frames, ignore_index=True)
    if games.duplicated(['league', 'season', 'PLAYER_ID', 'GAME_ID']).any():
        raise ValueError('Duplicate player games found.')
    values = games[GAME_FIELDS].to_numpy(dtype=float)
    if not np.isfinite(values).all() or (values < 0).any():
        raise ValueError('Game logs contain invalid count/minute values.')
    return games


def prepare_lab(players, profiles):
    weights = np.stack([player_feature_weights(p).to_numpy() for _, p in players.iterrows()])
    fixed = []
    for _, p in players.iterrows():
        row = p.copy()
        row['DEFENSE_WEIGHT'] = .25
        fixed.append(player_feature_weights(row).to_numpy())
    frames = {'League z-score': league_standardize(players[FEATURES], players.league)[0]}
    rates = players[FEATURES].copy()
    for field in ['PTS', 'AST', 'TOV']:
        rates[field] = players[field] / players.MIN * 36
    frames['Per-36 baseline'] = league_standardize(rates, players.league)[0]
    possession_values = rates.copy()
    possession_rows = []
    for (league, season), group in players.groupby(['league', 'season']):
        advanced = pd.read_csv(ROOT / 'data' / 'profile_stats' / f'{league}_{season}_advanced.csv').set_index('PLAYER_ID')
        totals = pd.read_csv(ROOT / 'data' / 'profile_stats' / f'{league}_{season}_totals.csv').set_index('PLAYER_ID')
        poss = group.PLAYER_ID.map(advanced.POSS)
        if poss.isna().any() or not np.isfinite(poss).all() or (poss <= 0).any():
            raise ValueError(f'Missing or invalid on-court possessions for {league}.')
        for feature, raw in [('PTS', 'PTS'), ('AST', 'AST'), ('TOV', 'TOV'), ('STL_PER36', 'STL'), ('BLK_PER36', 'BLK')]:
            possession_values.loc[group.index, feature] = group.PLAYER_ID.map(totals[raw]) / poss * 100
        possession_rows.extend([{'Player': row.PLAYER_NAME, 'League': league, 'Possessions': float(poss.loc[i])}
                                for i, row in group.iterrows()])
    if not np.isfinite(possession_values.to_numpy()).all():
        raise ValueError('Incomplete per-possession inputs.')
    frames['Per-100 possessions'] = league_standardize(possession_values, players.league)[0]
    covariance = np.mean([LedoitWolf().fit(profiles.loc[g.index, FEATURES]).covariance_
                          for _, g in players.groupby('league')], axis=0)
    precision = np.linalg.inv(covariance)
    games = load_games()
    groups = {key: frame for key, frame in games.groupby(['league', 'season', 'PLAYER_ID'])}
    arrays, rows, coverage = {}, {}, []
    for index, player in players.iterrows():
        frame = groups.get((player.league, str(player.season), player.PLAYER_ID))
        count = 0 if frame is None else len(frame)
        complete = count == int(player.GP)
        if complete:
            array = frame.sort_values('GAME_ID')[GAME_FIELDS].to_numpy(dtype=float)
            features = game_features(array.sum(axis=0))
            complete = np.isfinite(features).all()
            if complete:
                arrays[index], rows[index] = array, features
        coverage.append({'Player': player.PLAYER_NAME, 'League': player.league,
                         'Expected games': int(player.GP), 'Collected games': count, 'Complete': bool(complete)})
    game_raw = pd.DataFrame.from_dict(rows, orient='index', columns=GAME_FEATURES).sort_index()
    game_z, game_parameters = league_standardize(game_raw, players.loc[game_raw.index, 'league'])
    frames['Game-rate baseline'] = game_z.reindex(players.index)
    return {'frames': frames, 'weights': pd.DataFrame(weights, index=players.index, columns=FEATURES),
            'fixed': pd.DataFrame(fixed, index=players.index, columns=FEATURES), 'precision': precision,
            'games': arrays, 'game_raw': game_raw, 'game_parameters': game_parameters,
            'coverage': pd.DataFrame(coverage), 'possessions': pd.DataFrame(possession_rows)}


def rank_models(players, profiles, source, candidates, lab):
    if not len(candidates):
        raise ValueError('No candidates in this pool.')
    indices = pd.Index(candidates)
    delta = profiles.loc[indices, FEATURES].to_numpy() - profiles.loc[source, FEATURES].to_numpy()
    squared = delta ** 2
    weights = (lab['weights'].loc[indices].to_numpy() + lab['weights'].loc[source].to_numpy()) / 2
    scores = {'Current model': (weights * squared).sum(axis=1)}
    fixed = (lab['fixed'].loc[indices].to_numpy() + lab['fixed'].loc[source].to_numpy()) / 2
    scores['Fixed components'] = (fixed * squared).sum(axis=1)
    for name, frame in lab['frames'].items():
        values = frame.loc[indices].to_numpy() - frame.loc[source].to_numpy()
        scores[name] = np.mean(values ** 2, axis=1)
    scores['Covariance adjusted'] = np.einsum('ij,jk,ik->i', delta, lab['precision'], delta) / len(FEATURES)
    shooting_mask = np.array([f in ZONES for f in FEATURES])
    h_squared = .5 * ((np.sqrt(players.loc[indices, ZONES].to_numpy()) - np.sqrt(players.loc[source, ZONES].to_numpy(dtype=float))) ** 2).sum(axis=1)
    scores['Hellinger shooting'] = (weights[:, ~shooting_mask] * squared[:, ~shooting_mask]).sum(axis=1) + weights[:, shooting_mask].sum(axis=1) * h_squared
    for component in dict.fromkeys(FEATURE_COMPONENTS.values()):
        mask = np.array([FEATURE_COMPONENTS[f] != component for f in FEATURES])
        kept = weights[:, mask]
        scores[f'Without {component.lower()}'] = (kept * squared[:, mask]).sum(axis=1) / kept.sum(axis=1)
    return {name: pd.Series(np.sqrt(np.maximum(score, 0)), index=indices, name='Distance').dropna().sort_values(kind='stable')
            for name, score in scores.items()}


def comparison_summary(players, rankings):
    baseline = rankings['Current model'].head(5).index
    rows = []
    for name, scores in rankings.items():
        if scores.empty:
            continue
        rows.append({'Model': name, 'First match': players.loc[scores.index[0], 'PLAYER_NAME'],
                     'Same first match': scores.index[0] == baseline[0],
                     'Top-five overlap': len(set(scores.head(5).index) & set(baseline)),
                     'Candidates scored': len(scores)})
    return pd.DataFrame(rows)


def bootstrap_games(players, source, candidates, lab, repetitions=300, seed=20261017):
    """Conditional independent-player game bootstrap on the nine-feature rate baseline."""
    if source not in lab['games']:
        raise ValueError('The source player does not have complete game coverage.')
    if not 50 <= repetitions <= 2000:
        raise ValueError('Use 50–2000 bootstrap repetitions.')
    eligible = sorted(i for i in candidates if i in lab['games'])
    if not eligible:
        raise ValueError('No counterparts have complete game coverage.')
    rng = np.random.default_rng(seed)
    sampled = {}
    for index in [source, *eligible]:
        games = lab['games'][index]
        picks = rng.integers(0, len(games), size=(repetitions, len(games)))
        sampled[index] = game_features(games[picks].sum(axis=1))
    source_mean, source_scale = lab['game_parameters'][players.loc[source, 'league']]
    source_values = (sampled[source] - source_mean) / source_scale
    distances = []
    for index in eligible:
        mean, scale = lab['game_parameters'][players.loc[index, 'league']]
        candidate_values = (sampled[index] - mean) / scale
        distances.append(np.mean((candidate_values - source_values) ** 2, axis=1))
    distances = np.stack(distances, axis=1)
    valid = np.isfinite(distances).all(axis=1)
    distances = distances[valid]
    if len(distances) < max(30, repetitions // 2):
        raise ValueError('Too many resamples had undefined shooting ratios. No uncertainty summary is reported.')
    order = np.argsort(distances, axis=1, kind='stable')
    ranks = np.argsort(order, axis=1) + 1
    summary = pd.DataFrame({
        'Player': players.loc[eligible, 'PLAYER_NAME'].to_numpy(),
        'First-match frequency (%)': (ranks == 1).mean(axis=0) * 100,
        'Top-five frequency (%)': (ranks <= min(5, len(eligible))).mean(axis=0) * 100,
        'Median rank': np.median(ranks, axis=0),
        'Rank 2.5%': np.quantile(ranks, .025, axis=0),
        'Rank 97.5%': np.quantile(ranks, .975, axis=0),
    }).sort_values(['First-match frequency (%)', 'Median rank'], ascending=[False, True])
    ranges = pd.DataFrame({'Feature': GAME_FEATURES, 'Season estimate': lab['game_raw'].loc[source].to_numpy(),
                           'Bootstrap 2.5%': np.quantile(sampled[source][valid], .025, axis=0),
                           'Bootstrap 97.5%': np.quantile(sampled[source][valid], .975, axis=0)})
    return summary, ranges, {'requested': repetitions, 'valid': int(valid.sum()), 'excluded_candidates': len(candidates) - len(eligible),
                             'source_games': len(lab['games'][source]), 'seed': seed}
