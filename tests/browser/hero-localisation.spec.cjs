const { test, expect } = require('@playwright/test');
const { visit, noOverflow } = require('./helpers.cjs');

// Layout regression using reviewed copy on the actual preview CSS/fonts.
// Native draft registration and language routing are verified separately.
test('translated hero balances narrow lines without changing text or typography', async ({ page }) => {
  await visit(page);
  const roman = page.locator('.coco-hero__title-roman');
  const original = await roman.textContent();
  await page.setViewportSize({ width: 375, height: 812 });
  for (const text of ['Because It’s', 'Parce que c’est', 'Porque también es']) {
    await roman.evaluate((node, value) => { node.textContent = value; }, text);
    await expect(roman).toHaveText(text);
    const result = await roman.evaluate((node) => {
      const style = getComputedStyle(node);
      const lines = new Map();
      for (const word of node.textContent.matchAll(/\S+/g)) {
        const range = document.createRange();
        range.setStart(node.firstChild, word.index);
        range.setEnd(node.firstChild, word.index + word[0].length);
        const y = Math.round(range.getBoundingClientRect().top);
        lines.set(y, [...(lines.get(y) || []), word[0]]);
      }
      return { font: style.fontFamily, size: parseFloat(style.fontSize), balance: style.textWrap,
        lines: [...lines.values()] };
    });
    expect(result.font).toContain('Didot');
    expect(result.size).toBeGreaterThanOrEqual(44);
    expect(result.balance).toBe('balance');
    if (text === 'Porque también es') expect(result.lines.at(-1).length).toBeGreaterThanOrEqual(2);
    await noOverflow(page);
  }
  await roman.evaluate((node, value) => { node.textContent = value; }, original);
  await expect(page.locator('.coco-featured-collection__cta a')).toHaveText('View all dogwear');
});
