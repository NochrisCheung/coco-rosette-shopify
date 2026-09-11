# Contributing to the Coco Rosette Shopify Theme

## Before editing

1. Read `../AGENTS.md`, the relevant current design guidance, and the affected theme code.
2. Inspect `git status --short`. This worktree can contain intentional uncommitted merchant work; preserve anything outside the requested scope.
3. Identify the customer or merchant outcome, the affected routes, the required Shopify data, and the verification method.
4. Work in a development or unpublished theme only. Identify its name and ID before uploading.

## Code and content standards

- Use British English for all new or revised English copy, locale strings, and Theme Editor labels.
- Keep Liquid semantic and small. Use a section for a configurable page region and a snippet for a reused, bounded rendering primitive.
- Use Shopify product, collection, policy, menu, and media objects rather than duplicating data in code or theme settings.
- Keep theme-owned identity and botanical artwork PNG-first. Consult `../docs/assets/asset_manifest.md` before changing an asset reference.
- Retain the Collections-and-filters discovery model. Do not add a customer-facing search entry point or a blog surface without an approved product decision.
- Keep accessibility integral: real controls, visible focus, keyboard operation, meaningful alternative text, silent decoration, and reduced-motion support.
- Do not add a library, app, tracking tag, paid service, or checkout workaround to solve a small theme concern.

## Checks

Run from `paws-union-theme/` after a relevant change:

```sh
npm run check
git diff --check
node --check assets/theme.js
npm run test:localisation-browser
CR_THEME_ID=<exact-non-live-id> npm run test:browser
CR_THEME_ID=<exact-non-live-id> npm run test:visual
```

Also review the changed route with real representative Shopify data at desktop and mobile widths. Exercise changed forms, variant selection, cart behaviour, menus, and focus flow. A preview is not evidence that checkout, Markets, payment, tax, or shipping configuration works; use Shopify’s appropriate test flow for those surfaces.

The offline localisation browser suite is a prerequisite for option/locale/section-refresh changes, not a replacement for those real-store checks. Do not deploy an identity-dependent product form before its catalogue-owned maps and publication guards have been verified. Translation files and fixture results are not merchant approval to publish a language.

## Remote and Git safety

- Do not commit secrets, private CSV registers, generated local preferences, or unrelated work.
- Do not reset, force-push, amend, delete a branch, discard a change, delete a remote theme, or make Shopify-admin changes without explicit merchant authority.
- Upload only a cohesive reviewed change. `shopify theme publish` requires separate explicit approval and is never an incidental follow-up to an upload.
- Use the guarded snapshot → audit → plan → preview-upload flow in `README.md`. Reconcile all source drift, explicitly approve merchant configuration files, and retain full readback evidence. Do not bypass a failed gate with raw CLI uploads.
- Preserve `quality/approved-design.json` fingerprints and approved visual references. Changes require the corresponding design decision, not an automatic baseline refresh. Missing references, unavailable browsers and failed checks are release blockers.

## Handoff

State the customer-visible result, changed paths, checks performed, deployment target, and any remaining limitation or decision. Keep the master record current when the release state or a standing operational decision changes.
