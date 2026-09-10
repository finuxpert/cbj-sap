"""Scheduled pull from the fixed Rundeck origin, using read-only credentials."""
import fcntl
import json
import os
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import HTTPRedirectHandler, ProxyHandler, Request, build_opener
from backend.rundeck_store import ROOT, collections, identifier, ingest, initialize, now, write_json

BASE = 'http://10.14.55.205:4440'
MAX_BYTES = 100 * 1024 * 1024

class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None

def request(path, token, accept):
    opener = build_opener(ProxyHandler({}), NoRedirect())
    req = Request(BASE + path, headers={'X-Rundeck-Auth-Token': token, 'Accept': accept})
    with opener.open(req, timeout=60) as response:
        if response.status != 200:
            raise ValueError('Rundeck response is not HTTP 200')
        content_type = response.headers.get_content_type()
        if content_type in ('text/html', 'application/xhtml+xml'):
            raise ValueError('Rundeck requires authentication; HTML rejected')
        result = response.read(MAX_BYTES + 1)
        if len(result) > MAX_BYTES:
            raise ValueError('Output exceeds configured size limit')
        return result

def poll():
    initialize()
    with (ROOT / 'poller.lock').open('w') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        try:
            token_file = os.environ.get('RUNDECK_TOKEN_FILE', '')
            job = os.environ.get('RUNDECK_JOB_ID', '').strip()
            expected = [host.strip() for host in os.environ.get('RUNDECK_EXPECTED_HOSTS', '').split(',') if host.strip()]
            if not token_file or not job or len(set(expected)) != 5:
                write_json(ROOT / 'poller.json', {'status': 'NOT_CONFIGURED', 'checked_at': now()})
                return
            token = Path(token_file).read_text().strip()
            if not token:
                raise ValueError('Empty credential file')
            known = {row['execution_id'] for row in collections() if row['status'] in ('READY', 'PARTIAL', 'FAILED')}
            offset = 0
            processed = 0
            while True:
                query = urlencode({'jobIdListFilter': job, 'max': 100, 'offset': offset})
                page = json.loads(request('/api/14/project/Linux/executions?' + query, token, 'application/json'))
                executions = page.get('executions', [])
                for execution in executions:
                    eid = str(execution['id'])
                    identifier(eid)
                    if eid in known or execution.get('status') in ('running', 'scheduled'):
                        continue
                    if execution.get('job', {}).get('id') != job:
                        raise ValueError('Execution job does not match configured collector')
                    raw = request('/project/Linux/execution/downloadOutput/' + eid, token, 'text/plain') if execution.get('status') == 'succeeded' else b''
                    ingest(execution, raw, expected)
                    known.add(eid)
                    processed += 1
                offset += len(executions)
                if not executions or offset >= int(page.get('paging', {}).get('total', offset)):
                    break
            write_json(ROOT / 'poller.json', {'status': 'OK', 'checked_at': now(), 'processed': processed})
        except Exception as error:
            # Never persist credential-bearing requests or server response bodies.
            write_json(ROOT / 'poller.json', {'status': 'ERROR', 'checked_at': now(), 'error_type': type(error).__name__})
            raise RuntimeError('Rundeck ingestion failed; check authentication, connectivity and collection contract') from None

if __name__ == '__main__':
    poll()
