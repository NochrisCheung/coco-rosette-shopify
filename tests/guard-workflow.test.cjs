const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { test } = require('node:test');
const { inventory } = require('../scripts/theme-inventory.cjs');

test('guarded workflow freezes, allowlists, verifies, runs both QA gates and never publishes', () => {
  const root = path.resolve(__dirname, '..');
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'coco-guard-workflow-fixture-'));
  const remote = path.join(fixture, 'remote');
  const binaries = path.join(fixture, 'bin');
  fs.mkdirSync(binaries);
  for (const file of Object.keys(inventory(root))) {
    const destination = path.join(remote, file);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(path.join(root, file), destination);
  }
  fs.appendFileSync(path.join(remote, 'assets/theme.css'), '\n/* simulated previous revision */\n');
  // Child commands are intercepted by local fixtures; no Shopify/network/browser mutation occurs.
  const fake = `#!${process.execPath}
const fs = require('node:fs');
const path = require('node:path');
const root = process.env.CR_GUARD_FIXTURE;
const args = process.argv.slice(2);
const command = path.basename(process.argv[1]);
fs.appendFileSync(path.join(root, 'commands.jsonl'), JSON.stringify({command,args,capture:process.env.CR_VISUAL_CAPTURE})+'\\n');
const value = (flag) => args[args.indexOf(flag)+1];
if(command==='git') console.log('fixture-commit');
if(command==='shopify' && args[1]==='list') console.log(JSON.stringify([{id:123,name:'Fixture review',role:'development',processing:false}]));
if(command==='shopify' && args[1]==='pull') fs.cpSync(path.join(root,'remote'),value('--path'),{recursive:true});
if(command==='shopify' && args[1]==='push') {
 if(!args.includes('--nodelete') || !args.includes('--strict') || args.includes('--allow-live') || args.includes('--publish')) process.exit(2);
 const payload=value('--path');
 for(let i=0;i<args.length;i++) if(args[i]==='--only') fs.copyFileSync(path.join(payload,args[i+1]),path.join(root,'remote',args[i+1]));
}
`;
  for (const command of ['shopify', 'npm', 'git']) fs.writeFileSync(path.join(binaries, command), fake, { mode: 0o700 });
  const environment = { ...process.env, CR_GUARD_FIXTURE: fixture, CR_VISUAL_CAPTURE: '1', PATH: `${binaries}${path.delimiter}${process.env.PATH}` };
  const cli = (...args) => execFileSync(process.execPath, [path.join(root, 'scripts/theme-guard.cjs'), ...args], { env: environment, encoding: 'utf8' });
  const snapshot = JSON.parse(cli('snapshot', '--theme', '123')).snapshot;
  const plan = JSON.parse(cli('plan', '--snapshot', snapshot, '--files', 'assets/theme.css')).plan;
  const output = cli('push-preview', '--plan', plan, '--confirm-theme', '123');
  assert.match(output, /ready/);
  assert.deepEqual(inventory(remote), inventory(root));
  const commands = fs.readFileSync(path.join(fixture, 'commands.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
  const uploads = commands.filter((item) => item.command === 'shopify' && item.args[1] === 'push');
  assert.equal(uploads.length, 1);
  assert.deepEqual(uploads[0].args.slice(-2), ['--only', 'assets/theme.css']);
  const qa = commands.filter((item) => item.command === 'npm' && item.args[0] === 'run');
  assert.deepEqual(qa.map((item) => item.args[1]), ['test:browser', 'test:visual']);
  assert.ok(qa.every((item) => item.capture === '0'), 'Capture mode cannot bypass visual comparison during upload');
  assert.ok(commands.every((item) => !item.args.includes('--publish') && !item.args.includes('--allow-live')));
});
