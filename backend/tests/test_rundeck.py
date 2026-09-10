import json
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from backend.rundeck_store import ingest, collections, validate, identifier

HOSTS = ['fixture-a', 'fixture-b', 'fixture-c', 'fixture-d', 'fixture-e']
def output(hosts):
    return '\n'.join(f'## WP-SCOUT @ {h} SID=TST INSTS=00 TS=2026-09-10 01:00:00\n## RCA-SNAPSHOT-V2.2-BEGIN\nhostname\t{h}\nsnapshot_id\t{h}-1\nsnapshot_ts\t2026-09-10T01:00:00Z\nhost_cpu_pct\t10\n## RCA-SNAPSHOT-V2.2-END' for h in hosts).encode()
def execution(eid=1, status='succeeded'):
    return {'id': eid, 'status': status, 'date-started': {'date': '2026-09-10T01:00:00Z'}, 'date-ended': {'date': '2026-09-10T01:01:00Z'}}

class IngestionTests(unittest.TestCase):
    def test_ready_partial_failed_and_dedup(self):
        with TemporaryDirectory() as directory:
            root=Path(directory)
            ready=ingest(execution(), output(HOSTS), HOSTS, root)
            self.assertEqual(ready['status'], 'READY')
            self.assertEqual(ingest(execution(), b'changed', HOSTS, root), ready)
            self.assertEqual(ingest(execution(2), output(HOSTS[:4]), HOSTS, root)['status'], 'PARTIAL')
            self.assertEqual(ingest(execution(3, 'failed'), output(HOSTS), HOSTS, root)['status'], 'FAILED')
            self.assertEqual(next(row for row in collections(root) if row['status']=='READY')['execution_id'], '1')
            self.assertEqual(len(list((root/'manifests').glob('*.json'))), 3)
            self.assertTrue((root/ready['raw_path']).exists())
    def test_invalid_data(self):
        for raw in [b'<html>login</html>', b'', b'\xff', output(['intruder']), output(HOSTS)+b'\n## RCA-WP-V2.2-BEGIN']:
            with self.assertRaises((ValueError, UnicodeError)): validate(raw, HOSTS)
    def test_traversal(self):
        for value in ['../secret', '0', 'x', '1/2']:
            with self.assertRaises(ValueError): identifier(value)
    def test_processing_resumes(self):
        with TemporaryDirectory() as directory:
            root=Path(directory)
            self.assertEqual(ingest(execution(status='running'), b'', HOSTS, root)['status'], 'PROCESSING')
            self.assertEqual(ingest(execution(), output(HOSTS), HOSTS, root)['status'], 'READY')
    def test_no_mutating_routes(self):
        from backend.rundeck_api import app
        self.assertFalse(any(route.methods & {'POST','PUT','PATCH','DELETE'} for route in app.routes))

if __name__ == '__main__': unittest.main()
