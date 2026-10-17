# Model lab — October 17, 2026

Open a comparison in the app, expand **Model lab · experimental comparisons**, and
turn on **Enable model lab**. The main ranking remains v3. The lab is an exploratory
comparison of assumptions; none of its alternatives is established as superior.

## Implemented experiments

| Model | Experiment |
| --- | --- |
| Current model | Exact v3 distance, tested against the original implementation |
| League z-score | Equal feature weights; league z-scores of the 14 raw v3 inputs |
| Per-36 baseline | Same baseline with points, assists and turnovers converted to per 36; steals and blocks already use that denominator |
| Per-100 possessions | Counting features from official season totals divided by on-court POSS, multiplied by 100; remaining inputs unchanged from the raw baseline |
| Fixed components | Four equal 25% components; retain v3 profiles and within-component role weights |
| Covariance adjusted | Mahalanobis distance using the average of separate league Ledoit–Wolf covariance estimates; no v3 weights |
| Hellinger shooting | Replace the four standardized location-share differences with one distribution distance; keep FTA/FGA separate |
| Game-rate baseline | Nine features from game logs: points, assists, rebounds, steals, blocks, turnovers per 36; TS%, 3PA/FGA, FTA/FGA |
| Four component ablations | Remove production, shooting, efficiency, or defense one at a time and renormalize pair weights |

All raw/rate baselines standardize features separately within each league with
population standard deviations and equal feature weights. This intentionally
changes the production model's shared shooting scale too; it is a simpler baseline,
not an isolated intervention on a single feature. For the shooting hybrid,
Hellinger squared is `0.5 × sum((sqrt(p) - sqrt(q))²)`. It receives the four zones'
combined budget (80% of the shooting block); the free-throw ratio retains 20%.
Hellinger is bounded while z-score distances are not, so this experiment changes
scale as well as geometry. Compare ranks, not distance magnitudes across models.

Covariance is estimated separately by league and then averaged to prevent the
larger NBA sample receiving all the influence. Shrinkage regularizes redundant
features. It can also de-emphasize meaningful basketball structure: it is an
alternative to test, not a correction known to be better.

## Actual results

The frozen audit covers all **565 eligible source players**, using unrestricted
roles and default counterpart thresholds (40 NBA / 20 WNBA games). Inspect
`model_agreement.csv` for league-specific agreement and `all_player_comparisons.csv`
for source-level results. The interface's current filters affect interactive
comparisons, but do not rewrite this frozen audit.

- Wilson's first match is Davis in all 12 methods.
- Curry's first match is Plum in v3, but Ionescu in the three simpler raw/rate
  baselines and the covariance alternative.
- Jokić remains paired with Thomas in most models; covariance adjustment selects
  Jackie Young. This illustrates why a statistically motivated modification still
  requires basketball validation.
- Clark matches Harden in v3 and the raw/rate baselines, while the game-rate
  baseline selects Westbrook. The game-rate model has different inputs, including
  total rebounds and no usage/rebound percentages or shot-location zones.

These observations are agreement and sensitivity findings, not accuracy claims.

## Real game data and uncertainty

`game_logs/` contains official NBA Stats LeagueGameLog responses for NBA 2024–25
and WNBA 2025 regular seasons: **26,306 NBA** and **5,407 WNBA** player-game rows.
Each download has source parameters, UTC retrieval time and SHA-256 metadata.
All 427 NBA and 138 WNBA model-eligible players have matching game counts and
finite game-rate features; see `coverage.csv`. Ineligible players' rows are retained
in the downloaded files for provenance but are not used in the experiment.

The bootstrap resamples whole games with replacement for the source and every
candidate, independently by player. It computes ratios of summed counts, retaining
within-game relationships. League means/scales and candidate eligibility are fixed
at their observed values. The seed is 20261017; ordering the same candidate set
differently does not change the random draws. Default saved examples use 500 draws.

Saved rate-baseline results:

- Wilson: Davis ranks first in **98.8%** of 500 resamples.
- Clark: Westbrook ranks first in **26.6%**, Cunningham **21.0%**, Harden **18.0%**.

`*_bootstrap.csv` contains first-match and top-five frequencies plus rank quantiles;
`*_intervals.csv` contains the central 95% of source-feature estimates.
These are **conditional bootstrap summaries of the game-rate baseline**, not
confidence intervals for v3, calibrated probabilities of a correct match, or
predictions of future performance. Games are assumed exchangeable. Opponent/team
coupling, injuries, time trends, league-normalization uncertainty and eligibility
selection uncertainty are not captured. MIN is rounded in this endpoint. Resamples
with undefined shooting ratios are excluded across the whole draw and counted.
At least half the requested draws and 30 valid draws are required to report results.

Full-v3 sampling uncertainty remains unsupported: these basic game logs do not
supply all game-level usage, rebounding-percentage, and shot-zone inputs. We do
not pretend missing inputs have zero sampling uncertainty.

## Human evaluation: prepared, judgments pending

The frozen packet contains **539 pairs across 24 source players**. Sources were
selected by deterministic hashes within six league/role strata (four per stratum).
One per stratum is held out: **18 development / 6 holdout** sources. This split is
fixed before human labels. Each candidate pool combines the top five from every
method with five deterministic control candidates, then hides model attribution
and shuffles presentation by hash. Model-blinded does not mean a reviewer cannot
recognize a player or previously seen result; use independent reviewers who have
not studied the model outputs where possible.

1. Ask at least two basketball-informed reviewers to independently use **Start
   blinded review**, or fill out `review_packet.csv`. No messages have been sent to
   reviewers. Use pseudonyms; no email or personal information is needed.
2. Grade each pair: 0 poor, 1 weak, 2 plausible, 3 strong. Judge statistical style
   within the listed seasons, not equal ability. Download session judgments before
   leaving the page. The app does not persist them to disk.
3. Upload completed CSVs together in **Human evaluation**. Duplicate task/reviewer
   rows, invalid grades, and altered task identities are rejected. Blank grades
   stay unjudged. Every candidate for a source must have a judgment before that
   source is scored for any model; incomplete sources are skipped.
4. Evaluate development sources first. Freeze model choices before checking
   **Reveal held-out evaluation**. Treat results as exploratory if you have
   inspected holdout performance while tuning; a new external test set would be
   needed for a clean final estimate.

NDCG@5 uses mean reviewer grades with linear gain. Plausible@5 is the fraction
whose mean grade is at least two. Metrics rerank the frozen judged candidate pool;
**they are not full-league retrieval accuracy**. Unjudged players outside the pool
are not negative labels. All-zero-grade sources have undefined NDCG, are omitted
from its mean, and remain in plausible@5; counts are reported separately. Review
agreement is summarized with the mean grade range for multiply judged pairs.
Reviewer counts are shown; the app cannot certify expertise or independence.

**No real human ratings have been collected.** No expert validation result is
claimed. Numerical tests use artificial labels only as test fixtures; those labels
are never stored in the research packet or presented as expert evidence.

## Reproduce

From the repository root:

```sh
python3 nba_vs_wnba/download_game_logs.py   # local download; cached unless --refresh
python3 nba_vs_wnba/run_research.py         # offline experiments and exports
python3 nba_vs_wnba/research_test.py
python3 nba_vs_wnba/smoke_test.py
python3 nba_vs_wnba/ui_test.py
```

`run_research.py` refuses to silently replace a different frozen review packet.
If inputs or experiments change, create a new packet version and preserve the old
one before collecting new judgments. `run_manifest.json` records input/model/code
identifiers. Dependencies use the application's pinned requirements.

Primary references: [NBA Stats glossary](https://www.nba.com/stats/help/glossary)
for possessions; [Ledoit–Wolf documentation](https://scikit-learn.org/stable/modules/generated/sklearn.covariance.LedoitWolf.html)
for covariance shrinkage; [NDCG documentation](https://scikit-learn.org/stable/modules/generated/sklearn.metrics.ndcg_score.html)
for judged-pool ranking evaluation.
