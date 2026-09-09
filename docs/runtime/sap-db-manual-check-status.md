# SPHERE PostgreSQL Hybrid Manual Check

Checked at: 2026-05-09T23:16:19+07:00
Host: sadmin-HP-280-G2-MT-Legacy
User: sadmin
Branch: dev
Commit: db9d977f06ac5fda62802e7a59e1879e0cdbbe4a

## Pre-fix Docker Status
```text
CONTAINER ID   IMAGE                COMMAND                  CREATED         STATUS                   PORTS                      NAMES
970360e6f2df   postgres:16-alpine   "docker-entrypoint.s…"   2 minutes ago   Up 2 minutes (healthy)   127.0.0.1:5432->5432/tcp   cbj-postgres-dev
```

## Pre-fix PostgreSQL Logs
```text
The files belonging to this database system will be owned by user "postgres".
This user must also own the server process.

The database cluster will be initialized with locale "en_US.utf8".
The default database encoding has accordingly been set to "UTF8".
The default text search configuration will be set to "english".

Data page checksums are disabled.

fixing permissions on existing directory /var/lib/postgresql/data/pgdata ... ok
creating subdirectories ... ok
selecting dynamic shared memory implementation ... posix
selecting default max_connections ... 100
selecting default shared_buffers ... 128MB
selecting default time zone ... UTC
creating configuration files ... ok
running bootstrap script ... ok
sh: locale: not found
2026-05-09 16:13:28.938 UTC [42] WARNING:  no usable system locales were found
performing post-bootstrap initialization ... ok
syncing data to disk ... ok


Success. You can now start the database server using:

    pg_ctl -D /var/lib/postgresql/data/pgdata -l logfile start
initdb: warning: enabling "trust" authentication for local connections

initdb: hint: You can change this by editing pg_hba.conf or using the option -A, or --auth-local and --auth-host, the next time you run initdb.
waiting for server to start....2026-05-09 16:13:31.705 UTC [54] LOG:  starting PostgreSQL 16.13 on x86_64-pc-linux-musl, compiled by gcc (Alpine 15.2.0) 15.2.0, 64-bit
2026-05-09 16:13:31.777 UTC [54] LOG:  listening on Unix socket "/var/run/postgresql/.s.PGSQL.5432"
2026-05-09 16:13:31.995 UTC [57] LOG:  database system was shut down at 2026-05-09 16:13:29 UTC
2026-05-09 16:13:32.071 UTC [54] LOG:  database system is ready to accept connections
 done
server started

/usr/local/bin/docker-entrypoint.sh: ignoring /docker-entrypoint-initdb.d/*

waiting for server to shut down...2026-05-09 16:13:32.170 UTC [54] LOG:  received fast shutdown request
.2026-05-09 16:13:32.251 UTC [54] LOG:  aborting any active transactions
2026-05-09 16:13:32.253 UTC [54] LOG:  background worker "logical replication launcher" (PID 60) exited with exit code 1
2026-05-09 16:13:32.255 UTC [55] LOG:  shutting down
2026-05-09 16:13:32.334 UTC [55] LOG:  checkpoint starting: shutdown immediate
2026-05-09 16:13:32.615 UTC [71] FATAL:  the database system is shutting down
.2026-05-09 16:13:33.766 UTC [55] LOG:  checkpoint complete: wrote 3 buffers (0.0%); 0 WAL file(s) added, 0 removed, 0 recycled; write=0.156 s, sync=0.024 s, total=1.511 s; sync files=2, longest=0.012 s, average=0.012 s; distance=0 kB, estimate=0 kB; lsn=0/14F2630, redo lsn=0/14F2630
2026-05-09 16:13:33.770 UTC [54] LOG:  database system is shut down
 done
server stopped

PostgreSQL init process complete; ready for start up.

2026-05-09 16:13:33.849 UTC [1] LOG:  starting PostgreSQL 16.13 on x86_64-pc-linux-musl, compiled by gcc (Alpine 15.2.0) 15.2.0, 64-bit
2026-05-09 16:13:33.849 UTC [1] LOG:  listening on IPv4 address "0.0.0.0", port 5432
2026-05-09 16:13:33.849 UTC [1] LOG:  listening on IPv6 address "::", port 5432
2026-05-09 16:13:33.931 UTC [1] LOG:  listening on Unix socket "/var/run/postgresql/.s.PGSQL.5432"
2026-05-09 16:13:33.982 UTC [75] LOG:  database system was shut down at 2026-05-09 16:13:33 UTC
2026-05-09 16:13:34.011 UTC [1] LOG:  database system is ready to accept connections
2026-05-09 16:13:34.851 UTC [92] ERROR:  syntax error at or near ":" at character 130
2026-05-09 16:13:34.851 UTC [92] STATEMENT:  DO $$
	BEGIN
	  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'sap_rca_app') THEN
	    CREATE ROLE sap_rca_app LOGIN PASSWORD :'sap_rca_password';
	  END IF;
	  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'portal_app') THEN
	    CREATE ROLE portal_app LOGIN PASSWORD :'portal_password';
	  END IF;
	  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'trading_app') THEN
	    CREATE ROLE trading_app LOGIN PASSWORD :'trading_password';
	  END IF;
	  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'shared_app') THEN
	    CREATE ROLE shared_app LOGIN PASSWORD :'shared_password';
	  END IF;
	END
	$$;
```

## ENV File Check
```text
OK: /opt/postgres-sap-dev/.env exists
Keys found:
POSTGRES_USER
POSTGRES_PASSWORD
POSTGRES_DB
PGDATA
SAP_RCA_APP_PASSWORD
PORTAL_APP_PASSWORD
TRADING_APP_PASSWORD
SHARED_APP_PASSWORD
```


## Post-fix Docker Status
```text
CONTAINER ID   IMAGE                COMMAND                  CREATED         STATUS                            PORTS                      NAMES
6c421204fb68   postgres:16-alpine   "docker-entrypoint.s…"   3 seconds ago   Up 2 seconds (health: starting)   127.0.0.1:5432->5432/tcp   cbj-postgres-dev
name=/cbj-postgres-dev status=running health=starting
```

## Post-fix PostgreSQL Logs
```text

PostgreSQL Database directory appears to contain a database; Skipping initialization

2026-05-09 16:16:26.698 UTC [1] LOG:  starting PostgreSQL 16.13 on x86_64-pc-linux-musl, compiled by gcc (Alpine 15.2.0) 15.2.0, 64-bit
2026-05-09 16:16:26.698 UTC [1] LOG:  listening on IPv4 address "0.0.0.0", port 5432
2026-05-09 16:16:26.698 UTC [1] LOG:  listening on IPv6 address "::", port 5432
2026-05-09 16:16:26.749 UTC [1] LOG:  listening on Unix socket "/var/run/postgresql/.s.PGSQL.5432"
2026-05-09 16:16:26.870 UTC [35] LOG:  database system was shut down at 2026-05-09 16:16:23 UTC
2026-05-09 16:16:26.909 UTC [1] LOG:  database system is ready to accept connections
```

## App Password Keys After Fix
```text
SAP_RCA_APP_PASSWORD
PORTAL_APP_PASSWORD
TRADING_APP_PASSWORD
SHARED_APP_PASSWORD
```


## Alembic Migration Output
```text

[sap-db-migration] Validating app directory

[sap-db-migration] Validating PostgreSQL credential file

[sap-db-migration] Installing backend dependencies
error: externally-managed-environment

× This environment is externally managed
╰─> To install Python packages system-wide, try apt install
    python3-xyz, where xyz is the package you are trying to
    install.
    
    If you wish to install a non-Debian-packaged Python package,
    create a virtual environment using python3 -m venv path/to/venv.
    Then use path/to/venv/bin/python and path/to/venv/bin/pip. Make
    sure you have python3-full installed.
    
    If you wish to install a non-Debian packaged Python application,
    it may be easiest to use pipx install xyz, which will manage a
    virtual environment for you. Make sure you have pipx installed.
    
    See /usr/share/doc/python3.12/README.venv for more information.

note: If you believe this is a mistake, please contact your Python installation or OS distribution provider. You can override this, at the risk of breaking your Python installation or OS, by passing --break-system-packages.
hint: See PEP 668 for the detailed specification.
