Cross-League Player Comps
An interactive Python app for finding statistical counterparts between NBA and WNBA players.

TO ACCESS THE APP, DOWNLOAD THESE FILES/FOLDERS FROM THIS FOLDER
 - app.py
 - similarity_v3.py
 - data (folder)
 - requirements.txt (these tell you the packages required for the imports) \n
[RUN THIS COMMAND in terminal: streamlit run app.py]

Search for a player, explore their closest cross-league matches, and inspect why the model considers them similar. Comparisons combine league-relative production, regression-adjusted statistics, shot selection, efficiency, and defensive box-score indicators.

Built with Streamlit, pandas, Plotly, and NBA Stats data accessed through nba_api.

This is a statistical similarity tool—not a player ranking, a complete scouting evaluation, or a prediction of performance in another league.

Features
Search and compare
Search NBA and WNBA player-seasons from a single dropdown.
View up to 10 ranked cross-league counterparts.
Restrict comparisons to the same broad role.
Filter candidates by games played, minutes per game, and estimated total minutes.
Manually inspect any eligible player in the opposite league, including players outside the filtered results.
Visualize player profiles
Compare players using an interactive radar chart.
View side-by-side player cards with headshots and basic statistics.
Explore shot-location distributions with grouped bar charts.
Hover over radar features to see original statistics and model values.
Understand each match
Inspect the contribution of each feature to the final distance.
Compare component weights with their actual shares of squared distance.
See how defensive emphasis affects a pairing.
Review sample sizes, regression-adjusted values, and raw statistics.
Explore player-season profiles
Open dedicated player profiles with URL-based navigation.
View per-game statistics, advanced statistics, and season totals.
Return to comparisons with selections and filters preserved within the session.
How the similarity model works
The model implementation lives in 
similarity_v3.py
. The app exposes its feature values, weights, and distance calculations so comparisons can be inspected rather than treated as a black box.

1. Build comparable statistical profiles
Different feature types receive different transformations:

Feature group	Model representation
Points, rebounds, assists	50% standardized league percentile, 25% league z-score, and 25% standardized regression residual
Other production features and true shooting percentage	50% league z-score and 50% standardized regression residual
Shot selection	Attempt shares transformed onto a shared cross-league scale, with equal aggregate influence from each league when fitting that scale
League-relative statistics describe a player in the context of their own league. Regression residuals describe deviations from the model’s expected statistical baseline.

The exact regression predictors, feature definitions, and preprocessing rules are defined in similarity_v3.py.

2. Weight the components
The model begins with four equally weighted components.

Defense can receive a modest increase from 25% to 30%, depending on a player’s statistical emphasis. For each comparison, the two players’ weighting preferences are averaged.

These weights express the model’s assumptions about similarity. They are not validated measures of the importance of each skill.

Lower distance means a closer statistical match. Distance is not a similarity percentage or a measure of player quality.

Shot selection
The app compares field-goal attempt shares across four locations:

Rim
Paint outside the restricted area
Midrange
Three-point zone
These location shares sum to 100%. FTA/FGA is treated as a separate free-throw tendency.

Shot selection describes where players attempt shots, not how accurately they shoot from each location. Location data also does not identify actions such as post-ups, cuts, handoffs, or transition possessions.

Three-point-zone share can differ slightly from official 3PA/FGA because it uses location classifications.

Defensive context
The defensive comparison includes:

Statistic	Affects ranking?
Steals per 36 minutes	Yes
Blocks per 36 minutes	Yes
Defensive rebound percentage	Yes
Fouls per 36 minutes	No—context only
Defensive-context percentiles are calculated among model-eligible players in each player’s league and season with available data.

Higher does not always mean better: a higher foul percentile means more fouls. Per-36 statistics adjust for minutes, not pace.

These indicators do not measure the full scope of defense, including matchup difficulty, positioning, switchability, rim deterrence, or defensive assignments.

Getting started
1. Clone the repository
git clone <your-repository-url>
cd <your-repository-folder>
2. Create a virtual environment
python -m venv .venv
Activate it on macOS/Linux:

source .venv/bin/activate
Or on Windows PowerShell:

.venv\Scripts\Activate.ps1
3. Install dependencies
pip install --upgrade streamlit pandas numpy scikit-learn plotly requests Pillow nba_api
Use a recent Streamlit version: the interface uses st.html, query parameters, keyed containers, and button icons.

4. Prepare the data
The app requires:

data/player_seasons.csv
If a prepared dataset is not already included, run:

python make_player_seasons.py
The CSV must match the input requirements of similarity_v3.py. The original basic-statistics prototype alone is not sufficient for the current model’s advanced and shooting-location features. Complete any data-enrichment steps required by your model before launching.

For the additional player-profile tables, run:

python download_profile_stats.py
These profile datasets support the per-game, advanced, and season-total tabs. Some also supply additional defensive context.

5. Launch the app
streamlit run app.py
Open the local URL printed in your terminal, usually:

http://localhost:8501

Using the app
Search for a player.
Select an eligible NBA or WNBA player-season.

Adjust the candidate pool.
Open Comparison settings and eligibility filters to change result count, role restrictions, or playing-time requirements.

Select a counterpart.
Click a ranked comparison cell to update the charts and diagnostics. Click its person icon to open that player’s profile.

Inspect the comparison.
Explore component contributions, shot selection, defensive context, and model values.

Try a manual comparison.
Use Currently comparing against to inspect another eligible player from the opposite league.

Manual selections may fall outside the displayed ranked list or its filters. Their distances still use the same model.

Eligibility and filters
The model’s baseline eligibility requirements are:

At least 10 games played
At least 10 minutes per game
Approximately 200 total minutes
Complete required statistics
A role assignment
Additional counterpart filters default to:

Target league	Minimum games
NBA	40
WNBA	20
The additional minutes filters default to zero, meaning no extra restriction.

Filters change the candidate pool—not the similarity formula or the searched player. They cannot restore players excluded by baseline model eligibility.

Estimated total minutes are calculated as games played multiplied by rounded minutes per game, so they may differ from exact season totals.

Interpreting the charts
Radar chart
Radar values are display-only percentiles of model features across the combined eligible player pool.

They are not raw-statistic percentiles, and the chart does not visually apply feature weights. A larger radar area does not necessarily indicate a better player.

Contribution tables
Two quantities serve different purposes:

Allocated weight: How much emphasis the model assigns to a feature or component.
Share of squared distance: How much that feature or component actually separates these two players.
A heavily weighted component may contribute little distance when the players have similar values.

Profile statistics
Advanced statistics come from NBA Stats. Ratings and pace depend on team and lineup context and should not be interpreted as pure individual skill measurements.

Headshots use the latest available image, which may not correspond to the selected season.

Data and caching
Basketball statistics are sourced from NBA Stats through 
nba_api
.
Player headshots are requested from NBA and WNBA CDN endpoints.
Model profiles and CSV reads are cached.
The model cache uses the input file’s modification timestamp and MODEL_VERSION.
Headshot responses, including unavailable images, are cached for one day.
Missing headshots fall back to a placeholder.
Update MODEL_VERSION when changing model behavior so cached profiles can be invalidated appropriately.

The app reads prepared local statistics; it does not automatically download updated season data during searches.

Limitations
Statistical similarity does not imply equal ability or equivalent performance across leagues.
Results depend on feature selection, role assignments, regression assumptions, and weighting choices.
Box-score statistics cannot fully capture playing style, offensive responsibility, or defensive impact.
Small samples and missing data can affect eligibility and comparison stability.
Shot-location shares do not identify possession types or offensive actions.
NBA Stats endpoint availability and historical coverage can vary.
Custom interface styling targets Streamlit’s rendered structure and may need adjustment after Streamlit updates.
Troubleshooting
A player is missing from search
Check their baseline eligibility, required statistics, and role assignment.

No counterparts appear
Lower the additional games/minutes requirements or disable the same-role restriction.

Profile statistics are unavailable
Run download_profile_stats.py and check the expected league-season filenames in data/profile_stats/.

The model reports missing columns
Confirm that player_seasons.csv includes the advanced and shot-location inputs required by the current similarity_v3.py, not just the initial prototype’s basic statistics.

Data requests time out
NBA Stats requests can fail or be blocked, particularly on some cloud networks or VPNs. Try running the data scripts locally and avoid repeatedly sending failed requests.

Acknowledgments
Built with:

Streamlit
pandas
NumPy
scikit-learn
Plotly
nba_api
This project is not affiliated with or endorsed by the NBA or WNBA. Third-party statistics, images, and trademarks remain subject to their respective owners’ terms.
