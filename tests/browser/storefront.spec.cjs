const { test, expect } = require('@playwright/test');
const { visit, dismissBanner, noOverflow, chooseOption, selectVariant, productData, selectedVariantMatches } = require('./helpers.cjs');
const approved = require('../../quality/approved-design.json');

test.beforeEach(async ({ page }) => {
  page.storefrontErrors = [];
  page.on('pageerror', (error) => page.storefrontErrors.push(error.message));
});
test.afterEach(async ({ page }) => {
  expect(page.storefrontErrors, 'Uncaught browser JavaScript errors').toEqual([]);
});

test('global identity and a single, aligned footer', async ({ page }) => {
  await visit(page);
  const footer = page.locator('footer.coco-footer');
  await expect(footer).toHaveCount(1);
  await footer.scrollIntoViewIfNeeded();
  const logo = footer.locator('.coco-footer__logo-image');
  await expect(logo).toHaveAttribute('src', /coco-rosette-wordmark\.png/);
  const signature = footer.locator('.coco-footer__signature');
  const lists = footer.locator('.coco-footer__navigation-list');
  await expect(lists).toHaveCount(2);
  await expect(lists.nth(0).locator('a')).toHaveCount(6);
  await expect(lists.nth(1).locator('a')).toHaveCount(5);
  await expect(footer.locator('[data-cookie-preferences]')).toBeVisible();
  const destinations = await footer.locator('a').evaluateAll((nodes) => nodes.map((node) => new URL(node.href).pathname));
  expect(new Set(destinations).size).toBe(destinations.length);
  expect(destinations).not.toContain('/search');
  const logoBox = await logo.boundingBox();
  const signatureBox = await signature.boundingBox();
  const left = await lists.nth(0).boundingBox();
  const right = await lists.nth(1).boundingBox();
  expect(logoBox.width).toBeGreaterThanOrEqual(120);
  expect(signatureBox.y).toBeGreaterThanOrEqual(logoBox.y + logoBox.height);
  expect(right.x).toBeGreaterThan(left.x);
  expect(Math.abs(left.y - right.y)).toBeLessThan(2);
  if (page.viewportSize().width > 700) expect(left.x).toBeGreaterThan(logoBox.x + logoBox.width);
  else expect(left.y).toBeGreaterThan(signatureBox.y);
  const formats = await lists.evaluateAll((nodes) => nodes.map((node) => {
    const style = getComputedStyle(node.querySelector('a'));
    return [style.fontFamily, style.fontSize, style.lineHeight];
  }));
  expect(formats[0]).toEqual(formats[1]);
  for (const list of await lists.all()) {
    const boxes = await list.locator('li').evaluateAll((nodes) => nodes.map((node) => {
      const box = node.getBoundingClientRect();
      return { x: innerWidth <= 700 ? box.x + box.width / 2 : box.x, y: box.y };
    }));
    expect(boxes.every((box, i) => !i || (Math.abs(box.x - boxes[0].x) < 1 && box.y > boxes[i - 1].y))).toBeTruthy();
  }
  await noOverflow(page);
});

test('desktop menu, separate language and country selectors, and bag stay in that order on one row', async ({ page }) => {
  test.skip(page.viewportSize().width <= 850, 'Desktop-only layout');
  await visit(page);
  for (const labels of [['Collections', 'À propos'], ['Colecciones', 'Acerca de']]) {
    await page.locator('.coco-header__navigation--desktop .coco-navigation__link').evaluateAll((links, text) => {
      links.forEach((link, index) => { link.textContent = text[index]; });
    }, labels);
    const nav = await page.locator('.coco-header__navigation--desktop').boundingBox();
    const bag = await page.locator('.coco-header__cart').boundingBox();
    expect(Math.abs(nav.y + nav.height / 2 - bag.y - bag.height / 2)).toBeLessThan(2);
    const language = await page.locator('.coco-header__localisation select[name="language_code"]').boundingBox();
    const country = await page.locator('.coco-header__localisation select[name="country_code"]').boundingBox();
    const boxes = [nav, language, country, bag];
    for (let index = 1; index < boxes.length; index++) {
      expect(boxes[index].x).toBeGreaterThanOrEqual(boxes[index - 1].x + boxes[index - 1].width);
      expect(Math.abs(boxes[index].y + boxes[index].height / 2 - bag.y - bag.height / 2)).toBeLessThan(2);
    }
    for (const link of await page.locator('.coco-header__navigation--desktop .coco-navigation__link').all()) {
      const singleLine = await link.evaluate((node) => {
        const range = document.createRange(); range.selectNodeContents(node);
        return range.getClientRects().length === 1;
      });
      expect(singleLine).toBeTruthy();
    }
    await noOverflow(page);
  }
});

test('hero, artwork, typography and story stay in the approved composition', async ({ page }) => {
  await visit(page);
  for (const [selector, file] of [
    ['.coco-header__logo-image', 'coco-rosette-wordmark.png'],
    ['.coco-hero__corner-ornament-image', 'coco-rosette-hero-corner.png'],
    ['.coco-hero__left-sprig', 'coco-rosette-hero-left-sprig.png'],
    ['.coco-story__vine', 'coco-rosette-story-vine.png'],
  ]) await expect(page.locator(selector)).toHaveAttribute('src', new RegExp(file.replace('.', '\\.')));
  await expect(page.locator('.coco-hero__visual-image')).toBeVisible();
  await expect(page.locator('.coco-hero__copy .coco-button')).toHaveAttribute('href', '/collections/all');
  await expect(page.locator('.coco-story blockquote')).toHaveText(approved.storyQuote);
  await expect(page.locator('.coco-story > p')).toHaveText(approved.storySignature);
  const fonts = await page.evaluate(() => ({
    roman: getComputedStyle(document.querySelector('.coco-hero__title-roman')).fontFamily,
    script: getComputedStyle(document.querySelector('.coco-hero__title-italic')).fontFamily,
    loaded: document.fonts.check('16px "Didot LT Pro Roman"') && document.fonts.check('16px "Bickham Script Pro"'),
    centre: getComputedStyle(document.querySelector('.coco-hero__copy')).textAlign,
  }));
  expect(fonts.roman).toContain('Didot');
  expect(fonts.script).toContain('Bickham');
  expect(fonts.loaded).toBeTruthy();
  if (page.viewportSize().width <= 700) expect(fonts.centre).toBe('center');
  await noOverflow(page);
});

test('browser and search-result icon use the approved enlarged rose mark', async ({ page }) => {
  await visit(page);
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute('href', /coco-rosette-favicon/);
});

test('mobile navigation opens, traps focus, closes and restores focus', async ({ page }) => {
  test.skip(page.viewportSize().width > 850, 'Mobile-only interaction');
  await visit(page);
  await dismissBanner(page);
  const trigger = page.locator('[data-mobile-navigation-trigger]');
  await trigger.click();
  const dialog = page.locator('[data-mobile-navigation]');
  await expect(dialog).toBeVisible();
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press('Tab');
    // Native dialogs can yield focus to browser chrome between cycles, but not to background page controls.
    expect(await dialog.evaluate((node) => document.activeElement === document.body || node.contains(document.activeElement))).toBeTruthy();
  }
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toBeFocused();
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
});

test('collections share four working sort options and exclusive filter panels', async ({ page }) => {
  for (const route of ['/collections/all', '/collections/wedding-dresses', '/collections/evening-gowns', '/collections/casual']) {
    await visit(page, route);
    await expect(page.locator('[data-facets-sort] option')).toHaveCount(4);
    await expect(page.locator('.coco-heading-ornament').first()).toHaveAttribute('src', /coco-rosette-heading-vine\.png/);
    await noOverflow(page);
  }
  await visit(page, '/collections/all');
  await dismissBanner(page);
  const sort = page.locator('[data-facets-sort]');
  for (const value of ['title-descending', 'title-ascending', 'price-descending', 'price-ascending']) {
    await sort.selectOption(value);
    await expect(page).toHaveURL(new RegExp(`sort_by=${value}`));
    await expect(sort).toHaveValue(value);
    const cards = page.locator('.coco-product-card');
    expect(await cards.count()).toBeGreaterThan(0);
    if (value.startsWith('title')) {
      const names = await cards.locator('.coco-product-card__title').allTextContents();
      const sorted = [...names].sort((a, b) => a.localeCompare(b, 'en'));
      expect(names).toEqual(value.endsWith('descending') ? sorted.reverse() : sorted);
    } else {
      const prices = await cards.locator('.coco-price__current').allTextContents();
      const values = prices.map((text) => Number(text.replace(/[^\d.]/g, '')));
      const sorted = [...values].sort((a, b) => a - b);
      expect(values.length).toBeGreaterThan(0);
      expect(values).toEqual(value.endsWith('descending') ? sorted.reverse() : sorted);
    }
  }
  const panels = page.locator('[data-facet-groups] details');
  expect(await panels.count()).toBeGreaterThan(1);
  await panels.nth(0).locator('summary').click();
  await panels.nth(1).locator('summary').click();
  await expect(page.locator('[data-facet-groups] details[open]')).toHaveCount(1);
  await expect(panels.nth(1)).toHaveAttribute('open', '');
});

test('colour, variant photograph, price and Custom size stay synchronised', async ({ page }) => {
  await visit(page, '/products/lucienne');
  await dismissBanner(page);
  const { variants } = await productData(page, 'lucienne');
  const fields = page.locator('[data-product-option]');
  const roles = await fields.evaluateAll((nodes) => nodes.map((node) => node.dataset.productOptionRole));
  expect(roles[0]).toBe('colour');
  expect(roles.at(-1)).toBe('size');
  await expect(page.locator('[data-product-option-role="size"] input').last()).toHaveAttribute('data-custom-size-option', '');
  for (const colour of [...new Set(variants.map((variant) => variant.options[0]))]) {
    const variant = variants.find((item) => item.available && item.options[0] === colour && !item.options.includes('Custom size'));
    await selectVariant(page, variant);
    await selectedVariantMatches(page, variant);
  }
  const custom = page.locator('[data-custom-size-option]');
  await chooseOption(page, custom);
  await expect(page.locator('[data-custom-size-measurements]')).toBeVisible();
  await expect(page.locator('[data-custom-size-input]:enabled[required]')).toHaveCount(3);
  const standard = page.locator('[data-product-option-role="size"] input:not([data-custom-size-option])').first();
  await chooseOption(page, standard);
  await expect(page.locator('[data-custom-size-measurements]')).toBeHidden();
  await expect(page.locator('[data-custom-size-input]:enabled')).toHaveCount(0);
  await noOverflow(page);
});

test('every colour option has an explicitly assigned colour or image swatch', async ({ page }) => {
  await visit(page, '/products/lucienne');
  const missing = await page.locator('.coco-product__option-label--colour').evaluateAll((labels) => labels.filter((label) => {
    const style = label.querySelector('.coco-product__option-swatch').style;
    return !style.getPropertyValue('--coco-product-option-swatch-colour') && !style.getPropertyValue('--coco-product-option-swatch-image');
  }).map((label) => label.textContent.trim()));
  expect(missing, 'Colour labels without a real colour assignment').toEqual([]);
});

test('add stays on product, notice is on top, and basket updates without Apply', async ({ page }) => {
  await visit(page, '/products/lucienne');
  await dismissBanner(page);
  // Each test receives a fresh anonymous context: this never touches a merchant/customer basket.
  const before = await page.request.get('/cart.js');
  expect((await before.json()).item_count).toBe(0);
  await page.locator('[data-product-add-button]').click();
  const notice = page.locator('[data-cart-notice]');
  await expect(notice).toBeVisible();
  await expect(notice).toHaveAttribute('data-visible', 'true');
  expect(new URL(page.url()).pathname).toBe('/products/lucienne');
  await expect.poll(() => page.locator('[data-cart-notice-dismiss]').evaluate((button) => {
    const box = button.getBoundingClientRect();
    return button.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2));
  })).toBeTruthy();
  await page.locator('[data-cart-notice-dismiss]').click();
  await expect(notice).toHaveAttribute('hidden', '');
  await expect(notice).toHaveCSS('opacity', '0');
  await expect(notice).toHaveCSS('pointer-events', 'none');
  await visit(page, '/cart');
  await expect(page.locator('[data-cart-page-quantity]')).toHaveValue('1');
  const subtotal = await page.locator('.coco-cart-page__subtotal').textContent();
  await page.locator('[data-cart-page-quantity-button="increase"]').click();
  await expect(page.locator('[data-cart-page-quantity]')).toHaveValue('2');
  await expect(page.locator('.coco-cart-page__subtotal')).not.toHaveText(subtotal);
  await page.locator('[data-cart-page-quantity-button="decrease"]').click();
  await expect(page.locator('[data-cart-page-quantity]')).toHaveValue('1');
  await expect(page.locator('.coco-cart-page__subtotal')).toHaveText(subtotal);
  await page.locator('[data-cart-page-remove]').click();
  await expect(page.locator('coco-cart-page .coco-empty-state')).toBeVisible();
  expect((await (await page.request.get('/cart.js')).json()).item_count).toBe(0);
  await noOverflow(page);
});

test('a populated Custom size basket retains measurements through every native country switch', async ({ page }, testInfo) => {
  test.setTimeout(150000);
  await visit(page, '/products/lucienne');
  await dismissBanner(page);
  expect((await (await page.request.get('/cart.js')).json()).item_count).toBe(0);
  await chooseOption(page, page.locator('[data-custom-size-option]'));
  const properties = { 'Chest (cm)': '30.5', 'Body length (cm)': '31.5', 'Neck circumference (cm)': '32.5' };
  for (const [key, value] of Object.entries(properties)) {
    await page.locator(`[name="properties[${key}]"]`).fill(value.replace('.', ','));
  }
  const variantId = await page.locator('[data-product-variant-id]').inputValue();
  await page.locator('[data-product-quantity]').fill('2');
  await page.locator('[data-product-add-button]').click();
  await expect(page.locator('[data-cart-notice]')).toBeVisible();
  await visit(page, '/cart?utm_source=localisation-test');
  for (const country of ['GB', 'FR', 'ES', 'US', 'GB']) {
    if (page.viewportSize().width <= 850) await page.locator('[data-mobile-navigation-trigger]').click();
    const selector = page.locator('select[name="country_code"]:visible');
    if (await selector.inputValue() !== country) {
      await Promise.all([
        page.waitForResponse((response) => response.request().isNavigationRequest() && response.request().method() === 'POST' && new URL(response.url()).pathname.endsWith('/localization')),
        selector.selectOption(country),
      ]);
      await expect.poll(() => page.evaluate(() => window.Shopify?.country)).toBe(country);
    } else if (page.viewportSize().width <= 850) {
      await page.keyboard.press('Escape');
    }
    await expect.poll(() => page.evaluate(() => window.Shopify?.theme?.id)).toBe(Number(process.env.CR_THEME_ID));
    expect(await page.evaluate(() => window.Shopify.theme.role)).not.toMatch(/^(main|live)$/);
    expect(new URL(page.url()).pathname).toBe('/cart');
    expect(new URL(page.url()).searchParams.get('utm_source')).toBe('localisation-test');
    const cart = await (await page.request.get('/cart.js')).json();
    expect(cart.currency).toBe({ GB: 'GBP', FR: 'EUR', ES: 'EUR', US: 'USD' }[country]);
    expect(cart.item_count).toBe(2);
    expect(cart.items).toHaveLength(1);
    expect(String(cart.items[0].variant_id)).toBe(variantId);
    expect(cart.items[0].properties).toEqual(properties);
    await expect(page.locator('[data-cart-page-quantity]')).toHaveValue('2');
    for (const [key, value] of Object.entries(properties)) await expect(page.locator('.coco-cart-page__properties')).toContainText(`${key}: ${value}`);
    // Match the store's native money formats: EUR uses a comma decimal and prefix symbol.
    const subtotal = cart.currency === 'EUR'
      ? `€${new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(cart.total_price / 100)}`
      : new Intl.NumberFormat('en-GB', { style: 'currency', currency: cart.currency, currencyDisplay: 'narrowSymbol' }).format(cart.total_price / 100);
    await expect(page.locator('.coco-cart-page__subtotal strong')).toHaveText(subtotal);
    await expect(page.locator('[data-cart-page-form]')).toHaveAttribute('action', '/cart');
    await expect(page.locator('[data-cart-page-checkout]')).toBeEnabled();
    await noOverflow(page);
  }
  await page.locator('[data-cart-page-quantity-button="increase"]').click();
  await expect(page.locator('[data-cart-page-quantity]')).toHaveValue('3');
  await expect(page.locator('[data-cart-page-checkout]')).toBeEnabled();
  await expect.poll(() => page.locator('img.coco-cart-page__image').evaluateAll((images) => images.length > 0 && images.every((image) => image.complete && image.naturalWidth > 0))).toBe(true);
  await testInfo.attach('Populated basket review candidate', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
  await page.locator('[data-cart-drawer-trigger]').click();
  await expect(page.locator('[data-cart-change-form] [name="quantity"]')).toHaveValue('3');
  await expect.poll(() => page.locator('img.coco-cart-drawer__image').evaluateAll((images) => images.length > 0 && images.every((image) => image.complete && image.naturalWidth > 0))).toBe(true);
  await testInfo.attach('Synchronised basket drawer review candidate', { body: await page.screenshot(), contentType: 'image/png' });
  await page.keyboard.press('Escape');
  await page.locator('[data-cart-page-remove]').click();
  await expect(page.locator('coco-cart-page .coco-empty-state')).toBeVisible();
  expect((await (await page.request.get('/cart.js')).json()).item_count).toBe(0);
});

test('support, policies, privacy destination and 404 retain the global shell', async ({ page }) => {
  test.setTimeout(150000);
  for (const route of ['/pages/about-coco-rosette', '/pages/size-guide', '/pages/care-guide', '/pages/faq', '/pages/contact',
    '/policies/shipping-policy', '/policies/refund-policy', '/policies/privacy-policy', '/policies/terms-of-service', '/pages/data-sharing-opt-out']) {
    await visit(page, route);
    await expect(page.locator('footer.coco-footer')).toHaveCount(1);
    await expect(page.locator('h1')).toHaveCount(1);
    await noOverflow(page);
  }
  await visit(page, '/coco-rosette-regression-not-a-page', 404);
  await expect(page.locator('.coco-recovery__shopping-link')).toHaveAttribute('href', '/collections/all');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
});

test('cookie preferences opens Shopify’s actual preferences panel', async ({ page }) => {
  await visit(page);
  await dismissBanner(page);
  await page.locator('[data-cookie-preferences]').click();
  const panel = page.locator('#shopify-pc__prefs__dialog');
  await expect(panel).toBeVisible();
  await expect(panel).toHaveAttribute('role', 'dialog');
});

test('an add-to-basket failure remains visible and allows a retry', async ({ page }) => {
  await visit(page, '/products/lucienne');
  await dismissBanner(page);
  await page.route('**/cart/add.js', (route) => route.fulfill({ status: 422, contentType: 'application/json',
    body: JSON.stringify({ status: 422, description: 'Test: item temporarily unavailable.' }) }));
  await page.locator('[data-product-add-button]').click();
  await expect(page.locator('[data-product-form-error]')).toBeVisible();
  await expect(page.locator('[data-product-form-error]')).toContainText('temporarily unavailable');
  await expect(page.locator('[data-product-add-button]')).toBeEnabled();
  expect(new URL(page.url()).pathname).toBe('/products/lucienne');
  await expect(page.locator('[data-cart-notice]')).toHaveAttribute('hidden', '');
  await expect(page.locator('[data-cart-notice]')).toHaveCSS('opacity', '0');
});

test('a dismissed notice is also removed from the accessibility tree', async ({ page }) => {
  await visit(page, '/products/lucienne');
  await expect(page.locator('[data-cart-notice]')).toBeHidden();
});
