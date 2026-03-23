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
