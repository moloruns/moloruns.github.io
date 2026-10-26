"""Narrow source-evidence rules, not a general plot or entailment classifier."""

import re

FEATURES = {
    "life_sim": ("Life simulation", {"life sim", "social sim"},
                 r"\blife sim(?:ulation|ulator)?\b|\beveryday (?:life|lives)\b|\b(?:create|creating|manage|managing|guide)\b.{0,35}\b(?:lives|daily life)\b"),
    "social": ("Social relationships", {"social sim", "dating sim"},
               r"\b(?:develop(?:ing)?|build(?:ing)?|form(?:ing)?|manag(?:e|ing)|creat(?:e|ing)|pursu(?:e|ing))\s+(?:(?:romantic|social|new|your|close|personal)\s+){0,2}(?:relationships?|friendships?)\b|\bspending time with friends and family\b"),
    "romance": ("Romance", {"romance", "dating sim"},
                r"\bromance routes?\b|\bromantic (?:story|stories|adventure|relationships?|routes?|visual novel)\b|\b(?:find(?:ing)?|pursu(?:e|ing)|develop(?:ing)?|build(?:ing)?|experience|features?|includes?|offers?)\b.{0,30}\bromance\b|\bfall(?:ing)? in love\b|\bdating sim(?:ulator)?\b"),
    "tragic_ending": ("Tragic ending", set(), r"\b(?:tragic|sad|bittersweet) endings?\b"),
    "physics": ("Physics simulation", {"physics"}, r"\bphysics\b|\brigid.body dynamics\b|\bheat transfer\b"),
    "relaxing": ("Relaxing play", {"relaxing"}, r"\brelaxing (?:game|experience|gameplay|sandbox)\b|\blow.pressure\b"),
    "objectives": ("Missions/objectives", set(), r"\b(?:missions?|objectives?)\b"),
}
QUERY_PATTERNS = {
    "life_sim": r"\blife\s+(?:(?:and|&)\s+social\s+)?sim(?:ulation|ulator)?s?\b|\beveryday life\b",
    "social": r"\bsocial\b|\brelationships?\b|\bfamil(?:y|ies)\b|\bfriendships?\b",
    "romance": r"\bromance\b|\bromantic\b|\bdating\b",
    "tragic_ending": r"\b(?:tragic|tragedy|sad|bittersweet)\b.{0,25}\bend(?:ing)?s?\b|\bend(?:ing)?s?\b.{0,25}\b(?:tragic|sad|bittersweet)\b",
    "physics": r"\bphysics\b|\brigid.body\b",
    "relaxing": r"\brelax(?:ing|ed)?\b|\bunwind\b|\bleisurely\b|\bunhurried\b|\blow.pressure\b",
    "objectives": r"\bmissions?\b|\bobjectives?\b",
}
NEGATION = r"\b(?:no|not|without|never|neither|excludes?|lacks?|free (?:of|from))\b"


def requested_features(query):
    """Recognize only the documented vocabulary; keep desired absence explicit."""
    requested = []
    for feature, pattern in QUERY_PATTERNS.items():
        match = re.search(pattern, query, re.I)
        if match:
            # Restrict scope to this clause, e.g. 'romance without missions'.
            prefix = re.split(r"[,;.!?]|\b(?:and|but)\b", query[:match.start()], flags=re.I)[-1]
            negative = re.search(NEGATION + r"(?:\s+[\w'-]+){0,3}\s*$", prefix, re.I) is not None
            requested.append({"feature": feature, "label": FEATURES[feature][0], "wanted": not negative})
    return requested


def labels(metadata):
    return {p.strip().casefold() for field in ("tags", "genres")
            for p in str(metadata.get(field) or "").split(",") if p.strip()}


def _negative(feature, sentence):
    """Only a short explicit negation near the feature; longer scope remains unknown."""
    names = {
        "romance": r"romance|romantic (?:relationships?|content|elements?)|dating",
        "life_sim": r"life sim(?:ulation|ulator)?",
        "social": r"social (?:relationships?|interaction)|relationships?|friendships?",
        "tragic_ending": r"(?:tragic|sad|bittersweet) endings?",
        "physics": r"physics",
        "relaxing": r"relaxing (?:game|gameplay|experience)|low.pressure",
        "objectives": r"missions?|objectives?",
    }[feature]
    match = (re.search(NEGATION + r"(?:\s+[\w'-]+){0,3}\s+(?:" + names + r")\b", sentence, re.I) or
             re.search(r"\b(?:" + names + r")\s+(?:is|are)\s+(?:absent|excluded|not (?:included|present))\b", sentence, re.I))
    # 'Explore when not dating' describes an optional activity, not a romance-free game.
    if match and re.search(r"\b(?:when|while|if|unless)\b", sentence[:match.start()], re.I):
        return None
    return match


def feature_evidence(metadata, passages, requested):
    """Evidence has provenance; absent/ambiguous mentions never establish absence."""
    # Inspect ordered full context rather than the selected nearest fragment alone.
    sentences = re.split(r"(?<=[.!?])\s+|\n+", " ".join(passages))
    tags = labels(metadata)
    result = []
    for request in requested:
        feature = request['feature']
        _, relevant_tags, pattern = FEATURES[feature]
        positive = [{"kind": "metadata", "text": f"Source tag/genre: {tag}"}
                    for tag in sorted(tags & relevant_tags)]
        negative = []
        for sentence in sentences:
            # Questioned, quoted, hypothetical or disclaimed material isn't a feature claim.
            uncertain = ("?" in sentence or '"' in sentence or '“' in sentence or
                         re.search(r"\b(?:hypothetical|satir\w*|pretend)\b", sentence, re.I))
            neg = _negative(feature, sentence)
            if neg and not uncertain:
                negative.append({"kind": "description", "text": sentence.strip()})
            elif re.search(pattern, sentence, re.I) and not neg and not uncertain:
                # General negation in the clause makes scope too uncertain to assert support.
                if not re.search(NEGATION, sentence, re.I):
                    positive.append({"kind": "description", "text": sentence.strip()})
        if positive and negative:
            state, reason = "unknown", "Conflicting source signals; inspect the context."
        elif not positive and not negative:
            state, reason = "unknown", "Not established by the stored description or tags."
        else:
            available = bool(positive)
            state = "supported" if available == request['wanted'] else "contradicted"
            reason = "Source explicitly supports this requirement." if state == 'supported' else "Source evidence conflicts with this requirement."
        sources = positive[:1] + negative[:1] if positive and negative else (positive + negative)[:3]
        result.append({**request, "state": state, "reason": reason, "evidence": sources})
    return result


def evidence_label(evidence):
    label = evidence['label'] if evidence['wanted'] else f"Without {evidence['label'].lower()}"
    return f"{label}: {evidence['state']} — {evidence['reason']}"
