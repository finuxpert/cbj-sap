"""Read-only development API. Deliberately does not mount evidence mutation routes."""
import json
from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import FileResponse
from backend.rundeck_store import ROOT, collections, identifier

app = FastAPI(title='SPHERE Rundeck Collections', docs_url=None, redoc_url=None)

@app.get('/health')
def health():
    state = ROOT / 'poller.json'
    return {'ok': ROOT.is_dir(), 'source': 'rundeck', 'ingestion': json.loads(state.read_text()) if state.exists() else {'status': 'NOT_CONFIGURED'}}

@app.get('/collections')
def list_collections(limit: int = Query(50, ge=1, le=500)):
    return {'items': collections()[:limit]}

@app.get('/collections/latest')
def latest():
    row = next((item for item in collections() if item['status'] == 'READY'), None)
    if row is None:
        raise HTTPException(404, 'No READY collection available')
    return row

@app.get('/collections/{collection_id}')
def metadata(collection_id: str):
    try:
        if identifier(collection_id.removeprefix('rundeck-')) != collection_id:
            raise ValueError()
    except ValueError:
        raise HTTPException(404, 'Collection not found') from None
    path = ROOT / 'manifests' / (collection_id + '.json')
    if not path.is_file():
        raise HTTPException(404, 'Collection not found')
    return json.loads(path.read_text())

@app.get('/collections/{collection_id}/raw')
def raw_collection(collection_id: str):
    row = metadata(collection_id)
    path = (ROOT / row.get('raw_path', 'missing')).resolve()
    if ROOT.resolve() not in path.parents or not path.is_file():
        raise HTTPException(404, 'Raw collection not available')
    return FileResponse(path, media_type='text/plain', filename=collection_id + '.log', headers={'Cache-Control': 'no-store'})
