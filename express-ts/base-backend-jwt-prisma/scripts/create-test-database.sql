-- Runs once, when the postgres volume is first initialised. The test suite
-- truncates tables between tests, so it gets a database of its own rather than
-- the one you are developing against.
CREATE DATABASE jwt_prisma_backend_test OWNER postgres;
