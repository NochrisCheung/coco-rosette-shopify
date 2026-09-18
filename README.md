# Coco Rosette Shopify Theme

This is the deployable Liquid theme for Coco Rosette, a made-to-order luxury dog couture brand. Wedding dresses are its signature collection, not its entire identity. It is a Shopify Online Store 2.0 theme, not a React or headless implementation.

The theme is independently version-controlled inside this directory. The workspace root is not a Git repository.

## Storefront direction

- English uses British English throughout.
- English, French and Spanish are published. Five native Markets cover the UK, US, Canada and all 27 EU countries: GBP, USD, CAD, fixed EUR for 21 EU destinations, and CZK/DKK/HUF/PLN/RON/SEK for the remaining six. France and Spain share European Union — EUR; their previous market records are inactive. Customer care remains English-only.
- The current customer journey is Home, Collections, product pages, bag/cart, support pages, and native Shopify policies.
- `/collections/all` is the primary All Dogwear catalogue route. Customer-facing search and blog journeys are intentionally excluded.
- The technical Shopify `/search` route remains valid but is unpromoted and no-indexed.
- New or revised Coco Rosette identity and botanical delivery assets are PNG-first. Product and hero photography are Shopify-managed media.

Read the workspace [agent guide](../AGENTS.md), [brand guidelines](../guidelines_and_examples/Brand_Guidelines_EN.md), [asset manifest](../docs/assets/asset_manifest.md), and [Shopify development guidelines](../docs/engineering/shopify_development_guidelines.md) before changing the theme.

## Directory structure

```text
assets/       Global CSS, JavaScript, fonts, and approved theme-owned PNG assets
config/       Shopify theme settings
layout/       Document shell and global resource loading
locales/      Customer-facing and Theme Editor translations
sections/     Route and merchant-configurable page regions
snippets/     Reusable Liquid rendering primitives
templates/    JSON route composition and required Liquid templates
scripts/      Guarded preview upload and visual-review tooling (not delivered)
tests/        Source contracts, browser journeys and approved visual references
quality/      Approved design fingerprints (not delivered)
```

## Local development

Install [Shopify CLI](https://shopify.dev/docs/api/shopify-cli) (release checked with 4.8.0), Node 22 or later and Google Chrome. Authenticate through Shopify’s supported flow. From this directory:

```sh
npm ci --ignore-scripts
npm run check
npm run guard -- snapshot --theme <exact-non-live-theme-id>
npm run guard -- audit --snapshot <returned-snapshot.json>
```

Use a development or unpublished theme for all work. An older preview is not a design baseline. Do not bypass drift/settings checks with a raw whole-theme push or automatic `theme dev` upload.

## Required checks

Run these from this directory before handing off a theme change:

```sh
npm run check
git diff --check
node --check assets/theme.js
npm run test:localisation-browser
npx playwright install webkit
CR_THEME_ID=<exact-non-live-theme-id> npm run test:browser
CR_THEME_ID=<exact-non-live-theme-id> npm run test:visual
```

Review the affected route at desktop and narrow mobile widths. Verify semantic landmarks, keyboard navigation, focus visibility, reduced-motion behaviour, blank states, and real Shopify product/variant data where applicable.

The default browser matrix includes 1440px/768px/390px Chrome and 375px WebKit. Missing approved visual references fail the comparison; they are never automatically accepted. `npm run capture:visual` with the same `CR_THEME_ID` creates unapproved review candidates only. Obtain merchant approval before recording reference images with `scripts/approve-visual.cjs`. Keep the browser version/OS fixed for pixel comparisons. See the [full release and visual-review procedure](../docs/engineering/shopify_development_guidelines.md#13-required-commands).

The separate `test:localisation-browser` command runs the actual theme JavaScript against synthetic Liquid-rendered English/French/Spanish product fixtures in installed Chrome, at desktop and mobile widths. It makes no Shopify requests. LiquidJS is a development-only test dependency, not a Shopify server emulator: native localisation-form wrappers, images, money and translation filters are fixture adapters. These checks cover option IDs, request races/errors, Custom size retention, native-form payloads and localised basket-add behaviour; they do not prove real Markets routing, payment currency, final translated copy or visual approval.

The GitHub workflow runs source tests and Theme Check after this change is committed/pushed; it has no deployment credentials. Remote browser checks are not run in CI. Reports and anonymous-session traces are ignored, not theme assets. An unavailable browser or failed check must remain visible, not be reported as passed.

## Theme-owned versus Shopify-owned content

| Theme-owned | Shopify-owned |
| --- | --- |
| Layout, styling, interaction code, locale strings, approved PNG identity/botanical delivery assets, self-hosted web fonts | Products, variants, product media, collection membership, pages, menus, policies, Markets, shipping, taxes, checkout, global SEO preferences, and final hero media |

Do not duplicate Shopify-owned product media in `assets/`. Do not hard-code product titles, prices, availability, or policy destinations. Native policy links use Shopify policy objects.

## Live localisation contract

The combined footer contains the Instagram link below the brand signature and
native language/country selectors beneath it on desktop above 850px. At 850px and
below, selectors remain in the navigation drawer, not duplicated in the footer.
Language and country submit separately; changing currency does not translate the
website or rewrite the destination-currency Delivery policy table.

The footer's Theme Editor `Instagram` setting controls the icon. Its current
value is `https://www.instagram.com/coco.rosette.studio/`, saved in
`sections/footer-group.json`; clearing it hides the link. The section's URL schema
has no external default. Preserve the existing menu selections when changing this
setting. The icon is inline SVG from the existing icon snippet, with an accessible
link name and a 48px target; no social embed, tracking script or new artwork is loaded.

French and Spanish were published with the approved localised theme on 9 September. Future locale-file changes still require source/translation review and explicit release approval. The published product form consumes `custom.storefront_option_identity`: a catalogue-owned JSON map of native option positions/value IDs, canonical roles, Custom size identity and reviewed non-native swatches. The guarded lifecycle/backfill and real-store journeys were verified for that release. Missing/stale maps deliberately disable purchase; recheck current coverage after any option or catalogue change rather than relying on the historical backfill.

Option changes use one native `option_values` section-refresh path in every language, not a translated-label lookup or embedded all-variants array. Stale/mismatched replies cannot enable purchase; retry remains explicit. Preserve measurements and quantity during replacement and remove parsed `noscript` elements before adoption. Without JavaScript, only the initial server-selected variant is offered. Basket labels translate, while fulfilment property keys remain unchanged. Actual checkout/notification presentation of those keys still requires review.

## Catalogue operations

The Etsy/Shopify SKU register is controlled outside this repository at `/Users/nochris/Library/Application Support/Coco Rosette/catalogue_sku_register.csv`; it is not a theme asset and must never be committed. Product-gallery refreshes, new-listing onboarding, and Online Store publication use the guarded procedure in [`../docs/operations/catalogue_sync_runbook.md`](../docs/operations/catalogue_sync_runbook.md). Do not use theme code or a generic import to overwrite Shopify-owned product copy, pricing, operational SKUs, Custom size variants, publication, or collection assignment.

## Search and channel maintenance

Products use stable nickname handles and native permanent redirects from their old
URLs. Keep the URL convention, native SEO fields and Catalog descriptive-title
mapping separate. The [search and discovery runbook](../docs/operations/search_and_discovery_runbook.md)
records Google/Shop/Agentic checks and the unresolved variant-description,
shipping/returns schema and request-header-dependent locale-routing findings.
These have not been fixed by this documentation update. Provider approval or
processing is not a theme test result; do not add duplicate tracking or Product
graphs as a shortcut.

## Deployment boundary

Keep one permanent Shopify theme named **Coco Rosette**, without V0 or dated suffixes. Use a temporary unpublished duplicate of the current live theme for guarded release checks. After successful approved publication and live verification, retain a verified private local backup before deleting the exact superseded Coco Rosette theme IDs. Leave unrelated themes alone. If a release is blocked, preserve the live theme and report any retained preview; do not bypass checks just to reduce the theme count.

The 18 September release is live as theme `198614581592`. The three superseded
Coco Rosette copies were backed up and deleted; Horizon was left unchanged.
Chrome source/browser/visual acceptance passed. Safari/WebKit could not start and
was explicitly waived by the merchant for this release only; this is not a Safari
pass or a standing exemption for later work. Theme publication does not deploy
workspace documentation, catalogue tools or Shopify-admin configuration.

Use the guarded remote-write workflow:

```sh
npm run guard -- plan --snapshot <returned-snapshot.json> --files <exact-file-a,exact-file-b>
npm run guard -- push-preview --plan <returned-plan.json> --confirm-theme <exact-non-live-theme-id>
```

All changed local delivery files must be reconciled, including changes outside the immediate feature. Add `--settings <exact-configuration-file>` to `plan` only for an explicitly approved configuration overwrite. The guard refuses live targets, stale plans, altered remote state, altered local bytes and implicit deletion. It freezes the reviewed payload, runs source checks, uploads only the allowlist, reads back every file, then requires browser and visual gates. A files-verified receipt is not release approval. If post-upload QA fails, the preview remains changed and release is blocked; there is no automatic rollback.

Do not run `shopify theme publish`, modify the live theme, delete a remote theme, or change Shopify administration settings without explicit merchant approval for that exact action. Direct Shopify/CLI writes can bypass these safeguards; they are a required workflow, not an access-control system or an unattended monitor.

For any authorised live repair, treat the Git-tracked theme source as the visual-code authority and Shopify Admin as the authority for merchant-managed configuration. Before upload, pull the named live theme to a temporary audit directory and compare the affected files with the approved local revision. Never upload a partial change from an older working tree. Keep `config/settings_data.json`, section-group JSON settings, menus, products, policies, and other Shopify-managed configuration out of a source-only repair unless the release explicitly includes them. After upload, pull the same theme again and verify the deployed file hashes and Liquid asset references. This catches a partial upload before it becomes a visible design regression.

The V0 plan retains the original storefront history. The [analytics and discovery master record](../docs/implementation_plans/implementation_plan_2026-09-03_analytics_marketing_and_chatgpt_discovery.md) contains the current close-out and unresolved findings; the [localisation release record](../docs/implementation_plans/implementation_plan_2026-09-07_market_localisation_and_website_growth.md) supplies the dated language/currency release evidence. Operational instructions live in the runbooks, not historical task notes.
