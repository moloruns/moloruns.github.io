"""Balanced late interaction over arbitrary query aspects and source labels."""

from functools import lru_cache
from pathlib import Path
import re
import tempfile

import numpy as np

from intent import query_aspects, normalized
from aspect_evidence import source_signals

POLICY = 'source-anchored-aspects-v7'
CACHE = Path(__file__).resolve().parent / 'data/aspect_labels.npz'


@lru_cache(maxsize=1)
def encoder():
    from ingest import embedding_tools
    return embedding_tools()[0]


_labels = {}
_loaded = False


def label_vectors(labels):
    """Recomputable, atomic cache keyed by exact labels/model/prompt policy."""
    global _loaded
    if not _loaded:
        if CACHE.exists():
            try:
                with np.load(CACHE, allow_pickle=False) as saved:
                    if str(saved['policy']) == 'all-MiniLM-L6-v2:plain-labels:v1':
                        _labels.update(zip(saved['labels'].tolist(), saved['vectors']))
            except (ValueError, OSError, KeyError):
                pass  # Cache only; source data/notes are never modified.
        _loaded = True
    missing = sorted(set(labels) - _labels.keys())
    for start in range(0, len(missing), 50):
        names = missing[start:start+50]
        values = np.asarray(encoder()(names), dtype=np.float32)
        values /= np.maximum(np.linalg.norm(values, axis=1, keepdims=True), 1e-9)
        _labels.update(zip(names, values))
    if missing:
        CACHE.parent.mkdir(parents=True, exist_ok=True)
        temporary = None
        try:
            with tempfile.NamedTemporaryFile(dir=CACHE.parent, suffix='.npz', delete=False) as out:
                temporary = Path(out.name)
                keys = sorted(_labels)
                np.savez_compressed(out, policy=np.array('all-MiniLM-L6-v2:plain-labels:v1'), labels=np.array(keys),
                                    vectors=np.stack([_labels[k] for k in keys]))
            temporary.replace(CACHE)
        finally:
            if temporary:
                temporary.unlink(missing_ok=True)
    return np.stack([_labels[name] for name in labels])


def bottleneck(scores, whole):
    """Within an evidence tier, prefer the weakest aspect, then overall relevance."""
    return .55 * min(scores) + .15 * (sum(scores)/len(scores)) + .3 * whole


def aspect_rank(collection, query, limit=5, candidate_limit=50):
    from retrieval import grouped_records, vector_rank, lexical_rank, lexical_tokens
    groups = grouped_records(collection)
    if not groups:
        return []
    labels_by_game = {app: sorted({s.strip() for key in ('genres', 'tags')
                                  for s in str(rows[0][0].get(key, '')).split(',') if s.strip()})
                      for app, rows in groups.items()}
    all_labels = sorted({label for ls in labels_by_game.values() for label in ls})
    aspects = query_aspects(query, all_labels)
    vectors = [r for r in vector_rank(collection, query, limit=None) if r[0]['app_id'] in groups]
    dense = {m['app_id']: (m, p, float(d)) for m, p, d in vectors}
    lex = lexical_rank(groups, query)
    fused = {}
    for apps in ([m['app_id'] for m, _, _ in vectors[:candidate_limit]], [app for app, _ in lex[:candidate_limit]]):
        for i, app in enumerate(apps, 1):
            fused[app] = fused.get(app, 0) + 1/(60+i)
    candidates = set(fused)
    per_aspect = []
    for aspect in aspects:
        positive_text = re.sub(r'^(?:without|no|not)\s+', '', aspect['text'], flags=re.I)
        rows = vector_rank(collection, positive_text, limit=None)
        per_aspect.append({m['app_id']: (m, p, float(d)) for m, p, d in rows if m['app_id'] in groups})
        for m, _, _ in rows[:10]:
            if m['app_id'] in groups:
                candidates.add(m['app_id'])
        candidates.update(app for app, _ in lexical_rank(groups, positive_text)[:20])
    similarities = None
    if all_labels:
        lv = label_vectors(all_labels)
        qv = np.asarray(encoder()([re.sub(r'^(?:without|no|not)\s+', '', a['text'], flags=re.I) for a in aspects]), dtype=np.float32)
        qv /= np.maximum(np.linalg.norm(qv, axis=1, keepdims=True), 1e-9)
        similarities = qv @ lv.T
    indices = {name: i for i, name in enumerate(all_labels)}
    results = []
    for app in candidates:
        if app not in dense:
            continue
        meta, passage, distance = dense[app]
        checks, values = [], []
        for j, aspect in enumerate(aspects):
            am, excerpt, ad = per_aspect[j].get(app, dense[app])
            terms = set(lexical_tokens(aspect['text'])) - {'without', 'no', 'not'}
            label_score = 0.0
            for label in labels_by_game[app]:
                lt = set(lexical_tokens(label))
                coverage = len(terms & lt) / len(terms) if terms else 0
                # A broad shared head ('simulation') is less specific than the
                # complete phrase ('life simulation'). No category list needed.
                semantic = 1.0 if terms and terms == lt else max(0, float(similarities[j, indices[label]])) * (coverage if coverage else .25)
                label_score = max(label_score, semantic)
            body_score = max(0.0, 1 - ad)
            evidence = source_signals(aspect['text'], labels_by_game[app], [p for _, p in groups[app]])
            genre_matches = source_signals(aspect['text'], str(meta.get('genres', '')).split(','), [])['labels']
            present = bool(evidence['labels'] or evidence['mentions'])
            absent = bool(evidence['negations'])
            conflict = present and absent
            matched = absent and not present if aspect['negative'] else present and not absent
            contradicted = present and not absent if aspect['negative'] else absent and not present
            state = 'conflicting' if conflict else 'matched' if matched else 'contradicted' if contradicted else 'unknown'
            # Metadata can add support, never dilute a description paraphrase
            # merely because this game's optional metadata happens to be filled.
            label_weight = 1.0 if genre_matches else .7
            support = max(body_score, label_weight * label_score)
            if aspect['negative']:
                # Similarity cannot establish an absence. Leave it explicitly
                # unverified; downweight positive label evidence for exclusions.
                support = 1-support if matched else 0 if contradicted else .1
            if evidence['mentions'] or evidence['negations']:
                excerpt = (evidence['negations'] if aspect['negative'] and absent else evidence['mentions'] or evidence['negations'])[0]
            checks.append({**aspect, 'source_excerpt': excerpt, 'source_labels': evidence['labels'],
                           'evidence_state': state, 'source_signals': evidence,
                           'corroboration': int(bool(genre_matches)) + int(bool(evidence['mentions'])),
                           'semantic_similarity': body_score, 'label_similarity': label_score,
                           'coverage_score': support, 'absence_unverified': aspect['negative'] and not matched})
            values.append(support)
        whole = max(0.0, 1-distance)
        score = bottleneck(values, whole)
        # User tags are noisy. Corroboration is a modest secondary signal,
        # never a replacement for semantic balance or another request aspect.
        corroborated = sum(a['evidence_state'] == 'matched' and a['corroboration'] > 0 for a in checks)
        score = .9 * score + .05 * corroborated / len(checks) + .05 * sum(a['evidence_state'] == 'matched' for a in checks) / len(checks)
        details = {'method': 'enhanced', 'policy': POLICY, 'joint_score': score,
                   'aspects': checks, 'requirements': [],
                   'weak': distance >= .7 and not any(a['evidence_state'] == 'matched' for a in checks)
                           and lexical_tokens(query) != lexical_tokens(meta['title']),
                   'matched_aspects': sum(a['evidence_state'] == 'matched' for a in checks),
                   'corroborated_aspects': corroborated,
                   'conflicting_aspects': sum(a['evidence_state'] in {'contradicted', 'conflicting'} for a in checks),
                   'fusion_score': fused.get(app, 0), 'lexical_score': dict(lex).get(app, 0),
                   'dense_distance': distance, 'candidate_count': len(candidates)}
        results.append(({**meta, '_search': details}, passage, distance))
    # Complete source coverage is a separate tier. Partial literal matches do
    # not automatically outrank a meaningful paraphrase with no exact words.
    results.sort(key=lambda r: (lexical_tokens(query) != lexical_tokens(r[0]['title']),
                               r[0]['_search']['conflicting_aspects'],
                               r[0]['_search']['matched_aspects'] != len(r[0]['_search']['aspects']),
                               -r[0]['_search']['joint_score'],
                               -r[0]['_search']['fusion_score'], r[0]['app_id']))
    unique, seen = [], set()
    for row in results:
        key = normalized(row[0]['title'])
        if key not in seen:
            unique.append(row)
            seen.add(key)
    return unique if limit is None else unique[:limit]
