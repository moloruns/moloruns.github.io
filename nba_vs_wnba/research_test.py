"""Numerical, data-quality, and UI checks; artificial labels exist only in this test."""
import numpy as np
import pandas as pd
from streamlit.testing.v1 import AppTest

from comparison_ui import player_token
from research_models import ROOT, prepare_lab, rank_models, bootstrap_games, MODEL_NOTES, game_features
from research_review import validate_labels, evaluate_labels
from similarity_v3 import build_profiles, comparison_breakdown, find_counterparts, FEATURES

players, profiles, _ = build_profiles(pd.read_csv(ROOT / 'data' / 'player_seasons.csv'))
lab = prepare_lab(players, profiles)
assert lab['coverage'].Complete.all()
assert (lab['coverage']['Expected games'] == lab['coverage']['Collected games']).all()
assert np.linalg.eigvalsh(lab['precision']).min() > 0
source = players.index[players.PLAYER_NAME.eq("A'ja Wilson")][0]
pool = players.index[players.league.eq('NBA') & players.GP.ge(40)]
ranks = rank_models(players, profiles, source, pool, lab)
assert set(ranks) == set(MODEL_NOTES)
expected = find_counterparts(players, profiles, players.loc[source, 'PLAYER_ID'], 'WNBA', n=len(pool), min_games=40)
assert ranks['Current model'].index.tolist() == expected.index.tolist()
assert np.allclose(ranks['Current model'], expected.distance)
for name, scores in ranks.items():
    assert np.isfinite(scores).all() and scores.ge(0).all() and scores.is_monotonic_increasing, name
    assert len(scores) == len(pool), name
    assert players.loc[scores.index[0], 'PLAYER_NAME'] == 'Anthony Davis', name
# Symmetry, including pair-adaptive weights and Hellinger hybrid.
other = expected.index[0]
reverse = rank_models(players, profiles, other, [source], lab)
for name in ranks:
    assert np.isclose(ranks[name].loc[other], reverse[name].iloc[0]), name
# Game features use sums, not unweighted game-rate averages.
counts = np.array([[10, 10, 2, 1, 0, 0, 1, 5, 0, 2], [30, 10, 2, 1, 0, 0, 1, 10, 0, 3]])
assert game_features(counts.sum(axis=0))[0] == 18  # 20 points / 40 min * 36
summary, intervals, metadata = bootstrap_games(players, source, pool[:15], lab, repetitions=100)
assert np.isclose(summary['First-match frequency (%)'].sum(), 100)
assert np.isclose(summary['Top-five frequency (%)'].sum(), 500)
assert (intervals['Bootstrap 2.5%'] <= intervals['Bootstrap 97.5%']).all()
same, _, _ = bootstrap_games(players, source, pool[:15][::-1], lab, repetitions=100)
pd.testing.assert_frame_equal(summary, same)
# Frozen-packet evaluation rejects partial pools and spoofed task mappings.
packet = pd.read_csv(ROOT / 'research' / 'review_packet.csv').fillna('')
manifest = pd.read_csv(ROOT / 'research' / 'review_manifest.csv')
assert manifest.source.is_unique and manifest.split.eq('holdout').sum() == 6
assert not set(manifest[manifest.split.eq('holdout')].source) & set(manifest[manifest.split.eq('development')].source)
assert validate_labels(packet, packet).empty
chosen = manifest.loc[manifest.split.eq('development'), 'source'].iloc[0]
fixture = packet[packet.source.eq(chosen)].copy()
fixture['reviewer'] = 'TEST_FIXTURE_NOT_EXPERT'
fixture['rating'] = 2
empty, metadata = evaluate_labels(players, profiles, lab, packet, manifest, fixture.iloc[:-1])
assert empty.empty and metadata['complete_sources'] == 0
scored, metadata = evaluate_labels(players, profiles, lab, packet, manifest, fixture)
assert metadata['complete_sources'] == 1
assert np.allclose(scored['Mean NDCG@5'], 1)
assert np.allclose(scored['Mean plausible@5'], 1)
for kind in ['duplicate', 'rating', 'mapping']:
    bad = fixture.copy()
    if kind == 'duplicate': bad = pd.concat([bad, bad.iloc[:1]])
    if kind == 'rating': bad.loc[bad.index[0], 'rating'] = 4
    if kind == 'mapping': bad.loc[bad.index[0], 'source'] = 'NBA:fake:1'
    try:
        validate_labels(bad, packet)
    except ValueError:
        pass
    else:
        raise AssertionError(kind)
app = AppTest.from_file(str(ROOT / 'app.py'), default_timeout=180).run()
next(b for b in app.button if b.label == "Try A'ja Wilson").click().run()
app.toggle(key='lab_enabled').set_value(True).run()
assert not app.exception, [e.value for e in app.exception]
app.selectbox(key='lab_model').select('Per-100 possessions').run()
app.checkbox(key='lab_bootstrap').check().run()
assert not app.exception, [e.value for e in app.exception]
assert not app.error
assert any('No human judgments' in x.value for x in app.info)
app.button(key='start_review').click().run()
assert app.title[0].value == 'Review cross-league matches'
assert not any('Distance' in x.value for x in app.caption)
app.text_input(key='reviewer_id').set_value('TEST_REVIEWER').run()
app.radio[0].set_value(2).run()
next(b for b in app.button if b.label == 'Save judgment in this session').click().run()
assert not app.exception and not app.error
assert len(app.session_state['review_judgments']) == 1
app.button[0].click().run()
assert not app.exception and not app.error
print('OK: 12 models, exact v3 parity, symmetry, real-game coverage, bootstrap reproducibility, blind-label validation, and lab/review UI')
