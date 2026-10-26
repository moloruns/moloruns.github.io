import unittest

from retrieval import assess_matches, keyword_rank, terms, vector_rank


def meta(app, chunk=0, title=None):
    return {"app_id": app, "chunk_index": chunk, "title": title or app}


class StoredResults:
    """A collection that returns an ordered prefix, like chunk retrieval."""
    def __init__(self, rows):
        self.rows = rows
        self.requests = []

    def count(self):
        return len(self.rows)

    def query(self, query_texts, n_results, include):
        self.requests.append(n_results)
        rows = self.rows[:n_results]
        return {"metadatas": [[m for m, _, _ in rows]],
                "documents": [[p for _, p, _ in rows]],
                "distances": [[d for _, _, d in rows]]}


class RetrievalTests(unittest.TestCase):
    def test_keyword_search_does_not_search_metadata_or_repeat_counts(self):
        records = [("1", "garden garden plants", meta("a", title="Space battle")),
                   ("2", "space battle", meta("b")),
                   ("3", "space", meta("c", 0)), ("4", "battle", meta("c", 1))]
        result = keyword_rank(records, "space battle")
        self.assertEqual([(m["app_id"], score) for m, _, score, _ in result],
                         [("b", 2), ("c", 1), ("a", 0)])
        self.assertEqual(terms("The garden, garden!"), {"garden"})
        self.assertIn("not", terms("not competitive"))

    def test_zero_score_ties_are_deterministic(self):
        records = [("b", "red", meta("b")), ("a", "blue", meta("a"))]
        self.assertEqual([m["app_id"] for m, _, _, _ in keyword_rank(records, "green")], ["a", "b"])

    def test_vectors_expand_to_find_distinct_games(self):
        rows = [(meta("a", i), f"passage {i}", i / 100) for i in range(26)]
        rows += [(meta(app), app, distance) for app, distance in
                 [("b", .3), ("c", .4), ("d", .5), ("e", .6)]]
        collection = StoredResults(rows)
        result = vector_rank(collection, "description")
        self.assertEqual([m["app_id"] for m, _, _ in result], list("abcde"))
        self.assertEqual(result[0][1], "passage 0")
        self.assertEqual(collection.requests, [25, 30])

    def test_empty_and_small_collections(self):
        self.assertEqual(vector_rank(StoredResults([]), "description"), [])
        rows = [(meta("a"), "first", .2), (meta("b"), "second", .3)]
        self.assertEqual(vector_rank(StoredResults(rows), "description"), rows)

    def test_weak_empty_and_ambiguous_results_are_not_confident_matches(self):
        self.assertEqual(assess_matches("a game", []), "empty")
        self.assertEqual(assess_matches("fix my leaking faucet", [(meta("a"), "text", .81)]), "weak")
        self.assertEqual(assess_matches("something fun", [(meta("a"), "text", .54)]), "ambiguous")
        self.assertEqual(assess_matches("skateboarding without competitive scoring", [(meta("a"), "text", .45)]), "candidates")


if __name__ == "__main__":
    unittest.main()
