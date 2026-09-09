#!/usr/bin/env bash
# Postgres first-init script (run by the postgres image entrypoint from
# /docker-entrypoint-initdb.d, ONLY when the data volume is empty). Written to
# be idempotent so it can also be re-run by hand:
#   docker compose exec -T postgres bash < postgres/init/00-roles-and-dbs.sh
#
# Roles (least privilege, one connection string per role):
#   dodi_migrator  LOGIN            owns both databases, runs migrations
#   dodi_app       LOGIN            platform request path, subject to RLS
#   dodi_service   LOGIN BYPASSRLS  platform service path (cross-account reads)
#   dodi_com       LOGIN            the ai (commercial) service
# Databases: dodi_platform (dodi_app, dodi_service) and dodi_commercial (dodi_com).
#
# A copy of this file lives at dodi-app/platform/db/docker/init/ for the local
# dev compose file. Keep both byte-identical.
set -euo pipefail

: "${DODI_MIGRATOR_PASSWORD:?DODI_MIGRATOR_PASSWORD is required}"
: "${DODI_APP_PASSWORD:?DODI_APP_PASSWORD is required}"
: "${DODI_SERVICE_PASSWORD:?DODI_SERVICE_PASSWORD is required}"
: "${DODI_COM_PASSWORD:?DODI_COM_PASSWORD is required}"

PSQL=(psql -v ON_ERROR_STOP=1 --username "${POSTGRES_USER:-postgres}" --no-psqlrc)

# Passwords travel as psql variables (:'var'), never interpolated into SQL text.
"${PSQL[@]}" --dbname postgres \
  -v migrator_pw="$DODI_MIGRATOR_PASSWORD" \
  -v app_pw="$DODI_APP_PASSWORD" \
  -v service_pw="$DODI_SERVICE_PASSWORD" \
  -v com_pw="$DODI_COM_PASSWORD" <<'SQL'
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dodi_migrator') THEN
    CREATE ROLE dodi_migrator;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dodi_app') THEN
    CREATE ROLE dodi_app;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dodi_service') THEN
    CREATE ROLE dodi_service;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dodi_com') THEN
    CREATE ROLE dodi_com;
  END IF;
END
$$;

ALTER ROLE dodi_migrator LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS PASSWORD :'migrator_pw';
ALTER ROLE dodi_app      LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS PASSWORD :'app_pw';
ALTER ROLE dodi_service  LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE BYPASSRLS   PASSWORD :'service_pw';
ALTER ROLE dodi_com      LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS PASSWORD :'com_pw';

-- CREATE DATABASE cannot run inside a transaction/DO block: generate and \gexec.
SELECT format('CREATE DATABASE %I OWNER dodi_migrator', datname)
  FROM (VALUES ('dodi_platform'), ('dodi_commercial')) AS wanted(datname)
 WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE pg_database.datname = wanted.datname)
\gexec

REVOKE ALL ON DATABASE dodi_platform   FROM PUBLIC;
REVOKE ALL ON DATABASE dodi_commercial FROM PUBLIC;
GRANT CONNECT ON DATABASE dodi_platform   TO dodi_app, dodi_service;
GRANT CONNECT ON DATABASE dodi_commercial TO dodi_com;
SQL

# Per-database schema hardening. The migrator owns each database (and thereby
# the public schema, pg_database_owner), so it can create objects; nobody else
# can. Default privileges let the app roles use what future migrations create
# without a GRANT in every migration.
"${PSQL[@]}" --dbname dodi_platform <<'SQL'
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO dodi_app, dodi_service;
ALTER DEFAULT PRIVILEGES FOR ROLE dodi_migrator IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO dodi_app, dodi_service;
ALTER DEFAULT PRIVILEGES FOR ROLE dodi_migrator IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO dodi_app, dodi_service;
ALTER DEFAULT PRIVILEGES FOR ROLE dodi_migrator IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO dodi_app, dodi_service;
SQL

"${PSQL[@]}" --dbname dodi_commercial <<'SQL'
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO dodi_com;
ALTER DEFAULT PRIVILEGES FOR ROLE dodi_migrator IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO dodi_com;
ALTER DEFAULT PRIVILEGES FOR ROLE dodi_migrator IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO dodi_com;
ALTER DEFAULT PRIVILEGES FOR ROLE dodi_migrator IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO dodi_com;
SQL

echo "roles and databases ready: dodi_platform, dodi_commercial"
