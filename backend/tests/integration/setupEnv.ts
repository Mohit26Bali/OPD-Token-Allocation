import dotenv from 'dotenv';

// Loads backend/.env so TEST_DATABASE_URL is available. Which database the tests use is decided in src/utils/prisma.ts,
// not here: under Vitest it always uses TEST_DATABASE_URL and refuses to start unless that is a separate database whose
// name contains "test". (This file used to copy TEST_DATABASE_URL over DATABASE_URL, but the database client had already
// chosen the real database by then, so the tests ran against it and wiped it.)
dotenv.config();
