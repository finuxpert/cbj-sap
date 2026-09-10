"""Local collection manifests; no SAP access and no analytics parsing."""
import hashlib
import json
import os
import re
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(os.environ.get('SPHERE_INGESTION_ROOT', '/var/lib/sphere/ingestion'))

def now():
    return datetime.now(timezone.utc).isoformat()

def initialize(root=ROOT):
    for folder in ('inbox', 'processing', 'archive', 'rejected', 'manifests'):
        (root / folder).mkdir(parents=True, exist_ok=True, mode=0o750)

def write_json(path, value):
    temporary = path.with_suffix('.tmp')
    with temporary.open('w') as stream:
        json.dump(value, stream, indent=2)
        stream.flush()
        os.fsync(stream.fileno())
    temporary.replace(path)

def identifier(execution_id):
    value = str(execution_id)
    if not re.fullmatch(r'[1-9][0-9]*', value):
        raise ValueError('Invalid execution ID')
    return 'rundeck-' + value

def collections(root=ROOT):
    rows = []
    for path in (root / 'manifests').glob('rundeck-*.json'):
        rows.append(json.loads(path.read_text()))
    return sorted(rows, key=lambda row: (row.get('finished_at') or '', int(row['execution_id'])), reverse=True)

def validate(raw, expected):
    text = raw.decode('utf-8-sig', errors='strict')
    if not text.strip() or '\x00' in text or re.search(r'<(?:!doctype|html|form)\b', text, re.I):
        raise ValueError('Output is empty, binary or HTML')
    # Validate envelope only. All metric parsing remains in the existing JS parser.
    hosts = set(re.findall(r'^##\s*WP-SCOUT\s*@\s*(\S+)\s+SID=\S+\s+INSTS=\S+\s+TS=.+$', text, re.M))
    if not hosts:
        raise ValueError('Unsupported collection envelope; WP-SCOUT headers missing')
    for marker in ('RCA-SNAPSHOT-V2.2', 'RCA-WP-V2.2'):
        if text.count('## ' + marker + '-BEGIN') != text.count('## ' + marker + '-END'):
            raise ValueError('Truncated collection block')
    blocks = re.findall(r'^## RCA-SNAPSHOT-V2\.2-BEGIN\s*\n(.*?)^## RCA-SNAPSHOT-V2\.2-END\s*$', text, re.M | re.S)
    block_hosts = set()
    for block in blocks:
        fields = dict(line.split('\t', 1) for line in block.splitlines() if '\t' in line)
        if not all(fields.get(key) for key in ('hostname', 'snapshot_id', 'snapshot_ts', 'host_cpu_pct')):
            raise ValueError('Incomplete snapshot envelope')
        block_hosts.add(fields['hostname'])
    if block_hosts != hosts:
        raise ValueError('Complete V2.2 snapshots required for every host; confirm actual Rundeck format')
    if hosts - set(expected):
        raise ValueError('Unexpected collection hosts')
    return sorted(hosts)

def ingest(execution, raw, expected, root=ROOT):
    initialize(root)
    cid = identifier(execution['id'])
    manifest = root / 'manifests' / (cid + '.json')
    if manifest.exists():
        previous = json.loads(manifest.read_text())
        if previous['status'] in ('READY', 'PARTIAL', 'FAILED'):
            return previous
    row = dict(collection_id=cid, execution_id=str(execution['id']), status='PROCESSING',
               started_at=execution.get('date-started', {}).get('date'),
               finished_at=execution.get('date-ended', {}).get('date'),
               expected_hosts=sorted(expected), received_hosts=[], checksum=None,
               source='rundeck', created_at=now(), size_bytes=len(raw))
    write_json(manifest, row)
    if execution.get('status') in ('running', 'scheduled'):
        return row
    inbox = root / 'inbox' / (cid + '.log')
    inbox.write_bytes(raw)
    processing = root / 'processing' / inbox.name
    inbox.replace(processing)
    row['checksum'] = hashlib.sha256(raw).hexdigest()
    try:
        if len(set(expected)) != 5:
            raise ValueError('Exactly five expected hosts must be configured')
        if execution.get('status') != 'succeeded':
            raise ValueError('Rundeck execution did not succeed')
        row['received_hosts'] = validate(raw, expected)
        row['status'] = 'READY' if len(row['received_hosts']) == 5 else 'PARTIAL'
        if not row['started_at'] or not row['finished_at']:
            raise ValueError('Execution timestamps missing')
    except (ValueError, UnicodeError) as error:
        row['status'] = 'FAILED'
        row['error'] = str(error)
    folder = 'archive' if row['status'] == 'READY' else 'rejected'
    processing.replace(root / folder / inbox.name)
    row['raw_path'] = folder + '/' + inbox.name
    write_json(manifest, row)
    return row
