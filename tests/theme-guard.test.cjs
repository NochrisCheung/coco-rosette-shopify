const assert = require('node:assert/strict');
const { test } = require('node:test');
const { parseThemeJSON, differences, createPlan, validateBeforeUpload, verifyUpload } = require('../scripts/theme-inventory.cjs');
const { argumentsFor } = require('../scripts/theme-guard.cjs');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { digest, inventory } = require('../scripts/theme-inventory.cjs');
const { approve } = require('../scripts/approve-visual.cjs');
const hash = (value) => ({ raw: value, content: value });
const old = { 'assets/theme.css': hash('old'), 'sections/footer.liquid': hash('approved'), 'sections/footer-group.json': hash('menus') };
const local = { ...old, 'assets/theme.css': hash('new') };
const snapshot = () => ({ store: '1w5nxy-1m.myshopify.com', theme: { id: 123, name: 'Review', role: 'development' }, createdAt: new Date().toISOString(), files: old });
const plan = () => createPlan(snapshot(), local, ['assets/theme.css'], []);

test('JSON normalisation preserves URLs and comment-like customer text', () => {
  assert.equal(parseThemeJSON('/* generated */ {"text":"https://example.com/a/*b*/"}').text, 'https://example.com/a/*b*/');
});
test('a precise preview plan verifies only the approved upload', () => {
  const approved = plan();
  validateBeforeUpload(approved, approved.theme, old, local);
  verifyUpload(approved, local);
});
test('an old footer mixed into an unrelated update blocks the upload', () => {
  assert.throws(() => createPlan(snapshot(), { ...local, 'sections/footer.liquid': hash('old-footer') }, ['assets/theme.css'], []), /Unlisted source drift/);
});
test('empty merchant menus require file-specific approval', () => {
  const modified = { ...old, 'sections/footer-group.json': hash('empty') };
  assert.throws(() => createPlan(snapshot(), modified, ['sections/footer-group.json'], []), /Settings approval/);
  assert.doesNotThrow(() => createPlan(snapshot(), modified, ['sections/footer-group.json'], ['sections/footer-group.json']));
});
test('live targets, wrong stores and stale captures fail closed', () => {
  assert.throws(() => createPlan({ ...snapshot(), theme: { id: 123, role: 'live' } }, local, ['assets/theme.css'], []), /Only an identified/);
  assert.throws(() => createPlan({ ...snapshot(), store: 'wrong.myshopify.com' }, local, ['assets/theme.css'], []), /Wrong store/);
  assert.throws(() => createPlan({ ...snapshot(), createdAt: '2020-01-01' }, local, ['assets/theme.css'], []), /stale/);
});
test('wildcards, traversal, duplicates, no-op uploads and deletion are rejected', () => {
  for (const files of [['assets/*'], ['../assets/theme.css'], ['assets/theme.css', 'assets/theme.css'], ['sections/footer.liquid'], ['assets/missing.css'], []]) {
    assert.throws(() => createPlan(snapshot(), local, files, []));
  }
});
test('remote-only files are preserved, not deleted by synchronisation', () => {
  const approved = createPlan({ ...snapshot(), files: { ...old, 'assets/unused.svg': hash('extra') } }, local, ['assets/theme.css'], []);
  assert.deepEqual(approved.preservedRemoteOnly, ['assets/unused.svg']);
  verifyUpload(approved, { ...local, 'assets/unused.svg': hash('extra') });
  assert.throws(() => verifyUpload(approved, local), /verification failed/);
});
test('a remote editor change after planning blocks deployment', () => {
  const approved = plan();
  assert.throws(() => validateBeforeUpload(approved, approved.theme, { ...old, 'sections/footer.liquid': hash('editor-change') }, local), /Remote theme changed/);
});
test('modified local bytes, renamed targets and promoted themes invalidate approval', () => {
  const approved = plan();
  assert.throws(() => validateBeforeUpload(approved, approved.theme, old, { ...local, 'assets/theme.css': hash('later') }), /payload changed/);
  assert.throws(() => validateBeforeUpload(approved, { ...approved.theme, id: 456 }, old, local), /identity changed/);
  assert.throws(() => validateBeforeUpload(approved, { ...approved.theme, name: 'Another' }, old, local), /identity changed/);
  assert.throws(() => validateBeforeUpload(approved, { ...approved.theme, role: 'live' }, old, local), /Only an identified/);
  assert.throws(() => validateBeforeUpload(approved, approved.theme, old, local, Date.now() + 31 * 60 * 1000), /expired/);
});
test('wrong uploaded content and changes outside the payload fail readback', () => {
  assert.throws(() => verifyUpload(plan(), old), /verification failed/);
  assert.throws(() => verifyUpload(plan(), { ...local, 'sections/footer.liquid': hash('regressed') }), /verification failed/);
});
test('CLI cannot accept live, publish, deletion or implicit all-files switches', () => {
  for (const args of [['push-preview', '--allow-live', 'true'], ['push-preview', '--publish', 'true'], ['push-preview', '--delete', 'true'], ['push-preview', '--plan']]) {
    assert.throws(() => argumentsFor(args), /Invalid argument/);
  }
});
test('semantic inventory comparisons disregard generated formatting only', () => {
  assert.deepEqual(differences({ a: { raw: 'x', content: 'same' } }, { a: { raw: 'y', content: 'same' } }), []);
  assert.equal(differences({ a: hash('x') }, { a: hash('y') }).length, 1);
});

test('inventory preserves ordered configuration while normalising harmless JSON formatting', () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'coco-guard-fixture-'));
  fs.mkdirSync(path.join(folder, 'layout'));
  fs.mkdirSync(path.join(folder, 'templates'));
  fs.writeFileSync(path.join(folder, 'layout/theme.liquid'), '<main></main>');
  const file = path.join(folder, 'templates/index.json');
  fs.writeFileSync(file, '{"order":["hero","story"],"settings":{}}');
  const first = inventory(folder);
  fs.writeFileSync(file, '/* generated */\n{"settings":{}, "order": ["hero", "story"]}');
  assert.deepEqual(differences(first, inventory(folder)), []);
  fs.writeFileSync(file, '{"order":["story","hero"],"settings":{}}');
  assert.equal(differences(first, inventory(folder)).length, 1);
});

test('visual approval requires a human review note and unchanged candidate pixels', () => {
  assert.throws(() => approve(undefined, ''), /merchant approval note/);
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'coco-visual-fixture-'));
  const file = path.join(folder, 'example-candidate.json');
  const bytes = Buffer.from('not a real storefront screenshot');
  fs.writeFileSync(file.replace('.json', '.png'), bytes);
  fs.writeFileSync(file, JSON.stringify({ status: 'AWAITING_MERCHANT_REVIEW', referencePath: 'assets/wrong.png', imageHash: digest(bytes) }));
  assert.throws(() => approve(file, 'fixture only'), /Invalid reference destination/);
  fs.writeFileSync(file, JSON.stringify({ status: 'AWAITING_MERCHANT_REVIEW', referencePath: 'tests/browser/__screenshots__/fixture.png', imageHash: 'changed' }));
  assert.throws(() => approve(file, 'fixture only'), /pixels changed/);
});
