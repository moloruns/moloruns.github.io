"""Query-derived source anchors, deliberately weaker than factual verification.

Every aspect uses the same checks. No title IDs or genre-specific predicates.
An unmentioned aspect stays unknown; local negation is a conservative heuristic.
"""
import re

from retrieval import lexical_tokens


def source_signals(text, labels, descriptions):
    terms = set(lexical_tokens(re.sub(r'^(?:without|no|not)\s+', '', text, flags=re.I)))
    matched_labels = [label for label in labels if terms and terms <= set(lexical_tokens(label))]
    positive, negative, uncertain = [], [], []
    for passage in descriptions:
        for sentence in re.split(r'(?<=[.!?;])\s+|\n', passage):
            tokens = lexical_tokens(sentence)
            if not terms or not terms <= set(tokens):
                continue
            # Scope to a small window: scattered words across a paragraph do
            # not establish a phrase. Retain surrounding words for inspection.
            hits = [i for i, token in enumerate(tokens) if token in terms]
            windows = [(a, b) for a in hits for b in hits if 0 <= b-a <= len(terms)+4
                       and terms <= set(tokens[a:b+1])]
            if not windows:
                continue
            a, b = min(windows, key=lambda ab: ab[1]-ab[0])
            context = tokens[max(0, a-3):b+4]
            preceding = tokens[max(0, a-3):a]
            following = tokens[b+1:b+4]
            if sentence.rstrip().endswith('?') or re.search(r'\bif\b', sentence, re.I) or any(t in context for t in ('hypothetical', 'satire', 'satirizes', 'pretend')):
                uncertain.append(sentence)
            elif any(t in preceding for t in ('no', 'without', 'not', 'never')) or (
                    following and following[0] in ('not', 'absent', 'excluded', 'unavailable')):
                negative.append(sentence)
            else:
                positive.append(sentence)
    return {'labels': matched_labels, 'mentions': positive[:2], 'negations': negative[:2],
            'uncertain_mentions': uncertain[:2]}
