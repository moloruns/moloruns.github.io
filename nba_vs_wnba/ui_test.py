"""Behavior checks for share links, filters, navigation, and exploratory weights."""
from pathlib import Path

import numpy as np
import pandas as pd
from streamlit.testing.v1 import AppTest

from comparison_ui import parse_comparison_query, sensitivity_results
from similarity_v3 import build_profiles, comparison_breakdown, find_counterparts

ROOT = Path(__file__).resolve().parent
APP = str(ROOT / 'app.py')


def check(app):
    assert not app.exception, [e.value for e in app.exception]
    assert not app.error, [e.value for e in app.error]


def search(app, name):
    label = next(o for o in app.selectbox[0].options if o.startswith(name + ' —'))
    app.selectbox[0].select(label).run()
    check(app)


at = AppTest.from_file(APP, default_timeout=180).run()
next(b for b in at.button if b.label == "Try A'ja Wilson").click().run()
check(at)
assert any('Anthony Davis' in h.value for h in at.subheader)
# Manual selection survives fresh-session share links, even outside the ranked list.
manual = at.selectbox[1].options[-1]
at.selectbox[1].select(manual).run()
check(at)
shared = dict(at.query_params)
fresh = AppTest.from_file(APP, default_timeout=180)
fresh.query_params.update(shared)
fresh.run()
check(fresh)
assert fresh.selectbox[1].format_func(fresh.selectbox[1].value) == manual
assert fresh.selectbox[0].format_func(fresh.selectbox[0].value).startswith("A'ja Wilson")
# A profile URL opened in another session carries its comparison context back.
next(b for b in fresh.button if str(b.key).startswith('open_profile_button_')).click().run()
check(fresh)
profile = AppTest.from_file(APP, default_timeout=180)
profile.query_params.update(dict(fresh.query_params))
profile.run()
check(profile)
profile.button[0].click().run()
check(profile)
assert profile.selectbox[1].format_func(profile.selectbox[1].value) == manual
# Role changes visibly select the first result in the new pool.
search(at, 'LeBron James')
assert 'Sabrina Ionescu' in next(b.label for b in at.button if str(b.key).startswith('select_comparison_button_'))
at.checkbox(key='same_role_v3_WNBA').check().run()
check(at)
assert any('LeBron James vs. Nneka Ogwumike' == h.value for h in at.subheader)
at.slider[0].set_value(3).run()
at.number_input[1].set_value(15.0).run()
at.number_input[2].set_value(500).run()
filtered = AppTest.from_file(APP, default_timeout=180)
filtered.query_params.update(dict(at.query_params))
filtered.run()
check(filtered)
assert filtered.checkbox(key='same_role_v3_WNBA').value
assert filtered.slider[0].value == 3
assert filtered.number_input[1].value == 15.0
assert filtered.number_input[2].value == 500
# Empty results remain recoverable and do not crash shared links.
at.number_input[0].set_value(1000).run()
check(at)
assert any('No counterparts' in x.value for x in at.info)
empty = AppTest.from_file(APP, default_timeout=180)
empty.query_params.update(dict(at.query_params))
empty.run()
check(empty)
assert any('No counterparts' in x.value for x in empty.info)
at.number_input[0].set_value(20).run()
search(at, 'Caitlin Clark')
assert any('13 games' in x.value for x in at.warning)
original_matches = [b.label for b in at.button if str(b.key).startswith('select_comparison_button_')]
at.checkbox(key='show_sensitivity').check().run()
check(at)
assert any('7 of 8' in x.value for x in at.markdown)
assert original_matches == [b.label for b in at.button if str(b.key).startswith('select_comparison_button_')]
# Invalid URL data must produce a recoverable message, never widget exceptions.
for query in [{'source': 'unknown'}, {'source': 'WNBA:2025:1628932', 'mpg': 'nan'},
              {'source': 'WNBA:2025:1628932', 'n': '1.5'},
              {'source': 'WNBA:2025:1628932', 'against': 'WNBA:2025:1628932'}]:
    bad = AppTest.from_file(APP, default_timeout=180)
    bad.query_params.update(query)
    bad.run()
    check(bad)
    assert bad.warning

players, profiles, _ = build_profiles(pd.read_csv(ROOT / 'data/player_seasons.csv'))
source = players[players.PLAYER_NAME.eq('Caitlin Clark')].iloc[0]
results = find_counterparts(players, profiles, source.PLAYER_ID, source.league, n=len(players), min_games=40)
base, variations = sensitivity_results(players, profiles, source.name, players.loc[results.index])
assert base == 'James Harden'
assert variations.loc[variations.Experiment.eq('Efficiency +20%'), 'First match'].item() == 'LaMelo Ball'
# Independently recompute one perturbed ranking from the public distance breakdown.
scores = {}
for index in results.index:
    detail, distance = comparison_breakdown(players, profiles, source.name, index)
    multiplier = np.where(detail.Component.eq('Efficiency'), 1.2, 1.0)
    scores[index] = (detail['Weighted squared difference'] * multiplier).sum() / (detail.Weight * multiplier).sum()
expected = players.loc[min(scores, key=scores.get), 'PLAYER_NAME']
assert variations.loc[variations.Experiment.eq('Efficiency +20%'), 'First match'].item() == expected
print('OK: examples, shared manual/filtered/profile links, roles, empty pools, invalid links, and sensitivity checks')
