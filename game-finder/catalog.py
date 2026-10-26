"""Audit and deterministically select the pinned Steam catalog without embedding."""

import argparse
import ast
from collections import Counter
import csv
import hashlib
import json
import math
from pathlib import Path
import re

from ingest import ROOT, REVISION, CSV_SHA256, GENRES, clean_description, verify_csv

DEFAULT_TARGET = 800
POLICY = "reach-reception-v1"
ANCHORS = {"359870", "1506510", "962730", "861650", "252110",
           "2552430", "2552440", "2552450"}
FIELDS = ["Positive", "Negative", "Estimated owners", "Peak CCU", "Metacritic score",
          "User score", "Score rank", "Recommendations"]
# All four DLC-title records in this revision were reviewed against their descriptions.
# These are product classifications, never search rules or ranking boosts.
PRODUCT_REVIEW = {
    "230050": (True, "Standalone satire with two full campaigns; DLC is part of the game's name."),
    "2552450": (True, "Base-game journey plus Re Mind; description says 'Also includes Re Mind'."),
    "42147": (False, "Description identifies a map pack of additional levels."),
    "325670": (False, "CRYENGINE middleware project; software add-on, not a standalone game."),
}
MODEL = {"name": "all-MiniLM-L6-v2", "implementation": "ONNXMiniLM_L6_V2",
         "providers": ["CPUExecutionProvider"], "space": "cosine"}
CHUNKING = {"version": "sentences-v1", "target_tokens": 100, "sentence_min_tokens": 40,
            "hard_max_tokens": 240}
SOFTWARE_GENRES = {"Animation & Modeling", "Audio Production", "Design & Illustration",
                   "Photo Editing", "Software Training", "Utilities", "Video Production", "Web Publishing"}


def integer(value):
    """Nonnegative integral CSV values only; reject missing, fractional, NaN, negatives."""
    if not isinstance(value, str) or not re.fullmatch(r"\d+", value.strip()):
        return None
    return int(value)


def owners(value):
    match = re.fullmatch(r"(\d+)\s*-\s*(\d+)", value.strip())
    if not match:
        return None
    low, high = map(int, match.groups())
    return (low, high) if low <= high else None


def read_rows(path=None):
    path = Path(path) if path else ROOT / "data/games.csv"
    verify_csv(path)
    seen = set()
    with path.open(newline="", encoding="utf-8") as source:
        reader = csv.reader(source)
        header = next(reader)
        if len(header) != 39 or header[7] != "DiscountDLC count":
            raise ValueError("Unexpected CSV header.")
        header[7:8] = ["Discount", "DLC count"]
        for values in reader:
            if len(values) != len(header):
                raise ValueError("Unexpected CSV row width.")
            row = dict(zip(header, values))
            if integer(row["AppID"]) is None or row["AppID"] in seen:
                raise ValueError("Invalid or duplicate source app ID.")
            seen.add(row["AppID"])
            row["description"] = clean_description(row["About the game"])
            yield row


def exclusion(row):
    if set(row["Genres"].split(",")) & SOFTWARE_GENRES:
        return "software/tool genre"
    if re.search(r"\b(demo|playtest|soundtrack)\b", row["Name"], re.I):
        return "demo/playtest/soundtrack title"
    if re.search(r"\bdlc\b", row["Name"], re.I):
        review = PRODUCT_REVIEW.get(row["AppID"])
        if not review or not review[0]:
            return review[1] if review else "DLC title requires product review"
    try:
        languages = ast.literal_eval(row["Supported languages"])
    except (SyntaxError, ValueError):
        return "invalid language metadata"
    if not isinstance(languages, list) or "English" not in languages:
        return "English not listed"
    if len(row["description"].split()) < 40:
        return "description shorter than 40 words"
    if not set(row["Genres"].split(",")) & GENRES:
        return "no eligible game genre"
    if integer(row["Positive"]) is None or integer(row["Negative"]) is None:
        return "invalid review counts"
    return None


def review_count(row):
    return integer(row["Positive"]) + integer(row["Negative"])


def reception(row):
    """95% Wilson lower bound; minimum 1,000 reviews enforced by selection."""
    n = review_count(row)
    if not n:
        return 0.0
    p, z = integer(row["Positive"]) / n, 1.96
    return (p + z*z/(2*n) - z * math.sqrt(p*(1-p)/n + z*z/(4*n*n))) / (1 + z*z/n)


def configuration(target):
    if target not in {750, 800}:
        raise ValueError("Catalog target must be 750 or 800.")
    return {"target": target, "reach_slots": target * 75 // 100,
            "reception_slots": target * 19 // 100, "minimum_reception_reviews": 1000,
            "reception": "95% Wilson lower bound (z=1.96)", "ties": "numeric app ID ascending",
            "order": "reach, additional reception, missing anchors, reach refill",
            "anchors": sorted(ANCHORS, key=int),
            "eligibility": "English; >=40 words; allowed game genre; exclude software/tool genres; product review for DLC titles",
            "excluded_software_genres": sorted(SOFTWARE_GENRES),
            "product_review": {k: {"is_game": v[0], "evidence": v[1]} for k, v in PRODUCT_REVIEW.items()}}


def select(rows, target=DEFAULT_TARGET):
    config = configuration(target)
    eligible = [r for r in rows if exclusion(r) is None]
    if len({r["AppID"] for r in eligible}) != len(eligible):
        raise ValueError("Duplicate eligible app IDs.")
    reach = sorted(eligible, key=lambda r: (-review_count(r), int(r["AppID"])))
    acclaimed = sorted((r for r in eligible if review_count(r) >= 1000),
                       key=lambda r: (-reception(r), int(r["AppID"])))
    selected, reasons = {}, {}

    def take(candidates, count, reason):
        added = 0
        for row in candidates:
            if added >= count:
                break
            if row["AppID"] not in selected:
                selected[row["AppID"]] = row
                reasons[row["AppID"]] = reason
                added += 1

    take(reach, config["reach_slots"], "broad reach")
    take(acclaimed, config["reception_slots"], "well reviewed")
    anchor_rows = sorted((r for r in eligible if r["AppID"] in ANCHORS), key=lambda r: int(r["AppID"]))
    if {r["AppID"] for r in anchor_rows} != ANCHORS:
        raise ValueError("A disclosed anchor failed eligibility or is absent.")
    take(anchor_rows, len(anchor_rows), "disclosed anchor")
    take(reach, target - len(selected), "reach refill")
    if len(selected) != target:
        raise ValueError("Could not reproduce the requested catalog count.")
    games = sorted(selected.values(), key=lambda r: int(r["AppID"]))
    entries = [{"app_id": r["AppID"], "title": r["Name"], "reason": reasons[r["AppID"]],
                "anchor": r["AppID"] in ANCHORS, "genres": r["Genres"],
                "positive": integer(r["Positive"]), "negative": integer(r["Negative"]),
                "reviews": review_count(r), "wilson_lower_bound": reception(r),
                "estimated_owners": owners(r["Estimated owners"])} for r in games]
    manifest = {"policy": POLICY, "revision": REVISION, "csv_sha256": CSV_SHA256,
                "configuration": config, "model": MODEL, "chunking": CHUNKING, "games": entries}
    # Canonical JSON also turns owner tuples into lists, matching a loaded manifest.
    return games, json.loads(json.dumps(manifest))


def identity(manifest):
    return hashlib.sha256(json.dumps(manifest, sort_keys=True, separators=(",", ":"),
                                     ensure_ascii=False).encode()).hexdigest()


def manifest_path(target=DEFAULT_TARGET):
    return ROOT / ("catalog_manifest.json" if target == DEFAULT_TARGET else f"catalog_manifest_{target}.json")


def load_manifest(target=DEFAULT_TARGET):
    configuration(target)
    manifest = json.loads(manifest_path(target).read_text(encoding="utf-8"))
    if (manifest["configuration"] != configuration(target) or manifest["policy"] != POLICY or
            manifest["revision"] != REVISION or manifest["csv_sha256"] != CSV_SHA256 or
            manifest["model"] != MODEL or manifest["chunking"] != CHUNKING or
            len(manifest["games"]) != target or
            len({g["app_id"] for g in manifest["games"]}) != target):
        raise ValueError("Catalog manifest does not match this configuration.")
    return manifest


def selected_games(path=None, target=DEFAULT_TARGET):
    games, manifest = select(list(read_rows(path)), target)
    if manifest != load_manifest(target):
        raise ValueError("Selection differs from the versioned manifest; audit before changing it.")
    return games


def audit(rows, selected):
    counts = {field: Counter({key: 0 for key in ("rows", "valid", "missing", "malformed", "zero", "nonzero", "above_100")})
              for field in FIELDS}
    for row in rows:
        for field in FIELDS:
            raw = row[field]
            n = owners(raw) if field == "Estimated owners" else integer(raw)
            counts[field]["rows"] += 1
            if n is not None:
                counts[field]["valid"] += 1
            counts[field]["missing" if not raw else "malformed" if n is None else
                          "zero" if n == 0 or n == (0, 0) else "nonzero"] += 1
            if field in {"Metacritic score", "User score", "Score rank"} and n is not None and n > 100:
                counts[field]["above_100"] += 1
    selected_ids = {r["AppID"] for r in selected}
    coverage = []
    for row in rows:
        if row["AppID"] in ANCHORS | {"292030", "620", "413150", "105600", "1245620", "730", "440"}:
            reason = exclusion(row)
            coverage.append({"app_id": row["AppID"], "title": row["Name"],
                             "status": "selected" if row["AppID"] in selected_ids else
                             "excluded" if reason else "eligible but unselected", "exclusion": reason})
    if not any(r["Name"].casefold() == "skate 3" for r in rows):
        coverage.append({"app_id": None, "title": "Skate 3", "status": "absent from snapshot", "exclusion": None})
    return {"fields": counts, "rows": len(rows),
            "exclusions": Counter(exclusion(r) or "eligible" for r in rows), "coverage": coverage,
            "eligible_at_least_1000_reviews": sum(exclusion(r) is None and review_count(r) >= 1000 for r in rows),
            "dlc_product_review": configuration(800)["product_review"]}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--write", action="store_true", help="Write audited manifests and readable preview; no embeddings.")
    args = parser.parse_args()
    rows = list(read_rows())
    from ingest import chunks, embedding_tools
    _, tokenizer = embedding_tools()
    summary, manifests = {}, {}
    for target in (750, 800):
        games, manifest = select(rows, target)
        summary[target] = {"games": len(games), "passages": sum(len(list(chunks(r["description"], tokenizer))) for r in games)}
        manifests[target] = manifest
        if args.write:
            manifest_path(target).write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n")
    games, _ = select(rows)
    report = audit(rows, games)
    report["dry_run"] = summary
    (ROOT / "data").mkdir(exist_ok=True)
    (ROOT / "data/catalog_audit.json").write_text(json.dumps(report, indent=2) + "\n")
    if args.write:
        manifest = manifests[800]
        genres = Counter(g for r in games for g in r["Genres"].split(","))
        lines = ["# Candidate catalog: 800 games", "", "Generated from the pinned CSV by `catalog.py --write`; no source text rewritten.",
                 "", "Selection: 600 by review volume, 152 additional games by 95% Wilson lower bound with at least 1,000 reviews, missing disclosed anchors, then review-volume refill. Ties use numeric app ID. Overlapping anchors occupy one slot. Genres overlap; counts are not exclusive. The 1,000-review floor leaves 6,866 eligible candidates and prevents tiny perfect-score samples dominating reception picks.",
                 "", "Snapshot review counts measure reach, not current popularity or personal familiarity. No franchise cap or manual diversity replacements were applied. Separate games/remasters remain distinct listings.",
                 "", f"Catalog identity: `{identity(manifest)}`.", "", "## Passage counts before embedding", "",
                 *[f"- {t} games: {v['passages']} passages." for t, v in summary.items()],
                 "", "## Genre distribution", "", *[f"- {g}: {n}" for g, n in genres.most_common()],
                 "", "## Coverage and notable omissions", "", "| Title | Status | Reason |", "| --- | --- | --- |",
                 *[f"| {c['title']} | {c['status']} | {c['exclusion'] or 'Meets eligibility'} |" for c in report["coverage"]],
                 "", "The Witcher 3 listing has no description in this snapshot. It is excluded rather than supplied with invented text. Kingdom Hearts listings are disclosed anchors. DLC Quest is a standalone game; the map pack and middleware add-on are excluded after reviewing all four DLC-title records.",
                 "", "## Full selected title list", ""]
        for reason in ("broad reach", "well reviewed", "disclosed anchor", "reach refill"):
            entries = [g for g in manifest["games"] if g["reason"] == reason]
            lines += [f"### {reason.title()} ({len(entries)})", "", "| App ID | Title | Genres | Reviews | Positive % |", "| --- | --- | --- | ---: | ---: |"]
            for g in entries:
                title = g['title'].replace('|', '\\|')
                ratio = 100 * g['positive'] / g['reviews'] if g['reviews'] else 0
                lines.append(f"| {g['app_id']} | {title} | {g['genres']} | {g['reviews']} | {ratio:.1f} |")
            lines.append("")
        (ROOT / "catalog_preview.md").write_text("\n".join(lines) + "\n")
    print(json.dumps({"dry_run": summary, "fields": report["fields"], "eligible_at_least_1000_reviews": report["eligible_at_least_1000_reviews"]}, indent=2))


if __name__ == "__main__":
    main()
