# Coco Rosette Shopify Theme

This is the deployable Liquid theme for Coco Rosette, a made-to-order luxury dogwear storefront. It is a Shopify Online Store 2.0 theme, not a React or headless implementation.

The theme is independently version-controlled inside this directory. The workspace root is not a Git repository.

## Storefront direction

- English uses British English throughout.
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
```

## Local development

Install the current [Shopify CLI](https://shopify.dev/docs/api/shopify-cli) and authenticate through Shopify’s supported flow. From this directory:

```sh
shopify theme dev --store 1w5nxy-1m.myshopify.com
```

Use a development or unpublished theme for all work. Confirm the target theme name and ID before a remote write.

## Required checks

Run these from this directory before handing off a theme change:

```sh
shopify theme check
git diff --check
node --check assets/theme.js
```

Review the affected route at desktop and narrow mobile widths. Verify semantic landmarks, keyboard navigation, focus visibility, reduced-motion behaviour, blank states, and real Shopify product/variant data where applicable.

## Theme-owned versus Shopify-owned content

| Theme-owned | Shopify-owned |
| --- | --- |
| Layout, styling, interaction code, locale strings, approved PNG identity/botanical delivery assets, self-hosted web fonts | Products, variants, product media, collection membership, pages, menus, policies, Markets, shipping, taxes, checkout, global SEO preferences, and final hero media |

Do not duplicate Shopify-owned product media in `assets/`. Do not hard-code product titles, prices, availability, or policy destinations. Native policy links use Shopify policy objects.

## Catalogue operations

The Etsy/Shopify SKU register is controlled outside this repository at `/Users/nochris/Library/Application Support/Coco Rosette/catalogue_sku_register.csv`; it is not a theme asset and must never be committed. Product-gallery refreshes, new-listing onboarding, and Online Store publication use the guarded procedure in [`../docs/operations/catalogue_sync_runbook.md`](../docs/operations/catalogue_sync_runbook.md). Do not use theme code or a generic import to overwrite Shopify-owned product copy, pricing, operational SKUs, Custom size variants, publication, or collection assignment.

## Deployment boundary

`shopify theme push` is a remote write. Upload only reviewed files to the identified development or unpublished theme. Do not run `shopify theme publish`, modify the live theme, delete a remote theme, or change Shopify administration settings without explicit merchant approval for that exact action.

For any authorised live repair, treat the Git-tracked theme source as the visual-code authority and Shopify Admin as the authority for merchant-managed configuration. Before upload, pull the named live theme to a temporary audit directory and compare the affected files with the approved local revision. Never upload a partial change from an older working tree. Keep `config/settings_data.json`, section-group JSON settings, menus, products, policies, and other Shopify-managed configuration out of a source-only repair unless the release explicitly includes them. After upload, pull the same theme again and verify the deployed file hashes and Liquid asset references. This catches a partial upload before it becomes a visible design regression.

The current release boundary, theme IDs, known limitations, and outstanding merchant decisions are maintained in the master record at `../docs/implementation_plans/implementation_plan_2026-08-25_coco_rosette_storefront_v0.md`.
