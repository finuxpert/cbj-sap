import unittest

from backend.rundeck_trends import resolve_bucket, resolve_range


class RundeckV1201TrendTests(unittest.TestCase):
    def test_short_ranges_use_collection_resolution(self):
        self.assertEqual(resolve_range('30m')['hours'], 0.5)
        self.assertEqual(resolve_range('1h')['hours'], 1)
        self.assertEqual(resolve_range('3h')['hours'], 3)
        self.assertEqual(resolve_bucket('30m', 'auto')[0], 'raw')
        self.assertEqual(resolve_bucket('1h', 'auto')[0], 'raw')
        self.assertEqual(resolve_bucket('3h', 'auto')[0], 'raw')

    def test_existing_longer_ranges_keep_bounded_buckets(self):
        self.assertEqual(resolve_bucket('6h', 'auto')[0], '10m')
        self.assertEqual(resolve_bucket('24h', 'auto')[0], '30m')
        self.assertEqual(resolve_bucket('7d', 'auto')[0], '1h')
        self.assertEqual(resolve_bucket('30d', 'auto')[0], '6h')


if __name__ == '__main__':
    unittest.main()
