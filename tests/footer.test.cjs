const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

const themeRoot = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(themeRoot, file), 'utf8');
const footer = read('sections/footer.liquid');
const group = JSON.parse(read('sections/footer-group.json').replace(/\/\*[\s\S]*?\*\//g, ''));

test('the global layout renders one footer group with one footer section', () => {
  assert.equal((read('layout/theme.liquid').match(/{% sections 'footer-group' %}/g) || []).length, 1);
  assert.deepEqual(group.order, ['footer']);
  assert.deepEqual(Object.keys(group.sections), ['footer']);
  assert.equal(group.sections.footer.type, 'footer');
  assert.equal((footer.match(/<footer\b/g) || []).length, 1);
  assert.doesNotMatch(footer, /coco-footer__(?:footnotes|legal-list|copyright)/);
});

test('the approved customer and privacy menus are not replaced by empty settings', () => {
  assert.deepEqual(group.sections.footer.settings, {
    brand_menu: 'website-pages',
    menu: 'customer-care',
    privacy_menu: 'privacy-choices',
  });
});

test('the logo and signature precede two matching vertical link columns', () => {
  assert.match(footer, /coco-footer__identity[\s\S]*render 'logo'[\s\S]*coco-footer__signature[\s\S]*coco-footer__navigation-groups/);
  assert.match(footer, /\.coco-footer__navigation-groups\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(footer, /\.coco-footer__navigation-list\s*\{[^}]*flex-direction:\s*column/);
  assert.equal((footer.match(/<ul class="coco-footer__navigation-list"/g) || []).length, 2);
});

test('legal column retains native policies, cookie preferences and privacy menu', () => {
  const legal = footer.slice(footer.indexOf('<nav class="coco-footer__navigation coco-footer__legal"'));
  for (const policy of ['shipping_policy', 'refund_policy', 'privacy_policy', 'terms_of_service']) {
    assert.ok(legal.includes(`shop.${policy}.url`));
  }
  assert.ok(legal.includes('data-cookie-preferences'));
  assert.ok(legal.includes('section.settings.privacy_menu.links'));
  const locale = JSON.parse(read('locales/en.default.json'));
  assert.equal(locale.footer.cookie_preferences, 'Cookie preferences');
  assert.equal(locale.accessibility.footer_social_navigation, 'Coco Rosette social links');
});

test('mobile navigation stays in two compact columns without a fixed flex height', () => {
  const mobile = footer.slice(footer.indexOf('@media (max-width: 700px)'));
  assert.match(mobile, /\.coco-footer__navigation-groups\s*\{[^}]*flex:\s*none/);
  assert.match(footer, /\.coco-footer__navigation-list\s*\{[^}]*flex-wrap:\s*nowrap/);
  assert.match(footer, /\.coco-footer__navigation-list > li\s*\{[^}]*max-width:\s*100%/);
});
