import unittest

from backend.rundeck_evaluation import assess_workload


class EvaluationCalibrationTests(unittest.TestCase):
    def test_observation_confidence_is_distinct_from_period_coverage(self):
        result = assess_workload({
            'occurrences': 25,
            'host_observations': 25,
            'critical_wp_host_checks': 23,
            'app_wp_baseline_pct': 90,
            'avg_cpu_pct': 114.2,
            'peak_cpu_pct': 130,
            'avg_pss_gb': 1.2,
        }, None, total_checks=138, baseline_eligible=False, period_confidence='LOW')

        self.assertEqual(result['observation_confidence'], 'HIGH')
        self.assertEqual(result['period_confidence'], 'LOW')
        self.assertEqual(result['overall_confidence'], 'LOW')
        self.assertEqual(result['trend_baseline_status'], 'NOT_READY')
        self.assertIsNone(result['avg_cpu_change_pct'])
        self.assertEqual(result['assessment'], 'HIGH RESOURCE')

    def test_wp_overlap_is_normalized_against_app_baseline(self):
        common_app_signal = assess_workload({
            'occurrences': 25,
            'host_observations': 25,
            'critical_wp_host_checks': 25,
            'app_wp_baseline_pct': 95,
            'avg_cpu_pct': 90,
            'peak_cpu_pct': 120,
            'avg_pss_gb': 1.0,
        }, None, total_checks=100, baseline_eligible=False, period_confidence='HIGH')
        self.assertEqual(common_app_signal['wp_signal_overlap_pct'], 100.0)
        self.assertEqual(common_app_signal['wp_excess_association_pct'], 5.0)
        self.assertFalse(common_app_signal['signals']['wp_excess_association'])
        self.assertEqual(common_app_signal['assessment'], 'HIGH RESOURCE')

        selective_signal = assess_workload({
            'occurrences': 25,
            'host_observations': 25,
            'critical_wp_host_checks': 20,
            'app_wp_baseline_pct': 20,
            'avg_cpu_pct': 90,
            'peak_cpu_pct': 120,
            'avg_pss_gb': 1.0,
        }, None, total_checks=100, baseline_eligible=False, period_confidence='HIGH')
        self.assertEqual(selective_signal['wp_signal_overlap_pct'], 80.0)
        self.assertEqual(selective_signal['wp_excess_association_pct'], 60.0)
        self.assertTrue(selective_signal['signals']['wp_excess_association'])
        self.assertEqual(selective_signal['assessment'], 'NEEDS REVIEW')

    def test_trend_confidence_only_becomes_ready_with_eligible_baseline(self):
        result = assess_workload({
            'occurrences': 8,
            'host_observations': 8,
            'critical_wp_host_checks': 0,
            'app_wp_baseline_pct': 10,
            'avg_cpu_pct': 80,
            'peak_cpu_pct': 100,
            'avg_pss_gb': 1.0,
        }, {'avg_cpu_pct': 50}, total_checks=20, baseline_eligible=True,
            period_confidence='HIGH', previous_period_confidence='MEDIUM')
        self.assertEqual(result['trend_baseline_status'], 'READY')
        self.assertEqual(result['trend_confidence'], 'MEDIUM')
        self.assertEqual(result['avg_cpu_change_pct'], 60.0)
        self.assertTrue(result['signals']['increasing'])


if __name__ == '__main__':
    unittest.main()
