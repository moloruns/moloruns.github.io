import unittest

from features import feature_evidence, requested_features
from retrieval import assess_matches, rank


def evidence(query, text, tags=''):
    return {e['feature']: e for e in feature_evidence({'tags': tags}, [text], requested_features(query))}


class FeatureTests(unittest.TestCase):
    def test_requested_absence_and_clause_scope(self):
        items = {r['feature']: r['wanted'] for r in requested_features('romance without missions')}
        self.assertEqual(items, {'romance': True, 'objectives': False})
        items = {r['feature']: r['wanted'] for r in requested_features('leisurely tricks, free of objectives')}
        self.assertEqual(items, {'relaxing': True, 'objectives': False})
        items = {r['feature']: r['wanted'] for r in requested_features('no romance but a tragic ending')}
        self.assertEqual(items, {'romance': False, 'tragic_ending': True})

    def test_missing_or_incidental_evidence_is_unknown(self):
        result = evidence('romance with a tragic ending', 'The story has ended. There was nothing to grieve about.')
        self.assertEqual([e['state'] for e in result.values()], ['unknown', 'unknown'])
        self.assertEqual(evidence('without romance', 'An adventure.')['romance']['state'], 'unknown')
        for text in ['A library of romance novels.', 'Are you here for a tragic ending?',
                     'A hypothetical tragic ending.', 'A satire of romantic relationships.']:
            result = evidence('romance with a tragic ending', text)
            self.assertTrue(all(e['state'] == 'unknown' for e in result.values()), text)

    def test_explicit_presence_absence_and_conflicts(self):
        result = evidence('romance with a tragic ending', 'Features romance routes with a tragic ending.')
        self.assertTrue(all(e['state'] == 'supported' for e in result.values()))
        result = evidence('without romance', 'This game has no romance.')
        self.assertEqual(result['romance']['state'], 'supported')
        self.assertEqual(evidence('romance', 'Romance is not included.')['romance']['state'], 'contradicted')
        result = evidence('romance', 'There is no romance.', 'Romance')
        self.assertEqual(result['romance']['state'], 'unknown')
        self.assertIn('Conflicting', result['romance']['reason'])
        self.assertTrue(any('no romance' in e['text'] for e in result['romance']['evidence']))
        result = evidence('without romance', 'Explore the city when not actively dating.', 'Dating Sim')
        self.assertEqual(result['romance']['state'], 'contradicted')
        result = evidence('without romance', 'If you want no romance, take a different route.')
        self.assertEqual(result['romance']['state'], 'unknown')

    def test_full_context_supports_distinct_clauses(self):
        result = feature_evidence({'tags': 'Life Sim'},
                                  ['Build and decorate a home.', 'Develop relationships with your neighbors.'],
                                  requested_features('life and social simulation'))
        self.assertTrue(all(e['state'] == 'supported' for e in result))
        result = evidence('life and social simulation', 'Simulates heat transfer and rigid body dynamics.', 'Physics,Simulation')
        self.assertTrue(all(e['state'] == 'unknown' for e in result.values()))
        self.assertEqual(evidence('physics simulation', 'Simulates heat transfer and rigid body dynamics.')['physics']['state'], 'supported')


class CollectionFixture:
    def __init__(self, rows):
        self.rows = rows

    def count(self):
        return len(self.rows)

    def get(self, include):
        return {'ids': [f'{m["app_id"]}:{m["chunk_index"]}' for m, _, _ in self.rows],
                'documents': [p for _, p, _ in self.rows], 'metadatas': [m for m, _, _ in self.rows]}

    def query(self, query_texts, n_results, include):
        rows = self.rows[:n_results]
        return {'metadatas': [[m for m, _, _ in rows]], 'documents': [[p for _, p, _ in rows]],
                'distances': [[d for _, _, d in rows]]}


class PreviousRulesRetrievalTests(unittest.TestCase):
    def test_lexical_candidates_beyond_dense_pool_and_live_additions(self):
        rows = [({'app_id': str(i), 'title': f'Physics fixture {i}', 'chunk_index': 0, 'tags': 'Simulation,Physics'},
                 'A simulation of physical objects.', .2 + i / 1000) for i in range(55)]
        collection = CollectionFixture(rows)
        query = 'life and social simulation'
        self.assertEqual(assess_matches(query, rank(collection, query, method="rules")), 'partial')
        # Simulate a runtime addition; no index invalidation API should be needed.
        rows.append(({'app_id': 'user:family', 'title': 'Household fixture', 'chunk_index': 0},
                     'A life simulation. Develop relationships and friendships.', .85))
        results = rank(collection, query, method="rules")
        self.assertEqual(results[0][0]['app_id'], 'user:family')
        self.assertEqual(assess_matches(query, results), 'candidates')
        self.assertIsNone(results[0][0]['_search']['dense_rank'])
        self.assertFalse(results[0][0]['_search']['weak'])
        self.assertEqual(rows[-1][0].keys(), {'app_id', 'title', 'chunk_index'})

    def test_one_clause_is_partial_and_scores_do_not_establish_plot(self):
        rows = [({'app_id': 'one', 'title': 'Romance fixture', 'tags': 'Romance', 'chunk_index': 0},
                 'Several romance routes with multiple endings.', .2),
                ({'app_id': 'two', 'title': 'Endings fixture', 'chunk_index': 0}, 'The story ended.', .21)]
        query = 'romance with a tragic ending'
        result = rank(CollectionFixture(rows), query, method="rules")
        self.assertEqual(assess_matches(query, result), 'partial')
        self.assertTrue(all(e['state'] != 'supported' for m, _, _ in result
                            for e in m['_search']['requirements'] if e['feature'] == 'tragic_ending'))

    def test_unrelated_requests_stay_weak_and_vector_mode_stays_available(self):
        collection = CollectionFixture([({'app_id': 'one', 'title': 'Boat', 'chunk_index': 0}, 'Sail a boat.', .9)])
        self.assertEqual(assess_matches('repair my kitchen faucet', rank(collection, 'repair my kitchen faucet', method='rules')), 'weak')
        result = rank(collection, 'boat', method='vector')
        self.assertNotIn('_search', result[0][0])
        with self.assertRaises(ValueError):
            rank(collection, 'boat', method='unknown')

    def test_zero_overlap_vector_leader_keeps_a_recall_slot(self):
        rows = [({'app_id': 'leader', 'title': 'Paraphrase fixture', 'chunk_index': 0},
                 'A vessel controlled together by a local team.', .2)]
        rows += [({'app_id': str(i), 'title': 'Screen fixture', 'chunk_index': 0},
                  'Friends share a screen with cannons.', .25 + i/1000) for i in range(12)]
        collection = CollectionFixture(rows)
        query = 'friends sharing a screen firing cannons'
        fused = rank(collection, query, method='fused')
        enhanced = rank(collection, query, method="rules")
        self.assertNotIn('leader', [m['app_id'] for m, _, _ in fused])
        self.assertIn('leader', [m['app_id'] for m, _, _ in enhanced])


if __name__ == '__main__':
    unittest.main()
