import numpy as np
import pandas as pd

from sklearn.preprocessing import StandardScaler

import similarity as previous_model


MODEL_VERSION = "v3-defense-adaptive-25-to-30"

PRODUCTION = [
    "PTS",
    "AST",
    "TOV",
    "USG_PCT",
    "OREB_PCT",
]

SHOT_SELECTION = list(previous_model.SHOT_SELECTION)

EFFICIENCY = ["TS_PCT"]

DEFENSE = [
    "STL_PER36",
    "BLK_PER36",
    "DREB_PCT",
]

FEATURES = PRODUCTION + SHOT_SELECTION + EFFICIENCY + DEFENSE

FEATURE_LABELS = {
    **previous_model.FEATURE_LABELS,
    "OREB_PCT": "Offensive rebound percentage",
    "STL_PER36": "Steals per 36",
    "BLK_PER36": "Blocks per 36",
    "DREB_PCT": "Defensive rebound percentage",
}

FEATURE_COMPONENTS = {
    **{f: "Offensive production" for f in PRODUCTION},
    **{f: "Shot selection" for f in SHOT_SELECTION},
    **{f: "Efficiency" for f in EFFICIENCY},
    **{f: "Defense" for f in DEFENSE},
}


def defensive_feature_weights(role):
    """
    Relative importance inside the defensive component.
    These weights sum to one.
    """
    choices = {
        "Guard": [0.60, 0.15, 0.25],
        "Wing": [0.45, 0.30, 0.25],
        "Big": [0.20, 0.50, 0.30],
    }

    if role not in choices:
        raise ValueError(f"Unknown role: {role}")

    return pd.Series(choices[role], index=DEFENSE)


def player_feature_weights(player):
    """
    Final weights for one player's comparison preferences.
    Pairwise weights are the average of the two players' weights.
    """
    defense_share = float(player["DEFENSE_WEIGHT"])
    other_share = (1.0 - defense_share) / 3.0

    production = pd.Series(1.0, index=PRODUCTION)

    if player["role"] == "Guard":
        production["AST"] = 1.5

    elif player["role"] == "Wing":
        production["PTS"] = 1.25

    elif player["role"] == "Big":
        production["OREB_PCT"] = 1.5

    weights = pd.Series(0.0, index=FEATURES)

    weights.loc[PRODUCTION] = (
        other_share * production / production.sum()
    )

    weights.loc[SHOT_SELECTION] = (
        other_share / len(SHOT_SELECTION)
    )

    weights.loc[EFFICIENCY] = (
        other_share / len(EFFICIENCY)
    )

    weights.loc[DEFENSE] = (
        defense_share * defensive_feature_weights(player["role"])
    )

    return weights


def build_profiles(raw):
    required = {"OREB_PCT", "DREB_PCT"}
    missing = required - set(raw.columns)

    if missing:
        raise ValueError(
            f"Missing columns: {sorted(missing)}. "
            "Run enrich_defense_data.py."
        )

    # Keep the established production and shooting transformations.
    # The previous module retains its own feature definitions.
    players, old_profiles, models = previous_model.build_profiles(raw)

    added_fields = ["OREB_PCT", "DREB_PCT"]

    if players[added_fields].isna().any().any():
        raise ValueError(
            "Eligible players have missing rebounding percentages."
        )

    if not np.isfinite(
        players[added_fields].to_numpy(dtype=float)
    ).all():
        raise ValueError("Non-finite rebounding percentages found.")

    if (
        players[added_fields].lt(0).any().any()
        or players[added_fields].gt(1).any().any()
    ):
        raise ValueError(
            "Rebounding percentages must use the 0–1 scale."
        )

    players["STL_PER36"] = (
        players["STL"] / players["MIN"] * 36
    )
    players["BLK_PER36"] = (
        players["BLK"] / players["MIN"] * 36
    )

    profiles = old_profiles.reindex(columns=FEATURES).copy()

    players["DEFENSIVE_PROFILE_STANDING"] = np.nan
    players["OFFENSIVE_PROFILE_STANDING"] = np.nan
    players["DEFENSE_WEIGHT"] = np.nan

    new_features = ["OREB_PCT"] + DEFENSE

    for league, group in players.groupby("league"):
        # New defensive/rebounding features use league context,
        # without regressing away their positional characteristics.
        league_z = StandardScaler().fit_transform(
            group[new_features]
        )

        ranks = group[new_features].rank(
            method="average",
            pct=True,
        )

        rank_z = StandardScaler().fit_transform(ranks)

        profiles.loc[group.index, new_features] = (
            0.50 * league_z + 0.50 * rank_z
        )

        # Build a modest emphasis proxy—not an impact rating.
        offensive_inputs = pd.DataFrame(
            {
                "SCORING_RATE": group["PTS"] / group["MIN"] * 36,
                "ASSIST_RATE": group["AST"] / group["MIN"] * 36,
                "TS_PCT": group["TS_PCT"],
            },
            index=group.index,
        )

        offensive_ranks = offensive_inputs.rank(
            method="average",
            pct=True,
        )

        offensive_standing = (
            0.40 * offensive_ranks["SCORING_RATE"]
            + 0.20 * offensive_ranks["ASSIST_RATE"]
            + 0.40 * offensive_ranks["TS_PCT"]
        )

        defensive_ranks = group[DEFENSE].rank(
            method="average",
            pct=True,
        )

        for index, player in group.iterrows():
            defense_standing = float(
                (
                    defensive_ranks.loc[index]
                    * defensive_feature_weights(player["role"])
                ).sum()
            )

            offense_standing = float(offensive_standing.loc[index])

            # No boost if the defensive proxy is lower.
            # A 30-percentile-point advantage reaches the maximum boost.
            advantage = np.clip(
                (defense_standing - offense_standing) / 0.30,
                0.0,
                1.0,
            )

            defense_weight = 0.25 + 0.05 * advantage

            players.loc[
                index, "DEFENSIVE_PROFILE_STANDING"
            ] = defense_standing

            players.loc[
                index, "OFFENSIVE_PROFILE_STANDING"
            ] = offense_standing

            players.loc[index, "DEFENSE_WEIGHT"] = defense_weight

    if not np.isfinite(
        profiles[FEATURES].to_numpy(dtype=float)
    ).all():
        raise ValueError("Incomplete transformed profiles.")

    return players, profiles, models


def comparison_breakdown(df, profiles, source_index, candidate_index):
    source = df.loc[source_index]
    candidate = df.loc[candidate_index]

    # Symmetric weighting: A vs B equals B vs A.
    weights = (
        player_feature_weights(source)
        + player_feature_weights(candidate)
    ) / 2

    source_values = profiles.loc[source_index, FEATURES].astype(float)
    candidate_values = profiles.loc[candidate_index, FEATURES].astype(float)

    differences = source_values - candidate_values
    contributions = weights * differences.pow(2)

    total = float(contributions.sum())

    detail = pd.DataFrame({
        "Feature code": FEATURES,
        "Feature": [FEATURE_LABELS[f] for f in FEATURES],
        "Component": [FEATURE_COMPONENTS[f] for f in FEATURES],
        "Selected raw": source[FEATURES].astype(float).to_numpy(),
        "Counterpart raw": candidate[FEATURES].astype(float).to_numpy(),
        "Selected model value": source_values.to_numpy(),
        "Counterpart model value": candidate_values.to_numpy(),
        "Weight": weights.to_numpy(),
        "Weighted squared difference": contributions.to_numpy(),
    })

    detail["Contribution share"] = (
        detail["Weighted squared difference"] / total
        if total > 0
        else 0.0
    )

    return detail, float(np.sqrt(total))


def find_counterparts(
    df,
    profiles,
    player_id,
    league,
    n=5,
    same_role=False,
    min_games=0,
    min_mpg=0.0,
    min_total_minutes=0.0,
):
    matches = df.index[
        (df["PLAYER_ID"] == player_id)
        & (df["league"] == league)
    ]

    if len(matches) != 1:
        raise ValueError("Expected one eligible source player.")

    source_index = matches[0]
    source = df.loc[source_index]

    candidates = df[df["league"] != league].copy()

    if same_role:
        candidates = candidates[
            candidates["role"] == source["role"]
        ].copy()

    candidates = candidates[
        (candidates["GP"] >= min_games)
        & (candidates["MIN"] >= min_mpg)
        & (
            candidates["GP"] * candidates["MIN"]
            >= min_total_minutes
        )
    ].copy()

    distances = []

    for candidate_index in candidates.index:
        _, distance = comparison_breakdown(
            df,
            profiles,
            source_index,
            candidate_index,
        )
        distances.append(distance)

    candidates["distance"] = distances

    return candidates.nsmallest(n, "distance")[
        ["PLAYER_ID", "PLAYER_NAME", "league", "role", "distance"]
    ]