const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const { renderer, source } = require('../liquid-fixture.cjs');

// Real header/snippet/CSS/JS with synthetic native choices. This does not publish languages or emulate Markets.
async function mountHeader(page, locale, multipleLanguages = true, javascript = true) {
  const languages = [
    { iso_code: 'en', endonym_name: 'English' },
    { iso_code: 'fr', endonym_name: 'français' },
    { iso_code: 'es', endonym_name: 'español' },
  ];
  const country = { iso_code: 'GB', name: { en: 'United Kingdom', fr: 'Royaume-Uni', es: 'Reino Unido' }[locale], currency: { iso_code: 'GBP' } };
  const language = languages.find((item) => item.iso_code === locale);
  const markup = renderer(locale)('sections/header.liquid', {
    section: { id: 'fixture', settings: { menu: { links: [
      { title: 'Collections', url: '/collections/all', links: [] },
      { title: { en: 'About', fr: 'À propos', es: 'Acerca de' }[locale], url: '/pages/about', links: [] },
    ] } } }, shop: { name: 'Coco Rosette' }, cart: { item_count: 0 }, request: { path: '/products/fixture' },
    routes: { root_url: '/', cart_url: '/cart', all_products_collection_url: '/collections/all', collections_url: '/collections' },
    localization: { country, language, available_countries: [country, { iso_code: 'US', name: 'United States', currency: { iso_code: 'USD' } }],
      available_languages: multipleLanguages ? languages : [language] },
  });
  const styles = ['sections/header.liquid', 'snippets/localisation-controls.liquid'].map((file) => source(file).match(/{% stylesheet %}([\s\S]*?){% endstylesheet %}/)[1]).join('\n');
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== 'https://header.test') throw new Error('Unexpected external fixture request');
    if (['/assets/coco-rosette-wordmark.png', '/assets/jost-300-400-latin.woff2'].includes(url.pathname)) {
      return route.fulfill({ body: fs.readFileSync(path.join(__dirname, '../..', url.pathname)),
        contentType: url.pathname.endsWith('.png') ? 'image/png' : 'font/woff2' });
    }
    return route.fulfill({ contentType: 'text/html; charset=utf-8', body: `<!doctype html><html lang="${locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>
      @font-face {font-family:Jost;src:url('/assets/jost-300-400-latin.woff2');font-weight:300 400;}
      ${source('assets/theme.css')} ${styles}</style></head><body>${markup}<main>Fixture</main>
      ${javascript ? `<script>${source('assets/theme.js')}</script>` : ''}</body></html>` });
  });
  await page.goto('https://header.test/');
  await page.evaluate(() => document.fonts.ready);
}

for (const locale of ['en', 'fr', 'es']) {
  test(`${locale}: inline desktop selectors fit at the breakpoint and wider widths`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'Desktop layout matrix');
    await mountHeader(page, locale);
    for (const width of [851, 1024, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const selectors = ['.coco-header__logo', '.coco-header__navigation--desktop',
        '.coco-header__localisation select[name="language_code"]', '.coco-header__localisation select[name="country_code"]', '.coco-header__cart'];
      const boxes = await page.evaluate((selectors) => selectors.map((selector) => {
        const { x, y, width, height } = document.querySelector(selector).getBoundingClientRect();
        return { x, y, width, height };
      }), selectors);
      expect(boxes[0].width).toBeGreaterThanOrEqual(120);
      for (let index = 1; index < boxes.length; index++) {
        expect(boxes[index].x, JSON.stringify({ width, index, boxes })).toBeGreaterThanOrEqual(boxes[index - 1].x + boxes[index - 1].width);
        expect(Math.abs(boxes[index].y + boxes[index].height / 2 - boxes[0].y - boxes[0].height / 2)).toBeLessThan(2);
      }
      expect(boxes.at(-1).x + boxes.at(-1).width).toBeLessThan(width);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    }
    const controls = page.locator('.coco-header__localisation');
    await controls.locator('select[name="language_code"]').focus();
    await page.keyboard.press('Tab');
    await expect(controls.locator('select[name="country_code"]')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.locator('.coco-header__cart')).toBeFocused();
  });

  test(`${locale}: mobile drawer retains two labelled controls and a centred wordmark`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'Mobile layout matrix');
    await mountHeader(page, locale);
    for (const width of [375, 768]) {
      await page.setViewportSize({ width, height: 1024 });
      await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const logo = await page.locator('.coco-header__logo').boundingBox();
      expect(Math.abs(logo.x + logo.width / 2 - width / 2)).toBeLessThan(1);
      await expect(page.locator('.coco-header__localisation')).toBeHidden();
      await page.locator('[data-mobile-navigation-trigger]').click();
      const dialog = page.locator('[data-mobile-navigation]');
      await expect(dialog.locator('select')).toHaveCount(2);
      for (const select of await dialog.locator('select').all()) {
        await expect(select).toBeVisible();
        const id = await select.getAttribute('id');
        await expect(dialog.locator(`label[for="${id}"]`)).toBeVisible();
        const box = await select.boundingBox();
        const container = await dialog.boundingBox();
        expect(box.height).toBeGreaterThanOrEqual(48);
        expect(box.x + box.width).toBeLessThanOrEqual(container.x + container.width);
      }
      await page.keyboard.press('Escape');
      await expect(dialog).not.toBeVisible();
      await expect(page.locator('[data-mobile-navigation-trigger]')).toBeFocused();
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    }
  });
}

test('English remains visible but disabled until another language is available', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await mountHeader(page, 'en', false);
  const language = page.locator('.coco-header__localisation select[name="language_code"]');
  await expect(language).toBeVisible();
  await expect(language).toBeDisabled();
  await expect(language.locator('option')).toHaveCount(1);
  await expect(language).toHaveValue('en');
});

test('without enhancement each available selector retains its explicit submit button', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await mountHeader(page, 'en', true, false);
  const controls = page.locator('.coco-header__localisation');
  await expect(controls.locator('button[type="submit"]')).toHaveCount(2);
  for (const button of await controls.locator('button').all()) await expect(button).toBeVisible();
});
