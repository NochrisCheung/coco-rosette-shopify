#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const { digest } = require('./theme-inventory.cjs');

// This records a supplied human decision; it must never be called just to make a failing test green.
function approve(candidatePath, reviewNote) {
  if (!candidatePath || !reviewNote?.trim()) throw new Error('Provide a candidate JSON path and the merchant approval note');
  const candidate = JSON.parse(fs.readFileSync(candidatePath, 'utf8'));
  if (candidate.status !== 'AWAITING_MERCHANT_REVIEW') throw new Error('Not a review candidate');
  const root = path.resolve(__dirname, '..');
  const destination = path.resolve(root, candidate.referencePath);
  if (!destination.startsWith(path.join(root, 'tests/browser/__screenshots__') + path.sep) || !destination.endsWith('.png')) {
    throw new Error('Invalid reference destination');
  }
  const bytes = fs.readFileSync(candidatePath.replace(/\.json$/, '.png'));
  if (candidate.imageHash !== digest(bytes)) throw new Error('Candidate pixels changed after capture');
  if (fs.existsSync(destination) || fs.existsSync(destination.replace(/\.png$/, '.json'))) {
    throw new Error('Existing reference: retain it until a separately reviewed replacement is approved');
  }
  const metadata = { ...candidate, status: 'MERCHANT_APPROVED', reviewNote: reviewNote.trim(),
    approvedAt: new Date().toISOString(), imageHash: digest(bytes) };
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  // Existing approvals require a separately reviewed Git change, not a silent overwrite.
  fs.writeFileSync(destination, bytes, { flag: 'wx' });
  fs.writeFileSync(destination.replace(/\.png$/, '.json'), `${JSON.stringify(metadata, null, 2)}\n`, { flag: 'wx' });
  return destination;
}
if (require.main === module) {
  try { console.log(approve(process.argv[2], process.argv[3])); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { approve };
