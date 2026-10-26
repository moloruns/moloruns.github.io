"""Shared vector ranking and a deliberately simple, reproducible keyword baseline."""

import re
import math
from collections import Counter

from features import feature_evidence, requested_features

RETRIEVAL_POLICY = "metadata-rrf-evidence-v2"
METHODS = ("enhanced", "rules", "vector", "lexical", "fused")

# Fixed function-word list. Keep content words and negation (no/not/without).
STOPWORDS = frozenset("""
a an the and or but if then else as at by for from in into of on onto to up with
about after before between through during over under is are was were be been being
am do does did have has had having can could would should will shall may might must
i me my mine we us our ours you your yours he him his she her hers it its they them
their theirs this that these those who whom whose which what when where why how
all any both each few more most other some such than too very just also so s t
""".split())

# Provisional local cutoff; this is not a confidence score.
WEAK_DISTANCE = 0.70


def terms(text):
    return set(re.findall(r"[a-z]+", text.lower())) - STOPWORDS


def assess_matches(query, results):
    if not results:
        return "empty"
    details = results[0][0].get("_search")
    if details:
        if all(m.get('_search', {}).get('weak', False) for m, _, _ in results):
            return "weak"
        if details.get('aspects'):
            # Relative relevance is not evidence that the game's plot/mechanics
            # satisfy a request. Do not reuse the old hand-written truth labels.
            if any(a.get('absence_unverified') for a in details['aspects']):
                return 'partial'
            if any(a.get('evidence_state') != 'matched' for a in details['aspects']):
                return 'partial'
            return "ambiguous" if len(terms(query)) < 3 else "candidates"
        if details['requirements'] and not any(
                all(e['state'] == 'supported' for e in m['_search']['requirements'])
                for m, _, _ in results):
            return "partial"
        return "ambiguous" if len(terms(query)) < 3 else "candidates"
    if results[0][2] >= WEAK_DISTANCE:
        return "weak"
    if len(terms(query)) < 3:
        return "ambiguous"
    return "candidates"


def search(collection, tokenizer, query, method="enhanced"):
    if not query.strip():
        raise ValueError("Please enter a description.")
    if len(tokenizer.encode(query).ids) > 256:
        raise ValueError("Please shorten the description to a few sentences (maximum 256 model tokens).")
    return rank(collection, query, method=method)


def rank(collection, query, method="enhanced", limit=5, candidate_limit=50):
    if method not in METHODS:
        raise ValueError(f"Unknown retrieval method: {method}")
    if method == "vector":
        return vector_rank(collection, query, limit)
    if method == 'enhanced':
        from aspect_ranking import aspect_rank
        return aspect_rank(collection, query, limit, candidate_limit)
    return enhanced_rank(collection, query, method, limit, candidate_limit)


def vector_rank(collection, query, limit=5):
    """Rank distinct games by their closest passage; expand retrieval as needed."""
    count = collection.count()
    if not count:
        return []
    requested = count if limit is None else min(max(25, limit), count)
    while True:
        result = collection.query(query_texts=[query], n_results=requested,
                                  include=["documents", "metadatas", "distances"])
        ordered = sorted(zip(result["metadatas"][0], result["documents"][0],
                             result["distances"][0]),
                         key=lambda item: (item[2], item[0]["app_id"], item[0]["chunk_index"]))
        games = {}
        for metadata, passage, distance in ordered:
            games.setdefault(metadata["app_id"], (metadata, passage, distance))
        if limit is None or len(games) >= limit or requested == count:
            return list(games.values()) if limit is None else list(games.values())[:limit]
        requested = min(count, requested * 2)


def keyword_rank(records, query):
    """Distinct shared content words per passage; use each game's best score.

    records contain (id, document, metadata). Search only documents, just like
    embeddings. Include zero-score candidates so ranks and ties are auditable.
    """
    query_terms = terms(query)
    candidates = []
    for id, passage, meta in records:
        shared = sorted(query_terms & terms(passage))
        candidates.append((meta, passage, len(shared), shared))
    candidates.sort(key=lambda item: (-item[2], item[0]["app_id"], item[0]["chunk_index"]))
    games = {}
    for result in candidates:
        games.setdefault(result[0]["app_id"], result)
    return list(games.values())


def lexical_tokens(text):
    # Keep title numbers and normalize common word forms for lexical matching.
    aliases = {"simulation": "sim", "simulator": "sim", "simulations": "sim",
               "romantic": "romance", "relationships": "relationship", "families": "family",
               "missions": "mission", "objectives": "objective", "lives": "life"}
    text = re.sub(r'\b(single|multi)[ -]+player\b', r'\1player', text.casefold())
    text = re.sub(r'\bco[ -]?op(?:erative)?\b', 'coop', text)
    tokens = [aliases.get(t, t) for t in re.findall(r"[a-z0-9]+", text) if t not in STOPWORDS]
    # Regular number variation applies to every feature, including exclusions;
    # 'jump scares' must not miss a source label 'Jump Scare'. This remains a
    # conservative spelling heuristic rather than a semantic synonym model.
    return [t[:-3]+'y' if len(t) > 4 and t.endswith('ies') else
            t[:-1] if len(t) > 3 and t.endswith('s') and not t.endswith(('ss', 'us', 'is')) else t
            for t in tokens]


def grouped_records(collection):
    # Rebuild on each search: adds/repairs are immediately visible, with no stale cache.
    stored = collection.get(include=["documents", "metadatas"])
    groups = {}
    for id, doc, meta in zip(stored['ids'], stored['documents'], stored['metadatas']):
        groups.setdefault(meta['app_id'], []).append((meta, doc))
    for app in groups:
        groups[app].sort(key=lambda r: r[0]['chunk_index'])
    return groups


def lexical_rank(groups, query):
    """BM25 fields: title x2, metadata x1.5, full description x1; k1=1.2, b=.75."""
    fields, df = {}, Counter()
    for app, rows in groups.items():
        meta = rows[0][0]
        fields[app] = [Counter(lexical_tokens(meta['title'])),
                       Counter(lexical_tokens(str(meta.get('tags', '')) + ' ' + str(meta.get('genres', '')))),
                       Counter(lexical_tokens(' '.join(p for _, p in rows)))]
        df.update(set().union(*(set(f) for f in fields[app])))
    if not fields:
        return []
    average = [sum(sum(fs[i].values()) for fs in fields.values()) / len(fields) or 1 for i in range(3)]
    query_terms = set(lexical_tokens(query))
    ranked = []
    for app, fs in fields.items():
        score = 0.0
        for i, field in enumerate(fs):
            length = sum(field.values())
            for token in query_terms & field.keys():
                freq = field[token]
                idf = math.log(1 + (len(fields) - df[token] + .5) / (df[token] + .5))
                score += (2, 1.5, 1)[i] * idf * freq * 2.2 / (freq + 1.2 * (.25 + .75 * length / average[i]))
        if score > 0:
            ranked.append((app, score))
    return sorted(ranked, key=lambda r: (-r[1], r[0]))


def enhanced_rank(collection, query, method="enhanced", limit=5, candidate_limit=50):
    groups = grouped_records(collection)
    if not groups:
        return []
    # Full vector distances also supply real distances for lexical-only candidates.
    # Only top candidate_limit distinct games from each path participate in fusion.
    vectors = vector_rank(collection, query, limit=None)
    dense = {m['app_id']: (m, p, d) for m, p, d in vectors}
    dense_ranks = {m['app_id']: i for i, (m, _, _) in enumerate(vectors[:candidate_limit], 1)}
    lexical = lexical_rank(groups, query)
    lexical_scores = dict(lexical)
    lexical_ranks = {app: i for i, (app, _) in enumerate(lexical[:candidate_limit], 1)}
    candidates = set(lexical_ranks) if method == 'lexical' else set(dense_ranks) | set(lexical_ranks)
    requests = requested_features(query)
    results = []
    for app in candidates:
        meta, passage, distance = dense[app]
        evidence = feature_evidence(meta, [p for _, p in groups[app]], requests)
        score = sum(1 / (60 + ranks[app]) for ranks in (dense_ranks, lexical_ranks) if app in ranks)
        details = {"method": method, "policy": RETRIEVAL_POLICY, "fusion_score": score,
                   "lexical_score": lexical_scores.get(app, 0), "dense_distance": float(distance),
                   "dense_rank": dense_ranks.get(app), "lexical_rank": lexical_ranks.get(app),
                   "requirements": evidence,
                   # A generic lexical hit alone does not override a weak dense result.
                   # Recognized positive evidence or an exact title can still rescue it.
                   "weak": distance >= WEAK_DISTANCE and not (
                       evidence and any(e['state'] == 'supported' for e in evidence) or
                       lexical_tokens(query) == lexical_tokens(meta['title']))}
        supported = sum(e['state'] == 'supported' for e in evidence)
        contradicted = sum(e['state'] == 'contradicted' for e in evidence)
        # Context evidence is a separate priority; raw scores are never probabilities.
        priority = (bool(contradicted), -supported) if method in {'enhanced', 'rules'} else (False, 0)
        order_score = lexical_scores.get(app, 0) if method == 'lexical' else score
        results.append((priority, -order_score, app, ({**meta, "_search": details}, passage, distance)))
    results.sort(key=lambda row: row[:3])
    ranked = [r[3] for r in results]
    # Preserve one dense recall slot when no feature rule can add context. Pure
    # RRF can otherwise bury a paraphrase with zero lexical overlap. This is a
    # generic top-five safeguard, not a title/answer rule. 'fused' stays pure RRF.
    if method in {'enhanced', 'rules'} and not requests:
        leader = vectors[0][0]['app_id']
        index = next((i for i, (m, _, _) in enumerate(ranked) if m['app_id'] == leader), None)
        if index is not None and index >= 5:
            ranked.insert(4, ranked.pop(index))
    return ranked if limit is None else ranked[:limit]
