import { DatabaseSync } from "node:sqlite";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { MIGRATION_STEPS, SCHEMA_VERSION } from "./migrations.ts";

export { parseJsonColumn } from "./json.ts";
export { MIN_SUPPORTED_SCHEMA_VERSION } from "./migrations.ts";
export { SCHEMA_VERSION };

const here = dirname(fileURLToPath(import.meta.url));
const schemaSql = readFileSync(resolve(here, "schema.sql"), "utf8");

/** Nearest package root, so the default database does not follow the caller's CWD. */
export function findPackageRoot(start: string = here): string {
  let directory = start;
  for (;;) {
    if (existsSync(resolve(directory, "package.json"))) return directory;
    const parent = dirname(directory);
    if (parent === directory) return process.cwd();
    directory = parent;
  }
}

export function resolveDbPath(start: string, configuredPath?: string): string {
  return configuredPath ? resolve(configuredPath) : resolve(findPackageRoot(start), "data/lab.db");
}

export const dbPath = resolveDbPath(here, process.env.LAB_DB_PATH);

let singleton: DatabaseSync | undefined;

/** Process-wide database handle (LAB_DB_PATH or <package root>/data/lab.db). */
export function getDb(): DatabaseSync {
  if (!singleton) {
    mkdirSync(dirname(dbPath), { recursive: true });
    singleton = openDb(dbPath);
  }
  return singleton;
}

export const DEFAULT_BUSY_TIMEOUT_MS = 5000;

export function openDb(path: string): DatabaseSync {
  const db = new DatabaseSync(path);
  db.exec(`PRAGMA busy_timeout = ${DEFAULT_BUSY_TIMEOUT_MS}`);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");
  migrate(db);
  return db;
}

/** Test helper: isolated in-memory database. */
export function openMemoryDb(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec(`PRAGMA busy_timeout = ${DEFAULT_BUSY_TIMEOUT_MS}`);
  db.exec("PRAGMA foreign_keys = ON");
  migrate(db);
  return db;
}

/**
 * Run `fn` inside one IMMEDIATE transaction. IMMEDIATE takes the write lock
 * up front so the first statement cannot promote mid-flight; any throw rolls
 * back every statement the callback already ran.
 */
export function withTransaction<T>(db: DatabaseSync, fn: () => T): T {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    try {
      db.exec("ROLLBACK");
    } catch {
      // A failed rollback means the connection itself is broken — surface the
      // original error, which is the useful one.
    }
    throw error;
  }
}

export function migrate(db: DatabaseSync): void {
  const { user_version: version } = db.prepare("PRAGMA user_version").get() as {
    user_version: number;
  };
  if (version > SCHEMA_VERSION) {
    throw new Error(
      `Database schema v${version} is newer than this build's v${SCHEMA_VERSION}; ` +
        "refusing to open it with an older application version.",
    );
  }

  // The whole chain — DDL and the version stamp — commits or rolls back as
  // one transaction, so an interrupted migrate can never leave a partially
  // applied schema behind. ALTERs are additionally guarded by table_info so a
  // database half-migrated by an older build (which stamped the version only
  // after the chain finished) can still be completed.
  withTransaction(db, () => {
    if (version === 0) {
      db.exec(schemaSql);
      db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
      return;
    }
    for (const step of MIGRATION_STEPS) {
      if (version < step.targetVersion) step.apply(db);
    }
    if (version < SCHEMA_VERSION) db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  });
}

export function newId(): string {
  return crypto.randomUUID();
}
