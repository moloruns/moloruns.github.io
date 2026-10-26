"""Game Finder: identify, discover, compare, and save games locally."""

import argparse
from pathlib import Path
import re
import sys
import textwrap

from chromadb.errors import ChromaError

from database import add_game, load_shortlist, save_candidate, statistics
from ingest import ROOT, embedding_tools, prepare_collection, store_lock
from retrieval import METHODS, assess_matches, search
from features import evidence_label


class Cancelled(Exception):
    pass


def ask(prompt, required=False):
    while True:
        value = input(prompt).strip()
        if value == "/cancel":
            raise Cancelled
        if value or not required:
            return value
        print("Please enter a value, or /cancel to return.")


def select_numbers(value, count, minimum=1, maximum=3):
    try:
        numbers = list(dict.fromkeys(int(piece.strip()) for piece in value.split(",")))
    except ValueError as error:
        raise ValueError("Enter result numbers separated by commas, such as 1,2.") from error
    if not minimum <= len(numbers) <= maximum or any(n < 1 or n > count for n in numbers):
        raise ValueError(f"Choose {minimum}–{maximum} distinct numbers between 1 and {count}.")
    return [n - 1 for n in numbers]


def platform_label(meta, name):
    value = meta.get(name)
    return "Yes" if value is True else "No" if value is False else "Unknown"


def display_evidence(meta, shown_passage=""):
    """Show each source sentence once, and distinguish tags from description evidence."""
    def normalized(text):
        return ' '.join(re.findall(r'\w+|[^\w\s]', text.casefold()))

    quoted = [normalized(shown_passage)] if shown_passage else []

    def quote_new(text):
        fresh = []
        for sentence in re.split(r'(?<=[.!?])\s+|\n+', text):
            key = normalized(sentence)
            if key and not any(f' {key} ' in f' {previous} ' for previous in quoted):
                fresh.append(sentence.strip())
                quoted.append(key)
        if fresh:
            excerpt = ' '.join(fresh)
            quoted.append(normalized(excerpt))
            print(textwrap.fill(excerpt, width=96, initial_indent='     ', subsequent_indent='     '))
        return bool(fresh)

    details = meta.get('_search', {})
    for aspect in details.get('aspects', []):
        states = {'matched': 'source wording or label matches; verify context',
                  'unknown': 'no direct source match; semantic suggestion only',
                  'contradicted': 'source wording conflicts with request',
                  'conflicting': 'source signals conflict; inspect context'}
        state = aspect.get('evidence_state')
        signals = aspect.get('source_signals')
        labels = aspect.get('source_labels', [])
        explanation = states.get(state, 'unverified')
        if state == 'matched':
            if aspect.get('negative'):
                explanation = 'requested absence mentioned in description; verify context'
            elif signals and signals.get('mentions'):
                explanation = 'description wording and source labels match' if labels else 'mentioned in description'
            elif labels:
                explanation = ('source labels match; no direct description match' if signals is not None
                               else 'source labels match; description unverified')
        print(f"   Request aspect: {aspect['text']} — {explanation}")
        if labels:
            label = 'Labels concerning the excluded aspect' if aspect.get('negative') else 'Matching source labels'
            print(f"     {label}: {', '.join(labels)}")
        if aspect.get('absence_unverified'):
            print('     Absence is unverified; similarity and missing tags cannot establish it.')
        if signals is not None:
            # Nearest passages are semantic suggestions. Only quote actual
            # source mentions/negations as description evidence for an aspect.
            snippets = signals.get('mentions', [])[:1] + signals.get('negations', [])[:1]
        else:
            # Older shortlist snapshots lack source signals. Keep their source
            # text inspectable without implying a tag-only match has a quote.
            snippets = [aspect.get('source_excerpt', '')] if not labels and state != 'unknown' else []
        printed = [quote_new(text) for text in snippets if text]
        if printed and not any(printed):
            print('     Description: see excerpt above.')
    for item in details.get('requirements', []):
        print(textwrap.fill(evidence_label(item), width=96, initial_indent='   ', subsequent_indent='   '))
        count = 2 if item['state'] == 'unknown' else 1
        for source in item['evidence'][:count]:
            if not quote_new(source['text']):
                print('     Source text: see excerpt above.')


def compare_candidates(candidates):
    """Compare recorded attributes and excerpts, without generating game features."""
    width = 27
    rows = [("Game", [meta["title"] for meta, _, _ in candidates])]
    for name, label in [("windows", "Windows"), ("mac", "macOS"), ("linux", "Linux")]:
        rows.append((label, [platform_label(meta, name) for meta, _, _ in candidates]))
    for name, label in [("genres", "Genres"), ("tags", "Source tags")]:
        rows.append((label, [str(meta.get(name) or "Unknown") for meta, _, _ in candidates]))
    print("\nComparison — recorded metadata; missing details stay Unknown.")
    for label, values in rows:
        wrapped = [textwrap.wrap(value, width=width) or [""] for value in values]
        for line in range(max(len(value) for value in wrapped)):
            cells = [(value[line] if line < len(value) else "").ljust(width) for value in wrapped]
            print(f"{label if line == 0 else '':12} | " + " | ".join(cells))
        print("-" * (15 + (width + 3) * len(values)))
    for meta, passage, _ in candidates:
        print(f"\n{meta['title']} — evidence from its description:")
        print(textwrap.fill(passage, width=96, initial_indent="  ", subsequent_indent="  "))
        print(f"  Source: {meta.get('source') or 'Unknown'}")
        display_evidence(meta, passage)
    print("\nUse these details to choose a candidate or refine your description.")


def display_matches(query, results):
    status = assess_matches(query, results)
    if status == "empty":
        print("No games are stored yet. Add a game or import the dataset.")
        return []
    if status == "weak":
        print("No strong match found. Try adding a gameplay mechanic, setting, or character.")
        return []
    if status == "ambiguous":
        print("That description is broad. Add a gameplay mechanic or setting to narrow it down.")
    if status == 'partial':
        print("The leading candidate has unresolved or conflicting parts of your request. "
              "These are partial or uncertain matches; inspect each aspect below.")
    if results[0][0].get('_search', {}).get('requirements'):
        print("Feature checks cover a limited vocabulary; other details and narrative connections remain unverified.")
    if results[0][0].get('_search', {}).get('aspects'):
        print('Ranked against the whole request and its aspects. Excerpts and source labels are clues, not verified feature claims.')
    print("\nGames to consider — compare their features and evidence.")
    for rank, (meta, passage, distance) in enumerate(results, 1):
        score_label = 'vector distance' if meta.get('_search') else 'distance'
        print(f"\n{rank}. {meta['title']} ({score_label} {distance:.3f}; lower is closer)")
        print(textwrap.fill(passage, width=96, initial_indent="   ", subsequent_indent="   "))
        print(f"   Source: {meta.get('source') or 'Unknown'}")
        display_evidence(meta, passage)
    return results


def search_flow(collection, tokenizer, shortlist_path, method='enhanced'):
    query = ask("Game title, remembered details, or experience you want: ", required=True)
    while True:
        results = display_matches(query, search(collection, tokenizer, query, method))
        while True:
            choices = "[c] Compare  [s] Save  [r] Refine  [b] Back" if results else "[r] Refine  [b] Back"
            action = ask(f"\n{choices}\nChoose: ").lower()
            if action in {"b", "back"}:
                return
            if action in {"r", "refine"}:
                revised = ask("Revised description (replaces current query; Enter keeps it): ")
                if revised:
                    # Validate before discarding the current result list.
                    try:
                        refined_results = search(collection, tokenizer, revised, method)
                    except ValueError as error:
                        print(error)
                        continue
                    query = revised
                    results = display_matches(query, refined_results)
                continue
            try:
                if action in {"c", "compare"} and results:
                    if len(results) < 2:
                        print("Only one candidate is available. Refine your description to find alternatives.")
                        continue
                    indices = select_numbers(ask("Compare 2–3 results (e.g. 1,2): "), len(results), minimum=2)
                    compare_candidates([results[i] for i in indices])
                elif action in {"s", "save"} and results:
                    index = select_numbers(ask("Save which result number? "), len(results), maximum=1)[0]
                    note = ask("Your note (optional): ")
                    saved = save_candidate(shortlist_path, results[index], query, 'search', note)
                    print("Saved to your local shortlist." if saved
                          else "Already saved; the existing query and note have been kept.")
                else:
                    print("Choose one of the displayed actions.")
            except (ValueError, OSError) as error:
                print(error)


def add_flow(collection, tokenizer):
    print("\nAdd a game. Enter /cancel at any prompt to return.")
    title = ask("Title: ", required=True)
    print("Description (paste multiple lines; a blank line finishes):")
    lines = []
    while line := ask("> "):
        lines.append(line)
    description = " ".join(lines)
    if not description.strip():
        raise ValueError("A description is required; nothing was added.")
    source = ask("Source URL or label (optional): ")
    genres = ask("Genres, separated by commas (optional): ")
    platforms = {}
    for name, label in [("windows", "Windows"), ("mac", "macOS"), ("linux", "Linux")]:
        while True:
            value = ask(f"{label} support? [y/n/Enter = unknown]: ").lower()
            if value in {"", "y", "yes", "n", "no"}:
                if value:
                    platforms[name] = value in {"y", "yes"}
                break
            print("Enter y, n, or leave it blank for unknown.")
    print("Adding and indexing the description...", flush=True)
    _, count = add_game(collection, tokenizer, title, description, source, genres, platforms)
    print(f"Added {title} ({count} passages). It is searchable now; no restart needed.")


def shortlist_flow(path):
    entries = load_shortlist(path)
    if not entries:
        print("Your shortlist is empty. Search for games and choose Save.")
        return
    print("\nYour local shortlist:")
    for index, entry in enumerate(entries, 1):
        print(f"\n{index}. {entry['title']}")
        print(f"   Saved for: {entry['query']}")
        print(f"   Note: {entry['note'] or '(none)'}")
        print(f"   Source: {entry['source']}")
    print("Saved descriptions and metadata are snapshots from when you chose the games.")
    while True:
        value = ask("View/compare 1–3 saved numbers, or Enter to return: ")
        if not value:
            return
        try:
            indices = select_numbers(value, len(entries))
            compare_candidates([({**entries[i], '_search': entries[i].get('search_evidence', {})},
                                 entries[i]["passage"], entries[i].get("distance", 0.0))
                                for i in indices])
        except ValueError as error:
            print(error)


def run_app(collection, tokenizer, shortlist_path, method='enhanced'):
    print("Game Finder — describe, compare, and save. /cancel returns from a task.")
    while True:
        print("\n1. Search games\n2. Add a game\n3. View shortlist"
              "\n4. Database statistics\n5. Quit")
        choice = input("Choose: ").strip().lower()
        try:
            if choice == "1":
                search_flow(collection, tokenizer, shortlist_path, method)
            elif choice == "2":
                add_flow(collection, tokenizer)
            elif choice == "3":
                shortlist_flow(shortlist_path)
            elif choice == "4":
                stats = statistics(collection)
                print(f"\n{stats['games']} games / {stats['passages']} searchable passages")
                print(f"Imported: {stats['imported_games']} games / {stats['imported_passages']} passages")
                print(f"Added by you: {stats['user_games']} games / {stats['user_passages']} passages")
            elif choice in {"5", "q", "quit", "exit"}:
                print("Goodbye. Added games and shortlist entries are saved locally.")
                return
            else:
                print("Choose a number from 1 to 5.")
        except Cancelled:
            print("Returned to menu.")
        except (ValueError, OSError, ChromaError) as error:
            print(f"Could not complete that action: {error}")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--store", type=Path, default=ROOT / "chroma_store", help="Optional isolated database directory.")
    parser.add_argument("--shortlist", type=Path, help="Defaults to shortlist.json in the database directory.")
    parser.add_argument("--collection", help="Explicit catalog collection (otherwise active catalog).")
    parser.add_argument("--target", type=int, choices=[750, 800], help="Explicit catalog size.")
    parser.add_argument('--method', choices=METHODS, default='enhanced', help='Default: source anchors and semantic relevance across query aspects.')
    args = parser.parse_args()
    embedding, tokenizer = embedding_tools()
    with store_lock(args.store):
        collection = prepare_collection(embedding, tokenizer, args.store, args.collection, args.target)
        print(f"Catalog: {collection.name}")
        print(f"Search method: {args.method}")
        run_app(collection, tokenizer, args.shortlist or args.store / "shortlist.json", args.method)


if __name__ == "__main__":
    try:
        main()
    except (EOFError, KeyboardInterrupt):
        print("\nSession ended. Completed additions and shortlist saves remain on disk.")
    except (ValueError, OSError, ChromaError) as error:
        print(f"Game Finder: {error}", file=sys.stderr)
        sys.exit(1)
