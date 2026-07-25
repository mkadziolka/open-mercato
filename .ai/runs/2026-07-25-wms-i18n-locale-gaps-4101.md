# WMS locale gaps — issue #4101 follow-up

## Overview

Goal: close the remaining non-English locale gaps reported in open-mercato/open-mercato#4101 on the current tip of `feat/388-wms-phase-1`, so every WMS screen renders fully in `pl`, `de`, and `es`.

Most of the originally reported scope (the fully English *Receive inventory* / *Change lot status* dialogs, the first-run card, the Move destination preview, the missing `adjust.form.reasonPlaceholder` key, and the stripped Polish diacritics in the catalog/sales widget families) has already landed on the branch and is re-verified as fixed here. This run covers what a fresh sweep against `en.json` still finds.

## Scope

- Translate values still identical to `en.json` where a translation is expected (location types, CSV import CTAs, low-stock notification action, UOM column).
- Fix values that are still raw English but were invisible to a plain identical-to-English scan because the English source string had drifted (`Adjust selected ({count})`, `Commit & count next`, `On hold`, `Change status`).
- Restore the `{count}` placeholder in the three `adjustSelected` bulk-action labels, which every non-English locale dropped, so the selected-row count reappears.
- Remove English jargon left inside otherwise translated sentences (`on-hand, reserved, allocated ... per bucket`).
- Align terminology where the same English term received two different translations in one locale (location types across the config dialog and the location detail page; UOM across column/form/widget).

## Non-goals

- No component, API, schema, or behavior changes — locale JSON values only.
- No key additions or removals: key sets stay byte-identical to `en.json` so `i18n:check-sync` stays green.
- Cross-language terms that are correct as-is (SKU, FEFO/FIFO/LIFO, RMA, Status, Format, Delta, CSV column identifiers, `WMS`) are intentionally left untranslated.

## Implementation Plan

### Phase 1: Sweep

1. Diff `pl`/`de`/`es` against `en.json` for exact-identical values, placeholder parity, and token-overlap (catches stale translations of drifted English source strings).
2. Confirm each candidate key is actually rendered by a component before translating it.

### Phase 2: Fix and verify

1. Apply value-only edits to `pl.json`, `de.json`, `es.json`.
2. Re-run the sweep: 0 placeholder mismatches, no residual English, key order preserved.
3. Run `i18n:check-sync`, `i18n:check-values`, and the WMS module test suite.

## Risks

- Terminology alignment touches a few already-translated values (e.g. `pl` `location.types.bin`, `de` `location.types.rack`); mitigated by choosing the standard warehouse term and keeping both key families consistent, and by listing every such change in the PR body.
- The branch keeps moving, so new English keys can land after this sweep; mitigated by rebasing onto the current tip before pushing.

## Progress

- 2026-07-25 — Swept `pl`/`de`/`es` against `en.json` on tip `979165184`; confirmed the originally reported dialogs, first-run card, and widget diacritics are already fixed on the branch.
- 2026-07-25 — Found and fixed 18 `pl`, 16 `de`, 13 `es` values; 0 placeholder mismatches remain, key sets unchanged.
- 2026-07-25 — Verified: `i18n:check-sync` clean, `i18n:check-values` unchanged for wms, WMS tests 235/236 (the single failure, `listEnrichers.test.ts`, pre-exists on the clean base after the structured-logger migration commit and is unrelated).
