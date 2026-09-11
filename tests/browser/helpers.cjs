const { expect } = require('@playwright/test');
const themeId = Number(process.env.CR_THEME_ID);

async function visit(page, route = '/', status = 200) {
  const url = new URL(route, 'https://www.cocorosette.com');
  if (url.origin !== 'https://www.cocorosette.com') throw new Error('Only Coco Rosette storefront routes are in scope');
  url.searchParams.set('preview_theme_id', String(themeId));
  url.searchParams.set('pb', '0');
  const response = await page.goto(url.href, { waitUntil: 'domcontentloaded' });
  expect(response.status(), route).toBe(status);
  await expect.poll(() => page.evaluate(() => window.Shopify?.theme?.id)).toBe(themeId);
  expect(await page.evaluate(() => window.Shopify.theme.role)).not.toBe('main');
  expect(await page.evaluate(() => window.Shopify.theme.role)).not.toBe('live');
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator('main')).toHaveCount(1);
  await expect(page.locator('body')).not.toContainText(/translation missing|Liquid error/i);
}

async function dismissBanner(page) {
  // Interact with Shopify's own control; do not inject consent or fake its SDK.
  const reject = page.locator('#shopify-pc__banner__btn-decline');
  if (await reject.isVisible()) await reject.click();
}

async function noOverflow(page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
}

async function chooseOption(page, input) {
  if (await input.isChecked()) return;
  const id = await input.getAttribute('id');
  const refreshed = page.waitForResponse((response) => new URL(response.url()).searchParams.has('section_id') && response.request().method() === 'GET');
  await page.locator(`label[for="${id}"]`).click();
  expect((await refreshed).ok()).toBeTruthy();
  await expect(page.locator('coco-product')).not.toHaveAttribute('aria-busy');
  await expect(page.locator('[data-product-form-error]')).toBeHidden();
  await expect(input).toBeChecked();
}

async function productData(page, handle) {
  const response = await page.request.get(`/products/${handle}.js`);
  expect(response.ok()).toBeTruthy();
  const product = await response.json();
  expect(product.variants.length).toBeGreaterThan(0);
  return product;
}

async function selectedVariantMatches(page, variant) {
  await expect(page.locator('[data-product-variant-id]')).toHaveValue(String(variant.id));
  const currency = (await (await page.request.get('/cart.js')).json()).currency;
  const price = new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(variant.price / 100);
  await expect(page.locator('[data-product-price]')).toContainText(price);
  if (!variant.available) await expect(page.locator('[data-product-add-button]')).toBeDisabled();
  if (variant.featured_image?.src) {
    const filename = new URL(variant.featured_image.src).pathname.split('/').at(-1);
    const visible = page.locator('[data-product-media-id]:not([hidden]) img').first();
    const actual = new URL(await visible.getAttribute('src'), page.url()).pathname.split('/').at(-1);
    expect(actual).toBe(filename);
  }
}

async function selectVariant(page, variant) {
  const fieldsets = page.locator('[data-product-option]');
  for (let i = 0; i < await fieldsets.count(); i++) {
    const field = fieldsets.nth(i);
    const position = Number(await field.getAttribute('data-product-option-position'));
    // Option inputs are visually hidden; click their actual labels, never force a disabled combination.
    const radios = field.locator('input[type="radio"]');
    for (let r = 0; r < await radios.count(); r++) {
      if (await radios.nth(r).getAttribute('value') === variant.options[position - 1]) {
        await chooseOption(page, radios.nth(r));
        break;
      }
    }
  }
  await expect(page.locator('[data-product-variant-id]')).toHaveValue(String(variant.id));
}

module.exports = { visit, dismissBanner, noOverflow, chooseOption, selectVariant, productData, selectedVariantMatches };
