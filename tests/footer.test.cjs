const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

const themeRoot = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(themeRoot, file), 'utf8');
const footer = read('sections/footer.liquid');
const group = JSON.parse(read('sections/footer-group.json').replace(/\/\*[\s\S]*?\*\//g, ''));
const { renderer } = require('./liquid-fixture.cjs');

test('Instagram uses the approved destination and can be removed through its setting', () => {
  const schema = JSON.parse(footer.match(/{% schema %}([\s\S]*?){% endschema %}/)[1]);
  const instagram = schema.settings.find((setting) => setting.id === 'instagram_url');
  assert.equal(instagram.type, 'url');
  assert.equal(instagram.default, undefined, 'External URLs belong in saved settings, not url schema defaults');
  assert.equal(group.sections.footer.settings.instagram_url, 'https://www.instagram.com/coco.rosette.studio/');
  const data = { section: { id: 'footer', settings: { instagram_url: group.sections.footer.settings.instagram_url }, blocks: [] }, shop: { name: 'Coco Rosette' }, routes: { root_url: '/' } };
  for (const locale of ['en', 'fr', 'es']) {
    const html = renderer(locale)('sections/footer.liquid', data);
    assert.match(html, /href="https:\/\/www.instagram.com\/coco.rosette.studio\/" aria-label="Instagram — Coco Rosette"/);
    assert.match(html, /aria-hidden="true" focusable="false"/);
  }
  data.section.settings.instagram_url = '';
  assert.doesNotMatch(renderer()('sections/footer.liquid', data), /coco-footer__instagram/);
});

test('desktop localisation lives in the existing footer and mobile retains its drawer forms', () => {
  assert.match(footer, /FooterLocalisation-/);
  assert.match(footer, /@media \(max-width: 850px\)\s*\{\s*\.coco-footer__localisation \{ display: none; \}/);
  const header = read('sections/header.liquid');
  assert.doesNotMatch(header, /HeaderLocalisation-|coco-header__localisation/);
  assert.match(header, /MobileLocalisation-/);
});

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
    instagram_url: 'https://www.instagram.com/coco.rosette.studio/',
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
