"""Small search playground, before the full Game Finder CLI is built."""

import argparse
import sys
from pathlib import Path

from database import statistics
from ingest import embedding_tools, prepare_collection, store_lock
from retrieval import METHODS, assess_matches, keyword_rank, search
from app import display_evidence


def show_results(collection, tokenizer, query, compare=False, method="enhanced"):
    results = search(collection, tokenizer, query, method)
    status = assess_matches(query, results)
    if status == "empty":
        print("The search collection is empty. Import games first.")
        return
    if status == "weak":
        print("\nNo strong match found. Try describing a gameplay mechanic, setting, or character.")
        if not compare:
            return
        print("Closest candidates below are shown for comparison only.")
    elif status == "ambiguous":
        print("\nThat description is broad. Add a gameplay mechanic or setting to narrow it down.")
    if status == "partial":
        print("The leading candidate has unresolved or conflicting request aspects. Inspect partial/uncertain matches below.")
    print(f"\nMethod: {method}; candidates are not confirmed matches. Vector distance is not confidence.")
    if method != "vector":
        print("Titles, tags, genres, and descriptions contribute; vector distance alone does not determine rank.")
    for rank, (meta, passage, distance) in enumerate(results, 1):
        print(f"\n{rank}. {meta['title']} | distance {distance:.3f}")
        print(f"   {meta['source']}")
        print(f"   {passage}")
        if meta.get("_search"):
            if 'joint_score' in meta['_search']:
                details = meta['_search']
                print(f"   Source-matched aspects: {details['matched_aspects']}/{len(details['aspects'])}; "
                      f"balanced semantic score: {details['joint_score']:.3f} (not confidence).")
            else:
                print(f"   Fusion score: {meta['_search']['fusion_score']:.5f}; lexical score: {meta['_search']['lexical_score']:.3f}")
        display_evidence(meta, passage)
    print()
    if compare:
        stored = collection.get(include=["documents", "metadatas"])
        records = list(zip(stored["ids"], stored["documents"], stored["metadatas"]))
        baseline = keyword_rank(records, query)
        print("Keyword baseline: distinct shared words in description passages (not metadata).")
        print("Ties use app ID order; zero means no shared content words.")
        for rank, (meta, _, score, words) in enumerate(baseline[:5], 1):
            print(f"{rank}. {meta['title']} | {score} shared words: {', '.join(words) or '(none)'}")
        print()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--compare", action="store_true", help="Also show the keyword baseline.")
    parser.add_argument("query", nargs="*", help="Optional single search; otherwise interactive.")
    parser.add_argument("--store", type=Path, help="Optional isolated database directory.")
    parser.add_argument("--collection", help="Explicit catalog collection.")
    parser.add_argument("--target", type=int, choices=[750, 800])
    parser.add_argument("--method", choices=METHODS, default="enhanced")
    args = parser.parse_args()
    embedding, tokenizer = embedding_tools()
    with store_lock(args.store):
        collection = prepare_collection(embedding, tokenizer, args.store, args.collection, args.target)
        stats = statistics(collection)
        print(f"\nGame Finder test — {stats['games']} games, {stats['passages']} passages")
        if args.query:
            show_results(collection, tokenizer, " ".join(args.query), args.compare, args.method)
            return
        print("Describe a game or experience. Type /quit to exit.")
        while True:
            try:
                query = input("Search> ").strip()
            except EOFError:
                break
            if query.lower() in {"/quit", "quit", "exit"}:
                break
            if not query:
                continue
            try:
                show_results(collection, tokenizer, query, args.compare, args.method)
            except ValueError as error:
                print(error)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nStopped. Stored data will be reused next time.")
    except (ValueError, OSError) as error:
        print(f"Search tester: {error}", file=sys.stderr)
        sys.exit(1)
