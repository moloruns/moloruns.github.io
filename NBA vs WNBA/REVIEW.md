# App review — October 14, 2026

The app works locally and its comparison explanations are unusually inspectable:
feature weights, raw statistics, transformed values, and distance contributions are
all available. The largest opportunities are a faster first impression, clearer
interpretation of a match, and evidence that the rankings survive reasonable changes
to the modeling assumptions.

## What was tested

- Python 3.13 with the pinned dependencies; smoke test launched from the repository
  root and project folder.
- Streamlit AppTest searches in both directions, same-role filtering, ten results,
  manual comparison, an empty candidate pool, profile navigation, all three profile
  tables, and preservation of filters on return.
- Local headless Chrome at 1440 × 1000 and 390 × 844. Both player headshots loaded;
  comparison charts and profile tabs rendered. No JavaScript page errors or red
  app exception boxes occurred in the completed browser flow. Profile tables filled
  the desktop content width (1280 pixels). The phone page had no document-level
  horizontal overflow, but radar text was clipped inside the chart.
- The public Community Cloud deployment has **not** been tested. A successful local
  run does not establish that the public URL, cloud install, or portfolio link works.

Current model coverage: **427 NBA players (2024–25), 138 WNBA players (2025)**.
Baseline eligibility excludes 142 NBA and 44 WNBA rows from the input CSV.

Default-filter examples:

| Searched player | First match | Distance | Second match |
| --- | --- | ---: | --- |
| A'ja Wilson | Anthony Davis | 0.736 | Jaren Jackson Jr. |
| Caitlin Clark | James Harden | 0.872 | LaMelo Ball |
| Stephen Curry | Kelsey Plum | 0.598 | Sabrina Ionescu |
| LeBron James | Sabrina Ionescu | 0.765 | Kelsey Plum |
| Nikola Jokić | Alyssa Thomas | 0.764 | Dearica Hamby |

Distances are model distances, not accuracy measurements or similarity percentages.
The examples establish behavior, not the validity of the ranking.

## Correctness fix included with deployment preparation

`show_profile_table` multiplied every `_PCT` field by 100. The committed advanced
CSV stores `TM_TOV_PCT` in percentage units already: Anthony Davis has `8.3`, while
his `TS_PCT` is `0.588`. The previous rendering therefore displayed turnover rate
as **830%**, rather than **8.3%**. The display conversion now preserves turnover
percentage and continues converting fractional fields. The smoke test asserts both
8.3% turnover rate and 58.8% true shooting, and checks all three profile tables.
This does not change model features, weights, rankings, or data.

## Highest-priority UI improvements

1. **Give a recruiter an immediate example.** The initial page is a title and an
   empty search selector. Add a “Try A'ja Wilson” action, show the two supported
   seasons and eligible-player counts, and include one sentence explaining the
   question this project answers. Explain that this is statistical resemblance,
   not equivalent ability, near the first results.
2. **Bring the comparison into the first screenful.** At desktop size, the five
   88-pixel result rows push the radar and headshots below the initial viewport.
   Consider a compact results column beside the active comparison or show three
   results initially with an “all results” control. At phone size, stack compact
   player summaries before the chart so both names are visible together.
3. **Fix the mobile radar.** At 390 pixels wide, labels such as three-point-zone
   share and defensive rebound percentage are visibly cut off. Shorten axis labels
   with full definitions in tooltips; consider a horizontal dot comparison for
   small screens. Fourteen axes plus a fixed 550-pixel chart height also create a
   lot of visual work. A component-level overview with optional detailed features
   would make the first view easier to read.
4. **Explain matches in ordinary language.** Put “Lower distance = closer statistical
   profile” beside the result list. Add a short explanation of shared traits and
   the largest differences. For Wilson–Davis, shot selection contributes about
   48.4% of squared distance and efficiency about 32.8%; this is useful context
   for the radar's otherwise similar outlines. A large distance contribution
   explains a difference, not a shared strength.
5. **Make surprising comparisons understandable.** LeBron matches Sabrina with
   unrestricted roles; enabling same-role comparisons makes Nneka Ogwumike first.
   Neither result alone proves a defect. Show the active role policy prominently
   and explain that physical size, actions, and defensive assignments are not
   modeled. Let users compare the two policies without hiding the choice in a
   settings expander.
6. **Improve accessibility and sharing.** Use a descriptive accessible name for
   the person-icon button, actual text for distance/season metadata currently
   inserted through CSS pseudo-elements, and keyboard/touch-accessible explanations.
   Add a shareable comparison URL that includes both players and filters. Profile
   URLs already exist; comparison selections currently depend on session state.
   Expand abbreviations in profile tables or offer a compact vertical stat view.

## Statistical model critique and suggested experiments

### Validate the ranking before adding complexity

The ridge regressions adjust features; the final nearest-neighbor ranking still
uses manually chosen blends and weights. Build a small, independently reviewed
set of plausible cross-league matches and compare top-k retrieval with simpler
baselines: league-standardized statistics, a rate-only model, and fixed equal
component weights. Document disagreement and limitations rather than presenting
agreement with famous-player anecdotes as an accuracy score. Reserve an evaluation
set before tuning weights to examples.

### Quantify sensitivity and uncertainty

I varied each of the four component weights by factors of 0.8 and 1.2, one component
at a time, then renormalized each pair's weights to sum to one. The candidate pools
and transformed profiles stayed fixed. Wilson, Curry, LeBron, and Jokić retained
their first match in all eight variants. Clark changed from Harden to LaMelo when
efficiency weight increased by 20% (a relative increase before renormalization,
not an increase of 20 percentage points).

This is a limited sensitivity check, not a confidence interval. Publish top-k
stability across more players, component ablations, and the defense boost on/off.
For sampling uncertainty, collect game-level data and resample games or use a
justified shrinkage model; season aggregates alone cannot supply a game bootstrap.
Clark's included 2025 sample is only 13 games. Show sample size beside the match,
not only in the inspection panel. She is searchable but excluded as a counterpart
by the default 20-game WNBA filter; make that source/candidate asymmetry explicit.

### Audit redundant features and effective weighting

Measured Pearson correlations across the 565 combined transformed profiles include
points–usage **0.78**, assists–turnovers **0.71**, offensive–defensive rebound
percentage **0.73**, and rim–three-point share **−0.80**. Weighted Euclidean distance
counts correlated features separately. Four shot-location shares also sum to one,
so they carry only three independent degrees of freedom.

Compare feature/component ablations and a covariance-aware alternative with the
current interpretable distance. For shooting, evaluate a distribution distance
such as Hellinger distance on the four shares, keeping FTA/FGA separate. Treat
these as experiments: reduced redundancy does not automatically improve the
meaning of basketball similarity.

True shooting alone receives roughly 23.3–25% of total feature weight. Each shot
feature receives roughly 4.7–5%. That asymmetry is intentional in the component
design, but should be justified empirically. Blending standardized features does
not leave every final feature with variance exactly one, so equal component weight
also does not imply equal typical influence across all comparisons.

### Separate opportunity, role, style, and impact

Points, assists, and turnovers use per-game values mixed with minutes/role-adjusted
residuals. Steals and blocks use per-36 rates, while usage and rebound shares have
other denominators. Evaluate a per-possession variant and a simpler rate-based
baseline, with clear descriptions of what is being controlled. Adjusting for role
can remove traits people expect to define a position; retaining role traits in
rebounding/defense while adjusting other features is an assumption to audit.

The defense component is specifically a steals/blocks/rebounding profile, not a
validated measure of defense. Its adaptive boost depends on an offensive proxy
that itself contains efficiency. Compare with fixed 25% defense and explain why
the adaptive version is worth keeping. Avoid calling the standing values impact
ratings. Size, matchup difficulty, rim deterrence, off-ball movement, and play types
are absent from the current feature set.

### Keep the written methodology synchronized

The README's feature-transformation section mentions total rebounds in the
points/rebounds/assists blend, but v3 drops `REB` and uses `OREB_PCT`/`DREB_PCT`
instead. Rewrite that section around the active v3 feature list and list the exact
ridge inputs (role dummies and standardized minutes), alpha (10), and blend rules.
A small data dictionary with units and missing-value policy would also prevent
mistakes like the turnover-percentage display bug.

## Suggested order after launch

First fix mobile labels and add a sample comparison plus coverage information.
Then add a concise match explanation and shareable comparison links. Next publish
an evaluation/sensitivity notebook with baseline comparisons. Change model weights
only after that evidence gives a reason to do so. Keep the current version as a
reproducible baseline.
