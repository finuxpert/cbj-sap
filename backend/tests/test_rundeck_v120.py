import unittest

from backend.rundeck_evaluation import assess_workload


class RundeckV120EvaluationTests(unittest.TestCase):
    def test_peak_only_cpu_is_spike_not_review_required(self):
        result = assess_workload({
            'occurrences': 12,
            'host_observations': 12,
            'critical_wp_host_checks': 0,
            'avg_cpu_pct': 12,
            'peak_cpu_pct': 125,
            'avg_pss_gb': 0.8,
            'historical_baseline': {'observations': 0},
        }, None, total_checks=100, baseline_eligible=False, period_confidence='HIGH')
        self.assertEqual(result['status'], 'CPU SPIKE')
        self.assertEqual(result['assessment'], 'HIGH RESOURCE')
        self.assertTrue(result['signals']['cpu_spike'])
        self.assertFalse(result['signals']['sustained_high_cpu'])

    def test_sustained_cpu_with_excess_wp_overlap_requires_review(self):
        result = assess_workload({
            'occurrences': 30,
            'host_observations': 30,
            'critical_wp_host_checks': 27,
            'avg_cpu_pct': 85,
            'peak_cpu_pct': 110,
            'avg_pss_gb': 1.2,
            'app_wp_baseline_pct': 30,
            'historical_baseline': {'observations': 0},
        }, None, total_checks=100, baseline_eligible=False, period_confidence='HIGH')
        self.assertEqual(result['status'], 'REVIEW REQUIRED')
        self.assertEqual(result['assessment'], 'NEEDS REVIEW')
        self.assertGreaterEqual(result['wp_excess_association_pct'], 20)

    def test_historical_baseline_can_flag_above_baseline(self):
        result = assess_workload({
            'occurrences': 25,
            'host_observations': 25,
            'critical_wp_host_checks': 0,
            'avg_cpu_pct': 60,
            'peak_cpu_pct': 75,
            'avg_pss_gb': 1.0,
            'historical_baseline': {
                'observations': 80,
                'cpu_p95_pct': 30,
                'pss_p95_gb': 1.2,
            },
        }, None, total_checks=100, baseline_eligible=False, period_confidence='HIGH')
        self.assertEqual(result['baseline_status'], 'READY')
        self.assertEqual(result['anomaly_status'], 'ABOVE BASELINE')
        self.assertTrue(result['signals']['baseline_anomaly'])
        self.assertTrue(result['signals']['sustained_high_cpu'])

    def test_recent_cpu_shift_is_increasing_signal(self):
        result = assess_workload({
            'occurrences': 20,
            'host_observations': 20,
            'critical_wp_host_checks': 0,
            'avg_cpu_pct': 45,
            'peak_cpu_pct': 70,
            'avg_pss_gb': 1.0,
            'historical_baseline': {'observations': 0},
            'shift_previous_avg_cpu_pct': 20,
            'shift_previous_observations': 5,
            'shift_recent_avg_cpu_pct': 50,
            'shift_recent_observations': 5,
        }, None, total_checks=100, baseline_eligible=False, period_confidence='HIGH')
        self.assertEqual(result['status'], 'INCREASING CPU')
        self.assertTrue(result['signals']['performance_shift'])
        self.assertTrue(result['signals']['increasing'])


if __name__ == '__main__':
    unittest.main()
