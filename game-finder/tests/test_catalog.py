"""Catalog/migration checks use isolated stores; synthetic vectors are not search evidence."""

import copy
import json
from pathlib import Path
import random
import tempfile
import unittest
from unittest.mock import patch

from chromadb.api.types import EmbeddingFunction

import catalog
import ingest
from database import add_game, load_shortlist, save_candidate


class TestEmbedding(EmbeddingFunction):
    def __init__(self):
        self.calls = 0
        self.fail_at = None

    def __call__(self, input):
        self.calls += 1
        if self.calls == self.fail_at:
            raise RuntimeError("interrupted fixture embedding")
        return [[1.0, 0.0, 0.0] for _ in input]

    @staticmethod
    def name():
        return "catalog_test"

    def get_config(self):
        return {}

    @staticmethod
    def build_from_config(config):
        return TestEmbedding()


def row(app_id, positive="5000", negative="100"):
    return {"AppID": str(app_id), "Name": f"Fixture {app_id}", "Positive": positive,
            "Negative": negative, "Estimated owners": "0 - 20000", "Genres": "Adventure",
            "Supported languages": "['English']", "description": "word " * 50}


class SelectionTests(unittest.TestCase):
    def test_score_parsing_rejects_ambiguous_values(self):
        self.assertEqual(catalog.integer(" 10 "), 10)
        for value in ("", "-1", "1.2", "nan", "1e6", "unknown"):
            self.assertIsNone(catalog.integer(value))
        self.assertEqual(catalog.owners("20000 - 50000"), (20000, 50000))
        self.assertEqual(catalog.owners("0 - 0"), (0, 0))
        for value in ("unknown", "500 - 100", "-1 - 20"):
            self.assertIsNone(catalog.owners(value))

    def test_product_reviews_do_not_remove_the_dlc_filter(self):
        for app_id, (allowed, _) in catalog.PRODUCT_REVIEW.items():
            item = row(app_id)
            item["Name"] = "Fixture DLC"
            self.assertEqual(catalog.exclusion(item) is None, allowed)
        item = row("999999")
        item["Name"] = "Unreviewed DLC"
        self.assertIn("product review", catalog.exclusion(item))
        item["Name"] = "Fixture"
        item["Genres"] = "Casual,Utilities"
        self.assertEqual(catalog.exclusion(item), "software/tool genre")
        item["Genres"] = "Adventure"
        item["description"] = "short"
        self.assertIn("40 words", catalog.exclusion(item))

    def test_selection_is_order_independent_and_tiny_perfect_scores_do_not_win(self):
        rows = [row(i, str(5000 + i), str(100 + i % 31)) for i in range(1, 1101)]
        rows += [row(app, "10", "2") for app in catalog.ANCHORS]
        tiny = row("999999", "1", "0")
        rows.append(tiny)
        for target in (750, 800):
            games, manifest = catalog.select(rows, target)
            shuffled = rows.copy()
            random.Random(4).shuffle(shuffled)
            self.assertEqual(manifest, catalog.select(shuffled, target)[1])
            self.assertEqual(len(games), target)
            ids = {r['AppID'] for r in games}
            self.assertTrue(catalog.ANCHORS <= ids)
            self.assertNotIn("999999", ids)
            self.assertEqual(sum(g['reason'] == 'broad reach' for g in manifest['games']), target * 75 // 100)
            self.assertEqual(sum(g['reason'] == 'well reviewed' for g in manifest['games']), target * 19 // 100)
        with self.assertRaises(ValueError):
            catalog.select(rows + [rows[0]])
        with self.assertRaises(ValueError):
            catalog.configuration(900)

    def test_both_manifests_reproduce_from_public_source(self):
        rows = list(catalog.read_rows())
        for target in (750, 800):
            self.assertEqual(catalog.select(rows, target)[1], catalog.load_manifest(target))
        original = catalog.load_manifest()
        changed = copy.deepcopy(original)
        changed['games'][0]['title'] += ' changed'
        self.assertNotEqual(catalog.identity(original), catalog.identity(changed))


class MigrationTests(unittest.TestCase):
    def test_fresh_default_and_750_activation_without_a_legacy_store(self):
        embedding = TestEmbedding()
        with tempfile.TemporaryDirectory() as folder:
            for target in (800, 750):
                store = Path(folder) / str(target)
                records = [(f"steam:{g['app_id']}:0", "Synthetic fresh-build fixture.",
                            {'app_id': g['app_id'], 'title': g['title'], 'chunk_index': 0})
                           for g in catalog.load_manifest(target)['games']]
                with patch('ingest.selected_games', return_value=[]), patch('ingest.build_records', return_value=records):
                    collection = ingest.prepare_collection(embedding, None, store,
                                                           target=None if target == 800 else target)
                ingest.validate_ready(collection, target)
                with ingest.store_lock(store):
                    ingest.activate_collection(embedding, collection.name, store, target)
                calls = embedding.calls
                with patch('ingest.selected_games', side_effect=AssertionError('should reuse ready catalog')):
                    reopened = ingest.prepare_collection(embedding, None, store)
                self.assertEqual(reopened.name, collection.name)
                self.assertEqual(embedding.calls, calls)
                self.assertNotIn(ingest.LEGACY_COLLECTION, {c.name for c in ingest.client_for(store).list_collections()})

    def test_resume_activation_rollback_and_notes_preserve_user_additions(self):
        embedding = TestEmbedding()
        with tempfile.TemporaryDirectory() as folder:
            legacy = ingest.open_collection(embedding, folder, ingest.LEGACY_COLLECTION)
            ingest.import_records(legacy, [("steam:legacy:0", "Legacy fixture.",
                                           {"app_id": "legacy", "title": "Fixture", "chunk_index": 0})])
            user_meta = {"app_id": "user:before", "title": "User fixture", "chunk_index": 0}
            legacy.add(ids=["user:before:0"], documents=["Personal source text."], metadatas=[user_meta])
            shortlist = Path(folder) / 'shortlist.json'
            save_candidate(shortlist, (user_meta, "Personal source text.", .1), "my query", "identify", "keep my note")
            note_bytes = shortlist.read_bytes()
            destination = ingest.open_collection(embedding, folder)
            records = [(f"steam:{g['app_id']}:0", "Synthetic migration fixture, not corpus evidence.",
                        {"app_id": g['app_id'], "title": g['title'], "chunk_index": 0})
                       for g in catalog.load_manifest()['games']]
            embedding.fail_at = embedding.calls + 2
            with self.assertRaisesRegex(RuntimeError, 'interrupted'):
                ingest.import_records(destination, records)
            self.assertEqual(destination.count(), 50)
            self.assertEqual(ingest.active_name(folder), legacy.name)
            with self.assertRaisesRegex(ValueError, 'incomplete'):
                ingest.activate_collection(embedding, destination.name, folder)
            embedding.fail_at = None
            self.assertEqual(ingest.import_records(destination, records), 750)
            calls = embedding.calls
            self.assertEqual(ingest.import_records(destination, records), 0)
            self.assertEqual(embedding.calls, calls)
            with ingest.store_lock(folder):
                with self.assertRaisesRegex(ValueError, 'in use'):
                    with ingest.store_lock(folder):
                        pass
                ingest.activate_collection(embedding, destination.name, folder)
            self.assertEqual(ingest.active_name(folder), destination.name)
            self.assertEqual(destination.get(ids=['user:before:0'])['documents'], ['Personal source text.'])
            destination.add(ids=['user:after:0'], documents=['Added after activation.'],
                            metadatas=[{'app_id': 'user:after', 'title': 'New fixture', 'chunk_index': 0}])
            with ingest.store_lock(folder):
                ingest.activate_collection(embedding, legacy.name, folder)
            self.assertEqual(ingest.active_name(folder), legacy.name)
            self.assertEqual(legacy.get(ids=['user:after:0'])['documents'], ['Added after activation.'])
            self.assertEqual(shortlist.read_bytes(), note_bytes)
            self.assertEqual(load_shortlist(shortlist)[0]['note'], 'keep my note')
            # A missing imported passage and an incompatible identity must never pass readiness checks.
            destination.delete(ids=[records[0][0]])
            with self.assertRaises(ValueError):
                ingest.validate_ready(destination)
            ingest.import_records(destination, records)
            destination.modify(metadata={**destination.metadata, 'catalog_identity': 'wrong'})
            with self.assertRaisesRegex(ValueError, 'identity'):
                ingest.open_collection(embedding, folder)

    def test_conflicting_user_ids_leave_both_versions_available(self):
        embedding = TestEmbedding()
        with tempfile.TemporaryDirectory() as folder:
            first = ingest.open_collection(embedding, folder, ingest.LEGACY_COLLECTION)
            second = ingest.open_collection(embedding, folder)
            meta = {'app_id': 'user:same', 'title': 'Fixture'}
            for collection, text in ((first, 'first text'), (second, 'different text')):
                collection.add(ids=['user:same:0'], documents=[text], metadatas=[meta])
            with self.assertRaisesRegex(ValueError, 'Conflicting'):
                ingest.migrate_users(first, second)
            self.assertEqual(first.get()['documents'], ['first text'])
            self.assertEqual(second.get()['documents'], ['different text'])


if __name__ == '__main__':
    unittest.main()
