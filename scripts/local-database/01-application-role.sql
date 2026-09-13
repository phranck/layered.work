-- The role the application and the migration runner connect as.
--
-- Deliberately not a superuser. A superuser bypasses every grant, every row
-- policy and every ownership check, so a mistake in a query is the difference
-- between an error and a silently rewritten table. Both sibling projects check
-- the connected role before the first migration statement and abort when it is
-- more privileged than the work requires, and that check needs something to
-- refuse.
--
-- It owns the schema, because the migration runs as this role and what it
-- creates belongs to whoever created it. Granting it ownership afterwards is an
-- administrative repair; having it from the first statement is free.
--
-- Run once, by the image's entrypoint, when the data directory is created. The
-- password is here in plain sight on purpose: this database listens on the
-- loopback address of one laptop and holds nothing that is not reproducible
-- from the Publii export. Production is Zerops and generates its own.

CREATE ROLE layered_app WITH LOGIN PASSWORD 'layered_local' NOSUPERUSER NOCREATEDB NOCREATEROLE;

-- The database exists already; the entrypoint made it before running this.
ALTER DATABASE layered OWNER TO layered_app;

\connect layered

ALTER SCHEMA public OWNER TO layered_app;
GRANT ALL ON SCHEMA public TO layered_app;
