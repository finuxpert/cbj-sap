# SPHERE

SPHERE is a SAP Basis operations workspace for ST03N analysis, LOG analysis, process evidence, Case History, and operational RCA workflows.

Current stable baseline: **v1.16.2**

Production: **https://sphere.astraotoparts.co.id**

## Branch model

SPHERE now uses four active branches:

| Branch | Purpose |
|---|---|
| `sphere-prod` | Stable production SPHERE using the existing manual Upload Logs workflow. |
| `sphere-dev` | Development and testing for SPHERE before promotion to `sphere-prod`. |
| `rundeck-sphere-prod` | Stable production SPHERE with automatic Rundeck log ingestion. Manual Upload Logs remains available as fallback. |
| `rundeck-sphere-dev` | Development and testing for Rundeck integration before promotion to `rundeck-sphere-prod`. |

Promotion flow:

```text
sphere-dev
    ↓
sphere-prod

rundeck-sphere-dev
    ↓
rundeck-sphere-prod
```

New development must use the matching development branch. Legacy `main`, `dev`, release, fix, verify, cleanup, audit, and temporary UI branches are not part of the active branch model.

## Current application

The active application is React and Vite on the frontend, FastAPI on the backend, and PostgreSQL for server-side history and metadata.

Primary workspaces:

- ST03N Analysis
- LOG Analysis
- Process Evidence
- Case History

Manual Upload Logs remains supported. LOG parsing currently runs in the browser using the existing tested JavaScript parser chain.

The Rundeck branch family is reserved for automatic collection ingestion. SPHERE must not connect directly to SAP application servers. Rundeck remains responsible for collecting SAP server data.

## Development validation

Before promotion, run:

```bash
npm ci
npm run lint
npm test
npm run build
npm audit
```

A release must pass validation before promotion to its production branch.

## Repository guardrails

- Do not delete files based only on their names.
- Preserve active parser, analytics, frontend, backend, database, and test dependencies.
- Preserve collector protocol compatibility markers such as `RCA-SNAPSHOT-V2.2`, `RCA-WP-V2.2`, and `RCA-EXT`.
- Preserve database migration history, including the historical initial migration filename.
- Do not restore old CBJ monitoring, portal, mail-server, or legacy deployment assets into active SPHERE branches.
- Do not deploy old workflows that target retired CBJ infrastructure.
