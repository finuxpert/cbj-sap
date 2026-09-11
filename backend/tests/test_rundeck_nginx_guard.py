import importlib.util
import unittest
from pathlib import Path


SCRIPT = Path(__file__).resolve().parents[2] / 'ops' / 'rundeck' / 'update-nginx-block.py'
SPEC = importlib.util.spec_from_file_location('sphere_nginx_block', SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(MODULE)


class NginxManagedBlockTests(unittest.TestCase):
    def test_legacy_dev_migration_preserves_prod_block_before_dev(self):
        site = (
            'server {\n'
            '    # SPHERE production Rundeck API routing\n'
            '    location /api/collections/ { proxy_pass http://127.0.0.1:8092/collections/; }\n'
            '    # SPHERE isolated Rundeck development\n'
            '    location /dev/api/ { proxy_pass http://127.0.0.1:8091/; }\n'
            '    location = /sap-api { return 308 /sap-api/; }\n'
            '}\n'
        )
        updated = MODULE.replace_block(
            site,
            name='DEV',
            snippet='    location /dev/api/ { proxy_pass http://127.0.0.1:8091/; }',
            anchor='    location = /sap-api',
            legacy_marker='    # SPHERE isolated Rundeck development',
            protected_markers=('    # SPHERE production Rundeck API routing', '    # BEGIN SPHERE PROD ROUTING'),
        )
        self.assertIn('# SPHERE production Rundeck API routing', updated)
        self.assertIn('# BEGIN SPHERE DEV ROUTING', updated)
        self.assertIn('# END SPHERE DEV ROUTING', updated)
        self.assertEqual(updated.count('proxy_pass http://127.0.0.1:8092/collections/'), 1)

    def test_legacy_dev_migration_refuses_to_consume_prod_marker(self):
        site = (
            'server {\n'
            '    # SPHERE isolated Rundeck development\n'
            '    location /dev/api/ { proxy_pass http://127.0.0.1:8091/; }\n'
            '    # SPHERE production Rundeck API routing\n'
            '    location /api/collections/ { proxy_pass http://127.0.0.1:8092/collections/; }\n'
            '    location = /sap-api { return 308 /sap-api/; }\n'
            '}\n'
        )
        with self.assertRaises(ValueError):
            MODULE.replace_block(
                site,
                name='DEV',
                snippet='    location /dev/api/ { proxy_pass http://127.0.0.1:8091/; }',
                anchor='    location = /sap-api',
                legacy_marker='    # SPHERE isolated Rundeck development',
                protected_markers=('    # SPHERE production Rundeck API routing', '    # BEGIN SPHERE PROD ROUTING'),
            )

    def test_existing_dev_managed_block_updates_without_touching_prod(self):
        site = (
            'server {\n'
            '    # BEGIN SPHERE PROD ROUTING\n'
            '    location /api/history/ { proxy_pass http://127.0.0.1:8092/history/; }\n'
            '    # END SPHERE PROD ROUTING\n'
            '    # BEGIN SPHERE DEV ROUTING\n'
            '    location /dev/api/ { proxy_pass http://127.0.0.1:8091/old/; }\n'
            '    # END SPHERE DEV ROUTING\n'
            '    location = /sap-api { return 308 /sap-api/; }\n'
            '}\n'
        )
        updated = MODULE.replace_block(
            site,
            name='DEV',
            snippet='    location /dev/api/ { proxy_pass http://127.0.0.1:8091/; }',
            anchor='    location = /sap-api',
            protected_markers=('    # BEGIN SPHERE PROD ROUTING',),
        )
        self.assertIn('proxy_pass http://127.0.0.1:8092/history/', updated)
        self.assertIn('proxy_pass http://127.0.0.1:8091/;', updated)
        self.assertNotIn('8091/old/', updated)
        self.assertEqual(updated.count('# BEGIN SPHERE DEV ROUTING'), 1)
        self.assertEqual(updated.count('# END SPHERE DEV ROUTING'), 1)


if __name__ == '__main__':
    unittest.main()
