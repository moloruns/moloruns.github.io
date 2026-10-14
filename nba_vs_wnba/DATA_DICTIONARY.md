# Model inputs and display units

The current snapshot covers NBA 2024–25 and WNBA 2025 regular seasons. The source
is NBA Stats, collected through `nba_api`. The app reads committed CSVs; it does
not fetch current statistics during searches.

| Fields | Input units | Use |
| --- | --- | --- |
| `PLAYER_ID`, `league`, `season` | Stable ID, NBA/WNBA, season string | Identity and share links |
| `role` | Guard, Wing, Big | Regression input, weights, optional candidate filter |
| `GP` | Games | Eligibility and sample-size display |
| `MIN` | Minutes per game | Eligibility, regression input, per-36 conversion |
| `PTS`, `AST`, `TOV` | Per game | Offensive production features |
| `USG_PCT` | Fraction (0–1) | Offensive production feature |
| `OREB_PCT`, `DREB_PCT` | Fractions (0–1) | Offensive production / defense features |
| `STL`, `BLK` | Per game, converted to stat / MIN × 36 | Defensive box-score features |
| `RIM_RATE`, `PAINT_NON_RA_RATE`, `MIDRANGE_RATE`, `THREE_ZONE_RATE` | Attempt shares (0–1), sum to one | Shot selection |
| `FT_RATE` | FTA / FGA, a nonnegative ratio; can exceed one | Free-throw tendency |
| `TS_PCT` | Computed as PTS / (2 × (FGA + 0.44 × FTA)) | Efficiency; can exceed one in unusual samples |
| `REB` | Per game | Player-card context; not a v3 distance feature |

The model derives true shooting from rounded per-game inputs. Profile tables use
NBA Stats' supplied true shooting, so small differences are possible. Shot shares
are derived from season totals. Per-36 rates adjust minutes, not pace.

The baseline requires at least 10 games, 10 MPG, approximately 200 total minutes,
a role, and complete required inputs. Total minutes for eligibility are estimated
from GP × rounded MPG. Missing/nonfinite required inputs for otherwise eligible
players cause validation errors; they are not silently imputed. Missing profile
records and headshots get an unavailable message. Player search and manual
comparison use baseline eligibility; additional counterpart filters do not apply
to the searched player.

## Profile display

Basic tables show per-game values; totals show season totals. Percentage columns
remain percentages in both views. `TM_TOV_PCT` is already on a 0–100 scale and
must not be multiplied by 100. Other displayed `_PCT` fields and `PIE` use
fractions and are multiplied by 100 for display. Advanced ratings and pace are
context-dependent, not pure measures of individual skill. Headshots are current
images and may not match the selected season.

## Transforms and charts

Ridge uses role dummies and standardized MPG, separately per league, with alpha 10.
The blend rules are listed in the README and the app's methodology panel. Final
features need not retain unit variance after blending. Four components begin at
25% each; defense may rise to 30% at the expense of the others. The two players'
weights are averaged, making pair distance symmetric.

Chart percentiles rank transformed model features across the combined eligible
pool. Overview markers average these feature percentiles within each component.
They do not apply model weights, are not component percentiles or impact ratings,
and can hide offsetting differences. Use all-feature charts and distance
contributions for detailed interpretation. Higher is not always better.
