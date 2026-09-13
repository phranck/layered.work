-- A second database, for the suite.
--
-- The tests that matter here are the ones that run the real queries against the
-- real constraints: a session that was deleted, an expiry that has passed, a
-- unique index that refuses a second row. Mocking the database would test the
-- mock.
--
-- It is separate from `layered` because a test that writes has to be free to
-- delete what it wrote without any care about what else is in there, and
-- `data-safety.md` forbids a test touching data it did not create. Two
-- databases makes that a property of the address rather than a rule every test
-- has to remember.
--
-- Owned by the same role, so a migration that applies to one applies to the
-- other, and so the suite exercises the privileges the application actually
-- has rather than a superuser's.

CREATE DATABASE layered_test OWNER layered_app;

\connect layered_test

ALTER SCHEMA public OWNER TO layered_app;
GRANT ALL ON SCHEMA public TO layered_app;
