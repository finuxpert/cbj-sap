# SAP RCA PostgreSQL Hybrid Manual Check

Checked at: 2026-05-09T23:10:58+07:00
Host: sadmin-HP-280-G2-MT-Legacy
User: sadmin
Branch: dev
Commit: 655c86d3232661cfc258e6231495ee0405154f51

## Git Status
```text
 M scripts/run-sap-db-migration.sh
 M scripts/test-sap-db-layer.sh
?? docs/runtime/
```

## PostgreSQL Container
```text
CONTAINER ID   IMAGE                COMMAND                  CREATED             STATUS                          PORTS     NAMES
1de152284289   postgres:16-alpine   "docker-entrypoint.s…"   About an hour ago   Restarting (1) 58 seconds ago             cbj-postgres-dev

name=/cbj-postgres-dev status=restarting health=unhealthy
```

## PostgreSQL ENV Check
```text
OK: /opt/postgres-sap-dev/.env exists
```

## Database List
```text
Error response from daemon: Container 1de1522842895781b2fda320e3844142618dc463888673005db0186b2a2b80aa is restarting, wait until the container is running
```


## Alembic Migration Output
```text

[sap-db-migration] Validating app directory

[sap-db-migration] Validating PostgreSQL credential file
scripts/run-sap-db-migration.sh: line 32: SAP_RCA_APP_PASSWORD: SAP_RCA_APP_PASSWORD missing in /opt/postgres-sap-dev/.env
