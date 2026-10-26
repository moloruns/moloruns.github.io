import contextlib
import io
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

from app import compare_candidates, select_numbers
from database import add_game, load_shortlist, save_candidate, statistics
from ingest import LEGACY_COLLECTION, ROOT, clean_description, embedding_tools, import_records, open_collection
from retrieval import search
from app import display_matches


DESCRIPTION = (
    "Pilot glass submarines through glowing caverns to harvest bioluminescent algae. "
    "Cultivate underwater gardens and trade luminous seeds with traveling botanists."
)
QUERY = "pilot glass submarines to harvest bioluminescent algae"
REFINED = "cultivate underwater gardens and trade luminous seeds with traveling botanists"


def seed_records():
    return [
        ("steam:fixture-racing:0", "Race high speed cars around an asphalt circuit.",
         {"app_id": "fixture-racing", "title": "Racing fixture", "chunk_index": 0,
          "windows": True, "genres": "Racing", "source": "Test fixture"}),
        ("steam:fixture-chess:0", "Play chess against a computer on a classic board.",
         {"app_id": "fixture-chess", "title": "Chess fixture", "chunk_index": 0,
          "genres": "Strategy", "source": "Test fixture"}),
    ]


class ShortlistTests(unittest.TestCase):
    def test_duplicate_save_preserves_notes_and_corrupt_file_is_not_overwritten(self):
        candidate = ({"app_id": "user:example", "title": "Example", "chunk_index": 0}, "Source text.", .2)
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "shortlist.json"
            self.assertTrue(save_candidate(path, candidate, "original query", "discover", "my note"))
            self.assertFalse(save_candidate(path, candidate, "new query", "discover", "replacement"))
            saved = load_shortlist(path)
            self.assertEqual(saved[0]["note"], "my note")
            self.assertEqual(saved[0]["query"], "original query")
            self.assertEqual(saved[0]["source"], "Unknown")
            path.write_text("broken JSON")
            with self.assertRaisesRegex(ValueError, "left untouched"):
                save_candidate(path, candidate, "query", "discover")
            self.assertEqual(path.read_text(), "broken JSON")

    def test_comparison_shows_unknowns_and_actual_evidence(self):
        first = ({"title": "First", "windows": True, "linux": False}, "Explicit source passage.", .3)
        second = ({"title": "Second"}, "Another source passage.", .4)
        with contextlib.redirect_stdout(io.StringIO()) as output:
            compare_candidates([first, second])
        text = output.getvalue()
        self.assertIn("Unknown", text)
        self.assertIn("Yes", text)
        self.assertIn("No", text)
        self.assertIn("Explicit source passage.", text)
        with self.assertRaises(ValueError):
            select_numbers("1,1", 2, minimum=2)
        with self.assertRaises(ValueError):
            select_numbers("0,3", 2, minimum=2)


class AppIntegrationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.embedding, cls.tokenizer = embedding_tools()

    def test_immediate_search_unique_ids_long_text_and_import_preservation(self):
        with tempfile.TemporaryDirectory(prefix="game-finder-add-") as folder:
            collection = open_collection(self.embedding, folder, LEGACY_COLLECTION)
            records = seed_records()
            import_records(collection, records)
            description = "<p>" + (DESCRIPTION + " ") * 8 + "</p>"
            game_id, count = add_game(collection, self.tokenizer, "Algae Lantern", description,
                                      platforms={"windows": True, "linux": False})
            self.assertGreater(count, 1)
            result = search(collection, self.tokenizer, QUERY)
            self.assertEqual(result[0][0]["app_id"], game_id)
            stored = collection.get(where={"app_id": game_id}, include=["documents", "metadatas"])
            ordered = sorted(zip(stored["metadatas"], stored["documents"]), key=lambda item: item[0]["chunk_index"])
            self.assertEqual(" ".join(doc for _, doc in ordered), clean_description(description))
            self.assertTrue(all(len(self.tokenizer.encode(doc).ids) <= 240 for _, doc in ordered))
            self.assertNotIn("mac", ordered[0][0])
            self.assertEqual(ordered[0][0]["source"], "User-provided")
            other_id, _ = add_game(collection, self.tokenizer, "Algae Lantern", DESCRIPTION)
            self.assertNotEqual(game_id, other_id)
            before = collection.count()
            self.assertEqual(import_records(collection, records), 0)
            self.assertEqual(collection.count(), before)
            self.assertEqual(statistics(collection)["user_games"], 2)
            with self.assertRaises(ValueError):
                add_game(collection, self.tokenizer, "Blank", "<p> </p>")
            with self.assertRaises(ValueError):
                add_game(collection, self.tokenizer, "Invalid metadata", DESCRIPTION, platforms={"mac": "unknown"})
            self.assertEqual(collection.count(), before)

    def test_enhanced_feature_evidence_saved_and_reopened_with_legacy_entries(self):
        with tempfile.TemporaryDirectory(prefix='game-finder-evidence-') as folder:
            collection = open_collection(self.embedding, folder, LEGACY_COLLECTION)
            import_records(collection, seed_records())
            query = 'life and social simulation'
            # No imported records/tags required for runtime additions to participate.
            game_id, _ = add_game(collection, self.tokenizer, 'Household fixture',
                                  'A life simulation. Develop relationships and friendships with neighbors.')
            results = search(collection, self.tokenizer, query, method="rules")
            self.assertEqual(results[0][0]['app_id'], game_id)
            self.assertTrue(all(e['state'] == 'supported' for e in results[0][0]['_search']['requirements']))
            path = Path(folder) / 'shortlist.json'
            legacy = ({'app_id': 'old', 'title': 'Legacy shortlist fixture'}, 'Old evidence.', .3)
            save_candidate(path, legacy, 'old query', 'discover', 'old note')
            self.assertTrue(save_candidate(path, results[0], query, 'discover', 'new note'))
            entries = load_shortlist(path)
            self.assertEqual(entries[0]['note'], 'old note')
            self.assertNotIn('search_evidence', entries[0])
            self.assertEqual(entries[1]['search_evidence']['requirements'], results[0][0]['_search']['requirements'])
            snapshot = path.read_bytes()
            self.assertFalse(save_candidate(path, results[0], query, 'discover', 'replacement'))
            self.assertEqual(path.read_bytes(), snapshot)
            with contextlib.redirect_stdout(io.StringIO()) as output:
                display_matches(query, results)
            self.assertIn('Life simulation: supported', output.getvalue())
            self.assertIn('Social relationships: supported', output.getvalue())
            # Restart through the real CLI and read the new optional evidence alongside old entries.
            reopened = subprocess.run([sys.executable, str(ROOT/'app.py'), '--store', folder, '--method', 'rules'],
                                      input='3\n2\n\n5\n', text=True, capture_output=True, timeout=90)
            self.assertEqual(reopened.returncode, 0, reopened.stderr)
            self.assertIn('new note', reopened.stdout)
            self.assertIn('Life simulation: supported', reopened.stdout)
            # The label must not turn missing plot evidence into a confirmed match.
            add_game(collection, self.tokenizer, 'Route fixture',
                     'Features romance routes with multiple endings.')
            partial = search(collection, self.tokenizer, 'romance with a tragic ending', method='rules')
            with contextlib.redirect_stdout(io.StringIO()) as output:
                display_matches('romance with a tragic ending', partial)
            self.assertIn('partial or uncertain', output.getvalue())

    def test_full_cli_add_search_compare_refine_save_and_separate_process_restart(self):
        with tempfile.TemporaryDirectory(prefix="game-finder-cli-") as folder:
            store = Path(folder) / "store"
            collection = open_collection(self.embedding, store, LEGACY_COLLECTION)
            import_records(collection, seed_records())
            commands = [
                "invalid", "2", "Algae Lantern", DESCRIPTION, "", "My test description", "Adventure",
                "y", "", "n",  # Platforms: Windows yes, macOS unknown, Linux no.
                "1", QUERY, "c", "0,99", "c", "1,2", "r", REFINED,
                "s", "1", "Try this on a quiet evening", "b", "3", "", "4", "5",
            ]
            command = [sys.executable, str(ROOT / "app.py"), "--store", str(store)]
            first = subprocess.run(command, input="\n".join(commands) + "\n", text=True,
                                   capture_output=True, cwd=folder, timeout=90)
            self.assertEqual(first.returncode, 0, first.stderr + first.stdout)
            for expected in ["searchable now", "Comparison", "Choose 2–3 distinct numbers",
                             "Saved to your local shortlist", "Try this on a quiet evening",
                             "Added by you: 1 games"]:
                self.assertIn(expected, first.stdout)
            self.assertIn('1. Search games', first.stdout)
            self.assertIn('Game title, remembered details, or experience you want:', first.stdout)
            self.assertNotIn('What was that game?', first.stdout)
            self.assertNotIn('What should I play?', first.stdout)
            shortlist = load_shortlist(store / "shortlist.json")
            self.assertEqual(len(shortlist), 1)
            self.assertEqual(shortlist[0]["title"], "Algae Lantern")
            self.assertEqual(shortlist[0]["query"], REFINED)
            self.assertEqual(shortlist[0]["mode"], "search")
            second_commands = ["3", "1", "", "1", QUERY, "b", "4", "5"]
            second = subprocess.run(command, input="\n".join(second_commands) + "\n", text=True,
                                    capture_output=True, cwd=folder, timeout=90)
            self.assertEqual(second.returncode, 0, second.stderr + second.stdout)
            for expected in ["Algae Lantern", "Try this on a quiet evening", "evidence from its description",
                             "Games to consider", "Added by you: 1 games"]:
                self.assertIn(expected, second.stdout)
            self.assertNotIn("Preparing the 500-game sample", second.stdout)


if __name__ == "__main__":
    unittest.main()
