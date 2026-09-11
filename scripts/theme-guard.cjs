#!/usr/bin/env node
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { inventory, differences, createPlan, validateBeforeUpload, verifyUpload } = require('./theme-inventory.cjs');

const ROOT = path.resolve(__dirname, '..');
const STORE = '1w5nxy-1m.myshopify.com';
const json = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const save = (file, value) => fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
function run(command, args, cwd = ROOT, environment = {}) {
  return execFileSync(command, args, { cwd, env: { ...process.env, ...environment }, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
}
function target(id) {
  if (!/^\d+$/.test(id || '')) throw new Error('A numeric --theme ID is required');
  const theme = JSON.parse(run('shopify', ['theme', 'list', '--store', STORE, '--json']))
    .find((item) => String(item.id) === id);
  if (!theme) throw new Error('Theme ID does not belong to this store');
  return theme;
}
function capture(id) {
  const theme = target(id);
  if (theme.processing) throw new Error('Theme is processing; retry after Shopify finishes');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'coco-rosette-theme-snapshot-'));
  run('shopify', ['theme', 'pull', '--store', STORE, '--theme', id, '--path', directory, '--nodelete']);
  const current = target(id);
  if (current.role !== theme.role || current.name !== theme.name || current.processing) throw new Error('Theme changed during capture');
  const snapshot = { version: 1, createdAt: new Date().toISOString(), store: STORE, theme, files: inventory(directory) };
  const file = path.join(directory, 'snapshot.json');
  save(file, snapshot);
  return { file, snapshot };
}

function argumentsFor(argv) {
  const [command, ...args] = argv;
  const allowed = {
    snapshot: ['theme'], audit: ['snapshot'], plan: ['snapshot', 'files', 'settings'],
    'push-preview': ['plan', 'confirm-theme'],
  }[command];
  if (!allowed) throw new Error('Use snapshot --theme ID | audit --snapshot FILE | plan --snapshot FILE --files a,b [--settings a] | push-preview --plan FILE --confirm-theme ID');
  const options = {};
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i].replace(/^--/, '');
    if (!args[i].startsWith('--') || !allowed.includes(key) || key in options || !args[i + 1] || args[i + 1].startsWith('--')) {
      throw new Error(`Invalid argument: ${args[i]}`);
    }
    options[key] = args[i + 1];
  }
  return { command, options };
}

function main(argv) {
  const { command, options } = argumentsFor(argv);
  if (command === 'snapshot') {
    const { file, snapshot } = capture(options.theme);
    console.log(JSON.stringify({ snapshot: file, theme: snapshot.theme, files: Object.keys(snapshot.files).length }, null, 2));
    return;
  }
  if (command === 'audit' || command === 'plan') {
    if (!options.snapshot) throw new Error('--snapshot is required');
    const snapshot = json(options.snapshot);
    if (snapshot.store !== STORE || snapshot.version !== 1) throw new Error('Unrecognised snapshot');
    if (differences(snapshot.files, inventory(path.dirname(options.snapshot))).length) throw new Error('Snapshot files have changed');
    const local = inventory(ROOT);
    if (command === 'audit') {
      const delta = differences(snapshot.files, local);
      console.log(JSON.stringify({ theme: snapshot.theme, differences: delta,
        note: 'Removed means remote-only: preserved, not a request to delete. Audit does not certify design approval.' }, null, 2));
      if (delta.some(({ change }) => change !== 'removed')) process.exitCode = 1;
      return;
    }
    const plan = createPlan(snapshot, local, (options.files || '').split(',').filter(Boolean), (options.settings || '').split(',').filter(Boolean));
    plan.gitCommit = run('git', ['rev-parse', 'HEAD']).trim();
    const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'coco-rosette-upload-plan-'));
    const file = path.join(folder, 'plan.json');
    save(file, plan);
    console.log(JSON.stringify({ plan: file, theme: plan.theme, upload: plan.files,
      settings: plan.settings, preservedRemoteOnly: plan.preservedRemoteOnly }, null, 2));
    return;
  }
  if (!options.plan) throw new Error('--plan is required');
  const plan = json(options.plan);
  if (String(plan.theme?.id) !== options['confirm-theme']) throw new Error('--confirm-theme must match the reviewed plan');
  // Freeze all source before checking. A subsequent editor save cannot change the uploaded payload.
  const payload = fs.mkdtempSync(path.join(os.tmpdir(), 'coco-rosette-reviewed-payload-'));
  for (const file of Object.keys(inventory(ROOT))) {
    const destination = path.join(payload, file);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(path.join(ROOT, file), destination);
  }
  const before = capture(options['confirm-theme']);
  validateBeforeUpload(plan, before.snapshot.theme, before.snapshot.files, inventory(payload));
  console.log(run('npm', ['test']));
  console.log(run('shopify', ['theme', 'check', '--path', payload]));
  const freshTarget = target(options['confirm-theme']);
  validateBeforeUpload(plan, freshTarget, before.snapshot.files, inventory(ROOT));
  run('shopify', ['theme', 'push', '--store', STORE, '--theme', options['confirm-theme'],
    '--path', payload, '--nodelete', '--strict', ...plan.files.flatMap((file) => ['--only', file])]);
  const after = capture(options['confirm-theme']);
  if (after.snapshot.theme.role !== plan.theme.role) throw new Error('Target role changed during upload');
  verifyUpload(plan, after.snapshot.files);
  const receipt = path.join(path.dirname(after.file), 'receipt.json');
  save(receipt, { status: 'files-verified-not-release-approved', verifiedAt: new Date().toISOString(),
    store: STORE, theme: after.snapshot.theme, gitCommit: plan.gitCommit, files: after.snapshot.files,
    uploaded: plan.files, beforeSnapshot: before.file, afterSnapshot: after.file });
  console.log(JSON.stringify({ receipt, status: 'Files verified; running browser and visual release gates.' }, null, 2));
  try {
    const environment = { CR_THEME_ID: options['confirm-theme'], CR_VISUAL_CAPTURE: '0' };
    console.log(run('npm', ['run', 'test:browser'], ROOT, environment));
    console.log(run('npm', ['run', 'test:visual'], ROOT, environment));
  } catch {
    throw new Error(`Preview files were uploaded and verified, but browser/visual checks failed. Release is blocked; inspect playwright-report. Receipt: ${receipt}`);
  }
  const tested = capture(options['confirm-theme']);
  if (tested.snapshot.theme.role !== plan.theme.role) throw new Error('Theme role changed during browser verification');
  verifyUpload(plan, tested.snapshot.files);
  const ready = path.join(path.dirname(tested.file), 'ready.json');
  save(ready, { status: 'automated-checks-passed-awaiting-merchant-release-approval',
    createdAt: new Date().toISOString(), theme: tested.snapshot.theme, receipt, snapshot: tested.file });
  console.log(JSON.stringify({ ready, next: 'Obtain explicit merchant release approval. This tool never publishes or writes to a live theme.' }, null, 2));
}

if (require.main === module) {
  try { main(process.argv.slice(2)); } catch (error) {
    // External commands can include authentication output; do not dump stdout/stderr or environment.
    console.error(error.status !== undefined ? 'External command failed; no successful verification is claimed. Inspect the authenticated CLI directly.' : error.message);
    process.exitCode = 1;
  }
}
module.exports = { argumentsFor };
