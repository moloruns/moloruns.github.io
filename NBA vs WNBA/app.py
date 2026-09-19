import json

from pathlib import Path

from io import BytesIO

import requests
from PIL import Image

import pandas as pd
import plotly.graph_objects as go
import streamlit as st

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
    /* The joined player-button/profile-button control. */
    [class*="st-key-comparison_cell_"]
    [data-testid="stHorizontalBlock"] {
        gap: 0 !important;
        flex-wrap: nowrap !important;
        align-items: stretch !important;
    }

    /* Let the main player button take all remaining space. */
    [class*="st-key-comparison_cell_"]
    [data-testid="stHorizontalBlock"]
    > [data-testid="stColumn"]:first-child {
        flex: 1 1 0% !important;
        min-width: 0 !important;
    }

    /* Fixed-width square at the right edge. */
    [class*="st-key-comparison_cell_"]
    [data-testid="stHorizontalBlock"]
    > [data-testid="stColumn"]:last-child {
        flex: 0 0 48px !important;
        width: 48px !important;
        min-width: 48px !important;
        max-width: 48px !important;
    }

    [class*="st-key-comparison_select_"] button {
        width: 100% !important;
        min-height: 48px !important;
        border-radius: 9px 0 0 9px !important;
        margin: 0 !important;
        justify-content: flex-start !important;
        padding-left: 16px !important;
    }

    [class*="st-key-comparison_select_"] button p {
        text-align: left !important;
    }

    [class*="st-key-comparison_profile_"] button {
        width: 48px !important;
        min-width: 48px !important;
        height: 48px !important;
        min-height: 48px !important;
        border-radius: 0 9px 9px 0 !important;
        background-color: #cbd5e1 !important;
        color: #0f172a !important;
        border: 1px solid #94a3b8 !important;
        padding: 0 !important;
        margin: 0 !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
    }

    [class*="st-key-comparison_profile_"] button * {
        color: #0f172a !important;
    }

    [class*="st-key-comparison_profile_"] button:hover {
        background-color: #f1f5f9 !important;
        border-color: #38bdf8 !important;
    }

    [class*="st-key-comparison_profile_"] button:focus-visible {
        outline: 3px solid #38bdf8 !important;
        outline-offset: 2px;
    }

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
        "view": "profile",
        "league": str(player["league"]),
        "player_id": str(int(player["PLAYER_ID"])),
        "season": str(player["season"]),
    })
    st.rerun()


def back_to_search():
    st.query_params.clear()
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

    st.html(table_html)


# ============================================================
# RADAR AND PLAYER CARDS
# ============================================================

def radar_chart(players, profiles, left_index, right_index):
    # Display-only ranks across the combined eligible player pool.
    percentiles = profiles.rank(
        method="average",
        pct=True,
    ) * 100

    labels = [FEATURE_LABELS[feature] for feature in FEATURES]
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
                    "<b>%{theta}</b><br>"
                    "Model-profile percentile: %{r:.1f}<br>"
                    "Original statistic: %{customdata[0]}<br>"
                    "Model feature: %{customdata[1]:.2f}"
                    "<extra>%{fullData.name}</extra>"
                ),
            )
        )

    figure.update_layout(
        height=550,
        margin={"l": 75, "r": 75, "t": 35, "b": 75},
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
            use_container_width=True,
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
    st.caption(label)
    st.subheader(player["PLAYER_NAME"])
    st.caption(
        f"{player['league']} · {player['season']} · {player['role']}"
    )

    st.metric("Points", f"{player['PTS']:.1f}")
    st.metric("Rebounds", f"{player['REB']:.1f}")
    st.metric("Assists", f"{player['AST']:.1f}")

    if st.button(
        "View profile",
        key=key,
        use_container_width=True,
    ):
        open_profile(player)


# ============================================================
# PROFILE PAGES
# ============================================================

def show_profile_table(player, kind):
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
            record[field] = value * 100
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

    st.dataframe(
        pd.DataFrame([record]),
        hide_index=True,
        use_container_width=True,
        column_config=column_config,
    )

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

    st.title(player["PLAYER_NAME"])
    st.caption(
        f"{player['league']} · {player['season']} regular season "
        f"· {player['role']}"
    )

    basic_tab, advanced_tab, totals_tab = st.tabs([
        "Basic — per game",
        "Advanced",
        "Season totals",
    ])

    with basic_tab:
        show_profile_table(player, "basic")

    with advanced_tab:
        show_profile_table(player, "advanced")

    with totals_tab:
        show_profile_table(player, "totals")


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
        use_container_width=True,
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
        use_container_width=True,
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
            use_container_width=True,
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
        use_container_width=True,
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
            use_container_width=True,
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
            use_container_width=True,
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
            use_container_width=True,
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
            use_container_width=True,
        )

        st.markdown("""
**How the model values are constructed**

- **Points, rebounds, assists:** 50% standardized league percentile,
  25% league z-score, and 25% standardized regression residual.
- **Other production features and TS%:** 50% league z-score and
  50% standardized regression residual.
- **Shot selection:** attempt shares on a shared cross-league scale,
  with each league given equal aggregate influence when fitting it.
- **Distance:** square root of the sum of weighted squared differences.
        """)


# ============================================================
# MAIN APP
# ============================================================

def main():
    apply_styles()

    if not DATA_PATH.exists():
        st.error("Run make_player_seasons.py before launching the app.")
        st.stop()

    players, profiles = load_model(
        str(DATA_PATH),
        DATA_PATH.stat().st_mtime_ns,
        MODEL_VERSION,
    )

    if st.query_params.get("view") == "profile":
        profile_page(players)
        return

    st.title("🏀 Cross-League Player Comps")
    st.write(
        "Search for a player to find their closest cross-league counterparts."
    )

    options = players.sort_values(
        ["PLAYER_NAME", "league", "season"]
    ).index.tolist()

    def player_label(index):
        player = players.loc[index]
        return (
            f"{player['PLAYER_NAME']} "
            f"— {player['league']} ({player['season']})"
        )

    remembered = st.session_state.get("remembered_player")

    default_index = (
        options.index(remembered)
        if remembered in options
        else None
    )

    selected_index = st.selectbox(
        "Search for a player",
        options=options,
        format_func=player_label,
        index=default_index,
        placeholder="Type a player's name...",
        key="player_search_clean_v3",
    )

    if selected_index is None:
        return

    st.session_state["remembered_player"] = selected_index

    selected = players.loc[selected_index]
    target_league = "NBA" if selected["league"] == "WNBA" else "WNBA"

    # These copies survive navigation to the profile page, where
    # Streamlit temporarily removes the filter widgets.
    all_saved_filters = st.session_state.setdefault(
        "saved_comparison_filters_v3", {}
    )

    saved_filters = all_saved_filters.get(target_league, {})

    default_min_games = 40 if target_league == "NBA" else 20

    with st.expander("Comparison settings and eligibility filters"):
        number_of_results = st.slider(
            "Number of comparisons",
            min_value=1,
            max_value=10,
            value=int(saved_filters.get("number_of_results", 5)),
            key=f"number_of_results_v3_{target_league}",
        )

        same_role = st.checkbox(
            "Only compare players in the same role",
            value=bool(saved_filters.get("same_role", False)),
            key=f"same_role_v3_{target_league}",
        )

        st.markdown(f"#### Filter {target_league} counterparts")
        st.caption(
            "Filters change the candidate pool, not the similarity "
            "formula or the searched player."
        )

        games_col, mpg_col, minutes_col = st.columns(3)

        with games_col:
            min_games = st.number_input(
                "Minimum games played",
                min_value=0,
                value=int(saved_filters.get("min_games", default_min_games)),
                step=1,
                key=f"min_games_v3_{target_league}",
                help=(
                    "Defaults to 40 games for NBA counterparts "
                    "and 20 games for WNBA counterparts."
                ),
            )

        with mpg_col:
            min_mpg = st.number_input(
                "Minimum minutes per game",
                min_value=0.0,
                value=float(saved_filters.get("min_mpg", 0.0)),
                step=1.0,
                key=f"min_mpg_v3_{target_league}",
                help="Playing opportunity, not a measure of player quality.",
            )

        with minutes_col:
            min_total_minutes = st.number_input(
                "Minimum estimated total minutes",
                min_value=0,
                value=int(saved_filters.get("min_total_minutes", 0)),
                step=100,
                key=f"min_total_minutes_v3_{target_league}",
                help=(
                    "Games played × rounded minutes per game. "
                    "This approximates exact season minutes."
                ),
            )

        st.caption(
            "Zero adds no restriction. The model still requires at least "
            "10 games, 10 MPG, approximately 200 total minutes, complete "
            "statistics, and a role assignment."
        )

    all_saved_filters[target_league] = {
        "number_of_results": int(number_of_results),
        "same_role": bool(same_role),
        "min_games": int(min_games),
        "min_mpg": float(min_mpg),
        "min_total_minutes": int(min_total_minutes),
    }

    results = find_counterparts(
        df=players,
        profiles=profiles,
        player_id=selected["PLAYER_ID"],
        league=selected["league"],
        n=int(number_of_results),
        same_role=bool(same_role),
        min_games=int(min_games),
        min_mpg=float(min_mpg),
        min_total_minutes=float(min_total_minutes),
    )

    if results.empty:
        st.info(
            "No counterparts meet these settings. Lower the games/minutes "
            "requirements or turn off the same-role restriction."
        )
        return

    closest_index = results.index[0]

    other_players = players[
        players["league"] != selected["league"]
    ].sort_values("PLAYER_NAME")

    comparison_options = other_players.index.tolist()

    # Permanent comparison selection, separate from the temporary widget.
    source_token = (
        f"{selected['league']}_"
        f"{int(selected['PLAYER_ID'])}_"
        f"{selected['season']}"
    )

    state_key = f"comparison_choice_v3_{source_token}"
    picker_key = f"comparison_picker_v3_{source_token}"
    filter_key = f"comparison_filter_signature_v3_{source_token}"

    if (
        state_key not in st.session_state
        or st.session_state[state_key] not in comparison_options
    ):
        st.session_state[state_key] = closest_index

    filter_signature = (
        bool(same_role),
        int(min_games),
        float(min_mpg),
        float(min_total_minutes),
    )

    # Reset only if changed filters actually exclude the active player.
    if st.session_state.get(filter_key) != filter_signature:
        current = players.loc[st.session_state[state_key]]

        passes_filters = (
            float(current["GP"]) >= min_games
            and float(current["MIN"]) >= min_mpg
            and (
                float(current["GP"]) * float(current["MIN"])
                >= min_total_minutes
            )
            and (
                not same_role
                or current["role"] == selected["role"]
            )
        )

        if not passes_filters:
            st.session_state[state_key] = closest_index

        st.session_state[filter_key] = filter_signature

    active_index = st.session_state[state_key]

    # Synchronize before the picker widget is rendered.
    st.session_state[picker_key] = active_index

    # --------------------------------------------------------
    # JOINED COMPARISON CELLS
    # --------------------------------------------------------

    st.divider()
    st.subheader("Player comparisons")
    st.caption(
        "Click the main part of a cell to update the comparison below. "
        "Click the lighter person-icon square to open the player's profile."
    )

    for rank, (candidate_index, result) in enumerate(
        results.iterrows(),
        start=1,
    ):
        candidate = players.loc[candidate_index]
        row_token = f"{selected_index}_{candidate_index}"
        is_active = candidate_index == active_index

        subtitle = (
            f"{candidate['league']} · "
            f"{candidate['season']} · "
            f"{candidate['role']}"
        )

        # Quoted CSS strings for the secondary text and distance.
        subtitle_css = json.dumps(subtitle, ensure_ascii=False)
        distance_css = json.dumps(f"{result['distance']:.3f}")

        background = "#142b40" if is_active else "#131820"
        border_color = "#38bdf8" if is_active else "#39424e"

        st.html(f"""
        <style>
        .st-key-comparison_select_{row_token} button {{
            position: relative !important;
            min-height: 88px !important;
            height: 88px !important;
            padding: 12px 130px 34px 20px !important;
            justify-content: flex-start !important;
            align-items: center !important;
            background: {background} !important;
            border-color: {border_color} !important;
            color: #f1f5f9 !important;
        }}

        .st-key-comparison_select_{row_token} button p {{
            font-size: 1.05rem !important;
            text-align: left !important;
        }}

        .st-key-comparison_select_{row_token} button::after {{
            content: {subtitle_css};
            position: absolute;
            left: 20px;
            bottom: 14px;
            font-size: 0.80rem;
            font-weight: 400;
            color: #a8b5c7;
            pointer-events: none;
        }}

        .st-key-comparison_select_{row_token} button::before {{
            content: "DISTANCE\\A" {distance_css};
            white-space: pre;
            position: absolute;
            right: 20px;
            top: 23px;
            text-align: right;
            font-size: 0.82rem;
            font-weight: 500;
            line-height: 1.6;
            color: #cbd5e1;
            pointer-events: none;
        }}

        .st-key-comparison_select_{row_token} button:hover {{
            background: #1b2a3b !important;
            border-color: #7dd3fc !important;
        }}

        .st-key-comparison_profile_{row_token} button {{
            height: 88px !important;
            min-height: 88px !important;
            background: #dbe4ee !important;
        }}
        </style>
        """)

        with st.container(key=f"comparison_cell_{row_token}"):
            main_cell, icon_cell = st.columns(
                [12, 1],
                gap="small",
                vertical_alignment="center",
            )

            with main_cell:
                with st.container(key=f"comparison_select_{row_token}"):
                    st.button(
                        f"{rank:02d} · **{result['PLAYER_NAME']}**",
                        key=f"select_comparison_button_{row_token}",
                        type="secondary",
                        help=(
                            f"Compare with {result['PLAYER_NAME']}. "
                            f"{subtitle}. "
                            f"Distance: {result['distance']:.3f}"
                        ),
                        use_container_width=True,
                        on_click=choose_comparison,
                        args=(candidate_index, state_key, picker_key),
                    )

            with icon_cell:
                with st.container(key=f"comparison_profile_{row_token}"):
                    if st.button(
                        "",
                        icon=":material/person:",
                        key=f"open_profile_button_{row_token}",
                        help=f"Open {result['PLAYER_NAME']}'s season profile",
                        use_container_width=True,
                    ):
                        open_profile(players.loc[candidate_index])

    # --------------------------------------------------------
    # OPTIONAL MANUAL COUNTERPART SELECTION
    # --------------------------------------------------------

    st.divider()

    st.selectbox(
        "Currently comparing against",
        options=comparison_options,
        format_func=player_label,
        key=picker_key,
        on_change=comparison_picker_changed,
        args=(state_key, picker_key),
        help=(
            "This selector also allows inspection of model-eligible "
            "players outside your filtered ranked results."
        ),
    )

    active_index = st.session_state[state_key]
    active_player = players.loc[active_index]

    _, active_distance = comparison_breakdown(
        players,
        profiles,
        selected_index,
        active_index,
    )

    if active_index not in results.index:
        st.caption(
            "This manually selected player is outside the displayed "
            "ranked list. The list follows your filters and result count."
        )

    # --------------------------------------------------------
    # ACTIVE RADAR
    # --------------------------------------------------------

    st.subheader(
        f"{selected['PLAYER_NAME']} vs. {active_player['PLAYER_NAME']}"
    )

    left, middle, right = st.columns([1, 2.6, 1])

    with left:
        player_card(
            selected,
            "Searched player",
            "searched_player_profile",
        )

    with middle:
        st.plotly_chart(
            radar_chart(
                players,
                profiles,
                selected_index,
                active_index,
            ),
            use_container_width=True,
            key=f"radar_{selected_index}_{active_index}",
        )

    with right:
        player_card(
            active_player,
            "Selected counterpart",
            "active_counterpart_profile",
        )
        st.caption(f"Distance: {active_distance:.3f}")

        st.caption(
        "Radar values are display-only percentiles of model features "
        "across the combined eligible player pool. Production and "
        "efficiency are league-adjusted; shot-selection features use "
        "a shared cross-league scale. The radar does not visually "
        "apply feature weights, and larger values do not necessarily "
        "indicate better performance."
    )

    # --------------------------------------------------------
    # ACTIVE COMPARISON EXPLANATION
    # --------------------------------------------------------

    st.divider()

    render_inspection(
        players,
        profiles,
        selected_index,
        active_index,
    )


if __name__ == "__main__":
    main()