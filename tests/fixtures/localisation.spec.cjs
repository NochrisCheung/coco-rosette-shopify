const { test, expect } = require('@playwright/test');
const { renderer, source, productFixture } = require('../liquid-fixture.cjs');

const selectedIds = (fixture) => fixture.product.options_with_values.map((option) => String(option.values.find((value) => value.selected).id));
function productMarkup(locale, shape, ids, mode = 'ok') {
  const fixture = productFixture(locale, shape);
  fixture.product.options_with_values.forEach((option, index) => {
    option.values.forEach((value) => value.selected = ids ? String(value.id) === ids[index] : value.selected);
  });
  const selected = selectedIds(fixture);
  fixture.product.description = '<h2>Details</h2><p>Synthetic product facts.</p><h2>Care</h2><p>Synthetic care.</p>';
  const colourIndex = fixture.identity.roles.colour;
  const colour = colourIndex ? selected[colourIndex - 1] : '101';
  fixture.product.media = [501, 502].map((id) => ({ id, media_type: 'image', alt: `Synthetic ${id}`, preview_image: { id, width: 80, height: 120 } }));
  fixture.product.selected_or_first_available_variant = mode === 'unavailable' ? null : {
    id: selected.join(''), available: mode !== 'sold-out', price: 7315 + (Number(colour) % 100 - 1) * 100,
    featured_media: { id: colour.endsWith('2') ? 502 : 501 },
  };
  if (mode === 'wrong-product') fixture.product.id = 9999;
  return renderer(locale)('sections/product.liquid', fixture);
}
const drawer = (count = 0) => `<coco-cart-drawer data-section-id="drawer" data-cart-item-count="${count}" data-item-added="Added" data-add-error="Could not add" data-refresh-error="Could not refresh">
  <dialog data-cart-drawer></dialog><p data-cart-drawer-status></p><p hidden data-cart-drawer-error></p>
  <aside class="coco-cart-notice" hidden data-cart-notice><span data-cart-notice-message></span><button data-cart-notice-dismiss>Close</button></aside>
</coco-cart-drawer>`;
async function mount(page, locale, shape = ['Colour', 'Design', 'Size']) {
  const requests = []; const adds = []; const submissions = []; const errors = [];
  const control = { mode: 'ok', hold: false, pending: [] };
  page.on('pageerror', (error) => errors.push(error.message));
  const country = { iso_code: 'FR', name: 'France', currency: { iso_code: 'EUR' } };
  const language = { iso_code: locale, endonym_name: locale };
  // Only the native form wrapper is synthetic; the snippet's choices, names and context are real Liquid.
  const controls = renderer(locale)('snippets/localisation-controls.liquid', {
    localization: { country, language, available_countries: [country, { iso_code: 'US', name: 'United States', currency: { iso_code: 'USD' } }],
      available_languages: [language, { iso_code: 'de', endonym_name: 'Deutsch' }] }, id_prefix: 'fixture',
  }).replaceAll('<form data-product-form>', '<form action="/localization" method="post"><input type="hidden" name="return_to" value="">');
  const noticeStyles = source('sections/cart-drawer.liquid').match(/{% stylesheet %}([\s\S]*?){% endstylesheet %}/)[1];
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== 'https://example.test') throw new Error(`Unexpected external fixture request: ${url.origin}`);
    if (url.pathname === '/theme.js') return route.fulfill({ contentType: 'text/javascript', body: source('assets/theme.js') });
    if (url.pathname.endsWith('.svg')) return route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="120"><rect width="80" height="120" fill="#b8d8c6"/></svg>' });
    if (url.pathname === `/${locale}/cart/add.js`) {
      adds.push(route.request().postData());
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ item_count: 1, sections: { drawer: drawer(1) } }) });
    }
    if (url.pathname === '/localization') {
      submissions.push(route.request().postData());
      return route.fulfill({ contentType: 'text/html', body: '<p>Native form submission captured; routing not simulated.</p>' });
    }
    if (url.searchParams.has('section_id')) {
      requests.push(url);
      const mode = control.mode;
      const ids = url.searchParams.get('option_values').split(',');
      if (control.hold) await new Promise((resolve) => control.pending.push(resolve));
      if (mode === 'error') return route.fulfill({ status: 503, body: 'Synthetic failure' });
      const markup = productMarkup(locale, shape, mode === 'wrong-selection' ? undefined : ids, mode);
      return route.fulfill({ contentType: 'text/html', body: markup });
    }
    return route.fulfill({ contentType: 'text/html; charset=utf-8', body: `<!doctype html><html lang="${locale}"><head><meta charset="utf-8"><style>${noticeStyles}</style></head><body>
      ${controls}<main>${productMarkup(locale, shape)}</main>${drawer()}<span data-cart-count>0</span><p data-live-region></p>
      <script>window.Shopify={routes:{root:'/${locale}/'}};</script><script src="/theme.js"></script></body></html>` });
  });
  await page.goto(`https://example.test/${locale}/products/fixture?preview_theme_id=123&pb=0&utm_source=fixture`);
  await expect(page.locator('[data-custom-size-input]:enabled')).toHaveCount(3);
  return { requests, adds, submissions, errors, control };
}
async function choose(page, role, last = true) {
  const values = page.locator(`[data-product-option-role="${role}"] input`);
  await (last ? values.last() : values.first()).check();
}
async function settled(page) {
  await expect(page.locator('coco-product')).not.toHaveAttribute('aria-busy');
  await expect(page.locator('[data-product-form-error]')).toBeHidden();
  await expect(page.locator('[data-product-options-retry]')).toBeHidden();
}
for (const locale of ['en', 'fr', 'es']) {
  test.describe(`${locale} browser locale`, () => {
  test.use({ locale: { en: 'en-GB', fr: 'fr-FR', es: 'es-ES' }[locale] });
  test('without JavaScript, only the server-selected variant can be offered', async ({ browser }, testInfo) => {
    const context = await browser.newContext({ javaScriptEnabled: false,
      viewport: testInfo.project.use.viewport, isMobile: Boolean(testInfo.project.use.isMobile), hasTouch: Boolean(testInfo.project.use.hasTouch),
      locale: { en: 'en-GB', fr: 'fr-FR', es: 'es-ES' }[locale],
    });
    const page = await context.newPage();
    try {
      await mount(page, locale);
      for (const input of await page.locator('[data-product-option] input:not(:checked)').all()) await expect(input).toBeHidden();
      for (const input of await page.locator('[data-product-option] input:checked').all()) await expect(input).toBeVisible();
      await expect(page.locator('[data-product-variant-id]')).toHaveValue('101201301');
      await page.locator('[data-custom-size-input]').first().fill('30,5');
      expect(await page.locator('[data-product-form]').evaluate((form) => new FormData(form).get('properties[Chest (cm)]'))).toBe('30,5');
    } finally { await context.close(); }
  });
  test('native measurement inputs accept a local decimal separator without changing the numeric value', async ({ page }) => {
    await mount(page, locale);
    const chest = page.locator('[data-custom-size-input]').first();
    await chest.pressSequentially(locale === 'en' ? '30.5' : '30,5');
    await expect(chest).toHaveValue(locale === 'en' ? '30.5' : '30,5');
    expect(await chest.evaluate((input) => input.checkValidity())).toBeTruthy();
    expect(await page.locator('[data-product-form]').evaluate((form) => new FormData(form).get('properties[Chest (cm)]'))).toBe('30.5');
    for (const value of ['0', '-1', '1e2', '1,000', '3.14', '3,14']) {
      await chest.fill(value);
      expect(await chest.evaluate((input) => input.checkValidity()), value).toBeFalsy();
    }
  });
  test(`${locale}: every option layout retains measurements and quantity through selection and basket submission`, async ({ page }) => {
    for (const shape of [['Size'], ['Colour', 'Size'], ['Colour', 'Design', 'Size'], ['Size', 'Design'], ['Design', 'Size']]) {
      await page.unrouteAll({ behavior: 'wait' });
      const run = await mount(page, locale, shape);
      const measurements = page.locator('[data-custom-size-input]');
      for (let i = 0; i < 3; i++) await measurements.nth(i).fill(String(30.5 + i));
      await page.locator('[data-product-quantity]').fill('2');
      await page.locator('.coco-product__description-disclosure').first().locator('summary').click();
      await choose(page, 'size', false); // Custom is last in rendered order, not native order.
      await settled(page);
      await expect(measurements.first()).toBeDisabled();
      await choose(page, 'size');
      await settled(page);
      for (let i = 0; i < 3; i++) await expect(measurements.nth(i)).toHaveValue(String(30.5 + i));
      if (shape.includes('Colour')) {
        await choose(page, 'colour');
        await settled(page);
        await expect(page.locator('[data-product-media-id="502"]')).toBeVisible();
        await expect(page.locator('[data-product-price]')).toContainText(locale === 'en' ? '£74.15' : '74,15');
      }
      await expect(page.locator('[data-product-quantity]')).toHaveValue('2');
      await expect(page.locator('.coco-product__description-disclosure').first()).toHaveAttribute('open', '');
      for (const request of run.requests) {
        expect(request.pathname).toBe(`/${locale}/products/fixture`);
        expect(request.searchParams.get('preview_theme_id')).toBe('123');
        expect(request.searchParams.get('section_id')).toBe('fixture');
        expect(request.searchParams.get('utm_source')).toBe('fixture');
        expect(request.searchParams.get('option_values').split(',')).toHaveLength(shape.length);
      }
      const variant = await page.locator('[data-product-variant-id]').inputValue();
      await page.locator('[data-product-add-button]').click();
      await expect(page.locator('[data-cart-notice]')).toBeVisible();
      expect(run.adds).toHaveLength(1);
      expect(run.adds[0]).toContain(variant);
      expect(run.adds[0]).toContain('Chest (cm)');
      expect(run.adds[0]).toContain('30.5');
      expect(new URL(page.url()).pathname).toBe(`/${locale}/products/fixture`);
      await page.locator('[data-cart-notice-dismiss]').click();
      await expect(page.locator('[data-cart-notice]')).toBeHidden();
      expect(run.errors).toEqual([]);
    }
  });
  test(`${locale}: failed or mismatched responses cannot submit a stale variant and can be retried`, async ({ page }) => {
    for (const mode of ['error', 'wrong-product', 'wrong-selection']) {
      await page.unrouteAll({ behavior: 'wait' });
      const run = await mount(page, locale);
      run.control.mode = mode;
      await choose(page, 'colour');
      await expect(page.locator('[data-product-options-retry]')).toBeVisible();
      await expect(page.locator('[data-product-add-button]')).toBeDisabled();
      await expect(page.locator('[data-product-variant-id]')).toHaveValue('');
      await page.locator('[data-product-form]').evaluate((form) => form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
      expect(run.adds).toHaveLength(0);
      run.control.mode = 'ok';
      await page.locator('[data-product-options-retry]').click();
      await settled(page);
      await expect(page.locator('[data-product-media-id="502"]')).toBeVisible();
      await expect(page.locator('[data-product-add-button]')).toBeEnabled();
      expect(run.errors).toEqual([]);
    }
  });
  test(`${locale}: rapid changes retain the latest selection, current typing and focus`, async ({ page }) => {
    const run = await mount(page, locale);
    run.control.hold = true;
    await choose(page, 'colour');
    await expect.poll(() => run.control.pending.length).toBe(1);
    await expect(page.locator('[data-product-add-button]')).toBeDisabled();
    await choose(page, 'colour', false);
    await expect.poll(() => run.control.pending.length).toBe(2);
    const chest = page.locator('[data-custom-size-input]').first();
    await chest.fill('31.5');
    await chest.evaluate((input) => input.setSelectionRange(1, 2));
    run.control.pending[1]();
    await settled(page);
    await expect(chest).toHaveValue('31.5');
    await expect(chest).toBeFocused();
    expect(await chest.evaluate((input) => [input.selectionStart, input.selectionEnd])).toEqual([1, 2]);
    await expect(page.locator('[data-product-media-id="501"]')).toBeVisible();
    run.control.pending[0]();
    await page.unrouteAll({ behavior: 'wait' });
    await expect(page.locator('[data-product-media-id="501"]')).toBeVisible();
    expect(run.errors).toEqual([]);
  });
  test(`${locale}: unavailable combinations and sold-out variants remain unpurchasable`, async ({ page }) => {
    for (const mode of ['unavailable', 'sold-out']) {
      await page.unrouteAll({ behavior: 'wait' });
      const run = await mount(page, locale);
      run.control.mode = mode;
      await choose(page, 'colour');
      await settled(page);
      await expect(page.locator('[data-product-add-button]')).toBeDisabled();
      await expect(page.locator('[data-product-availability]')).not.toBeEmpty();
      if (mode === 'unavailable') {
        await expect(page.locator('[data-product-variant-id]')).toHaveValue('');
        expect(new URL(page.url()).searchParams.has('option_values')).toBeTruthy();
      }
      run.control.mode = 'ok';
      await choose(page, 'colour', false);
      await settled(page);
      await expect(page.locator('[data-product-add-button]')).toBeEnabled();
      expect(run.errors).toEqual([]);
    }
  });
  test(`${locale}: a language-only form submission retains the country`, async ({ page }) => {
    const run = await mount(page, locale);
    await page.locator('select[name="language_code"]').selectOption('de');
    await expect.poll(() => run.submissions.length).toBe(1);
    const body = new URLSearchParams(run.submissions[0]);
    expect(body.get('country_code')).toBe('FR');
    expect(body.get('language_code')).toBe('de');
    expect(run.errors).toEqual([]);
  });
  test(`${locale}: country switch warns about unsubmitted measurements and retains query context`, async ({ page }) => {
    const run = await mount(page, locale);
    await page.locator('[data-custom-size-input]').first().fill('30.5');
    page.once('dialog', (dialog) => dialog.dismiss());
    await page.locator('select[name="country_code"]').selectOption('US');
    await expect(page.locator('select[name="country_code"]')).toHaveValue('FR');
    expect(run.submissions).toHaveLength(0);
    page.once('dialog', (dialog) => dialog.accept());
    await page.locator('select[name="country_code"]').selectOption('US');
    await expect.poll(() => run.submissions.length).toBe(1);
    const body = new URLSearchParams(run.submissions[0]);
    expect(body.get('country_code')).toBe('US');
    expect(body.get('language_code')).toBe(locale);
    expect(body.get('return_to')).toBe(`/${locale}/products/fixture?preview_theme_id=123&pb=0&utm_source=fixture`);
    expect(run.errors).toEqual([]);
  });
  });
}
