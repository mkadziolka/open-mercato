# Gamification Package - Agent Guidelines

This file exists to prevent branding and i18n regressions caused by editing generated mirror files.

## Source of Truth (MUST)

- All gamification feature, branding, and i18n changes MUST be done in `modules/gamification`.
- `core/apps/mercato/src/modules/gamification` is a runtime mirror and can be overwritten by generate/sync workflows.
- NEVER treat `core/apps/mercato/src/modules/gamification` as the primary edit location.

## Branding Rule (MUST)

When changing app title, product name, or other gamification branding keys:

1. Edit only files in `modules/gamification/i18n/*.json`.
2. Keep the branding keys synchronized across locales:
   - `app.metadata.title`
   - `app.page.title`
   - `app.page.logoAlt`
   - `appShell.productName`
3. Run sync to propagate changes to runtime mirror:
   - `node ./scripts/sync-gamification.mjs`
4. If `yarn generate` is used, verify branding keys still resolve from the source module.

## Guardrail Checklist

Before finishing any gamification branding/i18n task:

- Confirm changes are present in `modules/gamification/i18n/*.json`.
- Confirm mirror contains synced values in `core/apps/mercato/src/modules/gamification/i18n/*.json`.
- Do not rely on direct edits in mirror files; they are ephemeral.

## Migration Generation Workflow (MUST)

When changing gamification entities and generating migrations:

1. Treat `modules/gamification/migrations` as the only source-of-truth location for new gamification migrations.
2. Run migration generation from the repo workflow that targets the app CLI, not by editing files in `core/apps/mercato/src/modules/gamification/migrations` manually.
3. Expect `mercato db generate` to inspect all enabled modules from `core/apps/mercato/src/modules.ts`, not just gamification.
4. Review generated files immediately before continuing.

### Safe Workflow

1. Verify the intended database context first:
   - `core/apps/mercato/.env` drives `DATABASE_URL` for `mercato db generate`.
   - Snapshot names are database-name-sensitive, e.g. `.snapshot-mercato_db.json`.
2. Generate migrations.
3. Accept only gamification outputs in:
   - `modules/gamification/migrations/*`
   - mirrored copies in `core/apps/mercato/src/modules/gamification/migrations/*` after sync
4. Sync the module mirror after generation:
   - `node ./scripts/sync-gamification.mjs`
5. Re-check git status before committing.

### Phantom Migration Warning

If a gamification-only change suddenly generates files like:

- `core/packages/core/src/modules/*/migrations/Migration*.ts`
- `core/packages/*/src/modules/*/migrations/.snapshot-*.json`
- `core/apps/mercato/src/modules/example/migrations/*`

then treat them as accidental cross-module outputs, not valid gamification migrations.

This usually means the CLI compared module schemas against a different snapshot/database context and produced phantom diffs for unrelated modules.

### Required Review After `db:generate`

- Keep the generated gamification migration only if it matches the entity change you just made.
- Do not commit unrelated migration files from `core/packages/*` or unrelated app modules when the task only changed gamification.
- If unrelated module migrations appear, stop and clean them up before proceeding.
