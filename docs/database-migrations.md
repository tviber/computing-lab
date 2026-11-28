# Database migrations

The classroom API stores its data in SQLite. `server/db/schema.sql` is the
current schema, and `server/db/migrations.ts` owns every upgrade that an
existing database may need.

## Support boundary

- A brand-new database starts empty (`user_version = 0`) and is created from
  `schema.sql` in one transaction.
- This build supports in-place upgrades from every released schema version
  **v1 through v22**.
- A database newer than the running build is rejected before any migration
  runs. Deploy the matching API build instead of opening it with an older one.
- Upgrades remain one `BEGIN IMMEDIATE` transaction. A failed step rolls back
  both its schema/data changes and the `user_version` stamp.

The support boundary is deliberately conservative. Historical steps for the
CPU, lunch-shift, and logistic-regression resets are retained even though they
look repetitive: released databases may still sit at any of those versions,
and deleting a step would change the final state of a supported upgrade.

**No migration may be deleted, merged, or squashed without an explicit
maintainer decision about the oldest production database that must still
upgrade.** The current policy keeps every v1-v22 path intact.

## Layout

- `server/db/schema.sql` is the complete schema for a new database.
- `server/db/migrations.ts` exports `SCHEMA_VERSION` and the ordered
  `MIGRATION_STEPS` manifest.
- Each step has a `targetVersion` and an `apply` function that upgrades from
  the preceding version.
- `server/db/client.ts` only validates the version, runs the steps inside one
  transaction, and stamps the final version.
- `server/db/json.ts` holds column parsing helpers shared by runtime code and
  migrations, avoiding a cycle through `client.ts`.

## Adding a migration

1. Make the additive change in `schema.sql` so a new database is current.
2. Bump `SCHEMA_VERSION` by one.
3. Append exactly one step with the new `targetVersion` and an idempotent
   `apply` function. Use `IF NOT EXISTS` or the `hasColumn` guard for DDL that
   may already have landed in a half-migrated database.
4. Preserve user, class, task-sheet, and unaffected-lab data. Keep table
   rebuilds and JSON rewrites deterministic.
5. Add a focused upgrade test in `server/db/client.test.ts`. The versioned
   matrix automatically covers every version from
   `MIN_SUPPORTED_SCHEMA_VERSION` through `SCHEMA_VERSION`; add a dedicated
   fixture when a step moves or deletes data.
6. Update this document if the support boundary or reset policy changes.

Resetting a lab's progress is allowed only when its stored stage indices or
draft payload no longer have a faithful mapping. Record the reason in the step
comment and test both the affected lab and an unaffected lab. If a mapping is
possible, migrate the data instead of discarding it.

## Verification

Run the focused database checks while editing:

```sh
node node_modules/vitest/vitest.mjs run server/db/client.test.ts server/db/migrations.test.ts
```

Before handoff, run the normal typecheck and full unit suite. The migration
tests assert the final `user_version`, required tables/indexes, representative
data transformations, rollback behavior, and rejection of newer schemas.
