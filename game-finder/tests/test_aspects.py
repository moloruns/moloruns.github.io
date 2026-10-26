import contextlib
import io
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import numpy as np

from app import display_matches
from aspect_evidence import source_signals
import aspect_ranking
from database import load_shortlist, save_candidate
from intent import query_aspects
from retrieval import assess_matches, lexical_tokens, rank
from test_features import CollectionFixture


def row(id, description, distance, tags=''):
    return ({'app_id': id, 'title': id, 'chunk_index': 0, 'tags': tags}, description, distance)


class AspectTests(unittest.TestCase):
    def test_arbitrary_coordination_and_catalog_discovered_labels(self):
        self.assertEqual([a['text'] for a in query_aspects('something with alchemy and airships')],
                         ['alchemy', 'airships'])
        self.assertEqual([a['text'] for a in query_aspects('a funny horror game', ['Funny', 'Horror'])],
                         ['horror', 'funny'])
        self.assertEqual([a['text'] for a in query_aspects('life and social simulation', ['Life Sim'])],
                         ['life simulation', 'social simulation'])
        self.assertEqual(len(query_aspects('point & click', ['Point & Click'])), 1)
        self.assertEqual(len(query_aspects('alchemy or airships', ['Alchemy', 'Airships'])), 1)
        self.assertEqual(query_aspects('survival without combat')[-1], {'text': 'without combat', 'negative': True})
        long_request = query_aspects('alchemy and airships and mining and sailing without combat')
        self.assertEqual(long_request[-1], {'text': 'without combat', 'negative': True})
        self.assertEqual(lexical_tokens('single player co-operative co-op'), ['singleplayer', 'coop', 'coop'])
        self.assertEqual(lexical_tokens('jump scares mysteries'), lexical_tokens('jump scare mystery'))
        sentence = 'Friends sharing a screen scramble around a spacecraft, taking turns steering and firing cannons.'
        self.assertEqual(query_aspects(sentence), [{'text': sentence.rstrip('.'), 'negative': False}])

    def test_all_aspects_outrank_extreme_single_aspect_similarity(self):
        rows = [row('strong-only-one', 'Alchemy with spectacular magical effects.', .01),
                row('balanced', 'Practice alchemy and pilot airships.', .6)]
        results = rank(CollectionFixture(rows), 'alchemy and airships')
        self.assertEqual(results[0][0]['app_id'], 'balanced')
        self.assertEqual(results[0][0]['_search']['matched_aspects'], 2)
        self.assertEqual(results[1][0]['_search']['matched_aspects'], 1)
        # New source data must participate immediately, including metadata-free additions.
        rows.append(row('added', 'Alchemy and airships in an open world.', .3))
        self.assertEqual(rank(CollectionFixture(rows), 'alchemy and airships')[0][0]['app_id'], 'added')
        self.assertNotIn('_search', rows[0][0])

    def test_partial_literal_match_does_not_override_strong_paraphrase(self):
        rows = [row('literal-half', 'Alchemy and nothing else.', .8),
                row('paraphrase', 'Mix potions aboard a floating vessel.', .15)]
        result = rank(CollectionFixture(rows), 'alchemy and airships')
        self.assertEqual(result[0][0]['app_id'], 'paraphrase')
        self.assertEqual(assess_matches('alchemy and airships', result), 'partial')

    def test_optional_metadata_cannot_reduce_description_similarity(self):
        rows = [row('without-tags', 'Mix potions aboard a floating vessel.', .15),
                row('with-tags', 'Mix potions aboard a floating vessel.', .15, 'Unrelated')]
        with patch.object(aspect_ranking, 'label_vectors', return_value=np.array([[1., 0.]])), \
                patch.object(aspect_ranking, 'encoder', return_value=lambda texts: [[1., 0.] for _ in texts]):
            result = rank(CollectionFixture(rows), 'alchemy and airships')
        scores = [m['_search']['joint_score'] for m, _, _ in result]
        self.assertAlmostEqual(scores[0], scores[1])

    def test_normalized_label_equivalence_without_discarding_modifiers(self):
        rows = [row('equivalent', 'A household.', .8, 'Life Sim'),
                row('different-modifier', 'A household.', .8, 'Afterlife Sim')]
        with patch.object(aspect_ranking, 'label_vectors', return_value=np.array([[1., 0.], [1., 0.]])), \
                patch.object(aspect_ranking, 'encoder', return_value=lambda texts: [[0., 1.] for _ in texts]):
            result = rank(CollectionFixture(rows), 'life simulation')
        scores = {m['app_id']: m['_search']['aspects'][0]['label_similarity'] for m, _, _ in result}
        self.assertEqual(scores['equivalent'], 1.)
        self.assertEqual(scores['different-modifier'], 0.)

    def test_unknown_and_negation_remain_visible_and_persist(self):
        collection = CollectionFixture([row('partial', 'Practice alchemy.', .2)])
        query = 'alchemy and airships'
        results = rank(collection, query)
        self.assertEqual(assess_matches(query, results), 'partial')
        with contextlib.redirect_stdout(io.StringIO()) as output:
            display_matches(query, results)
        self.assertIn('no direct source match', output.getvalue())
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder)/'shortlist.json'
            save_candidate(path, results[0], query, 'discover', 'Preserve my note')
            entry = load_shortlist(path)[0]
            self.assertEqual(entry['note'], 'Preserve my note')
            self.assertEqual(entry['search_evidence']['aspects'], results[0][0]['_search']['aspects'])
        absent = CollectionFixture([row('excluded', 'There is no alchemy system.', .2),
                                    row('present', 'Practice alchemy.', .01),
                                    row('unknown', 'Pilot airships.', .1)])
        results = rank(absent, 'without alchemy')
        self.assertEqual(results[0][0]['app_id'], 'excluded')
        states = {m['app_id']: m['_search']['aspects'][0]['evidence_state'] for m, _, _ in results}
        self.assertEqual(states, {'excluded': 'matched', 'unknown': 'unknown', 'present': 'contradicted'})

    def test_direct_wording_is_contextual_and_not_factual_verification(self):
        self.assertTrue(source_signals('single player', [], ['NO SINGLE PLAYER MODE'])['negations'])
        self.assertTrue(source_signals('without jump scares', ['Jump Scare'], [])['labels'])
        self.assertFalse(source_signals('life simulation', ['Simulation', 'Physics'], [])['labels'])
        result = source_signals('alchemy', ['Alchemy'], ['There is no alchemy.'])
        self.assertTrue(result['labels'] and result['negations'])
        for text in ['Are you here for alchemy?', 'If you want alchemy, choose a different game.',
                     'A hypothetical alchemy system.']:
            self.assertFalse(source_signals('alchemy', [], [text])['mentions'])

    def test_label_cache_recomputes_corruption_and_discovers_new_labels(self):
        def embedding(names):
            return [[1., float(len(n) % 3), .2] for n in names]
        with tempfile.TemporaryDirectory() as folder, patch.object(aspect_ranking, 'CACHE', Path(folder)/'labels.npz'), \
                patch.object(aspect_ranking, '_labels', {}), patch.object(aspect_ranking, '_loaded', False), \
                patch.object(aspect_ranking, 'encoder', return_value=embedding):
            aspect_ranking.CACHE.write_bytes(b'bad cache')
            first = aspect_ranking.label_vectors(['Alchemy'])
            second = aspect_ranking.label_vectors(['Alchemy', 'Airships'])
            np.testing.assert_allclose(first[0], second[0])
            self.assertEqual(second.shape, (2, 3))
            # Simulated restart reads the cache and still admits new labels.
            aspect_ranking._labels.clear()
            aspect_ranking._loaded = False
            self.assertEqual(aspect_ranking.label_vectors(['Airships', 'Archaeology']).shape, (2, 3))


if __name__ == '__main__':
    unittest.main()
