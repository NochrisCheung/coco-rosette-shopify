const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const DIRECTORIES = ['assets', 'blocks', 'config', 'layout', 'locales', 'sections', 'snippets', 'templates'];
const digest = (value) => crypto.createHash('sha256').update(value).digest('hex');
const stable = (value) => Array.isArray(value) ? value.map(stable) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])])) : value;
// Shopify adds a leading generated-file comment. Never strip comment-like text inside JSON strings.
const parseThemeJSON = (value) => JSON.parse(value.replace(/^\s*\/\*[\s\S]*?\*\//, ''));

function validFile(file) {
  return typeof file === 'string' && !file.includes('..') && !/[\\*?\[\]{}\s]/.test(file)
    && DIRECTORIES.includes(file.split('/')[0]) && file.split('/').length > 1;
}

function inventory(root) {
  const files = {};
  function visit(relative) {
    const absolute = path.join(root, relative);
    const stat = fs.lstatSync(absolute);
    if (stat.isSymbolicLink()) throw new Error(`Symlink is not a delivery asset: ${relative}`);
    if (stat.isDirectory()) {
      for (const name of fs.readdirSync(absolute).sort()) visit(`${relative}/${name}`);
    } else {
      if (!validFile(relative)) throw new Error(`Invalid delivery path: ${relative}`);
      const bytes = fs.readFileSync(absolute);
      files[relative] = {
        raw: digest(bytes),
        content: digest(relative.endsWith('.json') ? JSON.stringify(stable(parseThemeJSON(bytes.toString()))) : bytes),
      };
    }
  }
  for (const dir of DIRECTORIES) if (fs.existsSync(path.join(root, dir))) visit(dir);
  if (!files['layout/theme.liquid']) throw new Error('Incomplete theme: layout/theme.liquid is missing');
  return files;
}

function differences(before, after) {
  return [...new Set([...Object.keys(before), ...Object.keys(after)])].sort()
    .filter((file) => before[file]?.content !== after[file]?.content)
    .map((file) => ({ file, change: !before[file] ? 'added' : !after[file] ? 'removed' : 'changed' }));
}

const merchantConfiguration = (file) => file === 'config/settings_data.json'
  || /^sections\/[^/]*group\.json$/.test(file) || /^templates\/.*\.json$/.test(file);

function assertPreview(theme) {
  if (!theme || !['development', 'unpublished'].includes(theme.role) || theme.processing) {
    throw new Error('Only an identified, non-processing development/unpublished theme is allowed');
  }
}

function createPlan(snapshot, local, files, settings, now = Date.now()) {
  assertPreview(snapshot.theme);
  if (snapshot.store !== '1w5nxy-1m.myshopify.com') throw new Error('Wrong store');
  if (now - Date.parse(snapshot.createdAt) > 30 * 60 * 1000 || !Number.isFinite(Date.parse(snapshot.createdAt))) {
    throw new Error('Snapshot is stale: capture a new snapshot');
  }
  if (!files.length || new Set(files).size !== files.length || files.some((file) => !validFile(file))) {
    throw new Error('Supply a non-empty, unique allowlist of exact theme file paths');
  }
  if (settings.some((file) => !files.includes(file) || !merchantConfiguration(file))) {
    throw new Error('Settings approval must refer to an allowlisted merchant configuration file');
  }
  const delta = differences(snapshot.files, local);
  // Existing remote-only files are preserved by --nodelete, not adopted or silently deleted.
  const unexpected = delta.filter(({ file, change }) => change !== 'removed' && !files.includes(file));
  if (unexpected.length) throw new Error(`Unlisted source drift: ${unexpected.map(({ file }) => file).join(', ')}`);
  for (const file of files) {
    if (!local[file]) throw new Error(`Deletion is not supported: ${file}`);
    if (merchantConfiguration(file) && !settings.includes(file)) throw new Error(`Settings approval required: ${file}`);
    if (!delta.some((item) => item.file === file)) throw new Error(`Unchanged file must not be uploaded: ${file}`);
  }
  return {
    version: 1, createdAt: new Date(now).toISOString(), store: snapshot.store, theme: snapshot.theme,
    before: snapshot.files, local, files, settings,
    preservedRemoteOnly: delta.filter(({ change }) => change === 'removed').map(({ file }) => file),
  };
}

function validateBeforeUpload(plan, theme, remote, local, now = Date.now()) {
  assertPreview(theme);
  if (plan.version !== 1 || plan.store !== '1w5nxy-1m.myshopify.com' || theme.id !== plan.theme.id
    || theme.role !== plan.theme.role || theme.name !== plan.theme.name) throw new Error('Target identity changed');
  if (!Number.isFinite(Date.parse(plan.createdAt)) || now - Date.parse(plan.createdAt) > 30 * 60 * 1000) {
    throw new Error('Upload plan has expired');
  }
  if (differences(plan.before, remote).length) throw new Error('Remote theme changed after review; stop and re-plan');
  if (JSON.stringify(stable(plan.local)) !== JSON.stringify(stable(local))) throw new Error('Local payload changed after review');
  // Re-run all allowlist and settings guards; a hand-edited plan is not an override.
  createPlan({ store: plan.store, theme, files: remote, createdAt: plan.createdAt }, local, plan.files, plan.settings, now);
}

function verifyUpload(plan, actual) {
  const expected = { ...plan.before };
  for (const file of plan.files) expected[file] = plan.local[file];
  const delta = differences(expected, actual);
  if (delta.length) throw new Error(`Upload verification failed: ${delta.map(({ file }) => file).join(', ')}`);
}

module.exports = { digest, stable, parseThemeJSON, inventory, differences, merchantConfiguration,
  assertPreview, createPlan, validateBeforeUpload, verifyUpload };
