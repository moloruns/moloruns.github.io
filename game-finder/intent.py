"""General query aspects from coordination and the catalog's own label vocabulary.

No title IDs or hand-picked feature categories. This is deliberately a parser,
not an assertion that every phrase has been understood correctly.
"""

import re


def normalized(text):
    text = re.sub(r'\b(single|multi)[ -]+player\b', r'\1player', text, flags=re.I)
    text = re.sub(r'\bco[ -]?op(?:erative)?\b', 'coop', text, flags=re.I)
    value = re.sub(r'[^a-z0-9]+', ' ', text.casefold()).strip()
    return re.sub(r'\b(?:simulation|simulator|simulations)\b', 'sim', value)


def clean(text):
    value = text.strip(' ,.;:!?-')
    value = re.sub(r"^(?:(?:i(?:'d)? (?:want|like)|i am looking for|i'm looking for|looking for|something|a game|games?|that has|that includes|with|a|an|the)\s+)+", '', value, flags=re.I)
    value = re.sub(r'\s+(?:games?|gameplay)$', '', value, flags=re.I)
    return value.strip()


def query_aspects(query, catalog_labels=(), max_aspects=4):
    """Use clauses first; discover uncoordinated attributes from corpus labels."""
    text = clean(query)
    labels = sorted({normalized(x) for x in catalog_labels if normalized(x)}, key=lambda x: (-len(x), x))
    # Protect conventional labels containing conjunctions, e.g. Point & Click.
    protected = {}
    for label in catalog_labels:
        if re.search(r'\b(?:and|with)\b|&', label, re.I):
            pattern = r'\b' + r'[\s-]+'.join(re.escape(t) for t in label.split()) + r'\b'
            match = re.search(pattern, text, re.I)
            if match:
                key = f'PROTECTED{len(protected)}'
                protected[key] = match.group()
                text = text[:match.start()] + key + text[match.end():]
    parts = re.split(r'\s+(?:and|plus|with|but)\s+|\s*&\s*|[,;]|(?=\bwithout\b)', text, flags=re.I)
    parts = [clean(p) for p in parts]
    parts = [p for p in parts if p and p.casefold() not in {'something', 'game', 'a game', 'a', 'an'}]
    for key, value in protected.items():
        parts = [p.replace(key, value) for p in parts]
    # Attribute coordination is useful; splitting sentence-length remembered
    # scenes discards relationships between the actors/actions. Back off to the
    # original sentence instead of pretending to parse that grammar.
    if len(parts) > 1 and (any(len(p.split()) > 6 for p in parts) or re.search(r'\bor\b', text, re.I)):
        return [{'text': clean(query), 'negative': bool(re.match(r'^(?:without|no|not)\b', clean(query), re.I))}]
    # A shared head may be omitted in coordinated text. Only expand when the
    # resulting label actually exists in this catalog (not for selected games).
    if len(parts) > 1:
        tail = parts[-1].split()[-1]
        for i, part in enumerate(parts[:-1]):
            expanded = f'{part} {tail}'
            if len(part.split()) == 1 and normalized(expanded) in labels:
                parts[i] = expanded
    if len(parts) <= 1:
        norm = normalized(text)
        matches = []
        remaining = ' ' + norm + ' '
        for label in labels:
            token = ' ' + label + ' '
            if token in remaining:
                matches.append(label)
                remaining = remaining.replace(token, ' ', 1)
        residual = clean(remaining)
        residual = re.sub(r'\b(?:that|takes|place|in|about|of|for|to|is|can|you|it|where|play)\b', ' ', residual, flags=re.I)
        residual = ' '.join(residual.split())
        if not re.search(r'\bor\b', text, re.I) and (len(matches) >= 2 or (matches and residual)):
            parts = matches + ([residual] if residual else [])
        elif not parts:
            parts = [clean(query)]
    result, seen = [], set()
    for part in parts:
        key = normalized(part)
        if key and key not in seen:
            seen.add(key)
            negative = bool(re.match(r'^(?:without|no|not)\b', part, re.I))
            result.append({'text': part, 'negative': negative})
    # Keep original words and all clauses represented in the full-query score.
    # If too many fragments, preserve the remaining context as one last aspect.
    if len(result) > max_aspects:
        rest = result[max_aspects-1:]
        # The computational budget is soft: never turn an excluded aspect
        # into a positive one by folding it into a mixed-polarity tail.
        if not any(x['negative'] for x in rest):
            result = result[:max_aspects-1] + [{'text': ' and '.join(x['text'] for x in rest),
                                             'negative': False}]
    return result or [{'text': query.strip(), 'negative': False}]
