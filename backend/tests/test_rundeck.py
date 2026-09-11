import os
import json
from datetime import datetime, timezone
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch

from backend.rundeck_alert_incidents import build_incidents
from backend.rundeck_credentials import credential_mode, read_credential
from backend.rundeck_host_projection import parse_host_projection
from backend.rundeck_incident import continuous_incident_samples, incident_severity, primary_signal
from backend.rundeck_poller import execution_matches
from backend.rundeck_status import host_resource_state, operational_state, sap_workload_state
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


def incident_sample(minute, wp=0, cpu=10, host='APP1'):
    return {
        'collection_id': f'c-{host}-{minute}',
        'collected_at': datetime(2026, 9, 10, 11, minute, tzinfo=timezone.utc),
        'host': host,
        'cpu_pct': cpu,
        'ram_pct': 50,
        'io_wait_pct': 0,
        'wp_critical': wp,
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
        self.assertEqual(methods_by_path['/history/incidents'], {'GET'})

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

    def test_status_semantics_separate_resource_and_workload(self):
        normal_with_attention = {
            'cpu_pct': 20,
            'ram_pct': 55,
            'io_wait_pct': 0,
            'wp_critical': 2,
        }
        self.assertEqual(host_resource_state(normal_with_attention), 'NORMAL')
        self.assertEqual(sap_workload_state(normal_with_attention), 'ATTENTION')
        self.assertEqual(operational_state(normal_with_attention), 'ATTENTION')

        critical_workload = {**normal_with_attention, 'wp_critical': 3}
        self.assertEqual(host_resource_state(critical_workload), 'NORMAL')
        self.assertEqual(sap_workload_state(critical_workload), 'CRITICAL')
        self.assertEqual(operational_state(critical_workload), 'CRITICAL')

        resource_warning = {**normal_with_attention, 'wp_critical': 0, 'cpu_pct': 80}
        self.assertEqual(host_resource_state(resource_warning), 'WARNING')
        self.assertEqual(sap_workload_state(resource_warning), 'NORMAL')
        self.assertEqual(operational_state(resource_warning), 'WARNING')

    def test_performance_incident_uses_operational_status_semantics(self):
        wp_attention = primary_signal({
            'cpu_pct': 24,
            'ram_pct': 50,
            'io_wait_pct': 0,
            'wp_critical': 2,
        })
        self.assertEqual(wp_attention['code'], 'WP_CRITICAL')
        self.assertEqual(wp_attention['severity'], 'ATTENTION')
        status, confidence, _ = incident_severity(wp_attention, [wp_attention], [
            {'wp_critical': 2}, {'wp_critical': 2}, {'wp_critical': 2},
        ])
        self.assertEqual(status, 'ATTENTION')
        self.assertEqual(confidence, 'HIGH')

        wp_critical = primary_signal({
            'cpu_pct': 24,
            'ram_pct': 50,
            'io_wait_pct': 0,
            'wp_critical': 4,
        })
        self.assertEqual(wp_critical['severity'], 'CRITICAL')
        status, confidence, _ = incident_severity(wp_critical, [wp_critical], [
            {'wp_critical': 4}, {'wp_critical': 4}, {'wp_critical': 4},
        ])
        self.assertEqual(status, 'CRITICAL')
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

    def test_alert_incident_tolerates_one_clear_check_without_flapping(self):
        rows = [
            incident_sample(0, wp=2),
            incident_sample(10, wp=0),
            incident_sample(20, wp=3),
        ]
        incidents = [item for item in build_incidents(rows) if item['code'] == 'WP_CRITICAL']
        self.assertEqual(len(incidents), 1)
        incident = incidents[0]
        self.assertEqual(incident['state'], 'ACTIVE')
        self.assertEqual(incident['checks'], 2)
        self.assertEqual(incident['peak_value'], 3)
        self.assertEqual(incident['latest_value'], 3)
        self.assertEqual(incident['first_seen'].minute, 0)
        self.assertEqual(incident['last_seen'].minute, 20)
        self.assertEqual(incident['current_severity'], 'CRITICAL')
        self.assertEqual(incident['peak_severity'], 'CRITICAL')
        self.assertEqual(incident['severity'], 'CRITICAL')

    def test_alert_incident_two_clear_checks_confirm_resolution(self):
        rows = [
            incident_sample(0, wp=2),
            incident_sample(10, wp=0),
            incident_sample(20, wp=0),
        ]
        incident = next(item for item in build_incidents(rows) if item['code'] == 'WP_CRITICAL')
        self.assertEqual(incident['state'], 'RESOLVED')
        self.assertEqual(incident['checks'], 1)
        self.assertEqual(incident['last_seen'].minute, 0)
        self.assertEqual(incident['resolved_at'].minute, 20)
        self.assertEqual(incident['resolution_reason'], 'HEALTHY_CHECKS')
        self.assertEqual(incident['current_severity'], 'ATTENTION')
        self.assertEqual(incident['peak_severity'], 'ATTENTION')

    def test_alert_incident_gap_separates_observation_episodes(self):
        incidents = [
            item for item in build_incidents([
                incident_sample(0, wp=2),
                incident_sample(30, wp=3),
            ])
            if item['code'] == 'WP_CRITICAL'
        ]
        self.assertEqual(len(incidents), 2)
        old = next(item for item in incidents if item['first_seen'].minute == 0)
        new = next(item for item in incidents if item['first_seen'].minute == 30)
        self.assertEqual(old['state'], 'RESOLVED')
        self.assertIsNone(old['resolved_at'])
        self.assertEqual(old['resolution_reason'], 'OBSERVATION_GAP')
        self.assertEqual(new['state'], 'ACTIVE')
        self.assertNotEqual(old['id'], new['id'])

    def test_alert_incident_exposes_resource_and_workload_severity(self):
        incidents = build_incidents([incident_sample(0, wp=4, cpu=95)])
        cpu = next(item for item in incidents if item['code'] == 'CPU_HIGH')
        wp = next(item for item in incidents if item['code'] == 'WP_CRITICAL')
        self.assertEqual(cpu['current_severity'], 'CRITICAL')
        self.assertEqual(cpu['peak_severity'], 'CRITICAL')
        self.assertEqual(wp['current_severity'], 'CRITICAL')
        self.assertEqual(wp['peak_severity'], 'CRITICAL')

    def test_alert_incident_retains_peak_severity_after_signal_decreases(self):
        incident = next(item for item in build_incidents([
            incident_sample(0, wp=4),
            incident_sample(10, wp=2),
        ]) if item['code'] == 'WP_CRITICAL')
        self.assertEqual(incident['latest_value'], 2)
        self.assertEqual(incident['peak_value'], 4)
        self.assertEqual(incident['current_severity'], 'ATTENTION')
        self.assertEqual(incident['peak_severity'], 'CRITICAL')

    def test_alert_incident_preserves_raw_evidence(self):
        sample = incident_sample(0, wp=2)
        evidence = [{
            'id': 'alert-1',
            'collection_id': sample['collection_id'],
            'execution_id': '521700',
            'collected_at': sample['collected_at'],
            'host': sample['host'],
            'code': 'WP_CRITICAL',
            'severity': 'WARNING',
            'message': 'Critical work process threshold exceeded on APP1',
            'details': {'value': 2, 'warning': 1, 'critical': 3},
        }]
        incident = next(item for item in build_incidents([sample], evidence) if item['code'] == 'WP_CRITICAL')
        self.assertEqual(incident['evidence_count'], 1)
        self.assertEqual(incident['evidence'][0], evidence[0])
        self.assertEqual(incident['evidence'][0]['collected_at'], sample['collected_at'])

    def test_auto_trend_buckets_reduce_longer_ranges(self):
        self.assertEqual(resolve_bucket('6h', 'auto')[0], '10m')
        self.assertEqual(resolve_bucket('24h', 'auto')[0], '30m')
        self.assertEqual(resolve_bucket('7d', 'auto')[0], '1h')
        self.assertEqual(resolve_bucket('30d', 'auto')[0], '6h')
        self.assertEqual(resolve_bucket('90d', 'auto')[0], '1d')


if __name__ == '__main__':
    unittest.main()
