const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { digest, inventory, parseThemeJSON } = require('../scripts/theme-inventory.cjs');
const approved = require('../quality/approved-design.json');
const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('approved artwork and core font bytes cannot silently be replaced', () => {
  for (const [file, expected] of Object.entries(approved.assets)) {
    assert.equal(digest(fs.readFileSync(path.join(root, file))), expected, `Unapproved asset change: ${file}`);
  }
});
test('brand colour roles and paired heading fonts stay consistent', () => {
  const css = read('assets/theme.css');
  for (const [token, value] of Object.entries(approved.colours)) assert.ok(css.includes(`${token}: ${value};`), token);
  for (const family of ['Didot LT Pro Roman', 'Bickham Script Pro', 'Jost']) assert.ok(css.includes(family));
});
test('homepage composition, London signature and approved statement are preserved', () => {
  const home = parseThemeJSON(read('templates/index.json'));
  assert.deepEqual(home.order, approved.homeOrder);
  assert.equal(home.sections.story.settings.quote, approved.storyQuote);
  assert.equal(home.sections.story.settings.signature, approved.storySignature);
  assert.match(read('sections/coco-rosette-hero.liquid'), /section\.settings\.hero_image/);
  for (const file of ['coco-rosette-hero-corner.png', 'coco-rosette-hero-left-sprig.png']) assert.ok(read('sections/coco-rosette-hero.liquid').includes(file));
  assert.match(read('snippets/rose-heading-ornament.liquid'), /coco-rosette-heading-vine\.png/);
  assert.match(read('sections/coco-rosette-story.liquid'), /coco-rosette-story-vine\.png/);
});
test('all literal theme asset references resolve and retired artwork is unused', () => {
  const files = inventory(root);
  for (const file of Object.keys(files).filter((name) => /\.(liquid|css|js)$/.test(name))) {
    for (const match of read(file).matchAll(/['"]([^'"\n]+)['"]\s*\|\s*asset_url/g)) {
      assert.ok(files[`assets/${match[1]}`] || files[`assets/${match[1]}.liquid`], `${file}: missing ${match[1]}`);
      assert.doesNotMatch(match[1], /^(?:logo|rose-o|sprig|hero-corner-ornament(?:-fill)?)\.svg$/, `${file}: retired artwork`);
    }
  }
});
test('basket overlay stays outside the sticky header and native privacy remains wired', () => {
  const layout = read('layout/theme.liquid');
  assert.match(layout, /sections 'header-group'[\s\S]*section 'cart-drawer'[\s\S]*<main/);
  const script = read('assets/theme.js');
  for (const hook of ['data-cookie-preferences', 'data-cart-notice-dismiss', 'data-cart-page-quantity-button']) assert.ok(script.includes(hook), hook);
  assert.match(layout, /content_for_header/);
  assert.match(read('snippets/meta-tags.liquid'), /request\.page_type == 'search'[\s\S]*noindex,nofollow/);
});
