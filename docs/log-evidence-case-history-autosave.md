# Log Evidence V2 → Case History autosave

This note documents the DEV incremental integration between Log Evidence V2 and Case History.

## Scope

- Frontend only incremental integration on branch `dev`.
- PROD is not touched.
- Log parser, uploader, and PDF export flows remain intact.

## Flow

1. Open `#/tool/logs`.
2. Create or select a Case History item from the Case History Link panel.
3. Upload `.log`, `.txt`, `.csv`, or `.zip` evidence.
4. Log Evidence V2 parses the evidence.
5. Parsed summary is saved to `POST /cases/{id}/parsed-results`.
6. Uploaded evidence files are linked to the selected case through `/upload` with `case_id`.
7. The saved result can be reopened from `#/cases/{id}` and exported as management PDF.

## API endpoints used

- `GET /mobile/cases`
- `POST /cases`
- `POST /cases/{id}/parsed-results`
- `POST /upload`

## Validation target

- `npm run build`
- DEV deploy to `/var/www/svr01-dev/sap`
- API health check: `https://sapdev.cbj-kontruksi.com/sap-api/health`

## Deploy trigger note

Latest validation trigger: fallback case selection after create-case response without id.
