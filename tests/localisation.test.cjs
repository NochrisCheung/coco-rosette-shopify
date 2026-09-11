const assert = require('node:assert/strict');
const { test } = require('node:test');
const { renderer, source, productFixture } = require('./liquid-fixture.cjs');
const flatten = (object, prefix = '') => Object.fromEntries(Object.entries(object).flatMap(([key, value]) => {
  const name = prefix ? `${prefix}.${key}` : key;
  return typeof value === 'object' ? Object.entries(flatten(value, name)) : [[name, value]];
}));
const placeholders = (value) => [...value.matchAll(/{{\s*(\w+)\s*}}/g)].map((m) => m[1]).sort();

test('draft locale keys, placeholders and plural forms exactly match English', () => {
  const english = flatten(JSON.parse(source('locales/en.default.json')));
  for (const locale of ['fr', 'es']) {
    const translated = flatten(JSON.parse(source(`locales/${locale}.json`)));
    assert.deepEqual(Object.keys(translated).sort(), Object.keys(english).sort());
    for (const [key, value] of Object.entries(translated)) {
      assert.ok(value.trim(), key);
      assert.deepEqual(placeholders(value), placeholders(english[key]), `${locale}:${key}`);
    }
  }
});

test('approved English delivery notice matches checkout-led four-to-five-week estimate', () => {
  assert.equal(JSON.parse(source('locales/en.default.json')).products.delivery_promise,
    'Estimated delivery: around 4–5 weeks. Your delivery dates are shown at checkout.');
});

test('homepage exposes exactly the seven approved unchanged defaults for native translation', () => {
  const template = JSON.parse(source('templates/index.json').replace(/^\/\*[\s\S]*?\*\//, ''));
  const fields = {
    hero: ['heading_roman', 'heading_italic', 'subtitle', 'cta_label'],
    collection: ['eyebrow', 'heading_before', 'heading_emphasis'],
  };
  assert.deepEqual(template.order, ['hero', 'collection', 'story']);
  for (const [section, keys] of Object.entries(fields)) {
    const config = template.sections[section];
    const liquid = source(`sections/${config.type}.liquid`);
    const schema = JSON.parse(liquid.match(/{% schema %}([\s\S]*?){% endschema %}/)[1]);
    for (const key of keys) {
      assert.equal(config.settings[key], schema.settings.find((setting) => setting.id === key).default);
      assert.ok(liquid.includes(`section.settings.${key}`));
    }
    const untouched = Object.fromEntries(Object.entries(config.settings).filter(([key]) => !keys.includes(key)));
    assert.deepEqual(untouched, section === 'collection' ? {collection: 'the-collection'} : {});
  }
  assert.deepEqual(template.sections.story.settings, {
    quote: 'Made for the moments when happiness, warmth and quiet joy are shared with the dogs you love.',
    signature: 'Coco Rosette · London',
  });
});

test('French and Spanish delivery drafts preserve the current estimate and checkout reference', () => {
  for (const [file, expected] of [
    ['fr', 'Livraison estimée : environ 4 à 5 semaines. Vos dates de livraison sont indiquées au moment du paiement.'],
    ['es', 'Entrega estimada: entre 4 y 5 semanas. Las fechas de entrega se muestran al finalizar la compra.'],
  ]) {
    const copy = JSON.parse(source(`locales/${file}.json`)).products.delivery_promise;
    assert.equal(copy, expected);
    assert.doesNotMatch(copy, /28|within|up to|en un plazo de|working days|jours ouvr|días hábiles/i);
  }
});

test('featured collection labels distinguish all dogwear from a named collection', () => {
  for (const [locale, expected] of [
    ['en', 'View all dogwear'], ['fr', 'Voir toutes les tenues pour chiens'], ['es', 'Ver toda la ropa para perros'],
  ]) {
    const data = {section: {id: 'featured', settings: {show_collection_link: true,
      collection: {handle: 'the-collection', title: 'Collections', url: `/${locale}/collections/the-collection`, products_count: 1, products: []}}},
      routes: {all_products_collection_url: `/${locale}/collections/all`}};
    let html = renderer(locale)('sections/coco-rosette-collection.liquid', data);
    assert.ok(html.includes(`href="/${locale}/collections/all">${expected}</a>`));
    assert.doesNotMatch(html, /collection Collections|colección Colecciones/);
    data.section.settings.collection.handle = 'wedding-dresses';
    data.section.settings.collection.title = 'Wedding';
    data.section.settings.collection.url = `/${locale}/collections/wedding-dresses`;
    html = renderer(locale)('sections/coco-rosette-collection.liquid', data);
    assert.ok(html.includes(`href="/${locale}/collections/wedding-dresses"`));
    assert.ok(html.includes('Wedding</a>'));
    assert.ok(!html.includes(expected));
    data.section.settings.show_collection_link = false;
    assert.doesNotMatch(renderer(locale)('sections/coco-rosette-collection.liquid', data), /coco-button--secondary/);
    data.section.settings.collection.products_count = 0;
    assert.equal(renderer(locale)('sections/coco-rosette-collection.liquid', data).trim(), '');
  }
});

test('hero balances real translated text without inserted line breaks or reduced font sizing', () => {
  assert.match(source('sections/coco-rosette-hero.liquid'), /\.coco-hero__title-roman\s*\{[^}]*text-wrap:\s*balance;/);
  assert.doesNotMatch(source('sections/coco-rosette-hero.liquid'), /<br|split:|replace:|:lang\(es\)/);
});

test('made-to-measure labels remain distinct from made-to-order production', () => {
  for (const [locale, customLabel] of [
    ['fr', 'Sur mesure'],
    ['es', 'A medida'],
  ]) {
    const fixture = productFixture(locale, ['Size']);
    const size = fixture.product.options_with_values[0];
    assert.equal(size.values.find((value) => String(value.id) === fixture.identity.custom_size_id).name, customLabel);
    const dictionary = JSON.parse(source(`locales/${locale}.json`));
    assert.doesNotMatch(dictionary.products.delivery_promise, /sur mesure|a medida/i);
    assert.match(dictionary.products.custom_size.measurements, /confection sur mesure|confección a medida/);
  }
});

test('Privacy Choices uses the native page URL without rewriting other menu destinations', () => {
  for (const root of ['', '/fr', '/es', '/fr-fr', '/en-fr']) {
    const nativeUrl = `${root}/pages/data-sharing-opt-out`;
    for (const url of ['/pages/data-sharing-opt-out', 'https://shop.test/pages/data-sharing-opt-out', 'https://regional.test/pages/data-sharing-opt-out', nativeUrl, 'https://external.test/pages/data-sharing-opt-out', 'https://shop.test/pages/data-sharing-opt-out-more']) {
      const recognised = ['/pages/data-sharing-opt-out', 'https://shop.test/pages/data-sharing-opt-out', 'https://regional.test/pages/data-sharing-opt-out'].includes(url);
      const data = {
        section: {settings: {privacy_menu: {links: [{url, title: 'Privacy choice'}]}}},
        shop: {url: 'https://shop.test'}, request: {origin: 'https://regional.test'},
        pages: {'data-sharing-opt-out': {url: nativeUrl}}, routes: {root_url: root || '/'},
      };
      const html = renderer('en')('sections/footer.liquid', data);
      assert.ok(html.includes(`href="${recognised ? nativeUrl : url}"`));
      data.pages = {};
      assert.ok(renderer('en')('sections/footer.liquid', data).includes(`href="${url}"`));
    }
  }
});

for (const locale of ['en', 'fr', 'es']) {
  for (const shape of [['Size'], ['Colour', 'Size'], ['Colour', 'Design', 'Size'], ['Size', 'Design'], ['Design', 'Size']]) {
    test(`${locale}: native identity renders ${shape.join('/')} with Custom size last`, () => {
      const fixture = productFixture(locale, shape);
      const render = renderer(locale);
      assert.equal(render('snippets/product-option-identity-valid.liquid', fixture), 'true');
      const html = render('sections/product.liquid', fixture);
      assert.match(html, /data-option-identity-valid="true"/);
      assert.match(html, /data-custom-size-input required/);
      assert.match(html, /name="properties\[Chest \(cm\)\]"/);
      const roles = [...html.matchAll(/data-product-option-role="(\w+)"/g)].map((m) => m[1]);
      assert.deepEqual(roles, ['colour', 'design', 'size'].filter((role) => fixture.identity.roles[role]));
      const size = html.split('data-product-option-role="size"')[1].split('</fieldset>')[0];
      assert.ok(size.indexOf('value="S"') < size.indexOf('data-custom-size-option'));
      if (shape.includes('Colour')) assert.match(html, /--coco-product-option-swatch-colour: #b8d8c6/);
    });
  }
  test(`${locale}: missing, stale or structurally invalid identity disables purchase`, () => {
    for (const change of ['missing', 'stale', 'role', 'swatch', 'custom']) {
      const fixture = productFixture(locale);
      if (change === 'missing') fixture.product.metafields = {};
      if (change === 'stale') fixture.identity.structure = 'old';
      if (change === 'role') fixture.identity.roles.colour = fixture.identity.roles.size;
      if (change === 'swatch') fixture.identity.swatches = {};
      if (change === 'custom') fixture.identity.custom_size_id = '999999';
      const html = renderer(locale)('sections/product.liquid', fixture);
      assert.doesNotMatch(html, /data-product-form>|data-product-add-button/);
      assert.match(html, /role="alert"/);
    }
  });
  test(`${locale}: machine prices retain decimal points and blank filter inputs`, () => {
    const render = renderer(locale);
    const html = render('snippets/product-facets.liquid', {
      results: { filters: [{ type: 'price_range', min_value: { value: null, param_name: 'filter.v.price.gte' }, max_value: { value: 7315, param_name: 'filter.v.price.lte' }, range_max: 123456 }], sort_options: [] },
      hide_collection_links: true, cart: { currency: { symbol: '€' } }, form_id: 'fixture', results_url: `/${locale}/collections/all`,
    });
    assert.match(html, /name="filter.v.price.gte"\s+value=""/);
    assert.match(html, /name="filter.v.price.lte"\s+value="73.15"/);
    assert.match(html, /max="1234.56"/);
    const meta = render('snippets/meta-tags.liquid', {
      ...productFixture(locale), request: { page_type: 'product', origin: 'https://example.test', locale: { iso_code: locale } },
      cart: { currency: { iso_code: locale === 'en' ? 'GBP' : 'EUR' } }, current_page: 1,
    });
    assert.match(meta, /og:price:amount"\s+content="73.15"/);
    assert.match(meta, /"availableLanguage": "en"/);
  });
}

test('operational measurement keys are stable while their displayed labels translate', () => {
  assert.match(renderer('fr')('snippets/line-property-label.liquid', { key: 'Chest (cm)' }), /Tour de poitrine/);
  assert.match(renderer('es')('snippets/line-property-label.liquid', { key: 'Chest (cm)' }), /Contorno de pecho/);
  assert.equal(renderer('es')('snippets/line-property-label.liquid', { key: '<other>' }), '&lt;other&gt;');
});
test('captured identity whitespace cannot disagree with the purchase-form gate', () => {
  const file = 'sections/product.liquid';
  const padded = source(file).replace(
    /({% capture option_identity_valid %})([\s\S]*?)({% endcapture %})/,
    '$1\n  $2\n  $3',
  );
  assert.notEqual(padded, source(file));
  for (const locale of ['en', 'fr', 'es']) {
    const render = renderer(locale, 'GBP', { [file]: padded });
    const fixture = productFixture(locale);
    const valid = render(file, fixture);
    assert.match(valid, /data-option-identity-valid="true"/);
    assert.match(valid, /data-product-add-button/);
    fixture.identity.structure = 'stale';
    const invalid = render(file, fixture);
    assert.match(invalid, /data-option-identity-valid="false"/);
    assert.doesNotMatch(invalid, /data-product-add-button/);
  }
});
test('GBP, USD and EUR display formats never alter numeric metadata, including a zero price', () => {
  for (const [locale, currency] of [['en', 'GBP'], ['en', 'USD'], ['fr', 'EUR'], ['es', 'EUR']]) {
    for (const price of [0, 7315, 123456]) {
      const fixture = productFixture(locale);
      fixture.product.selected_or_first_available_variant.price = price;
      const render = renderer(locale, currency);
      const data = { ...fixture, request: { page_type: 'product', locale: { iso_code: locale } }, cart: { currency: { iso_code: currency } }, current_page: 1 };
      const meta = render('snippets/meta-tags.liquid', data);
      const amount = meta.match(/og:price:amount"\s+content="([^"]+)"/)[1];
      assert.equal(Number(amount), price / 100);
      assert.ok(!amount.includes(','));
      assert.match(meta, new RegExp(`og:price:currency"\\s+content="${currency}"`));
      const display = render('snippets/price.liquid', { product: fixture.product, variant: fixture.product.selected_or_first_available_variant });
      assert.ok(display.includes(new Intl.NumberFormat(locale, { style: 'currency', currency }).format(price / 100)));
    }
  }
});
test('native selectors remain separate and visibly disable a sole available choice', () => {
  const render = renderer('fr');
  const country = { iso_code: 'FR', name: 'France', currency: { iso_code: 'EUR' } };
  const language = { iso_code: 'fr', endonym_name: 'français' };
  const localisation = { country, language, available_countries: [country], available_languages: [language] };
  let html = render('snippets/localisation-controls.liquid', { localization: localisation, id_prefix: 'desktop' });
  assert.equal((html.match(/<select /g) || []).length, 2);
  assert.equal((html.match(/ disabled/g) || []).length, 2);
  assert.doesNotMatch(html, /<button/);
  localisation.available_countries.push({ iso_code: 'US', name: 'États-Unis', currency: { iso_code: 'USD' } });
  html = render('snippets/localisation-controls.liquid', { localization: localisation, id_prefix: 'desktop' });
  assert.match(html, /name="language_code" value="fr"/);
  assert.match(html, /<select[^>]+name="language_code" disabled/);
  assert.match(html, /<select[^>]+name="country_code">/);
  localisation.available_languages.push({ iso_code: 'en', endonym_name: 'English' });
  html = render('snippets/localisation-controls.liquid', { localization: localisation, id_prefix: 'desktop' });
  assert.match(html, /name="country_code" value="FR"/);
  assert.match(html, /lang="en"/);
  assert.doesNotMatch(html, / disabled/);
  assert.ok(html.indexOf('id="desktop-Language-Select"') < html.indexOf('id="desktop-Country-Select"'));
  const mobile = render('snippets/localisation-controls.liquid', { localization: localisation, id_prefix: 'mobile' });
  for (const placement of ['desktop', 'mobile']) {
    const markup = placement === 'desktop' ? html : mobile;
    for (const field of ['Language', 'Country']) {
      assert.match(markup, new RegExp(`for="${placement}-${field}-Select"`));
      assert.equal((markup.match(new RegExp(`id="${placement}-${field}-Select"`, 'g')) || []).length, 1);
    }
  }
  assert.doesNotMatch(source('sections/header.liquid'), /grid-row: 2|grid-template-columns: auto auto/);
});
test('an authenticated draft preview displays its current language without enabling unpublished choices', () => {
  const html = renderer('fr')('snippets/localisation-controls.liquid', {
    id_prefix: 'preview', localization: {
      language: { iso_code: 'fr', endonym_name: 'français' },
      available_languages: [{ iso_code: 'en', endonym_name: 'English' }], available_countries: [],
    },
  });
  assert.match(html, /name="language_code" disabled/);
  assert.match(html, /value="fr" lang="fr" selected>Français/);
  assert.doesNotMatch(html, /<button|>English</);
});
test('superseded English option predicates and formatted numeric parsing are absent', () => {
  for (const name of ['sections/product.liquid', 'snippets/product-option.liquid', 'snippets/product-option-value.liquid']) {
    assert.doesNotMatch(source(name), /option\.name ==|option_value\.name ==|case option_value_handle/);
  }
  assert.doesNotMatch(source('assets/theme.js'), /selectedOptionNames|candidate\.options|=== 'custom size'/);
  assert.doesNotMatch(source('snippets/product-facets.liquid'), /money_without_currency/);
  assert.match(source('sections/cart-drawer.liquid'), /\.coco-cart-notice\[hidden\] \{ display: none; \}/);
});
