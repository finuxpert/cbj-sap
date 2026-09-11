# Rundeck Integration Runbook

## Scope

This runbook documents the SPHERE automatic log-ingestion path developed on `rundeck-sphere-dev`.

Production SPHERE remains on `sphere-prod` at `https://sphere.astraotoparts.co.id`.

Rundeck development is intended for `https://sphere.astraotoparts.co.id/dev` and must not modify production until promoted explicitly.

## Rundeck source

- Rundeck host: `10.14.55.205`
- Port: `4440`
- Project: `Linux`
- Job group: `SAP/AOP`
- Current job name: `[Critical]-[Daily Check] SPHERE SAP Work Proccess Check`
- Current collector command: `sudo -n -u aopadm /usr/bin/bash /SAP_ARCH/tmp_fikri/SPHERE-Collect.sh`
- Schedule: every 10 minutes
- Target nodes: `AOPH1PAPPDC`, `AOPH2PAPPDC`, `AOPH3PAPPDC`, `AOPH4PAPPDC`, `AOPH5PAPPDC`

SPHERE must not SSH, SCP, mount, or connect directly to SAP application servers. Rundeck remains responsible for SAP-side collection.

## Read-only API access

SPHERE uses a dedicated Rundeck API token with:

- Token name: `SPHERE Read Only`
- Effective user: `sphere_api`
- Role/group: `sphere_reader`
- Project scope: `Linux`

The `sphere_reader` ACL is intentionally read-only:

- project: `read`
- job: `read`, `view`, `view_history`
- node: `read`
- event: `read`

It must not receive `run`, `update`, `create`, `delete`, `kill`, admin, or key-storage permissions.

Do not use the existing `admin`, `user_aop`, or `api_token_group` permissions for SPHERE ingestion because those roles are broader than required.

## Token lifecycle

The current `SPHERE Read Only` token expires on **2026-10-10 14:50:34 WIB**.

The token value must never be committed to GitHub or written into frontend source code. Store it only in server-side secret/configuration storage on the SPHERE server.

Before expiry:

1. Generate a replacement `SPHERE Read Only` token with effective user `sphere_api` and role `sphere_reader`.
2. Update the token on the SPHERE server.
3. Verify the Rundeck API returns HTTP 200.
4. Verify execution metadata and execution output can still be read.
5. Only after validation, revoke/delete the old token.

If the token expires before rotation, automatic Rundeck ingestion will fail authentication until the token is replaced. Manual Upload Logs must remain available as fallback.

## Verified API behavior

API v44 is the current validated API version.

A read-only test against execution `521054` returned HTTP 200 and confirmed:

- execution status: `succeeded`
- project: `Linux`
- 5 successful nodes
- output endpoint returned HTTP 200
- output was complete
- output contained 1,355 entries
- node identity is present per output entry

Use execution metadata and output APIs rather than reading `.rdlog` directly from `/var/lib/rundeck`.

Recommended API flow:

```text
Rundeck execution discovery
        ↓
latest eligible execution ID
        ↓
execution metadata
        ↓
execution output JSON
        ↓
validate completion + expected nodes
        ↓
SPHERE collection
        ↓
existing JavaScript parser
        ↓
LOG Analysis
```

## Collection state

Use collection IDs in this form:

```text
rundeck-<execution_id>
```

Example:

```text
rundeck-521054
```

Recommended states:

- `PROCESSING`
- `READY`
- `PARTIAL`
- `FAILED`

A collection should become `READY` only when the execution is complete and all expected nodes are successful.

## Job recreation / workflow rotation

Rundeck jobs may be recreated periodically. SPHERE must therefore **not hardcode the current Job UUID**.

The current Job UUID may be recorded for troubleshooting, but it must not be the primary production lookup key.

Discovery should use stable job identity such as:

- project `Linux`
- group `SAP/AOP`
- stable SPHERE job name or another dedicated stable identifier

After discovering the active job, SPHERE may use its current UUID to query executions.

If a Rundeck workflow is recreated with a new UUID, SPHERE integration should continue working as long as the stable project/group/job identity is preserved.

## Important status rule

Do not use the historical `execution.xml` field `average-duration-exceeded` as the sole READY/FAILED decision. A validated sample showed that state metadata and the Rundeck execution API reported the execution and all five nodes as successful.

Use the execution API/state result and node completion status as the source of truth for collection readiness.

## Security guardrails

- No direct SAP-server connection from SPHERE.
- No Rundeck admin token in SPHERE.
- No API token in GitHub.
- No raw SAP logs committed to GitHub.
- No filesystem mount of `/var/lib/rundeck` into SPHERE.
- Prefer Rundeck REST API for execution metadata and output.
- Keep Manual Upload Logs available as operational fallback.
