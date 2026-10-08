# Attribute And Comparison Model

The model is a game-design mapping, not a statistical equivalence between
Pokemon and professional players. Sources, weights and rebuilds live in
`pipeline/`; exported browser data lives in `data/`.

## Attributes

Speed, shooting, layup, dunk, passing, power, steal, block, rebound and ball
handling form the ten-axis comparison vector. Clutch is game-only.
Pokemon inputs are base stats, height and weight. NBA inputs are NBA 2K ratings
and weight, not current-season box scores. Population sizes/version/source
metadata are stored in the exported JSON.

`pipeline/formulas.py` owns the input weights. `pipeline/build_attributes.py`
ranks each input within its own population, blends the weighted percentiles,
then ranks that blend again onto 0-100. Ties share average ranks:

```text
percentile = (average_rank - 0.5) / population_size * 100
```

Pokemon type/ability bonuses add ten points, capped at 100, at most once per
attribute. Electric boosts speed; Fighting/Flying dunk; Psychic/Fairy passing;
Dark or Pickpocket steal; Steel/Rock block. Hidden abilities count.
The Pokemon population includes default species and regional forms; cosmetic,
Mega, Gigantamax and battle-only forms are excluded.

## Matching

Whole-profile ranking uses centered attribute shape plus overall-level gap:

```text
distance = sqrt(sum((candidate_centered - query_centered)^2)
                + 10 * (candidate_level - query_level)^2)
```

Level is BST percentile for Pokemon and NBA 2K overall percentile for players.
NBA candidates must meet the configured minimum 2K overall (currently 78);
percentiles still use the whole NBA population.
Ranking alone cannot establish a good fit. The browser's absolute-fit gate
requires RMS attribute gap at most 25 and at least 60% of axes within 25 points.
When no candidate passes, comparison explicitly says there is no close match
and labels the fallback as closest, not an equivalence. See `js/match.js`.
Trait comparisons use plain distance on the selected attributes. NBA queries
omit the "built like" trait in the interface. Comparison cards show overalls
and available star ratings. There is no Verify Matches UI.

## Game Stars

Game ratings retain attribute shape but compress overall strength halfway
toward 50 (`LEVEL_KEEP = 0.5`), clamp 0-100 and convert to 1-5 half-stars.
Game clutch uses similarly compressed BST percentile; overall uses compressed
mean attribute level. Comparison percentiles are not these compressed ratings.

## Rebuild

Install `pipeline/requirements.txt`, then run from the project root:

```sh
python3 pipeline/build_attributes.py
python3 pipeline/validate.py
python3 pipeline/audit_assets.py
```

The retained CSV inputs allow rebuilding without API calls. Fetch scripts
refresh raw sources when deliberately requested; `pipeline/cache/` avoids
repeated upstream requests and is ignored by Git. `pipeline/.env` contains the
optional data-import API key, never runtime credentials and never site content.
`pipeline/validation_report.md` and `gut_checks.csv` document model checks.
