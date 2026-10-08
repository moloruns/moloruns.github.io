"""
Matching between profiles. The comparison page will run the same math in
JavaScript, so any change here has to be made there too.

A profile is the attribute percentiles (formulas.ATTRIBUTES order)
plus a level: how strong the Pokemon or player is overall, as a
percentile within its own population.
  Pokemon level: base stat total (BST) percentile
  NBA level:     2K overall percentile
"""
import numpy as np


def profile_distance(query, query_level, candidates, candidate_levels, level_weight):
    """
    Whole-profile distance = shape difference + level difference.

    Shape: each profile's attributes minus its own average. A Pokemon
    that's weak overall but fast for its level has the same shape as a
    star guard who is fast for their level.
    Level: the gap between the two overall ratings.

    With level_weight = the number of attributes, this is a plain distance
    between the two attribute vectors, except that each side's level is
    its own overall rating instead of the average of its attributes.
    """
    q = query - query.mean()
    c = candidates - candidates.mean(axis=1, keepdims=True)
    shape = ((c - q) ** 2).sum(axis=1)
    level = (candidate_levels - query_level) ** 2
    return np.sqrt(shape + level_weight * level)


def ranked_profile(query, query_level, candidates, candidate_levels, level_weight):
    """Candidate indices, closest whole profile first."""
    distance = profile_distance(
        query, query_level, candidates, candidate_levels, level_weight
    )
    return np.argsort(distance, kind="stable")


def ranked_on(query, candidates, columns):
    """
    Candidate indices, closest first, comparing only some attributes.

    Used for traits: "handles like X" compares only Passing and Ball
    Handling. Plain distance, so level counts: a 95th-percentile handler
    matches another 95th-percentile handler.
    """
    gaps = candidates[:, columns] - query[columns]
    return np.argsort(np.sqrt((gaps ** 2).sum(axis=1)), kind="stable")
