const { test, expect } = require('@playwright/test');
const { renderer, source } = require('../liquid-fixture.cjs');

// Real cart sections/property labels/script, synthetic anonymous cart responses.
// No live cart, market conversion or checkout is simulated as acceptance evidence.
async function mountBasket(page, locale) {
  const dictionary = JSON.parse(source(`locales/${locale === 'en' ? 'en.default' : locale}.json`));
  const currency = locale === 'en' ? 'GBP' : 'EUR';
  const money = (amount) => new Intl.NumberFormat(locale, { style: 'currency', currency }).format(amount / 100);
  const state = { quantity: 2, mode: 'ok', requests: [], pending: [], errors: [] };
  const properties = { 'Chest (cm)': '30.5', 'Body length (cm)': '31.5', 'Neck circumference (cm)': '32.5',
    'Gift note': '<script>not executable</script>', _private: 'hidden fixture property' };
  const key = '9002:synthetic-line';
  const root = `/${locale}/`;
  const markup = (name) => {
    const item = { key, quantity: state.quantity, product: { title: 'Lucienne', has_only_default_variant: false },
      variant: { title: { en: 'Mint / Custom size', fr: 'Menthe / Sur mesure', es: 'Menta / A medida' }[locale] },
      url: `${root}products/fixture?variant=9002`, url_to_remove: `${root}cart/change?id=${key}&quantity=0`,
      properties, image: { id: 1, alt: 'Synthetic product photograph', width: 80, height: 120 },
      original_line_price: 7315 * state.quantity, final_line_price: 7200 * state.quantity,
      line_level_discount_allocations: [{ discount_application: { title: 'Fixture line discount' }, amount: 115 * state.quantity }],
    };
    return renderer(locale)(`sections/${name}.liquid`, {
      section: { id: name }, routes: { cart_url: `${root}cart`, all_products_collection_url: `${root}collections/all` },
      cart: { item_count: state.quantity, items: state.quantity ? [item] : [], total_price: 7200 * state.quantity - (state.quantity ? 500 : 0),
        cart_level_discount_applications: state.quantity ? [{ title: 'Fixture order discount', total_allocated_amount: 500 }] : [] },
    });
  };
  const styles = ['sections/cart.liquid', 'sections/cart-drawer.liquid'].map((file) => source(file).match(/{% stylesheet %}([\s\S]*?){% endstylesheet %}/)[1]).join('\n');
  page.on('pageerror', (error) => state.errors.push(error.message));
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== 'https://basket.test') throw new Error('Unexpected external basket fixture request');
    if (url.pathname.endsWith('.woff2')) return route.fulfill({ status: 404, body: '' });
    if (url.pathname.endsWith('.svg')) return route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="120"/>' });
    if (url.pathname.endsWith('/cart/change.js')) {
      const payload = route.request().postDataJSON();
      state.requests.push({ path: url.pathname, payload });
      if (state.mode === 'hold') await new Promise((resolve) => state.pending.push(resolve));
      if (state.mode === 'error') return route.fulfill({ status: 503, contentType: 'text/plain', body: 'Synthetic failure' });
      state.quantity = payload.quantity;
      const sections = Object.fromEntries(payload.sections.map((id) => [id, markup(id)]));
      if (state.mode === 'missing-section') sections['cart-drawer'] = null;
      if (state.mode === 'wrong-section') sections.cart = markup('cart').replace('data-section-id="cart"', 'data-section-id="wrong"');
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ item_count: state.quantity, sections }) });
    }
    return route.fulfill({ contentType: 'text/html; charset=utf-8', body: `<!doctype html><html lang="${locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${source('assets/theme.css')} ${styles}</style></head><body>
      <a href="${root}cart" data-cart-drawer-trigger>Basket</a><span data-cart-count>2</span><p data-live-region></p>
      ${markup('cart-drawer')}<main>${markup('cart')}</main><script>window.Shopify={routes:{root:'${root}'}};</script><script>${source('assets/theme.js')}</script></body></html>` });
  });
  await page.goto(`https://basket.test/${locale}/cart`);
  return { state, dictionary, money, key };
}

for (const locale of ['en', 'fr', 'es']) {
  test(`${locale}: without JavaScript the native basket form retains quantity and checkout controls`, async ({ browser }, testInfo) => {
    const context = await browser.newContext({ javaScriptEnabled: false, viewport: testInfo.project.use.viewport });
    try {
      const page = await context.newPage();
      const { state, dictionary, key } = await mountBasket(page, locale);
      const form = page.locator('[data-cart-page-form]');
      await expect(form.locator('button[name="update"]')).toBeVisible();
      await expect(form.locator('button[name="update"]')).toHaveText(dictionary.cart.update);
      await expect(form.locator('button[name="checkout"]')).toBeVisible();
      await expect(form).toHaveAttribute('action', `/${locale}/cart`);
      await expect(form).toHaveAttribute('method', 'post');
      await form.locator('[data-cart-page-quantity]').fill('3');
      expect(await form.evaluate((node, key) => new FormData(node).get(`updates[${key}]`), key)).toBe('3');
      expect(state.requests).toEqual([]);
    } finally { await context.close(); }
  });

  test(`${locale}: page and drawer stay aligned with translated properties, discounts and checkout routes`, async ({ page }) => {
    const { state, dictionary, money, key } = await mountBasket(page, locale);
    for (const view of ['page', 'drawer']) {
      const properties = page.locator(`.coco-cart-${view}__properties`);
      for (const [name, value] of [['chest', '30.5'], ['body_length', '31.5'], ['neck_circumference', '32.5']]) {
        await expect(properties).toContainText(`${dictionary.products.custom_size[name]}: ${value}`);
      }
      await expect(properties).toContainText('Gift note: <script>not executable</script>');
      await expect(properties).not.toContainText('hidden fixture property');
      await expect(properties.locator('script')).toHaveCount(0);
      await expect(page.locator(`.coco-cart-${view}__subtotal strong`)).toHaveText(money(13900));
      await expect(page.locator(`.coco-cart-${view}__line-price s`)).toHaveText(money(14630));
    }
    const increase = page.locator('[data-cart-page-quantity-button="increase"]');
    await increase.click();
    await expect(page.locator('[data-cart-page-quantity]')).toHaveValue('3');
    await expect(increase).toBeFocused();
    await page.locator('[data-cart-drawer-trigger]').click();
    const drawer = page.locator('[data-cart-drawer]');
    await expect(drawer).toBeVisible();
    await expect(drawer.locator('[name="quantity"]')).toHaveValue('3');
    await drawer.locator('[data-quantity-button="increase"]').click();
    await expect(drawer.locator('[name="quantity"]')).toHaveValue('4');
    await expect(drawer.locator('[data-quantity-button="increase"]')).toBeFocused();
    await expect(page.locator('[data-cart-page-quantity]')).toHaveValue('4');
    for (const view of ['page', 'drawer']) {
      await expect(page.locator(`.coco-cart-${view}__subtotal strong`)).toHaveText(money(28300));
      await expect(page.locator(`.coco-cart-${view}__properties`)).toContainText('30.5');
    }
    await expect(drawer.locator('button[name="checkout"]')).toHaveText(dictionary.cart.checkout);
    await expect(drawer.locator('button[name="checkout"]')).toBeEnabled();
    await expect(drawer.locator('form[action]')).toHaveAttribute('action', `/${locale}/cart`);
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-cart-drawer-trigger]')).toBeFocused();
    await expect(page.locator('[data-cart-page-form]')).toHaveAttribute('action', `/${locale}/cart`);
    await page.locator('[data-cart-page-remove]').click();
    await expect(page.locator('coco-cart-page .coco-empty-state')).toContainText(dictionary.cart.empty);
    await page.locator('[data-cart-drawer-trigger]').click();
    await expect(drawer.locator('.coco-empty-state')).toContainText(dictionary.cart.empty);
    await expect(page.locator('[data-cart-count]')).toHaveText('0');
    for (const { path, payload } of state.requests) {
      expect(path).toBe(`/${locale}/cart/change.js`);
      expect(payload.id).toBe(key);
      expect(payload.sections.sort()).toEqual(['cart', 'cart-drawer']);
      expect(payload.sections_url).toBe(`/${locale}/cart`);
      expect(Object.keys(payload).sort()).toEqual(['id', 'quantity', 'sections', 'sections_url']);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    expect(state.errors).toEqual([]);
  });

  test(`${locale}: in-flight exclusion and failures never report a stale basket as refreshed`, async ({ page }) => {
    const { state, dictionary } = await mountBasket(page, locale);
    state.mode = 'hold';
    await page.locator('[data-cart-page-quantity-button="increase"]').click();
    await expect.poll(() => state.pending.length).toBe(1);
    await expect(page.locator('[data-cart-page-checkout]')).toBeDisabled();
    await page.locator('[data-cart-page-remove]').click();
    expect(state.requests).toHaveLength(1);
    state.mode = 'error';
    state.pending[0]();
    await expect(page.locator('[data-cart-page-error]')).toHaveText(dictionary.cart.update_error);
    await expect(page.locator('[data-cart-page-checkout]')).toBeEnabled();
    await expect(page.locator('[data-cart-page-quantity]')).toHaveValue('2');
    for (const mode of ['missing-section', 'wrong-section']) {
      state.mode = mode;
      await page.locator('[data-cart-page-quantity-button="increase"]').click();
      await expect(page.locator('[data-cart-page-error]')).toHaveText(dictionary.cart.update_error);
      await expect(page.locator('[data-cart-page-quantity]')).toHaveValue('2');
      await expect(page.locator('[data-cart-count]')).toHaveText('2');
      await expect(page.locator('[data-cart-page-status]')).toBeEmpty();
    }
    expect(state.requests).toHaveLength(3); // No automatic retry after an uncertain write.
    expect(state.errors).toEqual([]);
  });
}
