#!/bin/bash
# Runs once when the PostgreSQL volume is first initialised: creates the isolated restore-validation database
# next to the installation database. It is owned by the same role and is never exposed through the web router.
set -euo pipefail
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-SQL
  CREATE DATABASE "${POSTGRES_DB}_restore_check" OWNER "$POSTGRES_USER";
SQL
