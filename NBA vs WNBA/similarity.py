import numpy as np
import pandas as pd

from sklearn.linear_model import Ridge
from sklearn.preprocessing import StandardScaler


MODEL_VERSION = "shot-zones-v2-pra-50-25-25"

PRODUCTION = [
    "PTS",
    "AST",
    "REB",
    "STL",
    "BLK",
    "TOV",
    "USG_PCT",
]

SHOT_SELECTION = [
    "RIM_RATE",
    "PAINT_NON_RA_RATE",
    "MIDRANGE_RATE",
    "THREE_ZONE_RATE",
    "FT_RATE",
]

EFFICIENCY = [
    "TS_PCT",
]

FEATURES = PRODUCTION + SHOT_SELECTION + EFFICIENCY
PRA_FEATURES = {"PTS", "REB", "AST"}

FEATURE_LABELS = {
    "PTS": "Points",
    "AST": "Assists",
    "REB": "Rebounds",
    "STL": "Steals",
    "BLK": "Blocks",
    "TOV": "Turnovers",
    "USG_PCT": "Usage",
    "RIM_RATE": "Restricted-area share",
    "PAINT_NON_RA_RATE": "Other-paint share",
    "MIDRANGE_RATE": "Midrange share",
    "THREE_ZONE_RATE": "Three-point-zone share",
    "FT_RATE": "FTA / FGA",
    "TS_PCT": "True shooting",
}

FEATURE_COMPONENTS = {
    **{feature: "Production / responsibility" for feature in PRODUCTION},
    **{feature: "Shot selection" for feature in SHOT_SELECTION},
    **{feature: "Efficiency" for feature in EFFICIENCY},
}


def feature_weights(role):
    """Return final feature weights, which sum to one."""
    if role not in {"Guard", "Wing", "Big"}:
        raise ValueError(f"Unknown role: {role}")

    production = pd.Series(1.0, index=PRODUCTION)

    if role == "Guard":
        production["AST"] = 1.5
        production["BLK"] = 0.5

    elif role == "Wing":
        production["PTS"] = 1.25

    elif role == "Big":
        production["REB"] = 1.5
        production["BLK"] = 1.5

    weights = pd.Series(0.0, index=FEATURES)

    weights.loc[PRODUCTION] = (
        (1 / 3) * production / production.sum()
    )

    weights.loc[SHOT_SELECTION] = (
        (1 / 3) / len(SHOT_SELECTION)
    )

    weights.loc[EFFICIENCY] = (
        (1 / 3) / len(EFFICIENCY)
    )

    return weights


def build_profiles(raw):
    df = raw.copy()

    required = {
        "PLAYER_ID", "PLAYER_NAME", "league", "season", "role",
        "GP", "MIN", "PTS", "AST", "REB", "STL", "BLK",
        "TOV", "FGA", "FTA", "USG_PCT",
        *SHOT_SELECTION,
    }

    missing_columns = required - set(df.columns)

    if missing_columns:
        raise ValueError(
            f"Missing columns: {sorted(missing_columns)}. "
            "Run the usage and shot-selection enrichment scripts."
        )

    df["season"] = df["season"].astype(str)

    # Keep the existing playing-time eligibility rules.
    df = df[
        (df["GP"] >= 10)
        & (df["MIN"] >= 10)
        & (df["GP"] * df["MIN"] >= 200)
    ].copy()

    if df["role"].isna().any():
        names = df.loc[df["role"].isna(), "PLAYER_NAME"].tolist()
        raise ValueError(
            f"Eligible players need role assignments: {names}"
        )

    if not df["role"].isin(["Guard", "Wing", "Big"]).all():
        raise ValueError("Roles must be Guard, Wing, or Big.")

    # Conventional estimate, retaining the existing model definition.
    # The source values here are per-game averages.
    df["TS_PCT"] = (
        df["PTS"]
        / (2 * (df["FGA"] + 0.44 * df["FTA"]))
    )

    # The shooting shares were calculated from season totals.
    # Do not overwrite them using rounded per-game averages.
    df = df.replace([np.inf, -np.inf], np.nan)

    incomplete = df[
        FEATURES + ["MIN", "league", "season"]
    ].isna().any(axis=1)

    if incomplete.any():
        names = df.loc[incomplete, "PLAYER_NAME"].tolist()
        raise ValueError(
            "Eligible players have incomplete model data: "
            f"{names}. Check the enrichment reports."
        )

    df = df.reset_index(drop=True)

    if set(df["league"]) != {"NBA", "WNBA"}:
        raise ValueError("Expected eligible players from both leagues.")

    if (df.groupby("league")["season"].nunique() != 1).any():
        raise ValueError(
            "This version expects one season per league."
        )

    if df.duplicated(["league", "season", "PLAYER_ID"]).any():
        raise ValueError("Duplicate player-season records found.")

    location_features = [
        "RIM_RATE",
        "PAINT_NON_RA_RATE",
        "MIDRANGE_RATE",
        "THREE_ZONE_RATE",
    ]

    location_values = df[location_features]

    if (
        location_values.lt(0).any().any()
        or location_values.gt(1).any().any()
    ):
        raise ValueError("Location shares must be between zero and one.")

    if not np.allclose(
        location_values.sum(axis=1),
        1.0,
        atol=1e-8,
        rtol=0,
    ):
        raise ValueError("Shot-location shares must sum to one.")

    if df["FT_RATE"].lt(0).any():
        raise ValueError("Free-throw rate cannot be negative.")

    profiles = pd.DataFrame(
        index=df.index,
        columns=FEATURES,
        dtype=float,
    )

    models = {}
    adjusted_features = PRODUCTION + EFFICIENCY

    # Production and efficiency retain league-relative adjustment.
    for league, group in df.groupby("league"):
        if len(group) < 10:
            raise ValueError(f"Too few eligible players in {league}.")

        X = pd.get_dummies(group["role"], dtype=float)

        X["MIN"] = StandardScaler().fit_transform(
            group[["MIN"]]
        ).ravel()

        league_z = StandardScaler().fit_transform(
            group[adjusted_features]
        )

        model = Ridge(alpha=10.0)
        model.fit(X, league_z)

        residuals = league_z - model.predict(X)

        residual_z = StandardScaler().fit_transform(
            residuals
        )

        ranks = group[adjusted_features].rank(
            method="average",
            pct=True,
        )

        percentile_z = StandardScaler().fit_transform(ranks)

        # Existing representation for non-PRA adjusted features.
        blended = 0.50 * league_z + 0.50 * residual_z

        # Your requested PRA blend.
        for feature in PRA_FEATURES:
            column = adjusted_features.index(feature)

            blended[:, column] = (
                0.50 * percentile_z[:, column]
                + 0.25 * league_z[:, column]
                + 0.25 * residual_z[:, column]
            )

        profiles.loc[group.index, adjusted_features] = blended
        models[league] = model

    # Shot selection uses one shared scale across both leagues.
    # Each league receives equal total influence when fitting the scale.
    league_counts = df["league"].value_counts()
    sample_weights = 1.0 / df["league"].map(league_counts)

    shot_scaler = StandardScaler()

    shot_scaler.fit(
        df[SHOT_SELECTION],
        sample_weight=sample_weights.to_numpy(),
    )

    profiles.loc[:, SHOT_SELECTION] = shot_scaler.transform(
        df[SHOT_SELECTION]
    )

    models["shot_scaler"] = shot_scaler

    return df, profiles, models


def comparison_breakdown(df, profiles, source_index, candidate_index):
    """
    Calculate each feature's exact contribution to squared distance.
    The search and inspection panel use the same calculation.
    """
    source = df.loc[source_index]
    candidate = df.loc[candidate_index]

    weights = (
        feature_weights(source["role"])
        + feature_weights(candidate["role"])
    ) / 2

    source_values = profiles.loc[source_index, FEATURES].astype(float)
    candidate_values = profiles.loc[candidate_index, FEATURES].astype(float)

    difference = source_values - candidate_values
    contributions = weights * difference.pow(2)

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

    total = float(contributions.sum())

    detail["Contribution share"] = (
        detail["Weighted squared difference"] / total
        if total > 0
        else 0.0
    )

    distance = float(np.sqrt(total))

    return detail, distance


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
        raise ValueError("Expected exactly one eligible source player.")

    source_index = matches[0]
    source = df.loc[source_index]

    candidates = df[df["league"] != league].copy()

    if same_role:
        candidates = candidates[
            candidates["role"] == source["role"]
        ].copy()
    
    # This is an approximation because MIN is a rounded per-game average.
    estimated_total_minutes = candidates["GP"] * candidates["MIN"]

    candidates = candidates[
        (candidates["GP"] >= min_games)
        & (candidates["MIN"] >= min_mpg)
        & (estimated_total_minutes >= min_total_minutes)
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