import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

/**
 * Which database this process talks to is decided here, once, before any query can run.
 *
 * Under the test runner (Vitest sets VITEST) the client is pointed at TEST_DATABASE_URL and refuses to start unless that
 * is set, differs from DATABASE_URL, and has "test" in its database name. The tests delete every row in the tables they
 * use, so they must never be able to reach the real database, whatever order their imports run in.
 */
function databaseNameOf(url: string): string {
  try {
    return decodeURIComponent(new URL(url).pathname.replace(/^\//, ''));
  } catch {
    return '';
  }
}

function resolveDatasourceUrl(): string | undefined {
  if (!process.env.VITEST) return undefined; // normal run: Prisma uses DATABASE_URL

  const testUrl = process.env.TEST_DATABASE_URL;
  if (!testUrl) {
    throw new Error('Tests need TEST_DATABASE_URL (a separate database whose name contains "test"). Refusing to run against DATABASE_URL.');
  }
  if (testUrl === process.env.DATABASE_URL || !/test/i.test(databaseNameOf(testUrl))) {
    throw new Error('TEST_DATABASE_URL must be a different database from DATABASE_URL, with "test" in its name. Refusing to run.');
  }
  return testUrl;
}

export const prisma = new PrismaClient({ datasourceUrl: resolveDatasourceUrl() });
