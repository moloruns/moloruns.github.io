"""Run with .venv/bin/python -m unittest discover -s tests -v."""

import hashlib
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import ingest


class DownloadTests(unittest.TestCase):
    def test_verified_download_is_reused(self):
        payload = b"small fixture for download integrity"
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "games.csv"
            with patch.object(ingest, "CSV_SHA256", hashlib.sha256(payload).hexdigest()):
                with patch("ingest.urllib.request.urlopen", return_value=io.BytesIO(payload)) as request:
                    ingest.download_csv(path)
                    request.assert_called_once()
                self.assertEqual(path.read_bytes(), payload)
                with patch("ingest.urllib.request.urlopen") as request:
                    ingest.download_csv(path)
                    request.assert_not_called()
            self.assertEqual(list(Path(folder).iterdir()), [path])

    def test_bad_download_is_not_published_and_existing_file_is_preserved(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "games.csv"
            with patch("ingest.urllib.request.urlopen", return_value=io.BytesIO(b"wrong data")):
                with self.assertRaisesRegex(ValueError, "checksum"):
                    ingest.download_csv(path)
            self.assertEqual(list(Path(folder).iterdir()), [])
            path.write_bytes(b"existing data")
            with patch("ingest.urllib.request.urlopen") as request:
                with self.assertRaisesRegex(ValueError, "checksum"):
                    ingest.download_csv(path)
                request.assert_not_called()
            self.assertEqual(path.read_bytes(), b"existing data")

    def test_interrupted_download_cleans_up_partial_file(self):
        with tempfile.TemporaryDirectory() as folder:
            with patch("ingest.urllib.request.urlopen", side_effect=OSError("connection lost")):
                with self.assertRaises(OSError):
                    ingest.download_csv(Path(folder) / "games.csv")
            self.assertEqual(list(Path(folder).iterdir()), [])


class CorpusIntegrationTests(unittest.TestCase):
    def test_reproducible_ingestion_repair_and_user_record_preservation(self):
        # Validate the full corpus; exercise mutations on a small isolated store.
        games = ingest.selected_games()
        self.assertEqual(len(games), 800)
        self.assertEqual(len({r["AppID"] for r in games}), 800)
        from catalog import load_manifest
        self.assertEqual({r["AppID"] for r in games},
                         {r["app_id"] for r in load_manifest()["games"]})
        embedding, tokenizer = ingest.embedding_tools()
        for game in games:
            parts = list(ingest.chunks(game["description"], tokenizer))
            self.assertEqual(" ".join(parts), game["description"])
            self.assertTrue(all(len(tokenizer.encode(part).ids) <= 240 for part in parts))
        self.assertEqual(ingest.clean_description("<p>Hello &amp; welcome.</p>\n<p>Next.</p>"),
                         "Hello & welcome. Next.")
        records = ingest.build_records(games, tokenizer)
        self.assertEqual(len(records), 6076)
        # Exercise storage on a small fixture after validating the full corpus.
        records = records[:10]
        sample_games = len({r[2]["app_id"] for r in records})
        with tempfile.TemporaryDirectory(prefix="game-finder-ingest-") as folder:
            collection = ingest.open_collection(embedding, folder, ingest.LEGACY_COLLECTION)
            self.assertEqual(ingest.import_records(collection, records), 10)
            self.assertEqual(collection.count(), 10)
            # Inspect actual persisted text, not just record counts.
            stored = collection.get(ids=[r[0] for r in records], include=["documents", "metadatas"])
            actual = {id: (doc, meta) for id, doc, meta in
                      zip(stored["ids"], stored["documents"], stored["metadatas"])}
            self.assertEqual(actual, {id: (doc, meta) for id, doc, meta in records})
            user_doc = "My own game about sailing between floating islands."
            collection.add(ids=["user:integration-check:0"], documents=[user_doc],
                           metadatas=[{"app_id": "user:integration-check", "title": "My game"}])
            self.assertEqual(ingest.import_records(collection, records), 0)
            self.assertEqual(collection.count(), 11)
            collection.delete(ids=[records[0][0]])
            collection.update(ids=[records[1][0]], documents=["Wrong imported description."])
            self.assertEqual(ingest.import_records(collection, records), 2)
            self.assertEqual(collection.count(), 11)
            self.assertEqual(collection.get(ids=["user:integration-check:0"])["documents"], [user_doc])
            self.assertEqual(collection.get(ids=[records[1][0]])["documents"], [records[1][1]])
            self.assertTrue(collection.metadata["ready"])
            self.assertEqual(collection.metadata["games"], sample_games)
            self.assertEqual(collection.metadata["chunks"], 10)


if __name__ == "__main__":
    unittest.main()
