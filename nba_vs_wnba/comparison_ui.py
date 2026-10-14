"""Presentation helpers and exploratory diagnostics; the ranking model is unchanged."""

import math
from urllib.parse import urlencode

import numpy as np
import pandas as pd
import plotly.graph_objects as go

from similarity_v3 import FEATURES, FEATURE_LABELS, FEATURE_COMPONENTS, player_feature_weights

PUBLIC_URL = "https://nbawnba.streamlit.app/"
SHORT_LABELS = {
    "PTS": "Points", "AST": "Assists", "TOV": "Turnovers", "USG_PCT": "Usage",
    "OREB_PCT": "Off. reb.", "RIM_RATE": "At rim", "PAINT_NON_RA_RATE": "Paint",
    "MIDRANGE_RATE": "Midrange", "THREE_ZONE_RATE": "3PT share", "FT_RATE": "FT rate",
    "TS_PCT": "True shooting", "STL_PER36": "Steals / 36", "BLK_PER36": "Blocks / 36",
    "DREB_PCT": "Def. reb.",
}
STAT_NAMES = {
    "GP": "Games played", "MIN": "Minutes", "PTS": "Points", "REB": "Rebounds",
    "OREB": "Offensive rebounds", "DREB": "Defensive rebounds", "AST": "Assists",
    "STL": "Steals", "BLK": "Blocks", "TOV": "Turnovers", "PF": "Personal fouls",
    "FGM": "Field goals made", "FGA": "Field goals attempted", "FG_PCT": "Field goal %",
    "FG3M": "Three-pointers made", "FG3A": "Three-pointers attempted", "FG3_PCT": "Three-point %",
    "FTM": "Free throws made", "FTA": "Free throws attempted", "FT_PCT": "Free throw %",
    "PLUS_MINUS": "Plus / minus", "OFF_RATING": "Offensive rating", "DEF_RATING": "Defensive rating",
    "NET_RATING": "Net rating", "AST_PCT": "Assist %", "AST_TOV": "Assist / turnover ratio",
    "AST_RATIO": "Assist ratio", "OREB_PCT": "Offensive rebound %", "DREB_PCT": "Defensive rebound %",
    "REB_PCT": "Rebound %", "TM_TOV_PCT": "Turnover %", "EFG_PCT": "Effective field goal %",
    "TS_PCT": "True shooting %", "USG_PCT": "Usage %", "PACE": "Pace", "PIE": "Player impact estimate %",
}


def player_token(player):
    return f"{player['league']}:{player['season']}:{int(player['PLAYER_ID'])}"


def resolve_player(players, token):
    matches = players.index[players.apply(player_token, axis=1).eq(token)]
    return int(matches[0]) if len(matches) == 1 else None


def parse_comparison_query(players, query):
    """Validate shared links before their values reach Streamlit widgets."""
    if not query.get("source"):
        return None
    source = resolve_player(players, query["source"])
    if source is None:
        raise ValueError("This link's searched player is not in the available seasons.")
    player = players.loc[source]
    default_games = 40 if player['league'] == 'WNBA' else 20
    limits = {"n": (5, 1, 10), "games": (default_games, 0, 1000),
              "mpg": (0, 0, 100), "minutes": (0, 0, 100000)}
    values = {}
    for key, (default, low, high) in limits.items():
        try:
            value = float(query.get(key, default))
        except (TypeError, ValueError):
            raise ValueError(f"The shared link has an invalid {key} filter.") from None
        if not math.isfinite(value) or not low <= value <= high or (key != 'mpg' and not value.is_integer()):
            raise ValueError(f"The shared link has an invalid {key} filter.")
        values[key] = value if key == 'mpg' else int(value)
    if query.get('role', 'all') not in ('all', 'same'):
        raise ValueError("The shared link has an invalid role filter.")
    against = None
    if query.get('against'):
        against = resolve_player(players, query['against'])
        if against is None or players.loc[against, 'league'] == player['league']:
            raise ValueError("The shared counterpart must be an eligible player in the other league.")
    return source, against, {**values, 'same_role': query.get('role') == 'same'}


def comparison_query(source, against, filters):
    result = {
        'source': player_token(source), 'role': 'same' if filters['same_role'] else 'all',
        'n': str(filters['n']), 'games': str(filters['games']),
        'mpg': str(filters['mpg']), 'minutes': str(filters['minutes']),
    }
    if against is not None:
        result['against'] = player_token(against)
    return result


def comparison_url(query):
    return PUBLIC_URL + '?' + urlencode(query)


def profile_chart(players, profiles, left, right, overview=True):
    """Display-only percentiles; component means are explicitly not ratings."""
    ranks = profiles[FEATURES].rank(pct=True) * 100
    groups = {
        'Production': [f for f in FEATURES if FEATURE_COMPONENTS[f] == 'Offensive production'],
        'Shot selection': [f for f in FEATURES if FEATURE_COMPONENTS[f] == 'Shot selection'],
        'Efficiency': ['TS_PCT'],
        'Defense / reb.': [f for f in FEATURES if FEATURE_COMPONENTS[f] == 'Defense'],
    }
    labels = list(groups) if overview else [SHORT_LABELS[f] for f in FEATURES]
    fig = go.Figure()
    for index, color, symbol in [(left, '#0284c7', 'circle'), (right, '#e11d48', 'diamond')]:
        values = [ranks.loc[index, fs].mean() for fs in groups.values()] if overview else ranks.loc[index].tolist()
        full = list(groups) if overview else [FEATURE_LABELS[f] for f in FEATURES]
        fig.add_trace(go.Scatter(
            x=values, y=labels, mode='markers', name=players.loc[index, 'PLAYER_NAME'],
            marker={'size': 12, 'color': color, 'symbol': symbol, 'line': {'width': 1, 'color': 'white'}},
            customdata=full,
            hovertemplate='<b>%{customdata}</b><br>Display percentile: %{x:.1f}<extra>%{fullData.name}</extra>',
        ))
    fig.update_layout(
        height=270 if overview else 570, margin={'l': 0, 'r': 18, 't': 15, 'b': 65},
        xaxis={'range': [-3, 103], 'tickvals': [0, 25, 50, 75, 100], 'title': 'Model-profile percentile', 'fixedrange': True},
        yaxis={'autorange': 'reversed', 'automargin': True, 'fixedrange': True},
        legend={'orientation': 'h', 'y': -0.3 if overview else -0.14, 'x': 0},
    )
    return fig


def sensitivity_results(players, profiles, source_index, candidates):
    """Eight one-at-a-time ±20% perturbations plus a fixed-defense baseline."""
    source = players.loc[source_index]
    pair_weights = np.stack([
        ((player_feature_weights(source) + player_feature_weights(c)) / 2).to_numpy()
        for _, c in candidates.iterrows()
    ])
    squared = (profiles.loc[candidates.index, FEATURES].to_numpy() - profiles.loc[source_index, FEATURES].to_numpy()) ** 2
    base_order = np.argsort((pair_weights * squared).sum(axis=1), kind='stable')
    base_top = candidates.iloc[base_order[0]]['PLAYER_NAME']
    top_set = set(candidates.index[base_order[:5]])
    rows = []
    for component in dict.fromkeys(FEATURE_COMPONENTS.values()):
        for factor in (0.8, 1.2):
            weights = pair_weights * np.array([factor if FEATURE_COMPONENTS[f] == component else 1 for f in FEATURES])
            weights /= weights.sum(axis=1, keepdims=True)
            order = np.argsort((weights * squared).sum(axis=1), kind='stable')
            rows.append({'Experiment': f'{component} {"−" if factor < 1 else "+"}20%',
                         'First match': candidates.iloc[order[0]]['PLAYER_NAME'],
                         'Top-five overlap': f'{len(top_set & set(candidates.index[order[:5]]))} / {len(top_set)}'})
    fixed_source = source.copy()
    fixed_source['DEFENSE_WEIGHT'] = 0.25
    fixed_weights = []
    for _, candidate in candidates.iterrows():
        fixed = candidate.copy()
        fixed['DEFENSE_WEIGHT'] = 0.25
        fixed_weights.append(((player_feature_weights(fixed_source) + player_feature_weights(fixed)) / 2).to_numpy())
    order = np.argsort((np.stack(fixed_weights) * squared).sum(axis=1), kind='stable')
    rows.append({'Experiment': 'Fixed 25% defense', 'First match': candidates.iloc[order[0]]['PLAYER_NAME'],
                 'Top-five overlap': f'{len(top_set & set(candidates.index[order[:5]]))} / {len(top_set)}'})
    return base_top, pd.DataFrame(rows)
