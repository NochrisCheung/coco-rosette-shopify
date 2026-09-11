const { test, expect } = require('@playwright/test');
const { visit, noOverflow, productData, selectedVariantMatches } = require('./helpers.cjs');

test('every storefront product has a working page, selected variant and photograph', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chrome', 'Catalogue enumeration is shared; responsive behaviour has separate tests');
  test.setTimeout(240000);
  await visit(page, '/collections/all');
  const handles = [];
  for (let number = 1; ; number++) {
    const response = await page.request.get(`/products.json?limit=250&page=${number}`);
    expect(response.ok()).toBeTruthy();
    const products = (await response.json()).products;
    expect(Array.isArray(products)).toBeTruthy();
    handles.push(...products.map((product) => product.handle));
    if (products.length < 250) break;
    if (number >= 20) throw new Error('Catalogue exceeds the test enumeration limit; review coverage explicitly');
  }
  expect(handles.length).toBeGreaterThan(0);
  expect(new Set(handles).size).toBe(handles.length);
  for (const handle of handles) {
    await visit(page, `/products/${handle}`);
    await expect(page.locator('h1')).toHaveCount(1);
    await expect(page.locator('[data-product-variant-id]')).not.toHaveValue('');
    await expect(page.locator('coco-product')).toHaveAttribute('data-option-identity-valid', 'true');
    const { variants } = await productData(page, handle);
    const selectedId = await page.locator('[data-product-variant-id]').inputValue();
    const selected = variants.find((variant) => String(variant.id) === selectedId);
    expect(selected, handle).toBeTruthy();
    await selectedVariantMatches(page, selected);
    const image = page.locator('[data-product-media-id]:not([hidden]) img').first();
    await expect(image).toBeVisible();
    await expect.poll(() => image.evaluate((node) => node.complete && node.naturalWidth > 0)).toBeTruthy();
    await noOverflow(page);
  }
  await testInfo.attach('Catalogue route coverage', { body: Buffer.from(JSON.stringify({ count: handles.length, handles })), contentType: 'application/json' });
});
