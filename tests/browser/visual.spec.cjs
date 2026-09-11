const fs = require('node:fs');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { visit, dismissBanner } = require('./helpers.cjs');
const { digest } = require('../../scripts/theme-inventory.cjs');

// Reference images are committed only AFTER merchant approval. Capture never writes reference paths.
for (const [name, route] of [
  ['home', '/'], ['collection', '/collections/all'], ['product', '/products/lucienne'],
  ['empty-basket', '/cart'], ['size-guide', '/pages/size-guide'], ['privacy-policy', '/policies/privacy-policy'],
]) {
  test(`@visual ${name}`, async ({ page, browser }, testInfo) => {
    await visit(page, route);
    await dismissBanner(page);
    // Trigger native lazy loading before a full-page capture, without replacing or masking product images.
    await page.evaluate(async () => {
      for (let y = 0; y < document.documentElement.scrollHeight; y += innerHeight) {
        scrollTo(0, y);
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      }
      scrollTo(0, 0);
      await document.fonts.ready;
      await Promise.all([...document.images].filter((image) => image.getBoundingClientRect().width > 0)
        .map((image) => image.decode().catch(() => {})));
    });
    const screenshotOptions = { fullPage: true, animations: 'disabled', caret: 'hide', scale: 'css' };
    const environment = { browser: browser.version(), platform: process.platform,
      viewport: page.viewportSize(), project: testInfo.project.name, locale: 'en-GB', screenshotScale: 'css' };
    if (process.env.CR_VISUAL_CAPTURE === '1') {
      const candidate = testInfo.outputPath(`${name}-candidate.png`);
      await page.screenshot({ ...screenshotOptions, path: candidate });
      fs.writeFileSync(testInfo.outputPath(`${name}-candidate.json`), JSON.stringify({
        status: 'AWAITING_MERCHANT_REVIEW', themeId: process.env.CR_THEME_ID, route,
        imageHash: digest(fs.readFileSync(candidate)),
        capturedAt: new Date().toISOString(), environment,
        referencePath: path.relative(path.resolve(__dirname, '../..'), testInfo.snapshotPath(`${name}.png`)),
      }, null, 2));
      await testInfo.attach('Unapproved review candidate', { path: candidate, contentType: 'image/png' });
      return;
    }
    const approvalPath = testInfo.snapshotPath(`${name}.json`);
    expect(fs.existsSync(approvalPath), `Missing merchant-approved visual reference for ${name}; capture and review, do not auto-update`).toBeTruthy();
    const approval = JSON.parse(fs.readFileSync(approvalPath));
    expect(approval.status).toBe('MERCHANT_APPROVED');
    expect(approval.reviewNote?.trim().length).toBeGreaterThan(0);
    expect(digest(fs.readFileSync(testInfo.snapshotPath(`${name}.png`))), 'Approved reference pixels changed without a new review').toBe(approval.imageHash);
    expect(approval.environment, 'Use the same browser version/OS for pixel comparison; separately review an environment upgrade').toEqual(environment);
    await expect(page).toHaveScreenshot(`${name}.png`, screenshotOptions);
  });
}
