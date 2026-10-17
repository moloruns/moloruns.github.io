from pathlib import Path

from io import BytesIO

import requests
from PIL import Image

import pandas as pd
import plotly.graph_objects as go
import streamlit as st

from research_ui import render_lab, render_blind_review

from comparison_ui import (
    SHORT_LABELS, STAT_NAMES, player_token, parse_comparison_query,
    comparison_query, comparison_url, profile_chart, sensitivity_results,
)

from similarity_v3 import (
    MODEL_VERSION,
    FEATURES,
    FEATURE_LABELS,
    SHOT_SELECTION,
    build_profiles,
    comparison_breakdown,
    find_counterparts,
)


# ============================================================
# CONFIGURATION
# ============================================================

st.set_page_config(
    page_title="Cross-League Player Comps",
    page_icon="🏀",
    layout="wide",
)

ROOT = Path(__file__).resolve().parent
DATA_PATH = ROOT / "data" / "player_seasons.csv"
PROFILE_DIR = ROOT / "data" / "profile_stats"

BASIC_FIELDS = [
    "GP", "MIN", "PTS", "REB", "OREB", "DREB",
    "AST", "STL", "BLK", "TOV", "PF",
    "FGM", "FGA", "FG_PCT",
    "FG3M", "FG3A", "FG3_PCT",
    "FTM", "FTA", "FT_PCT", "PLUS_MINUS",
]

ADVANCED_FIELDS = [
    "GP", "MIN",
    "OFF_RATING", "DEF_RATING", "NET_RATING",
    "AST_PCT", "AST_TOV", "AST_RATIO",
    "OREB_PCT", "DREB_PCT", "REB_PCT",
    "TM_TOV_PCT", "EFG_PCT", "TS_PCT",
    "USG_PCT", "PACE", "PIE",
]


# ============================================================
# STYLING
# ============================================================

def apply_styles():
    st.html("""
    <style>
    .block-container { max-width: 1480px; padding-top: 4rem; }
    .st-key-player_pair [data-testid="stVerticalBlock"] { gap: 0.4rem; }
    .st-key-workspace button[kind="primary"] { background: #0369a1; border-color: #0369a1; color: white; }
    .st-key-player_pair [data-testid="stImage"] { max-width: 96px; }
    .st-key-player_pair [data-testid="stImage"] img { border-radius: 12px; }
    .st-key-workspace button:focus-visible { outline: 3px solid #0284c7; outline-offset: 3px; }
    @media (max-width: 760px) {
        .st-key-workspace > [data-testid="stLayoutWrapper"] > [data-testid="stHorizontalBlock"] { flex-direction: column-reverse; }
        .st-key-player_pair > [data-testid="stLayoutWrapper"] > [data-testid="stHorizontalBlock"] { flex-wrap: nowrap; }
        .st-key-player_pair > [data-testid="stLayoutWrapper"] > [data-testid="stHorizontalBlock"] > [data-testid="stColumn"] {
            min-width: 0; flex: 1 1 0%;
        }
    }
    .diagnostic-table-wrap { overflow-x: auto; }
    /* Diagnostic table. */
    .diagnostic-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 0.9rem;
    }

    .diagnostic-table th,
    .diagnostic-table td {
        padding: 0.7rem;
        text-align: left;
        border-bottom: 1px solid rgba(128, 128, 128, 0.25);
    }

    .diagnostic-table .weighted-help {
        position: relative;
        cursor: help;
    }

    .diagnostic-table .weighted-tooltip {
        position: absolute;
        top: calc(100% + 8px);
        right: 0;
        width: min(340px, 75vw);
        padding: 12px 14px;
        border-radius: 8px;
        background: #172033;
        color: #ffffff;
        font-size: 0.82rem;
        font-weight: normal;
        line-height: 1.5;
        text-align: left;
        box-shadow: 0 6px 20px rgba(0, 0, 0, 0.25);
        z-index: 100;
        opacity: 0;
        visibility: hidden;
        transform: translateY(-4px);
        pointer-events: none;
        transition:
            opacity 160ms ease,
            transform 160ms ease,
            visibility 160ms ease;
    }

    .diagnostic-table .weighted-help:hover .weighted-tooltip,
    .diagnostic-table .weighted-help:focus-within .weighted-tooltip {
        opacity: 1;
        visibility: visible;
        transform: translateY(0);
    }

    @media (prefers-reduced-motion: reduce) {
        .diagnostic-table .weighted-tooltip {
            transition: none;
        }
    }
    </style>
    """)


# ============================================================
# DATA LOADING
# ============================================================

@st.cache_data
def read_csv(path, version):
    return pd.read_csv(path)


@st.cache_data
def load_model(path, version, model_version):
    raw = pd.read_csv(path)
    players, profiles, _ = build_profiles(raw)
    return players, profiles


# ============================================================
# NAVIGATION AND SELECTION
# ============================================================

def open_profile(player):
    st.query_params.from_dict({
        **st.session_state.get('comparison_query', {}),
        "view": "profile",
        "league": str(player["league"]),
        "player_id": str(int(player["PLAYER_ID"])),
        "season": str(player["season"]),
    })
    st.rerun()


def back_to_search():
    query = {k: v for k, v in st.query_params.to_dict().items()
             if k not in {'view', 'player_id', 'league', 'season'}}
    st.query_params.from_dict(query or st.session_state.get('comparison_query', {}))
    st.rerun()


def choose_comparison(candidate_index, state_key, picker_key):
    """
    Runs before the next page render.

    The permanent state survives visits to player profiles.
    The picker state keeps the visible dropdown synchronized.
    """
    st.session_state[state_key] = candidate_index
    st.session_state[picker_key] = candidate_index


def comparison_picker_changed(state_key, picker_key):
    st.session_state[state_key] = st.session_state[picker_key]


def format_feature(feature, value):
    percentage_features = {
    "USG_PCT",
    "TS_PCT",
    "OREB_PCT",
    "DREB_PCT",
    *SHOT_SELECTION,
}

    if feature in percentage_features:
        return f"{value:.1%}"

    return f"{value:.1f}"


# ============================================================
# DIAGNOSTIC TABLE
# ============================================================

def render_difference_table(detail):
    tooltip_text = (
        "This is one feature's contribution to squared distance: "
        "feature weight × (player A model value − player B model value)². "
        "The model begins with four equally weighted components. "
        "Defense can receive a modest additional weight, and the two "
        "players' weighting preferences are averaged. Larger contributions "
        "make the players less similar. Final distance is the square root "
        "of the sum of these contributions."
    )

    table_html = detail.to_html(
        index=False,
        escape=True,
        border=0,
        classes="diagnostic-table",
        float_format=lambda value: f"{value:.4f}",
    )

    tooltip_header = f"""
    <th class="weighted-help">
        <span
            tabindex="0"
            aria-describedby="weighted-difference-tooltip"
        >
            Weighted squared difference ⓘ
        </span>
        <span
            id="weighted-difference-tooltip"
            class="weighted-tooltip"
            role="tooltip"
        >
            {tooltip_text}
        </span>
    </th>
    """

    table_html = table_html.replace(
        "<th>Weighted squared difference</th>",
        tooltip_header,
    )

    st.html('<div class="diagnostic-table-wrap">' + table_html + '</div>')
    with st.expander('What does weighted squared difference mean?'):
        st.write(tooltip_text)


# ============================================================
# RADAR AND PLAYER CARDS
# ============================================================

def radar_chart(players, profiles, left_index, right_index):
    # Display-only ranks across the combined eligible player pool.
    percentiles = profiles.rank(
        method="average",
        pct=True,
    ) * 100

    labels = [SHORT_LABELS[feature] for feature in FEATURES]
    theta = labels + labels[:1]

    figure = go.Figure()

    styles = [
        (left_index, "#38BDF8", "rgba(56,189,248,0.20)"),
        (right_index, "#FB7185", "rgba(251,113,133,0.20)"),
    ]

    for index, color, fill_color in styles:
        player = players.loc[index]
        values = percentiles.loc[index, FEATURES].tolist()

        hover_data = [
            [
                format_feature(feature, player[feature]),
                float(profiles.loc[index, feature]),
                FEATURE_LABELS[feature],
            ]
            for feature in FEATURES
        ]

        figure.add_trace(
            go.Scatterpolar(
                r=values + values[:1],
                theta=theta,
                name=player["PLAYER_NAME"],
                mode="lines+markers",
                fill="toself",
                fillcolor=fill_color,
                line={"color": color, "width": 3},
                marker={"size": 5},
                customdata=hover_data + hover_data[:1],
                hovertemplate=(
                    "<b>%{customdata[2]}</b><br>"
                    "Model-profile percentile: %{r:.1f}<br>"
                    "Original statistic: %{customdata[0]}<br>"
                    "Model feature: %{customdata[1]:.2f}"
                    "<extra>%{fullData.name}</extra>"
                ),
            )
        )

    figure.update_layout(
        height=440,
        margin={"l": 65, "r": 65, "t": 40, "b": 75},
        polar={
            "radialaxis": {
                "visible": True,
                "range": [0, 100],
                "tickvals": [25, 50, 75, 100],
            }
        },
        legend={
            "orientation": "h",
            "x": 0.5,
            "xanchor": "center",
            "y": -0.15,
        },
    )

    return figure

@st.cache_data(ttl=86400, max_entries=1000, show_spinner=False)
def get_player_headshot(league, player_id):
    """
    Return image bytes when available.

    Results are cached for one day, including unavailable images,
    to avoid repeated requests during app interactions.
    """
    player_id = int(player_id)

    if league == "NBA":
        url = (
            "https://cdn.nba.com/headshots/nba/latest/"
            f"1040x760/{player_id}.png"
        )
    elif league == "WNBA":
        url = (
            "https://cdn.wnba.com/headshots/wnba/latest/"
            f"1040x760/{player_id}.png"
        )
    else:
        return None

    try:
        response = requests.get(url, timeout=8)
        response.raise_for_status()

        # Confirm the response is a readable image.
        with Image.open(BytesIO(response.content)) as image:
            image.verify()

        return response.content

    except (requests.RequestException, OSError, ValueError):
        return None


def show_player_headshot(player):
    image = get_player_headshot(
        player["league"],
        int(player["PLAYER_ID"]),
    )

    if image is not None:
        st.image(
            image,
            width="stretch",
        )
    else:
        st.markdown(
            """
            <div style="
                min-height: 150px;
                display: flex;
                align-items: center;
                justify-content: center;
                background: rgba(128,128,128,0.08);
                border-radius: 12px;
                font-size: 64px;
            ">
                👤
            </div>
            """,
            unsafe_allow_html=True,
        )
        st.caption("Headshot unavailable")

def player_card(player, label, key):
    with st.container(border=True):
        st.caption(label)
        portrait, summary = st.columns([1, 3])
        with portrait:
            photo = get_player_headshot(player['league'], int(player['PLAYER_ID']))
            if photo:
                st.image(photo, width=96)
            else:
                st.caption('Photo unavailable')
        with summary:
            st.markdown(f"**{player['PLAYER_NAME']}**")
            st.caption(f"{player['league']} · {player['season']} · {player['role']}")
            st.markdown(f"**{player['PTS']:.1f}** PTS · **{player['REB']:.1f}** REB · **{player['AST']:.1f}** AST")
            st.caption(f"Per game · {int(player['GP'])} games · {player['MIN']:.1f} MPG")
        if st.button(f"View {player['PLAYER_NAME']}'s profile", key=key, width='stretch'):
            open_profile(player)


# ============================================================
# PROFILE PAGES
# ============================================================

def show_profile_table(player, kind, compact=False):
    path = PROFILE_DIR / (
        f"{player['league']}_{player['season']}_{kind}.csv"
    )

    if not path.exists():
        st.info(
            f"The {kind} dataset has not been downloaded. "
            "Run download_profile_stats.py."
        )
        return

    table = read_csv(str(path), path.stat().st_mtime_ns)

    match = table[
        table["PLAYER_ID"] == int(player["PLAYER_ID"])
    ]

    if match.empty:
        st.info("No record was found for this player in this dataset.")
        return

    row = match.iloc[0]
    fields = ADVANCED_FIELDS if kind == "advanced" else BASIC_FIELDS

    record = {
        "Season": str(player["season"]),
        "League": player["league"],
    }

    column_config = {
        "Season": st.column_config.TextColumn("Season"),
        "League": st.column_config.TextColumn("League"),
    }

    for field in fields:
        if field not in row.index or pd.isna(row[field]):
            continue

        value = float(row[field])

        if field.endswith("_PCT") or field == "PIE":
            # NBA Stats supplies turnover percentage on a 0–100 scale;
            # the other displayed percentage fields are fractions.
            record[field] = value if field == "TM_TOV_PCT" else value * 100
            column_config[field] = st.column_config.NumberColumn(
                field,
                format="%.1f%%",
            )

        elif field == "GP":
            record[field] = int(value)
            column_config[field] = st.column_config.NumberColumn(
                field,
                format="%d",
            )

        elif kind == "totals" and field != "MIN":
            record[field] = int(round(value))
            column_config[field] = st.column_config.NumberColumn(
                field,
                format="%d",
            )

        else:
            record[field] = value
            column_config[field] = st.column_config.NumberColumn(
                field,
                format="%.2f",
            )

    if compact:
        formatted = []
        for field, value in record.items():
            if field.endswith('_PCT') or field == 'PIE':
                value = f'{value:.1f}%'
            elif isinstance(value, float):
                value = f'{value:.2f}'
            formatted.append({'Statistic': STAT_NAMES.get(field, field), 'Value': str(value)})
        st.dataframe(pd.DataFrame(formatted), hide_index=True, width='stretch', height='auto')
    else:
        st.dataframe(pd.DataFrame([record]), hide_index=True, width='stretch', column_config=column_config)

    if kind == "advanced":
        st.caption(
            "Advanced statistics are supplied by NBA Stats. "
            "Ratings and pace depend on team and lineup context; "
            "they are not pure individual skill measurements."
        )


def profile_page(players):
    if st.button("← Back to comparisons"):
        back_to_search()

    try:
        player_id = int(st.query_params.get("player_id", ""))
    except (ValueError, TypeError):
        st.error("Invalid player ID.")
        return

    league = st.query_params.get("league", "")
    season = st.query_params.get("season", "")

    match = players[
        (players["PLAYER_ID"] == player_id)
        & (players["league"] == league)
        & (players["season"].astype(str) == season)
    ]

    if match.empty:
        st.error("This player-season could not be found.")
        return

    player = match.iloc[0]

    photo_column, title_column = st.columns([1, 4])

    with photo_column:
        show_player_headshot(player)

    with title_column:
        st.title(player["PLAYER_NAME"])
        st.caption(
            f"{player['league']} · {player['season']} regular season "
            f"· {player['role']}"
        )

    st.caption(
        "Headshot is the latest available image, not necessarily "
        "from the selected season."
    )

    compact = st.toggle("Compact stat tables", value=True)
    basic_tab, advanced_tab, totals_tab = st.tabs([
        "Basic — per game",
        "Advanced",
        "Season totals",
    ])

    with basic_tab:
        show_profile_table(player, "basic", compact)

    with advanced_tab:
        show_profile_table(player, "advanced", compact)

    with totals_tab:
        show_profile_table(player, "totals", compact)


# ============================================================
# INSPECTION PANEL
# ============================================================
def defensive_snapshot(players, player):
    """
    Build defensive context using model-eligible peers from the
    same league and season.

    Missing statistics remain unavailable, not zero.
    """
    peers = players[
        (players["league"] == player["league"])
        & (
            players["season"].astype(str)
            == str(player["season"])
        )
    ][
        ["PLAYER_ID", "MIN", "STL", "BLK"]
    ].copy()

    extra_sources = [
        ("basic", ["PF"]),
        ("advanced", ["DREB_PCT"]),
    ]

    for kind, requested_fields in extra_sources:
        path = PROFILE_DIR / (
            f"{player['league']}_{player['season']}_{kind}.csv"
        )

        if not path.exists():
            continue

        extra = read_csv(str(path), path.stat().st_mtime_ns)

        available_fields = [
            field
            for field in requested_fields
            if field in extra.columns
        ]

        if not available_fields:
            continue

        peers = peers.merge(
            extra[["PLAYER_ID"] + available_fields],
            on="PLAYER_ID",
            how="left",
            validate="one_to_one",
        )

    minutes = peers["MIN"].where(peers["MIN"] > 0)

    peers["STL_PER36"] = peers["STL"] / minutes * 36
    peers["BLK_PER36"] = peers["BLK"] / minutes * 36

    if "PF" in peers.columns:
        peers["PF_PER36"] = peers["PF"] / minutes * 36

    metric_definitions = {
        "STL_PER36": ("Steals per 36", False),
        "BLK_PER36": ("Blocks per 36", False),
        "DREB_PCT": ("Defensive rebound percentage", True),
        "PF_PER36": ("Fouls per 36", False),
    }

    player_match = peers.index[
        peers["PLAYER_ID"] == player["PLAYER_ID"]
    ]

    if len(player_match) != 1:
        return {}

    player_index = player_match[0]
    snapshot = {}

    for field, (label, is_percentage) in metric_definitions.items():
        if field not in peers.columns:
            continue

        value = peers.loc[player_index, field]

        if pd.isna(value):
            continue

        percentiles = peers[field].rank(
            method="average",
            pct=True,
        ) * 100

        snapshot[field] = {
            "label": label,
            "value": float(value),
            "percentile": float(percentiles.loc[player_index]),
            "is_percentage": is_percentage,
        }

    return snapshot


def render_defense_comparison(players, source, candidate, detail):
    source_stats = defensive_snapshot(players, source)
    candidate_stats = defensive_snapshot(players, candidate)

    metric_order = [
        "STL_PER36",
        "BLK_PER36",
        "DREB_PCT",
        "PF_PER36",
    ]

    labels = {
        "STL_PER36": "Steals per 36",
        "BLK_PER36": "Blocks per 36",
        "DREB_PCT": "Defensive rebound percentage",
        "PF_PER36": "Fouls per 36",
    }

    def display_value(record):
        if record is None:
            return "Unavailable"

        if record["is_percentage"]:
            return f"{record['value']:.1%}"

        return f"{record['value']:.2f}"

    def display_percentile(record):
        if record is None:
            return "Unavailable"

        return f"{record['percentile']:.1f}"

    rows = []

    for metric in metric_order:
        source_record = source_stats.get(metric)
        candidate_record = candidate_stats.get(metric)

        rows.append({
            "Metric": labels[metric],
            "Selected value": display_value(source_record),
            "Selected league percentile": display_percentile(source_record),
            "Counterpart value": display_value(candidate_record),
            "Counterpart league percentile": display_percentile(
                candidate_record
            ),
        })

    st.caption(
        f"Selected: {source['PLAYER_NAME']} · "
        f"Counterpart: {candidate['PLAYER_NAME']}"
    )

    st.dataframe(
        pd.DataFrame(rows),
        hide_index=True,
        width="stretch",
    )

    st.caption(
        "Percentiles are calculated among model-eligible players in "
        "each player's league and season with available data. "
        "A higher foul percentile means more fouls—not better defense. "
        "Per-36 rates adjust for playing time, not pace."
    )

    event_features = detail[
        detail["Component"] == "Defense"
    ]

    allocated_weight = event_features["Weight"].sum() * 100
    contribution_share = (
        event_features["Contribution share"].sum() * 100
    )

    st.markdown("#### How defense currently affects this comparison")

    st.write(
        f"The defensive component receives **{allocated_weight:.1f}% "
        f"of this pair's feature weight** and accounts for "
        f"**{contribution_share:.1f}% of its squared distance**."
    )

    st.dataframe(
        event_features[
            [
                "Feature",
                "Selected raw",
                "Counterpart raw",
                "Weighted squared difference",
            ]
        ],
        hide_index=True,
        width="stretch",
    )

    st.info(
        "Steals per 36, blocks per 36, and defensive rebound percentage "
        "now affect the ranking. Fouls per 36 remain contextual information "
        "and do not affect distance."
    )

    st.warning(
        "This is defensive box-score context, not a complete defensive "
        "evaluation. It does not measure matchup difficulty, positioning, "
        "switchability, rim deterrence, or defensive assignments."
    )
    
def render_inspection(players, profiles, source_index, candidate_index):
    source = players.loc[source_index]
    candidate = players.loc[candidate_index]

    detail, distance = comparison_breakdown(
        players,
        profiles,
        source_index,
        candidate_index,
    )

    with st.expander("How defensive emphasis affects this pairing"):
        emphasis_rows = []

        for player in [source, candidate]:
            emphasis_rows.append({
                "Player": player["PLAYER_NAME"],
                "Defensive profile standing": (
                    player["DEFENSIVE_PROFILE_STANDING"] * 100
                ),
                "Offensive profile standing": (
                    player["OFFENSIVE_PROFILE_STANDING"] * 100
                ),
                "Preferred defensive weight (%)": (
                    player["DEFENSE_WEIGHT"] * 100
                ),
            })

        st.dataframe(
            pd.DataFrame(emphasis_rows),
            hide_index=True,
            width="stretch",
        )

        pair_defensive_weight = (
            detail.loc[
                detail["Component"] == "Defense",
                "Weight",
            ].sum()
            * 100
        )

        st.write(
            f"**Defensive weight used for this pairing: "
            f"{pair_defensive_weight:.1f}%**"
        )

        st.caption(
            "Standing values are weighted summaries of league-relative "
            "feature percentiles, not overall player percentiles or "
            "validated offensive/defensive impact ratings."
        )

    st.subheader("Inspect why these two players are similar or different")
    st.caption(
        f"{source['PLAYER_NAME']} ↔ {candidate['PLAYER_NAME']} "
        f"· Distance: {distance:.3f}"
    )

    sample_rows = []

    for player in [source, candidate]:
        sample_rows.append({
            "Player": player["PLAYER_NAME"],
            "League": player["league"],
            "Games": int(player["GP"]),
            "MPG": float(player["MIN"]),
            "Estimated total minutes": (
                float(player["GP"]) * float(player["MIN"])
            ),
        })

    st.dataframe(
        pd.DataFrame(sample_rows),
        hide_index=True,
        width="stretch",
        column_config={
            "MPG": st.column_config.NumberColumn(format="%.1f"),
            "Estimated total minutes": st.column_config.NumberColumn(
                format="%.0f"
            ),
        },
    )

    contributions_tab, shots_tab, defense_tab, values_tab = st.tabs([
    "What drives the distance?",
    "Shot-selection comparison",
    "Defense & rebounding",
    "Model values",
])

    with contributions_tab:
        summary = (
            detail.groupby("Component", sort=False)
            .agg({
                "Weight": "sum",
                "Weighted squared difference": "sum",
                "Contribution share": "sum",
            })
            .reset_index()
        )

        summary["Allocated weight (%)"] = summary["Weight"] * 100
        summary["Share of squared distance (%)"] = (
            summary["Contribution share"] * 100
        )

        st.dataframe(
            summary[
                [
                    "Component",
                    "Allocated weight (%)",
                    "Weighted squared difference",
                    "Share of squared distance (%)",
                ]
            ],
            hide_index=True,
            width="stretch",
            column_config={
                "Allocated weight (%)": st.column_config.NumberColumn(
                    format="%.1f"
                ),
                "Weighted squared difference": (
                    st.column_config.NumberColumn(format="%.4f")
                ),
                "Share of squared distance (%)": (
                    st.column_config.NumberColumn(format="%.1f")
                ),
            },
        )

        st.caption(
            "The model starts with four equally weighted components. "
            "Defense can receive a modest increase from 25% to 30% based "
            "on a player's statistical emphasis. The two players' weighting "
            "preferences are averaged. Actual distance contributions depend "
            "on their feature differences."
        )

        feature_table = detail.copy()

        for column in ["Selected raw", "Counterpart raw"]:
            feature_table[column] = [
                format_feature(feature, value)
                for feature, value in zip(
                    feature_table["Feature code"],
                    feature_table[column],
                )
            ]

        feature_table["Weight (%)"] = feature_table["Weight"] * 100

        feature_table = feature_table[
            [
                "Feature",
                "Component",
                "Selected raw",
                "Counterpart raw",
                "Weight (%)",
                "Weighted squared difference",
            ]
        ].sort_values(
            "Weighted squared difference",
            ascending=False,
        )

        render_difference_table(feature_table)

        st.caption(
            "'Selected raw' refers to the searched player. "
            "'Counterpart raw' refers to the comparison player. "
            "Larger weighted squared differences make the pair less similar."
        )

    with shots_tab:
        locations = [
            "RIM_RATE",
            "PAINT_NON_RA_RATE",
            "MIDRANGE_RATE",
            "THREE_ZONE_RATE",
        ]

        figure = go.Figure()

        for player, color in [
            (source, "#38BDF8"),
            (candidate, "#FB7185"),
        ]:
            figure.add_trace(
                go.Bar(
                    name=player["PLAYER_NAME"],
                    x=[FEATURE_LABELS[f] for f in locations],
                    y=[float(player[f]) * 100 for f in locations],
                    marker_color=color,
                    hovertemplate=(
                        "%{x}<br>"
                        "Attempt share: %{y:.1f}%"
                        "<extra>%{fullData.name}</extra>"
                    ),
                )
            )

        figure.update_layout(
            barmode="group",
            height=390,
            yaxis={
                "title": "Share of field-goal attempts (%)",
                "range": [0, 100],
            },
            legend={"orientation": "h", "y": 1.12},
            margin={"l": 30, "r": 20, "t": 60, "b": 40},
        )

        st.plotly_chart(
            figure,
            width="stretch",
            key=f"shot_chart_{source_index}_{candidate_index}",
        )

        shot_rows = []

        for feature in SHOT_SELECTION:
            source_value = float(source[feature])
            candidate_value = float(candidate[feature])

            shot_rows.append({
                "Feature": FEATURE_LABELS[feature],
                "Selected (%)": source_value * 100,
                "Counterpart (%)": candidate_value * 100,
                "Difference (percentage points)": (
                    source_value - candidate_value
                ) * 100,
            })

        st.dataframe(
            pd.DataFrame(shot_rows),
            hide_index=True,
            width="stretch",
            column_config={
                "Selected (%)": st.column_config.NumberColumn(
                    format="%.1f"
                ),
                "Counterpart (%)": st.column_config.NumberColumn(
                    format="%.1f"
                ),
                "Difference (percentage points)": (
                    st.column_config.NumberColumn(format="%+.1f")
                ),
            },
        )

        st.info(
            "These statistics describe where players attempt shots, "
            "not their accuracy in each zone. The four location shares "
            "sum to 100%; FTA/FGA is a separate tendency."
        )

        st.caption(
            "Three-point-zone share uses location classifications and "
            "can differ slightly from official 3PA/FGA. Shot locations "
            "do not identify post-ups, cuts, handoffs, or transition."
        )
    
    with defense_tab:
        render_defense_comparison(
            players,
            source,
            candidate,
            detail,
        )

    with values_tab:
        st.dataframe(
            detail[
                [
                    "Feature",
                    "Component",
                    "Selected model value",
                    "Counterpart model value",
                    "Weight",
                    "Weighted squared difference",
                ]
            ],
            hide_index=True,
            width="stretch",
        )

        st.markdown("""
**How the model values are constructed**

- **Points and assists:** 50% standardized league percentile,
  25% league z-score, and 25% standardized regression residual.
- **Turnovers, usage, and TS%:** 50% league z-score and
  50% standardized regression residual.
- **Rebounding percentages, steals/36, blocks/36:** 50% league z-score and 50% standardized league percentile.
- **Regression:** ridge with role dummies, standardized minutes, and alpha 10.
- **Shot selection:** attempt shares on a shared cross-league scale,
  with each league given equal aggregate influence when fitting it.
- **Distance:** square root of the sum of weighted squared differences.
        """)


# ============================================================
# MAIN APP
# ============================================================

def select_example(index):
    st.session_state['player_search_clean_v3'] = index


def sync_comparison_url(query):
    st.session_state['comparison_query'] = query
    st.session_state['last_comparison_query'] = query
    if st.query_params.to_dict() != query:
        st.query_params.from_dict(query)


def restore_comparison_url(players):
    query = st.query_params.to_dict()
    if query == st.session_state.get('last_comparison_query'):
        return
    st.session_state['last_comparison_query'] = query
    try:
        shared = parse_comparison_query(players, query)
    except ValueError as exc:
        st.warning(f'{exc} Choose a player below to start a new comparison.')
        return
    if shared is None:
        return
    source, against, filters = shared
    st.session_state['player_search_clean_v3'] = source
    st.session_state['remembered_player'] = source
    target = 'NBA' if players.loc[source, 'league'] == 'WNBA' else 'WNBA'
    saved = {
        'number_of_results': filters['n'], 'same_role': filters['same_role'],
        'min_games': filters['games'], 'min_mpg': filters['mpg'],
        'min_total_minutes': filters['minutes'],
    }
    st.session_state.setdefault('saved_comparison_filters_v3', {})[target] = saved
    for key, value in saved.items():
        st.session_state[f'{key}_v3_{target}'] = value
    # Restore explicit manual comparisons even when they fall outside the filters.
    st.session_state['shared_candidate'] = (source, against)


def match_explanation(detail):
    gaps = (detail['Selected model value'] - detail['Counterpart model value']).abs()
    closest = detail.loc[gaps.nsmallest(2).index, 'Feature'].str.lower().tolist()
    components = detail.groupby('Component')['Contribution share'].sum().sort_values(ascending=False)
    st.markdown('**Closest traits:** ' + ' and '.join(closest) + ', after the model’s adjustments.')
    if components.sum() > 0:
        st.markdown(
            f"**Largest difference:** {components.index[0].lower()} accounts for "
            f"{components.iloc[0]:.0%} of squared distance."
        )
    st.caption('Closest traits are relative to the other features in this pairing; they do not imply equal ability.')


@st.cache_data(show_spinner=False, max_entries=256)
def cached_counterparts(players, profiles, player_id, league, same_role, min_games, min_mpg, min_total_minutes, model_version):
    return find_counterparts(players, profiles, player_id, league, n=len(players), same_role=same_role,
                             min_games=min_games, min_mpg=min_mpg, min_total_minutes=min_total_minutes)


@st.cache_data(show_spinner=False, max_entries=256)
def cached_sensitivity(players, profiles, source_index, candidate_indices, model_version):
    return sensitivity_results(players, profiles, source_index, players.loc[candidate_indices])


def main():
    apply_styles()
    if not DATA_PATH.exists():
        st.error('The prepared player dataset is unavailable.')
        st.stop()
    players, profiles = load_model(str(DATA_PATH), DATA_PATH.stat().st_mtime_ns, MODEL_VERSION)
    if st.query_params.get('view') == 'profile':
        profile_page(players)
        return
    if st.query_params.get('view') == 'review':
        render_blind_review(players)
        return
    restore_comparison_url(players)

    has_selection = st.session_state.get('player_search_clean_v3', st.session_state.get('remembered_player')) is not None
    if has_selection:
        st.subheader('NBA × WNBA Player Comps')
    else:
        st.caption('NBA × WNBA  /  A STUDY IN STATISTICAL RESEMBLANCE')
        st.title('Find their cross-league counterpart.')
        st.write('Explore who fills a similar statistical role in the other league — and what makes the match.')
    coverage = [f'{league} {season} · {len(group)} players' for (league, season), group in players.groupby(['league', 'season'])]
    st.caption('  |  '.join(coverage) + '  ·  Regular season')

    options = players.sort_values(['PLAYER_NAME', 'league', 'season']).index.tolist()
    def player_label(index):
        p = players.loc[index]
        return f"{p['PLAYER_NAME']} — {p['league']} ({p['season']})"

    remembered = st.session_state.get('remembered_player')
    selected_index = st.selectbox(
        'Search for a player', options, format_func=player_label,
        index=options.index(remembered) if remembered in options else None,
        placeholder='Start with a name…', key='player_search_clean_v3',
    )
    if selected_index is None:
        sync_comparison_url({})
        st.markdown('**Start with a familiar player**')
        for column, name in zip(st.columns(3), ["A'ja Wilson", 'Stephen Curry', 'Caitlin Clark']):
            match = players.index[players['PLAYER_NAME'].eq(name)]
            if len(match):
                column.button(f'Try {name}', key=f'example_{int(match[0])}', width='stretch',
                              on_click=select_example, args=(int(match[0]),))
        st.info('Statistical resemblance is not equivalent ability, a player ranking, or a prediction of performance in another league.')
        st.caption('Compare production, shooting tendencies, efficiency, and defensive box-score indicators. Every result can be inspected.')
        return

    st.session_state['remembered_player'] = selected_index
    selected = players.loc[selected_index]
    target_league = 'NBA' if selected['league'] == 'WNBA' else 'WNBA'
    saved_filters = st.session_state.setdefault('saved_comparison_filters_v3', {}).get(target_league, {})
    defaults = {'same_role': False, 'number_of_results': 5,
                'min_games': 40 if target_league == 'NBA' else 20,
                'min_mpg': 0.0, 'min_total_minutes': 0}
    for name, default in defaults.items():
        st.session_state.setdefault(f'{name}_v3_{target_league}', saved_filters.get(name, default))
    same_role = st.checkbox(
        'Only compare players in the same role',
        key=f'same_role_v3_{target_league}',
        help='Roles are Guard, Wing, or Big. This changes the candidate pool, not the distance formula.',
    )
    with st.expander('Playing-time filters and result count'):
        number_of_results = st.slider('Number of comparisons', 1, 10,
                                      key=f'number_of_results_v3_{target_league}')
        a, b, c = st.columns(3)
        min_games = a.number_input('Minimum games played', min_value=0, max_value=1000,
                                  key=f'min_games_v3_{target_league}')
        min_mpg = b.number_input('Minimum minutes per game', min_value=0.0, max_value=100.0,
                                step=1.0, key=f'min_mpg_v3_{target_league}')
        min_total_minutes = c.number_input('Minimum estimated total minutes', min_value=0, max_value=100000,
                                          step=100,
                                          key=f'min_total_minutes_v3_{target_league}')
        st.caption('These filters apply only to counterparts. Search eligibility requires 10 games, 10 MPG, about 200 total minutes, complete statistics, and a role. Total minutes are estimated as games × rounded MPG.')
    st.session_state['saved_comparison_filters_v3'][target_league] = {
        'number_of_results': number_of_results, 'same_role': same_role, 'min_games': min_games,
        'min_mpg': min_mpg, 'min_total_minutes': min_total_minutes,
    }
    filters = {'n': number_of_results, 'same_role': same_role, 'games': min_games, 'mpg': min_mpg, 'minutes': min_total_minutes}
    all_results = cached_counterparts(players, profiles, selected['PLAYER_ID'], selected['league'],
                                     same_role, min_games, min_mpg, min_total_minutes, MODEL_VERSION)
    if all_results.empty:
        sync_comparison_url(comparison_query(selected, None, filters))
        st.info('No counterparts meet these settings. Lower the games/minutes requirements or turn off the same-role restriction.')
        return
    results = all_results.head(number_of_results)
    state_key = f'comparison_choice_v3_{player_token(selected)}'
    picker_key = f'comparison_picker_v3_{player_token(selected)}'
    signature_key = f'filter_signature_{player_token(selected)}'
    other_players = players[players['league'].ne(selected['league'])].sort_values('PLAYER_NAME')
    comparison_options = other_players.index.tolist()
    signature = (same_role, min_games, min_mpg, min_total_minutes)
    if state_key not in st.session_state or st.session_state[state_key] not in comparison_options:
        st.session_state[state_key] = int(results.index[0])
    # Changing pool filters selects the new top result, making role comparisons immediate.
    if st.session_state.get(signature_key, signature) != signature:
        st.session_state[state_key] = int(results.index[0])
    st.session_state[signature_key] = signature
    shared = st.session_state.pop('shared_candidate', None)
    if shared and shared[0] == selected_index and shared[1] in comparison_options:
        st.session_state[state_key] = shared[1]
    st.session_state[picker_key] = st.session_state[state_key]

    with st.container(key='workspace'):
        results_column, comparison_column = st.columns([1, 2.2], gap='large')
        with results_column:
            st.subheader('Closest matches')
            st.caption(f"{len(all_results)} eligible {target_league} counterparts · {'Same role: ' + selected['role'] if same_role else 'All roles'}")
            st.caption('Lower distance = closer statistical profile. It is not a similarity percentage.')
            for rank, (candidate_index, result) in enumerate(results.iterrows(), 1):
                candidate = players.loc[candidate_index]
                with st.container(border=True):
                    st.button(f"{rank:02d} · {result['PLAYER_NAME']}",
                              key=f'select_comparison_button_{selected_index}_{candidate_index}',
                              type='primary' if candidate_index == st.session_state[state_key] else 'secondary',
                              width='stretch', on_click=choose_comparison,
                              args=(candidate_index, state_key, picker_key))
                    st.caption(f"{candidate['role']} · {int(candidate['GP'])} games · Distance {result['distance']:.3f}")
            with st.expander('Choose any counterpart'):
                st.selectbox('Currently comparing against', comparison_options, format_func=player_label,
                             key=picker_key, on_change=comparison_picker_changed, args=(state_key, picker_key))
                st.caption('Manual comparisons can include players outside the ranked list or its filters.')

        active_index = st.session_state[state_key]
        active_player = players.loc[active_index]
        detail, distance = comparison_breakdown(players, profiles, selected_index, active_index)
        query = comparison_query(selected, active_player, filters)
        sync_comparison_url(query)
        with comparison_column:
            st.subheader(f"{selected['PLAYER_NAME']} vs. {active_player['PLAYER_NAME']}")
            st.caption(f'Distance {distance:.3f} · Statistical resemblance, not equal ability.')
            if active_index not in results.index:
                st.info('This manual comparison is outside the displayed ranked list. Your filters still apply to the list.')
            with st.container(key='player_pair'):
                left, right = st.columns(2)
                with left:
                    player_card(selected, 'SEARCHED PLAYER', 'searched_player_profile')
                with right:
                    player_card(active_player, 'COUNTERPART', f'open_profile_button_{selected_index}_{active_index}')
            low_samples = [p for p in [selected, active_player] if p['GP'] < (40 if p['league'] == 'NBA' else 20)]
            if low_samples:
                st.warning('Limited sample: ' + '; '.join(f"{p['PLAYER_NAME']} has {int(p['GP'])} games" for p in low_samples)
                           + '. Search and manual selection allow smaller samples than the default counterpart filters.')
            chart_view = st.radio('Profile view', ['Overview', 'All features', 'Radar'], horizontal=True, key='profile_view')
            if chart_view == 'Radar':
                figure = radar_chart(players, profiles, selected_index, active_index)
            else:
                figure = profile_chart(players, profiles, selected_index, active_index, overview=chart_view == 'Overview')
            st.plotly_chart(figure, width='stretch', config={'displayModeBar': False})
            st.caption('Display-only percentiles across eligible model profiles. Overview averages the feature percentiles in each component; it is not a component rating. Weights are not shown, and higher is not always better.')
            with st.container(border=True):
                match_explanation(detail)
            with st.expander('Share this comparison'):
                st.write('Copy this link to reopen both players, role policy, and playing-time filters.')
                st.code(comparison_url(query), language=None, wrap_lines=True)

    st.divider()
    with st.expander('Explore the match in detail'):
        render_inspection(players, profiles, selected_index, active_index)
    with st.expander('How stable is this match?'):
        st.write('Explore how the ranking responds to small changes in the model’s assumptions.')
        if st.checkbox('Run weight-sensitivity check', key='show_sensitivity'):
            base_top, experiments = cached_sensitivity(players, profiles, selected_index, all_results.index.tolist(), MODEL_VERSION)
            retained = int(experiments.iloc[:8]['First match'].eq(base_top).sum())
            st.markdown(f'**{base_top} stays first in {retained} of 8 weight variations.**')
            st.dataframe(experiments, hide_index=True, width='stretch')
            st.caption('Each variation scales one component by ±20% and renormalizes all pair weights. The additional baseline fixes defense at 25%. The candidate pool and transformed profiles stay fixed. Top-five overlap compares each experiment with the current model. This is sensitivity, not a confidence interval or validated accuracy; it does not change the matches above.')
    with st.expander('Model lab · experimental comparisons'):
        render_lab(players, profiles, selected_index, all_results.index.tolist())
    with st.expander('Methodology and limitations'):
        st.markdown('''
- **Production:** points, assists, turnovers, usage, and offensive rebound percentage.
- **Shooting:** four shot-location shares plus free-throw attempts / field-goal attempts.
- **Efficiency:** true shooting percentage. **Defense:** steals and blocks per 36, and defensive rebound percentage.
- Points and assists blend standardized league percentiles (50%), league z-scores (25%), and standardized ridge residuals (25%). Turnovers, usage, and true shooting blend z-scores and residuals equally. Ridge uses role dummies and standardized minutes, with alpha 10.
- Rebounding percentages, steals, and blocks blend league z-scores and standardized percentiles equally. Shooting shares use a common scale fitted with equal aggregate weight per league.
- The four components begin at 25% each; defense can rise to 30%. These are assumptions, not learned measures of importance. Correlated features can count similar traits more than once.
- Per-game production and per-36 defense do not fully control pace or opportunity. Size, play types, off-ball movement, and defensive assignments are absent. A nearest match may still be very different.
- Rankings have not been independently validated against expert labels. The model lab resamples real games for a separate rate baseline; it does not estimate uncertainty for full v3. Sensitivity and resampling are diagnostics, not evidence of accuracy.
        ''')
        st.link_button('NBA Stats glossary', 'https://www.nba.com/stats/help/glossary')


if __name__ == '__main__':
    main()
