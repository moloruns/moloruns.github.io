"""Streamlit research views, kept separate from the production comparison interface."""
from io import BytesIO

import pandas as pd
import plotly.express as px
import streamlit as st

from comparison_ui import player_token
from research_models import ROOT, MODEL_NOTES, prepare_lab, rank_models, comparison_summary, bootstrap_games
from research_review import RATING_GUIDE, validate_labels, evaluate_labels
from similarity_v3 import FEATURES, FEATURE_LABELS, MODEL_VERSION


def data_signature():
    paths = list((ROOT / 'research' / 'game_logs').glob('*.csv'))
    paths += list((ROOT / 'data' / 'profile_stats').glob('*2024-25*.csv'))
    paths += list((ROOT / 'data' / 'profile_stats').glob('*2025*.csv'))
    return tuple((str(p), p.stat().st_mtime_ns) for p in sorted(paths))


@st.cache_data(max_entries=4, show_spinner='Preparing experimental profiles…')
def load_lab(players, profiles, signature, model_version):
    return prepare_lab(players, profiles)


@st.cache_data(max_entries=32, show_spinner='Resampling real games…')
def cached_bootstrap(players, source, candidates, lab, repetitions):
    return bootstrap_games(players, source, candidates, lab, repetitions=repetitions)


def read_packet():
    packet = pd.read_csv(ROOT / 'research' / 'review_packet.csv').fillna('')
    manifest = pd.read_csv(ROOT / 'research' / 'review_manifest.csv')
    return packet, manifest


def start_review():
    st.query_params.from_dict({'view': 'review'})
    st.rerun()


def render_lab(players, profiles, source, candidates):
    st.caption('Research sandbox · the main results above continue to use the current model.')
    if not st.toggle('Enable model lab', key='lab_enabled'):
        return
    try:
        lab = load_lab(players, profiles, data_signature(), MODEL_VERSION)
    except (ValueError, OSError, KeyError) as exc:
        st.error(f'Research data unavailable: {exc}')
        return
    model_tab, uncertainty_tab, review_tab, methods_tab = st.tabs(
        ['Compare models', 'Game uncertainty', 'Human evaluation', 'Data & methods'])
    with model_tab:
        rankings = rank_models(players, profiles, source, candidates, lab)
        st.write('What changes when we make a different modeling choice? Every method uses the same filtered candidate pool where its inputs are available.')
        selected_model = st.selectbox('Experimental model', list(MODEL_NOTES), key='lab_model')
        st.caption(MODEL_NOTES[selected_model])
        scores = rankings[selected_model]
        current_rank = pd.Series(range(1, len(rankings['Current model']) + 1), index=rankings['Current model'].index)
        top = scores.head(10)
        table = pd.DataFrame({'Experimental rank': range(1, len(top) + 1),
                              'Player': players.loc[top.index, 'PLAYER_NAME'].to_numpy(),
                              'Current-model rank': current_rank.reindex(top.index).to_numpy(),
                              'Distance': top.to_numpy()})
        st.dataframe(table, hide_index=True, width='stretch')
        st.caption('Compare ranks, not distance magnitudes across models: their scales differ. No alternative has been shown to be more accurate.')
        st.markdown('**Agreement with the current model**')
        summary = comparison_summary(players, rankings)
        st.dataframe(summary, hide_index=True, width='stretch')
        st.download_button('Download model comparison', summary.to_csv(index=False), 'model_comparison.csv', 'text/csv')
        with st.expander('Across all 565 players'):
            agreement = pd.read_csv(ROOT / 'research' / 'model_agreement.csv')
            st.dataframe(agreement, hide_index=True, width='stretch')
            st.caption('Frozen baseline audit: all roles, ≥40 NBA or ≥20 WNBA counterpart games. These are agreement rates, not accuracy scores; current UI filters do not change this artifact.')
    with uncertainty_tab:
        st.write('How much could the matches change if a different sample of this season’s games had been observed?')
        st.info('This experiment uses the nine-feature game-rate baseline, not the full v3 model. Complete game coverage is required. League reference scales and the eligible pool are held fixed.')
        repetitions = st.select_slider('Bootstrap draws', [100, 300, 500, 1000], value=300)
        if st.checkbox('Show game-resampling results', key='lab_bootstrap'):
            try:
                summary, ranges, metadata = cached_bootstrap(players, source, list(candidates), lab, repetitions)
                st.caption(f"{metadata['source_games']} source games · {metadata['valid']} / {metadata['requested']} valid draws · {metadata['excluded_candidates']} candidates excluded for incomplete data · seed {metadata['seed']}")
                plot = px.bar(summary.head(10).iloc[::-1], x='First-match frequency (%)', y='Player', orientation='h')
                plot.update_layout(height=380, margin={'l': 0, 'r': 10, 't': 10, 'b': 10}, xaxis_range=[0, 100])
                st.plotly_chart(plot, width='stretch')
                st.dataframe(summary.head(15), hide_index=True, width='stretch')
                st.markdown('**Source-player statistics: middle 95% of bootstrap estimates**')
                st.dataframe(ranges, hide_index=True, width='stretch')
                st.download_button('Download uncertainty results', summary.to_csv(index=False), 'game_bootstrap.csv', 'text/csv')
            except ValueError as exc:
                st.warning(str(exc))
        st.caption('Whole games are sampled with replacement independently for each player, preserving within-game stat relationships. This assumes games are exchangeable and ignores team/opponent dependence, injuries and time trends. Minutes in this endpoint are rounded. Frequencies measure resampling stability, not the probability that a match is correct. Undefined-ratio draws are excluded and counted.')
    with review_tab:
        packet, manifest = read_packet()
        st.write('Human judgments are still needed. The frozen packet hides algorithm labels and rankings, mixes model-proposed matches with controls, and reserves six source players for holdout evaluation.')
        st.caption(RATING_GUIDE)
        if st.button('Start blinded review', key='start_review'):
            start_review()
        st.download_button('Download blank review packet', packet.to_csv(index=False), 'review_packet.csv', 'text/csv')
        uploads = st.file_uploader('Upload completed reviewer CSVs', type=['csv'], accept_multiple_files=True, key='review_uploads')
        st.caption('Use reviewer pseudonyms. Uploads are processed for this session; they are not saved to the repository or sent to reviewers. Independent expertise cannot be verified automatically.')
        split = 'holdout' if st.checkbox('Reveal held-out evaluation — only after freezing model choices') else 'development'
        if uploads:
            try:
                labels = pd.concat([pd.read_csv(BytesIO(file.getvalue())) for file in uploads], ignore_index=True)
                table, meta = evaluate_labels(players, profiles, lab, packet, manifest, labels, split)
                st.write(f"{split.title()}: {meta['judgments']} judgments, {meta['complete_sources']} completely judged sources, {meta['skipped_sources']} incomplete sources skipped.")
                if table.empty:
                    st.info('No scores yet. Rate every candidate for at least one source in this split. Unjudged pairs are not treated as poor matches.')
                else:
                    st.dataframe(table, hide_index=True, width='stretch')
                    st.download_button('Download evaluation', table.to_csv(index=False), 'human_evaluation.csv', 'text/csv')
                st.caption(f"Multi-reviewer tasks: {meta['paired_tasks']}. Mean grade range: {meta['mean_grade_gap'] if meta['mean_grade_gap'] is not None else 'not available'}.")
            except (ValueError, KeyError, pd.errors.ParserError, UnicodeDecodeError) as exc:
                st.error(f'Could not evaluate those files: {exc}')
        else:
            st.info('No human judgments loaded. There is no expert accuracy score yet.')
        st.caption('NDCG@5 uses mean grades (0–3). Plausible@5 counts mean grades ≥2. Scores rerank only the frozen judged pool, not the whole league. Sources with incomplete labels are skipped for every model. All-zero-grade sources have undefined NDCG and are excluded from its mean (shown as NDCG sources). At least two independent basketball-informed reviewers per pair are recommended. Avoid tuning after revealing holdout results.')
    with methods_tab:
        st.markdown('**Where features overlap**')
        correlation = profiles[FEATURES].corr()
        rows = []
        for a, left in enumerate(FEATURES):
            for right in FEATURES[a + 1:]:
                rows.append({'Feature A': FEATURE_LABELS[left], 'Feature B': FEATURE_LABELS[right],
                             'Correlation': correlation.loc[left, right]})
        pairs = pd.DataFrame(rows)
        pairs = pairs.loc[pairs.Correlation.abs().sort_values(ascending=False).index].head(12)
        st.dataframe(pairs, hide_index=True, width='stretch')
        st.caption('Pearson correlations on combined transformed profiles. Correlation is a reason to test redundancy, not an automatic reason to remove a feature. Four shot-location shares sum to one.')
        st.markdown('**Game-log coverage**')
        coverage = lab['coverage']
        st.write(f"{int(coverage.Complete.sum())} of {len(coverage)} eligible players have complete game counts and defined rate features.")
        st.dataframe(coverage.groupby('League').agg(Players=('Player', 'count'), Games=('Collected games', 'sum'), Complete=('Complete', 'sum')).reset_index(), hide_index=True)
        for name, note in MODEL_NOTES.items():
            st.markdown(f'**{name}:** {note}')
        st.caption('The game baseline adds total rebounds and lacks usage, rebound percentages, and shot-location zones. Its uncertainty estimates must not be transferred to the production model. Per-possession rates use official season totals and on-court POSS, not team possessions or pace.')
        st.link_button('Covariance shrinkage reference', 'https://scikit-learn.org/stable/modules/generated/sklearn.covariance.LedoitWolf.html')
        st.link_button('Ranking metric reference', 'https://scikit-learn.org/stable/modules/generated/sklearn.metrics.ndcg_score.html')


def render_blind_review(players):
    st.title('Review cross-league matches')
    st.write('Model names, distances, and ranks are hidden here. Judge the statistical-style resemblance using your basketball knowledge; consider the selected seasons.')
    st.caption(RATING_GUIDE)
    if st.button('Back to comparisons'):
        st.query_params.from_dict(st.session_state.get('comparison_query', {}))
        st.rerun()
    packet, _ = read_packet()
    token_map = {player_token(p): i for i, p in players.iterrows()}
    reviewer = st.text_input('Reviewer ID or pseudonym', key='reviewer_id').strip()
    sources = packet[['source', 'source_name']].drop_duplicates().set_index('source').source_name.to_dict()
    source = st.selectbox('Player to review', list(sources), format_func=lambda t: f'{sources[t]} · {t.split(":")[0]}')
    tasks = packet[packet.source.eq(source)].set_index('task_id')
    task_id = st.selectbox('Candidate (randomized order)', list(tasks.index), format_func=lambda t: tasks.loc[t, 'candidate_name'])
    task = tasks.loc[task_id]
    left, right = st.columns(2)
    for column, token in [(left, source), (right, task.candidate)]:
        player = players.loc[token_map[token]]
        with column:
            st.subheader(player.PLAYER_NAME)
            st.caption(f'{player.league} · {player.season} · {player.role} · {int(player.GP)} games')
            st.dataframe(pd.DataFrame({'Statistic': ['MPG', 'Points', 'Rebounds', 'Assists', 'Steals', 'Blocks', 'Turnovers'],
                                       'Per game': [player[f] for f in ['MIN', 'PTS', 'REB', 'AST', 'STL', 'BLK', 'TOV']]}), hide_index=True, width='stretch')
            with st.expander('Shooting and role context'):
                fields = ['TS_PCT', 'USG_PCT', 'OREB_PCT', 'DREB_PCT',
                          'RIM_RATE', 'PAINT_NON_RA_RATE', 'MIDRANGE_RATE', 'THREE_ZONE_RATE', 'FT_RATE']
                st.dataframe(pd.DataFrame({'Statistic': [FEATURE_LABELS[f] for f in fields],
                                           'Value': [f'{player[f]:.1%}' for f in fields]}), hide_index=True, width='stretch')
                st.caption('Raw season values; no model transformations. Shot-location values are attempt shares. FTA/FGA is a separate ratio.')
    with st.form(f'judgment_{task_id}'):
        rating = st.radio('How plausible is this match?', [0, 1, 2, 3], index=None, horizontal=True)
        rationale = st.text_area('Reasoning (optional)')
        save = st.form_submit_button('Save judgment in this session')
    judgments = st.session_state.setdefault('review_judgments', {})
    if save:
        if not reviewer or rating is None:
            st.warning('Enter a reviewer ID and select a grade before saving.')
        else:
            judgments[(reviewer, task_id)] = {'task_id': task_id, 'source': source, 'candidate': task.candidate,
                                             'reviewer': reviewer, 'rating': rating, 'rationale': rationale}
            st.success('Saved for this session. Download your judgments before leaving.')
    complete = sum((reviewer, task) in judgments for task in tasks.index)
    st.caption(f'{complete} / {len(tasks)} candidates graded for this source and reviewer. Complete the source pool to enable evaluation.')
    st.caption(f'{len(judgments)} judgments saved in this session. Closing/reloading the session can lose them.')
    if judgments:
        st.download_button('Download my judgments', pd.DataFrame(judgments.values()).to_csv(index=False), 'my_review_judgments.csv', 'text/csv')
