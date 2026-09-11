import os
import unittest
from pathlib import Path
from unittest.mock import patch

from backend.rundeck_platform import _runtime_release_paths


class RundeckPlatformRuntimePathTests(unittest.TestCase):
    def test_prod_runtime_uses_prod_release_roots(self):
        empty = {
            'SPHERE_BACKEND_RELEASES_ROOT': '',
            'SPHERE_BACKEND_CURRENT': '',
            'SPHERE_WEB_RELEASES_ROOT': '',
            'SPHERE_WEB_CURRENT': '',
        }
        with patch.dict(os.environ, empty, clear=False):
            with patch('backend.rundeck_platform.Path.cwd', return_value=Path('/opt/sphere-rundeck-prod/current')):
                paths = _runtime_release_paths()

        self.assertEqual(paths[0], Path('/opt/sphere-rundeck-prod/releases'))
        self.assertEqual(paths[1], Path('/opt/sphere-rundeck-prod/current'))
        self.assertEqual(paths[2], Path('/var/www/sphere.astraotoparts.co.id/releases'))
        self.assertEqual(paths[3], Path('/var/www/sphere.astraotoparts.co.id/current'))

    def test_explicit_release_roots_override_runtime_detection(self):
        values = {
            'SPHERE_BACKEND_RELEASES_ROOT': '/srv/sphere/backend/releases',
            'SPHERE_BACKEND_CURRENT': '/srv/sphere/backend/current',
            'SPHERE_WEB_RELEASES_ROOT': '/srv/sphere/web/releases',
            'SPHERE_WEB_CURRENT': '/srv/sphere/web/current',
        }
        with patch.dict(os.environ, values, clear=False):
            paths = _runtime_release_paths()

        self.assertEqual(paths, tuple(Path(value) for value in values.values()))


if __name__ == '__main__':
    unittest.main()
