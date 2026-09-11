// Local Liquid semantics and synthetic Shopify objects, not a Shopify server emulator.
const fs = require('node:fs');
const path = require('node:path');
const { Liquid } = require('liquidjs');
const root = path.resolve(__dirname, '..');
const source = (name) => fs.readFileSync(path.join(root, name), 'utf8');
const clean = (text) => text
  .replace(/{%-?\s*(doc|schema|stylesheet)\s*-?%}[\s\S]*?{%-?\s*end\1\s*-?%}/g, '')
  .replace(/{%\s*form\s+[^%]+%}/g, '<form data-product-form>')
  .replace(/{%\s*endform\s*%}/g, '</form>');
function renderer(locale = 'en', currency = locale === 'en' ? 'GBP' : 'EUR', sourceOverrides = {}) {
  const readSource = (name) => Object.hasOwn(sourceOverrides, name) ? sourceOverrides[name] : source(name);
  const dictionary = JSON.parse(source(`locales/${locale === 'en' ? 'en.default' : locale}.json`));
  const engine = new Liquid({ root: [path.join(root, 'snippets')], extname: '.liquid', strictFilters: true });
  const nativeFS = engine.options.fs;
  engine.options.fs = { ...nativeFS,
    readFileSync: (file) => clean(readSource(path.relative(root, file))),
    readFile: async (file) => clean(readSource(path.relative(root, file))),
  };
  engine.registerFilter('t', (key, ...pairs) => {
    let value = key.split('.').reduce((item, part) => item?.[part], dictionary);
    const args = Object.fromEntries(pairs.filter(Array.isArray));
    if (value && typeof value === 'object') value = value[args.count === 1 ? 'one' : 'other'];
    if (typeof value !== 'string') throw new Error(`Missing fixture translation: ${key}`);
    return value.replace(/{{\s*(\w+)\s*}}/g, (_, name) => String(args[name] ?? ''));
  });
  engine.registerFilter('json', JSON.stringify);
  engine.registerFilter('asset_url', (name) => `/assets/${name}`);
  engine.registerFilter('image_url', (image) => `/synthetic-image-${image.id || 0}.svg`);
  engine.registerFilter('image_tag', (url, ...pairs) => {
    const escape = (text) => String(text).replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');
    const attributes = pairs.filter(Array.isArray).filter(([key]) => ['alt', 'class', 'loading', 'fetchpriority', 'sizes'].includes(key));
    return `<img src="${escape(url)}" width="80" height="120" ${attributes.map(([key, value]) => `${key}="${escape(value)}"`).join(' ')}>`;
  });
  engine.registerFilter('structured_data', () => '{"@type":"Product"}');
  engine.registerFilter('handleize', (value) => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''));
  engine.registerFilter('media_tag', () => { throw new Error('Media rendering is outside this synthetic fixture'); });
  engine.registerFilter('money', (amount) => new Intl.NumberFormat(locale, { style: 'currency', currency }).format(amount / 100));
  // Shopify exposes these global drops inside isolated render tags too.
  return (name, data) => engine.parseAndRenderSync(clean(readSource(name)), data, {
    globals: Object.fromEntries(['localization', 'request', 'routes', 'shop', 'cart', 'collections', 'pages']
      .filter((key) => Object.hasOwn(data, key)).map((key) => [key, data[key]])),
  });
}
function productFixture(locale = 'en', names = ['Colour', 'Design', 'Size']) {
  const labels = {
    en: { Colour: 'Colour', Design: 'Design', Size: 'Size', Mint: 'Mint', Lavender: 'Lavender', Custom: 'Custom size', Dress: 'Dress Only' },
    fr: { Colour: 'Couleur', Design: 'Modèle', Size: 'Taille', Mint: 'Menthe', Lavender: 'Lavande', Custom: 'Sur mesure', Dress: 'Robe seule' },
    es: { Colour: 'Color', Design: 'Diseño', Size: 'Talla', Mint: 'Menta', Lavender: 'Lavanda', Custom: 'A medida', Dress: 'Solo vestido' },
  }[locale];
  const identity = { structure: '', roles: {}, custom_size_id: null, swatches: {} };
  const options = names.map((name, index) => {
    const position = index + 1;
    identity.roles[name.toLowerCase()] = position;
    const values = (name === 'Colour' ? [labels.Mint, labels.Lavender] : name === 'Size' ? [labels.Custom, 'S'] : [labels.Dress]).map((label, i) => ({ id: position * 100 + i + 1, name: label, selected: i === 0, available: true }));
    identity.structure += `${position}:${values.map((v) => v.id).join(',')};`;
    if (name === 'Size') identity.custom_size_id = String(values[0].id);
    if (name === 'Colour') values.forEach((value, i) => identity.swatches[String(value.id)] = ['#b8d8c6', '#b7a7d0'][i]);
    return { name: labels[name], position, values };
  });
  const product = {
    id: 9001, title: 'Fixture', type: '', url: `/${locale}/products/fixture`,
    media: [], options_with_values: options, has_only_default_variant: false,
    selected_or_first_available_variant: { id: 9002, available: true, price: 7315 },
    metafields: { custom: { storefront_option_identity: { value: identity } } },
  };
  return { product, identity, section: { id: 'fixture' }, pages: { 'size-guide': { url: `/${locale}/pages/size-guide` } } };
}
module.exports = { renderer, source, productFixture };
