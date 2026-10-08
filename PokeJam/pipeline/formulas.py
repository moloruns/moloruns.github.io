"""
The attribute model: how Pokemon data and NBA stats translate into the
same basketball attributes (the ten in ATTRIBUTES).

These formulas are design choices, not statistical findings. Pokemon and
NBA players share no measurements, so each side gets its own mapping
into a shared set of attributes. Read the weights as "what I think this
attribute means for a Pokemon / for a basketball player".

How a formula becomes an attribute (see build_attributes.py):
  1. every input becomes a percentile within its own population
     (all 1,082 Pokemon, or all 652 NBA players in NBA 2K27),
  2. the input percentiles are averaged using the weights below,
  3. that average becomes a percentile again, so every attribute
     runs 0-100 on both sides.

Conventions:
  - Every input is "higher = better at this attribute".
  - Weights are relative. {"atk": 2, "height": 1} means Atk counts twice
    as much as height. They don't need to sum to 1.
"""
import pandas as pd


# The comparison vector. Clutch is game-only; see docs/model.md.
ATTRIBUTES = [
    "speed",
    "shooting",
    "layup",
    "dunk",
    "passing",
    "power",
    "steal",
    "block",
    "rebound",
    "ball_handling",
]


# ---------------------------------------------------------------------------
# Pokemon side
# ---------------------------------------------------------------------------

POKEMON_WEIGHTS = {
    "speed":         {"spe": 1},
    "shooting":      {"spa": 1},
    "layup":         {"atk": 1, "spe": 1},
    "dunk":          {"atk": 1, "height": 1},
    "passing":       {"spd": 1, "spa": 1},
    "power":         {"atk": 1, "weight": 1},
    "steal":         {"spe": 1, "atk": 1},
    "block":         {"def": 1, "height": 1},
    "rebound":       {"hp": 1, "height": 1, "weight": 1},
    "ball_handling": {"spe": 80, "def": 20},
}

# Added to the final attribute percentile (capped at 100). At most one
# bonus per attribute: a Dark type with Pickpocket still gets +10 Steal.
BONUS_POINTS = 10

TYPE_BONUSES = {
    "speed":   {"electric"},
    "dunk":    {"fighting", "flying"},
    "passing": {"psychic", "fairy"},
    "steal":   {"dark"},
    "block":   {"steel", "rock"},
}

# Hidden abilities count.
ABILITY_BONUSES = {
    "steal": {"pickpocket"},
}


def pokemon_inputs(pokemon):
    """Raw inputs for the Pokemon formulas, one row per Pokemon."""
    return pd.DataFrame({
        "hp": pokemon["hp"],
        "atk": pokemon["atk"],
        "def": pokemon["def"],
        "spa": pokemon["spa"],
        "spd": pokemon["spd"],
        "spe": pokemon["spe"],
        "height": pokemon["height_dm"],
        "weight": pokemon["weight_hg"],
    })


# ---------------------------------------------------------------------------
# NBA side: NBA 2K27 ratings
# ---------------------------------------------------------------------------

# Every input is a 2K attribute (rated 25-99), except weight. 2K's ratings
# already account for size (a center's Block and Rebound ratings are
# high because of height), so body measurements are only added where the
# Pokemon side has no rating to match: weight, for Power.
NBA_WEIGHTS = {
    "speed":         {"speed": 1, "agility": 1},
    "shooting":      {"threePointShot": 1, "midRangeShot": 1, "freeThrow": 1},
    "layup":         {"drivingLayup": 1},
    "dunk":          {"drivingDunk": 1, "standingDunk": 1, "vertical": 1},
    "passing":       {"passAccuracy": 1, "passVision": 1, "passIQ": 1},
    "power":         {"strength": 1, "weight": 1},
    "steal":         {"steal": 1, "passPerception": 1},
    "block":         {"block": 1},
    "rebound":       {"offensiveRebound": 1, "defensiveRebound": 1},
    "ball_handling": {"ballHandle": 1, "speedWithBall": 1},
}

# Not used yet: closeShot, postControl, postFade, postHook,
# drawFoul, hands, shotIQ, offensiveConsistency, perimeterDefense,
# interiorDefense, helpDefenseIQ, defensiveConsistency, hustle, stamina,
# durability.


def nba_inputs(players):
    """Raw inputs for the NBA formulas, one row per player."""
    ratings = sorted({
        column
        for weights in NBA_WEIGHTS.values()
        for column in weights
        if column != "weight"
    })
    return players[ratings].assign(weight=players["weight_lb"])


# ---------------------------------------------------------------------------
# Matching
# ---------------------------------------------------------------------------

# Instead of one whole-profile "style" match, each group of attributes is
# matched separately: "scores like X, handles like Y, defends like Z".
TRAITS = {
    "scores like":  ["shooting", "layup", "dunk"],
    "handles like": ["passing", "ball_handling", "speed"],
    "defends like": ["steal", "block"],
    "built like":   ["speed", "power", "rebound"],
}

# Whole-profile matching compares shape (attributes minus their own
# average) and level (Pokemon: BST percentile, NBA: 2K overall percentile).
# This is how much the level gap counts. One per attribute (10) = as much
# as in a plain distance over all the attributes. Higher = level matters
# more.
PROFILE_LEVEL_WEIGHT = len(ATTRIBUTES)

# Only players with at least this 2K overall can appear as a Pokemon's
# match (whole profile or trait), so weak Pokemon match recognizable
# players instead of fringe ones. Percentiles still use all players.
MATCH_MIN_OVERALL = 78


# ---------------------------------------------------------------------------
# Game ratings (Pokemon only)
# ---------------------------------------------------------------------------

# How much of a Pokemon's overall level the game keeps.
# 1.0 = ratings straight from the model (Mewtwo far above Pichu).
# 0.0 = every Pokemon equally good overall, only the profile shape differs.
# 0.5 = halfway: Mewtwo is still better, but Pikachu plays like a fast
#       guard instead of a bad player.
LEVEL_KEEP = 0.5
