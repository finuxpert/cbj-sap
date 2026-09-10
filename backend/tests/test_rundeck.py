import os
import json
from datetime import datetime, timezone
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch

from backend.rundeck_credentials import credential_mode, read_credential
from backend.rundeck_host_projection import parse_host_projection
from backend.rundeck_incident import continuous_incident_samples, incident_severity, primary_signal
from backend.rundeck_poller import execution_matches
from backend.rundeck_store import ingest, collections, validate, identifier
from backend.rundeck_trends import resolve_bucket

HOSTS = ['fixture-a', 'fixture-b', 'fixture-c', 'fixture-d', 'fixture-e']


def output(hosts):
    return '\n'.join(
        f'## WP-SCOUT @ {h} SID=TST INSTS=00 TS=2026-09-10 01:00:00\n'
        f'## RCA-SNAPSHOT-V2.2-BEGIN\n'
        f'hostname\t{h}\n'
        f'snapshot_id\t{h}-1\n'
        f'snapshot_ts\t2026-09-10T01:00:00Z\n'
        f'host_cpu_pct\t10\n'
        f'## RCA-SNAPSHOT-V2.2-END'
        for h in hosts
    ).encode()


def v22_segmented_output():
    critical = [3, 2, 0, 0, 2]
    parts = []
    for index, host in enumerate(HOSTS):
        parts.append(
            f'snapshot @ {host} 2026-09-10 17:{index:02d}:00\n'
            f'## WP-SCOUT @ {host} SID=TST INSTS=00 TS=2026-09-10 17:{index:02d}:00\n'
            f'## RCA-SNAPSHOT-V2.2-BEGIN\n'
            f'hostname\t{host}\n'
            f'snapshot_id\t{host}-1\n'
            f'snapshot_ts\t2026-09-10T10:{index:02d}:00Z\n'
            f'host_cpu_pct\t{10 + index}\n'
            f'memory_used_pct\t{50 + index}\n'
            f'host_iowait_pct\t{index}\n'
            f'swap_in_ps\t{index}\n'
            f'swap_out_ps\t{index + 1}\n'
            f'## RCA-SNAPSHOT-V2.2-END\n'
            f'CPU WP Critical : {critical[index]}\n'
            f'CPU WP Warn : 0\n'
        )
    return ''.join(parts).encode()


def execution(eid=1, status='succeeded'):
    return {
        'id': eid,
        'status': status,
        'date-started': {'date': '2026-09-10T01:00:00Z'},
        'date-ended': {'date': '2026-09-10T01:01:00Z'},
    }


class IngestionTests(unittest.TestCase):
    def test_ready_partial_failed_and_dedup(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            ready = ingest(execution(), output(HOSTS), HOSTS, root)
            self.assertEqual(ready['status'], 'READY')
            self.assertEqual(ingest(execution(), b'changed', HOSTS, root), ready)
            self.assertEqual(ingest(execution(2), output(HOSTS[:4]), HOSTS, root)['status'], 'PARTIAL')
            self.assertEqual(ingest(execution(3, 'failed'), output(HOSTS), HOSTS, root)['status'], 'FAILED')
            self.assertEqual(next(row for row in collections(root) if row['status'] == 'READY')['execution_id'], '1')
            self.assertEqual(len(list((root / 'manifests').glob('*.json'))), 3)
            self.assertTrue((root / ready['raw_path']).exists())

    def test_invalid_data(self):
        for raw in [
            b'<html>login</html>',
            b'',
            b'\xff',
            output(['intruder']),
            output(HOSTS) + b'\n## RCA-WP-V2.2-BEGIN',
        ]:
            with self.assertRaises((ValueError, UnicodeError)):
                validate(raw, HOSTS)

    def test_traversal(self):
        for value in ['../secret', '0', 'x', '1/2']:
            with self.assertRaises(ValueError):
                identifier(value)

    def test_processing_resumes(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            self.assertEqual(ingest(execution(status='running'), b'', HOSTS, root)['status'], 'PROCESSING')
            self.assertEqual(ingest(execution(), output(HOSTS), HOSTS, root)['status'], 'READY')

    def test_only_whitelisted_collect_now_is_mutating(self):
        from backend.rundeck_api import app

        mutating = {
            (route.path, method)
            for route in app.routes
            for method in route.methods
            if method in {'POST', 'PUT', 'PATCH', 'DELETE'}
        }
        self.assertEqual(mutating, {('/collect-now', 'POST')})

    def test_job_history_routes_are_read_only(self):
        from backend.rundeck_api import app

        methods_by_path = {
            route.path: set(route.methods)
            for route in app.routes
            if getattr(route, 'methods', None)
        }
        self.assertEqual(methods_by_path['/history/job'], {'GET'})
        self.assertEqual(methods_by_path['/history/jobs/current'], {'GET'})

    def test_job_identity_does_not_depend_on_uuid(self):
        group = 'SAP/AOP'
        name = '[Critical]-[Daily Check] SPHERE SAP Work Proccess Check'
        old = {'job': {'id': 'old-uuid', 'group': group, 'name': name + ' '}}
        new = {'job': {'id': 'new-uuid', 'group': group, 'name': name}}
        wrong = {'job': {'id': 'other', 'group': 'SAP/OTHER', 'name': name}}
        self.assertTrue(execution_matches(old, group, name))
        self.assertTrue(execution_matches(new, group, name))
        self.assertFalse(execution_matches(wrong, group, name))

    def test_v22_projection_keeps_wp_critical_with_its_snapshot_host(self):
        rows = parse_host_projection(v22_segmented_output())
        self.assertEqual([row['host'] for row in rows], [host.upper() for host in HOSTS])
        self.assertEqual([row['wp_critical'] for row in rows], [3, 2, 0, 0, 2])
        self.assertEqual([row['swap_activity'] for row in rows], [1.0, 3.0, 5.0, 7.0, 9.0])
        self.assertEqual([row['iowait'] for row in rows], [0.0, 1.0, 2.0, 3.0, 4.0])

    def test_systemd_credential_precedes_legacy_file(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            credentials = root / 'credentials'
            credentials.mkdir()
            systemd_token = credentials / 'rundeck-reader'
            legacy_token = root / 'legacy.token'
            systemd_token.write_text('systemd-fixture-token')
            legacy_token.write_text('legacy-fixture-token')
            with patch.dict(os.environ, {
                'CREDENTIALS_DIRECTORY': str(credentials),
                'RUNDECK_TOKEN_FILE': str(legacy_token),
            }, clear=False):
                self.assertEqual(credential_mode('rundeck-reader', 'RUNDECK_TOKEN_FILE'), 'systemd')
                self.assertEqual(read_credential('rundeck-reader', 'RUNDECK_TOKEN_FILE'), 'systemd-fixture-token')

    def test_legacy_credential_remains_rollout_fallback(self):
        with TemporaryDirectory() as directory:
            token = Path(directory) / 'legacy.token'
            token.write_text('legacy-fixture-token')
            with patch.dict(os.environ, {
                'CREDENTIALS_DIRECTORY': '',
                'RUNDECK_TOKEN_FILE': str(token),
            }, clear=False):
                self.assertEqual(credential_mode('rundeck-reader', 'RUNDECK_TOKEN_FILE'), 'file')
                self.assertEqual(read_credential('rundeck-reader', 'RUNDECK_TOKEN_FILE'), 'legacy-fixture-token')

    def test_performance_incident_separates_signal_and_incident_severity(self):
        wp_signal = primary_signal({
            'cpu_pct': 24,
            'ram_pct': 50,
            'io_wait_pct': 0,
            'wp_critical': 4,
        })
        self.assertEqual(wp_signal['code'], 'WP_CRITICAL')
        self.assertEqual(wp_signal['severity'], 'CRITICAL')
        status, confidence, _ = incident_severity(wp_signal, [wp_signal], [
            {'wp_critical': 4}, {'wp_critical': 4}, {'wp_critical': 4},
        ])
        self.assertEqual(status, 'WARNING')
        self.assertEqual(confidence, 'HIGH')

        cpu_signal = primary_signal({
            'cpu_pct': 95,
            'ram_pct': 50,
            'io_wait_pct': 0,
            'wp_critical': 1,
        })
        current_signals = [cpu_signal]
        status, confidence, _ = incident_severity(cpu_signal, current_signals, [{'cpu_pct': 95}])
        self.assertEqual(cpu_signal['code'], 'CPU_HIGH')
        self.assertEqual(status, 'CRITICAL')
        self.assertEqual(confidence, 'HIGH')

    def test_performance_incident_detected_since_is_continuous(self):
        def sample(minute, wp):
            return {
                'collection_id': f'c-{minute}',
                'collected_at': datetime(2026, 9, 10, 11, minute, tzinfo=timezone.utc),
                'wp_critical': wp,
            }

        rows = [sample(8, 0), sample(18, 3), sample(28, 2), sample(38, 1)]
        incident = continuous_incident_samples(rows, 'WP_CRITICAL')
        self.assertEqual([row['collection_id'] for row in incident], ['c-18', 'c-28', 'c-38'])

        rows_with_gap = [sample(8, 3), sample(38, 3)]
        incident = continuous_incident_samples(rows_with_gap, 'WP_CRITICAL')
        self.assertEqual([row['collection_id'] for row in incident], ['c-38'])

    def test_auto_trend_buckets_reduce_longer_ranges(self):
        self.assertEqual(resolve_bucket('6h', 'auto')[0], '10m')
        self.assertEqual(resolve_bucket('24h', 'auto')[0], '30m')
        self.assertEqual(resolve_bucket('7d', 'auto')[0], '1h')
        self.assertEqual(resolve_bucket('30d', 'auto')[0], '6h')
        self.assertEqual(resolve_bucket('90d', 'auto')[0], '1d')


if __name__ == '__main__':
    unittest.main()
